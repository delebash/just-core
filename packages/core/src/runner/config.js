// SPDX-License-Identifier: MIT
// Runner config — engine DEFAULTS + the standalone fallback (the port of
// llm_runner/runner/config.py).
//
// There is NO `runner-manifest.json` (decided 2026-06-27: config is data, it belongs in the
// DB, seeded `built_in`). These module CONSTANTS are the single source of truth for the
// llama.cpp build/binaries + the VRAM safety margin:
//   * the host (`installLlm`) seeds them into the DB (`runner_binary` / `runner_setting`)
//     where they become user-editable, and injects a DB-backed `configFn` into the runner
//     service;
//   * `defaultConfig()` builds the same RunnerConfig straight from these constants for
//     STANDALONE runner use (no host DB wired), and `llm/seed.js` imports these to seed the
//     DB (one source of truth, no duplication).
//
// The base/moe/dense flag presets are NOT here — they live in the DB `switch_presets` and
// reach the spawn via the runner's `switchesFn` → `Overrides`.
//
// NOTE for the seed port: Python seeds the float constants with `str(x)` ("20.0", "0.1"),
// which `String(x)` does not reproduce for whole numbers ("20") — use `pyFloat(x)` from
// platform/pyjson.js for the DEFAULT_BAND_* / DEFAULT_SPEED_FLOOR_GRACE / DEFAULT_BW_EFF_* /
// DEFAULT_CALIB_*_MB rows.

import { model } from "../platform/models.js";
import { RunnerConfig } from "./schema.js";

// EXACT llama.cpp release tag (never "latest" — reproducible spawns).
// b10750 → b11239 (2026-09-28, the #29168 re-measure; user: "do 1" = move the pin to head).
// The earlier b10750 pin ("the last build before upstream broke MTP") did NOT survive a
// real-prompt test: its 0.823 → 0.481 acceptance drop was measured with ONE raw
// `/completion` prompt and no chat template. Through `/v1/chat/completions` — the only path
// the family sends — b10750, b10751 and b11239 are level (acceptance within 0.02 on three
// prompts, the draft 1.10–1.31× faster on every build), and drafted output ≠ greedy on EVERY
// build there. b11239 carries every post-b10750 fix. Record:
// docs/plans/2026-09-19-engine-update-safety-and-stable-channel.md §10. All seven rows
// resolve, re-verified against `gh api releases/tags/b11239` on 2026-09-28 (three renamed:
// win cuda-13.3 → 13.4, win + ubuntu rocm-7.14 → rocm-10.0).
// Seeding is insert-if-missing, so an EXISTING DB keeps its old `pinned_build` row — bump it
// in the UI (Settings → AI → engine Binaries panel); this constant fixes fresh installs and
// the panel's "reset to defaults". The Update button compares the stable channel's build
// with the build ON DISK (`update_check`); stable (v0.5.0) names b11146, older than this
// pin, so it offers nothing. (history: runner/config.py)
export const DEFAULT_PINNED_BUILD = "b11239";

// Reserve this much VRAM headroom when computing the GPU layer split.
export const DEFAULT_SAFETY_MARGIN_MB = 1024;

// The most context an UNTUNED model is handed automatically: computed ctx becomes
// min(trained, KV-affordable, this cap). A CAP, never a pin — an explicit ctx from a
// tune/preset/request always overrides, and a smaller-trained model keeps its own window
// (fit-redesign §8.1; every measured tune on all three known machines chose 32768, while
// the uncapped policy handed a cheap-KV MoE 131,072 — ~2.7 GB of KV before any weights,
// the poisoned-launch defect of §1.5). 0 = uncapped. DB-editable via runner_setting
// `ctx_cap_tokens` + the GUI field beside the margin.
export const DEFAULT_CTX_CAP_TOKENS = 32768;

// How long a good "is there a newer engine?" answer from GitHub is kept, in minutes (2026-10-29): every open of the
// Engine panel or the AI page asked, unauthenticated (60 requests an hour). 0 = ask every time. DB-editable via
// runner_setting `update_check_minutes` + the field beside the update policy.
export const DEFAULT_UPDATE_CHECK_MINUTES = 60;

// Fit-redesign Phase 2 (§8.21, §13.13) — the two floor-rule seeded facts: the canonical
// floor prices KV at MINIMAL-USABLE context ("can it run at all"; the fit verdict prices
// the real config), and the RAM floor is file + headroom. Seeded runner_setting rows.
export const DEFAULT_FLOOR_CTX_TOKENS = 4096;
export const DEFAULT_RAM_HEADROOM_MB = 4096;

