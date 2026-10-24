// SPDX-License-Identifier: MIT
// A kit runtime's engine — status, install, Cancel, uninstall — the way llama.cpp's is (lifecycle.js
// installEngine / engineStatus), for every runtime besides llama.cpp's router (docs/plans/2026-10-24-engines-the-
// llama-way.md, K1 + K3). The builds are the runtime's rows (stores getRuntimeConfig); the install is the kit's
// verified one (binary.acquireRuntime: download → stage → probe → swap) into `<cacheRoot>/<folder>/<build>/<gpu>/`;
// what a build needs from the system (Microsoft's Visual C++ runtime, a macOS, a glibc) is said before the download
// (house-paint's check, moved into the kit). One service per runtime the app turned on (installLlm({ runtimes })).
import { rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { AsyncEvent, background } from "../platform/asyncutil.js";
import { getLogger } from "../platform/log.js";
import * as binary from "./binary.js";
import * as hardware from "./hardware.js";
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

export class RuntimeService {
  /**
   * `id` a runtime with build rows (runner/runtimes.js); `cacheRoot` the kit's engine cache; `configFn()` →
   * `{pinnedBuild, binaries}` (stores getRuntimeConfig); `hardwareFn()` → the kit's detection; `systemFn()` →
   * thisSystem(); `probeArgvs` the launch flags a staged build must accept; `beforeRemove()` stops anything
   * running from the install before it's removed.
   */
  constructor({ id, cacheRoot, configFn, hardwareFn = () => hardware.detected(), systemFn = thisSystem, probeArgvs = null, beforeRemove = async () => {}, acquire = binary.acquireRuntime }) {
    const rt = runtimeOf(id);
    if (!rt?.defaults) throw new TypeError(`no kit runtime "${id}" with build rows`);
    this.rt = rt;
    this.cacheRoot = cacheRoot;
    this._configFn = configFn;
    this._hardwareFn = hardwareFn;
    this._systemFn = systemFn;
    this._probeArgvs = probeArgvs;
    this._beforeRemove = beforeRemove;
    this._acquire = acquire;
    this._state = idle();
    this._cancel = new AsyncEvent();
    this._task = null;
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

  /** What the screen shows: the runtime, its build for this box, whether it's here, what it needs, the install's progress. */
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
      downloadBytes: (asset?.assetBytes || 0) + (asset?.runtimeBytes || 0),
      need: unmetNeed(asset, this._systemFn(), this.rt.label),
      ...this._state,
    };
  }

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

  /** Remove every installed build of this runtime (whatever runs from it stops first). */
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
}

// ── the app's runtime services (one per runtime it turned on) ──────────────────────────────────────────────
let services = new Map();
/** Wire the services installLlm made; the routes read them through `getRuntimeService`. */
export function configureRuntimeServices(map) {
  services = new Map(map);
}
export const getRuntimeService = (id) => services.get(id) ?? null;
export const runtimeServices = () => [...services.values()];
