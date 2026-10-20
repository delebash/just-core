// SPDX-License-Identifier: MIT
// The desktop shell's side of THE family data-folder ladder. The ladder itself is ONE module,
// `platform/data_paths.js` — the shell and the headless server read the same env variable,
// the same Change-folder pointer and the same default (the kit FINDING "the data-dir ladder's
// four copies disagree" closes here). The policy, in order (the user's 2026-08-14 ruling:
// nothing is stored where the user didn't choose; the default is the install directory):
//   1. the app's data-dir variable (`<APP>_DATA_DIR`);
//   2. the Change-folder pointer `dataroot.txt` (a pointer naming the computed default is
//      residue and is deleted);
//   3. `data/` in the install directory — beside the exe when packaged, the checkout root in
//      development (`<repo>/data`, ruling 6 of 2026-10-05);
//   4. the OS fallback when the install directory is not writable —
//      `%LOCALAPPDATA%\<App>\<App>`, its pointer `%LOCALAPPDATA%\<App>\dataroot.txt` (decided
//      2026-10-08).
// What only the shell does lives here: moving the data (Change folder) and Chromium's own
// folder under the root.

import fs from "node:fs";
import path from "node:path";
import { LOCK_NAME } from "../platform/data_lock.js";
import * as dataPaths from "../platform/data_paths.js";
import { dirSize } from "../platform/dir_size.js";
import { safeTitle } from "../platform/filename.js";

/** Chromium's files (profile, cache, window state) under the data root (decided 2026-10-08). */
export const CHROME_DIR = "electron";
// In the new root's Chromium folder after a move: the old root and what the move took from it, for the next
// start's cleanup (`sweepOldChromeDir`).
const OLD_MARKER = "old-root.txt";

export const isWritable = (dir) => dataPaths._isWritable(dir);

const sourceRootOf = ({ packaged, repoRoot }) => (packaged ? null : repoRoot);

/** Resolve the data root (the ladder above). */
export function resolveDataRoot({ appName, dataDirEnv, repoRoot, packaged, env = process.env }) {
  return dataPaths.resolveDataDir({ appName, envVar: dataDirEnv, sourceRoot: sourceRootOf({ packaged, repoRoot }), env });
}

/** `{root, default, portable}` — the Storage panel's three facts (JustWrite's shape). */
export function storageInfo({ root, appName, repoRoot, packaged }) {
  const sourceRoot = sourceRootOf({ packaged, repoRoot });
  return {
    root,
    default: dataPaths.defaultDataDir({ appName, sourceRoot }),
    portable: dataPaths.isPortable(root, { sourceRoot }),
  };
}

function writePointer(pointer, root) {
  fs.mkdirSync(path.dirname(pointer), { recursive: true });
  const tmp = `${pointer}.tmp`;
  fs.writeFileSync(tmp, root);
  fs.renameSync(tmp, pointer); // atomic: a torn write never strands the app
}

// A copy under way in the app's new folder: the old root's path, so an unfinished one — the app closed midway —
// is known as this old root's and cleared by the next try; any other folder's is never touched.
const MOVING_MARKER = ".moving";
// Files the system makes in a folder the user only looked at: the folder is still empty to them, and they are
// the folder's, not the data's — never copied, never removed.
const SYSTEM_FILES = new Set([".DS_Store", "Thumbs.db", "desktop.ini"]);
// The old root's own that a move doesn't copy — Chromium's folder (open while the app runs; it rebuilds) and the
// server's lock (data_lock.js) — removed with what was copied at the next start.
const NOT_COPIED = new Set([CHROME_DIR, LOCK_NAME]);

/** What a second Change folder is told while one runs (2026-10-20): one move at a time. */
export const MOVE_UNDER_WAY = "The data folder is already being moved — wait for that move to finish.";

// Room the drive keeps beyond the data a move copies — what a restore keeps (data_api.js `UNPACK_MARGIN`).
const MOVE_MARGIN = 256 * 1024 * 1024;

// One move at a time in this process (the shell's main): a second one, started while the first copies, wiped
// the first's copy as an unfinished one (the fourteenth review, 2026-10-20).
let moving = false;

/** Is `child` the folder `parent` or inside it (case-insensitive on Windows — path.relative's own rule)? */
function within(child, parent) {
  const rel = path.relative(parent, child);
  return rel === "" || (!rel.startsWith("..") && !path.isAbsolute(rel));
}

const gb = (n) => (n / 1e9).toFixed(1);

/** The bytes under a top-level entry of the old root (dir_size.js `dirSize` for a folder). */
async function entrySize(p) {
  try {
    const st = await fs.promises.lstat(p);
    return st.isDirectory() ? await dirSize(p) : st.isFile() ? st.size : 0;
  } catch {
    return 0;
  }
}