// Fit-redesign Phase 3 (§8.14) — the speed-band thresholds, tok/s minimums: fast ≥ 20
// (well past reading speed) · fine ≥ 8 (the DECIDED "comfortable" reading-speed line) ·
// slow ≥ 2 · below = painful. Seeded runner_setting rows. Start values, not law.
export const DEFAULT_BAND_FAST_TOKS = 20.0;
export const DEFAULT_BAND_FINE_TOKS = 8.0;
export const DEFAULT_BAND_SLOW_TOKS = 2.0;

// The same bands for a kit runtime's models (the one-way-per-job fold, 2026-10-27), each kind in its own unit
// (fit.speedBand): an image runtime in seconds per image, lower is faster — fast ≤ 30 (FLUX.2 klein on an RTX
// 2070: 15–20 s, measured) · fine ≤ 120 · slow ≤ 300 · beyond = painful (the CPU build: ~10 minutes, house-paint's
// RESEARCH §9). Seeded runner_setting rows `band_<fast|fine|slow>:<kind>` for an app that turns the runtime on
// (seed.seedRuntimeBinaries); the dead zone is the chat bands' own `band_deadzone_frac`. Start values, not law.
export const DEFAULT_RUNTIME_BANDS = Object.freeze({
  image: Object.freeze({ fast: 30, fine: 120, slow: 300, lowerIsFaster: true, unit: "s/image" }),
  // a vision model: one image's encode, recorded by the app's adapter (the finish list's C23, 2026-10-29 — house-paint
  // measured SAM 3's encode on the CPU at 13–16 s)
  vision: Object.freeze({ fast: 5, fine: 20, slow: 60, lowerIsFaster: true, unit: "s/image" }),
});

// Speed-truth plan 2026-09-19 §5 — the band DEAD ZONE. A PREDICTED tok/s within this
// fraction of any band threshold ships band "" so the chip shows the number ("~7.9 tok/s")
// instead of a word the next probe reading may flip: on the author's box the flagship
// predicts 7.9 against a fine-line of 8.0, and a ±2 % RAM-probe wobble crosses it. A
// MEASURED speed always keeps its word.
export const DEFAULT_BAND_DEADZONE_FRAC = 0.1;

// Speed-truth plan 2026-09-19 §7 — the speed FLOOR in the fallback pick (boxes with no
// curated class tune): a model whose measured-or-predicted tok/s is below
// band_fine_toks × (1 − this) is not "fast enough". The grace is not optional: on the
// author's box a HARD 8.0 floor would drop the flagship (pred 7.9, quality rank 5) for E4B
// (rank 23) over a 0.1 tok/s rounding error. 0.2 → floor 6.4.
export const DEFAULT_SPEED_FLOOR_GRACE = 0.2;

// Speed-truth plan 2026-09-19 §6 — the ONE-MINUTE SPEED CHECK's test model, served from the
// kit's own GitHub release (ruling 2026-09-19: never from a third-party repo that can
// vanish). The file is sha-pinned, so its byte facts are constants of THAT file: read from
// its tensor table on 2026-09-19 — `*_exps` 731.4 MB of 820.1 MB of tensors, 8 of 32 experts
// active per token → 182.8 MB; everything else 88.7 MB. Source:
// bartowski/granite-3.1-1b-a400m-instruct-GGUF (IBM Granite 3.1 1B-A400M, Apache-2.0),
// redistributed unmodified — the release notes carry the license.
export const DEFAULT_CALIB_MODEL_URL =
  "https://github.com/delebash/just-core/releases/download/calib-v1/granite-3.1-1b-a400m-instruct-Q4_K_M.gguf";
export const DEFAULT_CALIB_MODEL_SHA256 = "3a2ec1c2a78cb29d901e29bbf5162dcd03381e13803d2cbdcff838d4d08142eb";
export const DEFAULT_CALIB_MODEL_SIZE_BYTES = 821_847_360;
export const DEFAULT_CALIB_ACTIVE_EXPERT_MB = 182.8;
export const DEFAULT_CALIB_NONEXPERT_MB = 88.7;

// Fit-redesign Phase 3 (§5.5 corrected + §13.8) — the two EFFICIENCY FAMILIES converting
// raw pool bandwidth into effective decode bandwidth. Two families because the pools are
// different physical processes (streamed device reads vs scattered expert gather):
// device-compute measured ≈0.59 of spec on the author's box; host-CPU converged 0.10–0.22
// across three independent derivations — seeded at 0.15, the low half (err-slow, §8.17).
// Measurement-DERIVED bandwidth bypasses these entirely.
export const DEFAULT_BW_EFF_DEVICE = 0.6;
export const DEFAULT_BW_EFF_HOST = 0.15;

