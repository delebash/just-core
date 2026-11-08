// SPDX-License-Identifier: MIT
// Motion capture from the kit (just-mocap's plan, 2026-11-07, M3/M4): a tool runtime whose build is uv and whose setup
// makes the engine's Python environments (the RuntimeService `setup` hook); its models are pinned rows linked into the
// engine before a take; runMocap runs the engine's mocap.js through the spawn seam with the card booked; the routes keep
// takes as rows and folders and run them as jobs, one at a time. The engine and uv are stood in for.
import { EventEmitter } from "node:events";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, expect, test } from "vitest";
import { makeMocapRouter } from "../src/llm/mocap_api.js";
import * as seed from "../src/llm/seed.js";
import { JobRegistry } from "../src/platform/jobs.js";
import { createServer } from "../src/platform/server.js";
import { VramArbiter } from "../src/runner/arbiter.js";
import { runtimeVariantDir } from "../src/runner/binary.js";
import { DEFAULT_FFMPEG_BUILD, DEFAULT_MOCAP_BINARIES, DEFAULT_MOCAP_BUILD, MOCAP_MODELS, MOCAP_PROBE_ARGVS } from "../src/runner/config.js";
import { LIVE_MODELS, MOCAP_SETUP, mocapArgs, mocapEnv, mocapPaths, mocapReadiness, progressTracker, runEngineScript, runMocap, stepKey } from "../src/runner/mocap.js";
import { snapshotFilePath } from "../src/runner/models.js";
import { configureRuntimeServices, EngineBusyError, RuntimeService } from "../src/runner/runtime_service.js";
import { pinKey, runtimeOf } from "../src/runner/runtimes.js";
import { freshDb } from "./helpers.js";

let h;
let root;
beforeEach(() => {
  h = freshDb();
  root = mkdtempSync(path.join(tmpdir(), "kit-mocap-"));
});
afterEach(() => {
  configureRuntimeServices([]);
  rmSync(root, { recursive: true, force: true });
});

const WIN = () => ({ platform: "windows", arch: "x64", runtimes: { cuda: true }, hasNvidia: true, gpus: [{ vendor: "NVIDIA", computeCapability: "7.5", vramMb: 8192 }], ramMb: 32768 });
const SYS = () => ({ platform: "win32", arch: "x64", versions: {}, missingDlls: () => [] });
/** The routes as the app serves them: inside the kit's server, whose error handlers answer a refusal with its status. */
const serve = (router) => {
  const app = createServer({ typeBase: "t/" });
  app.route("/", router);
  return app;
};
const camel = (r) => ({ platform: r.platform, gpu: r.gpu, assetUrl: r.asset_url, assetBytes: r.asset_bytes, sha256: r.sha256, serverExe: r.server_exe, requires: r.requires ?? {}, assetUnpackedBytes: r.asset_unpacked_bytes, extras: [] });

/** A child the spawn seam hands back: `lines` printed on stdout (one each tick), then `code` (null: runs until killed). */
function fakeSpawn({ lines = [], code = 0, onStart = null } = {}) {
  const calls = [];
  const spawn = async (popen, argv, logPath) => {
    calls.push({ argv, logPath, popen });
    onStart?.(argv);
    const proc = new EventEmitter();
    proc.stdout = new EventEmitter();
    proc.stderr = new EventEmitter();
    proc.kill = () => setTimeout(() => proc.emit("close", 1), 0);
    (async () => {
      for (const l of lines) {
        await new Promise((r) => setTimeout(r, 1));
        proc.stdout.emit("data", Buffer.from(`${typeof l === "string" ? l : JSON.stringify(l)}\n`));
      }
      if (code !== null) setTimeout(() => proc.emit("close", code), 1);
    })();
    return [proc, null];
  };
  return { spawn, calls };
}

