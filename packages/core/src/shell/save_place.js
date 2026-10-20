// SPDX-License-Identifier: MIT
// A file the desktop shell saves (saveFile, saveFromUrl) is written as `<name>.part` beside its place and moved
// in only when whole — a disk that fills leaves no cut-off file under the chosen name (2026-10-20). Its own
// module (no electron) so a test runs it.

import fs from "node:fs";

/** `part` into `target`. Windows refuses the rename while another program holds the target (a viewer with the
 *  last export open): tried again for a few seconds, then the file is copied over it in place, as a save always
 *  did. `rename` is fs.renameSync (a test passes one that is held). */
export async function placeSaved(part, target, { rename = fs.renameSync, waitMs = 100 } = {}) {
  for (let i = 1; i <= 8; i++) {
    try {
      rename(part, target);
      return;
    } catch (e) {
      if (!["EPERM", "EACCES", "EBUSY"].includes(e?.code)) throw e;
      await new Promise((r) => setTimeout(r, waitMs * i));
    }
  }
  fs.copyFileSync(part, target);
  fs.rmSync(part, { force: true });
}
