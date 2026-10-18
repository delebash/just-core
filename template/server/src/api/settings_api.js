// SPDX-License-Identifier: MIT
// /v1/settings — the app's own settings, one schema per key (app-structure §16; the keys and
// their schemas: schemas/settings.js; their first values: database/seed.js). The renderer's
// preferences are /v1/prefs, a different door (prefs_api.js).
//
//   GET   /v1/settings  → {key: value} for every known key that has a row
//   PATCH /v1/settings  SettingsPatch → the same document | 422 (a value out of range, a key
//                       that isn't a setting)

import { Hono, input } from "@delebash/core/platform";
import { getLogger } from "@delebash/core/platform/log";
import { getDb } from "../app_state.js";
import { readSettings, writeSettings } from "../database/settings.js";
import { SETTING_KEYS, SettingsPatch } from "../schemas/settings.js";

const log = getLogger("family_template.settings");

export function router() {
  const app = new Hono();

  app.get("/v1/settings", (c) => c.json(readSettings(getDb(), SETTING_KEYS)));

  app.patch("/v1/settings", input({ body: SettingsPatch }), (c) => {
    const patch = c.req.valid("json");
    writeSettings(getDb(), patch);
    const keys = Object.keys(patch);
    if (keys.length) log.info(`settings changed: ${keys.join(", ")}`);
    return c.json(readSettings(getDb(), SETTING_KEYS));
  });

  return app;
}
