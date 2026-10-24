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
// What only the shell does lives here: moving the data (Change folder), the old copy a move leaves
// (Settings → Storage shows it and removes it when asked), and Chromium's own folder under the root.
//
// Change folder, its third round (2026-10-20, just-house-paint's fifteenth review — made simpler, not patched
// again): the old folder is never removed by the app on its own. A move copies, checks the copy (each file's size,
// flushed to the drive — fsync), commits the pointer (written, flushed, renamed into place with the kit's retrying
// rename) and switches; the old folder stays as it was, and Storage offers to remove the old copy — only what the
// move copied, never the folder the app runs on. No cleanup at the next start, so no race with a start on the old
// folder (the data-dir variable, "Use the default folder") deleting new work, and nothing half-removed by a kill.

import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { Worker } from "node:worker_threads";
import { dataFolderHeld, LOCK_NAME } from "../platform/data_lock.js";
import * as dataPaths from "../platform/data_paths.js";
import { dirSize } from "../platform/dir_size.js";
import { MTIME_WINDOW_MS } from "../platform/file_time.js";
import { safeTitle } from "../platform/filename.js";
import { renameHeldSync } from "../platform/rename_held.js";

/** Chromium's files (profile, cache, window state) under the data root (decided 2026-10-08). */
export const CHROME_DIR = "electron";
// In the new root's Chromium folder after a move: the old copies it left — `{copies: [{root, entries}]}`, the
// old folders and the names the moves copied from them (what "Remove the old copy" may remove).
const OLD_MARKER = "old-root.txt";
// In the old root's Chromium folder while a move copies: `{target, pid}` — where a half copy may be, and the process
// copying it, for the next start.
const MOVING_RECORD = "moving-to.json";
// In the new root's Chromium folder after a move: the window's access token, read and removed at the relaunch.
const CARRIED = "carried.json";
// In the old root's Chromium folder after a move: `{root, movedAt}` — where its data went (removed with the old copy).
const MOVED_TO = "moved-to.json";

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

/** The name of the folder Change folder makes for the data inside the one picked: the shell's productName, made
 *  safe for a folder name (filename.js `safeTitle`). */
export const appFolderName = (folderName, appName) => safeTitle(folderName, appName);

// POSIX: a directory's own entries (a rename into it, a file made in it) are durable only once it is flushed too
// (fsync(2)); Windows can't open a directory as a file and NTFS journals its entries.
function syncDir(dir) {
  if (process.platform === "win32") return;
  try {
    const fd = fs.openSync(dir, "r");
    try {
      fs.fsyncSync(fd);
    } finally {
      fs.closeSync(fd);
    }
  } catch {
    /* a file system that can't (some network shares): the rename still stands */
  }
}

/** The pointer, committed: written beside its place and flushed, renamed into place (retried while a scanner holds
 *  it — rename_held.js), its folder flushed. A torn write never strands the app. */
function writePointer(pointer, root) {
  fs.mkdirSync(path.dirname(pointer), { recursive: true });
  const tmp = `${pointer}.tmp`;
  try {
    const fd = fs.openSync(tmp, "w");
    try {
      fs.writeSync(fd, root);
      fs.fsyncSync(fd);
    } finally {
      fs.closeSync(fd);
    }
    renameHeldSync(tmp, pointer);
  } catch (e) {
    fs.rmSync(tmp, { force: true });
    throw e;
  }
  syncDir(path.dirname(pointer));
}

// A copy under way in the app's new folder: `{root, entries, made}` — the old root it copies, the names it copies
// and whether the move made the folder — so an unfinished one is known as this old root's and cleared (by the next
// try, or the next start); any other folder's is never touched.
const MOVING_MARKER = ".moving";
// Files the system makes in a folder the user only looked at: the folder is still empty to them, and they are
// the folder's, not the data's — never copied, never removed.
const SYSTEM_FILES = new Set([".DS_Store", "Thumbs.db", "desktop.ini"]);
// The old root's own that a move doesn't copy — Chromium's folder (open while the app runs; it rebuilds) and the
// server's lock (data_lock.js) — removed with what was copied when the user removes the old copy.
const NOT_COPIED = new Set([CHROME_DIR, LOCK_NAME]);
// Never copied either: a marker of a move, the start checks' probes of a moment.
const notCopied = (n) => NOT_COPIED.has(n) || SYSTEM_FILES.has(n) || n === MOVING_MARKER || /^\.(write|lock-time)-probe-/.test(n);

/** What a second Change folder is told while one runs (2026-10-20): one move at a time. */
export const MOVE_UNDER_WAY = "The data folder is already being moved — wait for that move to finish.";

// Room the drive keeps beyond the data a move copies — what a restore keeps (data_api.js `UNPACK_MARGIN`).
const MOVE_MARGIN = 256 * 1024 * 1024;

// One move at a time in this process (the shell's main): a second one, started while the first copies, wiped
// the first's copy as an unfinished one (the fourteenth review, 2026-10-20).
let moving = false;

/** `p` absolute with the links of the part that exists resolved (pathlib's `resolve(strict=False)`): two spellings
 *  of one folder — a junction, macOS's /var → /private/var — compare equal. */
function realish(p) {
  let head = path.resolve(String(p));
  const tail = [];
  for (;;) {
    try {
      return path.join(fs.realpathSync.native(head), ...tail.reverse());
    } catch {
      const up = path.dirname(head);
      if (up === head) return path.resolve(String(p));
      tail.push(path.basename(head));
      head = up;
    }
  }
}

/** Is `child` the folder `parent` or inside it (case-insensitive on Windows — path.relative's own rule; links
 *  resolved)? */
function within(child, parent) {
  const rel = path.relative(realish(parent), realish(child));
  return rel === "" || (!rel.startsWith("..") && !path.isAbsolute(rel));
}

/** The same folder, links resolved (data_paths.js samePath on the real paths). */
const sameFolder = (a, b) => dataPaths.samePath(realish(a), realish(b));

/**
 * The words Change folder and Move back are refused with while a start runs on the default folder this time or on an
 * old copy (2026-10-20, the sixteenth review; the seventeenth's words for a folder that is connected): the data is in
 * `folder` — the data-dir variable `setBy` names this old copy: change it there; the folder is `connected` (it passes
 * the start's check): a restart takes the app to it; there but refused by that check: its `problem`; else connect it
 * and restart, or (no variable) forget it.
 */
export function dataIsElsewhere({ folder, connected = false, problem = null, setBy = null, oldCopy = false }) {
  if (setBy && oldCopy) return `${setBy} names this old copy — change it to ${folder}.`;
  if (connected) return `Your data is in ${folder} — restart the app to use it.`;
  // there, but the start's check refuses it (the eighteenth review: "restart" was said for a folder that can't be used)
  if (problem) return `Your data is in ${folder}, which can't be used now: ${problem}.`;
  return `Your data is in ${folder}: connect it and restart${setBy ? "" : ", or Use the default folder from now on"}.`;
}

/** The words Change folder is refused with while the data-dir variable names the folder (2026-10-20). */
export const setByVariable = (name) => `This data folder is set by ${name} — change it there.`;

