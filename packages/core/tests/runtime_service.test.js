// SPDX-License-Identifier: MIT
// A kit runtime's engine — status, install with progress and Cancel, what the build needs, removal — and its
// routes (/v1/ai/runtimes), the way llama.cpp's engine works (docs/plans/2026-10-24-engines-the-llama-way.md,
// K1 + K3). The install itself is the kit's acquireRuntime (tested in binary's own tests): here a stand-in that
// lays the server where the real one would. K10b: the room on the drive before anything downloads, slow here, nothing
// installed into or started from an engine being removed.
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, expect, test } from "vitest";
import { DEFAULT_SDCPP_BINARIES, DEFAULT_SDCPP_BUILD, binaryAsset } from "../src/runner/config.js";
import { runtimeVariantDir } from "../src/runner/binary.js";
import { configureRuntimeServices, RuntimeService, unmetNeed } from "../src/runner/runtime_service.js";
import { makeRuntimesRouter } from "../src/llm/runtimes_api.js";
import { ROOM_MARGIN } from "../src/platform/disk_room.js";
import { createServer } from "../src/platform/server.js";

const NVIDIA_BOX = { platform: "windows", runtimes: { cuda: true, vulkan: true }, gpus: [{ computeCap: "7.5" }] };
// as stores.getRuntimeConfig gives them
const ROWS = DEFAULT_SDCPP_BINARIES.map((b) => ({
  ...binaryAsset(b),
  assetBytes: b.asset_bytes,
  runtimeBytes: b.runtime_bytes ?? 0,
  requires: b.requires,
  assetUnpackedBytes: b.asset_unpacked_bytes ?? 0,
  runtimeUnpackedBytes: b.runtime_unpacked_bytes ?? 0,
}));
const config = () => ({ id: "sdcpp", pinnedBuild: DEFAULT_SDCPP_BUILD, binaries: ROWS });
const system = (missing = []) => ({ platform: "win32", arch: "x64", versions: {}, missingDlls: (names) => names.filter((n) => missing.includes(n)) });

let root;
beforeEach(() => {
  root = mkdtempSync(path.join(tmpdir(), "kit-runtime-"));
});
afterEach(() => {
  configureRuntimeServices([]);
  rmSync(root, { recursive: true, force: true });
});

/** acquireRuntime's stand-in: reports progress, honours Cancel, lays the server down. */
function fakeAcquire({ hold = false } = {}) {
  const calls = [];
  const fn = async (cacheRoot, folder, build, binaries, hw, opts) => {
    calls.push({ folder, build, gpu: opts.gpu, probeArgvs: opts.probeArgvs });
    opts.onProgress(10, 100);
    while (hold && !opts.cancelCheck()) await new Promise((r) => setTimeout(r, 5));
    if (opts.cancelCheck()) throw new Error("cancelled");
    const dir = runtimeVariantDir(cacheRoot, folder, build, "cuda12");
    mkdirSync(dir, { recursive: true });
    writeFileSync(path.join(dir, "sd-server.exe"), "");
    return path.join(dir, "sd-server.exe");
  };
  return { fn, calls };
}
const until = async (check) => {
  for (let i = 0; i < 200 && !check(); i++) await new Promise((r) => setTimeout(r, 5));
};
// never the real acquireRuntime: a test that installs passes its own stand-in (nothing here downloads)
const noDownload = async () => {
  throw new Error("this test's install has no acquire stand-in");
};
const service = (extra = {}) => new RuntimeService({ id: "sdcpp", cacheRoot: root, configFn: config, hardwareFn: () => NVIDIA_BOX, systemFn: () => system(), acquire: noDownload, ...extra });

test("status: this box's build, its download size, not installed, nothing it lacks", () => {
  const s = service().status();
  expect(s).toMatchObject({ id: "sdcpp", kind: "image", label: "stable-diffusion.cpp", build: DEFAULT_SDCPP_BUILD, gpu: "cuda12", installed: false, need: null });
  expect(s.downloadBytes).toBe(343489328 + 563452046); // the build + its CUDA runtime
});

test("install: progress, then installed with the server in the cache — the launch-flag probe handed to the install", async () => {
  const acq = fakeAcquire();
  const svc = service({ acquire: acq.fn, probeArgvs: [["--help"]] });
  expect(svc.install().status).toBe("installing");
  await until(() => svc.status().status === "installed");
  expect(svc.status()).toMatchObject({ installed: true, status: "installed" });
  expect(svc.status().serverExe).toContain(path.join("sdcpp", DEFAULT_SDCPP_BUILD, "cuda12"));
  expect(acq.calls[0]).toMatchObject({ folder: "sdcpp", build: DEFAULT_SDCPP_BUILD, probeArgvs: [["--help"]] });
});

