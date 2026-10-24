// SPDX-License-Identifier: MIT
// A kit runtime's models (docs/plans/2026-10-24-engines-the-llama-way.md, K4): the app's pinned file sets as
// `runtime_model` rows — a built-in row follows the app's definition, a retired one goes, a user's stays — downloaded
// into the kit's HF cache layout (each file a blob named by its SHA-256, checked, its snapshot path linked — a hard
// link where Windows allows no symlink, never a second copy on the same drive), their status, removal and the files a
// server starts on.
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import * as seed from "../src/llm/seed.js";
import * as stores from "../src/llm/stores.js";
import { runtimeVariantDir } from "../src/runner/binary.js";
import { binaryAsset, DEFAULT_SDCPP_BINARIES, DEFAULT_SDCPP_BUILD } from "../src/runner/config.js";
import * as download from "../src/runner/download.js";
import { RunnerService } from "../src/runner/lifecycle.js";
import * as models from "../src/runner/models.js";
import { configureRuntimeServices, RuntimeService } from "../src/runner/runtime_service.js";
import { sdServerArgv } from "../src/runner/sdcpp.js";
import { freshDb } from "./helpers.js";

const bytesOf = (s) => Buffer.from(s);
const sha = (b) => createHash("sha256").update(b).digest("hex");
const DIFF = bytesOf("diffusion weights");
const TEXT = bytesOf("text encoder");
const VAE = bytesOf("vae");
const file = (slot, repo, p, body) => ({ slot, repo, revision: "abc123", path: p, sha256: sha(body), bytes: body.length });
const FLUX = {
  runtime: "sdcpp",
  id: "flux2-klein-4b",
  name: "FLUX.2 [klein] 4B",
  license: "Apache-2.0",
  files: [file("diffusion_model", "leejet/FLUX.2-klein-4B-GGUF", "flux.gguf", DIFF), file("llm", "unsloth/Qwen3-4B-GGUF", "qwen.gguf", TEXT), file("vae", "bfl/klein", "vae/vae.safetensors", VAE)],
  peakVramMb: 6600,
};
const BODIES = new Map([[FLUX.files[0].sha256, DIFF], [FLUX.files[1].sha256, TEXT], [FLUX.files[2].sha256, VAE]]);

let h;
let root;
beforeEach(() => {
  h = freshDb();
  root = mkdtempSync(path.join(tmpdir(), "kit-rtmodels-"));
});
afterEach(() => {
  vi.restoreAllMocks();
  configureRuntimeServices([]);
  rmSync(root, { recursive: true, force: true });
});
const appSeed = (runtimeModels) => {
  seed.configureAppSeed({ featureCatalog: [], featurePrompts: {}, enginePresets: [], featurePresets: {}, defaultPresetId: "", runtimes: ["sdcpp"], runtimeModels });
  seed.seedLlm();
};
/** streamDownload's stand-in: writes the file the URL names (by its sha256's body), reporting progress. */
function fakeHub() {
  const urls = [];
  vi.spyOn(download, "streamDownload").mockImplementation(async (url, dest, { onProgress }) => {
    urls.push(url);
    const f = FLUX.files.find((x) => url.endsWith(x.path));
    const body = BODIES.get(f.sha256);
    mkdirSync(path.dirname(dest), { recursive: true });
    writeFileSync(dest, body);
    onProgress?.(body.length, body.length);
  });
  return urls;
}
const service = () =>
  new RuntimeService({
    id: "sdcpp",
    cacheRoot: root,
    configFn: () => ({ pinnedBuild: DEFAULT_SDCPP_BUILD, binaries: DEFAULT_SDCPP_BINARIES.map(binaryAsset), idleSeconds: 300 }),
    hardwareFn: () => ({ platform: "windows", runtimes: {}, gpus: [] }),
    systemFn: () => ({ platform: "win32", arch: "x64", versions: {}, missingDlls: () => [] }),
    modelsFn: () => stores.getRunnerConfigStore().listRuntimeModels("sdcpp"),
  });
const until = async (check) => {
  for (let i = 0; i < 400 && !check(); i++) await new Promise((r) => setTimeout(r, 5));
};

