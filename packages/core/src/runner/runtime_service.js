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
import { AsyncEvent, background } from "../platform/asyncutil.js";
import { freeBytes, lacksRoom } from "../platform/disk_room.js";
import { ApiError } from "../platform/errors.js";
import { getLogger } from "../platform/log.js";
import { getArbiter } from "./arbiter.js";
import * as binary from "./binary.js";
import { buildsInUse, recordBuild } from "./cache_registry.js";
import * as fit from "./fit.js";
import * as hardware from "./hardware.js";
import * as models from "./models.js";
import * as onnx from "./onnx.js";
import * as processMod from "./process.js";
import { runtimeOf } from "./runtimes.js";

const log = getLogger("llm_runner.runner.runtime_service");

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
   * nothing measured). The rest are seams for tests (`freeBytesFn(dir)` a drive's free room).
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
    startServer = processMod.startServerProcess,
    findPort = processMod.findFreePort,
    arbiter = getArbiter,
    freeBytesFn = freeBytes,
    measurements = null,
    ort = null,
    dmlDeviceIdFn = () => onnx.bestDmlAdapter(hardware.dxgiAdapters?.() ?? []),
    ortCheck = onnx.ortRuntimeCheck,
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
    this._measurements = measurements;
    this._removing = false; // the engine's folder is going: nothing installs into it or starts from it
    this._state = idle();
    this._cancel = new AsyncEvent();
    this._task = null;
    this._server = null; // { handle, modelKey }
    this._jobs = 0; // jobs running on the server now
    this._starting = null;
    this._idleTimer = null;
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
    const exe = asset ? binary.installedRuntimeExe(this.cacheRoot, this.rt.folder, cfg.pinnedBuild, asset) : null;
    return {
      id: this.rt.id,
      kind: this.rt.kind,
      label: this.rt.label,
      build: cfg.pinnedBuild,
      platform: hw.platform,
      gpu: asset?.gpu ?? "",
      installed: exe != null,
      serverExe: exe ? String(exe) : "",
      running: this._server?.handle.isAlive() ? this._server.modelKey : "",
      // how long it waits idle before it lets go of its memory (a seeded setting; 0: never)
      idleSeconds: Number(cfg.idleSeconds ?? this.rt.defaults.idleSeconds ?? 0),
      downloadBytes: (asset?.assetBytes || 0) + (asset?.runtimeBytes || 0),
      need: unmetNeed(asset, this._systemFn(), this.rt.label),
      ...this._state,
    };
  }

  // ── the engine ─────────────────────────────────────────────────────────────────────────────────

  /** Start the install in the background (its progress in status()); throws `{need}` when this computer can't run the
   *  build, `{diskFull}` when it wouldn't fit the drive, `{busy}` while the engine is being removed. */
  install({ gpu = null, force = false } = {}) {
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
    const promise = background(`${this.rt.id} engine install`, () => this._run(gpu, force), log).finally(() => {
      done = true;
    });
    this._task = { promise, isAlive: () => !done };
    return this.status();
  }

  async _run(gpu, force) {
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
      this._state = { ...idle(), status: "installed" };
      await this._sweepStaleBuilds(cfg.pinnedBuild);
    } catch (e) {
      const cancelled = this._cancel.isSet();
      this._state = { ...idle(), status: cancelled ? "cancelled" : "error", error: cancelled ? "" : String(e?.message || e) };
      if (!cancelled) log.warning(`${this.rt.id} engine install failed: ${e?.message || e}`);
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
      stale = readdirSync(this.root, { withFileTypes: true }).filter((d) => d.isDirectory() && d.name !== keep && !others.builds.has(d.name));
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
    return `${this.rt.kind}:${this.rt.id}:${modelId}`;
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
    const bands = cfg.bands;
    const field = bands?.unit === "s/image" ? "secPerImage" : "realtimeX";
    let rows = [];
    try {
      rows = this._measurements?.list(this._ledgerId(m.id)) ?? [];
    } catch {
      rows = []; // no ledger wired (a bare test)
    }
    const mkey = hardware.machineKey(hw);
    const row = rows.find((r) => r.machineKey === mkey && (r.backend || "") === (asset?.gpu || "") && Number(r[field]) > 0);
    const measured = row ? Number(row[field]) : null;
    const predicted = asset ? Number(m.refSpeed?.[asset.gpu]) || null : null;
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
   *  `fields` in the kind's unit (`{secPerImage}` for an image). Best effort: never fails the job. */
  recordSpeed(modelId, fields) {
    if (!this._measurements) return;
    try {
      const { hw, asset } = this._pick();
      this._measurements.record(this._ledgerId(modelId), {
        machineKey: hardware.machineKey(hw),
        source: "speed",
        label: `${this.rt.label} (${asset?.gpu || "no build"})`,
        tokensPerSec: 0,
        vramTotalMb: 0,
        at: Date.now(),
        rows: [],
        kind: this.rt.kind,
        backend: asset?.gpu ?? "",
        ...fields,
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
        running: (this._server?.handle.isAlive() && this._server.modelKey === m.id) || this._loaded?.modelId === m.id,
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
    const s = this._server;
    this._server = null;
    this._arbiter().release(this._booking().key);
    if (s) s.handle.stop();
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
      return await fn(held.instance);
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
