// SPDX-License-Identifier: MIT
// stable-diffusion.cpp's server, sd-server — the kit's image runtime (docs/plans/2026-10-24-engines-the-llama-way.md,
// K5; its API: github.com/leejet/stable-diffusion.cpp/blob/master/examples/server/api.md). As measured on this PC
// (RESEARCH, "stable-diffusion.cpp's server, measured on this PC"): started with a model's files on its command line
// (loading by recipe needs its own category folders, which the HF cache layout isn't), its WebUI replaced by a blank
// page, ready once /v1/models answers, renders through the native job API — POST /sdcpp/v1/img_gen (a video:
// /sdcpp/v1/vid_gen) → GET /sdcpp/v1/jobs/{id} (with `preview: "proj"` its step/total at no measured cost) → POST
// …/cancel.

import path from "node:path";

/** The flags the kit starts sd-server with — a staged build must accept them (acquireRuntime's probe), or the
 *  install fails and the engine on disk stays. `--help` after them: known flags exit 0, an unknown one 1. */
export const SDCPP_PROBE_ARGVS = Object.freeze([
  Object.freeze([
    "--listen-ip", "127.0.0.1",
    "--listen-port", "1",
    "--diffusion-model", "probe.gguf",
    "--llm", "probe.gguf",
    "--vae", "probe.safetensors",
    "--lora-model-dir", "probe",
    "--hires-upscalers-dir", "probe",
    "--backend", "te=cpu",
    "--params-backend", "diffusion=disk",
    "--offload-to-cpu",
    "--serve-html-path", "probe.html",
    "--help",
  ]),
]);

/** A catalog row's file slots → sd-server's model flags (the recipe's slots: diffusion_model, llm, vae, …). */
const SLOT_FLAGS = Object.freeze({
  diffusion_model: "--diffusion-model",
  llm: "--llm",
  vae: "--vae",
  clip_l: "--clip_l",
  t5xxl: "--t5xxl",
  tae: "--taesd",
  // LTX-2.x (docs/ltx2.md): its audio VAE and its text encoder's embeddings connectors
  audio_vae: "--audio-vae",
  embeddings_connectors: "--embeddings-connectors",
});

// A row's LoRA slots (`lora`, `lora_<name>`) and its upscaler (`upscaler`): files sd-server finds by NAME in the folders
// it starts with — a LoRA as its path under `--lora-model-dir`, the upscale pass's model as its file name without the
// ending in `--hires-upscalers-dir` (examples/server/api.md, "LoRA Rules"; common.cpp resolve_model_file_from_dir).
const isLoraSlot = (slot) => slot === "lora" || slot.startsWith("lora_");

/** The folder holding every one of a row's LoRA files (the deepest one they share), or null when it has none. */
export function loraDirOf(files) {
  const dirs = Object.entries(files || {})
    .filter(([slot]) => isLoraSlot(slot))
    .map(([, f]) => path.dirname(String(f)));
  if (!dirs.length) return null;
  return dirs.reduce((a, b) => {
    while (path.relative(a, b).startsWith("..") || path.isAbsolute(path.relative(a, b))) a = path.dirname(a);
    return a;
  });
}

/** sd-server's argv for one model: `files` `{slot: path}`, `blankPage` the empty page served at / instead of its WebUI,
 *  `spec` the row's own way of running: `backend` which device runs each part (`--backend`; LTX-2.3's Gemma 3 on the CPU,
 *  "te=cpu"), `paramsBackend` where its weights live (`--params-backend`; on 8 GB streamed from the drive,
 *  "diffusion=disk,te=disk"). */
