// SPDX-License-Identifier: MIT
// stable-diffusion.cpp's server, sd-server — the kit's image runtime (docs/plans/2026-10-24-engines-the-llama-way.md,
// K5; its API: github.com/leejet/stable-diffusion.cpp/blob/master/examples/server/api.md). As measured on this PC
// (RESEARCH, "stable-diffusion.cpp's server, measured on this PC"): started with a model's files on its command line
// (loading by recipe needs its own category folders, which the HF cache layout isn't), its WebUI replaced by a blank
// page, ready once /v1/models answers, renders through the native job API — POST /sdcpp/v1/img_gen → GET
// /sdcpp/v1/jobs/{id} (with `preview: "proj"` its step/total at no measured cost) → POST …/cancel.

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
const SLOT_FLAGS = Object.freeze({ diffusion_model: "--diffusion-model", llm: "--llm", vae: "--vae", clip_l: "--clip_l", t5xxl: "--t5xxl", tae: "--taesd" });

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

/** The native job body for one image edit (`init` + `refs` + `mask` as PNG Buffers; `params` the preset's recipe). */
export function imageJobBody({ prompt, width, height, init = null, refs = [], mask = null, params = {} }) {
  const b64 = (buf) => Buffer.from(buf).toString("base64");
  const body = {
    prompt: String(prompt ?? ""),
    width,
    height,
    strength: params.strength ?? 1,
    seed: params.seed ?? 42,
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
 * Run one job on a ready sd-server at `url`: progress as `onProgress({step, steps, fraction})`, `signal` cancels
 * (sd-server stops at its next checkpoint — ~3 s measured). → the image as a PNG Buffer.
 */
export async function runImageJob(url, body, { onProgress = null, signal = null, pollMs = 250, fetchFn = fetch, sleep = (ms) => new Promise((r) => setTimeout(r, ms)) } = {}) {
  signal?.throwIfAborted();
  const sub = await fetchFn(`${url}/sdcpp/v1/img_gen`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  const accepted = await sub.json().catch(() => ({}));
  if (sub.status !== 202 || !accepted.id) throw new Error(`sd-server refused the job (${sub.status}): ${JSON.stringify(accepted).slice(0, 300)}`);
  let cancelSent = false;
  const cancel = () => {
    if (cancelSent) return;
    cancelSent = true;
    fetchFn(`${url}/sdcpp/v1/jobs/${accepted.id}/cancel`, { method: "POST" }).catch(() => {});
  };
  signal?.addEventListener("abort", cancel, { once: true });
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
      if (j.status === "completed") {
        const img = j.result?.images?.[0]?.b64_json ?? j.result?.b64_json ?? j.result?.data?.[0]?.b64_json;
        if (!img) throw new Error("sd-server finished the job with no image");
        return Buffer.from(img, "base64");
      }
      if (j.status === "cancelled") throw Object.assign(new Error("the image was cancelled"), { name: "AbortError" });
      if (j.status === "failed") throw new Error(`sd-server failed the job: ${j.error?.message ?? JSON.stringify(j.error ?? "").slice(0, 300)}`);
    }
  } finally {
    signal?.removeEventListener("abort", cancel);
  }
}

/** What RuntimeService needs to run sd-server: its argv, its readiness. */
export const SDCPP_SERVER = Object.freeze({ argv: sdServerArgv, ready: sdReady });

/**
 * One image edit through the kit's sd.cpp runtime: its server started on `model` (`{key, files: {slot: path}}`) if it
 * isn't already, room made on the card, the job run — `request` as imageJobBody takes it. → a PNG Buffer.
 */
export async function imageEdit(service, { model, request, onProgress = null, signal = null }) {
  await service.ensureServer({ modelKey: model.key, files: model.files });
  return service.runJob((url) => runImageJob(url, imageJobBody(request), { onProgress, signal }));
}
