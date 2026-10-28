// SPDX-License-Identifier: MIT
// /v1/ai/runtimes — the app's kit runtimes besides llama.cpp (runner/runtime_service.js): each one's engine status,
// its install with progress and Cancel, its removal — llama.cpp's /v1/llm-runner/engine/* shape, per runtime id
// (docs/plans/2026-10-24-engines-the-llama-way.md, K3). Not /v1/engines/*: JustVoice's own routes use it.
import { Hono } from "hono";
import { ApiError, notFound } from "../platform/errors.js";
import { opt, T } from "../platform/models.js";
import { input } from "../platform/server.js";
import { getRuntimeService, runtimeServices } from "../runner/runtime_service.js";
import { imageFeatureReadiness } from "./image_dispatch.js";
import * as seed from "./seed.js";

const IdParams = T.Object({ id: T.String({ minLength: 1, maxLength: 64 }) });
const InstallIn = T.Object({ gpu: opt(T.String({ maxLength: 32 })), force: opt(T.Boolean()) });
const FeatureParams = T.Object({ key: T.String({ minLength: 1, maxLength: 128 }) });
const ModelParams = T.Object({ id: T.String({ minLength: 1, maxLength: 64 }), modelId: T.String({ minLength: 1, maxLength: 128 }) });

/** A service refusal in the routes' shape: no such model (404), what this computer lacks (409), no room on the drive
 *  (507 "disk-full", with `needBytes`/`freeBytes` for the screen's words), busy (409 "engine-busy" · "model-busy"). */
function asProblem(e) {
  if (e?.notFound) return notFound(e.message);
  if (e?.need) return new ApiError(409, "engine-cant-run-here", "This computer can't run this engine yet", e.need.detail, { need: e.need });
  if (e?.diskFull) return new ApiError(507, "disk-full", "Not enough room on the drive", e.message, e.diskFull);
  if (e?.busy) return new ApiError(409, e.busy, e.busy === "model-busy" ? "The model is busy" : "The engine is busy", e.message);
  return e;
}

/** A service call, its refusals answered as problems. */
async function call(fn) {
  try {
    return await fn();
  } catch (e) {
    throw asProblem(e);
  }
}

function serviceOf(c) {
  const svc = getRuntimeService(c.req.valid("param").id);
  if (!svc) throw notFound(`no runtime ${c.req.valid("param").id} in this app`);
  return svc;
}

export function makeRuntimesRouter() {
  const app = new Hono();
  app.get("/v1/ai/runtimes", (c) => c.json({ runtimes: runtimeServices().map((s) => s.status()) }));
  app.get("/v1/ai/runtimes/:id/engine/status", input({ params: IdParams }), (c) => c.json(serviceOf(c).status()));
  app.post("/v1/ai/runtimes/:id/engine/install", input({ params: IdParams, body: InstallIn }), async (c) => {
    const svc = serviceOf(c);
    const body = c.req.valid("json") ?? {};
    return c.json(await call(() => svc.install({ gpu: body.gpu || null, force: !!body.force })), 202);
  });
  app.post("/v1/ai/runtimes/:id/engine/install/cancel", input({ params: IdParams }), (c) => c.json(serviceOf(c).cancelInstall()));
  app.delete("/v1/ai/runtimes/:id/engine", input({ params: IdParams }), async (c) => {
    const svc = serviceOf(c);
    return c.json(await call(() => svc.uninstall()));
  });
  // its models: each one's size and state, a download (202) with progress and Cancel, removal
  app.get("/v1/ai/runtimes/:id/models", input({ params: IdParams }), (c) => c.json({ models: serviceOf(c).modelsStatus() }));
  app.post("/v1/ai/runtimes/:id/models/:modelId/download", input({ params: ModelParams }), async (c) => {
    const svc = serviceOf(c);
    return c.json(await call(() => svc.downloadModel(c.req.valid("param").modelId)), 202);
  });
  app.post("/v1/ai/runtimes/:id/models/:modelId/download/cancel", input({ params: ModelParams }), async (c) => {
    const svc = serviceOf(c);
    return c.json(await call(() => svc.cancelModelDownload(c.req.valid("param").modelId)));
  });
  app.delete("/v1/ai/runtimes/:id/models/:modelId", input({ params: ModelParams }), async (c) => {
    const svc = serviceOf(c);
    return c.json(await call(() => svc.deleteModel(c.req.valid("param").modelId)));
  });
  // what a feature needs before it can run (its engine installed, its model downloaded) — the screens' "this feature
  // needs its engine" banner (the plan's K10); a chat feature's model is the llama.cpp screens' business: ready here
  app.get("/v1/ai/features/:key/readiness", input({ params: FeatureParams }), (c) => {
    const key = c.req.valid("param").key;
    const entry = seed.appFeatureCatalog().find((e) => e.key === key);
    if (!entry) throw notFound(`no AI feature ${key} in this app`);
    const kind = entry.kind || "llm";
    if (kind === "image") return c.json(imageFeatureReadiness(key));
    return c.json({ feature: key, kind, ready: true, need: "", detail: "", runtime: "", model: "", engine: null, modelState: null });
  });
  return app;
}