/**
 * Move the data into a new folder named for the app (`folderName`, the shell's productName, made safe for a
 * folder name — filename.js `safeTitle`) inside `newRoot`, the folder the user picked: the usual practice
 * (an installer's "<Program Files>\<App>"), so the picked folder's own files are never touched (2026-10-20).
 * That app folder must not exist or be empty (a non-empty one is refused in words), the picked folder must be
 * there, and its drive must have room for the data with a margin (fs.promises.statfs —
 * nodejs.org/api/fs.html#fspromisesstatfspath-options). Each top-level entry of the old root is copied with the
 * async `fs.promises.cp` (nodejs.org/api/fs.html#fspromisescpsrc-dest-options — the window stays live; cpSync
 * froze it), `preserveTimestamps` kept (the engines know their files by size and time: without them 12 GB of
 * models were hashed again), marked unfinished by a `.moving` file until whole. Then the pointer is committed
 * and only THEN are the copied entries removed from the old root — a crash before the commit leaves the old
 * root intact and resolvable, and the unfinished copy is cleared by the next try. Any failure removes what was
 * copied. Chromium's own folder is open while the app runs: it isn't copied (it rebuilds); it and anything the
 * old root still holds of what was copied go at the next start (`sweepOldChromeDir`), then the old folder only
 * when nothing else is in it. One move at a time: a second while one runs is refused (`MOVE_UNDER_WAY`).
 * Resolves the new root, or null when it equals the old one. `copy` is fs.promises.cp, `statfs`
 * fs.promises.statfs (a test passes its own).
 */
export async function relocate({ oldRoot, newRoot, appName, folderName = appName, packaged = true, repoRoot, copy = fs.promises.cp, statfs = fs.promises.statfs }) {
  if (moving) throw new Error(MOVE_UNDER_WAY);
  moving = true;
  try {
    return await move({ oldRoot, newRoot, appName, folderName, packaged, repoRoot, copy, statfs });
  } finally {
    moving = false;
  }
}

async function move({ oldRoot, newRoot, appName, folderName, packaged, repoRoot, copy, statfs }) {
  const old = path.resolve(oldRoot);
  const picked = path.resolve(String(newRoot).trim());
  const target = path.join(picked, safeTitle(folderName, appName));
  if (dataPaths.samePath(target, old)) return null;
  const cantHold = (why) => new Error(`The folder ${picked} can't hold the data: ${why}`);
  if (within(picked, old)) throw new Error(`The folder ${picked} is inside the current data folder — choose a folder outside it.`);
  // the picked folder is the user's: it must be there (never made), and its name usable
  const pickedProblem = dataPaths.dataDirPathProblem(picked) || dataPaths.missingDirProblem(picked);
  if (pickedProblem) throw cantHold(pickedProblem);
  const pathProblem = dataPaths.dataDirPathProblem(target);
  if (pathProblem) throw new Error(dataPaths.cantUseDataDir(target, pathProblem));
  const existed = fs.existsSync(target);
  if (existed) {
    if (!fs.statSync(target).isDirectory()) throw new Error(dataPaths.cantUseDataDir(target, "a file has that name"));
    const names = fs.readdirSync(target);
    if (names.includes(MOVING_MARKER) && unfinishedFrom(target, old)) {
      // an earlier move of this old root that never finished: its copy is ours
      for (const name of names) {
        if (!SYSTEM_FILES.has(name)) await fs.promises.rm(path.join(target, name), { recursive: true, force: true });
      }
    } else if (names.some((n) => !SYSTEM_FILES.has(n))) {
      throw new Error(`The folder ${target} already exists and isn't empty — choose another folder for the data.`);
    }
  }
  const entries = fs.readdirSync(old).filter((n) => !NOT_COPIED.has(n) && !SYSTEM_FILES.has(n));
  // room first: the copy is whole before the old root is emptied, so the drive needs all of it
  const size = (await Promise.all(entries.map((n) => entrySize(path.join(old, n))))).reduce((a, b) => a + b, 0);
  let free = Number.POSITIVE_INFINITY;
  try {
    const drive = await statfs(picked);
    free = drive.bavail * drive.bsize;
  } catch {
    // no answer from the drive: the copy's own errors still stand
  }
  if (size + MOVE_MARGIN > free) throw cantHold(`the data needs ${gb(size + MOVE_MARGIN)} GB of room and its drive has ${gb(free)} GB free`);
  const problem = dataPaths.dataDirProblem(target, { named: false }); // the app's own folder: made, then written to
  if (problem) {
    if (!existed) fs.rmSync(target, { recursive: true, force: true });
    throw new Error(dataPaths.cantUseDataDir(target, problem));
  }
  const before = new Set(fs.readdirSync(target));
  const marker = path.join(target, MOVING_MARKER);
  try {
    fs.writeFileSync(marker, old);
    for (const name of entries) await copy(path.join(old, name), path.join(target, name), { recursive: true, preserveTimestamps: true });
    fs.rmSync(marker, { force: true });
  } catch (e) {
    // nothing of the copy stays: a folder made here goes, one that was there is left as it was
    if (existed) {
      for (const name of fs.readdirSync(target)) {
        if (!before.has(name) || name === MOVING_MARKER) await fs.promises.rm(path.join(target, name), { recursive: true, force: true }).catch(() => {});
      }
    } else await fs.promises.rm(target, { recursive: true, force: true }).catch(() => {});
    throw new Error(`copy failed: ${e.message}`);
  }
  try {
    writePointer(dataPaths.pointerFile({ appName, sourceRoot: sourceRootOf({ packaged, repoRoot }) }), target);
  } catch (e) {
    throw new Error(`pointer write failed: ${e.message}`);
  }
  // committed: only what was copied leaves the old root; what can't go now (a file a scanner holds) goes at the
  // next start, with Chromium's folder
  for (const name of entries) await fs.promises.rm(path.join(old, name), { recursive: true, force: true, maxRetries: 5 }).catch(() => {});
  fs.mkdirSync(path.join(target, CHROME_DIR), { recursive: true });
  fs.writeFileSync(path.join(target, CHROME_DIR, OLD_MARKER), JSON.stringify({ root: old, entries: [...entries, ...NOT_COPIED] }));
  return target;
}

