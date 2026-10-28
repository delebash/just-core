// SPDX-License-Identifier: MIT
// An app turning on one of the kit's runtimes (the kit's engines plan, K13) — as app.js's llmArgs would: `runtimes`,
// the models it brings (`runtimeModels`, pinned files), a feature of kind "image" with its own preset. The template
// runs no image model, so this test is the wiring's reference: the AI page's runtime tab reads the engine and the
// models, the Routing tab the feature's kind and its image presets, and the "needs its engine" banner what's missing.
import { FeatureCatalogEntry, installLlm, seedLlm } from "@delebash/core/llm";
import { createServer } from "@delebash/core/platform";
import { expect, test } from "vitest";
import { TYPE_BASE } from "../src/app.js";
import { openAppDatabase } from "../src/database/index.js";
import { tmpDir, useHermeticKit } from "./helpers.js";

useHermeticKit();

test("a runtime turned on through installLlm: its engine, its models, its image feature routed and its readiness", async () => {
  const dir = tmpDir();
  const db = openAppDatabase(dir);
  try {
    const app = createServer({ typeBase: TYPE_BASE });
    await installLlm(app, {
      db,
      dataDir: dir,
      product: "family-template-test",
      featureCatalog: [FeatureCatalogEntry({ key: "photo.render", label: "A photo", kind: "image" })],
      featurePrompts: {},
      enginePresets: [{ id: "photo", name: "Photo", provider_id: "local-sdcpp", model: "tiny", kind: "image", params: { steps: 6 } }],
      featurePresets: { "photo.render": "photo" },
      runtimes: ["sdcpp"],
      runtimeModels: [
        { runtime: "sdcpp", id: "tiny", name: "Tiny", license: "MIT", files: [{ slot: "diffusion_model", repo: "org/tiny", revision: "abc123", path: "t.gguf", sha256: "0".repeat(64), bytes: 10 }], peakVramMb: 0 },
      ],
    });
    seedLlm(db);
    const get = async (url) => (await app.request(url)).json();

    const { runtimes } = await get("/v1/ai/runtimes");
    expect(runtimes.map((r) => [r.id, r.kind])).toEqual([["sdcpp", "image"]]);
    expect((await get("/v1/ai/runtimes/sdcpp/models")).models).toEqual([expect.objectContaining({ id: "tiny", name: "Tiny", onDisk: false, bytes: 10 })]);
    expect((await get("/v1/ai/routing")).features.find((f) => f.key === "photo.render")).toMatchObject({ kind: "image" });
    expect((await get("/v1/ai/engine-presets?kind=image")).presets).toEqual([expect.objectContaining({ id: "photo", kind: "image", params: expect.objectContaining({ steps: 6 }) })]);
    // nothing installed in this data folder: the banner's first step is the engine (or what this computer lacks for it)
    const ready = await get("/v1/ai/features/photo.render/readiness");
    expect(ready).toMatchObject({ kind: "image", ready: false, runtime: "sdcpp", model: "tiny" });
    expect(["engine-not-installed", "engine-cant-run-here"]).toContain(ready.need);
  } finally {
    db.close();
  }
});
