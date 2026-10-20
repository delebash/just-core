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
//
// A lock can be lost while the server runs: proper-lockfile calls it compromised when the time it
// reads back isn't the one it wrote — a FAT32 drive keeps times to 2 s — or when it can't refresh it
// within `stale` — a network share waking from sleep. Its default `onCompromised` throws, uncaught,
// and the server died about 15 s after starting (2026-10-20). The README's `onCompromised` option
// now says it in the log and takes the lock again; the server runs on.

import fs from "node:fs";
import path from "node:path";
import lockfile from "proper-lockfile";

/** The lock's own folder inside the data folder. */
export const LOCK_NAME = "server.lock";

// proper-lockfile's default `stale` is 10 s (its README): a try each second for 11 s outlasts it,
// so a start right after a crash takes the dead server's lock instead of refusing.
export const LOCK_RETRIES = Object.freeze({ retries: 11, factor: 1, minTimeout: 1000, maxTimeout: 1000 });

// A lost lock that can't be taken again at once (the share still waking) is tried again this much later.
const RELOCK_WAIT_MS = 30_000;

/** What a server says when another server of its app holds the data folder (approved words). */
export function dataFolderInUse(productName, dataDir) {
  return `Another ${productName} server is using this data folder (${dataDir}) — stop it first.`;
}

/**
 * Lock `dataDir` (created when missing) for this process. Resolves a `release` (it also stops taking a lost
 * lock again); rejects with `code: "ELOCKED"` when another live server holds it after the retries. A lock lost
 * later is logged (`log.warn`) and taken again — never thrown. `fs`, `stale` and `update` go to proper-lockfile
 * as its README names them (tests: an fs with FAT32's 2-second times, a short stale).
 */
export async function lockDataDir(dataDir, { retries = LOCK_RETRIES, log = console, fs: lockFs, stale, update } = {}) {
  fs.mkdirSync(dataDir, { recursive: true });
  const options = { lockfilePath: path.join(dataDir, LOCK_NAME), onCompromised };
  if (lockFs) options.fs = lockFs;
  if (stale) options.stale = stale;
  if (update) options.update = update;
  let release = null;
  let done = false;
  let timer = null;

  function onCompromised(e) {
    // proper-lockfile calls this from a timer: anything thrown here is uncaught and ends the server
    try {
      release = null;
      if (done) return;
      log.warn?.(`the data folder's lock was lost (${e?.message || e}) — taking it again`);
      takeAgain();
    } catch {
      /* never thrown */
    }
  }
  function takeAgain() {
    // with the retries a start has: the lost lock's own folder goes stale first (our last refresh), then is ours
    lockfile.lock(dataDir, { ...options, retries: LOCK_RETRIES }).then(
      (r) => {
        if (done) return r().catch(() => {});
        release = r;
        log.info?.("the data folder's lock is taken again");
      },
      (e) => {
        if (done) return;
        log.warn?.(`the data folder's lock couldn't be taken again (${e?.message || e}) — trying again in ${RELOCK_WAIT_MS / 1000} s`);
        timer = setTimeout(takeAgain, RELOCK_WAIT_MS);
        timer.unref?.();
      },
    );
  }

  release = await lockfile.lock(dataDir, { ...options, retries });
  return async () => {
    done = true;
    clearTimeout(timer);
    const r = release;
    release = null;
    if (r) await r();
  };
}