export function sdServerArgv({ port, files, blankPage, offloadToCpu = true, spec = {} }) {
  const argv = ["--listen-ip", "127.0.0.1", "--listen-port", String(port)];
  for (const [slot, file] of Object.entries(files || {})) {
    if (isLoraSlot(slot)) continue;
    if (slot === "upscaler") {
      argv.push("--hires-upscalers-dir", path.dirname(String(file)));
      continue;
    }
    const flag = SLOT_FLAGS[slot];
    if (!flag) throw new TypeError(`sd-server has no flag for the model slot "${slot}"`);
    argv.push(flag, String(file));
  }
  const loraDir = loraDirOf(files);
  if (loraDir) argv.push("--lora-model-dir", loraDir);
  if (spec?.backend) argv.push("--backend", String(spec.backend));
  if (spec?.paramsBackend) argv.push("--params-backend", String(spec.paramsBackend));
  if (offloadToCpu) argv.push("--offload-to-cpu");
  if (blankPage) argv.push("--serve-html-path", String(blankPage));
  return argv;
}

/** Ready: the OpenAI-shaped model list answers (present on every build; /sdcpp/v1/models/status only on newer ones). */
export async function sdReady(url, { fetchFn = fetch } = {}) {
  try {
    const r = await fetchFn(`${url}/v1/models`, { signal: AbortSignal.timeout(2000) });
    return r.ok;
  } catch {
    return false;
  }
}

/** The native job body for one image edit (`init` + `refs` + `mask` as PNG Buffers; `params` the preset's recipe; the
 *  caller's own `seed` wins over the preset's — JustStage, 2026-10-29: a per-run seed reached sd.cpp as 42). */
export function imageJobBody({ prompt, width, height, init = null, refs = [], mask = null, params = {}, seed = null }) {
  const b64 = (buf) => Buffer.from(buf).toString("base64");
  const body = {
    prompt: String(prompt ?? ""),
    width,
    height,
    strength: params.strength ?? 1,
    seed: seed ?? params.seed ?? 42,
    output_format: "png",
    preview: "proj",
    preview_interval: 1,
    sample_params: { sample_method: params.sampler ?? "euler", sample_steps: params.steps ?? 4, guidance: { txt_cfg: params.cfg ?? 1 } },
  };
  if (init) body.init_image = b64(init);
  if (refs.length) body.ref_images = refs.map(b64);
  if (mask) body.mask_image = b64(mask);
  return body;
}

/**
 * The native job body for one video (api.md, `POST /sdcpp/v1/vid_gen`): `frames` rounded down to 4n+1 by sd-server,
 * `init`/`end` the first and last frame as PNG Buffers (image-to-video, first-last-frame), `params` the preset's
 * recipe — `flowShift`, `sigmas` (sd-server's `custom_sigmas`), `vaeTiling` (its `vae_tiling_params`: the Wan VAE's
 * decode is the big one on a small card) beside the image's sampler, scheduler, steps, cfg and seed; `strength` how far
 * the first frame may change; `hires` a second pass after an upscale (`{upscaler, width, height, steps, sigmas,
 * denoisingStrength}` — LTX's two-stage clip: its x2 latent upscaler, then a short refine).
 * `guide` the frames a guide LoRA follows (PNG Buffers: depth, pose or drawn paths — sd-server's `control_frames`),
 * `audio` a WAV the clip is driven by (`ref_audios`: LTX's audio-to-video, the mouth follows the track), `loras`
 * `[{path, multiplier}]` by their path under the server's LoRA folder (videoRequestFor names them by the row's slots).
 */
