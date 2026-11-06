// SPDX-License-Identifier: MIT
// A video feature (JustDirect, 2026-11-06 — the kit's TASKS, "JustDirect's six decisions", item 4): a video kind on
// sd.cpp's runtime with its provider, speed bands and preset settings; runVideoFeature routed by its own preset as an
// image feature is; the card booked as "video" while a video model's server runs; a clip's speed in seconds of clip per
// second of work; the row's own recipe under the request's settings; a fresh server per clip when the row asks.
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, expect, test } from "vitest";
import { runVideoFeature, VIDEO_ADAPTERS } from "../src/llm/image_dispatch.js";
import { presetParams } from "../src/llm/preset_params.js";
import { FeatureCatalogEntry } from "../src/llm/routing_api.js";
import { makeRuntimesRouter } from "../src/llm/runtimes_api.js";
import * as seed from "../src/llm/seed.js";
import * as stores from "../src/llm/stores.js";
import { createServer } from "../src/platform/server.js";
import { runtimeVariantDir } from "../src/runner/binary.js";
import { binaryAsset, DEFAULT_SDCPP_BINARIES, DEFAULT_SDCPP_BUILD } from "../src/runner/config.js";
import { configureRuntimeServices, RuntimeService } from "../src/runner/runtime_service.js";
import { kindsOf, providerIdOf, runtimeOf } from "../src/runner/runtimes.js";
import { sdServerArgv, videoGen, videoRequestFor } from "../src/runner/sdcpp.js";
import { freshDb } from "./helpers.js";

const realAdapter = VIDEO_ADAPTERS["local-sdcpp"];
let h;
let root;
beforeEach(() => {
  h = freshDb();
  root = mkdtempSync(path.join(tmpdir(), "kit-video-"));
  seed.configureAppSeed({
    featureCatalog: [FeatureCatalogEntry({ key: "shot.clip", label: "Shot clip", kind: "video" })],
    featurePrompts: {},
    enginePresets: [{ id: "clip", name: "Shot clip", provider_id: "local-sdcpp-video", model: "ltx-2.3", kind: "video", params: { steps: 8, cfg: 1, strength: 1, sampler: "euler", seed: 11 } }],
    featurePresets: { "shot.clip": "clip" },
    defaultPresetId: "",
    runtimes: ["sdcpp"],
  });
  seed.seedLlm();
});
afterEach(() => {
  VIDEO_ADAPTERS["local-sdcpp"] = realAdapter;
  configureRuntimeServices([]);
  rmSync(root, { recursive: true, force: true });
});

test("sd.cpp's runtime has a video kind: its own provider of the runtime's type, and bands in seconds of clip per second", () => {
  const rt = runtimeOf("sdcpp");
  expect(kindsOf(rt)).toEqual(["image", "video"]);
  expect(h.get("llm_providers", providerIdOf(rt, "image"))).toMatchObject({ id: "local-sdcpp", kind: "image", provider_type: "local-sdcpp" });
  expect(h.get("llm_providers", providerIdOf(rt, "video"))).toMatchObject({ id: "local-sdcpp-video", kind: "video", provider_type: "local-sdcpp" });
  const cfg = stores.getRunnerConfigStore().getRuntimeConfig("sdcpp");
  expect(cfg.bandsByKind.image).toMatchObject({ fast: 30, unit: "s/image", lowerIsFaster: true });
  // the 8 GB card's clips (0.0056–0.0155×) all rate fine
  expect(cfg.bandsByKind.video).toMatchObject({ fast: 0.05, fine: 0.005, slow: 0.002, unit: "x realtime", lowerIsFaster: false });
});

test("a video preset's settings: the image's sampler settings, 8 steps by default, each bounded", () => {
  expect(presetParams("video", {})).toEqual({ steps: 8, cfg: 1, strength: 1, sampler: "euler", seed: 42 });
  expect(() => presetParams("video", { steps: 0 })).toThrow();
  expect(() => presetParams("video", { sigmas: [1, 0] })).not.toThrow(); // a recipe's lists are the row's, never kept here
  expect(presetParams("video", { sigmas: [1, 0] })).not.toHaveProperty("sigmas");
});