test("an app that turns mocap on gets its uv build row with the engine's extras, its pin, and no provider", () => {
  seed.configureAppSeed({ featureCatalog: [], featurePrompts: {}, enginePresets: [], featurePresets: {}, defaultPresetId: "", runtimes: ["mocap"], runtimeModels: MOCAP_MODELS });
  seed.seedLlm();
  expect(runtimeOf("mocap")).toMatchObject({ kind: "mocap", tool: true, label: "Motion capture" });
  const rows = h.all("select * from runtime_binary where runtime = 'mocap'");
  expect(rows.map((r) => [r.platform, r.gpu, r.server_exe])).toEqual([["windows", "cuda12", "uv.exe"]]);
  expect(JSON.parse(rows[0].extras).map((x) => x.into)).toEqual(["engine", "gemx", "comfyui", "yolox", "face", "pose", "hand"]);
  expect(h.get("runner_setting", pinKey("mocap")).value).toBe(DEFAULT_MOCAP_BUILD);
  expect(h.get("llm_providers", "local-mocap")).toBeNull();
  const models = h.all("select id, kind from runtime_model where runtime = 'mocap' order by position");
  expect(models).toEqual([
    { id: "gemx-body", kind: "mocap" },
    { id: "soma", kind: "mocap" },
    { id: "sam-3d-body", kind: "mocap" },
    { id: "rt-detr", kind: "mocap" },
  ]);
  // every pinned file names its place in the engine and a full SHA-256
  for (const m of MOCAP_MODELS) for (const f of m.files) expect([f.slot.startsWith("gemx:") || ["sam", "detr"].includes(f.slot), /^[0-9a-f]{64}$/.test(f.sha256)]).toEqual([true, true]);
  expect(MOCAP_PROBE_ARGVS).toEqual([["--version"]]);
  // each extra is pinned by SHA-256; the face model is one file kept as it is
  for (const x of DEFAULT_MOCAP_BINARIES[0].extras) expect(x.sha256).toMatch(/^[0-9a-f]{64}$/);
  expect(DEFAULT_MOCAP_BINARIES[0].extras.filter((x) => x.archive === "file").map((x) => x.file)).toEqual(["face_landmarker.task", "pose_landmarker_full.task", "hand_landmarker.task"]);
});

/** A mocap service on an NVIDIA Windows box; `setup` its setup (MOCAP_SETUP by default); the build "acquired" as uv.exe. */
function mocapService({ setup = MOCAP_SETUP, models = [], spawnSetup = null } = {}) {
  const svc = new RuntimeService({
    id: "mocap",
    cacheRoot: root,
    configFn: () => ({ id: "mocap", pinnedBuild: DEFAULT_MOCAP_BUILD, binaries: DEFAULT_MOCAP_BINARIES.map(camel), settings: {}, safetyMarginMb: 0 }),
    hardwareFn: WIN,
    systemFn: SYS,
    freeBytesFn: () => 1e12,
    modelsFn: () => models,
    setup: spawnSetup ? { ...setup, run: (o) => setup.run({ ...o, spawn: spawnSetup }) } : setup,
    acquire: async (cacheRoot, folder, build) => {
      const d = runtimeVariantDir(cacheRoot, folder, build, "cuda12");
      mkdirSync(d, { recursive: true });
      writeFileSync(path.join(d, "uv.exe"), "");
      return path.join(d, "uv.exe");
    },
  });
  return svc;
}

const settle = async (svc) => {
  for (let i = 0; i < 400 && svc.status().status === "installing"; i++) await new Promise((r) => setTimeout(r, 5));
  return svc.status();
};

test("the setup hook: the build counts as installed only once its setup says the engine is whole", async () => {
  let whole = false;
  const runs = [];
  const setup = {
    done: () => whole,
    run: async (o) => {
      runs.push(o);
      o.onStep("Setting up: main packages");
      whole = true;
    },
  };
  const svc = mocapService({ setup });
  expect(svc.status()).toMatchObject({ installed: false });
  svc.install();
  expect(await settle(svc)).toMatchObject({ status: "installed", installed: true });
  expect(runs).toHaveLength(1);
  expect(runs[0].exe).toMatch(/uv\.exe$/);
  expect(runs[0].dir).toBe(runtimeVariantDir(root, "mocap", DEFAULT_MOCAP_BUILD, "cuda12"));
  expect(runs[0].extrasDir).toBe(path.join(runs[0].dir, "_extras"));
  // the cache the runtime keeps across its builds, beside them
  expect(runs[0].cacheDir).toBe(path.join(root, "mocap", "_cache"));
  expect(svc.buildPlace()).toEqual({ dir: runs[0].dir, extrasDir: runs[0].extrasDir, cacheDir: runs[0].cacheDir });
  // a setup that is whole isn't run again by a second install
  svc.install();
  await settle(svc);
  expect(runs).toHaveLength(1);
  // the engine found broken (done says no): not installed, and Install sets it up again
  whole = false;
  expect(svc.installedExe()).toBeNull();
  expect(svc.status().installed).toBe(false);
  svc.install();
  expect(await settle(svc)).toMatchObject({ installed: true });
  expect(runs).toHaveLength(2);
});

