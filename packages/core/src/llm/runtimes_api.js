// SPDX-License-Identifier: MIT
// /v1/ai/runtimes — the app's kit runtimes besides llama.cpp (runner/runtime_service.js): each one's engine status,
// its install with progress and Cancel, its removal — llama.cpp's /v1/llm-runner/engine/* shape, per runtime id
// (docs/plans/2026-10-24-engines-the-llama-way.md, K3). Not /v1/engines/*: JustVoice's own routes use it.
import { Hono } from "hono";
import { ApiError, notFound } from "../platform/errors.js";
import { opt, T } from "../platform/models.js";
import { input } from "../platform/server.js";
import { getRuntimeService, runtimeServices } from "../runner/runtime_service.js";

const IdParams = T.Object({ id: T.String({ minLength: 1, maxLength: 64 }) });
const InstallIn = T.Object({ gpu: opt(T.String({ maxLength: 32 })), force: opt(T.Boolean()) });
const ModelParams = T.Object({ id: T.String({ minLength: 1, maxLength: 64 }), modelId: T.String({ minLength: 1, maxLength: 128 }) });

/** A model call, its "no such model" as a 404. */
function modelCall(fn) {
  try {
    return fn();
  } catch (e) {
    if (e?.notFound) throw notFound(e.message);
    throw e;
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
  app.post("/v1/ai/runtimes/:id/engine/install", input({ params: IdParams, body: InstallIn }), (c) => {
    const svc = serviceOf(c);
    const body = c.req.valid("json") ?? {};
    try {
      return c.json(svc.install({ gpu: body.gpu || null, force: !!body.force }), 202);
    } catch (e) {
      if (e?.need) throw new ApiError(409, "engine-cant-run-here", "This computer can't run this engine yet", e.need.detail, { need: e.need });
      throw e;
    }
  });
  app.post("/v1/ai/runtimes/:id/engine/install/cancel", input({ params: IdParams }), (c) => c.json(serviceOf(c).cancelInstall()));
  app.delete("/v1/ai/runtimes/:id/engine", input({ params: IdParams }), async (c) => c.json(await serviceOf(c).uninstall()));
  // its models: each one's size and state, a download (202) with progress and Cancel, removal
  app.get("/v1/ai/runtimes/:id/models", input({ params: IdParams }), (c) => c.json({ models: serviceOf(c).modelsStatus() }));
  app.post("/v1/ai/runtimes/:id/models/:modelId/download", input({ params: ModelParams }), (c) =>
    c.json(modelCall(() => serviceOf(c).downloadModel(c.req.valid("param").modelId)), 202),
  );
  app.post("/v1/ai/runtimes/:id/models/:modelId/download/cancel", input({ params: ModelParams }), (c) =>
    c.json(modelCall(() => serviceOf(c).cancelModelDownload(c.req.valid("param").modelId))),
  );
  app.delete("/v1/ai/runtimes/:id/models/:modelId", input({ params: ModelParams }), async (c) => {
    const svc = serviceOf(c);
    const modelId = c.req.valid("param").modelId;
    modelCall(() => svc._model(modelId));
    return c.json(await svc.deleteModel(modelId));
  });
  return app;
}