/** Is the unfinished copy in `target` this old root's (its `.moving` names it)? */
function unfinishedFrom(target, old) {
  try {
    return dataPaths.samePath(fs.readFileSync(path.join(target, MOVING_MARKER), "utf8").trim(), old);
  } catch {
    return false;
  }
}

// The shell's log lines.
const shellLog = { warn: (s) => console.warn(`[shell] ${s}`) };

/**
 * The start's check of the data root (2026-10-20): why it can't be used, in plain words, or null — before
 * anything lands in it (a missing drive made the shell's first mkdir throw Electron's "JavaScript error"
 * dialog). A root the user named (the variable, the Change-folder pointer) must be there — never made; the
 * variable is held to the path rule too, a pointer only logged (data_paths.js `dataDirStartProblem`).
 */
export function dataRootProblem(root, { log = shellLog } = {}) {
  return dataPaths.dataDirStartProblem(root, { source: dataPaths.dataDirSource(root), log });
}

/** "Use the default folder" (the start's message box, 2026-10-20): the default folder for this start only — the
 *  Change-folder pointer is kept, so the next start looks for the data it names again. Returns the default root. */
export function useDefaultRoot({ appName, repoRoot, packaged }) {
  return dataPaths.defaultDataDir({ appName, sourceRoot: sourceRootOf({ packaged, repoRoot }) });
}

/** A plain name of an entry of a folder (never a path or "..") — what a marker may name for removal. */
const plainName = (n) => typeof n === "string" && n !== "" && n !== "." && n !== ".." && n === path.basename(n) && !/[\\/]/.test(n);

/**
 * At start, before Chromium opens anything: what a move left in the old root goes — only the entries the move
 * copied (and Chromium's folder), then the old folder only when nothing else is in it (2026-10-20: a Windows
 * known folder holding only desktop.ini counted as empty, and the old cleanup deleted it whole). A marker from
 * before 2026-10-20 names the old root alone: its Chromium folder goes, and the folder when empty.
 */
export function sweepOldChromeDir(root) {
  const marker = path.join(root, CHROME_DIR, OLD_MARKER);
  let text;
  try {
    text = fs.readFileSync(marker, "utf8").trim();
  } catch {
    return; // nothing to sweep
  }
  let old = text;
  let entries = [CHROME_DIR];
  try {
    const m = JSON.parse(text);
    if (typeof m?.root === "string") {
      old = m.root;
      entries = Array.isArray(m.entries) ? m.entries : [];
    }
  } catch {
    /* an earlier version's marker: the old root's path alone */
  }
  // never the root in use, nor a folder holding it
  if (old && !within(path.resolve(root), path.resolve(old))) {
    for (const name of entries.filter(plainName)) {
      try {
        fs.rmSync(path.join(old, name), { recursive: true, force: true, maxRetries: 5 });
      } catch {
        /* held still: left */
      }
    }
    try {
      fs.rmdirSync(old); // only when empty: anything else in it is the user's
    } catch {
      /* not empty, or gone */
    }
  }
  fs.rmSync(marker, { force: true });
}
