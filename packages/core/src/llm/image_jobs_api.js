// SPDX-License-Identifier: MIT
// /v1/ai/image/jobs — an image feature run as a job over HTTP: the door a caller outside the app's own screens uses
// (JustStage's Blender extension on a family host, 2026-10-29 — "a kit route that runs an image feature as a job").
// The one way an image feature runs is still llm/image_dispatch.js runImageFeature; this is its HTTP door, as
// POST /v1/ai/run is runAction's:
//   POST /v1/ai/image/jobs              {feature, request} → 202 with the job (the app's JobRegistry, kind "image") —
//                                       refused at once (the kit's problems) when the feature can't run yet; jobs run
//                                       one after the other (a later one waits, "waiting for the picture before it");
//   GET  /v1/jobs/:id, …/events         its progress (platform/jobs_api.js — the app mounts it on the same registry);
//   DELETE /v1/jobs/:id                 cancel;
//   GET  /v1/ai/image/jobs/:id/result   the picture (image/png) once it's done — fetched once, then the job is forgotten
//                                       and its file deleted (JustVoice's export, round E); 409 while it runs.
// A picture never fetched is deleted with its job when the registry forgets it, and at the next start once it is older
// than the registry keeps finished jobs.

import { randomUUID } from "node:crypto";
import { mkdirSync, readdirSync, rmSync, statSync } from "node:fs";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { Hono } from "hono";
import { ApiError, notFound } from "../platform/errors.js";
import { opt, T } from "../platform/models.js";
import { input } from "../platform/server.js";
import { abortError } from "./base.js";
import { imageFeatureReadiness, runImageFeature } from "./image_dispatch.js";

const IdParams = T.Object({ id: T.String({ minLength: 1, maxLength: 64, pattern: "^[A-Za-z0-9_-]+$" }) });
// a picture in: base64 PNG (≤ 48 MB decoded)
const Png = T.String({ maxLength: 64 * 1024 * 1024 });
const ImageJobIn = T.Object({
  feature: T.String({ minLength: 1, maxLength: 128 }),
  request: T.Object({
    prompt: opt(T.String({ maxLength: 20_000 })),
    width: opt(T.Integer({ minimum: 64, maximum: 4096 })),
    height: opt(T.Integer({ minimum: 64, maximum: 4096 })),
    seed: opt(T.Integer()),
    init: opt(Png),
    mask: opt(Png),
    refs: opt(T.Array(Png, { maxItems: 8 })),
  }),
});

const pngOf = (b64) => (b64 ? Buffer.from(String(b64), "base64") : undefined);

/** The image-job routes over `jobs` — the app's JobRegistry, or a function answering it — keeping each finished
 *  picture in `resultDir` until it is fetched. */
export function makeImageJobsRouter(jobs, { resultDir }) {
  if (!resultDir) throw new TypeError("makeImageJobsRouter needs a resultDir for the finished pictures");
  const registry = typeof jobs === "function" ? jobs : () => jobs;
  const fileOf = (key) => path.join(resultDir, `${key}.png`);
  // pictures no job remembers any more (never fetched, the registry forgot them, or the server started again)
  const sweep = () => {
    let names = [];
    try {
      names = readdirSync(resultDir);
    } catch {
      return; // no folder yet
    }
    const keepMs = registry().keepMs ?? 10 * 60_000;
    for (const n of names) {
      const f = path.join(resultDir, n);
      try {
        if (Date.now() - statSync(f).mtimeMs > keepMs) rmSync(f, { force: true });
      } catch {
        // another request took it
      }
    }
  };

  // One picture at a time (JustStage, 2026-10-29: a second job, accepted, ended at once "the graphics card is busy"):
  // each job waits for the one before it to end, says so while it waits, and a Cancel while it waits ends it at once.
  let tail = Promise.resolve();
  const inLane = (signal, progress, work) => {
    const before = tail;
    let release;
    const mine = new Promise((r) => {
      release = r;
    });
    tail = before.then(() => mine); // the next one waits for this one's predecessor AND this one
    progress(0, "waiting for the picture before it");
    const turn = new Promise((resolve, reject) => {
      if (signal.aborted) return reject(abortError(signal));
      signal.addEventListener("abort", () => reject(abortError(signal)), { once: true });
      before.then(resolve);
    });
    return turn.then(() => {
      progress(0, "");
      return work();
    }).finally(release);
  };

  const app = new Hono();
  app.post("/v1/ai/image/jobs", input({ body: ImageJobIn }), async (c) => {
    const { feature, request } = c.req.valid("json");
    // what it needs first, refused now in the kit's words — not a job that fails a moment later
    const ready = imageFeatureReadiness(feature);
    if (!ready.ready) {
      throw new ApiError(409, ready.need || "feature-not-ready", "This image feature can't run yet", ready.detail || ready.need, { feature, need: ready.need });
    }
    sweep();
    mkdirSync(resultDir, { recursive: true });
    // a key of its own: two callers' pictures are two jobs, run one after the other (the lane below)
    const key = randomUUID();
    const req = { ...request, init: pngOf(request.init), mask: pngOf(request.mask), refs: request.refs?.map(pngOf) };
    const job = registry().start({ kind: "image", key, label: feature, failTitle: "The picture failed", clientId: c.req.header("x-client-id") ?? null, meta: { feature } }, ({ signal, progress }) =>
      inLane(signal, progress, async () => {
        const png = await runImageFeature(feature, req, {
          signal,
          onProgress: (p) => progress(p?.fraction ?? (p?.steps ? p.step / p.steps : 0), p?.steps ? `${p.step}/${p.steps}` : undefined),
        });
        // cancelled while the picture was being made but it came anyway: no picture (the registry would call a work that
        // returned done — JustStage, 2026-10-29)
        if (signal.aborted) throw abortError(signal);
        await writeFile(fileOf(key), png);
        return { contentType: "image/png", bytes: png.length };
      }),
    );
    return c.json(job, 202);
  });

  app.get("/v1/ai/image/jobs/:id/result", input({ params: IdParams }), async (c) => {
    const id = c.req.valid("param").id;
    const job = registry().get(id);
    if (!job || job.kind !== "image") {
      const ended = registry().ended?.get(id);
      if (ended) throw new ApiError(410, "job-ended", "This work ended a while ago", `it ended as ${ended.state}`, { state: ended.state, kind: ended.kind });
      throw notFound(`no image job ${id}`);
    }
    if (job.state === "running") throw new ApiError(409, "job-running", "The picture isn't ready yet", "follow /v1/jobs/:id until it ends", { progress: job.progress });
    if (job.state !== "done") throw new ApiError(409, `job-${job.state}`, "This job made no picture", job.error?.message || job.state, { state: job.state });
    let png;
    try {
      png = await readFile(fileOf(job.key));
    } catch {
      throw new ApiError(410, "result-gone", "This picture was already fetched", "a picture is fetched once");
    }
    // fetched once: the job and its file go
    registry().forget(id);
    rmSync(fileOf(job.key), { force: true });
    return c.body(png, 200, { "Content-Type": "image/png", "Content-Length": String(png.length) });
  });
  return app;
}
