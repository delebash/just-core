// SPDX-License-Identifier: MIT
// The in-process ONNX runtime (docs/plans/2026-10-24-engines-the-llama-way.md, K6 — round C): the generic session
// pieces moved from just-house-paint (runner/onnx.js — a provider falling back to the CPU, DirectML's options, one call
// at a time, whether ONNX Runtime loads here), and the runtime service's in-process shape — part of the app, nothing to
// install; a vision model built by the app's adapter once, booked with the arbiter, let go when idle, evicted, deleted
// or reset — and a vision feature run through its preset.
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { registerVisionAdapter, runVisionFeature, runtimeFeatureReadiness } from "../src/llm/image_dispatch.js";
import { FeatureCatalogEntry } from "../src/llm/routing_api.js";
import * as seed from "../src/llm/seed.js";
import * as stores from "../src/llm/stores.js";
import * as models from "../src/runner/models.js";
import { bestDmlAdapter, openSlot, ortRuntimeCheck, resolveProvider, runSlot, serial, sessionOptions } from "../src/runner/onnx.js";
import { configureRuntimeServices, EngineBusyError, RuntimeService } from "../src/runner/runtime_service.js";
import { freshDb } from "./helpers.js";

const quiet = { info() {}, warn() {} };

// ── the session pieces ──────────────────────────────────────────────────────────────────────────────────────────

/** A stand-in ortApi: `failOn` the providers whose session can't be created; sessions record their runs. */
function fakeOrt({ failOn = [], runFailsOn = [] } = {}) {
  const made = [];
  return {
    made,
    InferenceSession: {
      create: async (file, opts) => {
        const ep = opts.executionProviders[0]?.name ?? opts.executionProviders[0];
        made.push({ file, ep, opts });
        if (failOn.includes(ep)) throw new Error(`${ep} isn't here`);
        return { ep, run: async (feeds) => (runFailsOn.includes(ep) ? Promise.reject(new Error(`${ep} broke`)) : { ok: ep, feeds }), release: async () => {} };
      },
    },
  };
}

test("a provider: auto is DirectML on Windows, else the CPU; DirectML's options and its adapter", () => {
  expect(resolveProvider("auto", "win32")).toBe("dml");
  expect(resolveProvider("auto", "linux")).toBe("cpu");
  expect(resolveProvider("cpu", "win32")).toBe("cpu");
  expect(() => resolveProvider("cuda")).toThrow(/executionProvider must be/);
  expect(sessionOptions("dml", { dmlDeviceId: 1 })).toMatchObject({ executionProviders: [{ name: "dml", deviceId: 1 }], enableMemPattern: false, executionMode: "sequential" });
  expect(sessionOptions("cpu")).toMatchObject({ executionProviders: ["cpu"], enableCpuMemArena: false });
  // the adapter with the most memory of its own, never the software one
  expect(bestDmlAdapter([{ index: 0, dedicatedMb: 128 }, { index: 1, dedicatedMb: 8192 }, { index: 2, dedicatedMb: 99999, software: true }])).toBe(1);
  expect(bestDmlAdapter([])).toBeUndefined();
});

