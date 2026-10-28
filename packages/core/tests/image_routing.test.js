// SPDX-License-Identifier: MIT
// Feature routing by kind (docs/plans/2026-10-24-engines-the-llama-way.md, K8 + K8b): an image feature runs on its own
// preset (never the chat default), the preset's provider is of kind "image" (the built-in local-sdcpp a runtime brings),
// the preset's settings are its kind's (steps, cfg, strength, sampler, seed — bounded), and every chat list stays chat.
import { afterEach, beforeEach, expect, test } from "vitest";
import { IMAGE_ADAPTERS, runImageFeature } from "../src/llm/image_dispatch.js";
import { presetParams } from "../src/llm/preset_params.js";
import { makePresetsRouter } from "../src/llm/presets_api.js";
import { FeatureCatalogEntry, makeRoutingRouter } from "../src/llm/routing_api.js";
import { makeRuntimesRouter } from "../src/llm/runtimes_api.js";
import * as seed from "../src/llm/seed.js";
import * as stores from "../src/llm/stores.js";
import { createServer } from "../src/platform/server.js";
import { configureRuntimeServices, EngineBusyError } from "../src/runner/runtime_service.js";
import { freshDb } from "./helpers.js";

const realAdapter = IMAGE_ADAPTERS["local-sdcpp"];
beforeEach(() => {
  freshDb();
  seed.configureAppSeed({
    featureCatalog: [FeatureCatalogEntry({ key: "chat", label: "Chat" }), FeatureCatalogEntry({ key: "aiphoto.render", label: "AI photo", kind: "image" })],
    featurePrompts: {},
    enginePresets: [
      { id: "talk", name: "Talk", provider_id: "local-llamacpp", model: "gemma" },
      { id: "photo", name: "AI photo", provider_id: "local-sdcpp", model: "flux2-klein-4b", kind: "image", params: { steps: 4, cfg: 1, strength: 1, sampler: "euler", seed: 42 } },
    ],
    featurePresets: { "aiphoto.render": "photo" },
    defaultPresetId: "talk",
    runtimes: ["sdcpp"],
  });
  seed.seedLlm();
});
afterEach(() => {
  IMAGE_ADAPTERS["local-sdcpp"] = realAdapter;
  configureRuntimeServices([]);
});

test("the screens read each feature's kind, and an image preset's settings with their bounds", async () => {
  const app = createServer({ typeBase: "t/" });
  app.route("/", makeRoutingRouter(stores.getRoutingStore, seed.appFeatureCatalog));
  app.route("/", makePresetsRouter(stores.getEnginePresetStore, stores.getDefaultPresetId, stores.setDefaultPresetId, stores.getFeaturePresetRefStore));
  const routing = await (await app.request("/v1/ai/routing")).json();
  expect(routing.features.map((f) => [f.key, f.kind])).toEqual([["chat", "llm"], ["aiphoto.render", "image"]]);
  const image = await (await app.request("/v1/ai/engine-presets?kind=image")).json();
  expect(image.paramRules).toMatchObject({ steps: { type: "int", min: 1, max: 150, default: 4 }, sampler: { default: "euler" } });
  expect((await (await app.request("/v1/ai/engine-presets")).json()).paramRules).toEqual({}); // a chat preset's are its own fields
});