// The RAM COPY PROBE's own factor — calibrated ONCE against the measured-model path, live
// on the author's desktop 2026-08-13: the probe reads 19.01 GB/s there while the measured
// host effective window is 6.9–10.6 GB/s — 19.01 × 0.40 = 7.6, the same low-mid position the
// class-seed math was designed to (51.2 × 0.15 = 7.68). It cannot share the generic host
// factor (19.01 × 0.15 = 2.85 → a band lie). The probe is topology-aware (single + threaded
// passes, best wins), so this factor is the STREAMING → SCATTERED-EXPERT-GATHER discount —
// an access-pattern property that transfers across machines far better than any spec
// ratio. Refinable per box via the settings row.
export const DEFAULT_BW_EFF_HOST_PROBE = 0.4;

// Fit-redesign Phase 5 (§13.2): keep-latest-K persisted load footprints per (model,
// machine, fingerprint) — without a cap, 'load' rows grow unboundedly.
export const DEFAULT_LOAD_ROWS_KEEP = 3;

// Router mode (P1e): the count-based co-resident cap (`--models-max`; the arbiter works
// WITHIN it) and the native idle-unload TTL (`--sleep-idle-seconds`; 0 = never sleep).
// models_max=2 keeps a chat model + a tiny embed co-resident on a small card; sleep_idle=900 s
// keeps the active model warm through normal writing pauses.
export const DEFAULT_MODELS_MAX = 2;
export const DEFAULT_SLEEP_IDLE_SECONDS = 900;

// A download's own connections and retries are the downloader's (download.js), not settings
// (decided 2026-10-18: "a user should never need to touch download settings it should just work
// at the best possible speed"; the "Faster downloads" settings were removed).
// CONCURRENT model downloads (2026-07-20): how many model downloads may run in parallel.
// Read LIVE at admission so the knob is tunable without a restart.
export const DEFAULT_DOWNLOAD_MAX_CONCURRENT = 4;
// Its upper bound (#10, 2026-07-17): >10 concurrent whole-model downloads thrash the disk + CDN.
// The write path (engine-config PUT) and the lifecycle admission gate both clamp to it — ONE
// source, so a raw DB poke can't route around it either.
export const MAX_DOWNLOAD_CONCURRENT = 10;

