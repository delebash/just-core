// SPDX-License-Identifier: MIT
// Port of tests/test_runner_config_store.py — the editable engine config (runner_binary +
// runner_setting via /v1/ai/engine-config): get / upsert / set-setting / reset round-trip
// over an in-memory DB.
//
// Waits for wave 2 (skipped until `makeRunnerConfigRouter` exists, then they run by
// themselves): the four tests that mount the engine-config router —
// `engine_config_put_persists_router_knobs`,
// `engine_config_put_clamps_models_max_and_allows_zero_ttl`,
// `engine_config_put_knobs_only_does_not_clobber_binaries_or_build`,
// `engine_config_put_round_trips_class_key_override` — need `makeRunnerConfigRouter`
// (llm/runner_config_api.js holds only the models so far). `get_config_exposes_router_knobs`
// reads the store only and runs now.
import { expect, test } from "vitest";
import * as rcApi from "../src/llm/runner_config_api.js";
import * as seed from "../src/llm/seed.js";
import * as stores from "../src/llm/stores.js";
import { createServer } from "../src/platform/server.js";
import * as rconfig from "../src/runner/config.js";
import { freshDb } from "./helpers.js";

const NO_ROUTER = typeof rcApi.makeRunnerConfigRouter !== "function";

function freshSeeded() {
  const h = freshDb();
  h.tx(() => {
    seed.seedDefaultRunnerBinaries(h);
    seed.seedDefaultRunnerSettings(h);
  });
}

const cuda12 = (cfg) => cfg.binaries.find((b) => b.platform === "windows" && b.gpu === "cuda12");

test("get_config_reads_seeded_defaults", () => {
  freshSeeded();
  const cfg = stores.getRunnerConfigStore().getConfig();
  expect(cfg.pinnedBuild).toBe(rconfig.DEFAULT_PINNED_BUILD);
  expect(cfg.safetyMarginMb).toBe(rconfig.DEFAULT_SAFETY_MARGIN_MB);
  expect(cfg.binaries).toHaveLength(rconfig.DEFAULT_BINARIES.length);
  const cuda = cuda12(cfg);
  expect(cuda.assetUrl).toContain("cuda-12.4");
  expect(cuda.runtimeUrl).toContain("cudart"); // the companion is served
});

test("upsert_binary_and_settings", () => {
  freshSeeded();
  const store = stores.getRunnerConfigStore();
  store.upsertBinary({
    platform: "windows",
    gpu: "cuda12",
    assetUrl: "https://example.com/fixed.zip",
    runtimeUrl: null,
    serverExe: "llama-server.exe",
  });
  store.setSetting("pinned_build", "b9999");
  store.setSetting("safety_margin_mb", "2048");

  const cfg = store.getConfig();
  expect(cuda12(cfg).assetUrl).toBe("https://example.com/fixed.zip");
  expect(cfg.pinnedBuild).toBe("b9999");
  expect(cfg.safetyMarginMb).toBe(2048);
});

test("reset_restores_shipped_and_keeps_custom", () => {
  freshSeeded();
  const store = stores.getRunnerConfigStore();
  // break a shipped row + add a user custom row + change a setting
  store.upsertBinary({ platform: "windows", gpu: "cuda12", assetUrl: "https://bad/x.zip" });
  store.upsertBinary({
    platform: "linux",
    gpu: "custom",
    assetUrl: "https://example.com/custom.tar.gz",
    serverExe: "llama-server",
  });
  store.setSetting("pinned_build", "bXXXX");

  store.resetToDefaults();

  const cfg = store.getConfig();
  expect(cuda12(cfg).assetUrl).toContain("cuda-12.4"); // shipped URL restored
  expect(cfg.pinnedBuild).toBe(rconfig.DEFAULT_PINNED_BUILD); // setting restored
  expect(cfg.binaries.some((b) => b.gpu === "custom")).toBe(true); // custom row preserved
});

// ── P1e: the router knobs (models_max + sleep_idle_seconds) the service reads ──

