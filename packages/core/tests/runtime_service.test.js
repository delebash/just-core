// SPDX-License-Identifier: MIT
// A kit runtime's engine — status, install with progress and Cancel, what the build needs, removal — and its
// routes (/v1/ai/runtimes), the way llama.cpp's engine works (docs/plans/2026-10-24-engines-the-llama-way.md,
// K1 + K3). The install itself is the kit's acquireRuntime (tested in binary's own tests): here a stand-in that
// lays the server where the real one would.
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, expect, test } from "vitest";
import { DEFAULT_SDCPP_BINARIES, DEFAULT_SDCPP_BUILD, binaryAsset } from "../src/runner/config.js";
import { runtimeVariantDir } from "../src/runner/binary.js";
import { configureRuntimeServices, RuntimeService, unmetNeed } from "../src/runner/runtime_service.js";
import { makeRuntimesRouter } from "../src/llm/runtimes_api.js";
import { createServer } from "../src/platform/server.js";

const NVIDIA_BOX = { platform: "windows", runtimes: { cuda: true, vulkan: true }, gpus: [{ computeCap: "7.5" }] };
const ROWS = DEFAULT_SDCPP_BINARIES.map((b) => ({ ...binaryAsset(b), assetBytes: b.asset_bytes, runtimeBytes: b.runtime_bytes ?? 0, requires: b.requires }));
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
const service = (extra = {}) => new RuntimeService({ id: "sdcpp", cacheRoot: root, configFn: config, hardwareFn: () => NVIDIA_BOX, systemFn: () => system(), ...extra });

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