test("a setup that fails, or ends without a whole engine, leaves the build not installed with the reason", async () => {
  const failing = mocapService({ setup: { done: () => false, run: async () => Promise.reject(new Error("main packages failed: no network")) } });
  failing.install();
  expect(await settle(failing)).toMatchObject({ status: "error", installed: false, error: "main packages failed: no network" });
  const half = mocapService({ setup: { done: () => false, run: async () => {} } });
  half.install();
  expect(await settle(half)).toMatchObject({ status: "error", installed: false, error: "Motion capture's setup ended without a whole engine" });
});

test("MOCAP_SETUP puts GEM-X's config and person detector in place, then runs the engine's setup.js with uv", async () => {
  const dir = runtimeVariantDir(root, "mocap", DEFAULT_MOCAP_BUILD, "cuda12");
  const extrasDir = path.join(dir, "_extras");
  const p = mocapPaths({ dir, extrasDir });
  mkdirSync(path.join(p.engine, "engine", "gemx"), { recursive: true });
  writeFileSync(path.join(p.engine, "engine", "gemx", "body_video_native77_static.yaml"), "camera:\n  mode: static\n");
  mkdirSync(path.dirname(p.yolox), { recursive: true });
  writeFileSync(p.yolox, "onnx");
  // the Live tab's models, as the build's extras leave them
  for (const [folder, file] of Object.values(LIVE_MODELS)) {
    mkdirSync(path.join(extrasDir, folder), { recursive: true });
    writeFileSync(path.join(extrasDir, folder, file), "task");
  }
  // the engine's setup.js stood in for: it makes the two Pythons and ready.json, and says its steps
  const { spawn, calls } = fakeSpawn({
    lines: [{ step: "Python 3.12.9" }, { step: "main packages" }, { done: { main: p.python, face: p.facePython } }],
    onStart: () => {
      for (const f of [p.python, p.facePython, path.join(p.envRoot, "ready.json")]) {
        mkdirSync(path.dirname(f), { recursive: true });
        writeFileSync(f, "");
      }
    },
  });
  const steps = [];
  expect(MOCAP_SETUP.done({ dir, extrasDir })).toBe(false);
  await MOCAP_SETUP.run({ exe: path.join(dir, "uv.exe"), dir, extrasDir, cacheDir: path.join(root, "mocap", "_cache"), onStep: (s) => steps.push(s), spawn });
  expect(readFileSync(path.join(p.weights, "body_video_native77_static.yaml"), "utf8")).toContain("mode: static");
  expect(readFileSync(path.join(p.weights, "yolox_humanart.onnx"), "utf8")).toBe("onnx");
  const argv = calls[0].argv;
  expect(argv[0]).toBe(process.execPath); // the app's own executable as Node
  expect(argv.slice(1)).toEqual([path.join(p.engine, "engine", "setup.js"), "--uv", path.join(dir, "uv.exe"), "--root", p.envRoot, "--gemx", p.gemx, "--cache", path.join(root, "mocap", "_cache", "uv")]);
  expect(calls[0].logPath).toBe(path.join(dir, "setup.log"));
  expect(steps).toEqual(["Setting up the engine's Python", "Setting up: Python 3.12.9", "Setting up: main packages"]);
  expect(MOCAP_SETUP.done({ dir, extrasDir })).toBe(true);
});