// Prebuilt llama-server distributions, selected by (platform, gpu). We never install a CUDA
// toolkit — we only DETECT the system and pick the matching prebuilt build; the Windows CUDA
// builds additionally need the separate cudart runtime DLLs (`runtime_url`), unpacked
// alongside the exe. Windows assets are `.zip`, macOS/Linux `.tar.gz`. This seeds fresh
// installs + "reset to defaults"; the server never composes a URL, it fetches whatever
// concrete URL is stored.
//
// Every filename was verified against the release's own asset list (GET
// api.github.com/repos/ggml-org/llama.cpp/releases/tags/<build>) — do NOT hand-edit a name
// from memory. UPSTREAM RENAMES THESE: substituting the tag into a stored name is NOT enough
// (Windows AMD went hip-radeon → rocm-7.14 → rocm-10.0, Linux AMD rocm-7.2 → absent for ~180
// builds → rocm-10.0, Windows CUDA 13 → 13.4 after b10964), so the UPDATE flow resolves names
// from the target release's own asset list (`binary.resolveReleaseAssets`); these literals
// only seed a FRESH database. The Windows cudart-* companion is tied to its asset's CUDA
// version; on Linux, from b10969, it is build-tagged.
//
// The rows keep Python's snake_case keys: they are seed DATA mapped onto `runner_binary`
// columns (seed + the reset-to-defaults path read `b.asset_url`, `b.server_exe`, …).
const REL = `https://github.com/ggml-org/llama.cpp/releases/download/${DEFAULT_PINNED_BUILD}`;
export const DEFAULT_BINARIES = [
  {
    platform: "windows",
    gpu: "cuda12",
    source: "github",
    asset_url: `${REL}/llama-${DEFAULT_PINNED_BUILD}-bin-win-cuda-12.4-x64.zip`,
    runtime_url: `${REL}/cudart-llama-bin-win-cuda-12.4-x64.zip`,
    server_exe: "llama-server.exe",
  },
  {
    platform: "windows",
    gpu: "cuda13",
    source: "github",
    asset_url: `${REL}/llama-${DEFAULT_PINNED_BUILD}-bin-win-cuda-13.4-x64.zip`,
    runtime_url: `${REL}/cudart-llama-bin-win-cuda-13.4-x64.zip`,
    server_exe: "llama-server.exe",
  },
  // Windows AMD has been renamed TWICE upstream: win-hip-radeon (≤ b10398) → win-rocm-7.14 →
  // win-rocm-10.0 (b10767, #27803; this pin).
  {
    platform: "windows",
    gpu: "rocm",
    source: "github",
    asset_url: `${REL}/llama-${DEFAULT_PINNED_BUILD}-bin-win-rocm-10.0-x64.zip`,
    server_exe: "llama-server.exe",
  },
  {
    platform: "windows",
    gpu: "vulkan",
    source: "github",
    asset_url: `${REL}/llama-${DEFAULT_PINNED_BUILD}-bin-win-vulkan-x64.zip`,
    server_exe: "llama-server.exe",
  },
  // The cpu rows are RETIRED (user, 2026-07-07: "deleet" — a CPU-only machine can't run
  // local LLMs at usable speed, so no cpu build is offered or ever downloaded). A box with no
  // usable GPU resolves to NO engine (selectBinary → null); the seeder prunes previously
  // seeded built-in cpu rows from existing DBs.
  {
    platform: "macos",
    gpu: "metal",
    source: "github",
    asset_url: `${REL}/llama-${DEFAULT_PINNED_BUILD}-bin-macos-arm64.tar.gz`,
    server_exe: "llama-server",
  },
  // Linux AMD: rocm-7.2 (≤ b10397) → NO asset for b10398-b10581 → rocm-7.14 → rocm-10.0
  // (b10767; this pin).
  {
    platform: "linux",
    gpu: "rocm",
    source: "github",
    asset_url: `${REL}/llama-${DEFAULT_PINNED_BUILD}-bin-ubuntu-rocm-10.0-x64.tar.gz`,
    server_exe: "llama-server",
  },
  {
    platform: "linux",
    gpu: "vulkan",
    source: "github",
    asset_url: `${REL}/llama-${DEFAULT_PINNED_BUILD}-bin-ubuntu-vulkan-x64.tar.gz`,
    server_exe: "llama-server",
  },
  // Linux CUDA: docker-only upstream, and NO pin-faithful image exists — per-build image
  // tags were discontinued, leaving rolling tags that track master. The row stays as the
  // FUTURE seam (never auto-selected — see binary.selectBinary); until a digest is captured
  // at a pin bump, Linux+NVIDIA selects the pinned vulkan archive.
  {
    platform: "linux",
    gpu: "cuda12",
    source: "docker",
    image: "ghcr.io/ggml-org/llama.cpp:server-cuda",
    server_exe: "llama-server",
  },
];

