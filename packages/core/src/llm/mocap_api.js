// SPDX-License-Identifier: MIT
// /v1/mocap — the Motion capture screen's routes (just-mocap's plan of 2026-11-07, M4: one screen in JustDirect that
// JustStage shares, so its routes and data are the kit's). A take is a row of `mocap_take` (the server owns the data)
// and a folder `<takesDir>/<id>` holding its video and everything the engine makes from it (runner/mocap.js runMocap).
//   GET    /v1/mocap/readiness              what a take needs before it can run (mocapReadiness)
//   GET    /v1/mocap/takes                  the takes, newest first, each with its job while one runs
//   POST   /v1/mocap/takes                  a video, uploaded as the form's `file` (streamed to disk) → 201 the take
//   PATCH  /v1/mocap/takes/:id              {name?, options?}
//   DELETE /v1/mocap/takes/:id              the take and its folder — 409 while it runs
//   POST   /v1/mocap/takes/:id/run          {options?, fresh?} → 202 its job (the app's JobRegistry, kind "mocap", key the
//                                           take): the engine from where it stopped, or from the start when `fresh`
//   GET    /v1/mocap/takes/:id/contacts     the foot contacts the correction found and the ones it applied
//   POST   /v1/mocap/takes/:id/contacts     {ranges} → 202 its job: the foot correction with these contacts, and every
//                                           step after it, without running the models again
//   GET    /v1/mocap/takes/:id/files/:name  one of the files it made (by its name in the take's `files`; byte ranges, so
//                                           the preview video plays and seeks)
// Takes run one at a time (makeLane): the card holds one.

import { randomUUID } from "node:crypto";
import { existsSync, mkdirSync, readdirSync, readFileSync } from "node:fs";
import { rm } from "node:fs/promises";
import path from "node:path";
import { Hono } from "hono";
import { receiveUpload } from "../platform/data_api.js";
import { freeBytes } from "../platform/disk_room.js";
import { ApiError, notFound } from "../platform/errors.js";
import { makeLane } from "../platform/jobs.js";
import { nullable, opt, T } from "../platform/models.js";
import { serveStatic } from "../platform/serve.js";
import { input } from "../platform/server.js";
import { mocapReadiness, runMocap } from "../runner/mocap.js";
import { abortError } from "./base.js";
import * as db from "./db.js";

const IdParams = T.Object({ id: T.String({ minLength: 1, maxLength: 64, pattern: "^[A-Za-z0-9_-]+$" }) });
const FileParams = T.Object({ id: T.String({ minLength: 1, maxLength: 64, pattern: "^[A-Za-z0-9_-]+$" }), name: T.String({ minLength: 1, maxLength: 32 }) });
// the screen's choices for a take (runner/mocap.js mocapArgs): the lens once (a phone's 35 mm equivalent or a webcam's
// field of view), the ground, the arm fit and the finger smoothing
const Options = T.Object({
  smoothing: opt(T.Union([T.Literal("none"), T.Literal("default"), T.Literal("strong")])),
  focal35: opt(nullable(T.Number({ minimum: 8, maximum: 300 }))),
  fov: opt(nullable(T.Number({ minimum: 20, maximum: 175 }))),
  unevenGround: opt(T.Boolean()),
  armFit: opt(T.Boolean()),
});
const TakePatch = T.Object({ name: opt(T.String({ minLength: 1, maxLength: 200 })), options: opt(Options) });
const RunIn = T.Object({ options: opt(Options), fresh: opt(T.Boolean()) });
// per foot, the frames it is planted: [[start, end], …] with end exclusive (contacts.json's own shape)
const Range = T.Array(T.Integer({ minimum: 0 }), { minItems: 2, maxItems: 2 });
const ContactsIn = T.Object({ ranges: T.Array(T.Array(Range, { maxItems: 10_000 }), { minItems: 2, maxItems: 2 }) });

export const DEFAULT_TAKE_OPTIONS = Object.freeze({ smoothing: "default", focal35: null, fov: null, unevenGround: false, armFit: true });
const VIDEO_EXT = new Set([".mp4", ".mov", ".m4v", ".mkv", ".webm", ".avi"]);