test("runEngineScript: the done line's value; an error line or a bad exit rejects with it; a Cancel stops the child", async () => {
  const ok = fakeSpawn({ lines: ["a tool's own words", { step: "x" }, { done: { take: "t" } }] });
  const seen = [];
  await expect(runEngineScript(["node", "s.js"], { cwd: root, env: {}, logPath: null, onLine: (r) => seen.push(r), spawn: ok.spawn })).resolves.toEqual({ take: "t" });
  expect(seen).toEqual([{ step: "x" }]);
  const bad = fakeSpawn({ lines: [{ error: "GEM-X body failed:\nout of memory" }], code: 1 });
  await expect(runEngineScript(["node", "s.js"], { cwd: root, env: {}, logPath: null, spawn: bad.spawn })).rejects.toThrow(/out of memory/);
  const silent = fakeSpawn({ lines: ["Traceback: boom"], code: 3 });
  await expect(runEngineScript(["node", "s.js"], { cwd: root, env: {}, logPath: null, spawn: silent.spawn })).rejects.toThrow(/exit 3.*Traceback: boom/);
  const ctl = new AbortController();
  const forever = fakeSpawn({ lines: [], code: null });
  const run = runEngineScript(["node", "s.js"], { cwd: root, env: {}, logPath: null, signal: ctl.signal, spawn: forever.spawn });
  setTimeout(() => ctl.abort(), 5);
  await expect(run).rejects.toMatchObject({ name: "AbortError" });
});

test("the progress bar moves by each step's measured share; SAM 3D Body's share splits over its pieces", () => {
  expect(stepKey("piece p01, frames 300-599")).toBe("SAM 3D Body");
  expect(stepKey("SAM 3D Body p01")).toBe("SAM 3D Body");
  expect(stepKey("foot correction, edited contacts")).toBe("foot correction");
  const track = progressTracker();
  const a = track({ step: "30 fps copy", seconds: 1 });
  const b = track({ step: "GEM-X body", seconds: 140 });
  track({ pieces: 2 });
  const c = track({ step: "piece p00, frames 0-299" });
  const d = track({ step: "SAM 3D Body p00" });
  expect(track({ note: "a lens line" })).toBeNull();
  expect([a.fraction < b.fraction, b.fraction < c.fraction, c.fraction < d.fraction]).toEqual([true, true, true]);
  // a step skipped (already there) still moves the bar, and says so
  expect(track({ step: "head points", skipped: true }).message).toBe("head points: already done");
  const end = track({ step: "preview" });
  expect(end.fraction).toBeLessThan(1);
});

test("mocapArgs: the screen's choices on the engine's command line; the lens given twice is refused", () => {
  const args = mocapArgs("E:/eng", "E:/t/source.mp4", "E:/t", { smoothing: "strong", fov: 78, unevenGround: true, armFit: false, rangesFile: "E:/t/c.json" });
  expect(args).toEqual([path.join("E:/eng", "bench", "mocap.js"), "E:/t/source.mp4", "strong", "--out", "E:/t", "--json", "--fov", "78", "--uneven-ground", "--no-arm-fit", "--ranges", "E:/t/c.json"]);
  expect(mocapArgs("E:/eng", "v", "o")).toEqual([path.join("E:/eng", "bench", "mocap.js"), "v", "default", "--out", "o", "--json"]);
  // the part of the video, a turning camera, the person picked, the files in place with an A-pose rest
  expect(mocapArgs("E:/eng", "v", "o", { start: 12.5, duration: 30, turningCamera: true, person: [0.25, 0.5], inPlace: true, rest: "a" }).slice(6)).toEqual([
    "--start", "12.5", "--duration", "30", "--turning-camera", "--person", "0.2500,0.5000", "--in-place", "--rest", "a",
  ]);
  expect(() => mocapArgs("E:/eng", "v", "o", { focal35: 26, fov: 78 })).toThrow(/not both/);
});

