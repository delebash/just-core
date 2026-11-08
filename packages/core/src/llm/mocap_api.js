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
//                                           the preview video plays and seeks), or "source": the video it was made from
//   GET    /v1/mocap/live/models/:name      one of the Live tab's MediaPipe models (pose, hand, face) from the install
//   POST   /v1/mocap/live/send              {host, port, messages, stream?, seq?} → one frame's OSC messages sent over UDP
//                                           as one bundle (a frame older than one already sent on its stream: dropped)
//                                           (the window shapes them: packages/ui src/mocap/liveOut.js — VMC or OSC)
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
import { liveModelFile, mocapReadiness, runMocap } from "../runner/mocap.js";
import { LiveSender } from "../runner/mocap_live.js";
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
  // the part of the video: GEM-X takes at most 60 seconds (its gem/inference/video.py)
  start: opt(T.Number({ minimum: 0 })),
  duration: opt(nullable(T.Number({ exclusiveMinimum: 0, maximum: 60 }))),
  turningCamera: opt(T.Boolean()),
  // the person to follow: a point of the first frame, as fractions of the picture; null: GEM-X's own (the largest)
  person: opt(nullable(T.Array(T.Number({ minimum: 0, maximum: 1 }), { minItems: 2, maxItems: 2 }))),
  unevenGround: opt(T.Boolean()),
  armFit: opt(T.Boolean()),
  inPlace: opt(T.Boolean()),
  rest: opt(T.Union([T.Literal("t"), T.Literal("a")])),
});
const TakePatch = T.Object({ name: opt(T.String({ minLength: 1, maxLength: 200 })), options: opt(Options) });
const RunIn = T.Object({ options: opt(Options), fresh: opt(T.Boolean()) });
// per foot, the frames it is planted: [[start, end], …] with end exclusive (contacts.json's own shape)
const Range = T.Array(T.Integer({ minimum: 0 }), { minItems: 2, maxItems: 2 });
const ContactsIn = T.Object({ ranges: T.Array(T.Array(Range, { maxItems: 10_000 }), { minItems: 2, maxItems: 2 }) });
const LiveModelParams = T.Object({ name: T.Union([T.Literal("pose"), T.Literal("hand"), T.Literal("face")]) });
// one OSC message: its address, then numbers (floats), {i} (int32s) and strings
const OscArg = T.Union([T.Number(), T.String({ maxLength: 128 }), T.Object({ i: T.Integer() })]);
const LiveSendIn = T.Object({
  host: T.String({ minLength: 1, maxLength: 253, pattern: "^[A-Za-z0-9.:-]+$" }),
  port: T.Integer({ minimum: 1, maximum: 65535 }),
  messages: T.Array(T.Array(T.Union([T.String({ minLength: 1, maxLength: 128 }), OscArg]), { minItems: 1, maxItems: 16 }), { minItems: 1, maxItems: 400 }),
  // the Live tab keeps a few frames in flight: each start of the camera is a `stream`, its frames numbered `seq`, and
  // a frame older than one already sent on that stream is dropped, so the receiver gets them in order
  stream: T.Optional(T.String({ minLength: 1, maxLength: 64, pattern: "^[A-Za-z0-9-]+$" })),
  seq: T.Optional(T.Integer({ minimum: 0 })),
});

export const DEFAULT_TAKE_OPTIONS = Object.freeze({
  smoothing: "default",
  focal35: null,
  fov: null,
  start: 0,
  duration: null,
  turningCamera: false,
  person: null,
  unevenGround: false,
  armFit: true,
  inPlace: false,
  rest: "t",
});
const VIDEO_EXT = new Set([".mp4", ".mov", ".m4v", ".mkv", ".webm", ".avi"]);
// The take's video as the upload stores it: `source` and the added file's extension. The engine names what it makes
// after its input (source.bvh, source.fbx, source.glb, …), so the video is only ever found by this exact name — the
// first `source.*` in the folder is the BVH once a take has run (2026-11-08, "Capture again from the start" failed:
// "Cannot open video: …\source.bvh").
const sourceFileName = (addedName) => `source${path.extname(addedName || "").toLowerCase()}`;

/** A take row as the screen reads it. */
function takeOf(row) {
  return {
    id: row.id,
    name: row.name,
    sourceName: row.source_name,
    options: { ...DEFAULT_TAKE_OPTIONS, ...JSON.parse(row.options || "{}") },
    state: row.state,
    error: row.error,
    // the files it made, by name (the done line of the engine: bvh, fbx, glb, usd, c3d, motion, face, preview, pose,
    // sheet, contacts) — each one's download is /files/<name>
    files: Object.keys(JSON.parse(row.files || "{}")).filter((k) => k !== "take"),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/** The mocap routes over `jobs` (the app's JobRegistry, or a function answering it); takes live under `takesDir`. */
export function makeMocapRouter(jobs, { takesDir, run = runMocap, sender = new LiveSender() }) {
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
    const file = path.join(folderOf(id), sourceFileName(row(id).source_name));
    if (!existsSync(file)) throw new ApiError(409, "take-without-video", "This take has no video", "its folder lost the video it was made from — add the video again as a new take");
    return file;
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
  // in a feature readiness's shape: the kit's engine banner (LuEngineNeeded readiness-url) offers the next step
  app.get("/v1/mocap/readiness", (c) => c.json(mocapReadiness()));

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
      await receiveUpload(c, path.join(folder, sourceFileName(name)), {
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
      // from the start: everything but the video goes (a new lens, ground or arm-fit choice needs the models again),
      // the engine's own source.bvh, source.fbx, … too
      const video = sourceFileName(r.source_name);
      for (const n of readdirSync(folderOf(id))) if (n !== video) await rm(path.join(folderOf(id), n), { recursive: true, force: true });
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
    // "source": the take's own video as it was added (a JustDirect shot's guide clip); else a file the engine made
    const file = name === "source" ? sourceOf(id) : name === "take" ? null : files[name];
    if (!file || !existsSync(file)) throw notFound(`take ${id} has no ${name} file`);
    // only a file inside the take's own folder
    if (path.relative(folderOf(id), file).startsWith("..")) throw notFound(`take ${id} has no ${name} file`);
    c.header("Content-Disposition", `attachment; filename="${path.basename(file)}"`);
    return serveStatic({ path: file })(c, next);
  });

  app.get("/v1/mocap/live/models/:name", input({ params: LiveModelParams }), async (c, next) => {
    const file = liveModelFile(c.req.valid("param").name);
    if (!file) throw new ApiError(409, "engine-not-installed", "Motion capture isn't installed", "Live capture's models come with Motion capture's install on the AI page");
    return serveStatic({ path: file })(c, next);
  });

  app.post("/v1/mocap/live/send", input({ body: LiveSendIn }), async (c) => {
    const { host, port, messages, stream, seq } = c.req.valid("json");
    if (messages.some((m) => typeof m[0] !== "string" || !m[0].startsWith("/"))) throw new ApiError(422, "bad-osc", "Not an OSC message", "each message starts with its address, like /VMC/Ext/Bone/Pos");
    try {
      await sender.send(host, port, messages, { stream, seq });
    } catch (e) {
      throw new ApiError(502, "osc-send-failed", "Sending failed", String(e?.message || e));
    }
    return c.body(null, 204);
  });

  return app;
}
