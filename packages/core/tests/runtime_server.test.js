// SPDX-License-Identifier: MIT
// A kit runtime's server (runner/runtime_service.js) and sd-server's own pieces (runner/sdcpp.js): one model at a
// time, started the kit's one way, stopped when idle or evicted, booked with the arbiter by kind — idle, then a job's
// peak after room is made — and sd-server's argv, job body and job client (progress, Cancel, failure).
// docs/plans/2026-10-24-engines-the-llama-way.md, K5 + K7.
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { runtimeVariantDir } from "../src/runner/binary.js";
import { binaryAsset, DEFAULT_SDCPP_BINARIES, DEFAULT_SDCPP_BUILD } from "../src/runner/config.js";
import { EngineBusyError, RuntimeService } from "../src/runner/runtime_service.js";
import { imageJobBody, runImageJob, runVideoJob, sdServerArgv, videoJobBody } from "../src/runner/sdcpp.js";

const NVIDIA_BOX = { platform: "windows", runtimes: { cuda: true }, gpus: [{ computeCap: "7.5" }] };
const CPU_BOX = { platform: "windows", runtimes: {}, gpus: [] };
const ROWS = DEFAULT_SDCPP_BINARIES.map((b) => ({ ...binaryAsset(b), assetBytes: b.asset_bytes, requires: b.requires }));
const FILES = { diffusion_model: "flux.gguf", llm: "qwen.gguf", vae: "vae.safetensors" };

let root;
let idleSeconds;
beforeEach(() => {
  root = mkdtempSync(path.join(tmpdir(), "kit-server-"));
  idleSeconds = 300;
  for (const gpu of ["cuda12", "cpu"]) {
    const dir = runtimeVariantDir(root, "sdcpp", DEFAULT_SDCPP_BUILD, gpu);
    mkdirSync(dir, { recursive: true });
    writeFileSync(path.join(dir, "sd-server.exe"), "");
  }
});
afterEach(() => {
  vi.useRealTimers();
  rmSync(root, { recursive: true, force: true });
});

/** A stand-in arbiter that records what it's asked, and can refuse room. */
function fakeArbiter({ room = true } = {}) {
  const log = [];
  const bookings = new Map();
  return {
    log,
    bookings,
    reserve: (key, mb, opts) => {
      bookings.set(key, { mb, ...opts });
      log.push(["reserve", key, mb, opts.kind]);
    },
    release: (key) => {
      bookings.delete(key);
      log.push(["release", key]);
    },
    makeRoom: async (mb, opts) => {
      log.push(["makeRoom", mb, opts.exclude]);
      return room;
    },
    busyBegin: (k) => log.push(["busyBegin", k]),
    busyEnd: (k) => log.push(["busyEnd", k]),
  };
}
/** A stand-in for startServerProcess: a handle that's alive until stopped. */
function fakeStart() {
  const started = [];
  const fn = async (exe, argv, opts) => {
    const h = { alive: true, url: opts.url, isAlive: () => h.alive, stop: () => (h.alive = false) };
    started.push({ exe, argv, opts, h });
    return h;
  };
  return { fn, started };
}
const service = (arb, start, hw = NVIDIA_BOX) =>
  new RuntimeService({
    id: "sdcpp",
    cacheRoot: root,
    configFn: () => ({ pinnedBuild: DEFAULT_SDCPP_BUILD, binaries: ROWS, idleSeconds, memory: { idleMb: 128, peakMb: 6600 } }),
    hardwareFn: () => hw,
    systemFn: () => ({ platform: "win32", arch: "x64", versions: {}, missingDlls: () => [] }),
    server: { argv: sdServerArgv, ready: async () => true },
    logDir: root,
    startServer: start.fn,
    findPort: async () => 18911,
    arbiter: () => arb,
  });