test("a video feature runs on its own preset's provider and model, with the preset's settings; no preset is refused", async () => {
  const calls = [];
  VIDEO_ADAPTERS["local-sdcpp"] = async ({ preset, provider, request }) => {
    calls.push({ provider: provider.id, model: preset.model, params: { ...preset.params, ...(request.params || {}) }, frames: request.frames });
    return { bytes: Buffer.from("WEBM"), format: "webm", fps: 25, frames: 97 };
  };
  const out = await runVideoFeature("shot.clip", { prompt: "a fireball", width: 1280, height: 704, frames: 97, fps: 25, params: { seed: 12 } });
  expect(out).toMatchObject({ format: "webm", frames: 97 });
  expect(calls).toEqual([{ provider: "local-sdcpp-video", model: "ltx-2.3", params: { steps: 8, cfg: 1, strength: 1, sampler: "euler", seed: 12 }, frames: 97 }]);
  stores.getFeaturePresetRefStore().set("shot.clip", "");
  await expect(runVideoFeature("shot.clip", { prompt: "p" })).rejects.toMatchObject({ statusCode: 409, slug: "no-video-model" });
});

test("a video feature's readiness answers through the route, as an image feature's", async () => {
  const app = createServer({ typeBase: "t/" });
  app.route("/", makeRuntimesRouter());
  const ask = async () => (await app.request("/v1/ai/features/shot.clip/readiness")).json();
  expect(await ask()).toMatchObject({ kind: "video", ready: false, need: "engine-not-on", runtime: "sdcpp", model: "ltx-2.3" });
  configureRuntimeServices([["sdcpp", { status: () => ({ id: "sdcpp", installed: true, need: null }), modelsStatus: () => [{ id: "ltx-2.3", onDisk: true }] }]]);
  expect(await ask()).toMatchObject({ kind: "video", ready: true, need: "" });
});

// ── the runtime's server running a video model ──────────────────────────────────────────────────────────────────

const NVIDIA_BOX = { platform: "windows", runtimes: { cuda: true }, gpus: [{ computeCap: "7.5" }] };
const ROWS = DEFAULT_SDCPP_BINARIES.map((b) => ({ ...binaryAsset(b), assetBytes: b.asset_bytes, requires: b.requires }));
const FILES = { diffusion_model: "ltx.gguf", llm: "gemma.gguf", vae: "vae.safetensors" };
const MODELS = [
  { id: "klein", kind: "image", files: [] },
  { id: "ltx-2.3", kind: "video", files: [] },
];

function fakeArbiter() {
  const log = [];
  const bookings = new Map();
  return {
    log,
    bookings,
    reserve: (key, mb, opts) => {
      bookings.set(key, { mb, ...opts });
      log.push(["reserve", key, mb, opts.kind]);
    },
    release: (key) => {
      bookings.delete(key);
      log.push(["release", key]);
    },
    makeRoom: async () => true,
    busyBegin: (k) => log.push(["busyBegin", k]),
    busyEnd: (k) => log.push(["busyEnd", k]),
  };
}
function fakeStart() {
  const started = [];
  const fn = async (exe, argv, opts) => {
    const handle = { alive: true, url: opts.url, isAlive: () => handle.alive, stop: () => (handle.alive = false) };
    started.push(handle);
    return handle;
  };
  return { fn, started };
}
function service(arb, start, recorded = []) {
  const dir = runtimeVariantDir(root, "sdcpp", DEFAULT_SDCPP_BUILD, "cuda12");
  mkdirSync(dir, { recursive: true });
  writeFileSync(path.join(dir, "sd-server.exe"), "");
  const svc = new RuntimeService({
    id: "sdcpp",
    cacheRoot: root,
    configFn: () => ({ pinnedBuild: DEFAULT_SDCPP_BUILD, binaries: ROWS, idleSeconds: 300, memory: { idleMb: 128, peakMb: 6600 } }),
    hardwareFn: () => NVIDIA_BOX,
    systemFn: () => ({ platform: "win32", arch: "x64", versions: {}, missingDlls: () => [] }),
    server: { argv: sdServerArgv, ready: async () => true },
    logDir: root,
    startServer: start.fn,
    findPort: async () => 18912,
    arbiter: () => arb,
    modelsFn: () => MODELS,
  });
  svc.recordSpeed = (id, fields) => recorded.push([id, fields]);
  return svc;
}

