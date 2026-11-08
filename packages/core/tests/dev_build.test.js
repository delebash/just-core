// SPDX-License-Identifier: MIT
// An engine's development build in place of the installed one (runner/dev_build.js — JustVoice's and JustDirect's
// copies moved into the kit, 2026-11-08): its server program from the named bin folder, its backend from the build's
// CMake cache, its version from the build script's info file or else the checkout's git files; nothing named, or a
// folder without the program, is no development build.
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, expect, test } from "vitest";
import { backendOf, commitOf, DEV_ENGINES, devBuild, devBuildOverrides } from "../src/runner/dev_build.js";

const SHA = "4400f6d0123456789abcdef0123456789abcdef0";
const made = [];
afterEach(() => {
  for (const d of made.splice(0)) rmSync(d, { recursive: true, force: true });
});

/** A checkout with a build folder: <repo>/.git (on branch jd), <repo>/<build…>/{CMakeCache.txt, bin/<server>}. */
function checkout(server, cache, { packed = false, build = ["build-jd"] } = {}) {
  const repo = mkdtempSync(path.join(tmpdir(), "kit-devbuild-"));
  made.push(repo);
  mkdirSync(path.join(repo, ".git", "refs", "heads"), { recursive: true });
  writeFileSync(path.join(repo, ".git", "HEAD"), "ref: refs/heads/jd\n");
  if (packed) writeFileSync(path.join(repo, ".git", "packed-refs"), `# pack-refs\n${SHA} refs/heads/jd\n`);
  else writeFileSync(path.join(repo, ".git", "refs", "heads", "jd"), `${SHA}\n`);
  const buildDir = path.join(repo, ...build);
  const bin = path.join(buildDir, "bin");
  mkdirSync(bin, { recursive: true });
  writeFileSync(path.join(buildDir, "CMakeCache.txt"), cache);
  if (server) writeFileSync(path.join(bin, server), "");
  return { repo, bin };
}

test("sd.cpp's development build: its server, CUDA from its CMake cache, its commit from the checkout", () => {
  const { repo, bin } = checkout(DEV_ENGINES.sdcpp.server, "CMAKE_BUILD_TYPE:STRING=Release\nSD_CUDA:BOOL=ON\nSD_VULKAN:BOOL=OFF\n");
  expect(devBuild("sdcpp", "JUST_DIRECT_SDCPP_BUILD", { env: { JUST_DIRECT_SDCPP_BUILD: bin } })).toEqual({
    binDir: bin,
    exe: path.join(bin, DEV_ENGINES.sdcpp.server),
    backend: "cuda",
    commit: "4400f6d",
    dirty: false,
    source: repo,
    version: "dev · 4400f6d",
  });
});

test("audio.cpp's build two folders down (build\\jv-dev\\bin), and a build script's info file over git", () => {
  const { bin } = checkout(DEV_ENGINES.audiocpp.server, "ENGINE_ENABLE_VULKAN:BOOL=ON\n", { build: ["build", "jv-dev"] });
  const env = { JUSTVOICE_AUDIOCPP_BUILD: bin };
  expect(devBuild("audiocpp", "JUSTVOICE_AUDIOCPP_BUILD", { env })).toMatchObject({ backend: "vulkan", commit: "4400f6d", version: "dev · 4400f6d" });
  writeFileSync(path.join(bin, "jv-dev-build.json"), JSON.stringify({ commit: "6a2bb4c5", dirty: true, source: "..\\audio.cpp" }));
  expect(devBuild("audiocpp", "JUSTVOICE_AUDIOCPP_BUILD", { env, infoFile: "jv-dev-build.json" })).toMatchObject({
    commit: "6a2bb4c5",
    dirty: true,
    source: "..\\audio.cpp",
    version: "dev · 6a2bb4c5 + local changes",
  });
  // an info file without its source: the checkout found above the build
  writeFileSync(path.join(bin, "jv-dev-build.json"), JSON.stringify({ commit: "6a2bb4c5" }));
  expect(devBuild("audiocpp", "JUSTVOICE_AUDIOCPP_BUILD", { env, infoFile: "jv-dev-build.json" }).source).toBe(path.dirname(path.dirname(path.dirname(bin))));
});

test("nothing named, a folder without the server, an engine with no development build: none", () => {
  expect(devBuild("sdcpp", "JUST_DIRECT_SDCPP_BUILD", { env: {} })).toBeNull();
  const { bin } = checkout(null, "");
  expect(devBuild("sdcpp", "JUST_DIRECT_SDCPP_BUILD", { env: { JUST_DIRECT_SDCPP_BUILD: bin } })).toBeNull();
  expect(devBuild("llamacpp", "JUST_DIRECT_SDCPP_BUILD", { env: { JUST_DIRECT_SDCPP_BUILD: bin } })).toBeNull();
});

test("the backend: the first switch on, else the CPU; the commit from packed refs too; overrides read when asked", () => {
  expect(backendOf("ENGINE_ENABLE_VULKAN:BOOL=ON\n", DEV_ENGINES.audiocpp.backends)).toBe("vulkan");
  expect(backendOf("SD_CUDA:BOOL=OFF\n", DEV_ENGINES.sdcpp.backends)).toBe("cpu");
  expect(commitOf(checkout(null, "", { packed: true }).repo)).toBe("4400f6d");
  const env = {};
  const overrides = devBuildOverrides({ sdcpp: "JUST_DIRECT_SDCPP_BUILD" }, { env });
  expect(overrides.sdcpp()).toBeNull();
  env.JUST_DIRECT_SDCPP_BUILD = checkout(DEV_ENGINES.sdcpp.server, "SD_VULKAN:BOOL=ON\n").bin;
  expect(overrides.sdcpp()).toMatchObject({ backend: "vulkan" });
});
