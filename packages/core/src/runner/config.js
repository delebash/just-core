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
// b11239 → b11960 (2026-10-29; the user: every pinned engine at its latest for the family release). b11960 is the build
// GitHub's latest release, the stable v0.8.0, names (its nightly-tag.txt). Checked before the move (the watch doc's
// review log, 2026-10-29): all 721 commit titles b11240–b11960 read; every flag, models.ini key, request field, router
// route and placement rule the kit uses is unchanged; Step 0b passes (the kit's predicted model MiB within 1 MiB of
// llama-fit-params on two models, five configs); and on the card through the router, JustWrite's two Gemma-4 + MTP rows
// load, answer their JSON contract under the draft (upstream #30419 doesn't fire), survive a 10-request shared-prefix
// run (#31077) and unload in 1.1 s (#30975). Drafted output ≠ greedy, as on every pin since the 2026-09-28 re-measure.
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
// with the build ON DISK (`update_check`) and also offers this tested pin; stable (v0.8.0) names b11960, this pin.
// (history: runner/config.py)
export const DEFAULT_PINNED_BUILD = "b11960";

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
  // speech and transcription (audio.cpp, round E): seconds of audio per second of work, higher is faster — fine at 2×,
  // JustVoice's decided "fast enough on the CPU" (its cpu_min_realtime); slow at 1×, real time (below it a line takes
  // longer to make than to hear); fast at 5×, the kit's start value (the user's word pending, 2026-10-29)
  tts: Object.freeze({ fast: 5, fine: 2, slow: 1, lowerIsFaster: false, unit: "x realtime" }),
  stt: Object.freeze({ fast: 5, fine: 2, slow: 1, lowerIsFaster: false, unit: "x realtime" }),
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
// columns (seed + the reset-to-defaults path read `b.asset_url`, `b.server_exe`, …). `sha256` / `runtime_sha256`: GitHub's
// digest of each archive (GET …/releases/tags/b11960, 2026-10-29) — a download is checked against it (binary.js). The two
// Windows cudart zips are byte-identical to b11239's.
const REL = `https://github.com/ggml-org/llama.cpp/releases/download/${DEFAULT_PINNED_BUILD}`;
export const DEFAULT_BINARIES = [
  {
    platform: "windows",
    gpu: "cuda12",
    source: "github",
    asset_url: `${REL}/llama-${DEFAULT_PINNED_BUILD}-bin-win-cuda-12.4-x64.zip`,
    sha256: "8d9d819261de10cc2f03921b8b79c779c5c458e21edb60c170ee30a7d462d684",
    runtime_url: `${REL}/cudart-llama-bin-win-cuda-12.4-x64.zip`,
    runtime_sha256: "8c79a9b226de4b3cacfd1f83d24f962d0773be79f1e7b75c6af4ded7e32ae1d6",
    server_exe: "llama-server.exe",
  },
  {
    platform: "windows",
    gpu: "cuda13",
    source: "github",
    asset_url: `${REL}/llama-${DEFAULT_PINNED_BUILD}-bin-win-cuda-13.4-x64.zip`,
    sha256: "31c75ea62b80f0816c855ea783ef68757bc2d48028edaa57d904e4982bddea4a",
    runtime_url: `${REL}/cudart-llama-bin-win-cuda-13.4-x64.zip`,
    runtime_sha256: "738f8c251ac22b70c3ae6f83a10cf222725df0395246a2cf58f32bdb85fbe668",
    server_exe: "llama-server.exe",
  },
  // Windows AMD has been renamed TWICE upstream: win-hip-radeon (≤ b10398) → win-rocm-7.14 →
  // win-rocm-10.0 (b10767, #27803; this pin).
  {
    platform: "windows",
    gpu: "rocm",
    source: "github",
    asset_url: `${REL}/llama-${DEFAULT_PINNED_BUILD}-bin-win-rocm-10.0-x64.zip`,
    sha256: "7036a6008ea4b83229f5db5b0624f5c880a0c49c57aa38d904d0419ce74783b4",
    server_exe: "llama-server.exe",
  },
  {
    platform: "windows",
    gpu: "vulkan",
    source: "github",
    asset_url: `${REL}/llama-${DEFAULT_PINNED_BUILD}-bin-win-vulkan-x64.zip`,
    sha256: "bac6914b5e83523eb008c6789eaa12669f93fbc196c3b9e8237b6672323b33e9",
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
    sha256: "58e5a5e1d7c2bf66cedd9c29e0323f3e570660a70a1e2156d32eed08f4cc1e3c",
    server_exe: "llama-server",
  },
  // Linux AMD: rocm-7.2 (≤ b10397) → NO asset for b10398-b10581 → rocm-7.14 → rocm-10.0
  // (b10767; this pin).
  {
    platform: "linux",
    gpu: "rocm",
    source: "github",
    asset_url: `${REL}/llama-${DEFAULT_PINNED_BUILD}-bin-ubuntu-rocm-10.0-x64.tar.gz`,
    sha256: "63546b0175840c75b261bcb55e75cce49852c6d632eee352edbfa62c3bf120e3",
    server_exe: "llama-server",
  },
  {
    platform: "linux",
    gpu: "vulkan",
    source: "github",
    asset_url: `${REL}/llama-${DEFAULT_PINNED_BUILD}-bin-ubuntu-vulkan-x64.tar.gz`,
    sha256: "164199e978304bb32a8a6c24b8efa015528ddf286821596eab676c90b375feac",
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
// (installLlm({ runtimes: ["sdcpp"] })) and editable there. Pinned at master-1024-77b72a2, its latest release (the
// family release moves every pinned engine to its latest — the user, 2026-10-29); master-1004-a85db96 was the first build
// with mid-render Cancel, /sdcpp/v1/models/status and /unload (measured on this PC, RESEARCH "stable-diffusion.cpp's
// server, measured on this PC"). Each row is a release asset with the size and SHA-256 GitHub's API reports
// (GET …/releases/tags/<tag>, 2026-10-29), and what it unpacks to (`asset_unpacked_bytes`, `runtime_unpacked_bytes` —
// the sum of each zip's entries, read from its central directory by range requests, 2026-10-29: the room an install
// needs beside its zips, RESEARCH "stable-diffusion.cpp's builds unpacked"). The cudart zip is byte-identical to
// master-1004's (the same digest). `requires`: what a build needs from the system, said before the
// download — on Windows the Visual C++ runtime's DLLs its binaries import (Microsoft's redistributable, never
// shipped), the macOS build's minos 26.0, the Linux builds' GLIBC 2.38 (built on Ubuntu 24.04) — measured on
// master-973's binaries by house-paint (the same release workflow; master-1024's names show the same macOS 26.6.2 and
// Ubuntu 24.04 bases — carried over, not re-measured). No Linux CUDA build is published (NVIDIA
// on Linux takes Vulkan); the macOS zip is one universal build with Metal.
export const DEFAULT_SDCPP_BUILD = "master-1024-77b72a2";
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
  sdRow("windows", "cuda12", "sd-master-77b72a2-bin-win-cuda12-x64.zip", 350857718, 396351095, "e60e538b86ecd47d8e141297fa45734125fdf97925d8ed3b49acb1397b5ee90b", {
    runtime_url: `${SD_REL}/cudart-sd-bin-win-cu12-x64.zip`,
    runtime_bytes: 563452046,
    runtime_unpacked_bytes: 788957696,
    runtime_sha256: "fe20366827d357c00797eebb58244dddab7fd9a348d70090c3871004c320f38d",
    requires: { dlls: SD_VC_DLLS },
  }),
  sdRow("windows", "rocm", "sd-master-77b72a2-bin-win-rocm-10.1.0-x64.zip", 265967330, 1226862028, "edba722c47b634de5a8897bb631e320c7d6635686096a64cd605a758f7221542", { requires: { dlls: SD_VC_DLLS } }),
  sdRow("windows", "vulkan", "sd-master-77b72a2-bin-win-vulkan-x64.zip", 29747358, 88799313, "854cd219814e90ffd0a804a19bda60cdc04a7f89a6c52aa7e3b959227b495072", { requires: { dlls: SD_VC_DLLS } }),
  sdRow("windows", "cpu", "sd-master-77b72a2-bin-win-cpu-x64.zip", 18083813, 48765521, "f56a021629bfbff2a4725af97147ae84090eb075489a5ce7883daaaf87d4169d", { requires: { dlls: SD_VC_DLLS } }),
  sdRow("macos", "metal", "sd-master-77b72a2-bin-Darwin-macOS-26.6.2-arm64.zip", 37585331, 102161840, "2bdbadad6592350158b08d43b2c52cde3146ab52bbe7bcd1cbcc0d3f23856512", { requires: { macos: "26.0" } }),
  sdRow("linux", "rocm", "sd-master-77b72a2-bin-Linux-Ubuntu-24.04-x86_64-rocm-10.1.0.zip", 298318102, 1461631814, "ac0d35934165d9fb11973bc81c35b9c262236d9281d31c80f9fd863358e0db0b", { requires: { glibc: "2.38" } }),
  sdRow("linux", "vulkan", "sd-master-77b72a2-bin-Linux-Ubuntu-24.04-x86_64-vulkan.zip", 37649874, 103654664, "3833cb636e1ecef8a5445c8547e13d1771583158880fb20a70a602fdc4da0f2e", { requires: { glibc: "2.38" } }),
  sdRow("linux", "cpu", "sd-master-77b72a2-bin-Linux-Ubuntu-24.04-x86_64.zip", 27325752, 70700728, "d44a17e278412bd45c1847a91d30a69146b9bb9144c91a61fa0e357d7e2466af", { requires: { glibc: "2.38" } }),
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

// ─── audio.cpp — the kit's speech runtime (round E, 2026-10-29: JustVoice's engines/audiocpp/release.js moved in) ───
// The user's fork (github.com/delebash/audio.cpp — the user's word, 2026-10-29: "Yes, pin the fork"): upstream audio.cpp
// plus the DSP program, voice packs, Turbo cloning and models registered at run time (`model_management`, from
// v0.9.0-jv.4). Rows as seed DATA like sd.cpp's: each archive's size and SHA-256 as GitHub's API reports them
// (GET …/releases/tags/v0.9.2-jv.6, 2026-10-29), what a zip unpacks to (its central directory by range requests — a
// tar.gz row says 0: an install asks 5× its archive), and the Windows CUDA builds' runtime DLLs as their companion zip.
// CUDA 13.3 is the Blackwell build (the kit's chip rule picks it at compute capability ≥ 10). Linux NVIDIA takes Vulkan,
// as llama.cpp's rows do. The CPU builds are the PORTABLE ones: the plain build assumes this CPU's newest instructions
// and exits at start on an older one (audio.cpp issue #352). macOS: Apple silicon only, the family's (the fork also
// publishes x64). `requires` not measured for these builds.
export const DEFAULT_AUDIOCPP_BUILD = "v0.9.2-jv.6";
const AC_REL = `https://github.com/delebash/audio.cpp/releases/download/${DEFAULT_AUDIOCPP_BUILD}`;
const acRow = (platform, gpu, asset, bytes, unpacked, sha256, extra = {}) => ({
  platform,
  gpu,
  source: "github",
  asset_url: `${AC_REL}/${asset}`,
  asset_bytes: bytes,
  asset_unpacked_bytes: unpacked,
  sha256,
  server_exe: platform === "windows" ? "audiocpp_server.exe" : "audiocpp_server",
  ...extra,
});
const acCudart = (asset, bytes, unpacked, sha256) => ({ runtime_url: `${AC_REL}/${asset}`, runtime_bytes: bytes, runtime_unpacked_bytes: unpacked, runtime_sha256: sha256 });
export const DEFAULT_AUDIOCPP_BINARIES = [
  acRow("windows", "cuda12", "audio-v0.9.2-jv.6-bin-windows-x64-cuda12.4.zip", 467437957, 1222597316, "e7061704063e2b583714670ddd4479126c23040a1bfed1ac4720d397e0d7a94a",
    acCudart("audio-v0.9.2-jv.6-cudart-windows-x64-cuda12.4.zip", 607273675, 865923072, "5172d93ab24a378ea9b4877c5a0055836c81d3bf031d46d0e2722d1a1ad313cc")),
  acRow("windows", "cuda13", "audio-v0.9.2-jv.6-bin-windows-x64-cuda13.3.zip", 279082215, 341290692, "caeff2e01879ad619f1275ac3848ed1a527902e4929e502c2bec5e08780f8c9b",
    acCudart("audio-v0.9.2-jv.6-cudart-windows-x64-cuda13.3.zip", 575457454, 768815552, "8aa9b806a800ab2491ace9aea0910201206e592d17ab7ed445474a6c2e7ab955")),
  acRow("windows", "vulkan", "audio-v0.9.2-jv.6-bin-windows-x64-vulkan.zip", 66608834, 191689540, "04ef95c99dc33c02feb4516c6d03b4c45fdf658675dfc53881ba646c27a76660"),
  acRow("windows", "cpu", "audio-v0.9.2-jv.6-bin-windows-x64-cpu-portable.zip", 32029202, 76319044, "94847349a42ad052250b29c7cd8b5ede4918c1092207671d47235112d9bd856e"),
  acRow("linux", "vulkan", "audio-v0.9.2-jv.6-bin-ubuntu-x64-vulkan.tar.gz", 85268472, 0, "9979081d11214c84ba4302351c7413db45d453f0bb8dc76734c1a0261b3eed93"),
  acRow("linux", "cpu", "audio-v0.9.2-jv.6-bin-ubuntu-x64-cpu-portable.tar.gz", 63696990, 0, "80d7c998cc7911c2e988da44cb16110f505d6b6e5d5f93968f3756ab27cd9ced"),
  acRow("macos", "metal", "audio-v0.9.2-jv.6-bin-macos-arm64-metal.tar.gz", 35780548, 0, "b97e66f85ecfce7aa597fcbabced9eeba4907e049f520da46826d71d3b94c1ef"),
];
// The first build that has each fork feature (JustVoice's release.js FEATURES): an older build on disk refuses the feature
// by name instead of failing inside. Builds in order, oldest first.
export const AUDIOCPP_BUILDS_IN_ORDER = Object.freeze(["v0.9.0", "v0.9.0-jv.1", "v0.9.0-jv.4", "v0.9.0-jv.5", "v0.9.2-jv.6"]);
export const AUDIOCPP_FEATURES = Object.freeze({
  voxcpm2_transcript: "v0.9.0-jv.1",
  voice_pack: "v0.9.0-jv.4",
  inline_ipa: "v0.9.0-jv.4",
  turbo_clone: "v0.9.0-jv.4",
  chatterbox_he_ru_zh: "v0.9.0-jv.4",
  japanese: "v0.9.0-jv.4",
  model_management: "v0.9.0-jv.4",
});
// The speech runtime's settings (JustVoice's SpeechRuntimeSettings, models.js): seeded runner_setting rows
// `<name>:audiocpp`, editable on its tab — the family's rule for every value a user might change.
export const DEFAULT_AUDIOCPP_SETTINGS = Object.freeze({
  backend: "auto", // "auto" = this machine's choice; cuda | vulkan | cpu | metal pins that build
  gpu: 0, // which card (audio.cpp's `device`)
  cpu_threads: 0, // the CPU process's threads; 0 = this machine's physical cores
  cpu_min_realtime: 2.0, // "fast enough on the CPU" for Auto: seconds of audio per second of work
  spill_mb: 256, // Windows: shared-memory growth (MB) past which a card load counts as spilled
  runaway_s_per_char: 0.5, // a runaway line: longer than this per character …
  runaway_min_s: 30.0, // … and than this — the process that ran it no longer sets the model's price
  card_margin_mb: 512, // the headroom a speech model is held to on the card
  gpu_threads: 4, // the card process's CPU threads (text, sampling)
  start_timeout_s: 60.0, // how long a process may take to come up
  request_timeout_s: 900.0, // how long one request may run — a line, a model load
});
