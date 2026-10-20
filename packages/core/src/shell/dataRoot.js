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
import * as dataPaths from "../platform/data_paths.js";

/** Chromium's files (profile, cache, window state) under the data root (decided 2026-10-08). */
export const CHROME_DIR = "electron";
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

// A copy under way in the picked folder: it is ours to clear until the move is whole (a move that died midway).
const MOVING_MARKER = ".moving";
// Files the system makes in a folder the user only looked at: the folder is still empty to them.
const SYSTEM_FILES = new Set([".DS_Store", "Thumbs.db", "desktop.ini"]);

/**
 * Move every file into `newRoot` (the Change-folder verb). The folder picker hands back a folder that already
 * exists, and Windows refuses a rename onto one (EPERM — every Change folder failed there, 2026-10-20): so the
 * picked folder must be empty (a non-empty one is refused in words), and the data is copied into it with the
 * async `fs.promises.cp` (nodejs.org/api/fs.html#fspromisescpsrc-dest-options — the window stays live; cpSync
 * froze it), marked unfinished by a `.moving` file until whole. Then the pointer is committed and only THEN is
 * the old root emptied — a crash before the commit leaves the old root intact and resolvable, and the unfinished
 * copy is cleared by the next try. Any failure removes what was copied. Chromium's own folder is open while the
 * app runs: it isn't copied (it rebuilds), and the old one is deleted at the next start (`sweepOldChromeDir`).
 * Resolves the new root, or null when it equals the old one. `copy` is fs.promises.cp (a test passes one that fails).
 */
export async function relocate({ oldRoot, newRoot, appName, packaged = true, repoRoot, copy = fs.promises.cp }) {
  const target = path.resolve(String(newRoot).trim());
  if (target === path.resolve(oldRoot)) return null;
  const pathProblem = dataPaths.dataDirPathProblem(target);
  if (pathProblem) throw new Error(dataPaths.cantUseDataDir(target, pathProblem));
  const existed = fs.existsSync(target);
  if (existed) {
    if (!fs.statSync(target).isDirectory()) throw new Error(dataPaths.cantUseDataDir(target, "a file has that name"));
    const names = fs.readdirSync(target);
    if (names.includes(MOVING_MARKER)) {
      // a move into it that never finished: its copy is ours
      for (const name of names) await fs.promises.rm(path.join(target, name), { recursive: true, force: true });
    } else if (names.some((n) => !SYSTEM_FILES.has(n))) {
      throw new Error(`The folder ${target} isn't empty — choose an empty folder for the data.`);
    }
  }
  const problem = dataPaths.dataDirProblem(target, { named: false }); // made when missing, then written to
  if (problem) throw new Error(dataPaths.cantUseDataDir(target, problem));
  const before = new Set(fs.readdirSync(target));
  const marker = path.join(target, MOVING_MARKER);
  const chrome = path.join(path.resolve(oldRoot), CHROME_DIR);
  try {
    fs.writeFileSync(marker, path.resolve(oldRoot));
    await copy(oldRoot, target, { recursive: true, filter: (src) => path.resolve(src) !== chrome });
    fs.rmSync(marker, { force: true });
  } catch (e) {
    // nothing of the copy stays: a folder made here goes, a picked one is left as it was
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
  // committed: what can't go now (a file a scanner holds) goes with the whole old root at the next start
  for (const name of fs.readdirSync(oldRoot)) {
    if (name !== CHROME_DIR) await fs.promises.rm(path.join(oldRoot, name), { recursive: true, force: true, maxRetries: 5 }).catch(() => {});
  }
  fs.mkdirSync(path.join(target, CHROME_DIR), { recursive: true });
  fs.writeFileSync(path.join(target, CHROME_DIR, OLD_MARKER), path.resolve(oldRoot));
  return target;
}

/**
 * The start's check of the data root (2026-10-20): why it can't be used, in plain words, or null — before
 * anything lands in it (a missing drive made the shell's first mkdir throw Electron's "JavaScript error"
 * dialog). A root the user named (the variable, the Change-folder pointer) is held to the path rule too.
 */
export function dataRootProblem(root) {
  return dataPaths.dataDirProblem(root, { named: dataPaths.isNamedDataDir(root) });
}

/** "Use the default folder": the Change-folder pointer goes, so the default is used now and at every start
 *  after (the variable, when the user set one, is theirs). Returns the default root. */
export function useDefaultRoot({ appName, repoRoot, packaged }) {
  const sourceRoot = sourceRootOf({ packaged, repoRoot });
  fs.rmSync(dataPaths.pointerFile({ appName, sourceRoot }), { force: true });
  return dataPaths.defaultDataDir({ appName, sourceRoot });
}

/** At start, before Chromium opens anything: delete the old root a move left behind. */
export function sweepOldChromeDir(root) {
  const marker = path.join(root, CHROME_DIR, OLD_MARKER);
  try {
    const old = fs.readFileSync(marker, "utf8").trim();
    if (old && path.resolve(old) !== path.resolve(root)) fs.rmSync(old, { recursive: true, force: true });
    fs.rmSync(marker, { force: true });
  } catch {
    /* nothing to sweep */
  }
}