/**
 * The app's data-dir variable, when it names the data folder — then a Change-folder pointer would be ignored at the
 * next start (the ladder's first rule wins), so Storage's Change folder, Move back and "Use the default folder from
 * now on" are off and the shell refuses them (2026-10-20). Its name, or null. The desktop shell knows only the
 * variable: `--data-dir` is the headless server's, whose browser page never offers Change folder.
 */
export function dataDirSetBy({ dataDirEnv, env = process.env }) {
  return dataDirEnv && String(env[dataDirEnv] || "").trim() ? dataDirEnv : null;
}

const gb = (n) => (n / 1e9).toFixed(1);

/** The bytes under a top-level entry of a folder (dir_size.js `dirSize` for a folder). */
async function entrySize(p) {
  try {
    const st = await fs.promises.lstat(p);
    return st.isDirectory() ? await dirSize(p) : st.isFile() ? st.size : 0;
  } catch {
    return 0;
  }
}

/** The folder nearest `p` that exists (the drive's free space is asked there). */
function nearestExisting(p) {
  let d = path.resolve(p);
  while (!fs.existsSync(d) && path.dirname(d) !== d) d = path.dirname(d);
  return d;
}

/**
 * The app's own folder — replaced whole by an update and removed by an uninstall: the install folder, a Mac app's
 * bundle (`<App>.app`, not only its Contents/MacOS), an AppImage's folder. Null when it can't be known.
 */
export function appHome({ packaged = true, repoRoot } = {}) {
  const base = dataPaths.installDir(sourceRootOf({ packaged, repoRoot }));
  if (base == null) return null;
  const bundle = /^(.*\.app)[\\/]Contents[\\/]MacOS[\\/]?$/.exec(base);
  return bundle ? bundle[1] : base;
}

/**
 * Move the data into a new folder named for the app (`folderName`, the shell's productName — appFolderName) inside
 * `newRoot`, the folder the user picked: the usual practice (an installer's "<Program Files>\<App>"), so the picked
 * folder's own files are never touched (2026-10-20). Picking the default folder itself moves the data back there
 * (Storage's "Move back to the default folder"; its pointer is removed — the default needs none). Refused in words:
 * a folder inside the data folder in use; a folder in the app's own folder (`appHome` — Microsoft: an app's data
 * never in its program folder; an update or uninstall replaces it), the default excepted; an app folder there that
 * isn't empty (naming the old copy, when it is that); a drive without room for the data and a margin
 * (fs.promises.statfs); the path rule. Each top-level entry of the old root is copied with the async
 * `fs.promises.cp` (nodejs.org/api/fs.html#fspromisescpsrc-dest-options — the window stays live; cpSync froze it),
 * `preserveTimestamps` (to the millisecond — the engines compare with a tolerance, file_time.js) and
 * `verbatimSymlinks` (a relative link — the model cache's snapshots, an engine's libraries — stays relative, never
 * pointed back into the old folder; one whose absolute target is inside the data pointed into the copy; on Windows
 * without the right to make symbolic links a folder's link is made again as a junction, a file's refused in words),
 * marked unfinished by a `.moving` file. Then the copy is checked — every file its source's size, flushed to the
 * drive (fsync) —, the new root's records written (the old copies with their volumes, the token), and the pointer
 * committed (writePointer) — the commit, by which alone a move is judged done (`committedInto`). A failure anywhere
 * before the commit removes what was copied (the token's file first) and is said in words (fsProblem — "EFBIG": a
 * FAT32 drive's 4 GB limit; what couldn't be removed named);
 * the old root is left as it was. Nothing is ever removed from the old root: the new root's Chromium folder
 * records it as an old copy (`oldCopies`, `removeOldCopy`). `token` (the window's access token, which lives in the
 * old root's Chromium profile) is left for the relaunch (`takeCarried`). One move at a time: a second while one
 * runs is refused (`MOVE_UNDER_WAY`). Resolves the new root, or null when it equals the old one. `copy` is
 * fs.promises.cp, `statfs` fs.promises.statfs (a test passes its own).
 */
export async function relocate({
  oldRoot,
  newRoot,
  appName,
  folderName = appName,
  packaged = true,
  repoRoot,
  token = null,
  copy = fs.promises.cp,
  statfs = fs.promises.statfs,
  canSymlink = canMakeSymlink,
  linkKinds = windowsLinkKinds,
}) {
  if (moving) throw new Error(MOVE_UNDER_WAY);
  moving = true;
  try {
    return await move({ oldRoot, newRoot, appName, folderName, packaged, repoRoot, token, copy, statfs, canSymlink, linkKinds });
  } finally {
    moving = false;
  }
}

/** Where a move to `newRoot` puts the data: the default folder itself, or `<newRoot>/<appFolderName>`. */
export function moveTarget({ newRoot, appName, folderName = appName, packaged = true, repoRoot }) {
  const picked = path.resolve(String(newRoot).trim());
  const def = path.resolve(dataPaths.defaultDataDir({ appName, sourceRoot: sourceRootOf({ packaged, repoRoot }) }));
  return sameFolder(picked, def) ? def : path.join(picked, appFolderName(folderName, appName));
}

