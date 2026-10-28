// SPDX-License-Identifier: MIT
// An image feature's run, routed the way every AI feature is (docs/plans/2026-10-24-engines-the-llama-way.md, K8):
// the feature's own preset — an image feature never falls to the chat default preset — the preset's provider (of kind
// "image") and its model. The built-in `local-sdcpp` provider runs it on the kit's runtime (runner/sdcpp.js imageEdit:
// the server started on the model's files, room made on the card, the job with step progress and Cancel); a cloud
// image provider later is a provider row plus an adapter in IMAGE_ADAPTERS. A vision feature (the plan's K6, round C)
// runs the same way on the in-process ONNX Runtime (`local-onnx`): the app's adapter for its preset's model
// (registerVisionAdapter — its own pre/post-processing) held in memory by the kit (RuntimeService.withModel).
import { ApiError } from "../platform/errors.js";
import { EngineBusyError, getRuntimeService } from "../runner/runtime_service.js";
import * as sdcpp from "../runner/sdcpp.js";
import * as stores from "./stores.js";

/** An image provider's type → its run: `({preset, provider, request, onProgress, signal})` → a PNG Buffer. */
export const IMAGE_ADAPTERS = {
  "local-sdcpp": async ({ preset, request, onProgress, signal }) => {
    const svc = getRuntimeService("sdcpp");
    if (!svc) throw new ApiError(409, "engine-not-on", "The image engine isn't part of this app", "this app doesn't turn the sd.cpp runtime on");
    if (!svc.installedExe()) throw new ApiError(409, "engine-not-installed", "The image engine isn't installed", `install ${svc.rt.label} first`);
    let model;
    try {
      model = svc.modelFor(preset.model);
    } catch (e) {
      if (e?.notDownloaded) throw new ApiError(409, "model-not-downloaded", "The image model isn't downloaded", e.message);
      if (e?.notFound) throw new ApiError(409, "model-unknown", "The image model isn't in this app", e.message);
      throw e;
    }
    return sdcpp.imageEdit(svc, { model, request: { ...request, params: { ...preset.params, ...(request.params || {}) } }, onProgress, signal });
  },
};

/** The preset and provider a runtime feature of `kind` (image · vision) runs with — its own assignment only. */
export function resolveRuntimeFeature(featureKey, kind) {
  const presetId = stores.getFeaturePresetRefStore().list()[featureKey] || "";
  if (!presetId) throw new ApiError(409, `no-${kind}-model`, `No ${kind} model is set for this feature`, `choose one for ${featureKey} in AI routing`);
  const preset = stores.getEnginePresetStore().get(presetId);
  if (!preset || preset.kind !== kind) throw new ApiError(409, `no-${kind}-model`, `No ${kind} model is set for this feature`, `${featureKey}'s preset isn't a ${kind} preset`);
  const provider = stores.getProviderStore().get(preset.providerId);
  if (!provider) throw new ApiError(409, `no-${kind}-provider`, `The ${kind} preset's provider is gone`, `no provider ${preset.providerId}`);
  return { preset, provider };
}

/** The preset and provider an image feature runs with — its own assignment only. */
export const resolveImageFeature = (featureKey) => resolveRuntimeFeature(featureKey, "image");

/**
 * What image feature `featureKey` needs before it can run — the screens' "this feature needs its engine" banner (the
 * plan's K10). `need` is the first thing missing, a slug the screen words: "no-image-model", "no-image-provider",
 * "engine-not-on", "engine-cant-run-here", "engine-not-installed", "model-unknown", "model-not-downloaded" — or "" when
 * it can run. `runtime` and `model` name what to install or download; `engine` is the runtime's status() (its
 * install's progress, what this computer lacks), `modelState` the model's row of modelsStatus(). A provider that isn't
 * a kit runtime (a cloud one, later) has nothing to install.
 */
export const imageFeatureReadiness = (featureKey) => runtimeFeatureReadiness(featureKey, "image");

/** What a runtime feature of `kind` (image · vision) needs before it can run — imageFeatureReadiness's answer for any
 *  kind (an in-process runtime is never "not installed": what it lacks is said as `engine-cant-run-here`). */
