// SPDX-License-Identifier: MIT
// The kit's engine runtimes, by id — every AI engine goes through the kit the way llama.cpp does (the family
// rules; docs/plans/2026-10-24-engines-the-llama-way.md, K1). llama.cpp keeps its own router path (its rows in
// `runner_binary`, its lifecycle); the others' builds are rows in `runtime_binary` under their id, their pin
// `pinned_build:<id>`, and the kit owns their defaults as it owns llama.cpp's. `kind` is the one vocabulary the
// catalog, the providers, the features, the presets and the arbiter share: llm · tts · stt · image · vision.
import {
  AUDIOCPP_BUILDS_IN_ORDER,
  AUDIOCPP_FEATURES,
  DEFAULT_AUDIOCPP_BINARIES,
  DEFAULT_AUDIOCPP_BUILD,
  DEFAULT_AUDIOCPP_SETTINGS,
  DEFAULT_SDCPP_BINARIES,
  DEFAULT_SDCPP_BUILD,
} from "./config.js";

export const RUNTIMES = Object.freeze({
  llamacpp: Object.freeze({ id: "llamacpp", kind: "llm", label: "llama.cpp", folder: "llamacpp", router: true }),
  sdcpp: Object.freeze({
    id: "sdcpp",
    kind: "image",
    label: "stable-diffusion.cpp",
    folder: "sdcpp",
    license: "MIT",
    // idleSeconds: the server stops after this long with no job (a seeded setting, idle_seconds:sdcpp). memory: what it
    // holds on the card — idle with --offload-to-cpu ~90 MB, a FLUX.2 klein render's peak 6.41 GB (RTX 2070, measured).
    // How fast a model runs here is its speed band (fit.rateSpeed, config.js DEFAULT_RUNTIME_BANDS), never a per-build flag.
    defaults: Object.freeze({
      pinnedBuild: DEFAULT_SDCPP_BUILD,
      binaries: DEFAULT_SDCPP_BINARIES,
      idleSeconds: 300,
      memory: Object.freeze({ idleMb: 128, peakMb: 6600 }),
    }),
  }),
  // ONNX Runtime, in-process (the engines plan's K6, round C): no build to install — onnxruntime-node is the APP's
  // package, handed to the kit (D2: installLlm({ onnx: { load } })). Its models are runtime_model rows like any
  // runtime's; the kit owns their sessions' life — built lazily by the app's adapter, booked with the arbiter (kind
  // vision), let go after its idle time (a seeded setting, idle_seconds:onnx: house-paint's 10 minutes) or when evicted.
  onnx: Object.freeze({
    id: "onnx",
    kind: "vision",
    label: "ONNX Runtime",
    folder: "onnx",
    license: "MIT",
    inProcess: true,
    defaults: Object.freeze({ idleSeconds: 600, memory: Object.freeze({ idleMb: 0, peakMb: 0 }) }),
  }),
  // audio.cpp, the speech runtime (round E, 2026-10-29 — JustVoice's engines/audiocpp moved into the kit; the user's
  // words: "One runtime, two kinds", "Yes, pin the fork"). One install and one pin serve speech (tts) and transcription
  // (stt); each kind runs in its own server process per placement — the build's own backend ("gpu") and the same build
  // on the CPU ("cpu") — so up to four, each one model's memory. Models are REGISTERED into a running server (the fork's
  // `model_management`), never put on its command line: a download, a delete or a swap restarts nothing.
  // `kind` is the primary kind (single-kind readers, the tab's name); `kinds` every kind its models have.
  audiocpp: Object.freeze({
    id: "audiocpp",
    kind: "tts",
    kinds: Object.freeze(["tts", "stt"]),
    label: "audio.cpp",
    folder: "audiocpp",
    license: "MIT",
    placements: Object.freeze(["gpu", "cpu"]),
    loads: "register",
    // memory: a process's own baseline on the card (measured 78 MB, 2026-10-12 — hardware.js); a model's peak is its row's
    // and, once measured, the ledger's. JustVoice never let speech go on idle: 0.
    defaults: Object.freeze({
      pinnedBuild: DEFAULT_AUDIOCPP_BUILD,
      binaries: DEFAULT_AUDIOCPP_BINARIES,
      idleSeconds: 0,
      memory: Object.freeze({ idleMb: 78, peakMb: 0 }),
      settings: DEFAULT_AUDIOCPP_SETTINGS,
      features: AUDIOCPP_FEATURES,
      buildsInOrder: AUDIOCPP_BUILDS_IN_ORDER,
    }),
  }),
});

/** Every kind a runtime's models have (one for most; speech and transcription for audio.cpp). */
export const kindsOf = (rt) => (rt?.kinds?.length ? [...rt.kinds] : rt?.kind ? [rt.kind] : []);

/** The runner_setting key holding one of a runtime's declared settings (`defaults.settings`) — `<name>:<runtime>`. */
export const settingKey = (id, name) => `${name}:${id}`;

/** The built-in provider of a runtime's kind: `local-<id>` for its primary kind, `local-<id>-<kind>` for another
 *  (audio.cpp's transcription: local-audiocpp-stt) — what a preset of that kind routes to. */
export const providerIdOf = (rt, kind) => (kind === rt.kind ? `local-${rt.id}` : `local-${rt.id}-${kind}`);

/** Whether the build `tag` has the runtime's `feature` (its `defaults.features`: the first build that has it). An
 *  unknown build or feature says no — a feature is offered only on a build known to carry it. */
export function buildHas(rt, tag, feature) {
  const order = rt?.defaults?.buildsInOrder ?? [];
  const first = rt?.defaults?.features?.[feature];
  if (!first || !order.includes(first) || !order.includes(tag)) return false;
  return order.indexOf(tag) >= order.indexOf(first);
}

/** The runtime registered under `id`, or null. */
export const runtimeOf = (id) => RUNTIMES[id] ?? null;

/** The runtimes whose builds are `runtime_binary` rows (all but llama.cpp's router and an in-process one). */
export const rowRuntimes = () => Object.values(RUNTIMES).filter((r) => r.defaults && !r.inProcess);

/** The runner_setting key holding a runtime's pinned build. */
export const pinKey = (id) => `pinned_build:${id}`;

/** The runner_setting key holding how long a runtime's server waits idle before it stops (seconds). */
export const idleKey = (id) => `idle_seconds:${id}`;

/** The runner_setting key holding one speed-band threshold (`which`: fast · fine · slow) for a runtime kind's models,
 *  in the kind's unit (config.js DEFAULT_RUNTIME_BANDS) — the chat bands' `band_*_toks` for the other kinds. */
export const bandKey = (kind, which) => `band_${which}:${kind}`;