async function move({ oldRoot, newRoot, appName, folderName, packaged, repoRoot, token, copy, statfs, canSymlink, linkKinds }) {
  const old = path.resolve(oldRoot);
  const picked = path.resolve(String(newRoot).trim());
  const sourceRoot = sourceRootOf({ packaged, repoRoot });
  const target = moveTarget({ newRoot, appName, folderName, packaged, repoRoot });
  const toDefault = sameFolder(target, dataPaths.defaultDataDir({ appName, sourceRoot }));
  if (sameFolder(target, old)) return null;
  const cantHold = (why) => new Error(`The folder ${picked} can't hold the data: ${why}`);
  if (within(picked, old)) throw new Error(`The folder ${picked} is inside the current data folder — choose a folder outside it.`);
  const home = appHome({ packaged, repoRoot });
  if (!toDefault && home && within(target, home)) {
    throw new Error(`The folder ${picked} is in the app's own folder (${home}), which an update or an uninstall replaces — choose a folder outside it.`);
  }
  if (!toDefault) {
    // the picked folder is the user's: it must be there (never made), and its name usable; the default is the app's
    // own place (made when missing, never refused for its path)
    const pickedProblem = dataPaths.dataDirPathProblem(picked) || dataPaths.missingDirProblem(picked);
    if (pickedProblem) throw cantHold(pickedProblem);
    const pathProblem = dataPaths.dataDirPathProblem(target);
    if (pathProblem) throw new Error(dataPaths.cantUseDataDir(target, pathProblem));
  }
  const existed = fs.existsSync(target);
  let made = !existed;
  if (existed) {
    if (!fs.statSync(target).isDirectory()) throw new Error(dataPaths.cantUseDataDir(target, "a file has that name"));
    const unfinished = readMoving(target);
    if (unfinished && sameFolder(unfinished.root, old) && !committedInto(target, { appName, sourceRoot })) {
      // an earlier move of this old root that never finished: its copy is ours
      await clearUnfinished(target, unfinished);
      made = unfinished.made === true;
    } else if (fs.readdirSync(target).some((n) => !SYSTEM_FILES.has(n) && n !== CHROME_DIR)) {
      // (Chromium's own folder isn't data: a start on this folder left its profile — "Use the default folder" — and
      // the move never copies one; it is kept, the move's records written into it)
      if (oldCopies(old).some((c) => sameFolder(c.root, target))) {
        throw new Error(`The old copy of the data is still in ${target} — remove it first (Remove the old copy), then move the data there.`);
      }
      throw new Error(`The folder ${target} already exists and isn't empty — choose another folder for the data.`);
    }
  }
  const entries = fs.readdirSync(old).filter((n) => !notCopied(n));
  // a link in the data folder (a models folder kept on another drive, the model cache's snapshots): Windows makes a
  // symbolic link only with the right to (Developer Mode, an administrator) — a junction needs none (2026-10-20, the
  // sixteenth review: a junction failed every move "the app isn't allowed to write there"). So, on Windows, with
  // links there, this process is asked once whether it can make one (a probe link in the picked folder): it can —
  // every link is made again as the kind it was (a relative one stays relative, as off Windows; a junction a
  // junction); it can't — a folder's link is made again as a junction, and a file's link is refused, named, before
  // anything is copied (the dry run 39428267423: an administrator's runner holds file links in a model cache). Off
  // Windows every link is copied as it is — and, everywhere, one whose absolute target is inside the data folder is
  // pointed at the same place in the copy (it would point into the old copy otherwise — the seventeenth review).
  const win = process.platform === "win32";
  const links = await findLinks(old, entries);
  const canLink = win && links.length ? await canSymlink(nearestExisting(target)) : !win;
  const fileLinks = links.filter((l) => !l.dir);
  if (fileLinks.length && !canLink) {
    const named = fileLinks.slice(0, 3).map((l) => l.rel).join(", ");
    throw new Error(
      `The data folder holds a link to a file (${named}${fileLinks.length > 3 ? ` and ${fileLinks.length - 3} more` : ""}), which Windows lets the app make again only with Developer Mode on — replace it with the file itself, or move it out of the data folder.`,
    );
  }
  // the links this move makes itself, as junctions: every folder link without the right; with it, the junctions
  // (fs.cp would make a junction again as a symbolic link) — the rest fs.cp copies as they are (verbatimSymlinks)
  const folderLinks = win ? links.filter((l) => l.dir) : [];
  const kinds = win && canLink && folderLinks.length ? await linkKinds(folderLinks.map((l) => l.src)) : null;
  const asJunctions = folderLinks.filter((l, i) => !canLink || (kinds?.[i] ?? (l.relative ? "SymbolicLink" : "Junction")) === "Junction");
  // a symbolic link fs.cp copies as it is, but whose absolute target is inside the data: pointed into the copy
  // and a relative one pointing OUTSIDE the data: to its absolute target (it would dangle in the copy otherwise)
  const repoint = links.filter((l) => !asJunctions.includes(l) && l.target && (l.relative ? !within(l.target, old) : within(l.target, old)));
  // room first: the old root stays, so the drive needs all of it
  const size = (await Promise.all(entries.map((n) => entrySize(path.join(old, n))))).reduce((a, b) => a + b, 0);
  let free = Number.POSITIVE_INFINITY;
  try {
    const drive = await statfs(nearestExisting(target));
    free = drive.bavail * drive.bsize;
  } catch {
    // no answer from the drive: the copy's own errors still stand
  }
  if (size + MOVE_MARGIN > free) throw cantHold(`the data needs ${gb(size + MOVE_MARGIN)} GB of room and its drive has ${gb(free)} GB free`);
  const problem = dataPaths.dataDirProblem(target, { named: false }); // the app's own folder: made, then written to
  if (problem) {
    if (made) await fs.promises.rm(target, TREE).catch(() => {});
    throw new Error(dataPaths.cantUseDataDir(target, problem));
  }
  const marker = path.join(target, MOVING_MARKER);
  const record = path.join(old, CHROME_DIR, MOVING_RECORD);
  const chromeThere = fs.existsSync(path.join(target, CHROME_DIR));
  // what this move made in the target: the token's file first (never left in plain text), the copied entries, its
  // marker, and the Chromium folder it records the old copy in before the commit — what can't go is said
  const undo = async () => {
    const left = [];
    await fs.promises.rm(path.join(target, CHROME_DIR, CARRIED), { force: true, maxRetries: 5 }).catch(() => left.push(`${CHROME_DIR}/${CARRIED}`));
    // Chromium's folder: the one this move made goes; one a start on this folder left keeps its profile
    if (chromeThere) for (const f of [OLD_MARKER, CARRIED]) fs.rmSync(path.join(target, CHROME_DIR, f), { force: true });
    left.push(...(await removeEntries(target, [...entries, MOVING_MARKER, ...(chromeThere ? [] : [CHROME_DIR])])));
    if (made && !left.length) await fs.promises.rm(target, TREE).catch(() => {});
    fs.rmSync(record, { force: true });
    fs.rmSync(movedTo, { force: true });
    return left.length ? ` (${left.join(", ")} couldn't be removed from ${target} — a program may be holding a file in it)` : "";
  };
  const movedAt = Date.now();
  // this move's own id, in both of its records — the new root's record of the old copy and the old root's moved-to:
  // the old copy is known by it alone (2026-10-20, the eighteenth review — a volume's number isn't stable off Windows,
  // and two moves in a row stranded the first old copy)
  const moveId = randomUUID();
  const movedTo = path.join(old, CHROME_DIR, MOVED_TO);
  try {
    writeMarker(marker, { root: old, entries, made, moveId });
    // where the half copy is, should the app stop midway: the next start on the old root clears it (the app's
    // single-instance lock keeps a second launch from looking while this one copies) — the half copy known by the
    // move's id, in its marker too (another stick in the target's drive letter is never taken for it)
    fs.mkdirSync(path.dirname(record), { recursive: true });
    fs.writeFileSync(record, JSON.stringify({ target, moveId }));
    const skip = new Set(asJunctions.map((l) => pathKey(l.src)));
    const options = { recursive: true, preserveTimestamps: true, verbatimSymlinks: true, ...(skip.size ? { filter: (src) => !skip.has(pathKey(src)) } : {}) };
    for (const name of entries) await copy(path.join(old, name), path.join(target, name), options);
    for (const l of asJunctions) makeJunction(l, old, target);
    for (const l of repoint) repointLink(l, old, target);
    for (const name of entries) await checkCopy(path.join(old, name), path.join(target, name), name);
    // the records, before the commit (a stop after the commit finds them there; an undo removes them): the new root's
    // old copies — this one and those an earlier move left, each with its move's time and id —, the window's token
    // for the relaunch, and the old root's record of where its data goes (written last before the commit: nothing
    // after the commit may throw)
    fs.mkdirSync(path.join(target, CHROME_DIR), { recursive: true });
    const copies = [];
    // (looked at in time: an earlier copy may be on an offline share — a synchronous look held the main process 21 s)
    for (const c of [{ root: old, entries: [...entries, ...NOT_COPIED], movedAt, moveId }, ...oldCopies(old)]) {
      if ((await withinAsync(target, c.root)) || (await withinAsync(c.root, target))) continue;
      let dup = false;
      for (const x of copies) if (!dup && (await sameFolderAsync(x.root, c.root))) dup = true;
      if (!dup) copies.push(c);
    }
    writeOldCopies(target, copies);
    if (token) fs.writeFileSync(path.join(target, CHROME_DIR, CARRIED), JSON.stringify({ token: String(token) }));
    syncDir(target);
    fs.writeFileSync(movedTo, JSON.stringify({ root: target, movedAt, moveId }));
  } catch (e) {
    const left = await undo();
    throw new Error(`The data couldn't be copied to ${target}: ${dataPaths.fsProblem(e)} — it stays in ${old}.${left}`);
  }
  // the commit: the pointer (to the default: no pointer). Whether a move committed is judged by it alone
  // (`committedInto`) — a stop just before it leaves a half copy that is swept, just after it a move that is done
  const pointer = dataPaths.pointerFile({ appName, sourceRoot });
  try {
    if (toDefault) fs.rmSync(pointer, { force: true, maxRetries: 5 });
    else writePointer(pointer, target);
  } catch (e) {
    const left = await undo();
    throw new Error(`The move couldn't be finished — ${pointer} couldn't be written (${dataPaths.fsProblem(e)}). The data stays in ${old}.${left}`);
  }
  // committed: the new root is the data folder. The old root stays as it was — an old copy, removed when the user
  // asks, its moved-to saying where its data went. Nothing from here may throw: what is left is tidying.
  for (const f of [marker, record]) {
    try {
      fs.rmSync(f, { force: true });
    } catch {
      /* a stray marker goes at the next start on the new root */
    }
  }
  // the old copies an earlier move left say the data is in the new root now (a chain of moves is accepted anyway)
  await Promise.resolve()
    .then(() => repointCarried(carriedCopies(target, old), target, old))
    .catch(() => {});
  return target;
}

