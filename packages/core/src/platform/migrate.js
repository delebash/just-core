// SPDX-License-Identifier: MIT
// Schema changes for an app's SQLite database (app-structure §16). The schema's version is
// SQLite's own counter, `PRAGMA user_version` (sqlite.org/pragma.html#pragma_user_version): a new
// database starts at 0, and each migration whose number is above the stored one runs, in order,
// inside one transaction that also sets the counter — so a failed migration leaves the database
// exactly as it was, and a run is idempotent.
//
// A migration is `{ version, name, up }`: `up` is SQL text (run with `db.exec`) or a function
// `(db) => void` for changes SQL alone can't express (a data rewrite). Versions start at 1, are
// unique and only ever added — an applied migration is never edited.

import { getLogger } from "./log.js";

const log = getLogger("llm_runner.platform.migrate");

/** The better-sqlite3 handle under the kit's `openDatabase` wrapper (or a raw handle). */
const rawOf = (db) => db?.raw || db;

/** The stored schema version. */
export function schemaVersion(db) {
  return Number(rawOf(db).pragma("user_version", { simple: true })) || 0;
}

/**
 * Bring `db` (the kit's `openDatabase` handle, or a raw better-sqlite3 one) up to the newest of
 * `migrations`; a function migration gets `db` as it was passed.
 * Returns `{ from, to, applied: [versions] }`. Throws on a malformed list, or when the database
 * is NEWER than this code knows (an older app opening a newer app's file would corrupt it).
 */
export function migrate(db, migrations) {
  const list = [...migrations].sort((a, b) => a.version - b.version);
  list.forEach((m, i) => {
    if (!Number.isInteger(m.version) || m.version < 1) throw new Error(`migration ${m.name || i}: version must be an integer >= 1`);
    if (i > 0 && list[i - 1].version === m.version) throw new Error(`migration version ${m.version} appears twice`);
    if (typeof m.up !== "string" && typeof m.up !== "function") throw new Error(`migration ${m.version}: up must be SQL or a function`);
  });
  const from = schemaVersion(db);
  const newest = list.length ? list[list.length - 1].version : 0;
  if (from > newest) {
    throw new Error(`the database is at schema version ${from}, newer than this app knows (${newest}) — update the app`);
  }
  const raw = rawOf(db);
  const applied = [];
  for (const m of list) {
    if (m.version <= from) continue;
    raw.transaction(() => {
      if (typeof m.up === "string") raw.exec(m.up);
      else m.up(db);
      raw.pragma(`user_version = ${m.version}`);
    })();
    applied.push(m.version);
    log.info(`database migrated to ${m.version}${m.name ? ` (${m.name})` : ""}`);
  }
  return { from, to: schemaVersion(db), applied };
}
