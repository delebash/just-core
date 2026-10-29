// SPDX-License-Identifier: MIT
// audio.cpp's engine in the kit (round E, 2026-10-29 — JustVoice's session read the kit and listed B1–B14 and G1–G12; the
// user: "just do it think on your recs adverserily"): the `backend` setting picks the build and names the card server's
// backend, a development build's own included (B1, B2); Install, Update and Reinstall stop the servers around the swap,
// after the line in flight (B3); the add-on and the removal wait for it too (B6); the servers die with the app (B7);
// the release's Python stays out (B8); macOS Intel has its build back (B9); the status says what runs and how the tab
// shows each setting (B13, G8). The install is a stand-in that lays the server down inside the service's hold around the
// swap; the servers are stubs. Nothing downloads, nothing starts.
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, expect, test } from "vitest";
import { boxArch, rowFitsBox, runtimeVariantDir, selectRuntimeAsset } from "../src/runner/binary.js";
import {
  binaryAsset,
  DEFAULT_AUDIOCPP_BINARIES,
  DEFAULT_AUDIOCPP_BUILD,
  DEFAULT_AUDIOCPP_SETTINGS,
  DEFAULT_SDCPP_BINARIES,
  DEFAULT_SDCPP_BUILD,
} from "../src/runner/config.js";
import { which } from "../src/runner/hardware.js";
import { configureRuntimeServices, killRuntimeServersSync, RuntimeService } from "../src/runner/runtime_service.js";

const NVIDIA_BOX = { platform: "windows", runtimes: { cuda: true, vulkan: true }, gpus: [{ name: "RTX 2070", computeCap: "7.5" }] };
const system = () => ({ platform: "win32", arch: "x64", versions: {}, missingDlls: () => [] });
// its build rows as getRuntimeConfig gives them — their extras left out: nothing here downloads one
const asRow = (b) => ({ ...binaryAsset(b), assetBytes: b.asset_bytes, runtimeBytes: b.runtime_bytes ?? 0, requires: b.requires ?? {}, extras: [] });
const AC_ROWS = DEFAULT_AUDIOCPP_BINARIES.map(asRow);

let root;
beforeEach(() => {
  root = mkdtempSync(path.join(tmpdir(), "kit-ac-engine-"));
});
afterEach(() => {
  configureRuntimeServices([]);
  rmSync(root, { recursive: true, force: true });
});

/** acquireRuntime's stand-in: lays the server down inside the caller's hold around the swap (`aroundSwap`), as
 *  _stageAndSwap does; records what it was handed. `onSwap()` runs as the build goes in. */
function fakeAcquire({ exe = "audiocpp_server.exe", variant = "cuda12", onSwap = null } = {}) {
  const calls = [];
  const fn = async (cacheRoot, folder, build, binaries, hw, opts) => {
    calls.push({ gpu: opts.gpu, force: opts.force, preferredGpu: opts.preferredGpu, dropFiles: opts.dropFiles });
    const dir = runtimeVariantDir(cacheRoot, folder, build, variant);
    const swap = async () => {
      onSwap?.();
      mkdirSync(dir, { recursive: true });
      writeFileSync(path.join(dir, exe), "");
    };
    if (opts.aroundSwap) await opts.aroundSwap(swap);
    else await swap();
    return path.join(dir, exe);
  };
  return { fn, calls };
}
const noDownload = async () => {
  throw new Error("this test's install has no acquire stand-in");
};

/** A server process: running or not; stopping says so in `order`. */
class StubServer {
  constructor(placement, kind, order) {
    Object.assign(this, { placement, kind, order, running: false, killed: false, models: new Set() });
  }
  isRunning() {
    return this.running;
  }
  hasModel(id) {
    return this.running && this.models.has(id);
  }
  async stop() {
    this.order?.push(`stop ${this.placement}/${this.kind}`);
    this.running = false;
  }
  killSync() {
    this.killed = true;
    this.running = false;
  }
}
class StubPool {
  constructor(order = null) {
    this.order = order;
    this.map = new Map();
  }
  get(placement = "gpu", kind = "tts") {
    const k = `${placement}/${kind}`;
    if (!this.map.has(k)) this.map.set(k, new StubServer(placement, kind, this.order));
    return this.map.get(k);
  }
  servers() {
    return [...this.map.values()];
  }
  async stop() {
    for (const s of this.map.values()) if (s.running) await s.stop();
  }
  killAllSync() {
    for (const s of this.map.values()) s.killSync();
  }
}

