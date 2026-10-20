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

import fs from "node:fs";
import path from "node:path";
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

/** The words Change folder and Move back are refused with while a start runs on the default folder this time or on
 *  an old copy (2026-10-20, the sixteenth review): the data is in `folder` — connect it and restart, or (a pointer's
 *  folder — `canForget`) forget it. */
export const dataIsElsewhere = (folder, canForget = true) => `Your data is in ${folder}: connect it and restart${canForget ? ", or Use the default folder from now on" : ""}.`;

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
 * pointed back into the old folder; on Windows a folder's link is made again as a junction, any other refused in
 * words), marked unfinished by a `.moving` file (with this process's id — a second launch never sweeps it). Then the copy is checked — every file
 * its source's size, flushed to the drive (fsync) —, the new root's records written (the old copies, the token), the
 * marker marked committed, and the pointer committed (writePointer). A failure anywhere
 * before the commit removes what was copied and is said in words (fsProblem — "EFBIG": a FAT32 drive's 4 GB limit);
 * the old root is left as it was. Nothing is ever removed from the old root: the new root's Chromium folder
 * records it as an old copy (`oldCopies`, `removeOldCopy`). `token` (the window's access token, which lives in the
 * old root's Chromium profile) is left for the relaunch (`takeCarried`). One move at a time: a second while one
 * runs is refused (`MOVE_UNDER_WAY`). Resolves the new root, or null when it equals the old one. `copy` is
 * fs.promises.cp, `statfs` fs.promises.statfs (a test passes its own).
 */
export async function relocate({ oldRoot, newRoot, appName, folderName = appName, packaged = true, repoRoot, token = null, copy = fs.promises.cp, statfs = fs.promises.statfs }) {
  if (moving) throw new Error(MOVE_UNDER_WAY);
  moving = true;
  try {
    return await move({ oldRoot, newRoot, appName, folderName, packaged, repoRoot, token, copy, statfs });
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

async function move({ oldRoot, newRoot, appName, folderName, packaged, repoRoot, token, copy, statfs }) {
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
    if (unfinished && sameFolder(unfinished.root, old) && !unfinished.committed) {
      // an earlier move of this old root that never finished: its copy is ours
      await clearUnfinished(target, unfinished);
      made = unfinished.made === true;
    } else if (fs.readdirSync(target).some((n) => !SYSTEM_FILES.has(n))) {
      if (oldCopies(old).some((c) => sameFolder(c.root, target))) {
        throw new Error(`The old copy of the data is still in ${target} — remove it first (Remove the old copy), then move the data there.`);
      }
      throw new Error(`The folder ${target} already exists and isn't empty — choose another folder for the data.`);
    }
  }
  const entries = fs.readdirSync(old).filter((n) => !notCopied(n));
  // a link in the data folder (a models folder kept on another drive, the model cache's snapshots): Windows makes a
  // symbolic link again only with the right to (Developer Mode) — a folder's is made again as a junction, which needs
  // none; any other is refused, named, before anything is copied (2026-10-20, the sixteenth review: a junction failed
  // every move "the app isn't allowed to write there")
  const links = process.platform === "win32" ? await findLinks(old, entries) : [];
  const fileLinks = links.filter((l) => !l.dir);
  if (fileLinks.length) {
    const named = fileLinks.slice(0, 3).map((l) => l.rel).join(", ");
    throw new Error(
      `The data folder holds a link to a file (${named}${fileLinks.length > 3 ? ` and ${fileLinks.length - 3} more` : ""}), which Windows lets the app make again only with Developer Mode on — replace it with the file itself, or move it out of the data folder.`,
    );
  }
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
  // what this move made in the target: the copied entries, its marker, and the Chromium folder it records the old
  // copy and the token in before the commit
  const undo = async () => {
    await removeEntries(target, [...entries, MOVING_MARKER, CHROME_DIR]);
    if (made) await fs.promises.rm(target, TREE).catch(() => {});
    fs.rmSync(record, { force: true });
  };
  const movedAt = Date.now();
  try {
    writeMarker(marker, { root: old, entries, made, pid: process.pid, committed: false });
    // where the half copy is, should the app stop midway: the next start on the old root clears it — unless this
    // process still runs (a second launch of the app while this one copies)
    fs.mkdirSync(path.dirname(record), { recursive: true });
    fs.writeFileSync(record, JSON.stringify({ target, pid: process.pid }));
    const skip = new Set(links.map((l) => pathKey(l.src)));
    const options = { recursive: true, preserveTimestamps: true, verbatimSymlinks: true, ...(skip.size ? { filter: (src) => !skip.has(pathKey(src)) } : {}) };
    for (const name of entries) await copy(path.join(old, name), path.join(target, name), options);
    for (const l of links) makeJunction(l, old, target);
    for (const name of entries) await checkCopy(path.join(old, name), path.join(target, name), name);
    // the new root's own records, before the commit (a stop after the commit finds them there; an undo removes
    // them): the old copies it leaves — this one and those an earlier move left, each with its move's time — and the
    // window's token for the relaunch
    fs.mkdirSync(path.join(target, CHROME_DIR), { recursive: true });
    const copies = [];
    for (const c of [{ root: old, entries: [...entries, ...NOT_COPIED], movedAt }, ...oldCopies(old)]) {
      if (within(target, c.root) || within(c.root, target) || copies.some((x) => sameFolder(x.root, c.root))) continue;
      copies.push(c);
    }
    writeOldCopies(target, copies);
    if (token) fs.writeFileSync(path.join(target, CHROME_DIR, CARRIED), JSON.stringify({ token: String(token) }));
    syncDir(target);
    // from here the copy is whole: a stop during or after the pointer's step never has it swept as unfinished
    writeMarker(marker, { root: old, entries, made, pid: process.pid, committed: true });
  } catch (e) {
    await undo();
    throw new Error(`The data couldn't be copied to ${target}: ${dataPaths.fsProblem(e)} — it stays in ${old}.`);
  }
  const pointer = dataPaths.pointerFile({ appName, sourceRoot });
  try {
    if (toDefault) fs.rmSync(pointer, { force: true, maxRetries: 5 });
    else writePointer(pointer, target);
  } catch (e) {
    await undo();
    throw new Error(`The move couldn't be finished — ${pointer} couldn't be written (${dataPaths.fsProblem(e)}). The data stays in ${old}.`);
  }
  // committed: the new root is the data folder. The old root stays as it was — an old copy, removed when the user
  // asks — and says where its data went, so a start on it says it runs on the old copy (`oldCopyOf`)
  fs.rmSync(marker, { force: true });
  fs.rmSync(record, { force: true });
  try {
    fs.writeFileSync(path.join(old, CHROME_DIR, MOVED_TO), JSON.stringify({ root: target, movedAt }));
  } catch (e) {
    console.warn(`[shell] the old folder ${old} couldn't record where its data went (${e?.message || e})`);
  }
  return target;
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
      out.push({ src: p, rel, target, dir: !!to && dir });
      return;
    }
    if (!st.isDirectory()) return;
    for (const name of await fs.promises.readdir(p)) await walk(path.join(p, name), `${rel}/${name}`);
  };
  for (const name of entries) await walk(path.join(old, name), name);
  return out;
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

/** The `.moving` marker in `target`: `{root, entries, made, pid, committed}`, an earlier version's (the old root's
 *  path alone: `entries` null), or null. */
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
      return { root: m.root, entries: Array.isArray(m.entries) ? m.entries : null, made: m.made === true, pid: Number.isInteger(m.pid) ? m.pid : null, committed: m.committed === true };
    }
  } catch {
    /* an earlier version's marker */
  }
  return text ? { root: text, entries: null, made: false, pid: null, committed: false } : null;
}

