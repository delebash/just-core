// SPDX-License-Identifier: MIT
// Shared LLM storage — the single home for every LLM table (the port of
// llm_runner/llm/db.py). The tables are the DDL Python's create_all writes, captured in
// db_schema.js; the host owns the database handle (platform/sql.js) and hands it to
// `configureStorage`, and `installLlm` calls `createAll` + `configureStorage` for it.
// Every store reaches the database through `session()`.

import { TABLES } from "./db_schema.js";

export { TABLES };

// Additive column migrations: an existing database gains a column added after it was
// made, without a reset. `[table, column, "SQL type + default"]`, applied when missing.
// Additive only — kept identical to db.py's _ADDED_COLUMNS.
export const ADDED_COLUMNS = [
  ["model_catalog", "mtp_builtin", "BOOLEAN NOT NULL DEFAULT 0"],
  ["model_catalog", "est_vram_mb", "INTEGER"],
  ["model_catalog", "block_count", "INTEGER NOT NULL DEFAULT 0"],
  ["model_catalog", "n_kv_heads", "INTEGER NOT NULL DEFAULT 0"],
  ["model_catalog", "head_count", "INTEGER NOT NULL DEFAULT 0"],
  ["model_catalog", "embedding_length", "INTEGER NOT NULL DEFAULT 0"],
  ["model_catalog", "expert_used_count", "INTEGER NOT NULL DEFAULT 0"],
  ["model_catalog", "expert_byte_share", "REAL NOT NULL DEFAULT 0"],
  ["model_catalog", "kv_windowed_bytes_per_token", "REAL NOT NULL DEFAULT 0"],
  ["model_catalog", "kv_global_bytes_per_token", "REAL NOT NULL DEFAULT 0"],
  ["model_catalog", "sliding_window", "INTEGER NOT NULL DEFAULT 0"],
  ["model_catalog", "exps_bytes", "INTEGER NOT NULL DEFAULT 0"],
  ["model_catalog", "layers_nonexp_bytes", "INTEGER NOT NULL DEFAULT 0"],
  ["model_catalog", "output_bytes", "INTEGER NOT NULL DEFAULT 0"],
  ["hardware_classes", "vram_bw_gbps", "REAL NOT NULL DEFAULT 0"],
  ["hardware_classes", "ram_bw_gbps", "REAL NOT NULL DEFAULT 0"],
  ["engine_presets", "think", "BOOLEAN NOT NULL DEFAULT 0"],
  ["engine_presets", "recipe", "VARCHAR NOT NULL DEFAULT ''"],
  ["knob_catalog", "backends", "VARCHAR NOT NULL DEFAULT ''"],
  ["model_tunes", "backend", "VARCHAR NOT NULL DEFAULT ''"],
  ["model_measurements", "backend", "VARCHAR NOT NULL DEFAULT ''"],
  ["model_measurements", "vram_model_mb", "INTEGER NOT NULL DEFAULT 0"],
  ["model_measurements", "kind", "VARCHAR NOT NULL DEFAULT 'llm'"],
  ["model_measurements", "realtime_x", "REAL NOT NULL DEFAULT 0"],
  ["model_measurements", "ram_model_mb", "INTEGER NOT NULL DEFAULT 0"],
  ["knob_catalog", "fit_relevant", "BOOLEAN NOT NULL DEFAULT 0"],
  ["feature_prompts", "position", "INTEGER NOT NULL DEFAULT 0"],
  // a preset's kind (llm · image · vision · …) and its kind's own settings — the engines plan, K8 + K8b (2026-10-24)
  ["engine_presets", "kind", "VARCHAR NOT NULL DEFAULT 'llm'"],
  ["engine_presets", "params", "VARCHAR NOT NULL DEFAULT '{}'"],
  // what a kit runtime's build unpacks to — the engines plan, K10b (2026-10-27)
  ["runtime_binary", "asset_unpacked_bytes", "INTEGER NOT NULL DEFAULT 0"],
  ["runtime_binary", "runtime_unpacked_bytes", "INTEGER NOT NULL DEFAULT 0"],
  // a runtime model's memory need and reference speeds, and an image's measured seconds — rated the one way the
  // chat rows are (fit.coarseFit, fit.rateSpeed; the one-way-per-job fold, 2026-10-27). K10b's ram_gb /
  // ram_gb_shared (1394e5c) were a second way: a database made in between keeps them, unused.
  ["runtime_model", "min_ram_mb", "INTEGER NOT NULL DEFAULT 0"],
  ["runtime_model", "ref_speed", "VARCHAR NOT NULL DEFAULT '{}'"],
  ["model_measurements", "sec_per_image", "FLOAT NOT NULL DEFAULT 0"],
  // a llama.cpp build's runtime companion (cudart) checked like its download — the finish list's A12 (2026-10-29)
  ["runner_binary", "runtime_sha256", "VARCHAR"],
  // a prompt cache's write and read rates per model (Claude's) — the finish list's C28 (2026-10-29)
  ["model_pricing", "cache_write_per_m", "FLOAT NOT NULL DEFAULT 0"],
  ["model_pricing", "cache_read_per_m", "FLOAT NOT NULL DEFAULT 0"],
];

let handle = null;

/** The host hands its database handle (platform/sql.js `openDatabase`). */
export function configureStorage(h) {
  handle = h;
  if (h) h.register(TABLES);
}

/** The database every shared store uses. */
export function session() {
  if (!handle) throw new Error("LLM storage not configured — call configureStorage() during boot");
  return handle;
}

/** Is storage configured? (pricing's no-DB fallback asks.) */
export const isConfigured = () => handle !== null;

/** Create every LLM table that's missing, then the additive columns. */
export function createAll(h) {
  h.createTables(TABLES, ADDED_COLUMNS);
}