test("one model at a time: started once, reused, restarted on another model — its WebUI replaced by a blank page", async () => {
  const arb = fakeArbiter();
  const start = fakeStart();
  const svc = service(arb, start);
  await svc.ensureServer({ modelKey: "flux2-klein-4b", files: FILES });
  await svc.ensureServer({ modelKey: "flux2-klein-4b", files: FILES });
  expect(start.started).toHaveLength(1);
  const argv = start.started[0].argv;
  expect(argv).toEqual(expect.arrayContaining(["--listen-port", "18911", "--diffusion-model", "flux.gguf", "--llm", "qwen.gguf", "--vae", "vae.safetensors", "--offload-to-cpu", "--serve-html-path"]));
  expect(start.started[0].opts.url).toBe("http://127.0.0.1:18911");
  expect(svc.status().running).toBe("flux2-klein-4b");
  await svc.ensureServer({ modelKey: "flux3-klein", files: FILES });
  expect(start.started).toHaveLength(2);
  expect(start.started[0].h.alive).toBe(false); // the first stopped before the second started
  expect(arb.bookings.get("image:sdcpp")).toMatchObject({ mb: 128, kind: "image" });
});

test("a job: the kind busy, room made for the peak, the peak booked — then the idle booking and clock back", async () => {
  const arb = fakeArbiter();
  const svc = service(arb, fakeStart());
  await svc.ensureServer({ modelKey: "m", files: FILES });
  arb.log.length = 0;
  const out = await svc.runJob(async (url) => {
    expect(arb.bookings.get("image:sdcpp").mb).toBe(6600);
    return `rendered at ${url}`;
  });
  expect(out).toBe("rendered at http://127.0.0.1:18911");
  expect(arb.log).toEqual([
    ["busyBegin", "image"],
    ["makeRoom", 6600 - 128, "image:sdcpp"],
    ["reserve", "image:sdcpp", 6600, "image"],
    ["busyEnd", "image"],
    ["reserve", "image:sdcpp", 128, "image"],
  ]);
});

test("no room on the card (another kind's job holds it): the job is refused in words, nothing stays booked at the peak", async () => {
  const arb = fakeArbiter({ room: false });
  const svc = service(arb, fakeStart());
  await svc.ensureServer({ modelKey: "m", files: FILES });
  await expect(svc.runJob(async () => "never")).rejects.toBeInstanceOf(EngineBusyError);
  expect(arb.bookings.get("image:sdcpp").mb).toBe(128);
});

test("an arbiter eviction or the idle time stops the server and drops its booking", async () => {
  vi.useFakeTimers();
  const arb = fakeArbiter();
  const start = fakeStart();
  const svc = service(arb, start);
  await svc.ensureServer({ modelKey: "m", files: FILES });
  await arb.bookings.get("image:sdcpp").evictFn();
  expect(start.started[0].h.alive).toBe(false);
  expect(arb.bookings.has("image:sdcpp")).toBe(false);
  idleSeconds = 60;
  await svc.ensureServer({ modelKey: "m", files: FILES });
  await vi.advanceTimersByTimeAsync(59_000);
  expect(start.started[1].h.alive).toBe(true);
  await vi.advanceTimersByTimeAsync(2_000);
  expect(start.started[1].h.alive).toBe(false);
});

test("a CPU build books nothing on the card", async () => {
  const arb = fakeArbiter();
  const svc = service(arb, fakeStart(), CPU_BOX);
  await svc.ensureServer({ modelKey: "m", files: FILES });
  await svc.runJob(async () => "ok");
  expect(arb.log.filter(([op]) => op === "makeRoom")).toEqual([]);
  expect(arb.bookings.get("image:sdcpp").mb).toBe(0);
});

test("sd-server's job body: the edit's images as base64, the recipe's sampler, steps, guidance, strength and seed, step progress", () => {
  const png = Buffer.from([1, 2, 3]);
  const body = imageJobBody({ prompt: "Repaint the body", width: 1024, height: 768, init: png, refs: [png], mask: png, params: { steps: 4, cfg: 1, strength: 1, seed: 42, sampler: "euler" } });
  expect(body).toMatchObject({
    prompt: "Repaint the body",
    width: 1024,
    height: 768,
    strength: 1,
    seed: 42,
    preview: "proj",
    init_image: "AQID",
    ref_images: ["AQID"],
    mask_image: "AQID",
    sample_params: { sample_method: "euler", sample_steps: 4, guidance: { txt_cfg: 1 } },
  });
  expect(() => sdServerArgv({ port: 1, files: { nope: "x" } })).toThrow(/no flag for the model slot/);
});

