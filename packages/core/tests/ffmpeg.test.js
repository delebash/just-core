// SPDX-License-Identifier: MIT
// FFmpeg from the kit (JustDirect, 2026-11-06 — the kit's TASKS, "JustDirect's six decisions", item 5): a tool runtime
// whose pinned 9.0.2 builds are rows like an engine's (gyan.dev's zip for Windows, Martin Riedl's for macOS and Linux,
// each checked by SHA-256), no provider and no models; ffmpegExe says where the app's FFmpeg is — the user's own when
// the `path` setting names one, else the kit's — and ffmpegReadiness what's missing.
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, expect, test } from "vitest";
import * as seed from "../src/llm/seed.js";
import * as stores from "../src/llm/stores.js";
import { runtimeVariantDir, selectRuntimeAsset } from "../src/runner/binary.js";
import { DEFAULT_FFMPEG_BINARIES, DEFAULT_FFMPEG_BUILD } from "../src/runner/config.js";
import { ffmpegExe, ffmpegReadiness, runFfmpeg } from "../src/runner/ffmpeg.js";
import { configureRuntimeServices, RuntimeService } from "../src/runner/runtime_service.js";
import { pinKey, runtimeOf, settingKey, settingsUiOf } from "../src/runner/runtimes.js";
import { freshDb } from "./helpers.js";

let h;
let root;
beforeEach(() => {
  h = freshDb();
  root = mkdtempSync(path.join(tmpdir(), "kit-ffmpeg-"));
});
afterEach(() => {
  configureRuntimeServices([]);
  rmSync(root, { recursive: true, force: true });
});

test("an app that turns FFmpeg on gets its pinned builds as rows, its pin and its path setting — no provider", () => {
  seed.configureAppSeed({ featureCatalog: [], featurePrompts: {}, enginePresets: [], featurePresets: {}, defaultPresetId: "", runtimes: ["ffmpeg"] });
  seed.seedLlm();
  expect(runtimeOf("ffmpeg")).toMatchObject({ kind: "tool", tool: true, license: "GPL-3.0" });
  const rows = h.all("select * from runtime_binary where runtime = 'ffmpeg' order by position");
  expect(rows.map((r) => [r.platform, r.gpu, r.server_exe])).toEqual([
    ["windows", "cpu", "ffmpeg.exe"],
    ["macos", "cpu", "ffmpeg"],
    ["macos-x64", "cpu", "ffmpeg"],
    ["linux", "cpu", "ffmpeg"],
    ["linux-arm64", "cpu", "ffmpeg"],
  ]);
  expect(rows[0]).toMatchObject({
    asset_url: "https://github.com/GyanD/codexffmpeg/releases/download/9.0.2/ffmpeg-9.0.2-essentials_build.zip",
    asset_bytes: 114768076,
    sha256: "60f467265b1e312373dbcd92200c2618a74850f98d3d078e94296bb3fa2047ba",
    source: "github",
  });
  expect(rows[1]).toMatchObject({ asset_url: "https://ffmpeg.martin-riedl.de/download/macos/arm64/1789931890_9.0.2/ffmpeg.zip", source: "web" });
  expect(h.get("runner_setting", pinKey("ffmpeg")).value).toBe(DEFAULT_FFMPEG_BUILD);
  expect(h.get("runner_setting", settingKey("ffmpeg", "path")).value).toBe("");
  expect(h.get("llm_providers", "local-ffmpeg")).toBeNull();
  expect(stores.getRunnerConfigStore().getRuntimeConfig("ffmpeg").settings).toEqual({ path: "" });
});

test("the tab shows the path setting as a text box sized for a full path", () => {
  expect(settingsUiOf(runtimeOf("ffmpeg"))).toEqual({ path: { control: "text", width: "path" } });
});

test("each computer gets its own build: Windows, Apple silicon, an Intel Mac, Linux on x64 and on Arm", () => {
  const rows = DEFAULT_FFMPEG_BINARIES.map((b) => ({ platform: b.platform, gpu: b.gpu, assetUrl: b.asset_url, requires: b.requires ?? {} }));
  const pick = (platform, arch) => selectRuntimeAsset(rows, { platform, arch, runtimes: {}, gpus: [] })?.assetUrl ?? null;
  expect(pick("windows", "x64")).toContain("ffmpeg-9.0.2-essentials_build.zip");
  expect(pick("macos", "arm64")).toContain("/macos/arm64/");
  expect(pick("macos", "x64")).toContain("/macos/amd64/");
  expect(pick("linux", "x64")).toContain("/linux/amd64/");
  expect(pick("linux", "arm64")).toContain("/linux/arm64/");
});

