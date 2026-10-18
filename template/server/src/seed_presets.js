// SPDX-License-Identifier: MIT
// The AI stack's seed DATA for this app (app-structure §8) — handed to installLlm, written by the
// kit's seedLlm insert-if-missing, so an edit made in AI Settings is never overwritten.
//
//   - Engine presets: each owns provider + model + every tunable (temperature, top_p, samplers,
//     think). Their model ships EMPTY — Quick Setup or the user picks it (JustWrite's ruling,
//     2026-07-06: "no model is automatically set as default … this is all quick setup or
//     manual").
//   - Feature presets: each action → the preset it runs on (the one source of what it runs).
//   - The model catalog: the app's whole catalog (decision ④, 2026-08-05 — the kit's shared
//     catalog is empty); here JustWrite's three general chat rows, facts and all.
//   - Class tunes: measured launch settings per hardware class for those rows, and what each was
//     measured on (the identity map), so a tune applies whatever id an app gives the same file.
//
// Seed rows keep the kit's snake_case keys (its seeders read them).

export const DEFAULT_ENGINE_PRESETS = [
  // The catch-all: any action without a preset of its own runs here (DEFAULT_PRESET_ID).
  {
    id: "p_general",
    name: "General",
    provider_id: "local-llamacpp",
    model: "",
    temperature: 0.7,
    top_p: 0.95,
    position: 0,
    think: false,
    samplers: { min_p: "0.05" },
  },
  // Short, factual answers — a note's title. Low temperature, no thinking: it's latency-bound.
  {
    id: "p_short",
    name: "Short answers",
    provider_id: "local-llamacpp",
    model: "",
    temperature: 0.3,
    top_p: 0.9,
    position: 1,
    think: false,
    samplers: { min_p: "0.05" },
  },
];

export const DEFAULT_FEATURE_PRESETS = {
  "notes.suggestTitle": "p_short",
};

export const DEFAULT_PRESET_ID = "p_general";

// ── The model catalog — JustWrite's general chat rows (justwrite-app
// server/src/seed_presets.js: DEFAULT_MODEL_CATALOG_EXTRA's Gemma 4 26B-A4B and
// JW_CURATED_CATALOG's Gemma 4 12B and E4B, as of 2026-10-17). The facts are JustWrite's audited
// ones, unchanged: repos, quants and licences verified through the Hugging Face API (2026-07-06,
// Apache-2.0 on Google's own repos and the repackager's), the size/architecture fields read from
// each pinned quant's GGUF header (2026-07-07/08, the path Read-from-link uses), samplers the
// file's own recommended set. Changed here: `position` (this catalog's own order) and the
// user-facing `notes` (JustWrite's spoke of writing). Re-run the seed-facts audit whenever a row
// changes. E4B's drafter is recorded but OFF (`mtp: false`) on purpose — JustWrite's stop sign:
// the only head found is a third-party one never loaded against these weights.
export const MODEL_CATALOG = [
  {
    id: "gemma-4-26b-a4b-qat",
    name: "Gemma 4 26B-A4B (QAT)",
    hf_repo: "unsloth/gemma-4-26B-A4B-it-qat-GGUF",
    quant: "UD-Q4_K_XL",
    total_params: "26B",
    active_params: "4B",
    mtp: true,
    output_bytes: 415247360,
    layers_nonexp_bytes: 971592640,
    exps_bytes: 12846382080,
    sliding_window: 1024,
    kv_global_bytes_per_token: 10240.0,
    kv_windowed_bytes_per_token: 102400.0,
    expert_byte_share: 0.9388753056,
    expert_used_count: 8,
    embedding_length: 2816,
    head_count: 16,
    n_kv_heads: 16,
    block_count: 30,
    size_bytes: 14249047104,
    size_label: "128x2.6B",
    est_vram_mb: 17032,
    type: "moe",
    mtp_draft_file: "MTP/mtp-gemma-4-26B-A4B-it-Q4_0.gguf",
    mtp_draft_quant: "Q4_0",
    samplers: { top_k: "64", top_p: "0.95", temperature: "1" },
    trained_ctx: 262144,
    tier: "low-vram-moe",
    license: "Apache-2.0",
    quality_rank: 5,
    position: 0,
    architecture: "gemma4",
    experts: 128,
    description: "26B mixture-of-experts model · 256k context · MTP draft for faster generation · UD-Q4_K_XL (QAT)",
    notes:
      "The recommended all-rounder — one setup covers every AI feature. " +
      "Runs on 8 GB graphics cards and up; thinking is managed per task automatically.",
  },
  {
    id: "gemma-4-12b-qat",
    name: "Gemma 4 12B (QAT)",
    hf_repo: "unsloth/gemma-4-12B-it-qat-GGUF",
    quant: "UD-Q4_K_XL",
    total_params: "12B",
    mtp: true,
    output_bytes: 566246400,
    layers_nonexp_bytes: 6134285824,
    sliding_window: 1024,
    kv_global_bytes_per_token: 8192.0,
    kv_windowed_bytes_per_token: 163840.0,
    embedding_length: 3840,
    head_count: 16,
    n_kv_heads: 16,
    block_count: 48,
    est_vram_mb: 10403,
    mtp_draft_file: "MTP/mtp-gemma-4-12B-it-Q4_0.gguf",
    mtp_draft_quant: "Q4_0",
    trained_ctx: 262144,
    samplers: { top_k: "64", top_p: "0.95", temperature: "1" },
    tier: "mid",
    license: "Apache-2.0",
    position: 1,
    quality_rank: 22,
    architecture: "gemma4",
    experts: 0,
    size_label: "12B",
    size_bytes: 6716356800,
    description: "12B model · 256k context · MTP draft for faster generation · UD-Q4_K_XL (QAT)",
    notes: "The lighter, faster pick — runs fully on a 10-12 GB graphics card (tight on 8 GB) and needs little system RAM.",
  },
  {
    id: "gemma-4-e4b-qat",
    name: "Gemma 4 E4B (QAT)",
    hf_repo: "unsloth/gemma-4-E4B-it-qat-GGUF",
    quant: "UD-Q4_K_XL",
    total_params: "E4B",
    mtp: false,
    output_bytes: 377497600,
    layers_nonexp_bytes: 2221443392,
    sliding_window: 512,
    kv_global_bytes_per_token: 14336.0,
    kv_windowed_bytes_per_token: 35840.0,
    embedding_length: 2560,
    head_count: 8,
    n_kv_heads: 2,
    block_count: 42,
    mtp_draft_quant: "Q4_K_S",
    mtp_draft_file: "gemma-4-E4B-it-assistant.Q4_K_S.gguf",
    mtp_draft_repo: "AtomicChat/gemma-4-E4B-it-assistant-GGUF",
    est_vram_mb: 5211,
    size_bytes: 4215695776,
    size_label: "7.5B",
    trained_ctx: 131072,
    samplers: { top_k: "64", top_p: "0.95", temperature: "1" },
    tier: "mid",
    license: "Apache-2.0",
    position: 2,
    quality_rank: 23,
    architecture: "gemma4",
    experts: 0,
    description: "E4B model · 128k context · UD-Q4_K_XL (QAT)",
    notes:
      "Made for laptops with integrated graphics, where the GPU shares system memory. Small and quick, and holds its quality well for the size.",
  },
];

