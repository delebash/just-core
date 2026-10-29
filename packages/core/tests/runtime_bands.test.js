// SPDX-License-Identifier: MIT
// A runtime's speed bands are a setting its tab edits (the finish list's A13, 2026-10-29): the seeded band_*:<kind> rows
// (image: seconds per image, lower is faster) had no way to be changed — the family's rule is that a seeded value is
// editable in Settings. PUT /v1/ai/runtimes/:id/settings takes them beside the idle time; the status shows them.
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { expect, test } from "vitest";
import { makeRuntimesRouter } from "../src/llm/runtimes_api.js";
import * as seed from "../src/llm/seed.js";
import * as stores from "../src/llm/stores.js";
import { createServer } from "../src/platform/server.js";
import { configureRuntimeServices, RuntimeService } from "../src/runner/runtime_service.js";
import { freshDb } from "./helpers.js";

test("a runtime's speed bands: seeded, shown in its status, edited through its settings", async () => {
  freshDb();
  seed.configureAppSeed({ featureCatalog: [], featurePrompts: {}, enginePresets: [], featurePresets: {}, defaultPresetId: "", runtimes: ["sdcpp", "onnx"], runtimeModels: [] });
  seed.seedLlm();
  const root = mkdtempSync(path.join(tmpdir(), "kit-bands-"));
  const svc = (id) => new RuntimeService({ id, cacheRoot: root, configFn: () => stores.getRunnerConfigStore().getRuntimeConfig(id), hardwareFn: () => ({ platform: "windows", runtimes: {}, gpus: [] }) });
  configureRuntimeServices([["sdcpp", svc("sdcpp")], ["onnx", svc("onnx")]]);
  const app = createServer({ typeBase: "t/" });
  app.route("/", makeRuntimesRouter());
  const status = async (id) => (await app.request(`/v1/ai/runtimes/${id}/engine/status`)).json();
  expect((await status("sdcpp")).bands).toMatchObject({ fast: 30, fine: 120, slow: 300, unit: "s/image", lowerIsFaster: true });
  const put = (id, body) => app.request(`/v1/ai/runtimes/${id}/settings`, { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  const r = await put("sdcpp", { bands: { fast: 20, fine: 90, slow: 240 } });
  expect(r.status).toBe(200);
  expect((await r.json()).bands).toMatchObject({ fast: 20, fine: 90, slow: 240 });
  expect(stores.getRunnerConfigStore().getRuntimeConfig("sdcpp").bands).toMatchObject({ fast: 20, fine: 90, slow: 240 });
  // the idle time alone still saves, the bands kept
  expect((await (await put("sdcpp", { idleSeconds: 120 })).json())).toMatchObject({ idleSeconds: 120, bands: { fast: 20 } });
  expect((await put("sdcpp", { bands: { fast: 0, fine: 90, slow: 240 } })).status).toBe(422);
  // the vision kind's bands, in the same unit (the finish list's C23: one image's encode)
  expect((await status("onnx")).bands).toMatchObject({ fast: 5, fine: 20, slow: 60, unit: "s/image" });
});
