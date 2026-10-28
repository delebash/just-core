// SPDX-License-Identifier: MIT
// The room on a drive, read the one way the kit's checks share: the downloader's "not enough disk space" words, the
// restore's check, and — before anything downloads — a kit runtime's engine install and model download (the engines
// plan, K10b: just-house-paint's check, moved into the kit). Node's fs.statfsSync — bavail × bsize, the bytes this
// user may still write (nodejs.org/api/fs.html#fsstatfssyncpath-options) — read through the module's namespace: the
// phone's worker bundle swaps node:fs for a browser polyfill that has no statfsSync, and esbuild refuses a named
// import the module lacks (JustWrite's phone bundle stopped building on download.js's, 2026-10-27). Read this way the
// phone gets null, and the bundle's one warning — "Import "statfsSync" will always be undefined" — is that, expected.
import * as fs from "node:fs";
import path from "node:path";

/** Room a drive keeps beyond what an install puts on it (the database, the logs) — as the restore keeps. */
export const ROOM_MARGIN = 256 * 1024 * 1024;

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

/** The room an unfinished download already takes on the drive: the kit's streamDownload preallocates `<file>.part` at
 *  its full size (fh.truncate) and keeps it for resume. Windows allocates that whole (measured 2026-10-20: a 2 GiB
 *  truncate took 2.000 GiB of free space), so its size; macOS and Linux leave it sparse, so only the blocks written
 *  (stat(2)'s st_blocks, 512-byte units). */
export function partRoom(st, platform = process.platform) {
  return platform === "win32" ? st.size : Math.min(st.size, (st.blocks ?? 0) * 512);
}

/** The bytes a download's own unfinished files already hold — `<file>.part` beside each of `files`, the files it
 *  fetches (never a leftover of another file or build) — they need no more room (a resumed install was refused 507). */
export function partBytes(files, platform = process.platform) {
  let n = 0;
  for (const f of files) {
    const st = fs.statSync(`${f}.part`, { throwIfNoEntry: false });
    if (st?.isFile()) n += partRoom(st, platform);
  }
  return n;
}

/**
 * What putting `bytes` more on the drive of `dir` lacks: null when it fits (or the drive doesn't say — the download's
 * own errors stand), else `{needBytes, freeBytes}` with the margin counted. `files` are the download's destinations
 * (what their `.part` already holds is room it has); `free(dir)` reads the drive (a test's small or full one).
 */
export function lacksRoom({ dir, bytes, files = [], free = freeBytes }) {
  const more = Math.max(0, bytes - partBytes(files));
  if (!more) return null;
  const have = free(dir);
  if (have == null || more + ROOM_MARGIN <= have) return null;
  return { needBytes: more + ROOM_MARGIN, freeBytes: have };
}