/** An installed mocap build with its environments (stand-ins), the given models downloaded, and the kit's FFmpeg. */
function readyMocap() {
  const model = { runtime: "mocap", id: "m", name: "Test model", kind: "mocap", files: [
    { slot: "gemx:weights/w.ckpt", repo: "o/r", revision: "abc", path: "w.ckpt", bytes: 3, sha256: "a".repeat(64) },
    { slot: "sam", repo: "o/s", revision: "abc", path: "detection/s.safetensors", bytes: 2, sha256: "b".repeat(64) },
  ] };
  for (const f of model.files) {
    const at = snapshotFilePath(path.join(root, "hf"), f.repo, f.revision, f.path);
    mkdirSync(path.dirname(at), { recursive: true });
    writeFileSync(at, "x".repeat(f.bytes));
  }
  const setup = { done: () => true, run: async () => {} };
  const svc = mocapService({ setup, models: [model] });
  const dir = runtimeVariantDir(root, "mocap", DEFAULT_MOCAP_BUILD, "cuda12");
  mkdirSync(dir, { recursive: true });
  writeFileSync(path.join(dir, "uv.exe"), "");
  const ffDir = runtimeVariantDir(root, "ffmpeg", DEFAULT_FFMPEG_BUILD, "cpu");
  mkdirSync(ffDir, { recursive: true });
  writeFileSync(path.join(ffDir, "ffmpeg.exe"), "");
  writeFileSync(path.join(ffDir, "ffprobe.exe"), "");
  const ff = new RuntimeService({
    id: "ffmpeg",
    cacheRoot: root,
    configFn: () => ({ pinnedBuild: DEFAULT_FFMPEG_BUILD, binaries: [{ platform: "windows", gpu: "cpu", assetUrl: "https://x/f.zip", serverExe: "ffmpeg.exe", requires: {} }], settings: { path: "" } }),
    hardwareFn: WIN,
    systemFn: SYS,
  });
  configureRuntimeServices([["mocap", svc], ["ffmpeg", ff]]);
  return { svc, dir, model };
}

test("mocapReadiness says what is missing: the runtime, its install, its models, FFmpeg", () => {
  expect(mocapReadiness()).toMatchObject({ ready: false, need: "engine-not-on" });
  configureRuntimeServices([["mocap", mocapService({ setup: { done: () => false, run: async () => {} } })]]);
  expect(mocapReadiness()).toMatchObject({ ready: false, need: "engine-not-installed", runtime: "mocap", engine: { label: "Motion capture" } });
  const { svc } = readyMocap();
  expect(mocapReadiness()).toMatchObject({ ready: true, need: "" });
  // a model not downloaded is named
  rmSync(path.join(root, "hf", "models--o--s"), { recursive: true, force: true });
  expect(mocapReadiness()).toMatchObject({ ready: false, need: "model-not-downloaded", runtime: "mocap", model: "m", modelState: { id: "m", onDisk: false }, models: ["Test model"] });
  expect(svc).toBeTruthy();
  // FFmpeg missing: the banner offers FFmpeg's install
  configureRuntimeServices([["mocap", svc]]);
  const back = snapshotFilePath(path.join(root, "hf"), "o/s", "abc", "detection/s.safetensors");
  mkdirSync(path.dirname(back), { recursive: true });
  writeFileSync(back, "xx");
  expect(mocapReadiness()).toMatchObject({ ready: false, need: "engine-not-on", runtime: "ffmpeg" });
});

test("a computer with no build for mocap (no NVIDIA card) hears why before anything downloads", () => {
  const svc = new RuntimeService({
    id: "mocap",
    cacheRoot: root,
    configFn: () => ({ id: "mocap", pinnedBuild: DEFAULT_MOCAP_BUILD, binaries: DEFAULT_MOCAP_BINARIES.map(camel), settings: {} }),
    hardwareFn: () => ({ platform: "windows", arch: "x64", runtimes: {}, gpus: [] }),
    systemFn: SYS,
    setup: MOCAP_SETUP,
  });
  configureRuntimeServices([["mocap", svc]]);
  expect(mocapReadiness()).toMatchObject({ ready: false, need: "engine-cant-run-here", engine: { need: { reason: "no-build" } } });
});

