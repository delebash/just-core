// SPDX-License-Identifier: MIT
// A kit runtime's engine and server — the way llama.cpp's are (lifecycle.js), for every runtime besides llama.cpp's
// router (docs/plans/2026-10-24-engines-the-llama-way.md, K1 + K3 + K5 + K7):
//  - the engine: status, the kit's verified install (binary.acquireRuntime: download → stage → probe → swap) into
//    `<cacheRoot>/<folder>/<build>/<gpu>/` with progress and Cancel, what a build needs from the system said before
//    the download (Microsoft's Visual C++ runtime, a macOS, a glibc — house-paint's check, moved into the kit), removal;
//  - the server: one model at a time (another model = a restart), started the one way every kit server starts
//    (process.startServerProcess), stopped after the runtime's idle time (a seeded setting) or when the arbiter
//    evicts it, and booked with the arbiter by its kind — while idle what it holds, for a job its peak, after room is
//    made on the card (the arbiter evicts another holder — the chat model) and with its kind busy so nothing evicts it
//    mid-job.
// Before anything downloads (K10b, house-paint's checks moved into the kit): the room on the drive — an install or a
// download that wouldn't fit is refused, never cut off at a full disk. Each model is rated the way the chat rows are —
// its fit and its speed band, measured beating predicted (the one-way-per-job fold, 2026-10-27). Removing the engine
// while a job runs on it, or a model while it downloads or runs, is refused.
// One service per runtime the app turned on (installLlm({ runtimes })).
import { existsSync, mkdirSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { AsyncEvent, background, Mutex } from "../platform/asyncutil.js";
import { freeBytes, lacksRoom } from "../platform/disk_room.js";
import { ApiError } from "../platform/errors.js";
import { getLogger } from "../platform/log.js";
import { pyRound } from "../platform/py.js";
import { getArbiter } from "./arbiter.js";
import { AudioCppError, AudioCppPool, backendOf, ModelEntry, physicalCores, sideEnv } from "./audiocpp.js";
import * as binary from "./binary.js";
import { buildsInUse, recordBuild } from "./cache_registry.js";
import * as fit from "./fit.js";
import * as hardware from "./hardware.js";
import * as models from "./models.js";
import * as onnx from "./onnx.js";
import * as processMod from "./process.js";
import { installArchive, installed as extraInstalled } from "./runtime_extras.js";
import { buildHas, kindsOf, runtimeOf } from "./runtimes.js";
import { fmtGb, SpeechPlacement } from "./speech_placement.js";

const log = getLogger("llm_runner.runner.runtime_service");
// a runtime build's folder words (runtime_binary.gpu — binary.runtimeVariantDir): the card's backend in the ledger
const VARIANT_WORDS = new Set(["cuda12", "cuda13", "vulkan", "metal", "cpu", "rocm", "hip"]);

/**
 * What this computer lacks to run `asset` (a runtime row with its `requires`), or null:
 * `{reason, …, detail}` — `reason` a slug the screen words ("no-build", "vc-runtime", "macos", "glibc"), `detail`
 * the server's English. `sys`: `{platform, arch, versions: {macos, glibc}, missingDlls(names)}`.
 */
export function unmetNeed(asset, sys, label = "this engine") {
  if (!asset) return { reason: "no-build", detail: `${label} publishes no build for ${sys.platform}/${sys.arch}` };
  const req = asset.requires || {};
  if (req.dlls?.length) {
    const missing = sys.missingDlls(req.dlls);
    if (missing.length) {
      return {
        reason: "vc-runtime",
        missing,
        url: hardware.VC_REDIST_URL,
        detail: `Microsoft's Visual C++ runtime (2015–2022) isn't on this computer (${missing.join(", ")} missing) — install it from ${hardware.VC_REDIST_URL}, then try again`,
      };
    }
  }
  if (req.macos && !hardware.versionAtLeast(sys.versions.macos, req.macos)) {
    const have = sys.versions.macos;
    return { reason: "macos", need: req.macos, have, detail: `${label} needs macOS ${req.macos} or later; this Mac has ${have ? `macOS ${have}` : "an older macOS"}` };
  }
  if (req.glibc && !hardware.versionAtLeast(sys.versions.glibc, req.glibc)) {
    const have = sys.versions.glibc;
    return { reason: "glibc", need: req.glibc, have, detail: `${label} needs a Linux with glibc ${req.glibc} or later; this one has ${have ? `glibc ${have}` : "no glibc"}` };
  }
  return null;
}

/** This computer, as `unmetNeed` reads it. */
export const thisSystem = () => ({
  platform: process.platform,
  arch: process.arch,
  versions: hardware.systemVersions(),
  missingDlls: (names, opts) => hardware.missingDlls(names, opts),
});

const idle = () => ({ status: "", detail: "", error: "", downloaded: 0, total: 0 });

/** A build tag's order: its first number (sd.cpp's "master-1024-77b72a2" → 1024, llama.cpp's "b11960" → 11960); -1 none. */
export function buildOrder(tag) {
  const m = /(\d+)/.exec(String(tag || ""));
  return m ? Number(m[1]) : -1;
}

/** A build row that doesn't say what its archive unpacks to: room for this many times its size (the pinned sd.cpp
 *  zips unpack to 1.1–4.9 times theirs — Linux ROCm the most; runner/config.js). */
const UNPACK_ROOM = 5;

const gb = (n) => `${(n / 1e9).toFixed(1)} GB`;

/** A refusal the routes answer in their shape: `fields` one of `{diskFull: {needBytes, freeBytes}}`, `{busy: code}`. */
const refusal = (message, fields) => Object.assign(new Error(message), fields);

/** No room for `label`'s download: the error the routes answer 507 "disk-full" with the sizes. */
const noRoom = (label, short) =>
  refusal(
    `${label} needs ${gb(short.needBytes)} on the drive that holds the app's AI engines and models; it has ${gb(short.freeBytes)} free — make room, or move the app's data folder to a bigger drive`,
    { diskFull: short },
  );

/** The card is busy (another kind's job holds it): said in the words the screens already use. */
export class EngineBusyError extends Error {
  constructor(label) {
    // a refusal, never a queue: nothing starts by itself once the card is free
    super(`The graphics card is busy with another AI job — try again when it's done (${label} needs it)`);
    this.name = "EngineBusyError";
  }
}

export class RuntimeService {
  /**
   * `id` a runtime with build rows (runner/runtimes.js); `cacheRoot` the kit's engine cache; `configFn()` →
   * `{pinnedBuild, binaries, idleSeconds}` (stores getRuntimeConfig); `hardwareFn()` → the kit's detection;
   * `systemFn()` → thisSystem(); `probeArgvs` the launch flags a staged build must accept; `server` the runtime's
   * `{argv({port, files, blankPage}), ready(url)}` (runner/sdcpp.js SDCPP_SERVER); `logDir` where its server log goes
   * (the spawn logs folder llama-server's logs share — Storage counts and clears them together); `stateDir` where the
   * app's own generated files go (its blank page — the app's runtime root); `measurements` the kit's measurement
   * ledger (`{list(modelId), record(modelId, row)}` — llm/stores.js ModelMeasurementStore; null: nothing recorded,
   * nothing measured). A runtime whose models are registered (audio.cpp): `speech` — its placement's options
   * (runner/speech_placement.js SpeechPlacement): the app's `warm`, `pieceLength`, `loadOptionsKey`; seams `llmFn`,
   * `probes`, `memory`, `sleep`, `now`. The rest are seams for tests (`freeBytesFn(dir)` a drive's free room).
   */
  constructor({
    id,
    cacheRoot,
    configFn,
    hardwareFn = () => hardware.detected(),
    systemFn = thisSystem,
    probeArgvs = null,
    modelsFn = () => [],
    server = null,
    logDir = null,
    stateDir = null,
    beforeRemove = null,
    acquire = binary.acquireRuntime,
    // () => a server program to run instead of the installed build, or null — an app's development build (JustVoice's
    // `npm run dev` runs its audio.cpp checkout's own, which has every feature — round E)
    exeOverride = null,
    startServer = processMod.startServerProcess,
    findPort = processMod.findFreePort,
    arbiter = getArbiter,
    freeBytesFn = freeBytes,
    measurements = null,
    ort = null,
    dmlDeviceIdFn = () => onnx.bestDmlAdapter(hardware.dxgiAdapters?.() ?? []),
    ortCheck = onnx.ortRuntimeCheck,
    speech = {},
  }) {
    const rt = runtimeOf(id);
    if (!rt?.defaults) throw new TypeError(`no kit runtime "${id}" with build rows`);
    // an in-process runtime (ONNX Runtime — the engines plan's K6): `ort` `{load, binDir}` — the app's
    // onnxruntime-node, handed in (D2); `dmlDeviceIdFn()` the DirectML adapter; `ortCheck` a seam
    this._ort = ort;
    this._dmlDeviceIdFn = dmlDeviceIdFn;
    this._ortCheckFn = ortCheck;
    this._ortAnswer = null; // whether ONNX Runtime loads here: onnx.ortRuntimeCheck's answer
    this._ortCheck = null;
    this._loaded = null; // the model in memory: { key, modelId, instance, ep, mb, jobs }
    this._loading = null; // its build, while it runs (a second call waits for it)
    this._drained = []; // releases waiting for its runs to end
    this.rt = rt;
    this.cacheRoot = cacheRoot;
    this._configFn = configFn;
    this._hardwareFn = hardwareFn;
    this._systemFn = systemFn;
    this._probeArgvs = probeArgvs;
    this._modelsFn = modelsFn;
    this._modelState = new Map(); // model id → { status, error, downloaded, total, cancel }
    this._adopting = new Set(); // model ids whose files already on this computer are moving into the cache
    this._spec = server;
    this._logDir = logDir || cacheRoot;
    this._stateDir = stateDir || this._logDir;
    this._beforeRemove = beforeRemove ?? (() => this.stopServer());
    this._acquire = acquire;
    this._startServer = startServer;
    this._findPort = findPort;
    this._arbiter = arbiter;
    this._freeBytesFn = freeBytesFn;
    this._exeOverride = exeOverride;
    this._measurements = measurements;
    this._removing = false; // the engine's folder is going: nothing installs into it or starts from it
    this._state = idle();
    this._cancel = new AsyncEvent();
    this._task = null;
    this._server = null; // { handle, modelKey }
    this._jobs = 0; // jobs running on the server now
    this._starting = null;
    this._idleTimer = null;
    // a runtime whose models are REGISTERED into running servers (audio.cpp — round E): its server per placement and
    // kind, and which model each holds (one per kind: a process's measured memory is its one model's)
    if (this.rt.loads === "register") {
      this._pool = new AudioCppPool({
        configDir: path.join(this._stateDir, `${this.rt.id}-config`),
        logDir: this._logDir,
        settingsFn: () => this._configFn().settings ?? {},
        envFn: () => this.extrasEnv(),
      });
      // modelId → { modelId, placement, kind, ids, device, reason, optsKey, pid, stopsProcess, ramPeakMb, speedRecorded,
      // priceAtFirstLine, ramProbing }
      this._held = new Map();
      // JustVoice's locks (its manager.js): one load or unload at a time, and each kind's activity lock — held around a
      // line on its model and around a load or unload of the kind, so a load never takes a model away mid-line. Lock
      // order: the kind's activity, then the load lock. modelId → lines running on it now (busyModels).
      this._loadLock = new Mutex();
      this._activity = new Map();
      this._inUse = new Map();
      // where each model loads and what it books on the card — the kit's (round E, "Kit code, every runtime")
      this._placement = new SpeechPlacement({
        label: this.rt.label,
        ledger: this._measurements,
        ledgerId: (modelId) => this._ledgerId(modelId),
        arbiter: () => this._arbiter(),
        hardwareFn: () => this._hardwareFn(),
        settingsFn: () => this._configFn().settings ?? {},
        safetyMarginMbFn: () => this._configFn().safetyMarginMb,
        cardBackendFn: () => this._cardBackend(),
        buildFn: () => this._buildTag(),
        cpuThreadsFn: () => this._cpuThreads(),
        occupantFn: (kind) => this._occupant(kind),
        instanceKey: (kind, placement) => this._instanceKey(kind, placement),
        ...speech,
      });
    }
  }

  /** The folder every build of this runtime lives under. */
  get root() {
    return path.join(this.cacheRoot, this.rt.folder);
  }

  _pick() {
    const cfg = this._configFn();
    const hw = this._hardwareFn();
    // in-process: no build — the "asset" is the execution provider its models ask for first (auto: DirectML on
    // Windows), what a model's rating reads (its card memory, its reference speed per provider)
    if (this.rt.inProcess) return { cfg, hw, asset: { gpu: onnx.resolveProvider("auto"), inProcess: true } };
    return { cfg, hw, asset: binary.selectRuntimeAsset(cfg.binaries, hw) };
  }

  /** The installed server's path for this box, or null — never downloads (an in-process runtime has none). */
  installedExe() {
    if (this.rt.inProcess) return null;
    const dev = this._dev();
    if (dev) return dev.exe;
    const { cfg, asset } = this._pick();
    return asset ? binary.installedRuntimeExe(this.cacheRoot, this.rt.folder, cfg.pinnedBuild, asset) : null;
  }

  /** In-process: whether ONNX Runtime loads here — the app's onnxruntime-node (onnx.ortRuntimeCheck). The load is
   *  tried once; a missing Visual C++ runtime is looked for again each time (installing it needs no restart). */
  checkRuntime() {
    if (!this.rt.inProcess) return Promise.resolve({ ok: true });
    if (this._ortAnswer?.ok) return Promise.resolve(this._ortAnswer);
    if (!this._ort?.load) return Promise.resolve((this._ortAnswer = { ok: false, detail: `${this.rt.label} isn't part of this app (installLlm's onnx.load)` }));
    this._ortCheck ??= this._ortCheckFn({ load: this._ort.load, binDir: this._ort.binDir ?? null, log }).then((a) => {
      this._ortAnswer = a;
      if (!a.ok && a.reason === "vc-runtime") this._ortCheck = null;
      return a;
    });
    return this._ortCheck;
  }

  /** In-process: what the screens show — part of the app, nothing to install; whether it loads here (`need`). */
  _inProcessStatus() {
    const { cfg, hw, asset } = this._pick();
    if (!this._ortAnswer) this.checkRuntime().catch(() => {}); // answered at the next read
    const a = this._ortAnswer;
    return {
      id: this.rt.id,
      kind: this.rt.kind,
      label: this.rt.label,
      inProcess: true,
      build: "",
      platform: hw.platform,
      gpu: asset.gpu,
      installed: a?.ok !== false,
      serverExe: "",
      running: this._loaded?.modelId ?? "",
      idleSeconds: Number(cfg.idleSeconds ?? this.rt.defaults.idleSeconds ?? 0),
      // its kind's speed bands in the kind's unit (seeded band_*:<kind>, edited on its tab — 2026-10-29); null: none
      bands: cfg.bands ? { fast: cfg.bands.fast, fine: cfg.bands.fine, slow: cfg.bands.slow, unit: cfg.bands.unit, lowerIsFaster: !!cfg.bands.lowerIsFaster } : null,
      downloadBytes: 0,
      need: a && !a.ok ? { reason: a.reason || "cant-load", missing: a.missing, files: a.files, url: a.url, detail: a.detail } : null,
      ...idle(),
    };
  }

  /** The build an install fetches: `gpu`'s for this platform when named, else the one this box picks (acquireRuntime's rule). */
  _assetFor(gpu) {
    const { cfg, hw, asset } = this._pick();
    if (gpu == null) return asset;
    return (cfg.binaries || []).find((b) => b.platform === hw.platform && b.gpu === gpu) ?? null;
  }

  /** What installing `asset` lacks on the drive: null, or `{needBytes, freeBytes}`. At most it holds its archives and
   *  what they unpack to at once (the archives go once it's installed); its own unfinished downloads hold theirs. */
  _engineRoom(asset, build) {
    const parts = [
      [asset.assetUrl, asset.assetBytes, asset.assetUnpackedBytes],
      [asset.runtimeUrl, asset.runtimeBytes, asset.runtimeUnpackedBytes],
    ].filter(([url]) => url);
    const bytes = parts.reduce((n, [, size, unpacked]) => n + Number(size || 0) + (Number(unpacked) || Number(size || 0) * UNPACK_ROOM), 0);
    // binary._stageAndSwap's archives: `<root>/<build>/.downloads/<the URL's file name>`
    const downloads = path.join(this.root, build, ".downloads");
    const files = parts.map(([url]) => path.join(downloads, url.replace(/\/+$/, "").split("/").pop()));
    return lacksRoom({ dir: this.root, bytes, files, free: this._freeBytesFn });
  }

  /** What the screen shows: the runtime, its build for this box, whether it's here and running, what it needs, the
   *  install's progress. (How fast and whether it fits is each model's: modelsStatus.) */
  status() {
    if (this.rt.inProcess) return this._inProcessStatus();
    const { cfg, hw, asset } = this._pick();
    // an app's development build stands in for the installed one (exeOverride — JustVoice's `npm run dev`)
    const dev = this._dev();
    const exe = dev?.exe ?? (asset ? binary.installedRuntimeExe(this.cacheRoot, this.rt.folder, cfg.pinnedBuild, asset) : null);
    const kinds = kindsOf(this.rt);
    return {
      id: this.rt.id,
      kind: this.rt.kind,
      // several kinds (audio.cpp: tts, stt): each one's bands, in the kind's unit
      ...(kinds.length > 1 ? { kinds, bandsByKind: cfg.bandsByKind ?? null } : {}),
      // the settings the runtime declares (audio.cpp's build, threads, timeouts …), as set here
      ...(this.rt.defaults.settings ? { settings: { ...this.rt.defaults.settings, ...(cfg.settings ?? {}) } } : {}),
      label: this.rt.label,
      build: dev ? dev.version || "dev" : cfg.pinnedBuild,
      // the build this kit is tested with (its shipped rows) when it is newer than the pin here — seeding is
      // insert-if-missing, so an existing install keeps its pin until the user presses Update (llama.cpp's "tested" offer)
      updateTo: buildOrder(this.rt.defaults?.pinnedBuild) > buildOrder(cfg.pinnedBuild) ? this.rt.defaults.pinnedBuild : "",
      platform: hw.platform,
      gpu: asset?.gpu ?? "",
      installed: exe != null,
      serverExe: exe ? String(exe) : "",
      running: this._server?.handle.isAlive() ? this._server.modelKey : "",
      // how long it waits idle before it lets go of its memory (a seeded setting; 0: never)
      idleSeconds: Number(cfg.idleSeconds ?? this.rt.defaults.idleSeconds ?? 0),
      // its kind's speed bands in the kind's unit (seeded band_*:<kind>, edited on its tab — 2026-10-29); null: none
      bands: cfg.bands ? { fast: cfg.bands.fast, fine: cfg.bands.fine, slow: cfg.bands.slow, unit: cfg.bands.unit, lowerIsFaster: !!cfg.bands.lowerIsFaster } : null,
      downloadBytes: (asset?.assetBytes || 0) + (asset?.runtimeBytes || 0),
      need: unmetNeed(asset, this._systemFn(), this.rt.label),
      // a runtime with add-ons (audio.cpp's Japanese dictionary) says which are here
      ...(this.rt.defaults.addons?.length ? { addons: this.addons() } : {}),
      // a runtime that registers models says what each server holds (round E)
      ...(this._pool ? { loaded: this.loaded() } : {}),
      ...this._state,
    };
  }

  // ── the engine ─────────────────────────────────────────────────────────────────────────────────

  /** Start the install in the background (its progress in status()); throws `{need}` when this computer can't run the
   *  build, `{diskFull}` when it wouldn't fit the drive, `{busy}` while the engine is being removed. `onFailure` runs
   *  when the started install fails or is cancelled (an Update puts the old pin and rows back). */
  install({ gpu = null, force = false, onFailure = null } = {}) {
    if (this.rt.inProcess) throw refusal(`${this.rt.label} is part of this app — there is nothing to install`, { nothingToInstall: true });
    if (this._state.status === "installing") return this.status();
    if (this._removing) throw refusal(`${this.rt.label} is being removed — try again when it's done`, { busy: "engine-busy" });
    const { cfg, asset } = this._pick();
    const need = unmetNeed(asset, this._systemFn(), this.rt.label);
    if (need) throw Object.assign(new Error(need.detail), { need });
    // nothing downloads that wouldn't fit (a build already here downloads nothing)
    const target = this._assetFor(gpu);
    const here = target && binary.installedRuntimeExe(this.cacheRoot, this.rt.folder, cfg.pinnedBuild, target);
    const short = target && (force || !here) ? this._engineRoom(target, cfg.pinnedBuild) : null;
    if (short) throw noRoom(this.rt.label, short);
    this._cancel.clear();
    this._state = { status: "installing", detail: this.rt.label, error: "", downloaded: 0, total: 0 };
    let done = false;
    const promise = background(`${this.rt.id} engine install`, () => this._run(gpu, force, onFailure), log).finally(() => {
      done = true;
    });
    this._task = { promise, isAlive: () => !done };
    return this.status();
  }

  async _run(gpu, force, onFailure = null) {
    try {
      const cfg = this._configFn();
      await this._acquire(this.cacheRoot, this.rt.folder, cfg.pinnedBuild, cfg.binaries, this._hardwareFn(), {
        gpu,
        force,
        probeArgvs: this._probeArgvs,
        onProgress: (downloaded, total) => {
          this._state.downloaded = downloaded;
          this._state.total = total || 0;
        },
        cancelCheck: () => this._cancel.isSet(),
      });
      // the build's extras (eSpeak NG beside audio.cpp), into its own folder — a build installs whole or not at all
      const asset = this._assetFor(gpu) ?? this._pick().asset;
      if (asset?.extras?.length) {
        const dir = this._extrasDir(cfg.pinnedBuild, asset);
        for (const extra of asset.extras) {
          await installArchive(dir, extra, {
            onProgress: (downloaded, total) => {
              this._state.downloaded = downloaded;
              this._state.total = total || 0;
            },
            cancelCheck: () => this._cancel.isSet(),
          });
        }
      }
      this._state = { ...idle(), status: "installed" };
      await this._sweepStaleBuilds(cfg.pinnedBuild);
    } catch (e) {
      const cancelled = this._cancel.isSet();
      this._state = { ...idle(), status: cancelled ? "cancelled" : "error", error: cancelled ? "" : String(e?.message || e) };
      if (!cancelled) log.warning(`${this.rt.id} engine install failed: ${e?.message || e}`);
      try {
        onFailure?.();
      } catch (err) {
        log.warning(`${this.rt.id}: couldn't put the earlier build back: ${err?.message || err}`);
      }
    }
  }

  /** After an install, every other build of this runtime goes — llama.cpp's rule (lifecycle.js: "An UPDATE replaces
   *  the old build", the user's 2026-07-07), for a superseded pin or an app's own earlier build moved into the cache.
   *  A server runs only from the pinned build, so none holds them. Best effort: a build still held stays, logged. */
  async _sweepStaleBuilds(keep) {
    // in a cache the family's apps share, a build another live install uses stays — all of them while one never said
    // which (cache_registry `buildsInUse`, 2026-10-29)
    recordBuild(this.rt.folder, keep);
    const others = buildsInUse(this.cacheRoot, this.rt.folder);
    if (others.unknown.length) return log.info(`${this.rt.id}: old builds kept — ${others.unknown.join(", ")} share this cache and never said which build they use`);
    let stale = [];
    try {
      // a folder named "_…" is the runtime's own, not a build (its add-ons: `_addons`)
      stale = readdirSync(this.root, { withFileTypes: true }).filter((d) => d.isDirectory() && !d.name.startsWith("_") && d.name !== keep && !others.builds.has(d.name));
    } catch {
      return; // no runtime folder
    }
    for (const d of stale) {
      try {
        await rm(path.join(this.root, d.name), { recursive: true, force: true, maxRetries: os.platform() === "win32" ? 5 : 0, retryDelay: 200 });
        log.info(`${this.rt.id}: removed the old build ${d.name}`);
      } catch (e) {
        log.warning(`${this.rt.id}: the old build ${d.name} is still there (files in use?): ${e?.message || e}`);
      }
    }
  }

  /** Stop an install at its next download chunk. */
  cancelInstall() {
    this._cancel.set();
    return this.status();
  }

  /** Remove every installed build of this runtime (its server stops first; an install in flight is cancelled, as
   *  llama.cpp's is). Refused `{busy}` while a job runs on it — a job takes minutes, and removal would lose it. */
  async uninstall() {
    if (this.rt.inProcess) throw refusal(`${this.rt.label} is part of this app — it is removed with the app`, { nothingToInstall: true });
    if (this._jobs > 0) throw refusal(`${this.rt.label} is running a job — remove it once the job has finished`, { busy: "engine-busy" });
    this._removing = true;
    try {
      if (this._task?.isAlive()) {
        this._cancel.set();
        await Promise.race([this._task.promise, new Promise((r) => setTimeout(r, 30_000).unref?.())]);
      }
      await this._beforeRemove();
      // a build another live install of the family uses stays, and the answer says for whom (`keptFor`)
      const others = buildsInUse(this.cacheRoot, this.rt.folder);
      const keptFor = new Set(others.unknown);
      const builds = others.unknown.length || !existsSync(this.root) ? [] : readdirSync(this.root, { withFileTypes: true }).filter((d) => d.isDirectory());
      for (const d of builds) {
        const users = others.builds.get(d.name) || [];
        for (const u of users) keptFor.add(u);
        if (!users.length) await rm(path.join(this.root, d.name), { recursive: true, force: true, maxRetries: os.platform() === "win32" ? 5 : 0, retryDelay: 200 });
      }
      if (!keptFor.size) await rm(this.root, { recursive: true, force: true, maxRetries: os.platform() === "win32" ? 5 : 0, retryDelay: 200 });
      else log.info(`${this.rt.id}: builds kept for ${[...keptFor].join(", ")}, which still use them`);
      recordBuild(this.rt.folder, null);
      this._state = idle();
      return { ...this.status(), keptFor: [...keptFor] };
    } finally {
      this._removing = false;
    }
  }

  // ── the models (pinned file sets in the kit's HF cache: `<cacheRoot>/hf`) ──────────────────────────

  get hfRoot() {
    return path.join(this.cacheRoot, "hf");
  }

  _fileAt(f) {
    return models.snapshotFilePath(this.hfRoot, f.repo, f.revision, f.path);
  }

  /** A file's blob: the bytes themselves, named by their SHA-256 (models.acquireFileSet downloads to it). */
  _blobAt(f) {
    return path.join(this.hfRoot, `models--${f.repo.replaceAll("/", "--")}`, "blobs", f.sha256);
  }

  /** The ledger's id for one of this runtime's models (JustVoice's speech rows' `<kind>:<engine>:<variant>` shape). */
  _ledgerId(modelId) {
    return `${this._kindOf(modelId)}:${this.rt.id}:${modelId}`;
  }

  /** Model `modelId`'s kind — its row's own (audio.cpp's rows are tts or stt), else the runtime's. */
  _kindOf(modelId) {
    try {
      return this._model(modelId).kind || this.rt.kind;
    } catch {
      return this.rt.kind; // its row is gone
    }
  }

  /**
   * How `m` runs on this box, rated the one way the chat rows are (runner/api.js — the one-way-per-job fold,
   * 2026-10-27): `fit` from fit.coarseFit on its declared needs (`peakVramMb` on the card, `minRamMb` beside it; on
   * the CPU build nothing goes to a card, so both come out of the computer's memory), and `speedBand` from
   * fit.rateSpeed — this box's newest measurement on this build (the ledger) outranks the model's reference figure
   * for the build (`refSpeed`), in its kind's unit (`speedUnit`, config.js DEFAULT_RUNTIME_BANDS).
   */
  _rating(m, cfg, hw, asset) {
    const onCard = !!asset && asset.gpu !== "cpu";
    const peak = Number(m.peakVramMb || 0);
    const ram = Number(m.minRamMb || 0);
    const fitWord = fit.coarseFit({
      totalParams: null,
      quant: "",
      vramMb: onCard ? hardware.maxVramMb(hw) : 0,
      ramMb: hw.ramMb,
      marginMb: cfg.safetyMarginMb ?? 0,
      minVramOverride: peak || null,
      minRamOverride: (onCard ? ram : ram + peak) || null,
    });
    // its own kind's bands (audio.cpp: tts and stt each have theirs)
    const bands = cfg.bandsByKind?.[m.kind] ?? cfg.bands;
    const field = bands?.unit === "s/image" ? "secPerImage" : "realtimeX";
    let rows = [];
    try {
      rows = this._measurements?.list(this._ledgerId(m.id)) ?? [];
    } catch {
      rows = []; // no ledger wired (a bare test)
    }
    const mkey = hardware.machineKey(hw);
    // where it runs: a loaded model of a runtime that registers them reads its placement's numbers (the CPU's own)
    const ranOn = this._held?.get(m.id)?.placement === "cpu" ? "cpu" : asset?.gpu || "";
    const row = rows.find((r) => r.machineKey === mkey && (r.backend || "") === ranOn && Number(r[field]) > 0);
    const measured = row ? Number(row[field]) : null;
    const predicted = ranOn ? Number(m.refSpeed?.[ranOn]) || null : null;
    return {
      fit: fitWord,
      minRamMb: ram || null,
      minVramMb: peak || null,
      speedBand: bands ? fit.rateSpeed({ measured, predicted }, bands) : "",
      predSpeed: predicted,
      measuredSpeed: measured != null ? Math.round(measured * 10) / 10 : null,
      speedUnit: bands?.unit ?? "",
      ranHere: rows.some((r) => r.machineKey === mkey),
    };
  }

  /** One job's speed on this box and build into the kit's measurement ledger — what the band reads from then on.
   *  `fields` in the kind's unit (`{secPerImage}` for an image); `fields.backend` what it ran on, when a run says (an
   *  in-process run's provider as asked: a run set to the CPU is never "auto"'s speed; a DirectML session the app
   *  let fall back to the CPU counts as "auto"'s — the speed auto gives here), else the build this computer picks.
   *  Best effort: never fails the job. */
  recordSpeed(modelId, fields) {
    if (!this._measurements) return;
    try {
      const { hw, asset } = this._pick();
      const backend = fields.backend ?? asset?.gpu ?? "";
      this._measurements.record(this._ledgerId(modelId), {
        machineKey: hardware.machineKey(hw),
        source: "speed",
        label: `${this.rt.label} (${backend || "no build"})`,
        tokensPerSec: 0,
        vramTotalMb: 0,
        at: Date.now(),
        rows: [],
        kind: this._kindOf(modelId),
        ...fields,
        backend,
      });
    } catch (e) {
      log.warning(`${this.rt.id}: couldn't record ${modelId}'s speed: ${e?.message || e}`);
    }
  }

  /** What downloading `m` lacks on the drive: null, or `{needBytes, freeBytes}` — its files not here whole, less what
   *  their unfinished downloads already hold. */
  _modelRoom(m) {
    const missing = m.files.filter((f) => {
      const st = statSync(this._blobAt(f), { throwIfNoEntry: false });
      return !(st?.isFile() && st.size === Number(f.bytes));
    });
    const bytes = missing.reduce((n, f) => n + Number(f.bytes || 0), 0);
    return lacksRoom({ dir: this.hfRoot, bytes, files: missing.map((f) => this._blobAt(f)), free: this._freeBytesFn });
  }

  _here(m) {
    return m.files.every((f) => {
      const at = this._fileAt(f);
      return existsSync(at) && statSync(at).size === Number(f.bytes);
    });
  }

  _model(id) {
    const m = this._modelsFn().find((x) => x.id === id);
    if (!m) throw Object.assign(new Error(`no model "${id}" for ${this.rt.label}`), { notFound: true });
    return m;
  }

  /** Each model: its size, whether all its files are here (`onDisk`), whether the server runs it, how it runs here (its
   *  `fit` and `speedBand` — `_rating`), its download's progress (`status`, `downloaded` bytes of `total`). */
  modelsStatus() {
    const { cfg, hw, asset } = this._pick();
    return this._modelsFn().map((m) => {
      const { cancel, ...state } = this._modelState.get(m.id) ?? { status: "", error: "", downloaded: 0, total: 0 };
      return {
        id: m.id,
        name: m.name,
        kind: m.kind,
        license: m.license,
        bytes: m.files.reduce((a, f) => a + Number(f.bytes || 0), 0),
        onDisk: this._here(m),
        running: (this._server?.handle.isAlive() && this._server.modelKey === m.id) || this._loaded?.modelId === m.id || !!this._held?.has(m.id),
        ...this._rating(m, cfg, hw, asset),
        ...state,
      };
    });
  }

  /** Start a model's download in the background (its progress in modelsStatus()); throws `{diskFull}` when it wouldn't
   *  fit the drive. */
  downloadModel(id) {
    const m = this._model(id);
    const st = this._modelState.get(id);
    if (st?.status === "downloading") return this.modelsStatus().find((x) => x.id === id);
    if (this._adopting.has(id)) throw refusal(`${m.name} is being moved into the models cache — try again in a moment`, { busy: "model-busy" });
    const short = this._modelRoom(m);
    if (short) throw noRoom(m.name, short);
    const cancel = new AsyncEvent();
    const state = { status: "downloading", error: "", downloaded: 0, total: 0, cancel };
    this._modelState.set(id, state);
    background(`${this.rt.id} model ${id}`, async () => {
      try {
        await models.acquireFileSet(m.files, {
          cacheRoot: this.hfRoot,
          verify: (file) => binary._fileSha256(file),
          onProgress: (n, total) => {
            state.downloaded = n;
            state.total = total || 0;
          },
          cancelCheck: () => cancel.isSet(),
        });
        this._modelState.set(id, { status: "downloaded", error: "", downloaded: 0, total: 0 });
      } catch (e) {
        const cancelled = cancel.isSet();
        this._modelState.set(id, { status: cancelled ? "cancelled" : "error", error: cancelled ? "" : String(e?.message || e), downloaded: 0, total: 0 });
        if (!cancelled) log.warning(`${this.rt.id} model ${id} download failed: ${e?.message || e}`);
      }
    }, log);
    return this.modelsStatus().find((x) => x.id === id);
  }

  /** Stop a model's download at its next chunk. */
  cancelModelDownload(id) {
    this._modelState.get(id)?.cancel?.set();
    return this.modelsStatus().find((x) => x.id === id);
  }

  /** Remove a model's files (the server stops first if it runs it); a file another model row uses stays. Refused
   *  `{busy}` while it downloads or a job runs on it (busyModels — as Clear models cache refuses). */
  async deleteModel(id) {
    const m = this._model(id);
    if (this.busyModels().includes(id)) throw refusal(`${m.name} is downloading or running a job — delete it once that has finished`, { busy: "model-busy" });
    if (this._server?.modelKey === id || this._loaded?.modelId === id) await this.stopServer();
    if (this._held?.has(id)) await this.unloadModel(id);
    const others = new Set(this._modelsFn().filter((x) => x.id !== id).flatMap((x) => x.files.map((f) => f.sha256)));
    for (const f of m.files) {
      if (others.has(f.sha256)) continue;
      await rm(this._fileAt(f), { force: true });
      await rm(this._blobAt(f), { force: true });
    }
    this._modelState.delete(id);
    return this.modelsStatus().find((x) => x.id === id);
  }

  /**
   * Model `id`'s files already on this computer — an app's own earlier downloads, `sources` `{sha256: path}` — moved
   * into the kit's cache instead of downloaded again (models.adoptFileSet: a rename on the same drive, else a copy;
   * each checked against its pinned SHA-256 unless `vouched(file, path)` says the app checked it before). Refused
   * `{busy}` while it downloads. → adoptFileSet's `{adopted, kept, skipped}`.
   */
  async adoptModel(id, sources, { vouched } = {}) {
    const m = this._model(id);
    if (this.busyModels().includes(id)) throw refusal(`${m.name} is downloading or running a job — try again once that has finished`, { busy: "model-busy" });
    this._adopting.add(id);
    try {
      return await models.adoptFileSet(m.files, sources, { cacheRoot: this.hfRoot, verify: (file) => binary._fileSha256(file), vouched });
    } finally {
      this._adopting.delete(id);
      this._modelState.delete(id); // its last download's result is about files that may have just arrived
    }
  }

  /** The models whose files are in use and must not be deleted: downloading, moving into the cache, or running a job
   *  on the server. */
  busyModels() {
    const ids = [...this._modelState].filter(([, s]) => s.status === "downloading").map(([id]) => id);
    for (const id of this._adopting) if (!ids.includes(id)) ids.push(id);
    if (this._jobs > 0 && this._server?.modelKey && !ids.includes(this._server.modelKey)) ids.push(this._server.modelKey);
    if (this._loaded?.jobs > 0 && !ids.includes(this._loaded.modelId)) ids.push(this._loaded.modelId);
    for (const id of this._inUse?.keys() ?? []) if (!ids.includes(id)) ids.push(id);
    return ids;
  }

  /** Every file this runtime's model rows put in the HF cache: each one's snapshot entry and its blob. */
  modelFiles() {
    const out = new Set();
    for (const m of this._modelsFn()) {
      for (const f of m.files) {
        out.add(this._fileAt(f));
        out.add(this._blobAt(f));
      }
    }
    return out;
  }

  /** Before the models cache is cleared (nothing busy — busyModels()): the server lets go of its files, and the
   *  models' last download results are forgotten (their files are about to go). */
  async releaseModels() {
    await this.stopServer();
    for (const [id, s] of this._modelState) if (s.status !== "downloading") this._modelState.delete(id);
  }

  /** The model as a server starts on it: `{key, files: {slot: path}}` — or an error when its files aren't all here. */
  modelFor(id) {
    const m = this._model(id);
    if (!this._here(m)) throw Object.assign(new Error(`${m.name} isn't downloaded`), { notDownloaded: true });
    return { key: m.id, files: Object.fromEntries(m.files.map((f) => [f.slot, this._fileAt(f)])), peakVramMb: m.peakVramMb };
  }

  // ── the server ─────────────────────────────────────────────────────────────────────────────────

  /** The arbiter key and what this box's build holds on the card: idle, and a job's peak (a CPU build: nothing). */
  _booking() {
    const { cfg, asset } = this._pick();
    const onCard = asset && asset.gpu !== "cpu";
    const mem = cfg.memory ?? this.rt.defaults.memory ?? { idleMb: 0, peakMb: 0 };
    const peak = this._server?.peakMb || mem.peakMb; // the running model's own peak (runtime_model.peak_vram_mb) first
    return { key: `${this.rt.kind}:${this.rt.id}`, idleMb: onCard ? mem.idleMb : 0, peakMb: onCard ? peak : 0 };
  }

  _book(mb) {
    const { key } = this._booking();
    this._arbiter().reserve(key, mb, { kind: this.rt.kind, evictFn: () => this.stopServer(), source: "declared" });
  }

  _armIdle() {
    clearTimeout(this._idleTimer);
    const s = Number(this._configFn().idleSeconds ?? this.rt.defaults.idleSeconds ?? 0);
    if (s > 0) {
      this._idleTimer = setTimeout(() => this.stopServer().catch(() => {}), s * 1000);
      this._idleTimer.unref?.();
    }
  }

  /** The server running `modelKey` from `files` (`{slot: path}`) — started (or restarted on another model) when needed;
   *  `peakVramMb` the model's own peak on the card during a job (0: the runtime's default). */
  async ensureServer({ modelKey, files, peakVramMb = 0 }) {
    if (this._removing) throw refusal(`${this.rt.label} is being removed — try again when it's done`, { busy: "engine-busy" });
    if (this._server?.handle.isAlive() && this._server.modelKey === modelKey) return this._server.handle;
    if (this._starting) await this._starting.catch(() => {});
    if (this._server?.handle.isAlive() && this._server.modelKey === modelKey) return this._server.handle;
    this._starting = this._start(modelKey, files, peakVramMb);
    try {
      return await this._starting;
    } finally {
      this._starting = null;
    }
  }

  async _start(modelKey, files, peakVramMb = 0) {
    if (!this._spec) throw new TypeError(`${this.rt.id} has no server`);
    await this.stopServer();
    const exe = this.installedExe();
    if (!exe) throw Object.assign(new Error(`${this.rt.label} isn't installed`), { notInstalled: true });
    mkdirSync(this._logDir, { recursive: true });
    mkdirSync(this._stateDir, { recursive: true });
    const blankPage = path.join(this._stateDir, `${this.rt.id}-blank.html`);
    writeFileSync(blankPage, "<!doctype html><title>.</title>\n"); // its WebUI off: an empty page at / (no flag turns it off)
    const port = await this._findPort("127.0.0.1", 18900);
    const url = `http://127.0.0.1:${port}`;
    let handle;
    try {
      handle = await this._startServer(exe, this._spec.argv({ port, files, blankPage }), {
        url,
        health: (u) => this._spec.ready(u),
        label: `${this.rt.label} server`,
        note: modelKey,
        logPath: path.join(this._logDir, `${this.rt.id}-server.log`),
        probeTimeout: 60,
      });
    } catch (e) {
      throw this._cantStart(e, exe) ?? e;
    }
    this._server = { handle, modelKey, peakMb: Number(peakVramMb) || 0 };
    this._book(this._booking().idleMb);
    this._armIdle();
    return handle;
  }

  /** A server Windows' loader couldn't start (process.js startFailure: the exit code it gave), in words — why, and what
   *  to do — as a 503 `engine-cant-start` with its `reason` (just-house-paint's sd-cli words, moved into the kit);
   *  null for any other failure (its own message stands). */
  _cantStart(e, exe) {
    const failure = processMod.startFailure(e?.exitCode);
    if (!failure) return null;
    const label = this.rt.label;
    const vc = hardware.VC_REDIST_URL;
    let reason = failure.reason;
    let detail;
    if (reason === "dll-missing") {
      const { asset } = this._pick();
      const missing = asset?.requires?.dlls?.length ? this._systemFn().missingDlls(asset.requires.dlls, { appDir: path.dirname(String(exe)) }) : [];
      if (missing.length) {
        reason = "vc-runtime";
        detail = `Microsoft's Visual C++ runtime (2015–2022) isn't on this computer (${missing.join(", ")} missing) — install it from ${vc}, then try again`;
      } else {
        detail = `a DLL it needs couldn't be found — an antivirus may have removed one of its files: install ${label} again; if it still fails, install Microsoft's Visual C++ runtime from ${vc}`;
      }
    } else if (reason === "dll-too-old") {
      detail = `a DLL on this computer is older than ${label} needs — install the latest Microsoft Visual C++ runtime from ${vc}, then try again`;
    } else {
      detail = `a path is too long for ${label} — move the app's data folder to a shorter path`;
    }
    log.warning(`${this.rt.id} server couldn't start (${failure.status}): ${e?.message || e}`);
    return new ApiError(503, "engine-cant-start", `${label} couldn't start`, detail, { reason });
  }

  /** Stop the server (idle, evicted, removed, the app quitting); its booking goes with it. */
  async stopServer() {
    clearTimeout(this._idleTimer);
    if (this.rt.inProcess) return this._releaseLoaded();
    if (this._pool) {
      // every server's booking goes with its models
      this._held.clear();
      for (const kind of kindsOf(this.rt)) for (const p of this.rt.placements ?? ["gpu", "cpu"]) this._arbiter().release(this._instanceKey(kind, p));
      return this._pool.stop();
    }
    const s = this._server;
    this._server = null;
    this._arbiter().release(this._booking().key);
    if (s) s.handle.stop();
  }

  // ── registered models: servers per placement and kind (audio.cpp — round E) ────────────────────────────────────

  /** Where a build's extras unpack: `<its folder>/_extras`. */
  _extrasDir(build, asset) {
    return path.join(binary.runtimeVariantDir(this.cacheRoot, this.rt.folder, build, asset.gpu), "_extras");
  }

  /** Where the runtime's add-ons live — kept across builds. */
  get addonsDir() {
    return path.join(this.root, "_addons");
  }

  /** The environment the runtime's side programs need, from what is installed: the pinned build's extras (eSpeak NG)
   *  and the add-ons (the Japanese dictionary). */
  extrasEnv() {
    const { cfg, asset } = this._pick();
    const espeak = asset?.extras?.find((x) => x.into?.startsWith("espeak"));
    const unidic = (this.rt.defaults.addons ?? []).find((a) => a.id === "unidic");
    return sideEnv({
      espeakDir: espeak && asset ? path.join(this._extrasDir(cfg.pinnedBuild, asset), espeak.into) : null,
      unidicDir: unidic && extraInstalled(this.addonsDir, unidic) ? path.join(this.addonsDir, unidic.into) : null,
    });
  }

  /** The runtime's add-ons and whether each is here: `[{id, name, bytes, installedBytes, installed, status, error,
   *  downloaded, total}]`. */
  addons() {
    return (this.rt.defaults.addons ?? []).map((a) => ({
      id: a.id,
      name: a.name,
      bytes: a.bytes ?? 0,
      installedBytes: a.installedBytes ?? 0,
      installed: extraInstalled(this.addonsDir, a),
      ...(this._addonState?.get(a.id) ?? { status: "", error: "", downloaded: 0, total: 0 }),
    }));
  }

  /** Install add-on `id` in the background (its progress in addons()); its servers start again with it, their models
   *  loading again on next use. Refused `{diskFull}` when it wouldn't fit beside what's there. */
  installAddon(id) {
    const a = (this.rt.defaults.addons ?? []).find((x) => x.id === id);
    if (!a) throw refusal(`${this.rt.label} has no add-on "${id}"`, { notFound: true });
    this._addonState ??= new Map();
    if (this._addonState.get(id)?.status === "installing") return this.addons();
    const need = (a.bytes ?? 0) + (a.installedBytes ?? 0);
    const room = lacksRoom({ dir: this.root, bytes: need, free: this._freeBytesFn });
    if (room) throw noRoom(a.name, room);
    const st = { status: "installing", error: "", downloaded: 0, total: a.bytes ?? 0 };
    this._addonState.set(id, st);
    background(`${this.rt.id} add-on ${id}`, async () => {
      try {
        await installArchive(this.addonsDir, a, {
          onProgress: (downloaded, total) => {
            st.downloaded = downloaded;
            st.total = total || st.total;
          },
        });
        this._addonState.set(id, { status: "installed", error: "", downloaded: 0, total: 0 });
        if (this._pool) await this.stopServer(); // the environment changed: the servers start again with it
      } catch (e) {
        this._addonState.set(id, { status: "error", error: String(e?.message || e), downloaded: 0, total: 0 });
      }
    }, log);
    return this.addons();
  }

  /** Remove add-on `id` (its servers start again without it). */
  async removeAddon(id) {
    const a = (this.rt.defaults.addons ?? []).find((x) => x.id === id);
    if (!a) throw refusal(`${this.rt.label} has no add-on "${id}"`, { notFound: true });
    if (this._pool) await this.stopServer();
    await rm(path.join(this.addonsDir, a.into), { recursive: true, force: true });
    this._addonState?.delete(id);
    return this.addons();
  }

  /** The server entries that load `modelId`: the model itself and each companion (`<id>::<role>`), from its row's
   *  `spec` and its downloaded files — `{family, task, modelSlot?, sessionOptions?, sessionFiles?, companions?,
   *  espeak?}` (sessionFiles: an option whose value is one of its files' paths; espeak: eSpeak NG's paths as the
   *  family's session options). `sessionOptions`: the user's own for this model (the app's options panel). */
  entriesFor(modelId, { sessionOptions = {} } = {}) {
    const row = this._model(modelId);
    const { files } = this.modelFor(modelId);
    const spec = row.spec ?? {};
    const at = (slot) => files[slot] ?? null;
    const opts = { ...(spec.sessionOptions ?? {}), ...(sessionOptions ?? {}) };
    for (const [k, slot] of Object.entries(spec.sessionFiles ?? {})) if (at(slot)) opts[k] = at(slot);
    if (spec.espeak) {
      const env = this.extrasEnv();
      if (env.AUDIOCPP_ESPEAK_LIBRARY) opts[`${spec.family}.espeak_library_path`] = env.AUDIOCPP_ESPEAK_LIBRARY;
      if (env.AUDIOCPP_ESPEAK_DATA) opts[`${spec.family}.espeak_data_path`] = env.AUDIOCPP_ESPEAK_DATA;
    }
    const pairs = Object.entries(opts).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
    const main = new ModelEntry(row.id, spec.family, spec.task, at(spec.modelSlot ?? "model") ?? Object.values(files)[0], pairs);
    return [main, ...(spec.companions ?? []).map((c) => new ModelEntry(`${row.id}::${c.role}`, c.family, c.task, at(c.slot)))];
  }

  /** A server's booking with the arbiter: `<kind>:<runtime>:<placement>` — one model per kind, so a server's measured
   *  memory is its one model's. */
  _instanceKey(kind, placement) {
    return `${kind}:${this.rt.id}:${placement}`;
  }

  /** The card's backend, the ledger's word for it: the installed build's own (its folder — cuda12, cuda13, vulkan, metal;
   *  "cpu" for the CPU build: the word _rating and recordSpeed use), a development build's own backend, or the settings'
   *  choice (`backend`) when it names another; null when nothing is installed. */
  _cardBackend() {
    const exe = this.installedExe();
    if (!exe) return null;
    const dev = this._dev();
    const folder = path.basename(path.dirname(String(exe))).toLowerCase();
    const built = dev ? dev.backend || backendOf(exe) : VARIANT_WORDS.has(folder) ? folder : backendOf(exe);
    const set = String(this._configFn().settings?.backend ?? "auto").toLowerCase();
    return set === "auto" || built.startsWith(set) ? built : set;
  }

  /** An app's development build in place of the installed one (exeOverride — JustVoice's `npm run dev` runs its
   *  checkout's): the override answers a path, or `{exe, backend, version}` (its backend "cuda" | "vulkan" | "metal" |
   *  "cpu" from its build's CMake cache; its version "dev · <commit>"), or null. → `{exe, backend, version}` or null. */
  _dev() {
    const d = this._exeOverride?.();
    if (!d) return null;
    if (typeof d === "string") return { exe: d, backend: null, version: "" };
    return d.exe ? { exe: String(d.exe), backend: d.backend ? String(d.backend) : null, version: String(d.version ?? "") } : null;
  }

  /** The build a measurement belongs to: the pinned build, or a development build's version ("dev" when it says none). */
  _buildTag() {
    const dev = this._dev();
    return dev ? dev.version || "dev" : String(this._configFn().pinnedBuild ?? "");
  }

  /** The CPU server's threads: the setting, else this machine's physical cores. */
  async _cpuThreads() {
    const n = Number(this._configFn().settings?.cpu_threads);
    return n > 0 ? n : await physicalCores();
  }

  /** The kind's model now — `{modelId, placement, device, row}` — or null. */
  _occupant(kind) {
    for (const [modelId, h] of this._held ?? []) {
      if (h.kind !== kind) continue;
      let row = null;
      try {
        row = this._model(modelId);
      } catch {
        row = null; // its row is gone
      }
      return { modelId, placement: h.placement, device: h.device, row };
    }
    return null;
  }

  /** The model a server holds: its `_held` record, or null. */
  _heldOn(kind, placement) {
    for (const h of this._held?.values() ?? []) if (h.kind === kind && h.placement === placement) return h;
    return null;
  }

  /** Book a server's model at `mb` with its honest provenance ("measured" | "computed"); `evictFn` unloads it. */
  _reserveInstance(kind, placement, mb, source) {
    this._arbiter().reserve(this._instanceKey(kind, placement), Math.trunc(mb), {
      kind,
      evictFn: () => this._evictInstance(kind, placement),
      source,
      // What evicting it gives back in system memory — an AI model's load credits it (the kit's RAM door, 2026-10-12).
      ramFn: async () => {
        const h = this._heldOn(kind, placement);
        return h ? this._placement.rssMb(h.pid) : null;
      },
    });
  }

  /** The evictor `makeRoom` runs for one of the servers' bookings: its model leaves (`makeRoom` releases the booking).
   *  No lock: makeRoom never evicts a busy kind, and a kind is busy from the moment a line, a load or an unload is asked
   *  for it (_asKind) — so nothing runs on this model now, and taking the load lock here would wait on the very load
   *  whose room this makes. */
  async _evictInstance(kind, placement) {
    const h = this._heldOn(kind, placement);
    if (h) await this._unloadHeld(h.modelId, { release: false });
  }

  /** A failed or spilled load's model leaves its server (best effort — what registered of it). */
  async _dropEntries(srv, row, entries) {
    if (this._held.get(row.id)?.placement === srv.placement) this._held.delete(row.id);
    try {
      // a family whose memory only its process's end frees (spec.unloadStopsProcess): its process holds no other model
      if (row.spec?.unloadStopsProcess) await srv.stop();
      else await srv.unload(entries.map((e) => e.id).filter((id) => srv.hasModel(id)));
    } catch (e) {
      log.warning(`${this.rt.id}: ${row.id} didn't unload cleanly: ${e?.message || e}`);
    }
  }

  /** `modelId` and its companions leave their server, its booking with them (`release` false: another load already
   *  holds the key), and the answer waits for the card to show the memory freed — a load right after reads the card
   *  free. `heldMb`: what it held, when the key was booked again since. False when no server holds it. */
  async _unloadHeld(modelId, { release = true, heldMb = null } = {}) {
    const h = this._held?.get(modelId);
    if (!h) return false;
    const sp = this._placement;
    const key = this._instanceKey(h.kind, h.placement);
    const held = heldMb ?? Math.trunc(this._arbiter().reservedMb(key) || 0);
    const beforeUsed = held > 0 ? await sp.usedPoolMb() : null;
    this._held.delete(modelId);
    const srv = this._pool.get(h.placement, h.kind);
    try {
      if (h.stopsProcess) await srv.stop();
      else await srv.unload(h.ids);
    } catch (e) {
      if (!(e instanceof AudioCppError)) throw e;
      log.warning(`${this.rt.id}: unloading ${modelId} failed: ${e.message}`);
    }
    if (release) this._arbiter().release(key);
    await sp.waitForDrain(beforeUsed, held);
    return true;
  }

  /**
   * Load `modelId` into its kind's server, registering it and its companions (the fork's model_management — nothing
   * restarts), on `placement` — the user's choice for this model: "auto" (the kit decides — runner/speech_placement.js),
   * "gpu" (the build's own backend) or "cpu" (the same build on the CPU). Before anything moves: the memory checks, and
   * for a model with a price measured here the card's admission and an early booking. The kind's previous model leaves
   * first — and this one from the other placement when it moves. A card load books what its server measured; a model
   * with no price on the card yet calibrates (the app's warm-up speaks a full-length piece) and its peak is recorded. An
   * Auto card load that fails or spills into system memory runs on the CPU instead, and that is remembered. →
   * `{modelId, placement, kind, reason}` — `reason` why it runs there, in words. Refused when the engine isn't installed,
   * its build can't register models (an older build: update it), or memory is short (NotEnoughMemoryError).
   * `cardFailed` (internal): this load's try on the graphics card failed or spilled — how — so this is its retry on the
   * CPU (decided 2026-10-12).
   */
  async loadModel(modelId, opts = {}) {
    if (!this._pool) throw new TypeError(`${this.rt.id} doesn't register models`);
    const kind = this._model(modelId).kind;
    return this._asKind(kind, () => this._loadLock.run(() => this._load(modelId, opts)));
  }

  /** loadModel's work, under the kind's activity lock and the load lock. */
  async _load(modelId, { placement = "auto", sessionOptions = {}, cardFailed = "" } = {}) {
    if (this._removing) throw refusal(`${this.rt.label} is being removed — try again when it's done`, { busy: "engine-busy" });
    const choice = placement == null || placement === "" ? "auto" : String(placement);
    if (!["auto", ...(this.rt.placements ?? [])].includes(choice)) throw new TypeError(`unknown placement "${placement}"`);
    const row = this._model(modelId);
    const kind = row.kind;
    const exe = this.installedExe();
    if (!exe) throw Object.assign(new Error(`${this.rt.label} isn't installed`), { notInstalled: true });
    const cfg = this._configFn();
    if (!this._exeOverride?.() && !buildHas(this.rt, cfg.pinnedBuild, "model_management")) {
      throw refusal(`${this.rt.label} ${cfg.pinnedBuild} can't load models while it runs — update it`, { need: { reason: "update-engine" } });
    }
    // its files here, or "isn't downloaded" — before anything moves
    const entries = this.entriesFor(modelId, { sessionOptions });
    const sp = this._placement;
    const arb = this._arbiter();
    // Where it runs (CPU placement, 2026-10-02): decided before anything moves.
    const decided = await sp.placementFor(row, { choice, cardFailed: Boolean(cardFailed) });
    const where = decided.placement;
    let why = decided.reason;
    // Auto put it on the card (not the user's pin): if that load fails or spills into system memory, it runs on the CPU
    // instead (decided 2026-10-12).
    const autoCard = !cardFailed && choice === "auto" && where === "gpu";
    // You pinned it to the card: it is never refused for memory — when it may not fit, or spills, its reason says so
    // (decided 2026-10-16, "do 1 and 2").
    const pinnedCard = where === "gpu" && choice === "gpu";
    const optsKey = JSON.stringify(entries.map((e) => e.toConfig()));
    const srv = this._pool.get(where, kind);
    // Already loaded there with the same options: nothing to check, fetch or measure.
    const mine = this._held.get(modelId);
    if (mine && mine.placement === where && mine.optsKey === optsKey && srv.isRunning() && srv.hasModel(modelId)) {
      return { modelId, placement: where, kind, reason: mine.reason };
    }
    const device = where === "cpu" ? "cpu" : sp.cardBackend();
    const key = this._instanceKey(kind, where);
    // The kind's model now and its server's booking, read before this load books anything — one model per kind and a
    // key per server, so the two can share a key.
    const occ = this._occupant(kind);
    const occKey = occ ? this._instanceKey(kind, occ.placement) : null;
    const occBooking = occKey ? arb.reservationOf(occKey) : null;
    const occMb = Math.trunc(occBooking?.vram_mb ?? 0);
    let earlyMb = 0; // a prior-measured booking made BEFORE the load confirms
    let replaced = false; // the kind's previous model has left
    try {
      // Refuse before changing anything (audit §13.3, §5 B2): the price and the memory checks come FIRST — before the AI
      // model is unloaded. A known price admits and books EARLY; the check credits what the kind's current model gives
      // back (§5 B5). A model never measured here gets no arithmetic: it loads, calibrates, is measured.
      // A load on the card while an AI model is on it may push the AI model off — the card's admission makes room for a
      // measured model that doesn't fit beside it, Auto's third step unloads it — and that gives the AI model's memory
      // back. Credited here, so this check never refuses what the next steps make room for; checked again without it
      // right before the model registers (JustVoice's TASKS "The two-day review's fixes", 2026-10-12).
      const aiCreditMb = where !== "cpu" && (await sp.aiModelOnCard()) ? await sp.aiModelsRamMb() : 0;
      await sp.admitSystemMemory(row, device, aiCreditMb);
      const books = await sp.booksMemory(device);
      const price = books ? sp.priceMb(row, device) : 0;
      if (price > 0) {
        const short = await sp.admitMemory(row, price, occMb, { pinned: pinnedCard, exclude: key });
        if (short) {
          why =
            `your choice — it took about ${fmtGb(short.needed / 1024)} GB here before and about ` +
            `${fmtGb(short.free / 1024)} GB of the card is free, so it may spill into this machine's ` +
            "memory and run slowly";
        }
        this._reserveInstance(kind, where, price, "measured");
        earlyMb = price;
      }
      // Auto's third step, for a model never measured on the card; it waits for the AI model's memory to drain before
      // the load reads the card.
      if (decided.unloadAi && !price) await sp.unloadAiModel(modelId);
      // The memory check again, without the credit: whatever was going to make room has, so this reading is exact — the
      // last refusal before the model registers.
      if (aiCreditMb > 0) await sp.admitSystemMemory(row, device);
      // A load with no price on the card measures one: its warm-up is a full-length piece.
      const calibrate = books && !price;
      // The kind's previous model leaves first — and this one from the other placement when it moves — and its memory
      // drains before this one's is read.
      for (const [id, h] of [...this._held]) {
        if (h.kind !== kind || (id === modelId && h.placement === where)) continue;
        const k = this._instanceKey(kind, h.placement);
        await this._unloadHeld(id, { release: !(earlyMb && k === key), heldMb: k === occKey ? occMb : null });
        replaced = true;
      }
      const s = cfg.settings ?? {};
      await srv.ensure(exe, [], {
        device: Number(s.gpu ?? 0) || 0,
        threads: where === "cpu" ? await this._cpuThreads() : Math.max(1, Number(s.gpu_threads ?? 4) || 4),
        backend: where === "cpu" ? "cpu" : s.backend && s.backend !== "auto" ? s.backend : null,
        managed: true,
      });
      const pid = srv.pid;
      // The card as this model finds it: the previous model gone and drained — its memory is never this one's.
      const poolBefore = books ? await sp.usedPoolMb() : null;
      // The process's shared GPU memory before the model arrives: what fits leaves it as it was.
      const sharedBefore = autoCard || pinnedCard ? await sp.sharedMb(pid) : null;
      let calibrated = false;
      try {
        for (const e of entries) await srv.register(e);
        // Speak once now, so a Load means loaded and its memory is measured (the app's warm-up: a full-length piece when
        // it calibrates). A failure fails the load with the runtime's own words (audit §5 B4).
        calibrated = Boolean(await sp.warm({ server: srv, row, modelId, entries, calibrate }));
      } catch (e) {
        log.warning(`${this.rt.id}: ${modelId} didn't load on the ${where === "cpu" ? "CPU" : "graphics card"}: ${e?.message || e}`);
        await this._dropEntries(srv, row, entries);
        // Defensive — a release is idempotent, and a reservation nobody releases is a lying ledger.
        arb.release(key);
        earlyMb = 0;
        if (autoCard) {
          log.warning(`${this.rt.id}: ${modelId} didn't load on the graphics card — trying the CPU`);
          return await this._load(modelId, { placement: choice, sessionOptions, cardFailed: "failed" });
        }
        throw e;
      }
      // Loaded, but into system memory: NVIDIA's Windows driver can satisfy an allocation the card has no room for from
      // shared memory instead of failing (JustVoice's RESEARCH §10.14), and the model then runs slowly. That is a failed
      // card load too.
      if (sharedBefore !== null) {
        const sharedAfter = await sp.sharedMb(pid);
        const spilled = sharedAfter !== null ? sharedAfter - sharedBefore : 0;
        if (sharedAfter !== null && spilled > sp.spillMb() && pinnedCard) {
          // Your pin holds: it stays on the card, and says what that costs.
          log.warning(`${this.rt.id}: ${modelId} spilled ${spilled} MB into system memory — kept on the card, your choice`);
          why =
            `your choice — about ${fmtGb(spilled / 1024)} GB of it spilled into this machine's memory, so ` +
            "it runs slowly; Auto would run it on the CPU";
        } else if (sharedAfter !== null && spilled > sp.spillMb()) {
          log.warning(`${this.rt.id}: ${modelId} spilled ${spilled} MB of graphics memory into system memory — trying the CPU`);
          await this._dropEntries(srv, row, entries);
          arb.release(key);
          earlyMb = 0;
          return await this._load(modelId, { placement: choice, sessionOptions, cardFailed: "spilled" });
        }
      }
      const held = {
        modelId,
        placement: where,
        kind,
        ids: entries.map((e) => e.id),
        device,
        reason: why,
        optsKey,
        pid,
        // a family whose memory only its process's end frees: its unload stops the process (spec.unloadStopsProcess)
        stopsProcess: Boolean(row.spec?.unloadStopsProcess),
        ramPeakMb: 0,
        speedRecorded: false,
        priceAtFirstLine: null,
        ramProbing: false,
      };
      this._held.set(modelId, held);
      // The CPU took what the card couldn't: remembered, so the next load goes straight here.
      if (cardFailed) sp.recordCardFailure(row, cardFailed);
      // Book the CONFIRMED load at its MEASURED footprint — the per-process probe of the kind's own server. A known price
      // stays the booking's floor. What is RECORDED as this model's peak (§13.3): a calibrated load's measurement, or
      // any measurement above the price. Probe miss → the device-wide delta, booked "computed". Approved 2026-10-12:
      // "save the fallback card number for models whose probe fails", so Auto learns a model fits (OmniVoice: audio.cpp
      // says 10 GB, the card took 1.2 GB). A model that can speak without a clip calibrates on its load (the app's
      // warm-up); one that speaks only from a clip can't, so its first line sets its price instead — its process's
      // reading after the line, or the whole card's difference since before the load (noteLine). An EARLY booking keeps
      // the price instead.
      if (books) {
        const measured = await sp.procMemMb(pid);
        if (calibrate && !calibrated && sp.prices(pid)) held.priceAtFirstLine = { poolBefore, device };
        if (measured) {
          this._reserveInstance(kind, where, Math.max(measured, earlyMb), "measured");
          if ((calibrated || (earlyMb && measured > earlyMb)) && sp.prices(pid)) sp.recordPeak(row, measured, device);
        } else if (!earlyMb) {
          const after = await sp.usedPoolMb();
          const delta = after !== null && poolBefore !== null ? Math.max(0, after - poolBefore) : 0;
          if (delta > 0) {
            this._reserveInstance(kind, where, delta, "computed");
            if (calibrated && sp.prices(pid)) sp.recordPeak(row, delta, device, "the whole card's difference");
          }
        }
      }
      // The system memory this model holds once loaded — its server's process (4(b)); its lines can raise it (noteLine).
      const ramMb = await sp.rssMb(pid);
      if (ramMb) {
        held.ramPeakMb = ramMb;
        if (sp.prices(pid)) sp.recordRam(row, ramMb, device);
      }
      log.info(`${this.rt.id}: ${modelId} loaded on the ${where === "cpu" ? "CPU" : "graphics card"} (pid ${pid ?? "?"}) — ${why}`);
      return { modelId, placement: where, kind, reason: why };
    } catch (e) {
      // Never leak the EARLY booking on a failed load; release is idempotent. A key the kind's previous model still
      // holds (it hadn't left yet) gets its own booking back.
      if (earlyMb) {
        if (!replaced && occBooking && occKey === key && this._held.has(occ.modelId)) this._reserveInstance(kind, occ.placement, occMb, occBooking.source);
        else arb.release(key);
      }
      throw e;
    }
  }

  /** Let `modelId` (and its companions) go from the server holding it, its booking with it — after any line on it ends;
   *  false when none does. */
  async unloadModel(modelId) {
    const h = this._held?.get(modelId);
    if (!h) return false;
    return this._asKind(h.kind, () => this._loadLock.run(() => this._unloadHeld(modelId)));
  }

  /** The kind's activity lock, made on first use. */
  _activityOf(kind) {
    let m = this._activity.get(kind);
    if (!m) this._activity.set(kind, (m = new Mutex()));
    return m;
  }

  /** `work` under the kind's activity lock, the kind busy on the arbiter from now until it ends — its servers are
   *  never evicted meanwhile (makeRoom skips a busy kind), queued or running. */
  async _asKind(kind, work) {
    const arb = this._arbiter();
    arb.busyBegin(kind);
    try {
      return await this._activityOf(kind).run(work);
    } finally {
      arb.busyEnd(kind);
    }
  }

  /**
   * Run one line on `modelId` — `fn(server, held)`, `server` the one holding it, `held` `{modelId, placement, kind,
   * reason}` — loaded first when it isn't where asked (`placement` "auto": wherever it is, else the kit decides) or
   * holds other `sessionOptions`. The kind's activity lock is held throughout, so no load takes the model away
   * mid-line (JustVoice's manager.js), and the kind is busy on the arbiter. Then its after-line pass (noteLine) with
   * `line(result)` → `{text, audioS}` (what the line said and its audio's seconds; no `line`: only its time).
   */
  async useModel(modelId, { placement = "auto", sessionOptions = undefined, line = null } = {}, fn) {
    if (!this._pool) throw new TypeError(`${this.rt.id} doesn't register models`);
    const kind = this._model(modelId).kind;
    return this._asKind(kind, async () => {
      const h = this._held.get(modelId);
      const srv = h ? this._pool.get(h.placement, h.kind) : null;
      // held where asked, with these options, by a server still running it (a process that ended loads it again)
      const here =
        h &&
        (!placement || placement === "auto" || h.placement === placement) &&
        (sessionOptions === undefined || h.optsKey === this._optsKey(modelId, sessionOptions)) &&
        srv.isRunning() &&
        srv.hasModel(modelId);
      const held = here
        ? { modelId, placement: h.placement, kind: h.kind, reason: h.reason ?? "" }
        : await this._loadLock.run(() => this._load(modelId, { placement, ...(sessionOptions !== undefined ? { sessionOptions } : {}) }));
      this._inUse.set(modelId, (this._inUse.get(modelId) ?? 0) + 1);
      const t0 = performance.now();
      try {
        const result = await fn(this.serverFor(modelId), held);
        let said = {};
        try {
          said = line ? (line(result) ?? {}) : {};
        } catch {
          said = {}; // what the line said is a nicety; the line itself succeeded
        }
        await this.noteLine(modelId, { ...said, wallS: (performance.now() - t0) / 1000, ok: true });
        return result;
      } catch (e) {
        await this.noteLine(modelId, { wallS: (performance.now() - t0) / 1000, ok: false });
        throw e;
      } finally {
        const n = (this._inUse.get(modelId) ?? 1) - 1;
        if (n > 0) this._inUse.set(modelId, n);
        else this._inUse.delete(modelId);
      }
    });
  }

  /** The options a load of `modelId` with `sessionOptions` registers — what a held model is compared on. */
  _optsKey(modelId, sessionOptions) {
    return JSON.stringify(this.entriesFor(modelId, { sessionOptions }).map((e) => e.toConfig()));
  }

  /** What each kind holds now: `[{modelId, placement, kind, reason}]` — `reason` why it runs there, in words. */
  loaded() {
    return [...(this._held ?? [])].map(([modelId, h]) => ({ modelId, placement: h.placement, kind: h.kind, reason: h.reason ?? "" }));
  }

  /** Where `modelId` runs, or would: `{placement, reason}` — a loaded model's own, else the placement's verdict now for
   *  the user's `placement` choice (the row's "Runs on"). */
  async placementOf(modelId, { placement = "auto" } = {}) {
    if (!this._pool) throw new TypeError(`${this.rt.id} doesn't register models`);
    const h = this._held.get(modelId);
    if (h) return { placement: h.placement, reason: h.reason ?? "" };
    const { placement: where, reason } = await this._placement.placementFor(this._model(modelId), { choice: placement || "auto" });
    return { placement: where, reason };
  }

  /** `modelId`'s peak on this machine's graphics card, MB, from an earlier load — null when none measured it. */
  measuredMbFor(modelId) {
    return this._placement ? this._placement.measuredMbFor(this._model(modelId)) : null;
  }

  /** "Try the card again": forget that a card load of `modelId` failed or spilled here (its price and CPU speed stay).
   *  → the rows forgotten. */
  forgetCardFailure(modelId) {
    return this._placement ? this._placement.forgetCardFailure(this._model(modelId)) : 0;
  }

  /**
   * After one line (speech) or clip (transcription) on `modelId` — the job calls it while the line still holds the
   * model: `text` the line's text, `audioS` its audio's seconds (null: none came back), `wallS` how long it took, `ok`
   * whether it succeeded. A speech line that ran away marks its process unpriced; a model its load couldn't measure (it
   * speaks only from a clip) is priced on its first line that spoke (§7 answer 5); the first line of 2 s or more on the
   * CPU after each load records its real-time factor; and the memory high-water is read again in the background
   * (raise-only — a speech model allocates at generate(), not load). Best effort: never fails the work.
   */
  async noteLine(modelId, { text = "", audioS = null, wallS = 0, ok = true } = {}) {
    const h = this._held?.get(modelId);
    if (!h) return;
    try {
      if (h.kind === "tts") this._placement.noteRunaway(h.pid, modelId, text, audioS);
      if (ok) await this._priceFirstLine(modelId, h);
      if (ok) await this._recordCpuSpeed(modelId, h, audioS, wallS);
    } catch (e) {
      log.debug(`${this.rt.id}: after-line pass for ${modelId} failed: ${e?.message || e}`);
    }
    // High-water true-up: generate() is where a speech model's memory peaks — TTL-absorbed, raise-only, never blocks the
    // line.
    background(`${h.kind}-highwater`, () => this._highWater(modelId), log);
  }

  /** The price of a model its load couldn't measure, saved after its first line that spoke: the process's reading
   *  after the line, else — a probe that reads nothing — the whole card's difference since before its load. Booked too,
   *  and never below what is booked. Not after a runaway line. */
  async _priceFirstLine(modelId, h) {
    const first = h.priceAtFirstLine;
    if (!first) return;
    h.priceAtFirstLine = null;
    const sp = this._placement;
    try {
      if (this._held.get(modelId) !== h || !sp.prices(h.pid)) return;
      const row = this._model(modelId);
      const mb = await sp.procMemMb(h.pid);
      const cur = Math.trunc(this._arbiter().reservedMb(this._instanceKey(h.kind, h.placement)) || 0);
      if (mb) {
        this._reserveInstance(h.kind, h.placement, Math.max(mb, cur), "measured");
        sp.recordPeak(row, Math.max(mb, cur), first.device);
        return;
      }
      if (first.poolBefore === null || first.poolBefore === undefined) return;
      const after = await sp.usedPoolMb();
      const delta = after !== null ? Math.max(0, after - first.poolBefore) : 0;
      if (delta <= 0) return;
      if (delta > cur) this._reserveInstance(h.kind, h.placement, delta, "computed");
      sp.recordPeak(row, delta, first.device, "the whole card's difference");
    } catch (e) {
      log.debug(`${this.rt.id}: first-line price failed for ${modelId}: ${e?.message || e}`);
    }
  }

  /** The first line (or clip) a CPU-placed model handles after each load records its real-time factor in the ledger —
   *  from then on Auto reads THIS machine's number, at the CPU-threads setting it ran at. */
  async _recordCpuSpeed(modelId, h, audioS, wallS) {
    if (h.placement !== "cpu" || h.speedRecorded) return;
    if (!audioS || audioS < 2.0 || !(wallS > 0)) return;
    h.speedRecorded = true;
    const threads = String(await this._cpuThreads());
    this.recordSpeed(modelId, {
      label: `CPU real-time factor (${threads} threads)`,
      rows: [{ flagName: "threads", flagValue: threads }],
      kind: h.kind,
      realtimeX: pyRound(audioS / wallS, 2),
      backend: "cpu",
    });
  }

  /** The raise-only HIGH-WATER re-probe after a line: the server's system memory, then its card memory — a reading
   *  above the booking books it and, unless its process ran a runaway line, records it as the model's peak. Never lowers
   *  a booking; best-effort. */
  async _highWater(modelId) {
    const h = this._held?.get(modelId);
    if (!h) return;
    const sp = this._placement;
    // System memory first: the card's probe below returns early for a CPU-placed model.
    await this._bumpRam(modelId, h).catch(() => {});
    // The kind's own process (audit §13.2): its whole measurement is this model's.
    const mb = await sp.procMemMb(h.pid, { fresh: false });
    if (!mb) return;
    try {
      const cur = this._arbiter().reservedMb(this._instanceKey(h.kind, h.placement));
      if (cur === null || mb > cur) {
        // The probe ran while a load could swap the model: still this one's?
        if (this._held.get(modelId) !== h) return;
        // cur null = "not measured yet": the first measured probe CREATES the booking — only where the device books.
        if (cur === null && !(await sp.booksMemory(h.device))) return;
        this._reserveInstance(h.kind, h.placement, mb, "measured");
        if (sp.prices(h.pid)) sp.recordPeak(this._model(modelId), mb, h.device);
      }
    } catch {
      // best-effort
    }
  }

  /** The raise-only high-water for system memory: the server read again, a reading above this load's highest
   *  recorded. One probe at a time per model (it can shell out for a second or two). */
  async _bumpRam(modelId, h) {
    const sp = this._placement;
    if (h.ramProbing || !sp.prices(h.pid)) return;
    h.ramProbing = true;
    try {
      const mb = await sp.rssMb(h.pid);
      if (!mb || mb <= (h.ramPeakMb || 0) || this._held.get(modelId) !== h) return;
      h.ramPeakMb = mb;
      sp.recordRam(this._model(modelId), mb, h.device);
    } finally {
      h.ramProbing = false;
    }
  }

  /** The running server holding `modelId` — speech, transcription and alignment go through it. */
  serverFor(modelId) {
    const h = this._held?.get(modelId);
    if (!h) throw refusal(`${modelId} isn't loaded`, { need: { reason: "not-loaded" } });
    return this._pool.get(h.placement, h.kind);
  }

  // ── in-process: a model in memory (ONNX Runtime — the engines plan's K6) ─────────────────────────────────────

  /**
   * Run `fn(instance)` on model `modelId` held in memory — the app's adapter (`{create({files, ort,
   * executionProvider, dmlDeviceId, log}) → {…, dispose()}}`, its own pre/post-processing) built once, lazily, for
   * these `params` (`executionProvider`: auto · cpu — the feature's preset); another model or other params let the
   * last one go first (one in memory at a time). Before it is built: ONNX Runtime must load here, the model's files
   * be here, and the card make room for its `peakVramMb` on a GPU provider (the arbiter evicts an idle holder; a busy
   * one refuses — EngineBusyError). It is booked with the arbiter (kind vision) while held, the kind busy while `fn`
   * runs, and let go after the runtime's idle time, when evicted, deleted, or on a reset or restore (stopServer).
   */
  async withModel(modelId, { adapter, params = {} }, fn) {
    if (!this.rt.inProcess) throw new TypeError(`${this.rt.id} runs its models in a server, not in-process`);
    const answer = await this.checkRuntime();
    if (!answer.ok) {
      throw new ApiError(503, "engine-cant-run-here", `${this.rt.label} can't run on this computer`, answer.detail, { need: { reason: answer.reason || "cant-load" } });
    }
    const m = this.modelFor(modelId); // its files here, or "isn't downloaded"
    const executionProvider = params.executionProvider ?? "auto";
    const key = `${modelId}\u0000${JSON.stringify({ executionProvider })}`;
    if (this._loaded && this._loaded.key !== key) await this._releaseLoaded();
    const arb = this._arbiter();
    const bookingKey = `${this.rt.kind}:${this.rt.id}`;
    if (!this._loaded) {
      this._loading ??= (async () => {
        const ep = onnx.resolveProvider(executionProvider);
        const mb = ep === "cpu" ? 0 : Number(m.peakVramMb || 0);
        if (mb && !(await arb.makeRoom(mb, { exclude: bookingKey, hardware: this._hardwareFn(), reason: `${this.rt.label} model` }))) {
          throw new EngineBusyError(this.rt.label);
        }
        const ort = await this._ort.load();
        const instance = await adapter.create({ files: m.files, ort: ort?.default ?? ort, executionProvider, dmlDeviceId: this._dmlDeviceIdFn?.(), log });
        this._loaded = { key, modelId, instance, ep, mb, jobs: 0 };
        arb.reserve(bookingKey, mb, { kind: this.rt.kind, evictFn: () => this._releaseLoaded(), source: "declared" });
        log.info(`${this.rt.id}: ${modelId} in memory (${ep})`);
      })().finally(() => {
        this._loading = null;
      });
      await this._loading;
    }
    const held = this._loaded;
    held.jobs++;
    arb.busyBegin(this.rt.kind);
    clearTimeout(this._idleTimer);
    try {
      // the work records its speed itself — the kit can't time it (an app keeps an image's encode): one image's encode in
      // seconds, the vision kind's unit (2026-10-29), on the provider this run used (`held.ep`: "Runs on" can differ)
      return await fn(held.instance, { recordSpeed: (secPerImage) => this.recordSpeed(modelId, { secPerImage, backend: held.ep }) });
    } finally {
      held.jobs--;
      arb.busyEnd(this.rt.kind);
      if (!held.jobs) {
        for (const done of this._drained.splice(0)) done();
        if (this._loaded === held) this._armIdle();
      }
    }
  }

  /** Let the model in memory go — once the runs on it are done (one disposed mid-run fails the run) — and its
   *  booking with it. */
  async _releaseLoaded() {
    clearTimeout(this._idleTimer);
    if (this._loading) await this._loading.catch(() => {});
    while (this._loaded?.jobs) await new Promise((done) => this._drained.push(done));
    const held = this._loaded;
    this._loaded = null;
    this._arbiter().release(`${this.rt.kind}:${this.rt.id}`);
    if (held) {
      try {
        await held.instance?.dispose?.();
      } catch (e) {
        log.warning(`${this.rt.id}: ${held.modelId} didn't let go cleanly: ${e?.message || e}`);
      }
      log.info(`${this.rt.id}: ${held.modelId} let go`);
    }
  }

  /**
   * One job on the running server: room made on the card for its peak (the arbiter evicts the least recently used
   * other holder), the kind busy while it runs, the idle booking and clock back after. `fn(url)` does the job.
   */
  async runJob(fn) {
    if (!this._server?.handle.isAlive()) throw new Error(`${this.rt.label}'s server isn't running`);
    const arb = this._arbiter();
    const { key, idleMb, peakMb } = this._booking();
    arb.busyBegin(this.rt.kind);
    this._jobs += 1;
    try {
      if (peakMb > idleMb && !(await arb.makeRoom(peakMb - idleMb, { exclude: key, hardware: this._hardwareFn(), reason: `${this.rt.label} job` }))) {
        throw new EngineBusyError(this.rt.label);
      }
      this._book(peakMb);
      return await fn(this._server.handle.url);
    } finally {
      this._jobs -= 1;
      arb.busyEnd(this.rt.kind);
      if (this._server?.handle.isAlive()) {
        this._book(idleMb);
        this._armIdle();
      } else {
        arb.release(key);
      }
    }
  }
}

// ── the app's runtime services (one per runtime it turned on) ──────────────────────────────────────────────
let services = new Map();
/** Wire the services installLlm made; the routes read them through `getRuntimeService`. */
export function configureRuntimeServices(map) {
  services = new Map(map);
}
export const getRuntimeService = (id) => services.get(id) ?? null;
export const runtimeServices = () => [...services.values()];

/** Stop every runtime's server — before a reset or a restore replaces the data (Windows keeps a running server's
 *  files locked), beside llama.cpp's own stop. Best effort: one already gone is fine. */
export async function stopRuntimeServers() {
  await Promise.all(runtimeServices().map((s) => s.stopServer().catch(() => {})));
}