test("the app's models seed as rows; a built-in row follows the app's pins; a retired one goes; a user's stays", () => {
  appSeed([FLUX]);
  const store = stores.getRunnerConfigStore();
  expect(store.listRuntimeModels("sdcpp")).toEqual([expect.objectContaining({ id: "flux2-klein-4b", kind: "image", peakVramMb: 6600, builtIn: true, files: FLUX.files })]);
  h.insert("runtime_model", { runtime: "sdcpp", id: "mine", name: "Mine", kind: "image", license: "", files: "[]", peak_vram_mb: 0, built_in: false, position: 9 });
  const bumped = { ...FLUX, files: FLUX.files.map((f) => ({ ...f, revision: "def456" })) };
  appSeed([bumped]);
  expect(store.listRuntimeModels("sdcpp").find((m) => m.id === "flux2-klein-4b").files[0].revision).toBe("def456");
  appSeed([]);
  expect(store.listRuntimeModels("sdcpp").map((m) => m.id)).toEqual(["mine"]);
});

test("a download: each file a blob by its SHA-256, its snapshot linked to it (not copied), the model ready for the server", async () => {
  appSeed([FLUX]);
  const urls = fakeHub();
  const svc = service();
  expect(svc.modelsStatus()[0]).toMatchObject({ id: "flux2-klein-4b", onDisk: false, bytes: DIFF.length + TEXT.length + VAE.length });
  expect(() => svc.modelFor("flux2-klein-4b")).toThrow(/isn't downloaded/);
  svc.downloadModel("flux2-klein-4b");
  await until(() => svc.modelsStatus()[0].status === "downloaded");
  expect(urls[0]).toBe("https://huggingface.co/leejet/FLUX.2-klein-4B-GGUF/resolve/abc123/flux.gguf");
  const m = svc.modelFor("flux2-klein-4b");
  expect(m).toMatchObject({ key: "flux2-klein-4b", peakVramMb: 6600 });
  expect(readFileSync(m.files.diffusion_model).equals(DIFF)).toBe(true);
  expect(m.files.vae).toBe(models.snapshotFilePath(path.join(root, "hf"), "bfl/klein", "abc123", "vae/vae.safetensors"));
  // one copy of the bytes on the drive: the snapshot and the blob are the same file (a symlink or a hard link)
  const blob = path.join(root, "hf", "models--leejet--FLUX.2-klein-4B-GGUF", "blobs", FLUX.files[0].sha256);
  const linked = statSync(m.files.diffusion_model, { bigint: true });
  const real = statSync(blob, { bigint: true });
  expect(linked.ino === real.ino || statSync(m.files.diffusion_model).nlink > 1 || linked.ino === real.ino).toBe(true);
  expect(svc.modelsStatus()[0].onDisk).toBe(true);
});

test("a file that doesn't match its pinned SHA-256 is removed and the download fails in words", async () => {
  appSeed([{ ...FLUX, files: [{ ...FLUX.files[0], sha256: "0".repeat(64) }] }]);
  vi.spyOn(download, "streamDownload").mockImplementation(async (url, dest) => {
    mkdirSync(path.dirname(dest), { recursive: true });
    writeFileSync(dest, DIFF);
  });
  const svc = service();
  svc.downloadModel("flux2-klein-4b");
  await until(() => ["error", "downloaded"].includes(svc.modelsStatus()[0].status));
  expect(svc.modelsStatus()[0]).toMatchObject({ status: "error", onDisk: false });
  expect(svc.modelsStatus()[0].error).toMatch(/doesn't match its pinned SHA-256/);
  expect(existsSync(path.join(root, "hf", "models--leejet--FLUX.2-klein-4B-GGUF", "blobs", "0".repeat(64)))).toBe(false);
});

test("removal: the model's files go; a file another model row uses stays", async () => {
  const other = { ...FLUX, id: "flux2-klein-4b-alt", files: [FLUX.files[2]] }; // shares the VAE
  appSeed([FLUX, other]);
  fakeHub();
  const svc = service();
  svc.downloadModel("flux2-klein-4b");
  await until(() => svc.modelsStatus()[0].status === "downloaded");
  const m = svc.modelFor("flux2-klein-4b");
  await svc.deleteModel("flux2-klein-4b");
  expect(existsSync(m.files.diffusion_model)).toBe(false);
  expect(existsSync(m.files.vae)).toBe(true); // the other row's
  expect(svc.modelsStatus().find((x) => x.id === "flux2-klein-4b").onDisk).toBe(false);
});

/** The service with a server that starts (a stand-in handle) and an arbiter that always has room — the engine "installed". */
function serving() {
  for (const gpu of ["cuda12", "cpu"]) {
    const dir = runtimeVariantDir(root, "sdcpp", DEFAULT_SDCPP_BUILD, gpu);
    mkdirSync(dir, { recursive: true });
    writeFileSync(path.join(dir, "sd-server.exe"), "");
  }
  const handles = [];
  const arb = { reserve() {}, release() {}, makeRoom: async () => true, busyBegin() {}, busyEnd() {} };
  const svc = new RuntimeService({
    id: "sdcpp",
    cacheRoot: root,
    configFn: () => ({ pinnedBuild: DEFAULT_SDCPP_BUILD, binaries: DEFAULT_SDCPP_BINARIES.map(binaryAsset), idleSeconds: 0 }),
    hardwareFn: () => ({ platform: "windows", runtimes: {}, gpus: [] }),
    systemFn: () => ({ platform: "win32", arch: "x64", versions: {}, missingDlls: () => [] }),
    modelsFn: () => stores.getRunnerConfigStore().listRuntimeModels("sdcpp"),
    server: { argv: sdServerArgv, ready: async () => true },
    logDir: root,
    startServer: async (exe, argv, opts) => {
      const h = { alive: true, url: opts.url, isAlive: () => h.alive, stop: () => (h.alive = false) };
      handles.push(h);
      return h;
    },
    findPort: async () => 18911,
    arbiter: () => arb,
  });
  configureRuntimeServices([["sdcpp", svc]]);
  return { svc, handles };
}
/** The chat runner on the same cache, nothing of its own loaded. */
const runner = () => {
  const r = new RunnerService(root);
  vi.spyOn(r, "resident").mockReturnValue({ models: [] });
  return r;
};

test("Clear models cache knows the runtimes' models: refused while one downloads or runs a job, else the idle server stops and they go", async () => {
  appSeed([FLUX]);
  let open;
  const gate = new Promise((r) => (open = r));
  const hub = fakeHub();
  const real = download.streamDownload.getMockImplementation();
  download.streamDownload.mockImplementation(async (...a) => {
    await gate;
    return real(...a);
  });
  const { svc, handles } = serving();
  svc.downloadModel("flux2-klein-4b");
  expect(await runner().clearModelsCache()).toEqual({ ok: false, detail: "models busy", models: ["flux2-klein-4b"] });
  open();
  await until(() => svc.modelsStatus()[0].status === "downloaded");
  expect(hub.length).toBe(3);

  const m = svc.modelFor("flux2-klein-4b");
  await svc.ensureServer({ modelKey: m.key, files: m.files });
  let finish;
  const job = svc.runJob(() => new Promise((r) => (finish = r)));
  expect(await runner().clearModelsCache()).toEqual({ ok: false, detail: "models busy", models: ["flux2-klein-4b"] });
  expect(existsSync(m.files.diffusion_model)).toBe(true); // nothing deleted while busy
  finish();
  await job;

  const res = await runner().clearModelsCache();
  expect(res.ok).toBe(true);
  expect(handles[0].alive).toBe(false); // the idle server let go of its files first
  expect(existsSync(m.files.diffusion_model)).toBe(false);
  expect(svc.modelsStatus()[0]).toMatchObject({ onDisk: false, status: "" }); // not "downloaded" any more
});

test("Clear models cache through a linked cache takes only this app's runtime-model files — another tool's stay", async () => {
  const elsewhere = mkdtempSync(path.join(tmpdir(), "kit-rtmodels-linked-"));
  try {
    symlinkSync(elsewhere, path.join(root, "hf"), "junction");
    appSeed([FLUX]);
    fakeHub();
    const { svc } = serving();
    svc.downloadModel("flux2-klein-4b");
    await until(() => svc.modelsStatus()[0].status === "downloaded");
    const repo = path.join(elsewhere, "models--leejet--FLUX.2-klein-4B-GGUF");
    const theirs = path.join(repo, "snapshots", "abc123", "other-quant.gguf");
    writeFileSync(theirs, "another tool's file");
    const m = svc.modelFor("flux2-klein-4b");

    const res = await runner().clearModelsCache();
    expect(res).toEqual({ ok: true, bytes: DIFF.length + TEXT.length + VAE.length }); // each file once, link and blob alike
    expect(existsSync(m.files.diffusion_model)).toBe(false);
    expect(existsSync(path.join(repo, "blobs", FLUX.files[0].sha256))).toBe(false);
    expect(readFileSync(theirs, "utf8")).toBe("another tool's file");
  } finally {
    rmSync(elsewhere, { recursive: true, force: true });
  }
});

test("linkSnapshot: a symlink, else a hard link, else a copy — the bytes the same either way", () => {
  const blob = path.join(root, "blob");
  writeFileSync(blob, "bytes");
  const snap = path.join(root, "snap", "file");
  mkdirSync(path.dirname(snap), { recursive: true });
  expect(["symlink", "hardlink", "copy"]).toContain(models.linkSnapshot(blob, snap));
  expect(readFileSync(snap, "utf8")).toBe("bytes");
});