/** The old copies carried into `target`'s record from `old`'s: their moved-to.json pointed at `target` (each looked at
 *  in time; one that isn't there keeps its record, a chain read through). A record of an earlier version (no move id —
 *  the fifteenth to seventeenth builds) is re-pointed when its moved-to names the old root (the nineteenth review: one
 *  move stranded it). */
function carriedCopies(target, old) {
  return oldCopies(target).filter((c) => !dataPaths.samePath(c.root, old));
}
async function repointCarried(list, target, old) {
  for (const c of list) {
    const file = path.join(c.root, CHROME_DIR, MOVED_TO);
    const m = await readJson(file);
    if (!m) continue;
    const ours = c.moveId ? m.moveId === c.moveId : !m.moveId && typeof m.root === "string" && dataPaths.samePath(path.resolve(m.root), path.resolve(old));
    if (!ours) continue;
    await inTime(fs.promises.writeFile(file, JSON.stringify({ ...m, root: target }))).catch(() => {});
  }
}

// fs.promises.rm's options for a folder and everything in it. Never fs.rmSync recursive: Node 24's follows an NTFS
// junction and empties the folder it points to (measured 2026-10-20, Node 24.21 — the sixteenth review); the async
// one removes the link alone.
const TREE = { recursive: true, force: true, maxRetries: 5 };

/** A path as a key: resolved, case-insensitive on Windows. */
const pathKey = (p) => (process.platform === "win32" ? path.resolve(p).toLowerCase() : path.resolve(p));

/** The `.moving` marker written whole (written beside, renamed into place). */
function writeMarker(marker, m) {
  fs.writeFileSync(`${marker}.tmp`, JSON.stringify(m));
  renameHeldSync(`${marker}.tmp`, marker);
}

/** Every link under the old root's `entries` (Windows: symbolic links and junctions alike): `{src, rel, target, dir}`
 *  — `target` absolute (a relative one resolved beside the link), `dir` when it is (or was) a folder's. */
async function findLinks(old, entries) {
  const out = [];
  const walk = async (p, rel) => {
    let st;
    try {
      st = await fs.promises.lstat(p);
    } catch {
      return;
    }
    if (st.isSymbolicLink()) {
      let to = "";
      try {
        to = await fs.promises.readlink(p);
      } catch {
        /* unreadable: said as a file's */
      }
      const target = to ? path.resolve(path.dirname(p), to) : "";
      let dir = !!to;
      try {
        dir = (await fs.promises.stat(p)).isDirectory();
      } catch {
        // dangling: a junction (always a folder's) reads back absolute — made again as one
      }
      out.push({ src: p, rel, target, dir: !!to && dir, relative: !!to && !path.isAbsolute(to) });
      return;
    }
    if (!st.isDirectory()) return;
    for (const name of await fs.promises.readdir(p)) await walk(path.join(p, name), `${rel}/${name}`);
  };
  for (const name of entries) await walk(path.join(old, name), name);
  return out;
}

/** Can this process make a symbolic link on Windows (Developer Mode, an administrator)? Asked once, by making one in
 *  `dir` (the picked folder) and removing it: EPERM is no; another error (a folder it can't write to) is the copy's
 *  own to say, so yes. A test passes its own (`relocate`'s `canSymlink`). */
export async function canMakeSymlink(dir) {
  const probe = path.join(dir, `.symlink-probe-${process.pid}`);
  try {
    await fs.promises.symlink("symlink-probe-target", probe, "file");
    return true;
  } catch (e) {
    return e?.code !== "EPERM";
  } finally {
    await fs.promises.rm(probe, { force: true }).catch(() => {});
  }
}

/**
 * Which kind each Windows folder link is — "Junction" or "SymbolicLink" (PowerShell's FileSystemInfo.LinkType; Node
 * reads both as a symbolic link and can't tell them apart) — so a move with the right to make links makes each again
 * as the kind it was. One PowerShell for all of them; null when it can't answer (each then decided by its target: a
 * relative one is a symbolic link, an absolute one made a junction — which every folder link works as). A test passes
 * its own (`relocate`'s `linkKinds`).
 */
export function windowsLinkKinds(paths) {
  const script = "$p = [Console]::In.ReadToEnd() | ConvertFrom-Json; ConvertTo-Json -Compress -InputObject @(foreach ($x in @($p)) { [string](Get-Item -LiteralPath $x -Force).LinkType })";
  return new Promise((resolve) => {
    let out = "";
    let child;
    try {
      child = spawn("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", script], { windowsHide: true, stdio: ["pipe", "pipe", "ignore"] });
    } catch {
      return resolve(null);
    }
    const timer = setTimeout(() => child.kill(), 20_000);
    child.on("error", () => resolve(null));
    child.stdout.on("data", (d) => {
      out += d;
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      try {
        const kinds = JSON.parse(out);
        resolve(code === 0 && Array.isArray(kinds) && kinds.length === paths.length ? kinds : null);
      } catch {
        resolve(null);
      }
    });
    child.stdin.end(JSON.stringify(paths));
  });
}

/** A folder link of the old root made again in the new one as a junction (Windows' own folder link — no symbolic
 *  link right needed): to the same folder, or — when it pointed inside the data — to the same place in the copy. */
function makeJunction(link, old, target) {
  const dest = path.join(target, path.relative(old, link.src));
  const to = within(link.target, old) ? path.join(target, path.relative(realish(old), realish(link.target))) : link.target;
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.symlinkSync(to, dest, "junction");
}

/** The copy of `src` at `dst` is whole: every file its source's size, flushed to the drive (fsync); a folder's
 *  entries flushed too (POSIX). Links are copied as they are and not followed. */