// ── Class tunes — JustWrite's JW_CLASS_TUNES rows for these three models (the 8 GB/32 GB and
// 32 GB integrated-GPU rows measured on the author's boxes, the 16 GB integrated E4B row on that
// laptop's own run, the rest the dGPU band recommendations — JustWrite's file says which is
// which and why). Copied as they are.
const MIRROR = { ctx_len: "32768", batch_size: "512", ubatch_size: "512", reasoning_budget: "1024" };

export const CLASS_TUNES = [
  {
    model_id: "gemma-4-26b-a4b-qat",
    class_key: "dgpu-vram8|ram32",
    switches: { n_gpu_layers: "99", n_cpu_moe: "21", ...MIRROR, threads: "8" },
  },
  {
    model_id: "gemma-4-26b-a4b-qat",
    class_key: "igpu-mem32",
    switches: { n_gpu_layers: "99", n_cpu_moe: "0", ...MIRROR, flash_attn: "off" },
  },
  { model_id: "gemma-4-26b-a4b-qat", class_key: "dgpu-vram16|ram32", switches: { ...MIRROR } },
  { model_id: "gemma-4-26b-a4b-qat", class_key: "dgpu-vram16|ram64", switches: { ...MIRROR } },
  { model_id: "gemma-4-26b-a4b-qat", class_key: "dgpu-vram24|ram32", switches: { n_gpu_layers: "99", n_cpu_moe: "0", ...MIRROR } },
  { model_id: "gemma-4-26b-a4b-qat", class_key: "dgpu-vram24|ram64", switches: { n_gpu_layers: "99", n_cpu_moe: "0", ...MIRROR } },
  { model_id: "gemma-4-e4b-qat", class_key: "igpu-mem16", switches: { n_gpu_layers: "99", ...MIRROR, flash_attn: "off" } },
  { model_id: "gemma-4-12b-qat", class_key: "dgpu-vram8|ram16", switches: { n_gpu_layers: "99", ...MIRROR } },
  { model_id: "gemma-4-12b-qat", class_key: "dgpu-vram12|ram16", switches: { n_gpu_layers: "99", ...MIRROR } },
  { model_id: "gemma-4-12b-qat", class_key: "dgpu-vram12|ram32", switches: { n_gpu_layers: "99", ...MIRROR } },
  { model_id: "gemma-4-12b-qat", class_key: "dgpu-vram12|ram64", switches: { n_gpu_layers: "99", ...MIRROR } },
  { model_id: "gemma-4-12b-qat", class_key: "dgpu-vram16|ram16", switches: { n_gpu_layers: "99", ...MIRROR } },
];

// What the tunes were measured on — the file, not the id an app gives it.
export const CLASS_TUNE_IDENTITY = {
  "gemma-4-26b-a4b-qat": { hf_repo: "unsloth/gemma-4-26B-A4B-it-qat-GGUF", quant: "UD-Q4_K_XL" },
  "gemma-4-12b-qat": { hf_repo: "unsloth/gemma-4-12B-it-qat-GGUF", quant: "UD-Q4_K_XL" },
  "gemma-4-e4b-qat": { hf_repo: "unsloth/gemma-4-E4B-it-qat-GGUF", quant: "UD-Q4_K_XL" },
};