test("Cancel stops the install at its next chunk; the engine isn't there", async () => {
  const svc = service({ acquire: fakeAcquire({ hold: true }).fn });
  svc.install();
  await until(() => svc.status().downloaded === 10);
  svc.cancelInstall();
  await until(() => svc.status().status === "cancelled");
  expect(svc.status()).toMatchObject({ status: "cancelled", installed: false, error: "" });
});

test("a build this computer can't run is said before the download — Visual C++, macOS, glibc", () => {
  const cuda = ROWS.find((r) => r.gpu === "cuda12" && r.platform === "windows");
  expect(unmetNeed(cuda, system(["VCOMP140.DLL"]))).toMatchObject({ reason: "vc-runtime", missing: ["VCOMP140.DLL"] });
  const mac = ROWS.find((r) => r.platform === "macos");
  expect(unmetNeed(mac, { platform: "darwin", arch: "arm64", versions: { macos: "15.4" }, missingDlls: () => [] })).toMatchObject({ reason: "macos", need: "26.0", have: "15.4" });
  const linux = ROWS.find((r) => r.platform === "linux" && r.gpu === "vulkan");
  expect(unmetNeed(linux, { platform: "linux", arch: "x64", versions: { glibc: "2.35" }, missingDlls: () => [] })).toMatchObject({ reason: "glibc", need: "2.38" });
  expect(unmetNeed(null, { platform: "freebsd", arch: "x64" })).toMatchObject({ reason: "no-build" });
  const svc = service({ systemFn: () => system(["MSVCP140.dll"]), acquire: fakeAcquire().fn });
  expect(() => svc.install()).toThrow(/Visual C\+\+ runtime/);
});

test("uninstall stops what runs from it first, then removes every build", async () => {
  const stopped = [];
  const svc = service({ acquire: fakeAcquire().fn, beforeRemove: async () => stopped.push("server") });
  svc.install();
  await until(() => svc.status().installed);
  await svc.uninstall();
  expect(stopped).toEqual(["server"]);
  expect(existsSync(path.join(root, "sdcpp"))).toBe(false);
  expect(svc.status().installed).toBe(false);
});

test("the routes: the app's runtimes, an install answered 202, a build it can't run a 409 with what it lacks, an unknown runtime 404", async () => {
  configureRuntimeServices([["sdcpp", service({ acquire: fakeAcquire().fn })]]);
  const app = createServer({ typeBase: "t/" });
  app.route("/", makeRuntimesRouter());
  const list = await (await app.request("/v1/ai/runtimes")).json();
  expect(list.runtimes.map((r) => r.id)).toEqual(["sdcpp"]);
  const r = await app.request("/v1/ai/runtimes/sdcpp/engine/install", { method: "POST", headers: { "content-type": "application/json" }, body: "{}" });
  expect(r.status).toBe(202);
  expect((await app.request("/v1/ai/runtimes/nope/engine/status")).status).toBe(404);
  configureRuntimeServices([["sdcpp", service({ systemFn: () => system(["VCRUNTIME140.dll"]) })]]);
  const refused = await app.request("/v1/ai/runtimes/sdcpp/engine/install", { method: "POST", headers: { "content-type": "application/json" }, body: "{}" });
  expect(refused.status).toBe(409);
  expect((await refused.json()).need).toMatchObject({ reason: "vc-runtime" });
});

const thrown = (fn) => {
  try {
    fn();
  } catch (e) {
    return e;
  }
  return null;
};
// the CUDA 12 build: its two zips, and what each unpacks to (runner/config.js, measured)
const CUDA_ROOM = 343489328 + 388709969 + 563452046 + 788957696;

