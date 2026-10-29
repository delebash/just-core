// SPDX-License-Identifier: MIT
// A runtime's side archives (round E, 2026-10-29 — the user: "eSpeak an extra archive on each build row; UniDic an
// optional add-on"): one pinned archive each, checked before it unpacks, only the part the runtime reads kept; the
// servers' environment follows what is installed. Downloads are faked with real archives.
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { expect, test, vi } from "vitest";
import * as download from "../src/runner/download.js";
import { installArchive, installed } from "../src/runner/runtime_extras.js";
import { tarGzBytes, zipBytes } from "./archives.js";

const sha = (buf) => createHash("sha256").update(buf).digest("hex");
const WHEEL = zipBytes([
  ["espeakng_loader/__init__.py", "import os"],
  ["espeakng_loader/espeak-ng.dll", "MZ"],
  ["espeakng_loader/espeak-ng-data/phontab", "p"],
  ["espeakng_loader-0.2.4.dist-info/METADATA", "m"],
]);
const DICT = tarGzBytes([
  ["unidic-lite-1.0.8/setup.py", "x"],
  ["unidic-lite-1.0.8/LICENSE", "MIT"],
  ["unidic-lite-1.0.8/unidic_lite/__init__.py", "x"],
  ["unidic-lite-1.0.8/unidic_lite/dicdir/dicrc", "d"],
  ["unidic-lite-1.0.8/unidic_lite/dicdir/sys.dic", "s"],
]);
const serve = (bytes) =>
  vi.spyOn(download, "streamDownload").mockImplementation(async (_url, dest) => {
    writeFileSync(dest, bytes);
  });
const ESPEAK = { name: "eSpeak NG", url: "https://x/w.whl", archive: "zip", take: "espeakng_loader", skipExt: [".py"], into: "espeak-ng-0.2.4", check: "espeak-ng-data" };
const UNIDIC = {
  name: "Japanese dictionary", url: "https://x/u.tar.gz", archive: "tar.gz", take: "unidic-lite-1.0.8/unidic_lite/dicdir",
  also: ["unidic-lite-1.0.8/LICENSE"], into: "unidic-lite-1.0.8", check: "dicrc",
};

test("a wheel leaves only its library and data; a tarball only its dictionary and licence; each checked first", async () => {
  const dir = mkdtempSync(path.join(tmpdir(), "kit-extras-"));
  serve(WHEEL);
  const e = await installArchive(dir, { ...ESPEAK, sha256: sha(WHEEL) });
  expect(readdirSync(e).sort()).toEqual(["espeak-ng-data", "espeak-ng.dll"]);
  expect(installed(dir, ESPEAK)).toBe(true);
  expect(readdirSync(dir)).toEqual(["espeak-ng-0.2.4"]); // nothing left beside it

  serve(DICT);
  const u = await installArchive(dir, { ...UNIDIC, sha256: sha(DICT) });
  expect(readdirSync(u).sort()).toEqual(["LICENSE", "dicrc", "sys.dic"]);
  expect(readFileSync(path.join(u, "dicrc"), "utf8")).toBe("d");

  // a checksum that doesn't match: refused, nothing unpacked, nothing left
  const other = mkdtempSync(path.join(tmpdir(), "kit-extras-bad-"));
  serve(WHEEL);
  await expect(installArchive(other, { ...ESPEAK, sha256: "0".repeat(64) })).rejects.toThrow(/published checksum/);
  expect(readdirSync(other)).toEqual([]);
});

test("the service: a build's extras install with it; the servers' environment names eSpeak, then the dictionary once added; the sweep keeps add-ons", async () => {
  const { DEFAULT_AUDIOCPP_BUILD } = await import("../src/runner/config.js");
  const { RuntimeService } = await import("../src/runner/runtime_service.js");
  const { runtimeVariantDir } = await import("../src/runner/binary.js");
  const root = mkdtempSync(path.join(tmpdir(), "kit-extras-svc-"));
  const row = { platform: "windows", gpu: "cuda12", assetUrl: "https://x/a.zip", serverExe: "audiocpp_server.exe", extras: [{ ...ESPEAK, sha256: sha(WHEEL) }] };
  const svc = new RuntimeService({
    id: "audiocpp",
    cacheRoot: root,
    configFn: () => ({ id: "audiocpp", pinnedBuild: DEFAULT_AUDIOCPP_BUILD, binaries: [row], settings: {} }),
    hardwareFn: () => ({ platform: "windows", gpus: [{ vendor: "NVIDIA", computeCapability: "7.5", vramMb: 8192 }], runtimes: { cuda: true }, hasNvidia: true }),
    systemFn: () => ({ platform: "win32", arch: "x64", versions: {}, missingDlls: () => [] }),
    freeBytesFn: () => 1e12,
    acquire: async (cacheRoot, folder, build) => {
      const d = runtimeVariantDir(cacheRoot, folder, build, "cuda12");
      mkdirSync(d, { recursive: true });
      writeFileSync(path.join(d, "audiocpp_server.exe"), "");
      return path.join(d, "audiocpp_server.exe");
    },
  });
  // the runtime's own add-ons folder beside the builds: never swept as an old build
  mkdirSync(path.join(root, "audiocpp", "_addons"), { recursive: true });
  serve(WHEEL);
  svc.install();
  for (let i = 0; i < 200 && svc.status().status === "installing"; i++) await new Promise((r) => setTimeout(r, 5));
  expect(svc.status()).toMatchObject({ status: "installed", installed: true });
  const env = svc.extrasEnv();
  expect(env.AUDIOCPP_ESPEAK_LIBRARY).toMatch(/_extras[\\/]espeak-ng-0\.2\.4[\\/]espeak-ng\.dll$/);
  expect(env.AUDIOCPP_ESPEAK_DATA).toMatch(/espeak-ng-data$/);
  expect(env.AUDIOCPP_UNIDIC_DIR).toBeUndefined();
  expect(existsSync(path.join(root, "audiocpp", "_addons"))).toBe(true); // the sweep left the add-ons

  // the dictionary, on demand
  serve(DICT);
  expect(svc.addons()).toEqual([expect.objectContaining({ id: "unidic", installed: false })]);
  const addon = { ...UNIDIC, id: "unidic", sha256: sha(DICT) };
  await installArchive(svc.addonsDir, addon);
  expect(svc.extrasEnv().AUDIOCPP_UNIDIC_DIR).toBe(path.join(svc.addonsDir, "unidic-lite-1.0.8"));
  expect(svc.addons()[0].installed).toBe(true);
  await svc.removeAddon("unidic");
  expect(svc.extrasEnv().AUDIOCPP_UNIDIC_DIR).toBeUndefined();
});
