// SPDX-License-Identifier: MIT
// stable-diffusion.cpp's server, sd-server — the kit's image runtime (docs/plans/2026-10-24-engines-the-llama-way.md,
// K5; its API: github.com/leejet/stable-diffusion.cpp/blob/master/examples/server/api.md). As measured on this PC
// (RESEARCH, "stable-diffusion.cpp's server, measured on this PC"): started with a model's files on its command line
// (loading by recipe needs its own category folders, which the HF cache layout isn't), its WebUI replaced by a blank
// page, ready once /v1/models answers, renders through the native job API — POST /sdcpp/v1/img_gen (a video:
// /sdcpp/v1/vid_gen) → GET /sdcpp/v1/jobs/{id} (with `preview: "proj"` its step/total at no measured cost) → POST
// …/cancel.

/** The flags the kit starts sd-server with — a staged build must accept them (acquireRuntime's probe), or the
 *  install fails and the engine on disk stays. `--help` after them: known flags exit 0, an unknown one 1. */
export const SDCPP_PROBE_ARGVS = Object.freeze([
  Object.freeze([
    "--listen-ip", "127.0.0.1",
    "--listen-port", "1",
    "--diffusion-model", "probe.gguf",
    "--llm", "probe.gguf",
    "--vae", "probe.safetensors",
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

/** sd-server's argv for one model: `files` `{slot: path}`, `blankPage` the empty page served at / instead of its WebUI. */
export function sdServerArgv({ port, files, blankPage, offloadToCpu = true }) {
  const argv = ["--listen-ip", "127.0.0.1", "--listen-port", String(port)];
  for (const [slot, file] of Object.entries(files || {})) {
    const flag = SLOT_FLAGS[slot];
    if (!flag) throw new TypeError(`sd-server has no flag for the model slot "${slot}"`);
    argv.push(flag, String(file));
  }
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
 * decode is the big one on a small card) beside the image's sampler, scheduler, steps, cfg and seed.
 */
export function videoJobBody({ prompt, negativePrompt = "", width, height, frames, fps = 16, init = null, end = null, params = {}, seed = null }) {
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
  if (init) body.init_image = b64(init);
  if (end) body.end_image = b64(end);
  return body;
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
  await service.ensureServer({ modelKey: model.key, files: model.files, peakVramMb: model.peakVramMb ?? 0 });
  const t0 = Date.now();
  const png = await service.runJob((url) => runImageJob(url, imageJobBody(request), { onProgress, signal }));
  service.recordSpeed?.(model.key, { secPerImage: (Date.now() - t0) / 1000 });
  return png;
}

/** One video through the kit's sd.cpp runtime, as imageEdit — `request` as videoJobBody takes it. → runVideoJob's result. */
export async function videoGen(service, { model, request, onProgress = null, signal = null }) {
  await service.ensureServer({ modelKey: model.key, files: model.files, peakVramMb: model.peakVramMb ?? 0 });
  return service.runJob((url) => runVideoJob(url, videoJobBody(request), { onProgress, signal }));
}