test("a video model's server is booked as video — the job's busy kind too — and its booking goes when it stops", async () => {
  const arb = fakeArbiter();
  const start = fakeStart();
  const svc = service(arb, start);
  await svc.ensureServer({ modelKey: "ltx-2.3", files: FILES, peakVramMb: 7300 });
  expect(arb.bookings.get("video:sdcpp")).toMatchObject({ mb: 128, kind: "video" });
  expect(svc.holderOf("video:sdcpp")).toBe("ltx-2.3");
  expect(svc.holderOf("image:sdcpp")).toBe("");
  arb.log.length = 0;
  await svc.runJob(async () => "clip");
  expect(arb.log).toEqual([
    ["busyBegin", "video"],
    ["reserve", "video:sdcpp", 7300, "video"],
    ["busyEnd", "video"],
    ["reserve", "video:sdcpp", 128, "video"],
  ]);
  // the image model next: the video booking goes, the image one comes
  await svc.ensureServer({ modelKey: "klein", files: FILES });
  expect(arb.bookings.has("video:sdcpp")).toBe(false);
  expect(arb.bookings.get("image:sdcpp")).toMatchObject({ kind: "image" });
  await svc.stopServer();
  expect(arb.bookings.size).toBe(0);
});

test("the row's own recipe sits under the request's settings: its sigmas and upscale pass, the request's seed", () => {
  const model = { files: { diffusion_model: "ltx.gguf" }, spec: { params: { sigmas: [1, 0.99, 0], vaeTiling: { enabled: true }, seed: 1 } } };
  const out = videoRequestFor(model, { prompt: "p", params: { steps: 8, seed: 11 } });
  expect(out.params).toEqual({ sigmas: [1, 0.99, 0], vaeTiling: { enabled: true }, seed: 11, steps: 8 });
});

test("a clip's speed goes into the ledger as seconds of clip per second of work; a row that asks gets a fresh server per clip", async () => {
  const arb = fakeArbiter();
  const start = fakeStart();
  const recorded = [];
  const svc = service(arb, start, recorded);
  const realFetch = globalThis.fetch;
  globalThis.fetch = async (url) => {
    if (String(url).endsWith("/vid_gen")) return new Response(JSON.stringify({ id: "j1" }), { status: 202 });
    return new Response(JSON.stringify({ status: "completed", result: { b64_json: Buffer.from("WEBM").toString("base64"), output_format: "webm", fps: 25, frame_count: 100 } }));
  };
  try {
    const model = { key: "ltx-2.3", files: FILES, peakVramMb: 7300, spec: {} };
    const out = await videoGen(svc, { model, request: { prompt: "p", width: 1280, height: 704, frames: 97, fps: 25 } });
    expect(out).toMatchObject({ format: "webm", frames: 100, fps: 25 });
    expect(recorded).toHaveLength(1);
    expect(recorded[0][0]).toBe("ltx-2.3");
    expect(recorded[0][1].realtimeX).toBeGreaterThan(0); // 4 s of clip over the job's seconds
    expect(start.started[0].alive).toBe(true); // kept for the next clip
    await videoGen(svc, { model: { ...model, spec: { serverPerJob: true } }, request: { prompt: "p", width: 1280, height: 704, frames: 97, fps: 25 } });
    expect(start.started).toHaveLength(1);
    expect(start.started[0].alive).toBe(false); // stopped after its clip
    expect(arb.bookings.has("video:sdcpp")).toBe(false);
  } finally {
    globalThis.fetch = realFetch;
  }
});
