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
import { createAll } from "../src/llm/db.js";
import { makeRuntimesRouter } from "../src/llm/runtimes_api.js";
import * as seed from "../src/llm/seed.js";
import * as stores from "../src/llm/stores.js";
import { ROOM_MARGIN } from "../src/platform/disk_room.js";
import { createServer } from "../src/platform/server.js";
import { openDatabase } from "../src/platform/sql.js";
import { runtimeVariantDir } from "../src/runner/binary.js";
import { binaryAsset, DEFAULT_SDCPP_BINARIES, DEFAULT_SDCPP_BUILD } from "../src/runner/config.js";
import * as download from "../src/runner/download.js";
import { RunnerService } from "../src/runner/lifecycle.js";
import * as models from "../src/runner/models.js";
import { configureRuntimeServices, RuntimeService, stopRuntimeServers } from "../src/runner/runtime_service.js";
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
const service = (extra = {}) =>
  new RuntimeService({
    id: "sdcpp",
    cacheRoot: root,
    configFn: () => ({ pinnedBuild: DEFAULT_SDCPP_BUILD, binaries: DEFAULT_SDCPP_BINARIES.map(binaryAsset), idleSeconds: 300 }),
    hardwareFn: () => ({ platform: "windows", runtimes: {}, gpus: [] }),
    systemFn: () => ({ platform: "win32", arch: "x64", versions: {}, missingDlls: () => [] }),
    modelsFn: () => stores.getRunnerConfigStore().listRuntimeModels("sdcpp"),
    ...extra,
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

// ── K10b: the room on the drive, busy, memory ─────────────────────────────────────────────────────────────────────

test("a model download that wouldn't fit the drive is refused before anything downloads; what its unfinished files hold counts", async () => {
  appSeed([FLUX]);
  const urls = fakeHub();
  const all = DIFF.length + TEXT.length + VAE.length;
  const svc = service({ freeBytesFn: () => ROOM_MARGIN + all - 1 });
  let e = null;
  try {
    svc.downloadModel("flux2-klein-4b");
  } catch (x) {
    e = x;
  }
  expect(e.diskFull).toEqual({ needBytes: ROOM_MARGIN + all, freeBytes: ROOM_MARGIN + all - 1 });
  expect(e.message).toMatch(/^FLUX\.2 \[klein\] 4B needs 0\.3 GB on the drive that holds the app's AI engines and models/);
  expect(urls).toEqual([]);
  expect(svc.modelsStatus()[0].status).toBe("");
  // a file part-downloaded already holds its room
  const blob = path.join(root, "hf", "models--bfl--klein", "blobs", FLUX.files[2].sha256);
  mkdirSync(path.dirname(blob), { recursive: true });
  writeFileSync(`${blob}.part`, VAE);
  expect(svc.downloadModel("flux2-klein-4b").status).toBe("downloading");
  await until(() => svc.modelsStatus()[0].status === "downloaded");
});

test("busy is never removed — a model while it downloads or runs a job, the engine while a job runs, the routes' 409; idle, they go", async () => {
  appSeed([FLUX]);
  let open;
  const gate = new Promise((r) => (open = r));
  fakeHub();
  const real = download.streamDownload.getMockImplementation();
  download.streamDownload.mockImplementation(async (...a) => {
    await gate;
    return real(...a);
  });
  const { svc } = serving();
  const app = createServer({ typeBase: "t/" });
  app.route("/", makeRuntimesRouter());
  svc.downloadModel("flux2-klein-4b");
  await expect(svc.deleteModel("flux2-klein-4b")).rejects.toMatchObject({ busy: "model-busy" });
  open();
  await until(() => svc.modelsStatus()[0].status === "downloaded");

  const m = svc.modelFor("flux2-klein-4b");
  await svc.ensureServer({ modelKey: m.key, files: m.files });
  let finish;
  const job = svc.runJob(() => new Promise((r) => (finish = r)));
  const model = await app.request("/v1/ai/runtimes/sdcpp/models/flux2-klein-4b", { method: "DELETE" });
  expect(model.status).toBe(409);
  expect(await model.json()).toMatchObject({ type: "t/model-busy", detail: "FLUX.2 [klein] 4B is downloading or running a job — delete it once that has finished" });
  const engine = await app.request("/v1/ai/runtimes/sdcpp/engine", { method: "DELETE" });
  expect(engine.status).toBe(409);
  expect(await engine.json()).toMatchObject({ type: "t/engine-busy", title: "The engine is busy" });
  expect(existsSync(m.files.diffusion_model)).toBe(true);
  expect(svc.installedExe()).not.toBeNull();
  finish();
  await job;

  expect((await app.request("/v1/ai/runtimes/sdcpp/models/flux2-klein-4b", { method: "DELETE" })).status).toBe(200);
  expect(existsSync(m.files.diffusion_model)).toBe(false);
  expect((await app.request("/v1/ai/runtimes/sdcpp/engine", { method: "DELETE" })).status).toBe(200);
  expect(svc.installedExe()).toBeNull();
});

test("a runtime's model is rated the way a chat row is — its fit from its needs, its speed band, measured beating predicted", () => {
  appSeed([{ ...FLUX, minRamMb: 12288, refSpeed: { cuda12: 20, cpu: 600 } }]);
  expect(stores.getRunnerConfigStore().listRuntimeModels("sdcpp")[0]).toMatchObject({ minRamMb: 12288, refSpeed: { cuda12: 20, cpu: 600 }, peakVramMb: 6600 });
  const rated = (hw) =>
    service({ hardwareFn: () => hw, configFn: () => stores.getRunnerConfigStore().getRuntimeConfig("sdcpp"), measurements: stores.getModelMeasurementStore() });
  const nvidia = { platform: "windows", runtimes: { cuda: true }, gpus: [{ name: "RTX 2070", vramMb: 8192 }], ramMb: 32768, cpuCores: 8 };
  const svc = rated(nvidia);
  // the reference figure for this build, in seconds per image (lower is faster): predicted, so a "~" on the chip
  expect(svc.modelsStatus()[0]).toMatchObject({ fit: "ok", minVramMb: 6600, minRamMb: 12288, speedBand: "fast", predSpeed: 20, measuredSpeed: null, speedUnit: "s/image", ranHere: false });
  // a job on this box and build goes into the ledger: the measurement outranks the reference
  svc.recordSpeed("flux2-klein-4b", { secPerImage: 150 });
  expect(svc.modelsStatus()[0]).toMatchObject({ speedBand: "slow", measuredSpeed: 150, ranHere: true });
  expect(stores.getModelMeasurementStore().list("image:sdcpp:flux2-klein-4b")[0]).toMatchObject({ kind: "image", backend: "cuda12", source: "speed", secPerImage: 150 });
  // the CPU build: nothing on a card — the computer's memory holds both (12 + 6.6 GB > 16 GB); its reference: painful
  const cpu = { platform: "windows", runtimes: {}, gpus: [], ramMb: 16384, cpuCores: 8 };
  expect(rated(cpu).modelsStatus()[0]).toMatchObject({ fit: "no", speedBand: "painful", predSpeed: 600 });
  // no RAM need or reference declared: the fit reads its card need alone, no prediction — never a guess; this box's
  // measurement still stands
  appSeed([FLUX]);
  expect(rated(nvidia).modelsStatus()[0]).toMatchObject({ fit: "ok", minRamMb: null, predSpeed: null, measuredSpeed: 150, speedBand: "slow" });
});

// ── round B: files already on this computer move into the cache; every runtime's server stops ─────────────────────

/** An app's own earlier downloads of FLUX's three files, in a folder of its own. */
function oldDownloads(bodies = [DIFF, TEXT, VAE]) {
  const dir = path.join(root, "app-models");
  mkdirSync(dir, { recursive: true });
  const sources = {};
  FLUX.files.forEach((f, i) => {
    const p = path.join(dir, path.basename(f.path));
    writeFileSync(p, bodies[i]);
    sources[f.sha256] = p;
  });
  return sources;
}

test("an app's own earlier downloads move into the cache instead of downloading again — each checked, or vouched for", async () => {
  appSeed([FLUX]);
  const urls = fakeHub();
  const sources = oldDownloads();
  const svc = service();
  const r = await svc.adoptModel("flux2-klein-4b", sources);
  expect(r).toEqual({ adopted: FLUX.files.map((f) => f.sha256), kept: [], skipped: [] });
  for (const p of Object.values(sources)) expect(existsSync(p)).toBe(false); // moved, not copied
  expect(svc.modelsStatus()[0].onDisk).toBe(true);
  expect(readFileSync(svc.modelFor("flux2-klein-4b").files.diffusion_model).equals(DIFF)).toBe(true);
  expect(urls).toEqual([]); // nothing downloaded
  // a second run finds them in the cache: kept, nothing to move
  expect((await svc.adoptModel("flux2-klein-4b", {})).kept).toHaveLength(3);
});

test("a file that isn't what its pin says stays where it is; one the app vouches for isn't hashed; another drive copies", async () => {
  appSeed([FLUX]);
  const sources = oldDownloads([DIFF, bytesOf("text encodeR"), VAE]); // the right size, the wrong bytes
  rmSync(sources[FLUX.files[2].sha256]); // the VAE never downloaded
  const r = await service().adoptModel("flux2-klein-4b", sources);
  expect(r.adopted).toEqual([FLUX.files[0].sha256]);
  expect(r.skipped).toEqual([
    { sha256: FLUX.files[1].sha256, reason: "checksum" },
    { sha256: FLUX.files[2].sha256, reason: "missing" },
  ]);
  expect(existsSync(sources[FLUX.files[1].sha256])).toBe(true); // left for the user, never deleted

  // vouched for (the app's manifest): not hashed — its bytes are the app's word
  const again = oldDownloads([DIFF, TEXT, VAE]);
  const hashed = [];
  const vouched = vi.fn(() => true);
  const out = await models.adoptFileSet(FLUX.files.slice(1), again, { cacheRoot: path.join(root, "hf"), verify: async (p) => hashed.push(p), vouched });
  expect(out.adopted).toHaveLength(2);
  expect(hashed).toEqual([]);

  // on another drive the rename answers EXDEV: copied in whole, the original removed after
  const other = path.join(root, "other-hf");
  const elsewhere = oldDownloads();
  const exdev = async () => {
    throw Object.assign(new Error("cross-device link not permitted"), { code: "EXDEV" });
  };
  let renamed = 0;
  const res = await models.adoptFileSet([FLUX.files[0]], elsewhere, {
    cacheRoot: other,
    vouched: () => true,
    rename: async (a, b) => (renamed++ === 0 ? exdev() : (await import("node:fs/promises")).rename(a, b)),
  });
  expect(res.adopted).toEqual([FLUX.files[0].sha256]);
  expect(existsSync(elsewhere[FLUX.files[0].sha256])).toBe(false);
  expect(readFileSync(path.join(other, "models--leejet--FLUX.2-klein-4B-GGUF", "blobs", FLUX.files[0].sha256)).equals(DIFF)).toBe(true);
});

test("a reset or restore stops every runtime's server (Windows keeps a running server's files locked)", async () => {
  appSeed([FLUX]);
  fakeHub();
  const { svc, handles } = serving();
  svc.downloadModel("flux2-klein-4b");
  await until(() => svc.modelsStatus()[0].status === "downloaded");
  const m = svc.modelFor("flux2-klein-4b");
  await svc.ensureServer({ modelKey: m.key, files: m.files });
  expect(handles[0].alive).toBe(true);
  await stopRuntimeServers();
  expect(handles[0].alive).toBe(false);
});

test("a database made before K10b gains the new columns at start-up — its rows kept, the new values 0", () => {
  const old = openDatabase(":memory:", { foreignKeys: true });
  old.exec(
    "CREATE TABLE runtime_binary (runtime VARCHAR NOT NULL, platform VARCHAR NOT NULL, gpu VARCHAR NOT NULL, source VARCHAR NOT NULL, asset_url VARCHAR, asset_bytes INTEGER NOT NULL, sha256 VARCHAR, runtime_url VARCHAR, runtime_bytes INTEGER NOT NULL, runtime_sha256 VARCHAR, server_exe VARCHAR NOT NULL, requires VARCHAR NOT NULL, built_in BOOLEAN NOT NULL, position INTEGER NOT NULL, PRIMARY KEY (runtime, platform, gpu))",
  );
  old.exec(
    "CREATE TABLE runtime_model (runtime VARCHAR NOT NULL, id VARCHAR NOT NULL, name VARCHAR NOT NULL, kind VARCHAR NOT NULL, license VARCHAR NOT NULL, files VARCHAR NOT NULL, peak_vram_mb INTEGER NOT NULL, built_in BOOLEAN NOT NULL, position INTEGER NOT NULL, PRIMARY KEY (runtime, id))",
  );
  old.exec("INSERT INTO runtime_model VALUES ('sdcpp', 'old', 'Old', 'image', '', '[]', 0, 1, 0)");
  createAll(old);
  expect(old.columnNames("runtime_binary")).toEqual(expect.arrayContaining(["asset_unpacked_bytes", "runtime_unpacked_bytes"]));
  expect(old.columnNames("runtime_model")).toEqual(expect.arrayContaining(["min_ram_mb", "ref_speed"]));
  expect(old.columnNames("model_measurements")).toContain("sec_per_image");
  expect(old.all("select id, min_ram_mb, ref_speed from runtime_model")).toEqual([{ id: "old", min_ram_mb: 0, ref_speed: "{}" }]);
  old.close();
});