export function videoJobBody({ prompt, negativePrompt = "", width, height, frames, fps = 16, init = null, end = null, guide = [], audio = null, loras = [], params = {}, seed = null }) {
  const b64 = (buf) => Buffer.from(buf).toString("base64");
  const sample = { sample_method: params.sampler ?? "euler", sample_steps: params.steps ?? 4, guidance: { txt_cfg: params.cfg ?? 1 } };
  if (params.scheduler) sample.scheduler = params.scheduler;
  if (params.flowShift != null) sample.flow_shift = params.flowShift;
  if (params.sigmas?.length) sample.custom_sigmas = params.sigmas; // a distilled model's own timesteps
  const body = {
    prompt: String(prompt ?? ""),
    negative_prompt: String(negativePrompt ?? ""),
    width,
    height,
    video_frames: frames,
    fps,
    seed: seed ?? params.seed ?? 42, // the caller's own wins, as an image's
    output_format: "webm",
    preview: "proj",
    preview_interval: 1,
    sample_params: sample,
  };
  if (params.vaeTiling) body.vae_tiling_params = params.vaeTiling;
  if (params.strength != null) body.strength = params.strength;
  const h = params.hires;
  if (h) {
    body.hires = { enabled: true, upscaler: String(h.upscaler ?? ""), target_width: h.width, target_height: h.height, steps: h.steps };
    if (h.sigmas?.length) body.hires.custom_sigmas = h.sigmas;
    if (h.denoisingStrength != null) body.hires.denoising_strength = h.denoisingStrength;
  }
  if (init) body.init_image = b64(init);
  if (end) body.end_image = b64(end);
  if (guide?.length) body.control_frames = guide.map(b64);
  if (audio) body.ref_audios = [b64(audio)];
  if (loras?.length) body.lora = loras.map((l) => ({ path: String(l.path), multiplier: l.multiplier ?? 1 }));
  return body;
}

/**
 * A video request as `model` (`{files: {slot: path}, spec}` — RuntimeService.modelFor) runs it: the row's own recipe
 * (`spec.params`: its sigmas, an upscale pass, VAE tiling — what a preset's settings can't hold) under the request's
 * params; its `loras` named by the row's slots (`[{slot, multiplier}]`) become their paths under the server's LoRA folder
 * (loraDirOf), and an upscale pass that names no upscaler takes the row's `upscaler` file by its name. → videoJobBody's
 * argument.
 */
export function videoRequestFor(model, request) {
  const files = model?.files ?? {};
  const loraDir = loraDirOf(files);
  const loras = (request.loras ?? []).map(({ slot, multiplier = 1 }) => {
    if (!isLoraSlot(String(slot)) || !files[slot]) throw new TypeError(`the video model has no LoRA "${slot}"`);
    return { path: path.relative(loraDir, String(files[slot])).split(path.sep).join("/"), multiplier };
  });
  const params = { ...(model?.spec?.params ?? {}), ...(request.params ?? {}) };
  if (params.hires && !params.hires.upscaler && files.upscaler) {
    params.hires = { ...params.hires, upscaler: path.basename(String(files.upscaler), path.extname(String(files.upscaler))) };
  }
  return { ...request, loras, params };
}

/**
 * Run one job on a ready sd-server at `url`: progress as `onProgress({step, steps, fraction})`, `signal` cancels
 * (sd-server stops at its next checkpoint — ~3 s measured). → the image as a PNG Buffer.
 */
export function runImageJob(url, body, opts = {}) {
  return runNativeJob(url, "img_gen", body, opts, (result) => {
    const img = result?.images?.[0]?.b64_json ?? result?.b64_json ?? result?.data?.[0]?.b64_json;
    if (!img) throw new Error("sd-server finished the job with no image");
    return Buffer.from(img, "base64");
  });
}

/**
 * Run one video job (as runImageJob) → `{bytes, mimeType, format, fps, frames}`: the whole encoded file sd-server
 * returns (api.md: "one encoded container payload, not a list of per-frame images").
 */
export function runVideoJob(url, body, opts = {}) {
  return runNativeJob(url, "vid_gen", body, opts, (result) => {
    if (!result?.b64_json) throw new Error("sd-server finished the job with no video");
    return { bytes: Buffer.from(result.b64_json, "base64"), mimeType: result.mime_type ?? "", format: result.output_format ?? "", fps: result.fps ?? 0, frames: result.frame_count ?? 0 };
  });
}

