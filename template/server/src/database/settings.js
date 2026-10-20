// SPDX-License-Identifier: MIT
// The settings store — one `settings` row per key, its value JSON text. Three kinds of row share
// the table, each behind its own door:
//   - the app's settings (`notes.pageSize`, …) — /v1/settings, a schema per key (schemas/settings.js);
//   - the renderer's preferences, `pref.<key>` rows — /v1/prefs (the kit's makePrefsRouter);
//   - the access tokens, the `auth` row — /v1/server-auth and the bearer guard (auth.js).
// With database/notes.js the only code that writes SQL (app-structure §16).

const PREF = "pref.";
// GLOB, not LIKE: case-sensitive, and `.` is literal.
const PREF_ROWS = "key GLOB 'pref.*'";

function decode(text) {
  try {
    return JSON.parse(text);
  } catch {
    return null; // an unreadable value reads as null, never a 500
  }
}

/** A setting's value, or undefined when it has no row. */
export function getSetting(db, key) {
  const row = db.one("SELECT value FROM settings WHERE key = ?", [key]);
  return row ? decode(row.value) : undefined;
}

/** Set a setting (insert or replace its value). */
export function setSetting(db, key, value) {
  db.run("INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT (key) DO UPDATE SET value = excluded.value", [
    key,
    JSON.stringify(value),
  ]);
}

/** Remove a setting's row (it reads as unset again). */
export function deleteSetting(db, key) {
  db.run("DELETE FROM settings WHERE key = ?", [key]);
}

/** Set a setting only when it has no row (a seed); true when it was added. */
export function insertSettingIfMissing(db, key, value) {
  return db.run("INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)", [key, JSON.stringify(value)]).changes > 0;
}

/** `{key: value}` for those of `keys` that have a row. */
export function readSettings(db, keys) {
  const out = {};
  for (const key of keys) {
    const v = getSetting(db, key);
    if (v !== undefined) out[key] = v;
  }
  return out;
}

/** Several settings in one transaction. */
export function writeSettings(db, values) {
  db.tx(() => {
    for (const [key, value] of Object.entries(values)) setSetting(db, key, value);
  });
}

// ── the renderer's preferences (the kit's /v1/prefs hooks) ───────────────────

export function readPrefs(db) {
  const out = {};
  for (const row of db.all(`SELECT key, value FROM settings WHERE ${PREF_ROWS}`)) {
    out[row.key.slice(PREF.length)] = decode(row.value);
  }
  return out;
}

export function writePrefs(db, patch) {
  db.tx(() => {
    for (const [key, value] of Object.entries(patch)) setSetting(db, PREF + key, value);
  });
}

/** Drop every preference; the app's settings and the access tokens stay. */
export function clearPrefs(db) {
  db.run(`DELETE FROM settings WHERE ${PREF_ROWS}`);
}
