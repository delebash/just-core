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
// reads back isn't the one it wrote — a FAT32 drive keeps times to 2 s, or another server took the lock
// over after this one's looked stale (its event loop held up past `stale`) — or when it can't refresh it
// within `stale` — a network share waking from sleep (its README, "Compromised"). Its default
// `onCompromised` throws, uncaught, and the server died about 15 s after starting (2026-10-20). The
// README's `onCompromised` option now says it in the log and takes the lock again — only when it is
// free or still this server's own gone stale: the retries outlast `stale`, so this server's own lock,
// which nobody refreshes now, goes stale and is taken back. A lock still fresh after them is another
// server's, refreshed as it runs: this one is told (`onLost`) and stops serving the folder — two
// servers never share one (the fourteenth review, 2026-10-20).

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

// proper-lockfile's `stale`: 10 s unless given, never under 2 s (lib/lockfile.js `lock`).
const DEFAULT_STALE_MS = 10_000;
const MIN_STALE_MS = 2000;

/** The retries a lost lock is taken back with: a try each second until past `stale`, so this server's own lock —
 *  nobody refreshes it now — goes stale and is taken back; one still fresh after them is another server's. */
export function retakeRetries(stale) {
  const ms = Math.max(stale ?? DEFAULT_STALE_MS, MIN_STALE_MS);
  return { retries: Math.ceil(ms / 1000) + 1, factor: 1, minTimeout: 1000, maxTimeout: 1000 };
}

/** What a server says when another server of its app holds the data folder (approved words). */
export function dataFolderInUse(productName, dataDir) {
  return `Another ${productName} server is using this data folder (${dataDir}) — stop it first.`;
}

/**
 * Lock `dataDir` (created when missing) for this process. Resolves a `release` (it also stops taking a lost
 * lock again); rejects with `code: "ELOCKED"` when another live server holds it after the retries. A lock lost
 * later is logged (`log.warn`) and taken again when it is free or this server's own gone stale — never thrown;
 * when another server holds it fresh, `onLost(error)` is called once and the lock is left to that server
 * (without `onLost` it is tried again later, as before). `fs`, `stale` and `update` go to proper-lockfile as
 * its README names them (tests: an fs with FAT32's 2-second times, a short stale).
 */
export async function lockDataDir(dataDir, { retries = LOCK_RETRIES, log = console, fs: lockFs, stale, update, onLost = null } = {}) {
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
    // past `stale`: the lost lock's own folder goes stale first (our last refresh), then is ours
    lockfile.lock(dataDir, { ...options, retries: retakeRetries(stale) }).then(
      (r) => {
        if (done) return r().catch(() => {});
        release = r;
        log.info?.("the data folder's lock is taken again");
      },
      (e) => {
        if (done) return;
        if (e?.code === "ELOCKED" && onLost) {
          // still fresh past `stale`: another server refreshes it — the folder is that server's now
          done = true;
          log.warn?.("another server holds the data folder's lock now — this one stops using the folder");
          try {
            onLost(e);
          } catch {
            /* never thrown from proper-lockfile's timer */
          }
          return;
        }
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