// ─── stable-diffusion.cpp — the kit's image runtime (docs/plans/2026-10-24-engines-the-llama-way.md, K2) ───
// Its builds are seed DATA like llama.cpp's: rows in `runtime_binary` (runtime "sdcpp"), the pin in
// `runner_setting` `pinned_build:sdcpp`, seeded insert-if-missing for an app that turns the runtime on
// (installLlm({ runtimes: ["sdcpp"] })) and editable there. Pinned at master-1004-a85db96 — the first build with
// mid-render Cancel, /sdcpp/v1/models/status and /unload (measured on this PC, RESEARCH "stable-diffusion.cpp's
// server, measured on this PC"). Each row is a release asset with the size and SHA-256 GitHub's API reports
// (GET …/releases/tags/<tag>, 2026-10-24), and what it unpacks to (`asset_unpacked_bytes`, `runtime_unpacked_bytes` —
// the sum of each zip's entries, read from its central directory by range requests, 2026-10-27: the room an install
// needs beside its zips, RESEARCH "stable-diffusion.cpp's builds unpacked"). `requires`: what a build needs from the system, said before the
// download — on Windows the Visual C++ runtime's DLLs its binaries import (Microsoft's redistributable, never
// shipped), the macOS build's minos 26.0, the Linux builds' GLIBC 2.38 (built on Ubuntu 24.04) — measured on
// master-973's binaries by house-paint (the same release workflow). No Linux CUDA build is published (NVIDIA
// on Linux takes Vulkan); the macOS zip is one universal build with Metal.
export const DEFAULT_SDCPP_BUILD = "master-1004-a85db96";
const SD_REL = `https://github.com/leejet/stable-diffusion.cpp/releases/download/${DEFAULT_SDCPP_BUILD}`;
const SD_VC_DLLS = Object.freeze(["MSVCP140.dll", "VCRUNTIME140.dll", "VCRUNTIME140_1.dll", "VCOMP140.DLL"]);
const sdRow = (platform, gpu, asset, bytes, unpacked, sha256, extra = {}) => ({
  platform,
  gpu,
  source: "github",
  asset_url: `${SD_REL}/${asset}`,
  asset_bytes: bytes,
  asset_unpacked_bytes: unpacked,
  sha256,
  server_exe: platform === "windows" ? "sd-server.exe" : "sd-server",
  ...extra,
});
export const DEFAULT_SDCPP_BINARIES = [
  sdRow("windows", "cuda12", "sd-master-a85db96-bin-win-cuda12-x64.zip", 343489328, 388709969, "7528f645a5ba6a62200b536747e63857c226e929405d38519d4161d8ef43660d", {
    runtime_url: `${SD_REL}/cudart-sd-bin-win-cu12-x64.zip`,
    runtime_bytes: 563452046,
    runtime_unpacked_bytes: 788957696,
    runtime_sha256: "fe20366827d357c00797eebb58244dddab7fd9a348d70090c3871004c320f38d",
    requires: { dlls: SD_VC_DLLS },
  }),
  sdRow("windows", "rocm", "sd-master-a85db96-bin-win-rocm-10.1.0-x64.zip", 264507284, 1220654028, "14425ad2e1a3a46b19bc170bd82d411c832610b88b31b105f8b709e97be98db0", { requires: { dlls: SD_VC_DLLS } }),
  sdRow("windows", "vulkan", "sd-master-a85db96-bin-win-vulkan-x64.zip", 29697425, 88658513, "ba06119be4041fb69a85e490c2b7c1b68ead48de84cb775b7a53dc7746ea2762", { requires: { dlls: SD_VC_DLLS } }),
  sdRow("windows", "cpu", "sd-master-a85db96-bin-win-cpu-x64.zip", 18033865, 48624721, "6bd679cbb9509b8de6df7ec3ff16fc3658d9931eaefb9548567e938b5fa58d70", { requires: { dlls: SD_VC_DLLS } }),
  sdRow("macos", "metal", "sd-master-a85db96-bin-Darwin-macOS-26.6.2-arm64.zip", 37444741, 101637472, "a149b98f1f90bc334b9d84d230aa0f1dfdee31ddbbf6b7957a69afe4c30af180", { requires: { macos: "26.0" } }),
  sdRow("linux", "rocm", "sd-master-a85db96-bin-Linux-Ubuntu-24.04-x86_64-rocm-10.1.0.zip", 296363307, 1453342350, "f8b39610d5b9b93628812739735ad9c91f9c643187cef6c295e60ccfb14a6d71", { requires: { glibc: "2.38" } }),
  sdRow("linux", "vulkan", "sd-master-a85db96-bin-Linux-Ubuntu-24.04-x86_64-vulkan.zip", 37564039, 103381544, "6cb41cd315cccf09820c31cbe9c7738c285b429b34b964bae3fdee70c8ea8703", { requires: { glibc: "2.38" } }),
  sdRow("linux", "cpu", "sd-master-a85db96-bin-Linux-Ubuntu-24.04-x86_64.zip", 27239917, 70427608, "eed7d3544bd05ac00e5c86863e7919b8a08aa7337168adab0fdf2878500e1e23", { requires: { glibc: "2.38" } }),
];

/** A DEFAULT_BINARIES row (snake data keys) as a BinaryAsset value (camelCase fields). */
export function binaryAsset(b) {
  const out = { platform: b.platform, gpu: b.gpu };
  if ("source" in b) out.source = b.source;
  if ("asset_url" in b) out.assetUrl = b.asset_url;
  if ("runtime_url" in b) out.runtimeUrl = b.runtime_url;
  if ("image" in b) out.image = b.image;
  if ("sha256" in b) out.sha256 = b.sha256;
  if ("runtime_sha256" in b) out.runtimeSha256 = b.runtime_sha256;
  if ("server_exe" in b) out.serverExe = b.server_exe;
  return out;
}

/** The standalone fallback RunnerConfig, built from the constants above (no host DB
 * wired). Hosts inject a DB-backed `configFn` instead. */
export function defaultConfig() {
  return model(RunnerConfig, {
    llamacpp: {
      pinnedBuild: DEFAULT_PINNED_BUILD,
      binaries: DEFAULT_BINARIES.map(binaryAsset),
    },
    safetyMarginMb: DEFAULT_SAFETY_MARGIN_MB,
    modelsMax: DEFAULT_MODELS_MAX,
    sleepIdleSeconds: DEFAULT_SLEEP_IDLE_SECONDS,
    ctxCapTokens: DEFAULT_CTX_CAP_TOKENS,
  });
}
