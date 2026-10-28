// SPDX-License-Identifier: MIT
// The kit's engine runtimes, by id — every AI engine goes through the kit the way llama.cpp does (the family
// rules; docs/plans/2026-10-24-engines-the-llama-way.md, K1). llama.cpp keeps its own router path (its rows in
// `runner_binary`, its lifecycle); the others' builds are rows in `runtime_binary` under their id, their pin
// `pinned_build:<id>`, and the kit owns their defaults as it owns llama.cpp's. `kind` is the one vocabulary the
// catalog, the providers, the features, the presets and the arbiter share: llm · tts · stt · image · vision.
import { DEFAULT_SDCPP_BINARIES, DEFAULT_SDCPP_BUILD } from "./config.js";

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
    // fastGpus: the builds measured fast — CUDA 12 (~20 s an AI photo); the CPU build took ~10 minutes and the others
    // are unmeasured, so the screens say "slow here" for them before anything downloads (house-paint's note, K10b).
    defaults: Object.freeze({
      pinnedBuild: DEFAULT_SDCPP_BUILD,
      binaries: DEFAULT_SDCPP_BINARIES,
      idleSeconds: 300,
      memory: Object.freeze({ idleMb: 128, peakMb: 6600 }),
      fastGpus: Object.freeze(["cuda12"]),
    }),
  }),
});

/** The runtime registered under `id`, or null. */
export const runtimeOf = (id) => RUNTIMES[id] ?? null;

/** The runtimes whose builds are `runtime_binary` rows (all but llama.cpp's router). */
export const rowRuntimes = () => Object.values(RUNTIMES).filter((r) => r.defaults);

/** The runner_setting key holding a runtime's pinned build. */
export const pinKey = (id) => `pinned_build:${id}`;

/** The runner_setting key holding how long a runtime's server waits idle before it stops (seconds). */
export const idleKey = (id) => `idle_seconds:${id}`;
