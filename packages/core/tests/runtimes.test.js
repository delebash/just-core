// SPDX-License-Identifier: MIT
// The kit's engine runtimes besides llama.cpp (docs/plans/2026-10-24-engines-the-llama-way.md, K1 + K2): their
// builds are seeded rows like llama.cpp's — `runtime_binary` under the runtime's id, the pin
// `pinned_build:<id>` — for an app that turns the runtime on, editable, reset to the kit's defaults.
import { beforeEach, expect, test } from "vitest";
import { selectRuntimeAsset } from "../src/runner/binary.js";
import { DEFAULT_SDCPP_BINARIES, DEFAULT_SDCPP_BUILD } from "../src/runner/config.js";
import { pinKey, rowRuntimes, runtimeOf } from "../src/runner/runtimes.js";
import * as seed from "../src/llm/seed.js";
import * as stores from "../src/llm/stores.js";
import { freshDb } from "./helpers.js";

let h;
const appSeed = (runtimes) => {
  seed.configureAppSeed({ featureCatalog: [], featurePrompts: {}, enginePresets: [], featurePresets: {}, defaultPresetId: "", runtimes });
  seed.seedLlm();
};
const sdRows = () => h.all("select * from runtime_binary where runtime = 'sdcpp' order by position");

beforeEach(() => {
  h = freshDb();
});

test("the registry: llama.cpp keeps its router path; stable-diffusion.cpp is the image runtime with kit-owned builds", () => {
  expect(runtimeOf("llamacpp")).toMatchObject({ kind: "llm", router: true });
  expect(runtimeOf("sdcpp")).toMatchObject({ kind: "image", folder: "sdcpp", defaults: { pinnedBuild: DEFAULT_SDCPP_BUILD } });
  expect(rowRuntimes().map((r) => r.id)).toEqual(["sdcpp"]);
  expect(runtimeOf("nope")).toBeNull();
});

test("an app that doesn't turn a runtime on gets none of its rows", () => {
  appSeed([]);
  expect(sdRows()).toEqual([]);
  expect(h.get("runner_setting", pinKey("sdcpp"))).toBeNull();
});

test("an app that turns sd.cpp on gets every build row and the pin, with sizes, hashes and needs", () => {
  appSeed(["sdcpp"]);
  expect(sdRows()).toHaveLength(DEFAULT_SDCPP_BINARIES.length);
  expect(h.get("runner_setting", pinKey("sdcpp")).value).toBe(DEFAULT_SDCPP_BUILD);
  const cfg = stores.getRunnerConfigStore().getRuntimeConfig("sdcpp");
  const cuda = cfg.binaries.find((b) => b.platform === "windows" && b.gpu === "cuda12");
  expect(cuda).toMatchObject({
    serverExe: "sd-server.exe",
    assetBytes: 350857718,
    sha256: "e60e538b86ecd47d8e141297fa45734125fdf97925d8ed3b49acb1397b5ee90b",
    runtimeSha256: "fe20366827d357c00797eebb58244dddab7fd9a348d70090c3871004c320f38d",
    requires: { dlls: ["MSVCP140.dll", "VCRUNTIME140.dll", "VCRUNTIME140_1.dll", "VCOMP140.DLL"] },
  });
  expect(cfg.binaries.find((b) => b.platform === "linux" && b.gpu === "vulkan").requires).toEqual({ glibc: "2.38" });
  // the kit's generic install picks from these rows by the same GPU preference llama.cpp uses
  const box = { platform: "windows", gpus: [{ vendor: "nvidia", computeCapability: "7.5", vramMb: 8192 }], hasNvidia: true };
  expect(selectRuntimeAsset(cfg.binaries, box)?.gpu).toBeTruthy();
});

test("reseed keeps a row the user edited and the pin they set; reset puts the kit's back, a user's own row stays", () => {
  appSeed(["sdcpp"]);
  const store = stores.getRunnerConfigStore();
  store.upsertRuntimeBinary("sdcpp", { platform: "windows", gpu: "cuda12", assetUrl: "https://example.test/mine.zip", serverExe: "sd-server.exe" });
  store.upsertRuntimeBinary("sdcpp", { platform: "windows", gpu: "cuda13", assetUrl: "https://example.test/cu13.zip", serverExe: "sd-server.exe" });
  h.update("runner_setting", { value: "master-999" }, { key: pinKey("sdcpp") });
  seed.seedLlm();
  let cfg = store.getRuntimeConfig("sdcpp");
  expect(cfg.pinnedBuild).toBe("master-999");
  expect(cfg.binaries.find((b) => b.gpu === "cuda12").assetUrl).toBe("https://example.test/mine.zip");
  store.resetRuntimeToDefaults("sdcpp");
  cfg = store.getRuntimeConfig("sdcpp");
  expect(cfg.pinnedBuild).toBe(DEFAULT_SDCPP_BUILD);
  expect(cfg.binaries.find((b) => b.gpu === "cuda12").assetUrl).toContain("sd-master-77b72a2-bin-win-cuda12-x64.zip");
  expect(cfg.binaries.find((b) => b.gpu === "cuda13").assetUrl).toBe("https://example.test/cu13.zip"); // the user's own
});

test("a built-in row the kit no longer ships goes on reseed", () => {
  appSeed(["sdcpp"]);
  h.insert("runtime_binary", { runtime: "sdcpp", platform: "windows", gpu: "retired", source: "github", asset_url: "x", asset_bytes: 0, runtime_bytes: 0, server_exe: "sd-server.exe", requires: "{}", built_in: true, position: 99 });
  seed.seedLlm();
  expect(sdRows().some((r) => r.gpu === "retired")).toBe(false);
});