/** An FFmpeg runtime service on a Windows box, its build "installed" when `installed`, the user's `path` setting `own`. */
function service({ installed = true, own = "" } = {}) {
  const rows = DEFAULT_FFMPEG_BINARIES.map((b) => ({ platform: b.platform, gpu: b.gpu, assetUrl: b.asset_url, serverExe: b.server_exe, requires: b.requires ?? {} }));
  if (installed) {
    const dir = runtimeVariantDir(root, "ffmpeg", DEFAULT_FFMPEG_BUILD, "cpu");
    mkdirSync(dir, { recursive: true });
    writeFileSync(path.join(dir, "ffmpeg.exe"), "");
    writeFileSync(path.join(dir, "ffprobe.exe"), "");
  }
  const svc = new RuntimeService({
    id: "ffmpeg",
    cacheRoot: root,
    configFn: () => ({ pinnedBuild: DEFAULT_FFMPEG_BUILD, binaries: rows, settings: { path: own } }),
    hardwareFn: () => ({ platform: "windows", arch: "x64", runtimes: {}, gpus: [] }),
    systemFn: () => ({ platform: "win32", arch: "x64", versions: {}, missingDlls: () => [] }),
  });
  configureRuntimeServices([["ffmpeg", svc]]);
  return svc;
}

test("ffmpegExe: none when the app doesn't turn it on or it isn't installed; the kit's build with its ffprobe", () => {
  expect(ffmpegExe()).toBeNull();
  expect(ffmpegReadiness()).toMatchObject({ ready: false, need: "engine-not-on" });
  service({ installed: false });
  expect(ffmpegExe()).toBeNull();
  expect(ffmpegReadiness()).toMatchObject({ ready: false, need: "engine-not-installed" });
  service();
  const dir = runtimeVariantDir(root, "ffmpeg", DEFAULT_FFMPEG_BUILD, "cpu");
  expect(ffmpegExe()).toEqual({ exe: path.join(dir, "ffmpeg.exe"), ffprobe: path.join(dir, "ffprobe.exe"), source: "kit", ownPathMissing: false });
  expect(ffmpegReadiness()).toMatchObject({ ready: true, need: "", source: "kit" });
});

test("the user's own FFmpeg wins when its path is there; a path that isn't leaves the kit's, and says so", () => {
  const ownDir = path.join(root, "my-ffmpeg");
  mkdirSync(ownDir);
  const own = path.join(ownDir, "ffmpeg.exe");
  writeFileSync(own, "");
  service({ own });
  expect(ffmpegExe()).toEqual({ exe: own, ffprobe: null, source: "user", ownPathMissing: false });
  service({ own: path.join(root, "gone", "ffmpeg.exe") });
  expect(ffmpegExe()).toMatchObject({ source: "kit", ownPathMissing: true });
  // no build of the kit's and a path that isn't there: nothing
  rmSync(runtimeVariantDir(root, "ffmpeg", DEFAULT_FFMPEG_BUILD, "cpu"), { recursive: true, force: true });
  service({ installed: false, own: path.join(root, "gone", "ffmpeg.exe") });
  expect(ffmpegExe()).toBeNull();
});

/** A stand-in for the kit's spawn seam: a child that writes `output` and ends with `code` (null: runs until killed). */
function fakeSpawn({ output = "", code = 0 } = {}) {
  const calls = [];
  const spawn = async (_popen, argv) => {
    calls.push(argv);
    const { EventEmitter } = await import("node:events");
    const proc = new EventEmitter();
    proc.capturedOutput = output;
    proc.killed = false;
    proc.kill = () => {
      proc.killed = true;
      setTimeout(() => proc.emit("close", 1), 0);
    };
    if (code !== null) setTimeout(() => proc.emit("close", code), 0);
    return [proc, null];
  };
  return { spawn, calls };
}

test("runFfmpeg: no FFmpeg is a 409 for the install offer; a run goes through the spawn seam with the app's exe", async () => {
  await expect(runFfmpeg(["-version"])).rejects.toMatchObject({ statusCode: 409, slug: "engine-not-installed" });
  service();
  const ok = fakeSpawn({ output: "ffmpeg version 9.0.2" });
  await expect(runFfmpeg(["-i", "a.mp4", "out/%05d.png"], { spawn: ok.spawn })).resolves.toEqual({ output: "ffmpeg version 9.0.2" });
  const dir = runtimeVariantDir(root, "ffmpeg", DEFAULT_FFMPEG_BUILD, "cpu");
  expect(ok.calls[0]).toEqual([path.join(dir, "ffmpeg.exe"), "-hide_banner", "-nostdin", "-i", "a.mp4", "out/%05d.png"]);
});

test("runFfmpeg: a failure says its last lines; a Cancel stops it; so does its time limit", async () => {
  service();
  const bad = fakeSpawn({ output: "line one\nline two\nin.mp4: Invalid data found when processing input", code: 1 });
  await expect(runFfmpeg(["-i", "in.mp4"], { spawn: bad.spawn })).rejects.toThrow(/exit 1.*Invalid data found/);
  const forever = fakeSpawn({ code: null });
  const ctl = new AbortController();
  const run = runFfmpeg(["-i", "x"], { spawn: forever.spawn, signal: ctl.signal });
  await new Promise((r) => setTimeout(r, 5));
  ctl.abort();
  await expect(run).rejects.toMatchObject({ name: "AbortError" });
  await expect(runFfmpeg(["-i", "x"], { spawn: fakeSpawn({ code: null }).spawn, timeoutMs: 20 })).rejects.toThrow(/ran past/);
});