test("an image preset's settings are edited and reset in place; a feature takes only a preset of its own kind", async () => {
  const app = createServer({ typeBase: "t/" });
  app.route("/", makePresetsRouter(stores.getEnginePresetStore, stores.getDefaultPresetId, stores.setDefaultPresetId, stores.getFeaturePresetRefStore, null, seed.resetPresetToFactory));
  const json = (method, url, body) => app.request(url, { method, headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  const photo = stores.getEnginePresetStore().get("photo");
  const put = await json("PUT", "/v1/ai/engine-presets/photo", { ...photo, params: { ...photo.params, steps: 8 } });
  expect(put.status).toBe(200);
  expect((await put.json()).presets.map((p) => [p.id, p.params.steps])).toEqual([["photo", 8]]); // the image list answers
  const tooMany = await json("PUT", "/v1/ai/engine-presets/photo", { ...photo, params: { steps: 500 } });
  expect(tooMany.status).toBe(422);
  expect((await tooMany.json()).errors[0].loc).toEqual(["body", "params", "steps"]);
  // Reset: the app's own settings back
  await app.request("/v1/ai/engine-presets/photo/reset", { method: "POST" });
  expect(stores.getEnginePresetStore().get("photo").params.steps).toBe(4);
  // an image feature takes an image preset; a chat preset is refused for it, and the chat default takes no image preset
  expect((await json("PUT", "/v1/ai/preset-assignments/feature", { featureKey: "aiphoto.render", presetId: "photo" })).status).toBe(200);
  expect((await json("PUT", "/v1/ai/preset-assignments/feature", { featureKey: "aiphoto.render", presetId: "talk" })).status).toBe(422);
  expect((await json("PUT", "/v1/ai/preset-assignments/default", { presetId: "photo" })).status).toBe(422);
});

test("a feature's readiness: the first thing it needs, until it can run", async () => {
  const app = createServer({ typeBase: "t/" });
  app.route("/", makeRuntimesRouter());
  const ask = async (key) => (await app.request(`/v1/ai/features/${key}/readiness`)).json();
  expect(await ask("aiphoto.render")).toMatchObject({ kind: "image", ready: false, need: "engine-not-on", runtime: "sdcpp", model: "flux2-klein-4b" });
  const engine = { installed: false, need: null };
  const models = [];
  configureRuntimeServices([["sdcpp", { status: () => ({ id: "sdcpp", ...engine }), modelsStatus: () => models }]]);
  engine.need = { reason: "vc-runtime" };
  expect((await ask("aiphoto.render")).need).toBe("engine-cant-run-here");
  engine.need = null;
  expect((await ask("aiphoto.render")).need).toBe("engine-not-installed");
  engine.installed = true;
  expect((await ask("aiphoto.render")).need).toBe("model-unknown");
  models.push({ id: "flux2-klein-4b", onDisk: false, bytes: 9e9 });
  expect(await ask("aiphoto.render")).toMatchObject({ need: "model-not-downloaded", modelState: { id: "flux2-klein-4b", bytes: 9e9 } });
  models[0].onDisk = true;
  expect(await ask("aiphoto.render")).toMatchObject({ ready: true, need: "" });
  // no preset of its own: said so
  stores.getFeaturePresetRefStore().set("aiphoto.render", "");
  expect(await ask("aiphoto.render")).toMatchObject({ ready: false, need: "no-image-model" });
  // a chat feature's model is the llama.cpp screens' business; a key the app doesn't have is a 404
  expect(await ask("chat")).toMatchObject({ kind: "llm", ready: true });
  expect((await app.request("/v1/ai/features/nope/readiness")).status).toBe(404);
});

test("an image preset's settings: filled with the defaults, each one bounded; a chat preset has none", () => {
  expect(presetParams("image", { steps: 8 })).toEqual({ steps: 8, cfg: 1, strength: 1, sampler: "euler", seed: 42 });
  expect(() => presetParams("image", { steps: 0 })).toThrow();
  expect(() => presetParams("image", { strength: 1.5 })).toThrow();
  expect(() => presetParams("image", { sampler: "magic" })).toThrow();
  expect(presetParams("llm", { anything: 1 })).toEqual({});
});

test("the runtime's built-in image provider and the app's image preset — kept out of every chat list", async () => {
  const providers = stores.getProviderStore();
  expect(providers.list().some((p) => p.id === "local-sdcpp")).toBe(false);
  expect(providers.list({ kind: "image" }).map((p) => [p.id, p.providerType])).toEqual([["local-sdcpp", "local-sdcpp"]]);
  const presets = stores.getEnginePresetStore();
  expect(presets.list().map((p) => p.id)).toEqual(["talk"]);
  expect(presets.list({ kind: "image" })).toEqual([expect.objectContaining({ id: "photo", kind: "image", model: "flux2-klein-4b", params: { steps: 4, cfg: 1, strength: 1, sampler: "euler", seed: 42 } })]);
  const app = createServer({ typeBase: "t/" });
  app.route("/", makePresetsRouter(stores.getEnginePresetStore, stores.getDefaultPresetId, stores.setDefaultPresetId, stores.getFeaturePresetRefStore));
  expect((await (await app.request("/v1/ai/engine-presets")).json()).presets.map((p) => p.id)).toEqual(["talk"]);
  expect((await (await app.request("/v1/ai/engine-presets?kind=image")).json()).presets.map((p) => p.id)).toEqual(["photo"]);
});

test("an image feature runs on its own preset's provider and model, with the preset's settings", async () => {
  const calls = [];
  IMAGE_ADAPTERS["local-sdcpp"] = async ({ preset, request }) => {
    calls.push({ model: preset.model, params: { ...preset.params, ...(request.params || {}) }, prompt: request.prompt });
    return Buffer.from("PNG");
  };
  const out = await runImageFeature("aiphoto.render", { prompt: "Repaint the body", width: 1024, height: 768 });
  expect(out.toString()).toBe("PNG");
  expect(calls).toEqual([{ model: "flux2-klein-4b", params: { steps: 4, cfg: 1, strength: 1, sampler: "euler", seed: 42 }, prompt: "Repaint the body" }]);
});

test("an image feature with no preset of its own is refused — never sent to the chat default", async () => {
  stores.getFeaturePresetRefStore().set("aiphoto.render", "");
  await expect(runImageFeature("aiphoto.render", { prompt: "p" })).rejects.toMatchObject({ statusCode: 409, slug: "no-image-model" });
});

test("a card another kind's job holds: a 409 in the screens' words", async () => {
  IMAGE_ADAPTERS["local-sdcpp"] = async () => {
    throw new EngineBusyError("stable-diffusion.cpp");
  };
  await expect(runImageFeature("aiphoto.render", { prompt: "p" })).rejects.toMatchObject({ statusCode: 409, slug: "gpu-busy" });
});