async function checkCopy(src, dst, name) {
  const st = await fs.promises.lstat(dst);
  if (st.isSymbolicLink()) return;
  if (st.isDirectory()) {
    for (const e of await fs.promises.readdir(dst)) await checkCopy(path.join(src, e), path.join(dst, e), `${name}/${e}`);
    syncDir(dst);
    return;
  }
  if (!st.isFile()) return;
  const from = await fs.promises.lstat(src);
  if (from.size !== st.size) throw new Error(`the copy of ${name} came out incomplete (${st.size} of ${from.size} bytes)`);
  let fh;
  try {
    fh = await fs.promises.open(dst, "r+");
  } catch {
    // a read-only file: flushed through a read handle where the system allows it (POSIX; Windows refuses)
    fh = await fs.promises.open(dst, "r");
  }
  try {
    await fh.sync();
  } catch (e) {
    if (process.platform !== "win32" || !["EPERM", "EACCES"].includes(e?.code)) throw e;
  } finally {
    await fh.close();
  }
}

/** Remove the plain `names` from `dir` (fs.promises.rm with Node's own retries — a link goes, never what it points
 *  to); what can't go is returned. */
async function removeEntries(dir, names) {
  const left = [];
  for (const name of names.filter(plainName)) {
    try {
      await fs.promises.rm(path.join(dir, name), TREE);
    } catch {
      left.push(name);
    }
  }
  return left;
}

/** A symbolic link fs.cp copied as it is, pointed where it must point from the copy: one whose absolute target was
 *  inside the data at the same place in the copy, a relative one pointing outside the data at its absolute target
 *  (either would point into the old copy, or dangle, otherwise). */
function repointLink(link, old, target) {
  const dest = path.join(target, path.relative(old, link.src));
  const to = link.relative ? link.target : path.join(target, path.relative(realish(old), realish(link.target)));
  fs.rmSync(dest, { force: true });
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.symlinkSync(to, dest, process.platform === "win32" ? (link.dir ? "dir" : "file") : undefined);
}

/** The `.moving` marker in `target`: `{root, entries, made}`, an earlier version's (the old root's path alone:
 *  `entries` null), or null. */
function readMoving(target) {
  let text;
  try {
    text = fs.readFileSync(path.join(target, MOVING_MARKER), "utf8").trim();
  } catch {
    return null;
  }
  try {
    const m = JSON.parse(text);
    if (typeof m?.root === "string") {
      return { root: m.root, entries: Array.isArray(m.entries) ? m.entries : null, made: m.made === true, moveId: typeof m.moveId === "string" && m.moveId ? m.moveId : null };
    }
  } catch {
    /* an earlier version's marker */
  }
  return text ? { root: text, entries: null, made: false, moveId: null } : null;
}

/** An unfinished copy in `target` goes: the names its marker lists (an earlier version's marker: all but the
 *  system's files) and the records the move wrote in its Chromium folder, then the marker. */
async function clearUnfinished(target, m) {
  const names = m.entries ? [...m.entries, CHROME_DIR] : fs.readdirSync(target).filter((n) => !SYSTEM_FILES.has(n));
  await removeEntries(target, [...names, MOVING_MARKER]);
}

/** A plain name of an entry of a folder (never a path or "..") — what a marker may name for removal. */
const plainName = (n) => typeof n === "string" && n !== "" && n !== "." && n !== ".." && n === path.basename(n) && !/[\\/]/.test(n);

/**
 * Did a move into `target` commit? Judged by the pointer alone (2026-10-20, the seventeenth review — a flag in the
 * marker read a copy the pointer never named as done): the pointer names `target`, or there is none and `target` is
 * the default folder (a move back there removes the pointer).
 */
function committedInto(target, { appName, sourceRoot }) {
  const named = pointerNamed({ appName, sourceRoot });
  return named ? sameFolder(named, target) : sameFolder(target, dataPaths.defaultDataDir({ appName, sourceRoot }));
}
/** The folder the Change-folder pointer names, or null (the pointer is beside the app: a local read). */
function pointerNamed({ appName, sourceRoot }) {
  try {
    return fs.readFileSync(dataPaths.pointerFile({ appName, sourceRoot }), "utf8").trim() || null;
  } catch {
    return null;
  }
}
/** committedInto for the start's sweep: the folders looked at asynchronously, in time — the pointer or a marker may
 *  name an offline share (the nineteenth review's s4: realpathSync there held the main process 21 s). */
async function committedIntoAsync(target, { appName, sourceRoot }) {
  const named = pointerNamed({ appName, sourceRoot });
  return named ? sameFolderAsync(named, target) : sameFolderAsync(target, dataPaths.defaultDataDir({ appName, sourceRoot }));
}

/** How a folder is looked at (a test's slow drives replace it — as data_paths.js's `runtime`). */
export const volume = { stat: (p) => fs.promises.stat(p), realpath: (p) => fs.promises.realpath(p) };

// How long a look at a folder that may be on a drive that isn't there may take: an offline share held the main
// process 21 s in existsSync (the seventeenth review, measured) — asked asynchronously, given up after this.
const LOOK_MS = 3000;
// A path found not answering isn't looked at again this long — the path, not its drive (the nineteenth review: a share
// reached through a junction on C: made every copy on C: "not found") — and a drive has one look of the system's at a
// time, until the system answers it: a look given up on still holds one of Node's four file threads (~21 s for an
// offline share) — four of them filled the pool and a local read waited 14.5 s (the eighteenth review, measured). A
// look that finds its drive still busy with one waits its own time, then is said as not answering — never started.
// So at most one thread per drive that doesn't answer, never the pool.
const UNREACHABLE_MS = 60_000;
const SLOW = Symbol("slow");
const unreachable = new Map(); // a path's key → until when it isn't looked at
const inFlight = new Map(); // a look's kind and path → that look under way
const driveBusy = new Map(); // a drive's key → the system's look on it, until the system answers

/** `promise`, or SLOW past LOOK_MS (the look itself goes on in the background and is dropped). */
async function inTime(promise, ms = LOOK_MS) {
  let t;
  try {
    return await Promise.race([promise, new Promise((r) => (t = setTimeout(() => r(SLOW), ms)))]);
  } finally {
    clearTimeout(t);
  }
}

/** The drive `p` is on, as far as a path tells: on Windows its root (a letter, or a share's \\server\share\); else
 *  its first three names (/Volumes/NAS/…, /mnt/nas/…, /media/<user>/<stick>) — a POSIX path's root is "/" for every
 *  disk, and an NFS mount that hangs must not stop the looks at the local disk. */
function driveKey(p) {
  const abs = path.resolve(String(p));
  if (path.sep === "\\") return path.parse(abs).root.toLowerCase();
  return `/${abs.split("/").filter(Boolean).slice(0, 3).join("/")}`;
}

/** `fn()` on `p`, in time — SLOW at once while `p` was found not answering in the last minute; the same look shared
 *  while one is under way for `p`; one look of the system's per drive at a time (the next waits for it to answer — a few
 *  ms on a drive that answers — and gives up after its own time, unstarted). A look that runs out of time marks its
 *  path. Never rejects. */
