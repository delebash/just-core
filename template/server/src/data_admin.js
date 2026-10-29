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
import { stopRuntimeServers } from "@delebash/core/runner/runtime_service";
import { getDb, getState } from "./app_state.js";
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
  // and a backup carries none: a file shared or left somewhere never hands out a way in
  scrubBackup: (h) => deleteSetting(h, "auth"),
};

async function stopRunnerBestEffort() {
  // the jobs first: an image job running on the engine ends before the engine does
  await getState().jobs?.cancelAll().catch(() => {});
  try {
    await lifecycle.getService().stop();
  } catch {
    // best-effort by design — a reset or restore never fails on the runner's teardown
  }
  // and the kit's other runtimes' servers (an image app's sd-server): Windows keeps a running server's files locked
  await stopRuntimeServers();
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
  // the data's new epoch: every other window reloads (the kit's ChangeCounter)
  getState().changes?.renewEpoch(db);
  getState().changes?.replaced();
  log.info("workspace reset to its first-run state");
}

export const router = (dataDir, { gate } = {}) =>
  makeDataRouter({
    getDbPath: () => dbPath(dataDir),
    metadata: [APP_TABLES, LLM_TABLES],
    runReset: resetWorkspace,
    assetDirs: () => ({}),
    ...keepAuth,
    // and the data's new epoch, in the same transaction as the restored rows (the backup's own row replaced)
    afterCopy: (h) => {
      keepAuth.afterCopy(h);
      getState().changes?.renewEpoch(h);
    },
    // a backup from an older version: its settings get what this one's seed adds and upgrades (as at start)
    afterTables: () => seedWorkspace(getDb()),
    // what would write into the data being replaced stops before it is (the gate is closed by then), and what was
    // derived from the old data after
    beforeReplace: stopRunnerBestEffort,
    // every window reloads — only once the data has been replaced (a refused restore replaced nothing)
    onReplaced: async () => {
      getState().changes?.replaced();
      await stopRunnerBestEffort();
    },
    gate,
  });
