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
// One service per runtime the app turned on (installLlm({ runtimes })).
import { existsSync, mkdirSync, statSync, writeFileSync } from "node:fs";
import { rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { AsyncEvent, background } from "../platform/asyncutil.js";
import { getLogger } from "../platform/log.js";
import { getArbiter } from "./arbiter.js";
import * as binary from "./binary.js";
import * as hardware from "./hardware.js";
import * as models from "./models.js";
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
  missingDlls: (names) => hardware.missingDlls(names),
});

const idle = () => ({ status: "", detail: "", error: "", downloaded: 0, total: 0 });

/** The card is busy (another kind's job holds it): said in the words the screens already use. */
export class EngineBusyError extends Error {
  constructor(label) {
    super(`The graphics card is busy with another AI job — ${label} starts when it's free`);
    this.name = "EngineBusyError";
  }
}

export class RuntimeService {
  /**
   * `id` a runtime with build rows (runner/runtimes.js); `cacheRoot` the kit's engine cache; `configFn()` →
   * `{pinnedBuild, binaries, idleSeconds}` (stores getRuntimeConfig); `hardwareFn()` → the kit's detection;
   * `systemFn()` → thisSystem(); `probeArgvs` the launch flags a staged build must accept; `server` the runtime's
   * `{argv({port, files, blankPage}), ready(url)}` (runner/sdcpp.js SDCPP_SERVER); `logDir` where its server log and
   * blank page go (the app's runtime root). The rest are seams for tests.
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
    beforeRemove = null,
    acquire = binary.acquireRuntime,
    startServer = processMod.startServerProcess,
    findPort = processMod.findFreePort,
    arbiter = getArbiter,
  }) {
    const rt = runtimeOf(id);
    if (!rt?.defaults) throw new TypeError(`no kit runtime "${id}" with build rows`);
    this.rt = rt;
    this.cacheRoot = cacheRoot;
    this._configFn = configFn;
    this._hardwareFn = hardwareFn;
    this._systemFn = systemFn;
    this._probeArgvs = probeArgvs;
    this._modelsFn = modelsFn;
    this._modelState = new Map(); // model id → { status, error, downloaded, total, cancel }
    this._spec = server;
    this._logDir = logDir || cacheRoot;
    this._beforeRemove = beforeRemove ?? (() => this.stopServer());
    this._acquire = acquire;
    this._startServer = startServer;
    this._findPort = findPort;
    this._arbiter = arbiter;
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
    return { cfg, hw, asset: binary.selectRuntimeAsset(cfg.binaries, hw) };
  }

  /** The installed server's path for this box, or null — never downloads. */
  installedExe() {
    const { cfg, asset } = this._pick();
    return asset ? binary.installedRuntimeExe(this.cacheRoot, this.rt.folder, cfg.pinnedBuild, asset) : null;
  }