test("runMocap: the engine's mocap.js with the install's paths, its models linked in, the card booked while it runs", async () => {
  const { dir } = readyMocap();
  const arb = new VramArbiter(() => WIN());
  arb._maxVramMb = async () => 8192;
  arb.remainingMb = async () => 8192;
  let bookedDuring = null;
  const { spawn, calls } = fakeSpawn({
    lines: [{ step: "30 fps copy", seconds: 1 }, { step: "GEM-X body", seconds: 140 }, { done: { take: "t", bvh: "t/x.bvh" } }],
    onStart: () => {
      bookedDuring = { reserved: arb.isReserved("mocap:mocap"), busy: arb.busyKinds().has("mocap") };
    },
  });
  const out = path.join(root, "takes", "t1");
  const progress = [];
  const files = await runMocap(path.join(root, "v.mp4"), out, { fov: 78, ranges: [[[0, 10]], []] }, { spawn, arbiter: () => arb, onProgress: (f, m) => progress.push([f, m]) });
  expect(files).toEqual({ take: "t", bvh: "t/x.bvh" });
  expect(bookedDuring).toEqual({ reserved: true, busy: true });
  expect([arb.isReserved("mocap:mocap"), arb.busyKinds().has("mocap")]).toEqual([false, false]);
  const p = mocapPaths({ dir, extrasDir: path.join(dir, "_extras") });
  // the model file linked where its slot says; the ComfyUI one passed by path
  expect(readFileSync(path.join(p.gemx, "weights", "w.ckpt"), "utf8")).toBe("xxx");
  const { argv, logPath } = calls[0];
  expect(argv[0]).toBe(process.execPath);
  expect(argv.slice(1, 5)).toEqual([path.join(p.engine, "bench", "mocap.js"), path.join(root, "v.mp4"), "default", "--out"]);
  expect(argv.slice(argv.indexOf("--fov"), argv.indexOf("--fov") + 2)).toEqual(["--fov", "78"]);
  expect(argv).toContain("--ranges");
  expect(JSON.parse(readFileSync(path.join(out, "contacts_edited.json"), "utf8"))).toEqual([[[0, 10]], []]);
  expect(logPath).toBe(path.join(out, "run.log"));
  expect(progress.map(([, m]) => m)).toEqual(["30 fps copy", "GEM-X body"]);
});

test("mocapEnv: every tool the engine reads comes from the install and the kit's FFmpeg; no Blender", () => {
  const p = mocapPaths({ dir: "D:/b", extrasDir: "D:/b/_extras" });
  const env = mocapEnv(p, { exe: "D:/ff/ffmpeg.exe", ffprobe: "D:/ff/ffprobe.exe" }, "127.0.0.1:8200", "D:/takes/t1", { sam: "D:/hf/s.safetensors", detr: "D:/hf/d.safetensors" });
  expect(env).toMatchObject({
    ELECTRON_RUN_AS_NODE: "1",
    JUST_MOCAP_GEMX: p.gemx,
    JUST_MOCAP_PYTHON: p.python,
    JUST_MOCAP_TOOLS_PYTHON: p.facePython,
    JUST_MOCAP_BLENDER: "",
    JUST_MOCAP_FFMPEG: "D:/ff/ffmpeg.exe",
    JUST_MOCAP_FFPROBE: "D:/ff/ffprobe.exe",
    JUST_MOCAP_COMFY: "127.0.0.1:8200",
    JUST_MOCAP_COMFY_MAIN: p.comfyMain,
    JUST_MOCAP_COMFY_OUT: path.join("D:/takes/t1", "sam-work"),
    JUST_MOCAP_SAM_MODEL: "D:/hf/s.safetensors",
    JUST_MOCAP_DETR_MODEL: "D:/hf/d.safetensors",
    JUST_MOCAP_FACE_MODEL: p.face,
    JUST_MOCAP_CACHE: p.cache,
  });
  expect(env.PATH.split(path.delimiter)[0]).toBe(path.dirname("D:/ff/ffmpeg.exe"));
});

test("runMocap refuses while another take holds the card, and when the card can't be freed", async () => {
  readyMocap();
  const arb = new VramArbiter(() => WIN());
  arb.reserve("mocap:mocap", 6600, { kind: "mocap" });
  await expect(runMocap("v.mp4", path.join(root, "o"), {}, { spawn: fakeSpawn().spawn, arbiter: () => arb })).rejects.toBeInstanceOf(EngineBusyError);
  const full = new VramArbiter(() => WIN());
  full.makeRoom = async () => false;
  await expect(runMocap("v.mp4", path.join(root, "o"), {}, { spawn: fakeSpawn().spawn, arbiter: () => full })).rejects.toBeInstanceOf(EngineBusyError);
  expect(full.busyKinds().has("mocap")).toBe(false);
});

