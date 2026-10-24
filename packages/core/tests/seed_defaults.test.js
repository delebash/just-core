// SPDX-License-Identifier: MIT
// A better default reaches an install made before it (docs/plans/2026-10-24-engines-the-llama-way.md F2): an app's
// setting still at an earlier default takes today's (platform/settings_upgrade.js — moved from just-house-paint), and
// so do the kit's own seeded rows — a provider still holding an old seeded name or timeout (JustWrite's finding #7,
// the 60 s that stayed), a runner setting still holding an earlier default. A value its owner changed is never
// touched. Today's kit defaults are held here: change one and this fails until its outgoing value is kept.
import { afterEach, expect, test } from "vitest";
import { DEFAULT_PROVIDERS, DEFAULT_RUNNER_SETTINGS, PRIOR_RUNNER_SETTINGS, seedDefaultRunnerSettings } from "../src/llm/seed.js";
import { defaultsFingerprints, fingerprint, upgradeSettings } from "../src/platform/settings_upgrade.js";
import { freshDb } from "./helpers.js";

// Today's seeded defaults. A change here means a default changed: keep the OLD value in seed.js
// (PRIOR_PROVIDER_TIMEOUTS / RENAMED_PROVIDER_NAMES / PRIOR_RUNNER_SETTINGS) so installs still holding it get the
// new one, then update this line.
const TODAY_PROVIDERS = {
  "local-llamacpp": "10a46fd16f9d8098",
  "openai-compat-local": "53b2f80daf17ec62",
  lmstudio: "4d9b801328b120fc",
  unsloth: "fa68a28e9fce2efe",
  openai: "565e6cb8ea894d44",
  claude: "98a2a2ee2f9495e7",
  gemini: "a871df6afcf8c3ae",
  deepseek: "2f1d2991237763c9",
  openrouter: "63b81f99535e706e",
  xai: "6adeca97ad7e85a9",
  mistral: "9e0ad64c4ac33598",
};
const TODAY_RUNNER_SETTINGS = {
  safety_margin_mb: "f36a66ac3e9bb80a",
  ctx_cap_tokens: "268f2c3bac79173b",
  floor_ctx_tokens: "648c6705d84857ca",
  ram_headroom_mb: "648c6705d84857ca",
  band_fast_toks: "9e897d4ec265aec4",
  band_fine_toks: "2254617afd5eb0f0",
  band_slow_toks: "86169bcf42397928",
  band_deadzone_frac: "5a4747fcdafec66d",
  speed_floor_grace: "10bc5b531aad39c3",
  calib_model_url: "130b53f04976dd02",
  calib_model_sha256: "01521d93c0b1dae0",
  calib_model_size_bytes: "7151bfe382896c38",
  calib_active_expert_mb: "d859a36e1e0aaa65",
  calib_nonexpert_mb: "2a1271f90ff10c21",
  bw_eff_device: "118128dab04d3fce",
  bw_eff_host: "38096e5849832fd4",
  bw_eff_host_probe: "1e60280e9d1e3e84",
  load_rows_keep: "a4aab3f1f08004e9",
  models_max: "cc11310c456c3690",
  sleep_idle_seconds: "bdad863a6835d5f6",
  download_max_concurrent: "2bf175f9655e7bb7",
  warm_default_on_startup: "391552c099c101b1",
};

afterEach(() => {
  for (const k of Object.keys(PRIOR_RUNNER_SETTINGS)) delete PRIOR_RUNNER_SETTINGS[k];
});

test("today's kit defaults are the ones this test knows — a change needs its outgoing value kept", () => {
  expect(defaultsFingerprints(Object.fromEntries(DEFAULT_PROVIDERS.map((p) => [p.id, p])))).toEqual(TODAY_PROVIDERS);
  // the llama.cpp pin is left out: an install keeps it until its owner updates the engine
  const settings = Object.fromEntries(DEFAULT_RUNNER_SETTINGS.filter((r) => r.key !== "pinned_build").map((r) => [r.key, r.value]));
  expect(defaultsFingerprints(settings)).toEqual(TODAY_RUNNER_SETTINGS);
  for (const [key, earlier] of Object.entries(PRIOR_RUNNER_SETTINGS)) expect(earlier).not.toContain(settings[key]);
});

test("a runner setting still at an earlier default takes today's; one its owner changed is left alone", () => {
  const h = freshDb();
  const today = Object.fromEntries(DEFAULT_RUNNER_SETTINGS.map((r) => [r.key, r.value]));
  h.insert("runner_setting", { key: "models_max", value: "7", built_in: true });
  h.insert("runner_setting", { key: "sleep_idle_seconds", value: "12345", built_in: true });
  PRIOR_RUNNER_SETTINGS.models_max = ["7"];
  PRIOR_RUNNER_SETTINGS.sleep_idle_seconds = ["600"]; // an earlier default the owner's 12345 isn't
  h.tx(() => seedDefaultRunnerSettings(h));
  expect(h.get("runner_setting", "models_max").value).toBe(today.models_max);
  expect(h.get("runner_setting", "sleep_idle_seconds").value).toBe("12345");
});

test("an app's setting still at an earlier default takes today's; an edited one, and today's, are left alone", () => {
  const rows = new Map();
  const store = { getSetting: (_h, k) => (rows.has(k) ? structuredClone(rows.get(k)) : undefined), setSetting: (_h, k, v) => rows.set(k, structuredClone(v)) };
  const h = { tx: (fn) => fn() };
  const defaults = { "finder.parts": [{ key: "wall", prompts: ["wall", "siding"] }], "finder.priority": ["trim", "wall"], "notes.pageSize": 25 };
  const earlierParts = [{ prompts: ["wall"], key: "wall" }]; // the keys' order never matters to a fingerprint
  const previous = { "finder.parts": [fingerprint([{ key: "wall", prompts: ["wall"] }])], "finder.priority": [fingerprint(["wall"])], "gone.key": ["0"] };
  rows.set("finder.parts", earlierParts);
  rows.set("finder.priority", ["wall", "trim"]); // the owner's own
  rows.set("notes.pageSize", 25);
  expect(upgradeSettings(h, { defaults, previous, ...store })).toEqual(["finder.parts"]);
  expect(rows.get("finder.parts")).toEqual(defaults["finder.parts"]);
  expect(rows.get("finder.priority")).toEqual(["wall", "trim"]);
  expect(upgradeSettings(h, { defaults, previous, ...store })).toEqual([]); // nothing left to upgrade
});