  /** What the screen shows: the runtime, its build for this box, whether it's here and running, what it needs, the install's progress. */
  status() {
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
      downloadBytes: (asset?.assetBytes || 0) + (asset?.runtimeBytes || 0),
      need: unmetNeed(asset, this._systemFn(), this.rt.label),
      ...this._state,
    };
  }

  // ── the engine ─────────────────────────────────────────────────────────────────────────────────

  /** Start the install in the background (its progress in status()); throws `{need}` when this computer can't run the build. */
  install({ gpu = null, force = false } = {}) {
    if (this._state.status === "installing") return this.status();
    const { asset } = this._pick();
    const need = unmetNeed(asset, this._systemFn(), this.rt.label);
    if (need) throw Object.assign(new Error(need.detail), { need });
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
    } catch (e) {
      const cancelled = this._cancel.isSet();
      this._state = { ...idle(), status: cancelled ? "cancelled" : "error", error: cancelled ? "" : String(e?.message || e) };
      if (!cancelled) log.warning(`${this.rt.id} engine install failed: ${e?.message || e}`);
    }
  }

  /** Stop an install at its next download chunk. */
  cancelInstall() {
    this._cancel.set();
    return this.status();
  }

  /** Remove every installed build of this runtime (its server stops first). */
  async uninstall() {
    if (this._task?.isAlive()) {
      this._cancel.set();
      await Promise.race([this._task.promise, new Promise((r) => setTimeout(r, 30_000).unref?.())]);
    }
    await this._beforeRemove();
    await rm(this.root, { recursive: true, force: true, maxRetries: os.platform() === "win32" ? 5 : 0, retryDelay: 200 });
    this._state = idle();
    return this.status();
  }

  // ── the models (pinned file sets in the kit's HF cache: `<cacheRoot>/hf`) ──────────────────────────

  get hfRoot() {
    return path.join(this.cacheRoot, "hf");
  }

  _fileAt(f) {
    return models.snapshotFilePath(this.hfRoot, f.repo, f.revision, f.path);
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

  /** Each model: its size, whether all its files are here (`onDisk`), whether the server runs it, its download's progress
   *  (`status`, `downloaded` bytes of `total`). */
  modelsStatus() {
    return this._modelsFn().map((m) => {
      const { cancel, ...state } = this._modelState.get(m.id) ?? { status: "", error: "", downloaded: 0, total: 0 };
      return {
        id: m.id,
        name: m.name,
        kind: m.kind,
        license: m.license,
        bytes: m.files.reduce((a, f) => a + Number(f.bytes || 0), 0),
        onDisk: this._here(m),
        running: this._server?.handle.isAlive() && this._server.modelKey === m.id,
        ...state,
      };
    });
  }

  /** Start a model's download in the background (its progress in modelsStatus()). */
  downloadModel(id) {
    const m = this._model(id);
    const st = this._modelState.get(id);
    if (st?.status === "downloading") return this.modelsStatus().find((x) => x.id === id);
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

  /** Remove a model's files (the server stops first if it runs it); a file another model row uses stays. */
  async deleteModel(id) {
    const m = this._model(id);
    if (this._server?.modelKey === id) await this.stopServer();
    const others = new Set(this._modelsFn().filter((x) => x.id !== id).flatMap((x) => x.files.map((f) => f.sha256)));
    for (const f of m.files) {
      if (others.has(f.sha256)) continue;
      await rm(this._fileAt(f), { force: true });
      await rm(path.join(this.hfRoot, `models--${f.repo.replaceAll("/", "--")}`, "blobs", f.sha256), { force: true });
    }
    this._modelState.delete(id);
    return this.modelsStatus().find((x) => x.id === id);
  }

  /** The models whose files are in use and must not be deleted: downloading, or running a job on the server. */
  busyModels() {
    const ids = [...this._modelState].filter(([, s]) => s.status === "downloading").map(([id]) => id);
    if (this._jobs > 0 && this._server?.modelKey && !ids.includes(this._server.modelKey)) ids.push(this._server.modelKey);
    return ids;
  }

  /** Every file this runtime's model rows put in the HF cache: each one's snapshot entry and its blob. */
  modelFiles() {
    const out = new Set();
    for (const m of this._modelsFn()) {
      for (const f of m.files) {
        out.add(this._fileAt(f));
        out.add(path.join(this.hfRoot, `models--${f.repo.replaceAll("/", "--")}`, "blobs", f.sha256));
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
    const blankPage = path.join(this._logDir, `${this.rt.id}-blank.html`);
    writeFileSync(blankPage, "<!doctype html><title>.</title>\n"); // its WebUI off: an empty page at / (no flag turns it off)
    const port = await this._findPort("127.0.0.1", 18900);
    const url = `http://127.0.0.1:${port}`;
    const handle = await this._startServer(exe, this._spec.argv({ port, files, blankPage }), {
      url,
      health: (u) => this._spec.ready(u),
      label: `${this.rt.label} server`,
      note: modelKey,
      logPath: path.join(this._logDir, `${this.rt.id}-server.log`),
      probeTimeout: 60,
    });
    this._server = { handle, modelKey, peakMb: Number(peakVramMb) || 0 };
    this._book(this._booking().idleMb);
    this._armIdle();
    return handle;
  }

  /** Stop the server (idle, evicted, removed, the app quitting); its booking goes with it. */
  async stopServer() {
    clearTimeout(this._idleTimer);
    const s = this._server;
    this._server = null;
    this._arbiter().release(this._booking().key);
    if (s) s.handle.stop();
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