test("the routes: a video becomes a take, runs as a job, its contacts re-apply, its files download, it deletes", async () => {
  readyMocap();
  const takesDir = path.join(root, "takes");
  const runs = [];
  const run = async (source, folder, options, { onProgress }) => {
    runs.push({ source, folder, options });
    onProgress(0.5, "GEM-X body");
    writeFileSync(path.join(folder, "gem.pt"), "pt");
    writeFileSync(path.join(folder, "contacts.json"), JSON.stringify({ fps: 30, frames: 10, automatic: [[[0, 5]], []], applied: [[[0, 5]], []] }));
    writeFileSync(path.join(folder, "t.bvh"), "HIERARCHY");
    return { take: folder, bvh: path.join(folder, "t.bvh") };
  };
  const jobs = new JobRegistry();
  const app = serve(makeMocapRouter(jobs, { takesDir, run }));
  const form = new FormData();
  form.append("file", new Blob([Buffer.from("video bytes")]), "walk.mp4");
  const made = await app.request("/v1/mocap/takes?name=walk.mp4", { method: "POST", body: form });
  expect(made.status).toBe(201);
  const take = await made.json();
  expect(take).toMatchObject({ name: "walk", sourceName: "walk.mp4", state: "new", options: { smoothing: "default", armFit: true, unevenGround: false } });
  expect(readFileSync(path.join(takesDir, take.id, "source.mp4"), "utf8")).toBe("video bytes");
  // not a video: refused, nothing kept
  const notVideo = new FormData();
  notVideo.append("file", new Blob([Buffer.from("x")]), "notes.txt");
  expect((await app.request("/v1/mocap/takes?name=notes.txt", { method: "POST", body: notVideo })).status).toBe(422);

  const patched = await (await app.request(`/v1/mocap/takes/${take.id}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ name: "Walk 1", options: { fov: 78 } }) })).json();
  expect(patched).toMatchObject({ name: "Walk 1", options: { fov: 78, smoothing: "default" } });

  const started = await app.request(`/v1/mocap/takes/${take.id}/run`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({}) });
  expect(started.status).toBe(202);
  const job = await started.json();
  expect(job).toMatchObject({ kind: "mocap", key: take.id, state: "running" });
  await jobs.jobs.get(job.id).settled;
  expect(jobs.get(job.id)).toMatchObject({ state: "done" });
  expect(runs[0]).toMatchObject({ source: path.join(takesDir, take.id, "source.mp4"), folder: path.join(takesDir, take.id), options: { fov: 78 } });
  const list = await (await app.request("/v1/mocap/takes")).json();
  expect(list.takes[0]).toMatchObject({ id: take.id, state: "done", files: ["bvh"], job: null });

  const contacts = await (await app.request(`/v1/mocap/takes/${take.id}/contacts`)).json();
  expect(contacts.applied).toEqual([[[0, 5]], []]);
  const bad = await app.request(`/v1/mocap/takes/${take.id}/contacts`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ ranges: [[[5, 2]], []] }) });
  expect(bad.status).toBe(422);
  const re = await (await app.request(`/v1/mocap/takes/${take.id}/contacts`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ ranges: [[[0, 8]], [[2, 4]]] }) })).json();
  await jobs.jobs.get(re.id).settled;
  expect(runs[1].options.ranges).toEqual([[[0, 8]], [[2, 4]]]);

  const bvh = await app.request(`/v1/mocap/takes/${take.id}/files/bvh`);
  expect([bvh.status, await bvh.text()]).toEqual([200, "HIERARCHY"]);
  const part = await app.request(`/v1/mocap/takes/${take.id}/files/bvh`, { headers: { range: "bytes=0-3" } });
  expect([part.status, await part.text()]).toEqual([206, "HIER"]);
  expect((await app.request(`/v1/mocap/takes/${take.id}/files/fbx`)).status).toBe(404);
  const source = await app.request(`/v1/mocap/takes/${take.id}/files/source`);
  expect([source.status, await source.text()]).toEqual([200, "video bytes"]);

  // from the start: everything but the video goes first
  const fresh = await (await app.request(`/v1/mocap/takes/${take.id}/run`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ fresh: true }) })).json();
  await jobs.jobs.get(fresh.id).settled;
  expect(existsSync(path.join(takesDir, take.id, "source.mp4"))).toBe(true);

  expect((await app.request(`/v1/mocap/takes/${take.id}`, { method: "DELETE" })).status).toBe(204);
  expect(existsSync(path.join(takesDir, take.id))).toBe(false);
  expect((await (await app.request("/v1/mocap/takes")).json()).takes).toEqual([]);
});

test("a take that fails says why on its row; the routes refuse a run while mocap isn't ready", async () => {
  readyMocap();
  const takesDir = path.join(root, "takes");
  const jobs = new JobRegistry();
  const app = serve(makeMocapRouter(jobs, { takesDir, run: async () => Promise.reject(new Error("GEM-X body failed: out of memory")) }));
  const form = new FormData();
  form.append("file", new Blob([Buffer.from("v")]), "a.mov");
  const take = await (await app.request("/v1/mocap/takes?name=a.mov", { method: "POST", body: form })).json();
  const job = await (await app.request(`/v1/mocap/takes/${take.id}/run`, { method: "POST", headers: { "content-type": "application/json" }, body: "{}" })).json();
  await jobs.jobs.get(job.id).settled;
  expect(jobs.get(job.id)).toMatchObject({ state: "error", error: { message: "GEM-X body failed: out of memory", title: "The take failed" } });
  const row = (await (await app.request("/v1/mocap/takes")).json()).takes[0];
  expect(row).toMatchObject({ state: "failed", error: "GEM-X body failed: out of memory" });
  configureRuntimeServices([]);
  const refused = await app.request(`/v1/mocap/takes/${take.id}/run`, { method: "POST", headers: { "content-type": "application/json" }, body: "{}" });
  // the problem's type is the server's type base and the refusal's slug (platform/errors.js)
  expect([refused.status, (await refused.json()).type]).toEqual([409, "t/engine-not-on"]);
});

test("the OSC relay: one frame's messages arrive as one bundle, floats, ints and strings as sent", async () => {
  const { Server } = await import("node-osc");
  const { LiveSender, oscArgs } = await import("../src/runner/mocap_live.js");
  expect(oscArgs([1, { i: 1 }, "Hips", 0.5])).toEqual([{ type: "float", value: 1 }, { type: "integer", value: 1 }, "Hips", { type: "float", value: 0.5 }]);
  const port = 39000 + Math.floor(Math.random() * 1000);
  const server = new Server(port, "127.0.0.1");
  await new Promise((r) => server.once("listening", r));
  const got = new Promise((r) => server.once("bundle", r));
  const sender = new LiveSender({ idleMs: 50 });
  const jobs = new JobRegistry();
  const app = serve(makeMocapRouter(jobs, { takesDir: path.join(root, "takes"), sender }));
  const sent = await app.request("/v1/mocap/live/send", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ host: "127.0.0.1", port, messages: [["/VMC/Ext/OK", { i: 1 }], ["/VMC/Ext/Bone/Pos", "Hips", 0, 1, 0, 0, 0, 0, 1]] }),
  });
  expect(sent.status).toBe(204);
  const bundle = await got;
  const [ok, bone] = bundle.elements;
  expect(ok).toEqual(["/VMC/Ext/OK", 1]);
  expect(bone[0]).toBe("/VMC/Ext/Bone/Pos");
  expect(bone.slice(1)).toEqual(["Hips", 0, 1, 0, 0, 0, 0, 1]);
  // not an OSC address: refused before anything is sent
  const bad = await app.request("/v1/mocap/live/send", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ host: "127.0.0.1", port, messages: [["nope", 1]] }) });
  expect(bad.status).toBe(422);
  await sender.closeAll();
  await new Promise((r) => server.close(r));
});

test("the Live tab's models come from the install, and only once it is there", async () => {
  const jobs = new JobRegistry();
  const app = serve(makeMocapRouter(jobs, { takesDir: path.join(root, "takes") }));
  configureRuntimeServices([["mocap", mocapService({ setup: { done: () => false, run: async () => {} } })]]);
  expect((await app.request("/v1/mocap/live/models/pose")).status).toBe(409);
  const { svc } = readyMocap();
  const [folder, file] = LIVE_MODELS.pose;
  mkdirSync(path.join(svc.buildPlace().extrasDir, folder), { recursive: true });
  writeFileSync(path.join(svc.buildPlace().extrasDir, folder, file), "pose task");
  const got = await app.request("/v1/mocap/live/models/pose");
  expect([got.status, await got.text()]).toEqual([200, "pose task"]);
  expect((await app.request("/v1/mocap/live/models/other")).status).toBe(422);
});
