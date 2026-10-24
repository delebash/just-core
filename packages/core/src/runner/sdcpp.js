// SPDX-License-Identifier: MIT
// stable-diffusion.cpp's server, sd-server — the kit's image runtime (docs/plans/2026-10-24-engines-the-llama-way.md,
// K5; its API: github.com/leejet/stable-diffusion.cpp/blob/master/examples/server/api.md). Measured on this PC
// (RESEARCH, "stable-diffusion.cpp's server, measured on this PC"): started with a model's files on its command line,
// its WebUI replaced by a blank page, renders through its native job API.

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
