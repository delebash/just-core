// SPDX-License-Identifier: MIT
// The app's database (app-structure §16): one SQLite file in the data folder, opened with the
// kit's `openDatabase` (better-sqlite3, one synchronous connection, foreign keys on) and brought up
// to the newest schema by the kit's `migrate`. Only the server opens it (family rule 2).

import { mkdirSync } from "node:fs";
import path from "node:path";
import { migrate, openDatabase } from "@delebash/core/platform";
import { sortedTables } from "@delebash/core/platform/data_api";
import { getLogger } from "@delebash/core/platform/log";
import { MIGRATIONS } from "./schema.js";

const log = getLogger("family_template.database");

/** The database file's name, in the data folder. */
export const DB_FILE = "family-template.db";

export const dbPath = (dataDir) => path.join(dataDir, DB_FILE);

/** Open (creating when new) the app's database in `dataDir` and migrate it. */
export function openAppDatabase(dataDir) {
  mkdirSync(dataDir, { recursive: true });
  const db = openDatabase(dbPath(dataDir), { foreignKeys: true });
  try {
    const { from, to } = migrate(db, MIGRATIONS);
    log.info(`database ${dbPath(dataDir)} at schema ${to}${from !== to ? ` (from ${from})` : ""}`);
  } catch (e) {
    db.close(); // a database this code can't use is left as it was, and closed
    throw e;
  }
  return db;
}

/** Drop the app's tables and run the migrations again — the backup panel's Reset. */
export function recreateAppTables(db, tables) {
  db.tx(() => {
    // children before parents: the foreign keys are on (sortedTables orders by the DDL's REFERENCES)
    for (const t of [...sortedTables(tables)].reverse()) db.exec(`DROP TABLE IF EXISTS "${t}"`);
    db.raw.pragma("user_version = 0");
  });
  migrate(db, MIGRATIONS);
}
