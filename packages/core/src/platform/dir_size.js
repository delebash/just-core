// SPDX-License-Identifier: MIT
// The bytes under a folder — its own module, importing nothing but Node and the platform's IS_WIN: the desktop
// shell's Change folder measures the data with it, and disk_api.js (which imports the AI runner lazily) would pull
// the runner into the Electron main's bundle as chunks the build refuses (2026-10-20). disk_api re-exports it.

import { opendir, stat } from "node:fs/promises";
import path from "node:path";
import { IS_WIN } from "./py.js";

// Path equality as pathlib has it: normalized, case-insensitive on Windows.
const pathKey = (p) => {
  const n = path.normalize(String(p)).replace(/[\\/]+$/, "");
  return IS_WIN ? n.toLowerCase() : n;
};

/**
 * Total bytes of the regular files under `p`, recursively. Async (the walk is I/O).
 *
 * Symlinks are skipped (never followed), every stat is guarded, and a missing `p` counts
 * 0 — so a vanishing file, a broken link, or an absent dir never throws. `exclude` is a
 * list of child paths to skip whole (holds the llamacpp `logs/` subdir out of the
 * engine-builds bucket). Shared by the sizes endpoint AND the runner's models-cache
 * reclaim (one walk, one source).
 *
 * `dedupLinks` counts each INODE once, so a file reachable under two names (a hardlink)
 * adds its bytes once — what the disk actually holds. Off by default: it costs a stat per
 * file, and only the HF models cache is known to contain hardlinks.
 */
export async function dirSize(p, exclude = null, dedupLinks = false) {
  const ex = exclude && [...exclude].length ? new Set([...exclude].map(pathKey)) : null;
  return walk(String(p), ex, dedupLinks ? new Set() : null);
}

/** `dirSize`'s recursion. `seen` is null when not deduping, else the (dev, ino) pairs
 * already counted — shared across the whole walk, since the two names for one inode are
 * usually in different directories (`blobs/`, `snapshots/`). */
async function walk(p, exclude, seen) {
  let total = 0;
  let dir;
  try {
    dir = await opendir(p);
  } catch {
    return total; // missing path / not a dir → 0
  }
  try {
    for await (const entry of dir) {
      try {
        if (entry.isSymbolicLink()) continue; // never follow (HF blobs are symlinked from snapshots/)
        const child = path.join(p, entry.name);
        if (exclude?.has(pathKey(child))) continue;
        if (entry.isDirectory()) {
          total += await walk(child, exclude, seen);
        } else if (entry.isFile()) {
          // stat with bigint: the real (dev, ino, nlink) — on Windows too, and an NTFS
          // file index can pass 2^53. (Python had to avoid DirEntry.stat() there: it
          // carries no link data, so st_ino and st_nlink both read 0.)
          const st = await stat(child, { bigint: true });
          if (seen === null) {
            total += Number(st.size);
            continue;
          }
          if (st.nlink > 1n && st.ino) {
            const key = `${st.dev}:${st.ino}`;
            if (seen.has(key)) continue; // same bytes under another name
            seen.add(key);
          }
          total += Number(st.size);
        }
      } catch {
        /* the file vanished mid-walk / perms → skip it */
      }
    }
  } catch {
    /* the listing failed part-way → what was counted */
  }
  return total;
}