/** One native job (`mode` img_gen or vid_gen): submit, poll with step progress, cancel on `signal`, `pick(result)` the output. */
async function runNativeJob(url, mode, body, { onProgress = null, signal = null, pollMs = 250, fetchFn = fetch, sleep = (ms) => new Promise((r) => setTimeout(r, ms)) } = {}, pick) {
  signal?.throwIfAborted();
  const sub = await fetchFn(`${url}/sdcpp/v1/${mode}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  const accepted = await sub.json().catch(() => ({}));
  if (sub.status !== 202 || !accepted.id) throw new Error(`sd-server refused the job (${sub.status}): ${JSON.stringify(accepted).slice(0, 300)}`);
  let cancelSent = false;
  const cancel = () => {
    if (cancelSent) return;
    cancelSent = true;
    fetchFn(`${url}/sdcpp/v1/jobs/${accepted.id}/cancel`, { method: "POST" }).catch(() => {});
  };
  signal?.addEventListener("abort", cancel, { once: true });
  // a Cancel that came while the job was being submitted fired before the listener existed: heard now (JustStage,
  // 2026-10-29 — a job cancelled right after it was submitted still finished and made its picture)
  if (signal?.aborted) cancel();
  try {
    let lastStep = -1;
    for (;;) {
      await sleep(pollMs);
      const j = await (await fetchFn(`${url}/sdcpp/v1/jobs/${accepted.id}`)).json();
      const step = j.preview?.step;
      if (step != null && step !== lastStep) {
        lastStep = step;
        const steps = j.preview.total_steps || 0;
        onProgress?.({ step, steps, fraction: steps ? step / steps : 0 });
      }
      if (j.status === "completed") return pick(j.result);
      if (j.status === "cancelled") throw Object.assign(new Error(mode === "vid_gen" ? "the video was cancelled" : "the image was cancelled"), { name: "AbortError" });
      if (j.status === "failed") throw new Error(`sd-server failed the job: ${j.error?.message ?? JSON.stringify(j.error ?? "").slice(0, 300)}`);
    }
  } finally {
    signal?.removeEventListener("abort", cancel);
  }
}

/** What RuntimeService needs to run sd-server: its argv, its readiness. */
export const SDCPP_SERVER = Object.freeze({ argv: sdServerArgv, ready: sdReady });

/**
 * One image edit through the kit's sd.cpp runtime: its server started on `model` (`{key, files: {slot: path}, peakVramMb}`
 * — RuntimeService.modelFor(id)) if it
 * isn't already, room made on the card, the job run — `request` as imageJobBody takes it. → a PNG Buffer. Its seconds go
 * into the kit's measurement ledger (RuntimeService.recordSpeed): the model's speed band on this box from then on.
 */
export async function imageEdit(service, { model, request, onProgress = null, signal = null }) {
  await service.ensureServer({ modelKey: model.key, files: model.files, peakVramMb: model.peakVramMb ?? 0, spec: model.spec ?? {} });
  const t0 = Date.now();
  const png = await service.runJob((url) => runImageJob(url, imageJobBody(request), { onProgress, signal }));
  service.recordSpeed?.(model.key, { secPerImage: (Date.now() - t0) / 1000 });
  return png;
}

/** One video through the kit's sd.cpp runtime, as imageEdit — `request` as videoJobBody takes it, its LoRAs by the row's
 *  slots (videoRequestFor). Its speed goes into the ledger as seconds of clip per second of work (the video kind's unit).
 *  A row whose `spec.serverPerJob` is set has its server stopped after each clip, so the next starts fresh (a second LTX
 *  clip on one server ran out of memory in JustDirect's tests, 2026-10-28). → runVideoJob's result. */
export async function videoGen(service, { model, request, onProgress = null, signal = null }) {
  await service.ensureServer({ modelKey: model.key, files: model.files, peakVramMb: model.peakVramMb ?? 0, spec: model.spec ?? {} });
  const t0 = Date.now();
  try {
    const out = await service.runJob((url) => runVideoJob(url, videoJobBody(videoRequestFor(model, request)), { onProgress, signal }));
    const clipS = out.frames && out.fps ? out.frames / out.fps : Number(request.frames || 0) / Number(request.fps || 16);
    const workS = (Date.now() - t0) / 1000;
    if (clipS > 0 && workS > 0) service.recordSpeed?.(model.key, { realtimeX: clipS / workS });
    return out;
  } finally {
    if (model.spec?.serverPerJob) await service.stopServerIfIdle();
  }
}
