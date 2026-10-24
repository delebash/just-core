// SPDX-License-Identifier: MIT
// Feature routing by kind (docs/plans/2026-10-24-engines-the-llama-way.md, K8 + K8b): an image feature runs on its own
// preset (never the chat default), the preset's provider is of kind "image" (the built-in local-sdcpp a runtime brings),
// the preset's settings are its kind's (steps, cfg, strength, sampler, seed — bounded), and every chat list stays chat.
import { afterEach, beforeEach, expect, test } from "vitest";
import { IMAGE_ADAPTERS, runImageFeature } from "../src/llm/image_dispatch.js";
import { presetParams } from "../src/llm/preset_params.js";
import { makePresetsRouter } from "../src/llm/presets_api.js";
import { FeatureCatalogEntry } from "../src/llm/routing_api.js";
import * as seed from "../src/llm/seed.js";
import * as stores from "../src/llm/stores.js";
import { createServer } from "../src/platform/server.js";
import { EngineBusyError } from "../src/runner/runtime_service.js";
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
