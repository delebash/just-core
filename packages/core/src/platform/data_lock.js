// SPDX-License-Identifier: MIT
// One server per data folder (approved 2026-10-15: "A data-folder lock so a second server of an
// app (another port, headless beside the desktop app, etc.) can't open the same data folder").
// The family's shared server start (serve.js `runServer`) takes it before the app opens its
// database; a clean exit lets it go (proper-lockfile releases its locks when the process exits).
// A crashed server's lock goes stale by proper-lockfile's own rule — its lock's time stops being
// refreshed and, past the library's default `stale` (10 s, its README), the next server takes it
// over — and a start right after a crash waits for that rather than refusing.
//
// The standard: proper-lockfile (npm, MIT — github.com/moxystudio/node-proper-lockfile): a lock
// is a folder made with mkdir ("works atomically on any kind of file system, even network based
// ones" — its README), kept fresh by touching its time. The lock lives INSIDE the data folder
// (`lockfilePath`, the README's way to lock a folder): nothing lands outside the folder the user
// chose (the 2026-08-14 ruling).

import fs from "node:fs";
import path from "node:path";
import lockfile from "proper-lockfile";

/** The lock's own folder inside the data folder. */
export const LOCK_NAME = "server.lock";

// proper-lockfile's default `stale` is 10 s (its README): a try each second for 11 s outlasts it,
// so a start right after a crash takes the dead server's lock instead of refusing.
export const LOCK_RETRIES = Object.freeze({ retries: 11, factor: 1, minTimeout: 1000, maxTimeout: 1000 });

/** What a server says when another server of its app holds the data folder (approved words). */
export function dataFolderInUse(productName, dataDir) {
  return `Another ${productName} server is using this data folder (${dataDir}) — stop it first.`;
}

/**
 * Lock `dataDir` (created when missing) for this process. Resolves proper-lockfile's `release`;
 * rejects with `code: "ELOCKED"` when another live server holds it after the retries.
 */
export async function lockDataDir(dataDir, { retries = LOCK_RETRIES } = {}) {
  fs.mkdirSync(dataDir, { recursive: true });
  return lockfile.lock(dataDir, { lockfilePath: path.join(dataDir, LOCK_NAME), retries });
}