export function runtimeFeatureReadiness(featureKey, kind) {
  const out = { feature: featureKey, kind, ready: false, need: "", detail: "", runtime: "", model: "", engine: null, modelState: null };
  let found;
  try {
    found = resolveRuntimeFeature(featureKey, kind);
  } catch (e) {
    if (e instanceof ApiError) return { ...out, need: e.slug, detail: e.detail || "" };
    throw e;
  }
  const { preset, provider } = found;
  const runtime = String(provider.providerType || "").startsWith("local-") ? provider.providerType.slice("local-".length) : "";
  if (!runtime) return { ...out, ready: true, model: preset.model };
  const svc = getRuntimeService(runtime);
  const at = { ...out, runtime, model: preset.model };
  if (!svc) return { ...at, need: "engine-not-on" };
  const engine = svc.status();
  const modelState = svc.modelsStatus().find((m) => m.id === preset.model) ?? null;
  const need = engine.need ? "engine-cant-run-here" : !engine.installed ? "engine-not-installed" : !modelState ? "model-unknown" : !modelState.onDisk ? "model-not-downloaded" : "";
  return { ...at, engine, modelState, need, ready: !need };
}

/**
 * Run image feature `featureKey` on `request` (`{prompt, width, height, init, refs, mask}` — PNG Buffers; the preset's
 * params fill the rest). `onProgress({step, steps, fraction})`; `signal` cancels. → a PNG Buffer.
 */
export async function runImageFeature(featureKey, request, { onProgress = null, signal = null } = {}) {
  const { preset, provider } = resolveImageFeature(featureKey);
  const adapter = IMAGE_ADAPTERS[provider.providerType];
  if (!adapter) throw new ApiError(409, "no-image-adapter", "This image provider can't run yet", `no adapter for ${provider.providerType}`);
  try {
    return await adapter({ preset, provider, request, onProgress, signal });
  } catch (e) {
    if (e instanceof EngineBusyError) throw new ApiError(409, "gpu-busy", "The graphics card is busy", e.message);
    throw e;
  }
}

// ── vision: the in-process ONNX Runtime ─────────────────────────────────────────────────────────────────────────

const visionAdapters = new Map();

/**
 * The app's code for a vision model (`modelId`, a runtime_model row of the `onnx` runtime): `{ create({files, ort,
 * executionProvider, dmlDeviceId, log}) → instance with dispose() }` — its own pre/post-processing on the sessions it
 * opens (runner/onnx.js openSlot/runSlot). The kit builds it when a feature first needs it and lets it go (the
 * engines plan's K6: the app's code, the kit's sessions' life).
 */
export function registerVisionAdapter(modelId, adapter) {
  if (typeof adapter?.create !== "function") throw new TypeError(`registerVisionAdapter(${modelId}): an adapter has create()`);
  visionAdapters.set(modelId, adapter);
}

/**
 * Run vision feature `featureKey`: its preset's model held in memory by the kit's ONNX Runtime (built by the app's
 * adapter with the preset's params — its execution provider), `fn(instance)` the work on it. Refusals in the routes'
 * shape: no model downloaded, none in this app, no adapter, the card busy (409), ONNX Runtime not loading (503).
 */
export async function runVisionFeature(featureKey, fn) {
  const { preset, provider } = resolveRuntimeFeature(featureKey, "vision");
  if (provider.providerType !== "local-onnx") throw new ApiError(409, "no-vision-adapter", "This vision provider can't run yet", `no adapter for ${provider.providerType}`);
  const svc = getRuntimeService("onnx");
  if (!svc) throw new ApiError(409, "engine-not-on", "The vision engine isn't part of this app", "this app doesn't turn the ONNX runtime on");
  const adapter = visionAdapters.get(preset.model);
  if (!adapter) throw new ApiError(409, "no-vision-adapter", "This vision model can't run yet", `the app registered no adapter for ${preset.model}`);
  try {
    return await svc.withModel(preset.model, { adapter, params: preset.params || {} }, fn);
  } catch (e) {
    if (e?.notDownloaded) throw new ApiError(409, "model-not-downloaded", "The vision model isn't downloaded", e.message);
    if (e?.notFound) throw new ApiError(409, "model-unknown", "The vision model isn't in this app", e.message);
    if (e instanceof EngineBusyError) throw new ApiError(409, "gpu-busy", "The graphics card is busy", e.message);
    throw e;
  }
}
