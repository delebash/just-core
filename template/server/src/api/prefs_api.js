// SPDX-License-Identifier: MIT
// /v1/prefs — the renderer's preferences document (appearance, the once-ever AI offer's flag,
// keep-running, the language): the kit's router (makePrefsRouter — GET the document, PATCH
// wholesale per key, DELETE clears it) over this app's storage, `pref.<key>` rows in the settings
// table (docgen's pattern), so the backup panel's backup, restore and reset cover them.

import { makePrefsRouter } from "@delebash/core/platform";
import { getDb } from "../app_state.js";
import { clearPrefs, readPrefs, writePrefs } from "../database/settings.js";

export const router = () =>
  makePrefsRouter({
    readAll: () => readPrefs(getDb()),
    writeMany: (patch) => writePrefs(getDb(), patch),
    clear: () => clearPrefs(getDb()),
  });