test("build_runner_config_reads_seeded_router_knobs", () => {
  // buildRunnerConfig is the runner service's configFn; it must surface the two router
  // knobs from the seeded runner_setting rows (with the shipped defaults).
  freshSeeded();
  const cfg = stores.buildRunnerConfig();
  expect(cfg.modelsMax).toBe(rconfig.DEFAULT_MODELS_MAX);
  expect(cfg.sleepIdleSeconds).toBe(rconfig.DEFAULT_SLEEP_IDLE_SECONDS);
});

test("build_runner_config_reads_edited_router_knobs", () => {
  // DB is the source of truth: an edited models_max / sleep_idle_seconds flows through.
  // sleep_idle_seconds = 0 (disable the TTL) must be PRESERVED, not coerced to a default.
  freshSeeded();
  const store = stores.getRunnerConfigStore();
  store.setSetting("models_max", "4");
  store.setSetting("sleep_idle_seconds", "0");
  const cfg = stores.buildRunnerConfig();
  expect(cfg.modelsMax).toBe(4);
  expect(cfg.sleepIdleSeconds).toBe(0);
});

// ── 4a: the two router knobs are readable + editable via /v1/ai/engine-config ──

async function engineConfigClient() {
  // Mount the shared engine-config editor over the (already-seeded) in-memory DB.
  const app = createServer({ typeBase: "https://example.test/errors/" });
  app.route("/", rcApi.makeRunnerConfigRouter(stores.getRunnerConfigStore));
  return {
    get: async (url) => (await app.request(url, { method: "GET" })).json(),
    put: (url, payload) =>
      app.request(url, { method: "PUT", body: JSON.stringify(payload), headers: { "content-type": "application/json" } }),
  };
}

test("get_config_exposes_router_knobs", () => {
  // The EngineConfig wire model (what the 4a resident-view UI reads) surfaces the two knobs
  // from the seeded runner_setting rows.
  freshSeeded();
  const cfg = stores.getRunnerConfigStore().getConfig();
  expect(cfg.modelsMax).toBe(rconfig.DEFAULT_MODELS_MAX);
  expect(cfg.sleepIdleSeconds).toBe(rconfig.DEFAULT_SLEEP_IDLE_SECONDS);
});

test.skipIf(NO_ROUTER)("engine_config_put_persists_router_knobs", async () => {
  freshSeeded();
  const r = await (await engineConfigClient()).put("/v1/ai/engine-config", { modelsMax: 3, sleepIdleSeconds: 120 });
  expect(r.status).toBe(200);
  const body = await r.json();
  expect(body.modelsMax).toBe(3);
  expect(body.sleepIdleSeconds).toBe(120);
  // …and it reaches the runner's live config (the service reads the same rows).
  const cfg = stores.buildRunnerConfig();
  expect(cfg.modelsMax).toBe(3);
  expect(cfg.sleepIdleSeconds).toBe(120);
});

test.skipIf(NO_ROUTER)("engine_config_put_clamps_models_max_and_allows_zero_ttl", async () => {
  // models_max < 1 is nonsensical (at least one model must stay resident) → clamp to 1;
  // sleep_idle_seconds = 0 is VALID (disables the idle-unload TTL) → preserved, not coerced.
  freshSeeded();
  const body = await (await (await engineConfigClient()).put("/v1/ai/engine-config", { modelsMax: 0, sleepIdleSeconds: 0 })).json();
  expect(body.modelsMax).toBe(1); // clamped up
  expect(body.sleepIdleSeconds).toBe(0); // zero preserved
});

test.skipIf(NO_ROUTER)("engine_config_put_knobs_only_does_not_clobber_binaries_or_build", async () => {
  // T3 build-guard: a partial PUT of just the two knobs must leave pinnedBuild + binaries +
  // safetyMarginMb untouched (EngineConfigUpdate is all-optional).
  freshSeeded();
  const client = await engineConfigClient();
  const before = await client.get("/v1/ai/engine-config");
  await client.put("/v1/ai/engine-config", { modelsMax: 4 });
  const after = await client.get("/v1/ai/engine-config");
  expect(after.pinnedBuild).toBe(before.pinnedBuild);
  expect(after.binaries).toHaveLength(before.binaries.length);
  expect(after.safetyMarginMb).toBe(before.safetyMarginMb);
  expect(after.modelsMax).toBe(4);
});