/** An unfinished copy in `target` goes: the names its marker lists (an earlier version's marker: all but the
 *  system's files) and the records the move wrote in its Chromium folder, then the marker. */
async function clearUnfinished(target, m) {
  const names = m.entries ? [...m.entries, CHROME_DIR] : fs.readdirSync(target).filter((n) => !SYSTEM_FILES.has(n));
  await removeEntries(target, [...names, MOVING_MARKER]);
}

/** A plain name of an entry of a folder (never a path or "..") — what a marker may name for removal. */
const plainName = (n) => typeof n === "string" && n !== "" && n !== "." && n !== ".." && n === path.basename(n) && !/[\\/]/.test(n);

/** Does the process `pid` run (and isn't this one)? A signal 0 tests it (kill(2), Node's process.kill). */
function pidAlive(pid) {
  if (!Number.isInteger(pid) || pid <= 0 || pid === process.pid) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (e) {
    return e?.code === "EPERM"; // there, another user's
  }
}

/** Can `p`'s place be looked at now — its parent folder there (a drive plugged in, a share online)? */
const reachable = (p) => fs.existsSync(path.dirname(path.resolve(p)));

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

/** The pointer's folder, or null (none). */
function pointerTarget({ appName, repoRoot, packaged }) {
  try {
    return fs.readFileSync(dataPaths.pointerFile({ appName, sourceRoot: sourceRootOf({ packaged, repoRoot }) }), "utf8").trim() || null;
  } catch {
    return null;
  }
}

/**
 * At start — after the app's single-instance lock, before the server — a half copy an earlier stop left (the app
 * quit, killed or the computer off while a move copied) is removed: the old root's record names it, its `.moving`
 * marker names this root and isn't marked committed, and the pointer doesn't name it (a move whose pointer was
 * committed is never undone). Only the names the marker lists go (with the records the move wrote in its Chromium
 * folder), then the folder when the move made it and it is empty — by fs.promises.rm (a link goes, never what it
 * points to). Left for a later start, the record kept: a move whose process still runs (its pid — a second launch of
 * the app while one copies), and a target whose drive isn't there (a stick pulled — often why the copy stopped). A
 * `.moving` in the root in use is a committed move's (it went just after the pointer) and goes too.
 */