const acService = ({ settings = {}, hw = NVIDIA_BOX, order = null, ...extra } = {}) => {
  const svc = new RuntimeService({
    id: "audiocpp",
    cacheRoot: root,
    configFn: () => ({ id: "audiocpp", pinnedBuild: DEFAULT_AUDIOCPP_BUILD, binaries: AC_ROWS, settings: { ...DEFAULT_AUDIOCPP_SETTINGS, ...settings } }),
    hardwareFn: () => hw,
    systemFn: system,
    acquire: noDownload,
    freeBytesFn: () => 1e13,
    ...extra,
  });
  svc._pool = new StubPool(order);
  return svc;
};
const sdService = (extra = {}) =>
  new RuntimeService({
    id: "sdcpp",
    cacheRoot: root,
    configFn: () => ({ id: "sdcpp", pinnedBuild: DEFAULT_SDCPP_BUILD, binaries: DEFAULT_SDCPP_BINARIES.map(asRow) }),
    hardwareFn: () => NVIDIA_BOX,
    systemFn: system,
    acquire: noDownload,
    freeBytesFn: () => 1e13,
    ...extra,
  });
const until = async (check) => {
  for (let i = 0; i < 200 && !check(); i++) await new Promise((r) => setTimeout(r, 5));
};
const settle = () => new Promise((r) => setTimeout(r, 30));

test("the backend setting picks the build — the one of that family this box can run, else Auto's; the install fetches it (B2)", async () => {
  expect(acService()._pick().asset.gpu).toBe("cuda12"); // an RTX 20-series: CUDA 12
  expect(acService({ settings: { backend: "vulkan" } })._pick().asset.gpu).toBe("vulkan");
  expect(acService({ settings: { backend: "cpu" } })._pick().asset.gpu).toBe("cpu");
  expect(acService({ settings: { backend: "cuda" } })._pick().asset.gpu).toBe("cuda12");
  expect(acService({ settings: { backend: "metal" } })._pick().asset.gpu).toBe("cuda12"); // no Metal on this box: Auto's
  const acq = fakeAcquire({ variant: "vulkan" });
  const svc = acService({ settings: { backend: "vulkan" }, acquire: acq.fn });
  svc.install();
  await svc._task.promise;
  expect(acq.calls[0].preferredGpu).toBe("vulkan");
  expect(svc.status()).toMatchObject({ gpu: "vulkan", installed: true });
});

test("the card's server runs the setting's backend, a development build's own, else its build folder's (B1)", () => {
  const exe = path.join(root, "audiocpp", DEFAULT_AUDIOCPP_BUILD, "cuda12", "audiocpp_server.exe");
  expect(acService()._serverBackend(exe)).toBe("cuda");
  expect(acService({ settings: { backend: "cuda" } })._serverBackend(exe)).toBe("cuda");
  // a family this box can't run picked no build of it: the build's own backend stands, never one it doesn't run
  expect(acService({ settings: { backend: "metal" } })._serverBackend(exe)).toBe("cuda");
  // `npm run dev`: the checkout's build — its folder says nothing ("…/build/jv-dev/bin" read as "cpu")
  const devExe = path.join(root, "build", "jv-dev", "bin", "audiocpp_server.exe");
  const dev = (d, settings = {}) => acService({ settings, exeOverride: () => d });
  expect(dev({ exe: devExe, backend: "cuda", version: "dev · abc" })._serverBackend(devExe)).toBe("cuda");
  expect(dev({ exe: devExe, backend: "cuda" }, { backend: "vulkan" })._serverBackend(devExe)).toBe("vulkan"); // your setting
  expect(dev(devExe)._serverBackend(devExe)).toBe("cpu"); // a bare path: nothing says its backend
});

test("the install leaves the release's Python scripts out; sd.cpp's drops nothing (B8)", async () => {
  const acq = fakeAcquire();
  const svc = acService({ acquire: acq.fn });
  svc.install();
  await svc._task.promise;
  const drop = acq.calls[0].dropFiles;
  expect([drop("tools/convert_weights.py"), drop("bin/TOOL.PY"), drop("audiocpp_server.exe"), drop("python3.dll")]).toEqual([true, true, false, false]);
  const sd = fakeAcquire({ exe: "sd-server.exe" });
  const s = sdService({ acquire: sd.fn });
  s.install();
  await s._task.promise;
  expect(sd.calls[0].dropFiles).toBeNull();
});

