// SPDX-License-Identifier: MIT
// The app's seed pass (app-structure §8, §16) — run by serve.js when the server starts and by the
// backup panel's Reset, never by createApp (a test's createApp(tmp) starts from an empty
// database). Every step is insert-if-missing: a value the user changed is never overwritten.
//
//   - the shared LLM stack's rows (providers, the model catalog, the engine presets, the routing):
//     the kit's seedLlm, which reads the feature data installLlm registered;
//   - this app's settings defaults (family rule 1: a value a user might change is a row, seeded) — and a
//     setting still at an earlier default upgraded to today's (PREVIOUS_DEFAULTS);
//   - the provider registry, loaded from the seeded rows.

import { loadFromConfigs, seedLlm, stores } from "@delebash/core/llm";
import { upgradeSettings as upgradeToToday } from "@delebash/core/platform";
import { getLogger } from "@delebash/core/platform/log";
import { getSetting, insertSettingIfMissing, setSetting } from "./settings.js";

const log = getLogger("family_template.seed");

/** The app's settings and their first values — each key has its schema in schemas/settings.js. */
export const SETTING_DEFAULTS = {
  // Notes per page in the Notes list (Settings → General).
  "notes.pageSize": 25,
  // The largest text file Import a file takes, in KB (Settings → General).
  "notes.maxImportKilobytes": 100,
  // How often a window looks for what other windows changed on this server, in seconds (Settings → General — the
  // kit's GET /v1/sync/rev `pollSeconds`).
  "windows.checkSeconds": 3,
};

/**
 * The earlier defaults of the settings whose default has changed — each one's fingerprint (the kit's `fingerprint`:
 * the first 16 hex digits of the SHA-256 of its canonical JSON), per key. When a default in SETTING_DEFAULTS changes,
 * add the OUTGOING default's fingerprint here (tests/settings_upgrade.test.js holds today's and fails until you do):
 * an install still holding it — its owner never edited it — gets the new default.
 */
export const PREVIOUS_DEFAULTS = Object.freeze({});

/** Add every missing setting; returns how many were added. */
export function seedSettings(db) {
  let added = 0;
  db.tx(() => {
    for (const [key, value] of Object.entries(SETTING_DEFAULTS)) if (insertSettingIfMissing(db, key, value)) added++;
  });
  return added;
}

/** A setting still at an earlier default (PREVIOUS_DEFAULTS) takes today's; a value its owner changed is left
 *  alone (the kit's upgradeSettings). Returns the keys it upgraded. */
export function upgradeSettings(db) {
  const upgraded = upgradeToToday(db, { defaults: SETTING_DEFAULTS, previous: PREVIOUS_DEFAULTS, getSetting, setSetting });
  if (upgraded.length) log.info(`settings still at an earlier default, now today's: ${upgraded.join(", ")}`);
  return upgraded;
}

/** The whole seed pass. Never throws: a failed step is logged and the server still starts. */
export function seedWorkspace(db) {
  try {
    seedLlm(db);
  } catch (e) {
    log.warning(`the AI stack's seed failed: ${e?.message ?? e}`);
  }
  try {
    seedSettings(db);
    upgradeSettings(db);
  } catch (e) {
    log.warning(`the settings seed failed: ${e?.message ?? e}`);
  }
  try {
    loadFromConfigs(stores.getProviderStore().list());
  } catch (e) {
    log.warning(`the AI provider registry didn't load: ${e?.message ?? e}`);
  }
}
