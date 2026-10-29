// SPDX-License-Identifier: MIT
// Speech through the kit's audio.cpp runtime (round E, 2026-10-29 — the user's words: "transcription a kit feature on
// an stt preset; speech (tts) no preset, the voice chooses"). Transcription is a feature like any: its own preset of kind
// stt preset names the model and where it runs (`params.placement`: auto · gpu · cpu). Speech has no preset — the app's voice
// names its model — so the app calls `withSpeechModel` with that model. Either way the runtime runs the line
// (runner/runtime_service.js useModel): the model loaded when it isn't, the kind's activity lock held so no load takes it
// away mid-line, the kind busy on the arbiter (never an eviction's victim), and the line's after-pass (its price, the
// CPU's speed, a runaway). How a request is shaped for an audio.cpp family stays the app's (JustVoice's slot.js).

import { ApiError } from "../platform/errors.js";
import { inputSeconds } from "../runner/audiocpp.js";
import { getRuntimeService } from "../runner/runtime_service.js";
import { resolveRuntimeFeature, runtimeFeatureReadiness } from "./image_dispatch.js";

/** The runtime a provider of type `local-<id>` runs on, or "". */
const runtimeOfProvider = (provider) => (String(provider?.providerType || "").startsWith("local-") ? provider.providerType.slice("local-".length) : "");

/**
 * Run one line, `fn(server, held)`, on `modelId` of runtime `runtimeId` — loaded first when it isn't where asked
 * (`placement` "auto": wherever it is, else the runtime decides) or holds other `sessionOptions`. `held` is
 * `{modelId, placement, kind, reason}`. `line(result)` → `{text, audioS}`: what the line said and its audio's seconds,
 * for the after-line pass (a speech line: its text and its WAV's length — runner/audiocpp.js wavSeconds).
 */
export async function withSpeechModel(runtimeId, modelId, { placement = "auto", sessionOptions = undefined, line = null } = {}, fn) {
  const svc = getRuntimeService(runtimeId);
  if (!svc?.useModel) throw new ApiError(409, "engine-not-on", "This speech engine isn't on in this app", `no runtime ${runtimeId} that loads models`);
  return svc.useModel(modelId, { placement, sessionOptions, line }, fn);
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
  const audioS = inputSeconds(body);
  return withSpeechModel(runtime, preset.model, { placement, line: () => ({ audioS }) }, (server) => server.transcribe({ model: preset.model, ...body }, timeout));
}