test("a session falls back to the CPU when its provider can't create it, or later fails a run", async () => {
  const ort = fakeOrt({ failOn: ["dml"] });
  const slot = await openSlot(ort, "image", "m.onnx", "dml", {}, quiet);
  expect(slot).toMatchObject({ ep: "cpu", wanted: "dml", fallback: expect.stringMatching(/dml isn't here/) });
  const late = fakeOrt({ runFailsOn: ["dml"] });
  const s2 = await openSlot(late, "image", "m.onnx", "dml", {}, quiet);
  expect(await runSlot(late, s2, { x: 1 }, {}, quiet)).toMatchObject({ ok: "cpu" });
  expect(s2).toMatchObject({ ep: "cpu", fallback: expect.stringMatching(/failed to run on dml/) });
  // one call at a time
  const order = [];
  const one = serial();
  await Promise.all([one(async () => order.push("a")), one(async () => order.push("b"))]);
  expect(order).toEqual(["a", "b"]);
});

test("whether ONNX Runtime loads here: the Visual C++ runtime, a file the antivirus took, a DLL too old, another copy loaded", async () => {
  const none = () => [];
  expect(await ortRuntimeCheck({ load: async () => {}, missingDlls: () => ["MSVCP140_1.dll"], modulePath: () => null })).toMatchObject({ ok: false, reason: "vc-runtime", missing: ["MSVCP140_1.dll"] });
  const dir = mkdtempSync(path.join(tmpdir(), "kit-ortbin-"));
  try {
    const gone = await ortRuntimeCheck({ load: async () => Promise.reject(new Error("The specified module could not be found.")), binDir: dir, missingDlls: none, modulePath: () => null });
    expect(gone).toMatchObject({ ok: false, reason: "files-missing", files: ["onnxruntime.dll"] });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
  expect(await ortRuntimeCheck({ load: async () => Promise.reject(new Error("The specified procedure could not be found.")), missingDlls: none, modulePath: () => null })).toMatchObject({ reason: "dll-too-old" });
  const elsewhere = (name) => (name === "onnxruntime.dll" ? "C:\\Windows\\System32\\onnxruntime.dll" : "C:\\app\\bin\\onnxruntime_binding.node");
  expect(await ortRuntimeCheck({ load: async () => {}, missingDlls: none, modulePath: elsewhere })).toMatchObject({ ok: false, reason: "files-missing" });
  expect(await ortRuntimeCheck({ load: async () => {}, missingDlls: none, modulePath: () => null })).toEqual({ ok: true });
});

// ── the in-process runtime ──────────────────────────────────────────────────────────────────────────────────────

const SEG = {
  runtime: "onnx",
  id: "tiny-seg",
  name: "Tiny segmenter",
  license: "MIT",
  files: [
    { slot: "encoder", repo: "org/seg", revision: "abc123", path: "seg/encoder.onnx", sha256: "a".repeat(64), bytes: 7 },
    { slot: "decoder", repo: "org/seg", revision: "abc123", path: "seg/decoder.onnx", sha256: "b".repeat(64), bytes: 7 },
  ],
  peakVramMb: 5800,
};

let root;
let h;
beforeEach(() => {
  root = mkdtempSync(path.join(tmpdir(), "kit-onnx-"));
  h = freshDb();
});
afterEach(() => {
  configureRuntimeServices([]);
  vi.useRealTimers();
  rmSync(root, { recursive: true, force: true });
});

/** The model's files in the kit's cache, at their sizes. */
function filesHere() {
  for (const f of SEG.files) {
    const p = models.snapshotFilePath(path.join(root, "hf"), f.repo, f.revision, f.path);
    mkdirSync(path.dirname(p), { recursive: true });
    writeFileSync(p, "x".repeat(f.bytes));
  }
}
/** An arbiter that records; `room` whether it can make room. */
function fakeArbiter(room = true) {
  const calls = [];
  return {
    calls,
    reserve: (key, mb, o) => calls.push(["reserve", key, mb, o.kind]),
    release: (key) => calls.push(["release", key]),
    makeRoom: async (mb) => (calls.push(["makeRoom", mb]), room),
    busyBegin: (k) => calls.push(["busy", k]),
    busyEnd: (k) => calls.push(["idle", k]),
  };
}
const service = (extra = {}) =>
  new RuntimeService({
    id: "onnx",
    cacheRoot: root,
    configFn: () => ({ idleSeconds: 60 }),
    hardwareFn: () => ({ platform: "windows", runtimes: {}, gpus: [{ name: "RTX", vramMb: 8192 }], ramMb: 32768, cpuCores: 8 }),
    modelsFn: () => [SEG],
    ort: { load: async () => ({ default: { tag: "ort" } }) },
    ortCheck: async () => ({ ok: true }),
    dmlDeviceIdFn: () => 1,
    ...extra,
  });
/** The app's adapter: what it was built with; its instance runs `work`. */
function adapterOf() {
  const built = [];
  const disposed = [];
  return {
    built,
    disposed,
    create: async (opts) => {
      built.push(opts);
      return { id: built.length, dispose: async () => disposed.push(built.length) };
    },
  };
}

test("part of the app: nothing to install or remove; its status says whether it loads here", async () => {
  const ok = service();
  await ok.checkRuntime();
  expect(ok.status()).toMatchObject({ id: "onnx", kind: "vision", inProcess: true, installed: true, need: null, downloadBytes: 0 });
  expect(() => ok.install()).toThrow(expect.objectContaining({ nothingToInstall: true }));
  await expect(ok.uninstall()).rejects.toMatchObject({ nothingToInstall: true });
  const vc = service({ ortCheck: async () => ({ ok: false, reason: "vc-runtime", missing: ["MSVCP140.dll"], detail: "Microsoft's Visual C++ runtime …" }) });
  await vc.checkRuntime();
  expect(vc.status()).toMatchObject({ installed: false, need: { reason: "vc-runtime", missing: ["MSVCP140.dll"] } });
  const notOn = service({ ort: null, ortCheck: undefined });
  expect((await notOn.checkRuntime()).ok).toBe(false);
});

test("a model in memory: built once by the app's adapter, booked with the arbiter, busy while it runs, let go when idle", async () => {
  filesHere();
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
  const arb = fakeArbiter();
  const svc = service({ arbiter: () => arb });
  const a = adapterOf();
  const r1 = await svc.withModel("tiny-seg", { adapter: a, params: { executionProvider: "auto" } }, async (inst) => `ran on ${inst.id}`);
  const r2 = await svc.withModel("tiny-seg", { adapter: a, params: { executionProvider: "auto" } }, async (inst) => `ran on ${inst.id}`);
  expect([r1, r2]).toEqual(["ran on 1", "ran on 1"]); // built once
  expect(a.built[0]).toMatchObject({ executionProvider: "auto", dmlDeviceId: 1, ort: { tag: "ort" } });
  expect(Object.keys(a.built[0].files)).toEqual(["encoder", "decoder"]);
  expect(arb.calls).toContainEqual(["reserve", "vision:onnx", process.platform === "win32" ? 5800 : 0, "vision"]);
  expect(arb.calls.filter((c) => c[0] === "busy")).toHaveLength(2);
  expect(svc.modelsStatus()[0]).toMatchObject({ running: true });
  await vi.advanceTimersByTimeAsync(60_000); // the runtime's idle time
  expect(a.disposed).toEqual([1]);
  expect(arb.calls.at(-1)).toEqual(["release", "vision:onnx"]);
  expect(svc.modelsStatus()[0].running).toBe(false);
});

test("the CPU takes no card memory; other params let the last one go; a busy card refuses", async () => {
  filesHere();
  const arb = fakeArbiter();
  const svc = service({ arbiter: () => arb });
  const a = adapterOf();
  await svc.withModel("tiny-seg", { adapter: a, params: { executionProvider: "cpu" } }, async () => {});
  expect(arb.calls).toContainEqual(["reserve", "vision:onnx", 0, "vision"]);
  expect(arb.calls.some((c) => c[0] === "makeRoom")).toBe(false);
  await svc.withModel("tiny-seg", { adapter: a, params: { executionProvider: "auto" } }, async () => {});
  expect(a.disposed).toEqual([1]); // the CPU one let go for the other
  await svc.stopServer();
  if (process.platform === "win32") {
    const full = service({ arbiter: () => fakeArbiter(false) });
    await expect(full.withModel("tiny-seg", { adapter: adapterOf(), params: {} }, async () => {})).rejects.toBeInstanceOf(EngineBusyError);
  }
});

test("never let go mid-run: a reset waits for the run; a busy model isn't deleted; not downloaded is said", async () => {
  const svc = service({ arbiter: () => fakeArbiter() });
  await expect(svc.withModel("tiny-seg", { adapter: adapterOf(), params: {} }, async () => {})).rejects.toMatchObject({ notDownloaded: true });
  filesHere();
  const a = adapterOf();
  let finish;
  const run = svc.withModel("tiny-seg", { adapter: a, params: {} }, () => new Promise((r) => (finish = r)));
  await vi.waitFor(() => expect(finish).toBeTypeOf("function"));
  await expect(svc.deleteModel("tiny-seg")).rejects.toMatchObject({ busy: "model-busy" });
  const stopping = svc.stopServer();
  await new Promise((r) => setTimeout(r, 10));
  expect(a.disposed).toEqual([]); // still running
  finish();
  await run;
  await stopping;
  expect(a.disposed).toEqual([1]);
});

test("a vision feature runs through its preset: the model, the params, the app's adapter", async () => {
  seed.configureAppSeed({
    featureCatalog: [FeatureCatalogEntry({ key: "parts.find", label: "Find the parts", kind: "vision" })],
    featurePrompts: {},
    enginePresets: [{ id: "p_parts", name: "Parts", provider_id: "local-onnx", model: "tiny-seg", kind: "vision", params: { executionProvider: "cpu" } }],
    featurePresets: { "parts.find": "p_parts" },
    defaultPresetId: "",
    runtimes: ["onnx"],
    runtimeModels: [SEG],
  });
  seed.seedLlm();
  expect(stores.getEnginePresetStore().get("p_parts").params).toEqual({ executionProvider: "cpu" });
  const svc = service({ modelsFn: () => stores.getRunnerConfigStore().listRuntimeModels("onnx"), arbiter: () => fakeArbiter() });
  configureRuntimeServices([["onnx", svc]]);
  await svc.checkRuntime();
  expect(runtimeFeatureReadiness("parts.find", "vision")).toMatchObject({ kind: "vision", runtime: "onnx", model: "tiny-seg", need: "model-not-downloaded" });
  await expect(runVisionFeature("parts.find", async () => {})).rejects.toMatchObject({ slug: "no-vision-adapter" });
  const a = adapterOf();
  registerVisionAdapter("tiny-seg", a);
  await expect(runVisionFeature("parts.find", async () => {})).rejects.toMatchObject({ slug: "model-not-downloaded" });
  filesHere();
  expect(runtimeFeatureReadiness("parts.find", "vision")).toMatchObject({ ready: true });
  expect(await runVisionFeature("parts.find", async (inst) => `found with ${inst.id}`)).toBe("found with 1");
  expect(a.built[0].executionProvider).toBe("cpu");
  await svc.stopServer();
});