export async function sweepUnfinishedMove(root, { appName, repoRoot, packaged, alive = pidAlive }) {
  const own = readMoving(root);
  if (own && (own.committed || !alive(own.pid))) fs.rmSync(path.join(root, MOVING_MARKER), { force: true });
  const record = path.join(root, CHROME_DIR, MOVING_RECORD);
  let rec;
  try {
    rec = JSON.parse(fs.readFileSync(record, "utf8"));
  } catch {
    return;
  }
  const target = typeof rec?.target === "string" ? rec.target : null;
  if (target && (alive(rec.pid) || !reachable(target))) return; // the move goes on, or its drive isn't here: later
  try {
    const m = target ? readMoving(target) : null;
    const pointed = pointerTarget({ appName, repoRoot, packaged });
    const committed = !!m?.committed || (!!pointed && sameFolder(pointed, target));
    if (m?.entries && sameFolder(m.root, root) && !committed && !alive(m.pid) && !within(root, target) && !within(target, root)) {
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
  } finally {
    fs.rmSync(record, { force: true });
  }
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

/** The old copies recorded in `root`'s Chromium folder: `[{root, entries, movedAt}]` (`movedAt` ms, null in a record
 *  from before 2026-10-20's second pass; an earlier version's marker — `{root, entries}`, or the old root's path
 *  alone — read as one). */
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
export function lastChanged(old, entries) {
  let newest = 0;
  const seen = (p) => {
    try {
      newest = Math.max(newest, fs.lstatSync(p).mtimeMs);
    } catch {
      /* gone */
    }
  };
  const look = (dir) => {
    try {
      for (const name of fs.readdirSync(dir)) if (isDatabaseFile(name)) seen(path.join(dir, name));
    } catch {
      /* not a folder, or gone */
    }
  };
  look(old);
  for (const name of entries) {
    if (NOT_COPIED.has(name)) continue;
    const p = path.join(old, name);
    try {
      if (fs.lstatSync(p).isDirectory()) look(p);
    } catch {
      /* gone */
    }
  }
  return newest;
}

/** Where the data of `root` went, when `root` holds the old copy a move left (a start on it — "Use the default
 *  folder", the variable — runs on stale data): `{root, movedAt}`, or null — also when the folder it names is gone
 *  (its drive there, the folder not: deleted, or forgotten — no banner about a folder that no longer is). */
export function oldCopyOf(root) {
  try {
    const m = JSON.parse(fs.readFileSync(path.join(root, CHROME_DIR, MOVED_TO), "utf8"));
    if (typeof m?.root !== "string" || !m.root || sameFolder(m.root, root)) return null;
    if (!fs.existsSync(m.root) && reachable(m.root)) return null;
    return { root: path.resolve(m.root), movedAt: Number.isFinite(m.movedAt) ? m.movedAt : null };
  } catch {
    return null;
  }
}

/**
 * The old copies a move left, for Settings → Storage: `[{root, bytes, movedAt, changedAt, connected}]` — the bytes of
 * what the move copied that is still there; `changedAt` (ms) when its database was written after the move — more than
 * the file time's tolerance (file_time.js) past it: the app ran on it since ("Use the default folder" while the new
 * folder's drive was out, the data-dir variable) and removing it removes that work — else null. A copy whose drive
 * isn't there (its parent folder missing) is listed `connected: false` (bytes null) and kept; one whose drive is there
 * and nothing of it left (removed by hand) is forgotten; never the folder in use.
 */
export async function oldCopiesInfo(root) {
  const here = path.resolve(root);
  const copies = oldCopies(root);
  const kept = copies.filter((c) => !within(here, c.root) && !within(c.root, here) && (!reachable(c.root) || c.entries.some((n) => fs.existsSync(path.join(c.root, n)))));
  if (kept.length !== copies.length) writeOldCopies(root, kept);
  const out = [];
  for (const c of kept) {
    if (!reachable(c.root)) {
      out.push({ root: c.root, bytes: null, movedAt: c.movedAt, changedAt: null, connected: false });
      continue;
    }
    const sizes = await Promise.all(c.entries.map((n) => entrySize(path.join(c.root, n))));
    const changed = c.movedAt == null ? 0 : lastChanged(c.root, c.entries);
    out.push({ root: c.root, bytes: sizes.reduce((a, b) => a + b, 0), movedAt: c.movedAt, changedAt: changed > c.movedAt + MTIME_WINDOW_MS ? changed : null, connected: true });
  }
  return out;
}

/**
 * "Remove the old copy" (Settings → Storage, 2026-10-20): what a move copied from `old` — the names its record lists,
 * with the old folder's Chromium folder and lock — goes (fs.promises.rm: a link goes, never what it points to), then
 * the folder itself when nothing else is in it. Never the folder the app runs on (or one holding it), never a folder
 * another server of the app is using now, never one whose drive isn't there. A name a program still holds is kept on
 * the record and said; the rest is gone.
 */
export async function removeOldCopy(root, old) {
  const here = path.resolve(root);
  const copies = oldCopies(root);
  const c = copies.find((x) => sameFolder(x.root, old));
  if (!c) return null; // already gone
  if (within(here, c.root) || within(c.root, here)) throw new Error(`${c.root} holds the data folder in use — it isn't removed.`);
  if (!reachable(c.root)) throw new Error(`The old copy in ${c.root} isn't connected — connect its drive, then remove it.`);
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
