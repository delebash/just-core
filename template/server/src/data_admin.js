// SPDX-License-Identifier: MIT
// Settings → Backups' server half: the kit's backup / restore / reset router (makeDataRouter, the
// family's one implementation) over this app's database. One database, two table sets — the app's
// (database/schema.js) and the shared LLM stack's — and no asset folders: everything the app keeps
// is in the database.
//
// Reset is the first-run state: the runner stops first (no model keeps running under settings
// that no longer exist), every table is dropped and created again — so a reset also recovers from
// schema drift — and the seed pass runs. The access tokens survive it: a reset on an exposed
// headless server must not open it to the network. A restore replaces the rows under the running
// app, so the runner stops after it too (the clean-slate rule, JustWrite 2026-07-11) — and it keeps
// this server's access tokens too, not the backup's (keepAuth).

import { LLM_TABLES } from "@delebash/core/llm";
import * as llmDb from "@delebash/core/llm/db";
import { makeDataRouter } from "@delebash/core/platform";
import { sortedTables } from "@delebash/core/platform/data_api";
import { getLogger } from "@delebash/core/platform/log";
import * as lifecycle from "@delebash/core/runner/lifecycle";
import { getDb } from "./app_state.js";
import { dbPath, recreateAppTables } from "./database/index.js";
import { APP_TABLES } from "./database/schema.js";
import { seedWorkspace } from "./database/seed.js";
import { deleteSetting, getSetting, setSetting } from "./database/settings.js";

const log = getLogger("family_template.data");

/** A restore keeps this server's access tokens, as a reset does: they are the server's, not the data's —
 *  a backup made before a token was set would open the server to the network, one with another token
 *  lock every client out. The kit's restore runs both inside its transaction. */
let keptAuth;
export const keepAuth = {
  beforeCopy: (h) => {
    keptAuth = getSetting(h, "auth");
  },
  afterCopy: (h) => {
    if (keptAuth === undefined) deleteSetting(h, "auth");
    else setSetting(h, "auth", keptAuth);
  },
};

async function stopRunnerBestEffort() {
  try {
    await lifecycle.getService().stop();
  } catch {
    // best-effort by design — a reset or restore never fails on the runner's teardown
  }
}

/** Back to the first-run state (POST /v1/data/reset). */
export async function resetWorkspace() {
  const db = getDb();
  await stopRunnerBestEffort();
  const auth = getSetting(db, "auth");
  // the LLM stack's tables, children before parents, then created again
  db.tx(() => {
    for (const t of [...sortedTables(LLM_TABLES)].reverse()) db.exec(`DROP TABLE IF EXISTS "${t}"`);
  });
  llmDb.createAll(db);
  recreateAppTables(db, APP_TABLES);
  if (auth !== undefined) setSetting(db, "auth", auth);
  seedWorkspace(db);
  log.info("workspace reset to its first-run state");
}

export const router = (dataDir) =>
  makeDataRouter({
    getDbPath: () => dbPath(dataDir),
    metadata: [APP_TABLES, LLM_TABLES],
    runReset: resetWorkspace,
    assetDirs: () => ({}),
    ...keepAuth,
    // a backup from an older version: its settings get what this one's seed adds and upgrades (as at start)
    afterTables: () => seedWorkspace(getDb()),
    onReplaced: stopRunnerBestEffort,
  });