test("Install, Update and Reinstall stop the servers before the new build goes in — once the line in flight has ended (B3)", async () => {
  const order = [];
  const acq = fakeAcquire({ onSwap: () => order.push("swap") });
  const svc = acService({ acquire: acq.fn, order });
  svc._pool.get("gpu", "tts").running = true;
  svc._pool.get("cpu", "stt").running = true;
  let end;
  const line = svc._asKind("tts", () => new Promise((r) => (end = r))); // a line on the speech model
  svc.install({ force: true });
  await until(() => acq.calls.length === 1);
  await settle();
  expect(order).toEqual([]); // the build waits for the line
  expect(svc.status().status).toBe("installing"); // and the engine says so meanwhile
  end();
  await line;
  await svc._task.promise;
  expect(order).toEqual(["stop gpu/tts", "stop cpu/stt", "swap"]);
  expect(svc._serversRunning()).toBe(false);
  expect(svc.status().status).toBe("installed");
  // sd.cpp's one server: its job ends first, then it stops for the swap
  const sdOrder = [];
  const sd = sdService({ acquire: fakeAcquire({ exe: "sd-server.exe", onSwap: () => sdOrder.push("swap") }).fn });
  sd._jobs = 1;
  sd.install({ force: true });
  await settle();
  expect(sdOrder).toEqual([]);
  sd._jobs = 0;
  for (const done of sd._jobsDrained.splice(0)) done();
  await sd._task.promise;
  expect(sdOrder).toEqual(["swap"]);
});

test("removing the dictionary waits for the line in flight; the runtime isn't removed while a line runs (B6)", async () => {
  const order = [];
  const svc = acService({ order });
  svc._pool.get("gpu", "tts").running = true;
  let end;
  const line = svc._asKind("tts", () => new Promise((r) => (end = r)));
  const removal = svc.removeAddon("unidic").then(() => order.push("removed"));
  await settle();
  expect(order).toEqual([]);
  end();
  await line;
  await removal;
  expect(order).toEqual(["stop gpu/tts", "removed"]);
  // a line running on one of its models: refused, busy — as for a job
  svc._inUse.set("kokoro", 1);
  await expect(svc.uninstall()).rejects.toMatchObject({ busy: "engine-busy" });
  svc._inUse.clear();
  // the removal itself waits for a line too (its servers stop under the kinds' locks)
  const stops = [];
  const quiet = acService({ order: stops });
  quiet._pool.get("gpu", "stt").running = true;
  let finish;
  const sttLine = quiet._asKind("stt", () => new Promise((r) => (finish = r)));
  const gone = quiet.uninstall();
  await settle();
  expect(stops).toEqual([]);
  finish();
  await sttLine;
  await gone;
  expect(stops).toEqual(["stop gpu/stt"]);
});

test("macOS Intel has its build back: the x64 Metal row on an Intel Mac, the arm64 one on Apple silicon (B9)", () => {
  const mac = (arch) => ({ platform: "macos", arch, runtimes: { metal: true }, gpus: [] });
  const intel = selectRuntimeAsset(AC_ROWS, mac("x64"));
  expect(intel).toMatchObject({ platform: "macos-x64", gpu: "metal", sha256: "edfda2bce4a719f2307466daf3e25760f5c61f159bbdc3f0cec8246d84f955f5", assetBytes: 37675142 });
  expect(intel.assetUrl).toMatch(/audio-v0\.9\.2-jv\.6-bin-macos-x64-metal\.tar\.gz$/);
  expect(selectRuntimeAsset(AC_ROWS, mac("arm64"))).toMatchObject({ platform: "macos", gpu: "metal", sha256: "b97e66f85ecfce7aa597fcbabced9eeba4907e049f520da46826d71d3b94c1ef" });
  // a database seeded before: its macOS row names no processor — the Intel row, named for this one, still wins
  const old = AC_ROWS.map((r) => (r.platform === "macos" ? { ...r, requires: {} } : r));
  expect(selectRuntimeAsset(old, mac("x64")).platform).toBe("macos-x64");
  expect(selectRuntimeAsset(old, mac("arm64")).platform).toBe("macos");
  // the eSpeak NG beside it is the Intel wheel
  const row = DEFAULT_AUDIOCPP_BINARIES.find((b) => b.platform === "macos-x64");
  expect(row.extras[0]).toMatchObject({ bytes: 9938387, sha256: "b77477ae2ddf62a748e04e49714eabb2f3a24f344166200b00539083bd669904" });
  expect(row.extras[0].url).toMatch(/macosx_10_12_x86_64\.whl$/);
  // never a Windows or Linux box's; the processor read from this process when detection doesn't say
  expect(rowFitsBox(intel, { platform: "windows" })).toBe(false);
  expect(boxArch({})).toBe(process.arch);
  expect(acService({ hw: mac("x64") })._pick().asset.platform).toBe("macos-x64");
});