function lookAt(p, kind, fn) {
  const at = pathKey(p);
  if ((unreachable.get(at) ?? 0) > Date.now()) return Promise.resolve(SLOW);
  const key = `${kind}:${at}`;
  if (inFlight.has(key)) return inFlight.get(key);
  const drive = driveKey(p);
  const run = (async () => {
    const since = Date.now();
    while (driveBusy.has(drive)) {
      const left = LOOK_MS - (Date.now() - since);
      if (left <= 0) return SLOW; // its drive still busy with a look the system hasn't answered: this one never starts
      await inTime(driveBusy.get(drive), left);
    }
    const op = Promise.resolve()
      .then(fn)
      .catch(() => null);
    driveBusy.set(drive, op);
    op.finally(() => {
      if (driveBusy.get(drive) === op) driveBusy.delete(drive);
    });
    const r = await inTime(op);
    if (r === SLOW) unreachable.set(at, Date.now() + UNREACHABLE_MS);
    return r;
  })()
    .catch(() => null)
    .finally(() => inFlight.delete(key));
  inFlight.set(key, run);
  return run;
}

/** Forget the paths found not answering — `paths` (Storage's Try again), or all (a test; its slow drives' looks too). */
export function _forgetUnreachable(paths = null) {
  if (paths) for (const p of paths) unreachable.delete(pathKey(p));
  else {
    unreachable.clear();
    driveBusy.clear();
  }
}

/** Is the folder `p` there now — `{here, taken}` (`taken`: something else has its name, a file) — or null when its
 *  drive doesn't answer in time. */
async function whereIs(p) {
  const st = await lookAt(p, "stat", () => volume.stat(path.resolve(String(p))).catch(() => null));
  if (st === SLOW) return null;
  return { here: !!st?.isDirectory(), taken: !!st && !st.isDirectory() };
}

/** realish, asynchronously and in time — for a path that may be on a drive that isn't there (realpathSync on an
 *  offline share held the main process 21 s): the links of the part that exists resolved, else the path as given. */
async function realishAsync(p) {
  let head = path.resolve(String(p));
  const tail = [];
  for (;;) {
    const real = await lookAt(head, "realpath", () => volume.realpath(head).catch(() => null));
    if (real === SLOW) return path.resolve(String(p));
    if (real) return path.join(real, ...tail.reverse());
    const up = path.dirname(head);
    if (up === head) return path.resolve(String(p));
    tail.push(path.basename(head));
    head = up;
  }
}

/** within() and sameFolder() for a path that may be on a drive that isn't there (asynchronous, in time). */
async function withinAsync(child, parent) {
  const rel = path.relative(await realishAsync(parent), await realishAsync(child));
  return rel === "" || (!rel.startsWith("..") && !path.isAbsolute(rel));
}
const sameFolderAsync = async (a, b) => dataPaths.samePath(await realishAsync(a), await realishAsync(b));