/** A stand-in sd-server: `steps` progress snapshots, then the final status. */
function fakeSd(final, { steps = 4 } = {}) {
  const calls = [];
  let polls = 0;
  const fetchFn = async (url, init = {}) => {
    calls.push([init.method ?? "GET", url.replace(/^http:\/\/[^/]+/, "")]);
    const json = (body, status = 200) => ({ status, ok: status < 300, json: async () => body });
    if (/\/sdcpp\/v1\/(img|vid)_gen$/.test(url)) return json({ id: "job-1", status: "queued" }, 202);
    if (url.endsWith("/cancel")) return json({ cancel_requested: true });
    polls += 1;
    if (polls <= steps) return json({ status: "generating", preview: { step: polls, total_steps: steps } });
    return json(final);
  };
  return { fetchFn, calls };
}

test("the job client: step progress, then the image", async () => {
  const png = Buffer.from("PNG!");
  const sd = fakeSd({ status: "completed", result: { images: [{ b64_json: png.toString("base64") }] } });
  const seen = [];
  const out = await runImageJob("http://127.0.0.1:1", { prompt: "p" }, { fetchFn: sd.fetchFn, sleep: async () => {}, onProgress: (p) => seen.push(p.step) });
  expect(out.equals(png)).toBe(true);
  expect(seen).toEqual([1, 2, 3, 4]);
});

test("the job client: Cancel asks sd-server to stop and the job ends cancelled; a failure says why", async () => {
  const ctl = new AbortController();
  const sd = fakeSd({ status: "cancelled" });
  const run = runImageJob("http://127.0.0.1:1", {}, { fetchFn: sd.fetchFn, sleep: async () => {}, signal: ctl.signal, onProgress: (p) => p.step === 2 && ctl.abort() });
  await expect(run).rejects.toMatchObject({ name: "AbortError" });
  expect(sd.calls).toContainEqual(["POST", "/sdcpp/v1/jobs/job-1/cancel"]);
  const failed = fakeSd({ status: "failed", error: { message: "out of memory" } }, { steps: 0 });
  await expect(runImageJob("http://127.0.0.1:1", {}, { fetchFn: failed.fetchFn, sleep: async () => {} })).rejects.toThrow(/out of memory/);
});

test("sd-server's video body: frames, fps, the flow shift and the VAE's tiling, the first and last frame as base64", () => {
  const png = Buffer.from([1, 2, 3]);
  const tiling = { enabled: true, temporal_tiling: true, extra_tiling_args: "temporal_tile_frames=4" };
  const body = videoJobBody({ prompt: "a fox runs", negativePrompt: "blurry", width: 1280, height: 704, frames: 121, fps: 24, init: png, end: png, params: { steps: 3, cfg: 1, seed: 7, flowShift: 5, sigmas: [1, 0.757, 0.522, 0], vaeTiling: tiling } });
  expect(body).toMatchObject({
    prompt: "a fox runs",
    negative_prompt: "blurry",
    width: 1280,
    height: 704,
    video_frames: 121,
    fps: 24,
    seed: 7,
    output_format: "webm",
    preview: "proj",
    init_image: "AQID",
    end_image: "AQID",
    vae_tiling_params: tiling,
    sample_params: { sample_method: "euler", sample_steps: 3, flow_shift: 5, custom_sigmas: [1, 0.757, 0.522, 0], guidance: { txt_cfg: 1 } },
  });
  expect(videoJobBody({ prompt: "p", width: 8, height: 8, frames: 5 })).not.toHaveProperty("vae_tiling_params");
});

test("the video job: posted to vid_gen, step progress, then the whole encoded file and what it is", async () => {
  const webm = Buffer.from("WEBM");
  const sd = fakeSd({ status: "completed", result: { output_format: "webm", mime_type: "video/webm", fps: 24, frame_count: 121, b64_json: webm.toString("base64") } }, { steps: 3 });
  const seen = [];
  const out = await runVideoJob("http://127.0.0.1:1", { prompt: "p" }, { fetchFn: sd.fetchFn, sleep: async () => {}, onProgress: (p) => seen.push(p.step) });
  expect(sd.calls[0]).toEqual(["POST", "/sdcpp/v1/vid_gen"]);
  expect(out.bytes.equals(webm)).toBe(true);
  expect(out).toMatchObject({ mimeType: "video/webm", format: "webm", fps: 24, frames: 121 });
  expect(seen).toEqual([1, 2, 3]);
  const empty = fakeSd({ status: "completed", result: {} }, { steps: 0 });
  await expect(runVideoJob("http://127.0.0.1:1", {}, { fetchFn: empty.fetchFn, sleep: async () => {} })).rejects.toThrow(/no video/);
});