test("the status says what a pool runtime runs, and how its tab shows each setting on this machine (B13, G8)", async () => {
  const svc = acService();
  for (const [modelId, placement, kind] of [["kokoro", "gpu", "tts"], ["parakeet", "cpu", "stt"]]) {
    svc._held.set(modelId, { modelId, placement, kind, reason: "" });
    const srv = svc._pool.get(placement, kind);
    srv.running = true;
    srv.models.add(modelId);
  }
  await svc.prepareStatus();
  const s = svc.status();
  expect(s.running).toBe("kokoro, parakeet");
  expect(s.settingsUi.backend).toEqual({
    control: "select",
    choices: [
      { value: "auto", label: "Auto" },
      { value: "cuda", label: "CUDA (NVIDIA)" },
      { value: "vulkan", label: "Vulkan" },
      { value: "cpu", label: "CPU" },
    ],
  });
  expect(s.settingsUi.gpu).toEqual({ control: "select", choices: [{ value: 0, label: "0 · RTX 2070" }], hidden: true }); // one card
  expect(s.settingsUi.cpu_threads).toEqual({ control: "number", of: expect.any(Number) });
  expect(s.settingsUi.cpu_threads.of).toBeGreaterThan(0);
  expect(s.settingsUi.card_margin_mb).toEqual({ control: "number" });
  expect(Object.keys(s.settingsUi).sort()).toEqual(Object.keys(DEFAULT_AUDIOCPP_SETTINGS).sort());
  // the card-overflow limit where a process's shared graphics memory is read: NVIDIA on Windows, with typeperf
  expect(Boolean(s.settingsUi.spill_mb.hidden)).toBe(!which("typeperf"));
  // two cards: the card's select shows; an AMD box: no CUDA build offered, no spill reading
  const two = acService({ hw: { ...NVIDIA_BOX, gpus: [{ name: "RTX 2070" }, { name: "RTX 4090" }] } }).status().settingsUi;
  expect(two.gpu).toEqual({ control: "select", choices: [{ value: 0, label: "0 · RTX 2070" }, { value: 1, label: "1 · RTX 4090" }] });
  const amd = acService({ hw: { platform: "windows", runtimes: { vulkan: true }, gpus: [{ name: "RX 7900" }] } }).status().settingsUi;
  expect(amd.backend.choices.map((c) => c.value)).toEqual(["auto", "vulkan", "cpu"]);
  expect(amd.spill_mb.hidden).toBe(true);
  // sd.cpp declares no settings: none to show
  expect(sdService().status().settingsUi).toBeUndefined();
  // a model whose server stopped is no longer what runs, nor booked (B5)
  svc._pool.get("cpu", "stt").running = false;
  expect(svc.status().running).toBe("kokoro");
  expect(svc.loaded().map((l) => l.modelId)).toEqual(["kokoro"]);
});

test("the speech servers are killed when the app quits — one exit listener for every service (B7)", () => {
  acService(); // the first service arms it
  const before = process.listenerCount("exit");
  const svcs = [acService(), acService(), acService()];
  expect(process.listenerCount("exit")).toBe(before);
  for (const s of svcs) s._pool.get("gpu", "tts").running = true;
  killRuntimeServersSync();
  expect(svcs.map((s) => s._pool.get("gpu", "tts").killed)).toEqual([true, true, true]);
});