/** A take row as the screen reads it. */
function takeOf(row) {
  return {
    id: row.id,
    name: row.name,
    sourceName: row.source_name,
    options: { ...DEFAULT_TAKE_OPTIONS, ...JSON.parse(row.options || "{}") },
    state: row.state,
    error: row.error,
    // the files it made, by name (the done line of the engine: bvh, fbx, glb, usd, c3d, motion, face, preview, sheet,
    // contacts) — each one's download is /files/<name>
    files: Object.keys(JSON.parse(row.files || "{}")).filter((k) => k !== "take"),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/** The mocap routes over `jobs` (the app's JobRegistry, or a function answering it); takes live under `takesDir`. */
export function makeMocapRouter(jobs, { takesDir, run = runMocap }) {
  if (!takesDir) throw new TypeError("makeMocapRouter needs a takesDir for the takes' folders");
  const registry = typeof jobs === "function" ? jobs : () => jobs;
  const folderOf = (id) => path.join(takesDir, id);
  const inLane = makeLane("waiting for the take before it", abortError);
  const row = (id) => {
    const r = db.session().get("mocap_take", { id });
    if (!r) throw notFound(`no take ${id}`);
    return r;
  };
  const save = (id, fields) => db.session().update("mocap_take", { ...fields, updated_at: Date.now() }, { id });
  // the take's running job as the wire shows it (the registry's snapshot), or null
  const running = (id) => registry().list({ kind: "mocap", key: id })[0] ?? null;
  const sourceOf = (id) => {
    const name = readdirSync(folderOf(id)).find((n) => n.startsWith("source."));
    if (!name) throw new ApiError(409, "take-without-video", "This take has no video", "its folder lost the video it was made from — add the video again as a new take");
    return path.join(folderOf(id), name);
  };

  /** Run the engine on take `id` as a job: `options` its choices, `ranges` edited contacts (a re-apply). */
  const startJob = (c, id, { options, ranges = null, label }) => {
    const ready = mocapReadiness();
    if (!ready.ready) throw new ApiError(409, ready.need, "Motion capture isn't ready", ready.detail, { need: ready.need, models: ready.models });
    const source = sourceOf(id);
    const job = registry().start({ kind: "mocap", key: id, label, failTitle: "The take failed", clientId: c.req.header("x-client-id") ?? null, meta: { take: id } }, ({ signal, progress }) =>
      inLane(signal, progress, async () => {
        save(id, { state: "running", error: "" });
        try {
          const files = await run(source, folderOf(id), { ...options, ...(ranges ? { ranges } : {}) }, { signal, onProgress: progress });
          save(id, { state: "done", error: "", files: JSON.stringify(files ?? {}) });
          return { take: id };
        } catch (e) {
          const cancelled = signal.aborted || e?.name === "AbortError";
          save(id, { state: cancelled ? "cancelled" : "failed", error: cancelled ? "" : String(e?.message || e) });
          throw e;
        }
      }),
    );
    return c.json(job, 202);
  };

  const app = new Hono();
  app.get("/v1/mocap/readiness", (c) => {
    const { engine, ...ready } = mocapReadiness();
    return c.json({ ...ready, engine: engine ? { build: engine.build, installed: engine.installed, status: engine.status, detail: engine.detail } : null });
  });

  app.get("/v1/mocap/takes", (c) => {
    const rows = db.session().all("select * from mocap_take order by created_at desc", [], "mocap_take");
    return c.json({ takes: rows.map((r) => ({ ...takeOf(r), job: running(r.id) ?? null })) });
  });

  app.post("/v1/mocap/takes", async (c) => {
    const id = randomUUID().replaceAll("-", "").slice(0, 16);
    const name = String(c.req.query("name") || "").slice(0, 200);
    const ext = path.extname(name).toLowerCase();
    if (!VIDEO_EXT.has(ext)) throw new ApiError(422, "not-a-video", "Not a video", `a take is made from a video (${[...VIDEO_EXT].join(", ")}); ${name || "the file"} isn't one`);
    const folder = folderOf(id);
    mkdirSync(folder, { recursive: true });
    try {
      await receiveUpload(c, path.join(folder, `source${ext}`), {
        maxBytes: Math.max(0, (await freeBytes(takesDir)) - 1e9),
        tooBig: () => new ApiError(507, "disk-full", "Not enough room for this video", "the drive that holds the app's data has no room for it beside 1 GB for what a take makes"),
        diskFull: () => new ApiError(507, "disk-full", "Not enough room for this video", "the drive filled while it was copied — nothing was kept"),
      });
    } catch (e) {
      await rm(folder, { recursive: true, force: true });
      throw e;
    }
    const now = Date.now();
    db.session().insert("mocap_take", {
      id,
      name: name.replace(/\.[^.]+$/, "") || id,
      source_name: name,
      options: JSON.stringify(DEFAULT_TAKE_OPTIONS),
      state: "new",
      error: "",
      files: "{}",
      created_at: now,
      updated_at: now,
    });
    return c.json(takeOf(row(id)), 201);
  });

  app.patch("/v1/mocap/takes/:id", input({ params: IdParams, body: TakePatch }), (c) => {
    const { id } = c.req.valid("param");
    const { name, options } = c.req.valid("json");
    const r = row(id);
    const fields = {};
    if (name !== undefined) fields.name = name;
    if (options !== undefined) fields.options = JSON.stringify({ ...JSON.parse(r.options || "{}"), ...options });
    if (Object.keys(fields).length) save(id, fields);
    return c.json(takeOf(row(id)));
  });

  app.delete("/v1/mocap/takes/:id", input({ params: IdParams }), async (c) => {
    const { id } = c.req.valid("param");
    row(id);
    if (running(id)) throw new ApiError(409, "take-running", "This take is running", "cancel it first, then delete it");
    await rm(folderOf(id), { recursive: true, force: true });
    db.session().delete("mocap_take", { id });
    return c.body(null, 204);
  });

  app.post("/v1/mocap/takes/:id/run", input({ params: IdParams, body: RunIn }), async (c) => {
    const { id } = c.req.valid("param");
    const { options, fresh } = c.req.valid("json");
    const r = row(id);
    const existing = running(id);
    if (existing) return c.json(existing, 202);
    if (options) save(id, { options: JSON.stringify({ ...JSON.parse(r.options || "{}"), ...options }) });
    if (fresh) {
      // from the start: everything but the video goes (a new lens, ground or arm-fit choice needs the models again)
      for (const n of readdirSync(folderOf(id))) if (!n.startsWith("source.")) await rm(path.join(folderOf(id), n), { recursive: true, force: true });
      save(id, { files: "{}" });
    }
    const take = takeOf(row(id));
    return startJob(c, id, { options: take.options, label: take.name });
  });

  app.get("/v1/mocap/takes/:id/contacts", input({ params: IdParams }), (c) => {
    const { id } = c.req.valid("param");
    row(id);
    const file = path.join(folderOf(id), "contacts.json");
    if (!existsSync(file)) throw new ApiError(409, "no-contacts-yet", "No foot contacts yet", "run the take first");
    return c.json(JSON.parse(readFileSync(file, "utf8")));
  });

  app.post("/v1/mocap/takes/:id/contacts", input({ params: IdParams, body: ContactsIn }), async (c) => {
    const { id } = c.req.valid("param");
    const { ranges } = c.req.valid("json");
    const take = takeOf(row(id));
    if (running(id)) throw new ApiError(409, "take-running", "This take is running", "wait for it to end, then apply the contacts");
    if (!existsSync(path.join(folderOf(id), "gem.pt"))) throw new ApiError(409, "no-contacts-yet", "No foot contacts yet", "run the take first");
    for (const foot of ranges) for (const [start, end] of foot) if (end <= start) throw new ApiError(422, "bad-range", "A contact ends before it starts", `frames ${start}–${end}`);
    return startJob(c, id, { options: take.options, ranges, label: take.name });
  });

  app.get("/v1/mocap/takes/:id/files/:name", input({ params: FileParams }), async (c, next) => {
    const { id, name } = c.req.valid("param");
    const files = JSON.parse(row(id).files || "{}");
    const file = name === "take" ? null : files[name];
    if (!file || !existsSync(file)) throw notFound(`take ${id} has no ${name} file`);
    // only a file inside the take's own folder
    if (path.relative(folderOf(id), file).startsWith("..")) throw notFound(`take ${id} has no ${name} file`);
    c.header("Content-Disposition", `attachment; filename="${path.basename(file)}"`);
    return serveStatic({ path: file })(c, next);
  });

  return app;
}