/** A JSON file read asynchronously in time, or null. */
async function readJson(file) {
  const text = await lookAt(file, "read", () => fs.promises.readFile(file, "utf8").catch(() => null));
  if (text === SLOW || text == null) return null;
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

// The shell's log lines.
const shellLog = { warn: (s) => console.warn(`[shell] ${s}`) };

// The start's look at a folder the user named, before anything is set up — synchronous, so a worker stats it while
// this thread waits at most START_LOOK_MS (Atomics.wait — the documented way to wait on a worker; an offline share's
// pointer blocked the start 21 s — the eighteenth review, measured).
const START_LOOK_MS = 4000;
// The worker is an ES module given as a data: URL (nodejs.org/api/worker_threads.html — a Worker's filename may be a
// `data:` URL): no file to load from inside the packaged app's asar, and no CommonJS eval.
const START_LOOK = new URL(
  `data:text/javascript,${encodeURIComponent(`import { workerData } from "node:worker_threads"; import { statSync } from "node:fs";
try { statSync(workerData.root); } catch {}
const flag = new Int32Array(workerData.flag); Atomics.store(flag, 0, 1); Atomics.notify(flag, 0);`)}`,
);

/** Does `root`'s drive answer within START_LOOK_MS? (A worker that can't start: yes — the check goes on as before.) */
export function answersInTime(root, ms = START_LOOK_MS) {
  const flag = new Int32Array(new SharedArrayBuffer(4));
  let worker;
  try {
    worker = new Worker(START_LOOK, { workerData: { root: path.resolve(String(root)), flag: flag.buffer } });
  } catch {
    return true;
  }
  worker.unref();
  const answered = Atomics.wait(flag, 0, 0, ms) !== "timed-out" || Atomics.load(flag, 0) === 1;
  if (!answered) worker.terminate().catch(() => {});
  return answered;
}

/**
 * The start's check of the data root (2026-10-20): why it can't be used, in plain words, or null — before
 * anything lands in it (a missing drive made the shell's first mkdir throw Electron's "JavaScript error"
 * dialog). A root the user named (the variable, the Change-folder pointer) must be there — never made; the
 * variable is held to the path rule too, a pointer only logged (data_paths.js `dataDirStartProblem`). A named root
 * whose drive doesn't answer in time (an offline share) is said so, never waited on (`answersInTime`).
 */
export function dataRootProblem(root, { log = shellLog, answers = answersInTime } = {}) {
  const source = dataPaths.dataDirSource(root);
  if ((source === "pointer" || source === "variable") && !answers(root)) return NO_ANSWER;
  return dataPaths.dataDirStartProblem(root, { source, log });
}

// A folder's words when connecting it is the cure — its drive out, or not answering (an offline share): said as
// "connect it and restart", never as a reason it can't be used.
const NOT_THERE = "it isn't there";
const NO_ANSWER = "its drive didn't answer (a network folder offline, or a drive asleep)";

/** Can the folder `p` be the data folder now — null, or why not in words: there (looked at in time), then the start's
 *  own check (the eighteenth review: "restart the app to use it" was said for a folder that is there but can't be
 *  used). */
export async function folderProblem(p, { source = "pointer" } = {}) {
  const w = await whereIs(p);
  if (!w) return NO_ANSWER;
  if (!w.here && !w.taken) return NOT_THERE;
  // the start's own check for where the folder came from: the variable's is held to the path rule too (the nineteenth
  // review: a 210-character folder the variable named read "restart the app to use it", and the start refused it)
  return dataPaths.dataDirStartProblem(p, { source: source === "variable" ? "variable" : "pointer" });
}

/** Where the data is, for Storage and the refused moves (a start on the default this time, or on an old copy):
 *  `{folder, connected, problem}` — `connected` only when the folder passes the start's check; `problem` its words
 *  when it is there and that check refuses it (null when it isn't there or doesn't answer: connect it). */
export async function dataFolderState(folder, { source = "pointer" } = {}) {
  const problem = await folderProblem(folder, { source });
  return { folder, connected: !problem, problem: problem === NOT_THERE || problem === NO_ANSWER ? null : problem };
}

/** "Use the default folder" (the start's message box, 2026-10-20): the default folder for this start only — the
 *  Change-folder pointer is kept, so the next start looks for the data it names again. Returns the default root. */
export function useDefaultRoot({ appName, repoRoot, packaged }) {
  return dataPaths.defaultDataDir({ appName, sourceRoot: sourceRootOf({ packaged, repoRoot }) });
}

/** "Use the default folder from now on" (Storage, while a start runs on the default because the folder the pointer
 *  names can't be used, or on an old copy — 2026-10-20): the pointer is forgotten, and the default folder's record
 *  of where its data went with it (it is the data folder now — no "old copy" banner at every start); the data in the
 *  folder the pointer named isn't touched. */
export function forgetPointer({ appName, repoRoot, packaged }) {
  const sourceRoot = sourceRootOf({ packaged, repoRoot });
  fs.rmSync(dataPaths.pointerFile({ appName, sourceRoot }), { force: true, maxRetries: 5 });
  forgetMovedTo(dataPaths.defaultDataDir({ appName, sourceRoot }));
}

/** `root` is the data folder now: its record of where its data once went goes. */
export function forgetMovedTo(root) {
  fs.rmSync(path.join(root, CHROME_DIR, MOVED_TO), { force: true });
}

/**
 * At start — after the app's single-instance lock (a second launch never gets here while this one copies), with the
 * window up, before the server — what a stopped Change folder left:
 *   - in this root, a half copy of a move INTO it that never committed (its `.moving` names another folder, and the
 *     pointer doesn't name this one — a "Use the default folder" start on a Move back that stopped midway): its listed
 *     names and the records it wrote in the Chromium folder go, before the server opens anything (the seventeenth
 *     review: the app ran on the half copy, and Move back was refused for good). A committed one's marker goes alone.
 *   - this root's record of a move OUT of it that never committed: the half copy in its target goes (the names its
 *     marker lists, then the folder when the move made it and it is empty) — kept for a later start while the
 *     target's drive isn't there or doesn't answer (the folder it was copying into missing too), dropped when that
 *     folder is there and the target isn't.
 * Committed is judged by the pointer (`committedInto`). Removal by fs.promises.rm (a link goes, never what it points
 * to).
 */
export async function sweepUnfinishedMove(root, { appName, repoRoot, packaged }) {
  const sourceRoot = sourceRootOf({ packaged, repoRoot });
  const own = readMoving(root);
  if (own) {
    if (own.entries && !(await sameFolderAsync(own.root, root)) && !(await committedIntoAsync(root, { appName, sourceRoot }))) {
      await removeEntries(root, own.entries);
      for (const f of [CARRIED, OLD_MARKER]) fs.rmSync(path.join(root, CHROME_DIR, f), { force: true });
      console.warn(`[shell] the half copy a stopped move left in ${root} was removed — the data is in ${own.root}`);
    }
    fs.rmSync(path.join(root, MOVING_MARKER), { force: true });
  }
  const record = path.join(root, CHROME_DIR, MOVING_RECORD);
  const rec = await readJson(record);
  if (!rec) return fs.rmSync(record, { force: true });
  const target = typeof rec.target === "string" ? rec.target : null;
  const moveId = typeof rec.moveId === "string" && rec.moveId ? rec.moveId : null;
  if (target) {
    const w = await whereIs(target);
    if (!w) return; // its drive doesn't answer: a later start
    if (!w.here) {
      // a record of this version's (the move's id): kept until the target answers to it — a target at a drive's root
      // with another stick in the letter has its parent there, its half copy on the stick that isn't (the nineteenth
      // review); an earlier version's: the folder it was copying into there, the target not — nothing to clear
      if (moveId) return;
      const parent = await whereIs(path.dirname(path.resolve(target)));
      if (parent?.here) fs.rmSync(record, { force: true });
      return;
    }
    const m = readMoving(target);
    // there, but not this move's half copy (another stick's folder of that name, a copy by hand): kept for later
    if (moveId && m?.moveId !== moveId) return;
    if (
      m?.entries &&
      (await sameFolderAsync(m.root, root)) &&
      !(await committedIntoAsync(target, { appName, sourceRoot })) &&
      !(await withinAsync(root, target)) &&
      !(await withinAsync(target, root))
    ) {
      await removeEntries(target, [...m.entries, CHROME_DIR, MOVING_MARKER]);
      if (m.made) {
        try {
          fs.rmdirSync(target); // only when empty
        } catch {
          /* something else is in it */
        }
      }
      console.warn(`[shell] the half copy a stopped move left in ${target} was removed — the data is in ${root}`);
    }
  }
  fs.rmSync(record, { force: true });
}

/** The window's access token a move left for this start (`relocate`'s `token`), read and removed — or null. */
export function takeCarried(root) {
  const file = path.join(root, CHROME_DIR, CARRIED);
  try {
    const token = JSON.parse(fs.readFileSync(file, "utf8"))?.token;
    return typeof token === "string" && token ? token : null;
  } catch {
    return null;
  } finally {
    fs.rmSync(file, { force: true });
  }
}

/** The old copies recorded in `root`'s Chromium folder: `[{root, entries, movedAt, moveId}]` (`movedAt` ms and
 *  `moveId` — the move's id, in the old root's moved-to.json too — null in a record from before them; an earlier
 *  version's marker — `{root, entries}`, or the old root's path alone — read as one). */
export function oldCopies(root) {
  let text;
  try {
    text = fs.readFileSync(path.join(root, CHROME_DIR, OLD_MARKER), "utf8").trim();
  } catch {
    return [];
  }
  let list;
  try {
    const m = JSON.parse(text);
    list = Array.isArray(m?.copies) ? m.copies : typeof m?.root === "string" ? [m] : [];
  } catch {
    list = text ? [{ root: text, entries: [CHROME_DIR] }] : [];
  }
  return list
    .filter((c) => typeof c?.root === "string" && c.root)
    .map((c) => ({
      root: path.resolve(c.root),
      entries: (Array.isArray(c.entries) ? c.entries : []).filter(plainName),
      movedAt: Number.isFinite(c.movedAt) ? c.movedAt : null,
      moveId: typeof c.moveId === "string" && c.moveId ? c.moveId : null,
    }));
}

function writeOldCopies(root, copies) {
  const file = path.join(root, CHROME_DIR, OLD_MARKER);
  if (!copies.length) return fs.rmSync(file, { force: true });
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify({ copies }));
}

// What tells that an old copy was used after its move: the database's own files — SQLite's database and its
// write-ahead log, shared memory and rollback journal, which every run of the app writes. Never a folder's time, nor
// a file the system makes where the user only looked (Explorer's Thumbs.db is no database; Finder's .DS_Store) —
// both said "used" for a copy nobody used (the sixteenth review, measured).
const DATABASE_FILE = /\.(db|sqlite3?)(-wal|-shm|-journal)?$/i;
const isDatabaseFile = (name) => DATABASE_FILE.test(name) && !SYSTEM_FILES.has(name) && name.toLowerCase() !== "thumbs.db";

/**
 * When the old copy in `old` was last changed — the newest time of its database's files: at its top, and right inside
 * each copied folder. ms, or 0.
 */
export async function lastChanged(old, entries) {
  let newest = 0;
  const look = async (dir) => {
    const names = await fs.promises.readdir(dir).catch(() => []);
    for (const name of names) {
      if (!isDatabaseFile(name)) continue;
      const st = await fs.promises.lstat(path.join(dir, name)).catch(() => null);
      if (st) newest = Math.max(newest, st.mtimeMs);
    }
  };
  await look(old);
  for (const name of entries) {
    if (NOT_COPIED.has(name)) continue;
    const p = path.join(old, name);
    const st = await fs.promises.lstat(p).catch(() => null);
    if (st?.isDirectory()) await look(p);
  }
  return newest;
}

