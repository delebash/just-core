// SPDX-License-Identifier: MIT
// Is a file's time the one recorded for it? With a tolerance, as rsync compares (its `--modify-window`: "treat
// timestamps as being equal if they differ by no more than the modify-window value" — rsync(1)), because a copy
// changes a file's time by less than that (2026-10-20, just-house-paint's fifteenth review, measured): Node's
// fs.cp with `preserveTimestamps` sets times to the millisecond while NTFS keeps 100 ns, so 0 of 20 copied files
// read back the time they had (1792495822578.5093 → …579) — and an engine that knows its files by exact size and
// time hashed its 12 GB of models again after every Change folder. FAT and exFAT keep a modified time to 2 s,
// so the window is 2 s: a copy onto them stays known too. The size and a hash taken once stay the real checks.

/** The tolerance a recorded file time is compared with: FAT's 2-second resolution. */
export const MTIME_WINDOW_MS = 2000;

/** Are two file times (ms, as `stat().mtimeMs` gives them) the same within MTIME_WINDOW_MS? */
export function sameFileTime(a, b, windowMs = MTIME_WINDOW_MS) {
  const x = Number(a);
  const y = Number(b);
  return Number.isFinite(x) && Number.isFinite(y) && Math.abs(x - y) <= windowMs;
}
