// SPDX-License-Identifier: MIT
// The room on a drive, read the one way the kit's checks share: the downloader's "not enough disk space" words, the
// restore's check. Node's fs.statfsSync — bavail × bsize, the bytes this user may still write
// (nodejs.org/api/fs.html#fsstatfssyncpath-options) — read through the module's namespace: the phone's worker bundle
// swaps node:fs for a browser polyfill that has no statfsSync, and esbuild refuses a named import the module lacks
// (JustWrite's phone bundle stopped building on download.js's, 2026-10-27). Read this way the phone gets null, and
// the bundle's one warning — "Import "statfsSync" will always be undefined" — is that, expected.
import * as fs from "node:fs";
import path from "node:path";

/** Free bytes for this user on the drive holding `dir`, asking the nearest folder that exists (an install's own
 *  folder isn't made yet); null when the drive doesn't say. */
export function freeBytes(dir) {
  let d = path.resolve(String(dir));
  for (;;) {
    try {
      const s = fs.statfsSync(d);
      return Number(s.bavail) * Number(s.bsize);
    } catch (e) {
      const up = path.dirname(d);
      if (e?.code !== "ENOENT" || up === d) return null;
      d = up;
    }
  }
}