test.skipIf(NO_ROUTER)("engine_config_put_round_trips_class_key_override", async () => {
  // §9 (2026-07-22): the hardware-class override — free text ("" = auto-detect), trimmed
  // at the PUT boundary, served back on GET, cleared by reset.
  freshSeeded();
  const client = await engineConfigClient();
  expect((await client.get("/v1/ai/engine-config")).classKeyOverride).toBe("");
  const body = await (await client.put("/v1/ai/engine-config", { classKeyOverride: "  vram20|ram100  " })).json();
  expect(body.classKeyOverride).toBe("vram20|ram100");
  expect(stores.getClassKeyOverride()).toBe("vram20|ram100");
  stores.getRunnerConfigStore().resetToDefaults();
  expect(stores.getClassKeyOverride()).toBe("");
});

test("reset_restores_router_knobs", () => {
  freshSeeded();
  const store = stores.getRunnerConfigStore();
  store.setSetting("models_max", "7");
  store.setSetting("sleep_idle_seconds", "30");
  store.resetToDefaults();
  const cfg = store.getConfig();
  expect(cfg.modelsMax).toBe(rconfig.DEFAULT_MODELS_MAX);
  expect(cfg.sleepIdleSeconds).toBe(rconfig.DEFAULT_SLEEP_IDLE_SECONDS);
});

// The finish list's A11 (2026-10-29): how long a good update-check answer is kept — a runner setting like the others,
// read by the runner (RunnerConfig) and edited where the update policy is.
test.skipIf(NO_ROUTER)("the update check's keep time is a setting: 60 minutes seeded, edited through engine-config, 0 kept", async () => {
  freshSeeded();
  expect(stores.buildRunnerConfig().updateCheckMinutes).toBe(rconfig.DEFAULT_UPDATE_CHECK_MINUTES);
  const client = await engineConfigClient();
  expect((await client.get("/v1/ai/engine-config")).updateCheckMinutes).toBe(60);
  expect((await (await client.put("/v1/ai/engine-config", { updateCheckMinutes: 0 })).json()).updateCheckMinutes).toBe(0);
  expect(stores.buildRunnerConfig().updateCheckMinutes).toBe(0);
});

// The finish list's A12: a llama.cpp row's checksums (the download's and its runtime companion's) round-trip through
// engine-config and reach the runner's config; a URL changed by hand drops a checksum it didn't replace — a mirror's file
// isn't upstream's, and its old checksum would refuse it.
test.skipIf(NO_ROUTER)("a binary row's checksums round-trip; a URL edited by hand drops the one it didn't replace", async () => {
  freshSeeded();
  const client = await engineConfigClient();
  const row = (await client.get("/v1/ai/engine-config")).binaries.find((b) => b.platform === "windows" && b.gpu === "cuda12");
  const sha = "a".repeat(64);
  const rsha = "b".repeat(64);
  const withSums = { ...row, sha256: sha, runtimeSha256: rsha };
  let got = (await (await client.put("/v1/ai/engine-config", { binaries: [withSums] })).json()).binaries.find((b) => b.gpu === "cuda12" && b.platform === "windows");
  expect(got).toMatchObject({ sha256: sha, runtimeSha256: rsha });
  const live = stores.buildRunnerConfig().llamacpp.binaries.find((b) => b.platform === "windows" && b.gpu === "cuda12");
  expect(live).toMatchObject({ sha256: sha, runtimeSha256: rsha });
  // the editor round-trips the old checksums with a new download URL: the asset's is dropped, the runtime's kept
  got = (await (await client.put("/v1/ai/engine-config", { binaries: [{ ...got, assetUrl: "https://mirror.example.com/llama.zip" }] })).json()).binaries.find((b) => b.gpu === "cuda12" && b.platform === "windows");
  expect(got).toMatchObject({ assetUrl: "https://mirror.example.com/llama.zip", sha256: null, runtimeSha256: rsha });
});
