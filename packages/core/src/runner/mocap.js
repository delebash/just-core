// SPDX-License-Identifier: MIT
// The motion-capture engine (just-mocap, github.com/delebash/just-mocap — the user's plan of 2026-11-07: mocap is one
// screen in JustDirect, the engine "a separate Python program that the kit installs, starts, books the card for and
// runs, like audio.cpp"; just-mocap docs/plans/2026-11-07-non-commercial-option.md, "M3 build design"):
//  - its build (runtimes.js `mocap`, config.js DEFAULT_MOCAP_BINARIES) is Astral's uv; its extras are the engine's
//    source (just-mocap at a pinned commit), GEM-X's and ComfyUI's sources, YOLOX's person detector and MediaPipe's
//    face model — each pinned by SHA-256;
//  - MOCAP_SETUP makes the engine's two Python environments with that uv, by the engine's own `engine/setup.js`
//    (a pinned CPython, hash-locked package lists), and puts GEM-X's config and person detector where GEM-X reads them;
//  - its models are runtime_model rows (config.js MOCAP_MODELS), each file's `slot` its place in the engine —
//    `gemx:<path>` inside GEM-X's folder (linked there before a run), `sam` and `detr` the two ComfyUI models;
//  - runMocap runs one take, the engine's `bench/mocap.js`, through the kit's spawn seam (the kill-on-close job: a
//    Cancel stops GEM-X and ComfyUI with it), FFmpeg the kit's own (runner/ffmpeg.js), the card booked for the job.
import { existsSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";
import { ApiError } from "../platform/errors.js";
import { getLogger } from "../platform/log.js";
import * as procs from "../platform/procs.js";
import { getArbiter } from "./arbiter.js";
import { ffmpegExe } from "./ffmpeg.js";
import * as hardware from "./hardware.js";
import { linkSnapshot } from "./models.js";
import * as processMod from "./process.js";
import { EngineBusyError, getRuntimeService } from "./runtime_service.js";
import { runtimeOf } from "./runtimes.js";

const log = getLogger("llm_runner.runner.mocap");

/** The extras' folders (config.js DEFAULT_MOCAP_BINARIES `into`) and where the engine's pieces are inside them. */
export const MOCAP_PARTS = Object.freeze({ engine: "engine", gemx: "gemx", comfy: "comfyui", yolox: "yolox", face: "face" });
// GEM-X's video config the engine ships (GEM-X's own with the camera static, as measured) and the file GEM-X reads it as
const GEMX_CONFIG = "body_video_native77_static.yaml";
const ENV = "_env";
const exeIn = (dir) => path.join(dir, process.platform === "win32" ? path.join("Scripts", "python.exe") : path.join("bin", "python"));

/** Where everything of an installed build is: `{dir, extrasDir}` (RuntimeService.buildPlace) → the engine's paths. */
export function mocapPaths({ dir, extrasDir }) {
  const gemx = path.join(extrasDir, MOCAP_PARTS.gemx);
  return {
    engine: path.join(extrasDir, MOCAP_PARTS.engine),
    gemx,
    weights: path.join(gemx, "weights"),
    comfyMain: path.join(extrasDir, MOCAP_PARTS.comfy, "main.py"),
    yolox: path.join(extrasDir, MOCAP_PARTS.yolox, "end2end.onnx"),
    face: path.join(extrasDir, MOCAP_PARTS.face, "face_landmarker.task"),
    envRoot: path.join(dir, ENV),
    python: exeIn(path.join(dir, ENV, "main")),
    facePython: exeIn(path.join(dir, ENV, "face")),
    cache: path.join(dir, "cache"),
  };
}

/** A program run as Node: the app's own executable (Electron's, as Node) — never a Node of the user's PATH. */
const nodeArgv = (script, args) => [process.execPath, script, ...args];
const nodeEnv = (extra = {}) => ({ ...process.env, ELECTRON_RUN_AS_NODE: "1", ...extra });

/**
 * Run a Node script of the engine that prints one JSON object per line, through the kit's spawn seam: `onLine(record)`
 * per line, its whole output appended to `logPath`. Resolves the `{done}` line's value; rejects with its `{error}`
 * line, or its last output when it exits otherwise; a Cancel (`signal`, or `cancelCheck()` turning true) stops it and
 * everything it started (the kill-on-close job) and rejects with an AbortError.
 */
export async function runEngineScript(argv, { cwd, env, logPath, onLine = () => {}, signal = null, cancelCheck = null, spawn = processMod.spawnChild }) {
  signal?.throwIfAborted();
  if (logPath) mkdirSync(path.dirname(logPath), { recursive: true });
  const [proc, job] = await spawn((a, o) => procs.popen(a, { ...o, cwd, env }), argv, logPath);
  return new Promise((resolve, reject) => {
    let done = null;
    let error = null;
    let rest = "";
    let tail = [];
    let finished = false;
    const end = (fn) => {
      if (finished) return;
      finished = true;
      clearInterval(poll);
      signal?.removeEventListener("abort", stop);
      processMod.closeJob(job);
      fn();
    };
    const stop = () => {
      try {
        proc.kill();
      } catch {
        // gone already
      }
      end(() => reject(Object.assign(new Error("stopped"), { name: "AbortError" })));
    };
    const poll = cancelCheck ? setInterval(() => cancelCheck() && stop(), 500) : null;
    signal?.addEventListener("abort", stop, { once: true });
    proc.stdout?.on("data", (chunk) => {
      const lines = (rest + chunk.toString("utf8")).split(/\r?\n/);
      rest = lines.pop();
      for (const line of lines) {
        if (!line.trim()) continue;
        tail = [...tail.slice(-7), line];
        let record = null;
        try {
          record = JSON.parse(line);
        } catch {
          continue; // a tool's own line, kept in the log
        }
        if (record?.done !== undefined) done = record.done;
        else if (record?.error !== undefined) error = String(record.error);
        else onLine(record);
      }
    });
    proc.stderr?.on("data", (chunk) => {
      tail = [...tail, ...chunk.toString("utf8").split(/\r?\n/).filter(Boolean)].slice(-8);
    });
    proc.once("error", (e) => end(() => reject(e)));
    proc.once("close", (code) => {
      end(() => {
        if (error) reject(new Error(error));
        else if (code === 0 && done !== null) resolve(done);
        else reject(new Error(`the engine stopped (exit ${code}): ${tail.slice(-4).join(" · ") || "no output"}`));
      });
    });
  });
}

/** The mocap build's setup (RuntimeService `setup`): its Python environments and GEM-X's two files in place. */
export const MOCAP_SETUP = Object.freeze({
  done(place) {
    const p = mocapPaths(place);
    return (
      existsSync(path.join(p.envRoot, "ready.json")) &&
      existsSync(p.python) &&
      existsSync(p.facePython) &&
      existsSync(path.join(p.weights, GEMX_CONFIG)) &&
      existsSync(path.join(p.weights, "yolox_humanart.onnx"))
    );
  },
  async run({ exe, dir, extrasDir, onStep = () => {}, cancelCheck = null, spawn = processMod.spawnChild }) {
    const p = mocapPaths({ dir, extrasDir });
    // GEM-X reads its config and person detector from its weights folder (its docs/PRETRAINED_MODELS.md)
    mkdirSync(p.weights, { recursive: true });
    writeFileSync(path.join(p.weights, GEMX_CONFIG), readFileSync(path.join(p.engine, "engine", "gemx", GEMX_CONFIG)));
    const detector = path.join(p.weights, "yolox_humanart.onnx");
    if (!existsSync(detector)) linkSnapshot(p.yolox, detector);
    onStep("Setting up the engine's Python");
    await runEngineScript(nodeArgv(path.join(p.engine, "engine", "setup.js"), ["--uv", exe, "--root", p.envRoot, "--gemx", p.gemx]), {
      cwd: p.engine,
      env: nodeEnv(),
      logPath: path.join(dir, "setup.log"),
      onLine: (r) => r?.step && onStep(`Setting up: ${r.step}`),
      cancelCheck,
      spawn,
    });
  },
});

/** The mocap runtime's model rows that aren't all downloaded yet (their names), from its service. */
function missingModels(svc) {
  return svc
    .modelsStatus()
    .filter((m) => !m.onDisk)
    .map((m) => m.name);
}

/** What a take needs before it can run: `{ready, need, detail, engine, models}` — `need` "engine-not-on" (the app
 *  didn't turn the runtime on), "engine-not-installed", "models-missing" (with their names), "ffmpeg-missing", or "". */
export function mocapReadiness() {
  const svc = getRuntimeService("mocap");
  if (!svc) return { ready: false, need: "engine-not-on", detail: "This app has no motion capture", engine: null, models: [] };
  const engine = svc.status();
  if (!svc.installedExe()) return { ready: false, need: "engine-not-installed", detail: "Install Motion capture on the AI page", engine, models: [] };
  const models = missingModels(svc);
  if (models.length) return { ready: false, need: "models-missing", detail: `Download ${models.join(", ")} on the AI page's Motion capture tab`, engine, models };
  if (!ffmpegExe()?.ffprobe) return { ready: false, need: "ffmpeg-missing", detail: "Install FFmpeg on the AI page — the takes' video is read with it", engine, models: [] };
  return { ready: true, need: "", detail: "", engine, models: [] };
}

// Each step's share of a run, from one measured take (just-mocap tmp/mocap_guitar.log: 151 frames, 1280x720, RTX 2070
// SUPER; seconds per step) — only the progress bar's shape; "start ComfyUI" and "arm fit" weren't in that run.
const STEP_SECONDS = Object.freeze({
  "30 fps copy": 1,
  "GEM-X body": 147,
  "foot correction": 6,
  "GEM-X's person boxes": 2,
  "start ComfyUI": 20,
  "SAM 3D Body": 69,
  "join SAM 3D Body pieces": 2,
  "head points": 7,
  face: 3,
  "arm fit": 10,
  "join fingers": 47,
  export: 8,
  preview: 8,
});
const TOTAL_SECONDS = Object.values(STEP_SECONDS).reduce((a, b) => a + b, 0);

/** The step a progress line names, as STEP_SECONDS keys it ("piece p01, …" and "SAM 3D Body p01" are SAM's share). */
export function stepKey(label) {
  const s = String(label ?? "");
  if (/^piece p\d+|^SAM 3D Body p\d+/.test(s)) return "SAM 3D Body";
  if (s.startsWith("foot correction")) return "foot correction";
  return s;
}

/** A run's progress from its lines: `line(record)` → `{fraction, message}` or null (a line that moves nothing). */
export function progressTracker() {
  let done = 0;
  let pieces = 1;
  const seen = new Set();
  return (r) => {
    if (r?.pieces) pieces = Math.max(1, Number(r.pieces));
    if (!r?.step) return null;
    const key = stepKey(r.step);
    const share = STEP_SECONDS[key] ?? 0;
    // a piece of SAM 3D Body is split in two lines (cut, then run); each is half of its piece's share
    if (key === "SAM 3D Body") done += share / pieces / 2;
    else if (!seen.has(key)) {
      seen.add(key);
      done += share;
    }
    return { fraction: Math.min(0.99, done / TOTAL_SECONDS), message: r.skipped ? `${r.step}: already done` : String(r.step) };
  };
}

/** The engine's command line for one take: `video` its source, `out` its folder; `options` the screen's choices. */
export function mocapArgs(engine, video, out, { smoothing = "default", focal35 = null, fov = null, unevenGround = false, armFit = true, rangesFile = null } = {}) {
  const args = [path.join(engine, "bench", "mocap.js"), String(video), String(smoothing), "--out", String(out), "--json"];
  if (focal35 != null && fov != null) throw new ApiError(422, "lens-twice", "Give the lens once", "Give the 35 mm equivalent or the field of view, not both");
  if (focal35 != null) args.push("--focal35", String(focal35));
  if (fov != null) args.push("--fov", String(fov));
  if (unevenGround) args.push("--uneven-ground");
  if (!armFit) args.push("--no-arm-fit");
  if (rangesFile) args.push("--ranges", String(rangesFile));
  return args;
}

/** The environment the engine's mocap.js reads its tools from (its JUST_MOCAP_* variables): `p` the install's paths
 *  (mocapPaths), `ff` the app's FFmpeg (ffmpegExe), `comfyAt` the host:port its own ComfyUI listens on, `out` the take's
 *  folder, `comfy` the ComfyUI models' files by slot. Blender is named empty: the app has none, so no import check. */
export function mocapEnv(p, ff, comfyAt, out, comfy) {
  return nodeEnv({
    JUST_MOCAP_GEMX: p.gemx,
    JUST_MOCAP_PYTHON: p.python,
    JUST_MOCAP_TOOLS_PYTHON: p.facePython,
    JUST_MOCAP_BLENDER: "",
    JUST_MOCAP_FFMPEG: ff.exe,
    JUST_MOCAP_FFPROBE: ff.ffprobe,
    JUST_MOCAP_COMFY: comfyAt,
    JUST_MOCAP_COMFY_MAIN: p.comfyMain,
    JUST_MOCAP_COMFY_OUT: path.join(out, "sam-work"),
    JUST_MOCAP_SAM_MODEL: comfy.sam ?? "",
    JUST_MOCAP_DETR_MODEL: comfy.detr ?? "",
    JUST_MOCAP_FACE_MODEL: p.face,
    JUST_MOCAP_CACHE: p.cache,
    // GEM-X's video reader runs FFmpeg by name (its docs/INSTALL.md)
    PATH: [path.dirname(ff.exe), process.env.PATH ?? ""].join(path.delimiter),
  });
}

/** Link each downloaded model file into the engine where its `slot` says (`gemx:<path>`); the ComfyUI models' paths. */
function placeModels(svc, p) {
  const comfy = {};
  for (const m of svc.modelsStatus()) {
    const { files } = svc.modelFor(m.id);
    for (const [slot, file] of Object.entries(files)) {
      if (slot.startsWith("gemx:")) {
        const at = path.join(p.gemx, ...slot.slice(5).split("/"));
        mkdirSync(path.dirname(at), { recursive: true });
        // a link left from an earlier revision points at another blob: replaced
        if (existsSync(at) && statSync(at).size !== statSync(file).size) rmSync(at, { force: true });
        if (!existsSync(at)) linkSnapshot(file, at);
      } else comfy[slot] = file;
    }
  }
  return comfy;
}

/**
 * Run one take: the engine's pipeline from `video` into the folder `out` (resumed where an earlier run stopped —
 * every step whose output is there is skipped), the card booked for it, `onProgress(fraction, message)` per step.
 * `options`: `smoothing` none|default|strong, `focal35` | `fov` (the lens), `unevenGround`, `armFit`, `ranges` (edited
 * foot contacts, `[[[start, end], …], […]]` per foot: the foot correction and everything after it again, no model
 * re-run). Resolves the engine's files `{take, bvh, fbx, glb, usd, c3d, motion, face, preview, sheet, contacts}`.
 * Refusals: 409 (not ready — mocapReadiness's need), EngineBusyError (the card is busy with another AI job).
 */
export async function runMocap(video, out, options = {}, { onProgress = () => {}, signal = null, spawn = processMod.spawnChild, arbiter = getArbiter } = {}) {
  const ready = mocapReadiness();
  if (!ready.ready) throw new ApiError(409, ready.need, "Motion capture isn't ready", ready.detail);
  const svc = getRuntimeService("mocap");
  const p = mocapPaths(svc.buildPlace());
  const comfy = placeModels(svc, p);
  mkdirSync(out, { recursive: true });
  let rangesFile = null;
  if (options.ranges) {
    rangesFile = path.join(out, "contacts_edited.json");
    writeFileSync(rangesFile, JSON.stringify(options.ranges));
  }
  const args = mocapArgs(p.engine, video, out, { ...options, rangesFile });
  const port = await processMod.findFreePort(processMod.DEFAULT_HOST, 8199);
  const env = mocapEnv(p, ffmpegExe(), `${processMod.DEFAULT_HOST}:${port}`, out, comfy);
  // the card: room made for the job's peak (the arbiter evicts the least recently used other holder), its kind busy
  // while it runs so nothing evicts it, the booking gone after
  const arb = arbiter();
  const rt = runtimeOf("mocap");
  const peakMb = Number(rt.defaults.memory?.peakMb || 0);
  // the kit's booking shape `<kind>:<runtime>` (arbiter.js runtimeBookings): the memory strip says "Motion capture" and
  // the take it runs; one take at a time (the routes run them in one lane)
  const key = `${rt.kind}:${rt.id}`;
  if (arb.isReserved(key)) throw new EngineBusyError(rt.label);
  arb.busyBegin(rt.kind);
  try {
    if (peakMb && !(await arb.makeRoom(peakMb, { exclude: key, hardware: hardware.detected(), reason: "a motion capture take", forKind: rt.kind }))) {
      throw new EngineBusyError(rt.label);
    }
    arb.reserve(key, peakMb, { kind: rt.kind, source: "declared", holderFn: () => path.basename(String(out)) });
    const track = progressTracker();
    log.info(`mocap: ${video} → ${out}`);
    return await runEngineScript(args.length ? nodeArgv(args[0], args.slice(1)) : [], {
      cwd: p.engine,
      env,
      logPath: path.join(out, "run.log"),
      onLine: (r) => {
        const moved = track(r);
        if (moved) onProgress(moved.fraction, moved.message);
      },
      signal,
      spawn,
    });
  } finally {
    arb.release(key);
    arb.busyEnd(rt.kind);
  }
}
