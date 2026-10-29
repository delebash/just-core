// SPDX-License-Identifier: MIT
// Speech through the kit's audio.cpp runtime (round E, 2026-10-29 — the user's words: "transcription a kit feature on
// an stt preset; speech (tts) no preset, the voice chooses"). Transcription is a feature like any: its own preset of kind
// stt names the model and where it runs (`params.placement`: auto · gpu · cpu). Speech has no preset — the app's voice
// names its model — so the app calls `withSpeechModel` with that model. Either way the model is loaded when it isn't
// (registered into its kind's server — runner/runtime_service.js loadModel), the kind is marked busy on the arbiter for
// the call (a model mid-line is never an eviction's victim), and the request goes to the server holding it. How a
// request is shaped for an audio.cpp family stays the app's (JustVoice's slot.js): this file runs it.

import { ApiError } from "../platform/errors.js";
import { getArbiter } from "../runner/arbiter.js";
import { getRuntimeService } from "../runner/runtime_service.js";
import { resolveRuntimeFeature, runtimeFeatureReadiness } from "./image_dispatch.js";

/** The runtime a provider of type `local-<id>` runs on, or "". */
const runtimeOfProvider = (provider) => (String(provider?.providerType || "").startsWith("local-") ? provider.providerType.slice("local-".length) : "");

/**
 * Run `fn(server, held)` with `modelId` loaded on runtime `runtimeId` (loaded first when it isn't, on `placement` —
 * "auto" lets the runtime decide — with the user's `sessionOptions`), its kind busy on the arbiter meanwhile. `held` is
 * `{modelId, placement, kind}`. A model already loaded where asked (or anywhere, for "auto") is used as it is.
 */
export async function withSpeechModel(runtimeId, modelId, { placement = "auto", sessionOptions = undefined } = {}, fn) {
  const svc = getRuntimeService(runtimeId);
  if (!svc?.loadModel) throw new ApiError(409, "engine-not-on", "This speech engine isn't on in this app", `no runtime ${runtimeId} that loads models`);
  let held = svc.loaded().find((l) => l.modelId === modelId) ?? null;
  if (!held || (placement !== "auto" && held.placement !== placement) || sessionOptions !== undefined) {
    held = await svc.loadModel(modelId, { placement, ...(sessionOptions !== undefined ? { sessionOptions } : {}) });
  }
  const arb = getArbiter();
  arb.busyBegin(held.kind);
  try {
    return await fn(svc.serverFor(modelId), held);
  } finally {
    arb.busyEnd(held.kind);
  }
}

/** What transcription feature `featureKey` needs before it can run (the readiness the screens word, kind stt). */
export const speechFeatureReadiness = (featureKey) => runtimeFeatureReadiness(featureKey, "stt");

/**
 * Transcribe through feature `featureKey`'s stt preset: its model, loaded where the preset says, then audio.cpp's
 * `/v1/audio/transcriptions/details` with `body` (the app's request — its audio, language …). → audio.cpp's answer.
 */
export async function transcribeFeature(featureKey, body, { timeout = null } = {}) {
  const { preset, provider } = resolveRuntimeFeature(featureKey, "stt");
  const runtime = runtimeOfProvider(provider);
  if (!runtime) throw new ApiError(409, "no-stt-adapter", "This transcription provider can't run yet", `no runtime for ${provider.providerType}`);
  const placement = preset.params?.placement || "auto";
  return withSpeechModel(runtime, preset.model, { placement }, (server) => server.transcribe({ model: preset.model, ...body }, timeout));
}
