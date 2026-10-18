// SPDX-License-Identifier: MIT
// The app's settings — one schema per key (app-structure §16). A key is a `settings` row seeded
// with its first value (database/seed.js SETTING_DEFAULTS); /v1/settings reads and writes only the
// keys listed here, and Settings → General builds its form rules from the same schemas.
// Browser-safe: this file imports only the kit's `platform/schema` (TypeBox).

import { opt, strictObject, T } from "@delebash/core/platform/schema";

export const SETTINGS = {
  // Notes per page in the Notes list.
  "notes.pageSize": T.Integer({ minimum: 5, maximum: 100 }),
};

export const SETTING_KEYS = Object.keys(SETTINGS);

/** PATCH /v1/settings — any of the keys, nothing else. */
export const SettingsPatch = strictObject(Object.fromEntries(SETTING_KEYS.map((k) => [k, opt(SETTINGS[k])])));
