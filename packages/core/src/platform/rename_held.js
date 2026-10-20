// SPDX-License-Identifier: MIT
// A rename, retried while another program holds a file in it — on Windows an antivirus reading a file just
// written or unpacked, the search indexer, a viewer: the rename answers EPERM, EACCES or EBUSY for a moment.
// Node's fs.rename doesn't retry as its fs.rm does (`maxRetries`, nodejs.org/api/fs.html#fspromisesrmpath-options).
// The pattern the restore took first (data_api.js); shared here so a download, an engine's unpack and an app's
// saves retry the same way (2026-10-20, just-house-paint's thirteenth review: "renames after a write or unpack
// have no retry").

import { renameSync } from "node:fs";
import { rename } from "node:fs/promises";

/** The codes Windows answers for a file another program holds. */
export const HELD_CODES = Object.freeze(new Set(["EPERM", "EACCES", "EBUSY"]));

const TRIES = 15;
const waitMs = (i) => Math.min(100 * i, 1000);

/** fs.promises.rename, retried while the file is held: about ten seconds (15 tries, 0.1 s growing to 1 s), then
 *  its error. Any other error is thrown at once. `rename` is a test seam. */
export async function renameHeld(from, to, { rename: move = rename } = {}) {
  for (let i = 1; ; i++) {
    try {
      return await move(from, to);
    } catch (e) {
      if (!HELD_CODES.has(e?.code) || i >= TRIES) throw e;
      await new Promise((r) => setTimeout(r, waitMs(i)));
    }
  }
}

/** renameHeld for code that must not yield between its steps (a resume file written by two workers, a save
 *  checked and written in one step): the waits block, as the restore's start-up recovery does. */
export function renameHeldSync(from, to, { rename: move = renameSync } = {}) {
  for (let i = 1; ; i++) {
    try {
      return move(from, to);
    } catch (e) {
      if (!HELD_CODES.has(e?.code) || i >= TRIES) throw e;
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, waitMs(i));
    }
  }
}