test("an install that wouldn't fit the drive is refused before anything downloads: its zips and what they unpack to, the margin", async () => {
  const acq = fakeAcquire();
  const need = CUDA_ROOM + ROOM_MARGIN;
  const e = thrown(() => service({ acquire: acq.fn, freeBytesFn: () => need - 1 }).install());
  expect(e.diskFull).toEqual({ needBytes: need, freeBytes: need - 1 });
  expect(e.message).toMatch(/^stable-diffusion\.cpp needs 2\.4 GB on the drive that holds the app's AI engines and models; it has 2\.4 GB free/);
  expect(acq.calls).toEqual([]);
  // with the room, it starts; a build already here downloads nothing, so no room is asked
  const svc = service({ acquire: acq.fn, freeBytesFn: () => need });
  expect(svc.install().status).toBe("installing");
  await until(() => svc.status().installed);
  expect(service({ acquire: acq.fn, freeBytesFn: () => 0 }).install().status).toBe("installing");
});

test("a resumed install counts what its own unfinished zips hold; a build row that doesn't say what it unpacks to takes 5×", () => {
  const need = CUDA_ROOM + ROOM_MARGIN;
  const short = () => service({ acquire: fakeAcquire().fn, freeBytesFn: () => need - 1000 });
  expect(thrown(() => short().install()).diskFull).toBeTruthy();
  const downloads = path.join(root, "sdcpp", DEFAULT_SDCPP_BUILD, ".downloads");
  mkdirSync(downloads, { recursive: true });
  writeFileSync(path.join(downloads, "sd-master-a85db96-bin-win-cuda12-x64.zip.part"), Buffer.alloc(2000));
  writeFileSync(path.join(downloads, "sd-master-old-bin-win-cuda12-x64.zip.part"), Buffer.alloc(9000)); // a leftover: not this build's
  expect(thrown(() => short().install({ gpu: "cpu" }))?.diskFull ?? null).toBeNull(); // the CPU build is small
  expect(thrown(() => short().install())).toBeNull();
  // unmeasured: room for five times each zip beside it
  const bare = ROWS.map(({ assetUnpackedBytes, runtimeUnpackedBytes, ...r }) => r);
  const guess = (343489328 + 563452046) * 6 + ROOM_MARGIN;
  const e = thrown(() => service({ acquire: fakeAcquire().fn, configFn: () => ({ ...config(), binaries: bare }), freeBytesFn: () => guess - 3000 }).install({ gpu: "cuda12", force: true }));
  expect(e.diskFull.needBytes).toBe(guess - 2000); // its .part still counts
});

test("slow here: a build not measured fast is said before the install — the CPU build, Vulkan", () => {
  expect(service().status()).toMatchObject({ gpu: "cuda12", slow: false });
  expect(service({ hardwareFn: () => ({ platform: "windows", runtimes: {}, gpus: [] }) }).status()).toMatchObject({ gpu: "cpu", slow: true });
  expect(service({ hardwareFn: () => ({ platform: "windows", runtimes: { vulkan: true }, gpus: [] }) }).status()).toMatchObject({ gpu: "vulkan", slow: true });
});

test("while the engine is being removed nothing installs into it or starts from it; once gone, it installs again", async () => {
  let release;
  const gate = new Promise((r) => (release = r));
  const acq = fakeAcquire();
  const svc = service({ acquire: acq.fn, beforeRemove: () => gate, server: { argv: () => [], ready: async () => true } });
  const removing = svc.uninstall();
  expect(thrown(() => svc.install())).toMatchObject({ busy: "engine-busy", message: "stable-diffusion.cpp is being removed — try again when it's done" });
  await expect(svc.ensureServer({ modelKey: "m", files: {} })).rejects.toMatchObject({ busy: "engine-busy" });
  release();
  await removing;
  expect(svc.install().status).toBe("installing");
  await until(() => svc.status().installed);
  expect(acq.calls).toHaveLength(1);
});

test("an install sweeps the runtime's other builds — an update replaces the old build, llama.cpp's rule", async () => {
  const old = path.join(root, "sdcpp", "master-973-f0aac52", "cuda12");
  mkdirSync(old, { recursive: true });
  writeFileSync(path.join(old, "sd-cli.exe"), "an app's own earlier build, moved into the cache");
  const svc = service({ acquire: fakeAcquire().fn });
  svc.install();
  await until(() => svc.status().installed);
  await until(() => !existsSync(path.join(root, "sdcpp", "master-973-f0aac52")));
  expect(existsSync(path.join(root, "sdcpp", "master-973-f0aac52"))).toBe(false);
  expect(svc.status().serverExe).toContain(path.join("sdcpp", DEFAULT_SDCPP_BUILD, "cuda12"));
});

test("the routes: no room is a 507 with the sizes for the screen's words", async () => {
  const need = CUDA_ROOM + ROOM_MARGIN;
  configureRuntimeServices([["sdcpp", service({ acquire: fakeAcquire().fn, freeBytesFn: () => 1e9 })]]);
  const app = createServer({ typeBase: "t/" });
  app.route("/", makeRuntimesRouter());
  const r = await app.request("/v1/ai/runtimes/sdcpp/engine/install", { method: "POST", headers: { "content-type": "application/json" }, body: "{}" });
  expect(r.status).toBe(507);
  expect(await r.json()).toMatchObject({ type: "t/disk-full", title: "Not enough room on the drive", needBytes: need, freeBytes: 1e9 });
});
