// SPDX-License-Identifier: MIT
// The app's own tables, as numbered migrations (app-structure §16). The kit's `migrate` keeps the
// version in SQLite's own counter (PRAGMA user_version) and runs each newer migration once, in one
// transaction with the counter. Newest last; an applied migration is never edited — a schema
// change is a new entry.
//
// Ids are random text (crypto.randomUUID — a table that may sync never uses AUTOINCREMENT), times
// are ISO-8601 UTC text, columns are typed (snake_case here; the stores map them to the camelCase
// wire). The shared LLM stack's tables ride the same database: installLlm creates them.

export const MIGRATIONS = [
  {
    version: 1,
    name: "notes and settings",
    up: `
      CREATE TABLE notes (
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        body TEXT NOT NULL DEFAULT '',
        pinned INTEGER NOT NULL DEFAULT 0 CHECK (pinned IN (0, 1)),
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      CREATE INDEX notes_by_updated ON notes (pinned, updated_at);

      -- The app's settings (one row per key, the value JSON), the renderer's preferences
      -- ("pref.<key>" rows, behind /v1/prefs) and the server's access tokens (the "auth" row).
      CREATE TABLE settings (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
      );
    `,
  },
];

/** The app's tables, for the kit's backup/restore/reset (makeDataRouter's `metadata`). */
export const APP_TABLES = ["notes", "settings"];
