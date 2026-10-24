// SPDX-License-Identifier: MIT
// An image feature's run, routed the way every AI feature is (docs/plans/2026-10-24-engines-the-llama-way.md, K8):
// the feature's own preset — an image feature never falls to the chat default preset — the preset's provider (of kind
// "image") and its model. The built-in `local-sdcpp` provider runs it on the kit's runtime (runner/sdcpp.js imageEdit:
// the server started on the model's files, room made on the card, the job with step progress and Cancel); a cloud
// image provider later is a provider row plus an adapter in IMAGE_ADAPTERS.
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

/** The preset and provider an image feature runs with — its own assignment only. */
export function resolveImageFeature(featureKey) {
  const presetId = stores.getFeaturePresetRefStore().list()[featureKey] || "";
  if (!presetId) throw new ApiError(409, "no-image-model", "No image model is set for this feature", `choose one for ${featureKey} in AI routing`);
  const preset = stores.getEnginePresetStore().get(presetId);
  if (!preset || preset.kind !== "image") throw new ApiError(409, "no-image-model", "No image model is set for this feature", `${featureKey}'s preset isn't an image preset`);
  const provider = stores.getProviderStore().get(preset.providerId);
  if (!provider) throw new ApiError(409, "no-image-provider", "The image preset's provider is gone", `no provider ${preset.providerId}`);
  return { preset, provider };
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