/** Where the data of `root` went, when `root` holds the old copy a move left (a start on it — "Use the default
 *  folder", the variable — runs on stale data): `{root, movedAt, connected, problem}` — read through a chain of moves
 *  (each folder's own moved-to, a few at most); `connected` when that folder can be the data folder now (it is there and
 *  passes the start's check — `problem` that check's words when it is there and refused: `dataFolderState`) — or null: no record, or one naming this folder. Asked
 *  asynchronously, in time (an offline share). Never dropped by the app: "Use the default folder from now on" does. */
export async function oldCopyOf(root) {
  const m = await readJson(path.join(root, CHROME_DIR, MOVED_TO));
  if (typeof m?.root !== "string" || !m.root) return null;
  let folder = path.resolve(m.root);
  for (let hop = 0; hop < 5; hop++) {
    const next = await readJson(path.join(folder, CHROME_DIR, MOVED_TO));
    if (typeof next?.root !== "string" || !next.root || dataPaths.samePath(next.root, folder)) break;
    folder = path.resolve(next.root);
  }
  const { connected, problem } = await dataFolderState(folder);
  if (connected && (await sameFolderAsync(folder, root))) return null;
  return { root: folder, movedAt: Number.isFinite(m.movedAt) ? m.movedAt : null, connected, problem };
}

/**
 * Is the old copy `c` (recorded in `here`'s Chromium folder) the one there now? "here" — its folder there, and its own
 * moved-to.json holding this move's id (written into both records at the move — the eighteenth review: a device's
 * number isn't stable off Windows, and two moves in a row stranded the first copy; a chain of moves is accepted — its
 * moved-to may name a folder the data has left since). Else why not (the nineteenth review: "not found" said "connect
 * its drive" whatever the cause): "slow" — it didn't answer just now (an offline share, a drive waking: Try again);
 * "absent" — its folder isn't there (its drive out, the folder renamed or deleted); "other" — a folder is there but
 * isn't this copy (another drive in its letter, a copy made by hand). Never removed, never forgotten by the app — the
 * user may Forget it (`forgetOldCopy`).
 */
async function copyState(c, here) {
  const w = await whereIs(c.root);
  if (!w) return "slow"; // didn't answer just now (an offline share, a drive waking)
  if (!w.here) return "absent"; // its folder isn't there: its drive out, the folder renamed or deleted
  // an earliest record (the old root's path alone — the old folder was emptied by the move then): its presence alone
  if (!c.moveId && c.movedAt == null) return "here";
  const m = await readJson(path.join(c.root, CHROME_DIR, MOVED_TO));
  if (c.moveId) return m?.moveId === c.moveId ? "here" : "other";
  // a record of before the move's id: its own moved-to naming this folder
  return typeof m?.root === "string" && (await sameFolderAsync(m.root, here)) ? "here" : "other";
}

/**
 * The old copies a move left, for Settings → Storage: `[{root, bytes, movedAt, changedAt, connected, cause?}]` — the
 * bytes of what the move copied that is still there; `changedAt` (ms) when its database was written after the move —
 * more than the file time's tolerance (file_time.js) past it: the app ran on it since ("Use the default folder" while
 * the new folder's drive was out, the data-dir variable) and removing it removes that work — else null. One not found
 * as this move's is listed `connected: false` (bytes null) with its `cause` (copyState: "slow", "absent", "other").
 * Nothing is dropped from the record here — only Remove the old copy and Forget do. Never the folder in use.
 * Asynchronous, each look in time (an offline share never holds the main process, nor fills its file threads); `again`
 * (Storage's Try again): the copies that didn't answer are looked at now, not after the minute.
 */
export async function oldCopiesInfo(root, { again = false } = {}) {
  const here = path.resolve(root);
  const out = [];
  const copies = oldCopies(root);
  if (again) _forgetUnreachable(copies.map((c) => c.root));
  for (const c of copies) {
    const state = await copyState(c, here); // first: one that isn't there is looked at once, never the folder in use
    if (state === "here" && ((await withinAsync(here, c.root)) || (await withinAsync(c.root, here)))) continue;
    if (state !== "here") {
      out.push({ root: c.root, bytes: null, movedAt: c.movedAt, changedAt: null, connected: false, cause: state });
      continue;
    }
    const sizes = await Promise.all(c.entries.map((n) => entrySize(path.join(c.root, n))));
    const changed = c.movedAt == null ? 0 : await lastChanged(c.root, c.entries);
    out.push({ root: c.root, bytes: sizes.reduce((a, b) => a + b, 0), movedAt: c.movedAt, changedAt: changed > c.movedAt + MTIME_WINDOW_MS ? changed : null, connected: true });
  }
  return out;
}

/** Why Remove the old copy can't, by the cause (copyState), in words. */
export function notFoundWords(root, cause) {
  if (cause === "slow") return `The old copy in ${root} didn't answer just now — try again in a moment.`;
  if (cause === "other") return `The folder in ${root} isn't this old copy now (another drive in its place, or a folder copied by hand) — it isn't removed; Forget it to stop listing it.`;
  return `The old copy in ${root} isn't there — its drive unplugged, the folder renamed or deleted. Connect it, then remove it, or Forget it.`;
}

/** "Forget" (Settings → Storage, 2026-10-20 — the eighteenth review: "not connected" had no way out): the record of
 *  the old copy in `old` is dropped — nothing on any drive is touched. */
export function forgetOldCopy(root, old) {
  writeOldCopies(
    root,
    oldCopies(root).filter((c) => !dataPaths.samePath(c.root, old)),
  );
  return null;
}

/**
 * "Remove the old copy" (Settings → Storage, 2026-10-20): what a move copied from `old` — the names its record lists,
 * with the old folder's Chromium folder and lock — goes (fs.promises.rm: a link goes, never what it points to), then
 * the folder itself when nothing else is in it. Only the old copy that is there as this move's (`copyState`): never
 * the folder the app runs on (or one holding it), never one on a drive that isn't there or another volume in its
 * letter, never a folder another server of the app is using now. A name a program still holds is kept on the record
 * and said; the rest is gone.
 */
export async function removeOldCopy(root, old) {
  const here = path.resolve(root);
  const copies = oldCopies(root);
  let c = null;
  for (const x of copies) if (!c && (await sameFolderAsync(x.root, old))) c = x;
  if (!c) return null; // already gone
  if ((await withinAsync(here, c.root)) || (await withinAsync(c.root, here))) throw new Error(`${c.root} holds the data folder in use — it isn't removed.`);
  const state = await copyState(c, here);
  if (state !== "here") throw new Error(notFoundWords(c.root, state));
  if (await dataFolderHeld(c.root)) throw new Error(`A server of the app is using ${c.root} now — stop it first, then remove the old copy.`);
  const left = await removeEntries(c.root, c.entries);
  try {
    fs.rmdirSync(c.root); // only when empty: anything else in it is the user's
  } catch {
    /* not empty, or gone */
  }
  writeOldCopies(
    root,
    copies.map((x) => (x === c ? { ...x, entries: left } : x)).filter((x) => x.entries.length),
  );
  if (left.length) throw new Error(`Part of the old copy in ${c.root} couldn't be removed (${left.join(", ")}) — a program may be holding a file in it; try again later.`);
  return null;
}
