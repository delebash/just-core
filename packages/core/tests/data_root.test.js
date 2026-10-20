// SPDX-License-Identifier: MIT
// THE family data-folder ladder (platform/data_paths.js + shell/dataRoot.js) — the one module
// the desktop shell and the headless server share since the Electron move, with the answers
// of 2026-10-08: the OS fallback is %LOCALAPPDATA%\<App>\<App>, its pointer
// %LOCALAPPDATA%\<App>\dataroot.txt, Chromium's folder `electron`. JS-only (the Python ladder
// never read the pointer — the kit FINDING this closes).
import fs, {
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  promises as fsp,
  readdirSync,
  readFileSync,
  readlinkSync,
  realpathSync,
  renameSync,
  rmSync,
  statSync,
  symlinkSync,
  utimesSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { expect, test, vi } from "vitest";
import { LOCK_NAME, lockDataDir } from "../src/platform/data_lock.js";
import * as dataPaths from "../src/platform/data_paths.js";
import { sameFileTime } from "../src/platform/file_time.js";
import {
  _forgetUnreachable,
  answersInTime,
  appHome,
  CHROME_DIR,
  canMakeSymlink,
  dataIsElsewhere,
  dataDirSetBy,
  dataFolderState,
  dataRootProblem,
  folderProblem,
  forgetOldCopy,
  forgetPointer,
  lastChanged,
  MOVE_UNDER_WAY,
  moveTarget,
  oldCopies,
  oldCopiesInfo,
  oldCopyOf,
  relocate,
  removeOldCopy,
  resolveDataRoot,
  setByVariable,
  storageInfo,
  sweepUnfinishedMove,
  takeCarried,
  useDefaultRoot,
  volume,
  windowsLinkKinds,
} from "../src/shell/dataRoot.js";

// its real path: the ladder resolves links (macOS's /var is /private/var — the release runs these on every runner)
const tmp = () => realpathSync.native(mkdtempSync(path.join(tmpdir(), "ladder-")));
const opts = (repoRoot, env = {}) => ({ appName: "TestApp", dataDirEnv: "TESTAPP_DATA_DIR", repoRoot, packaged: false, env });

test("the variable wins over everything", () => {
  const repo = tmp();
  const chosen = path.join(tmp(), "mine");
  writeFileSync(path.join(repo, "dataroot.txt"), path.join(tmp(), "elsewhere"));
  expect(resolveDataRoot(opts(repo, { TESTAPP_DATA_DIR: chosen }))).toBe(chosen);
});

test("development defaults to <repo>/data", () => {
  const repo = tmp();
  expect(resolveDataRoot(opts(repo))).toBe(path.join(repo, "data"));
});

test("a Change-folder pointer is honoured; one naming the default is residue and deleted", () => {
  const repo = tmp();
  const moved = path.join(tmp(), "moved");
  writeFileSync(path.join(repo, "dataroot.txt"), moved);
  expect(resolveDataRoot(opts(repo))).toBe(moved);
  writeFileSync(path.join(repo, "dataroot.txt"), path.join(repo, "data"));
  expect(resolveDataRoot(opts(repo))).toBe(path.join(repo, "data"));
  expect(existsSync(path.join(repo, "dataroot.txt"))).toBe(false);
});

test("an unwritable install falls back to the OS folder, its pointer beside it", () => {
  const repo = tmp();
  const local = tmp();
  vi.stubEnv("WIN_PD_OVERRIDE_LOCAL_APPDATA", local);
  vi.stubEnv("XDG_DATA_HOME", local);
  const real = dataPaths._isWritable;
  vi.spyOn(dataPaths, "_isWritable").mockImplementation((d) => (path.resolve(d).startsWith(path.resolve(repo)) ? false : real(d)));
  const root = resolveDataRoot(opts(repo));
  const pointer = dataPaths.pointerFile({ appName: "TestApp", sourceRoot: repo });
  if (process.platform === "win32") {
    expect(root).toBe(path.join(local, "TestApp", "TestApp"));
    expect(pointer).toBe(path.join(local, "TestApp", "dataroot.txt"));
  } else {
    expect(root).toBe(path.join(local, "TestApp"));
    expect(pointer).toBe(path.join(local, "TestApp.dataroot.txt"));
  }
  // the pointer sits outside the root, so a move can't delete it
  expect(pointer.startsWith(root + path.sep)).toBe(false);
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});

// ── Change folder (its third round, 2026-10-20): copy, check, commit, switch — the old folder never removed by the
// app on its own; Storage shows the old copy and removes what the move copied when asked ─────────────────────────

/** An old root with a database, a log and Chromium's folder; the repo whose pointer the move writes. */
function oldRootWithData() {
  const repo = tmp();
  const old = path.join(repo, "data");
  mkdirSync(path.join(old, "logs"), { recursive: true });
  mkdirSync(path.join(old, CHROME_DIR), { recursive: true });
  writeFileSync(path.join(old, "app.db"), "db");
  writeFileSync(path.join(old, "logs", "a.log"), "log");
  writeFileSync(path.join(old, CHROME_DIR, "Cookies"), "open while running");
  return { repo, old };
}
const move = (old, picked, repo, more = {}) => relocate({ oldRoot: old, newRoot: picked, appName: "TestApp", packaged: false, repoRoot: repo, ...more });
const ladder = (repo) => ({ appName: "TestApp", repoRoot: repo, packaged: false });

test("a move copies and commits the pointer; the old folder stays whole, recorded as the old copy", async () => {
  const { repo, old } = oldRootWithData();
  const picked = tmp();
  const target = path.join(picked, "TestApp");
  expect(await move(old, picked, repo)).toBe(target);
  expect(readFileSync(path.join(target, "app.db"), "utf8")).toBe("db");
  expect(readFileSync(path.join(target, "logs", "a.log"), "utf8")).toBe("log");
  expect(existsSync(path.join(target, CHROME_DIR, "Cookies"))).toBe(false); // Chromium rebuilds its own
  expect(existsSync(path.join(target, ".moving"))).toBe(false); // marked whole
  expect(readFileSync(path.join(repo, "dataroot.txt"), "utf8")).toBe(target);
  expect(resolveDataRoot(opts(repo))).toBe(target);
  // nothing removed from the old folder — ever, by the app on its own
  expect(readdirSync(old).sort()).toEqual(["app.db", CHROME_DIR, "logs"]);
  expect(readFileSync(path.join(old, "app.db"), "utf8")).toBe("db");
  const [record] = oldCopies(target);
  // known by the move's id, in both of its records (the old folder's moved-to.json too)
  expect(record).toEqual({ root: old, entries: ["app.db", "logs", CHROME_DIR, LOCK_NAME], movedAt: expect.any(Number), moveId: expect.any(String) });
  expect(JSON.parse(readFileSync(path.join(old, CHROME_DIR, "moved-to.json"), "utf8"))).toEqual({ root: target, movedAt: record.movedAt, moveId: record.moveId });
  // the old folder says where its data went (its Chromium folder: removed with the old copy)
  expect(await oldCopyOf(old)).toEqual({ root: target, movedAt: record.movedAt, connected: true, problem: null });
  expect(await oldCopyOf(target)).toBe(null);
  const chromeBytes = "open while running".length + statSync(path.join(old, CHROME_DIR, "moved-to.json")).size;
  expect(await oldCopiesInfo(target)).toEqual([{ root: old, bytes: 2 + 3 + chromeBytes, movedAt: record.movedAt, changedAt: null, connected: true }]);
  // the next start on the new folder removes nothing either (the old cleanup ran here — and deleted new work)
  await sweepUnfinishedMove(target, ladder(repo));
  expect(readdirSync(old).sort()).toEqual(["app.db", CHROME_DIR, "logs"]);
  expect(storageInfo({ root: target, appName: "TestApp", repoRoot: repo, packaged: false })).toEqual({ root: target, default: path.join(repo, "data"), portable: false });
});

test("Remove the old copy: only what the move copied goes, then the folder when empty", async () => {
  const { repo, old } = oldRootWithData();
  const target = await move(old, tmp(), repo);
  await removeOldCopy(target, old);
  expect(existsSync(old)).toBe(false);
  expect(oldCopies(target)).toEqual([]);
  expect(await oldCopiesInfo(target)).toEqual([]);
  expect(readFileSync(path.join(target, "app.db"), "utf8")).toBe("db");
  // twice: nothing to do
  await expect(removeOldCopy(target, old)).resolves.toBe(null);
});

test("a file put in the old folder after the move stays, and so does the folder", async () => {
  const { repo, old } = oldRootWithData();
  const target = await move(old, tmp(), repo);
  writeFileSync(path.join(old, "later.txt"), "kept");
  await removeOldCopy(target, old);
  expect(readdirSync(old)).toEqual(["later.txt"]);
});

test("the reviewer's sweep_late.mjs: a start on the old folder between the move and the new folder's start loses nothing", async () => {
  // the data-dir variable named the old folder (or "Use the default folder" with the new one unreachable): the
  // user worked there a week; the old next-start cleanup then deleted that work at the new folder's start
  const { repo, old } = oldRootWithData();
  const target = await move(old, tmp(), repo);
  const first = resolveDataRoot(opts(repo, { TESTAPP_DATA_DIR: old }));
  await sweepUnfinishedMove(first, ladder(repo));
  writeFileSync(path.join(old, "app.db"), "a week of new work");
  const later = resolveDataRoot(opts(repo));
  expect(later).toBe(target);
  await sweepUnfinishedMove(later, ladder(repo));
  expect(readFileSync(path.join(old, "app.db"), "utf8")).toBe("a week of new work");
});

test("Remove the old copy never touches the folder in use, nor one a server of the app is using", async () => {
  const { repo, old } = oldRootWithData();
  const target = await move(old, tmp(), repo);
  // a record naming the folder in use (or one holding it) is refused in words
  writeFileSync(path.join(target, CHROME_DIR, "old-root.txt"), JSON.stringify({ copies: [{ root: path.dirname(target), entries: ["TestApp"] }] }));
  await expect(removeOldCopy(target, path.dirname(target))).rejects.toThrow(`${path.dirname(target)} holds the data folder in use — it isn't removed.`);
  expect(existsSync(target)).toBe(true);
  // a server running on the old copy (the data-dir variable): refused while it holds its lock
  writeFileSync(path.join(target, CHROME_DIR, "old-root.txt"), JSON.stringify({ copies: [{ root: old, entries: ["app.db", "logs", CHROME_DIR, LOCK_NAME] }] }));
  const release = await lockDataDir(old, { retries: 0 });
  try {
    await expect(removeOldCopy(target, old)).rejects.toThrow(`A server of the app is using ${old} now — stop it first, then remove the old copy.`);
    expect(readFileSync(path.join(old, "app.db"), "utf8")).toBe("db");
  } finally {
    await release();
  }
  await removeOldCopy(target, old);
  expect(existsSync(old)).toBe(false);
});

test("a record never reaches past the old folder's own entries", async () => {
  const parent = tmp();
  const root = path.join(parent, "Root");
  mkdirSync(path.join(root, CHROME_DIR), { recursive: true });
  const old = tmp();
  writeFileSync(path.join(old, "a.txt"), "x");
  writeFileSync(path.join(parent, "outside.txt"), "x");
  writeFileSync(path.join(root, CHROME_DIR, "old-root.txt"), JSON.stringify({ copies: [{ root: old, entries: ["..", `..${path.sep}outside.txt`, "a.txt"] }] }));
  expect(oldCopies(root)).toEqual([{ root: old, entries: ["a.txt"], movedAt: null, moveId: null }]);
  await removeOldCopy(root, old);
  expect(existsSync(old)).toBe(false);
  expect(existsSync(path.join(parent, "outside.txt"))).toBe(true);
});

test("an earlier version's record (the old root alone, or {root, entries}) is read as one old copy", () => {
  const root = tmp();
  mkdirSync(path.join(root, CHROME_DIR));
  const old = tmp();
  writeFileSync(path.join(root, CHROME_DIR, "old-root.txt"), old);
  expect(oldCopies(root)).toEqual([{ root: old, entries: [CHROME_DIR], movedAt: null, moveId: null }]);
  writeFileSync(path.join(root, CHROME_DIR, "old-root.txt"), JSON.stringify({ root: old, entries: ["app.db"] }));
  expect(oldCopies(root)).toEqual([{ root: old, entries: ["app.db"], movedAt: null, moveId: null }]);
});

// The coordinator's read of the record (2026-10-20): data moved from the default D to a USB drive E; E unplugged; a
// start's "Use the default folder" ran the app on D — the old copy — and the user worked there; E back: Remove the
// old copy of D would have taken that work, unsaid.
test("an old copy used after its move says when; a start on an old copy is told where the data is", async () => {
  const { repo, old: D } = oldRootWithData();
  mkdirSync(path.join(D, "houses", "1"), { recursive: true });
  const E = await move(D, tmp(), repo);
  const [{ movedAt }] = await oldCopiesInfo(E);
  // E is out: this start runs on the default — the old copy — and says so
  expect(useDefaultRoot({ appName: "TestApp", repoRoot: repo, packaged: false })).toBe(D);
  expect(await oldCopyOf(D)).toEqual({ root: E, movedAt, connected: true, problem: null });
  // Chromium writing its own folder there (the app ran on D until the move's relaunch) isn't use
  const later = new Date(movedAt + 60_000);
  utimesSync(path.join(D, CHROME_DIR, "Cookies"), later, later);
  expect((await oldCopiesInfo(E))[0].changedAt).toBe(null);
  // nor a folder's time, nor what Finder or Explorer make where the user only looked (the sixteenth review's s2:
  // .DS_Store, Thumbs.db — no database — desktop.ini said "used")
  mkdirSync(path.join(D, "houses", "2"));
  utimesSync(path.join(D, "houses", "2"), later, later);
  for (const f of [path.join(D, "houses", "1", ".DS_Store"), path.join(D, "Thumbs.db"), path.join(D, "houses", "Thumbs.db"), path.join(D, "desktop.ini")]) {
    writeFileSync(f, "the system's");
    utimesSync(f, later, later);
  }
  expect(await lastChanged(D, ["app.db", "houses"])).toBeLessThan(movedAt + 2000);
  expect((await oldCopiesInfo(E))[0].changedAt).toBe(null);
  // the user's work: the database written — every run writes its files (the database, its -wal beside it)
  utimesSync(path.join(D, "app.db"), later, later);
  expect(await lastChanged(D, ["app.db", "houses"])).toBe(later.getTime());
  expect((await oldCopiesInfo(E))[0].changedAt).toBe(later.getTime());
  const evenLater = new Date(movedAt + 120_000);
  writeFileSync(path.join(D, "app.db-wal"), "wal");
  utimesSync(path.join(D, "app.db-wal"), evenLater, evenLater);
  expect((await oldCopiesInfo(E))[0].changedAt).toBe(evenLater.getTime());
  // a record from before the move's time was kept: nothing said either way
  writeFileSync(path.join(E, CHROME_DIR, "old-root.txt"), JSON.stringify({ copies: [{ root: D, entries: ["app.db"] }] }));
  expect((await oldCopiesInfo(E))[0]).toMatchObject({ movedAt: null, changedAt: null });
});

test("the data-dir variable naming the folder: Change folder is off, in its own words", () => {
  expect(dataDirSetBy({ dataDirEnv: "JUST_HOUSE_PAINT_DATA_DIR", env: { JUST_HOUSE_PAINT_DATA_DIR: "D:\\data" } })).toBe("JUST_HOUSE_PAINT_DATA_DIR");
  expect(dataDirSetBy({ dataDirEnv: "JUST_HOUSE_PAINT_DATA_DIR", env: { JUST_HOUSE_PAINT_DATA_DIR: "  " } })).toBe(null);
  expect(dataDirSetBy({ dataDirEnv: "JUST_HOUSE_PAINT_DATA_DIR", env: {} })).toBe(null);
  expect(setByVariable("JUST_HOUSE_PAINT_DATA_DIR")).toBe("This data folder is set by JUST_HOUSE_PAINT_DATA_DIR — change it there.");
  // why: with the variable set, the next start never reads the pointer a move writes
  const repo = tmp();
  writeFileSync(path.join(repo, "dataroot.txt"), path.join(tmp(), "moved"));
  const chosen = path.join(tmp(), "chosen");
  expect(resolveDataRoot(opts(repo, { TESTAPP_DATA_DIR: chosen }))).toBe(chosen);
});

test("an old copy not yet removed is carried to the next move's record — none forgotten", async () => {
  const { repo, old } = oldRootWithData();
  const first = await move(old, tmp(), repo);
  const second = await move(first, tmp(), repo);
  expect(oldCopies(second).map((c) => c.root)).toEqual([first, old]);
  // moving back onto an old copy that's still there (the default, <repo>/data): refused in words
  await expect(move(second, old, repo)).rejects.toThrow(`The old copy of the data is still in ${old} — remove it first`);
});

test("the data moves into a new folder named for the app; the picked folder's own files are never touched", async () => {
  const { repo, old } = oldRootWithData();
  const picked = path.join(tmp(), "Documents");
  mkdirSync(picked);
  writeFileSync(path.join(picked, "desktop.ini"), "[.ShellClassInfo]");
  writeFileSync(path.join(picked, "holiday.jpg"), "mine");
  // the shell's productName, made safe for a folder name
  const target = path.join(picked, "Just Demo");
  expect(moveTarget({ newRoot: picked, appName: "TestApp", folderName: "Just: Demo.", packaged: false, repoRoot: repo })).toBe(target);
  expect(await move(old, picked, repo, { folderName: "Just: Demo." })).toBe(target);
  expect(readFileSync(path.join(target, "app.db"), "utf8")).toBe("db");
  expect(readdirSync(picked).sort()).toEqual(["Just Demo", "desktop.ini", "holiday.jpg"]);
  expect(readFileSync(path.join(picked, "holiday.jpg"), "utf8")).toBe("mine");
  expect(readFileSync(path.join(repo, "dataroot.txt"), "utf8")).toBe(target);
});

test("the app's folder already there and empty (or only the system's files) is used", async () => {
  const { repo, old } = oldRootWithData();
  const picked = tmp();
  const target = path.join(picked, "TestApp");
  mkdirSync(target);
  writeFileSync(path.join(target, ".DS_Store"), "finder");
  expect(await move(old, picked, repo)).toBe(target);
  expect(readFileSync(path.join(target, "app.db"), "utf8")).toBe("db");
  expect(readFileSync(path.join(target, ".DS_Store"), "utf8")).toBe("finder");
});

test("the app's folder already there with files in it is refused in words; nothing is copied or changed", async () => {
  const { repo, old } = oldRootWithData();
  const picked = tmp();
  const target = path.join(picked, "TestApp");
  mkdirSync(target);
  writeFileSync(path.join(target, "notes.txt"), "theirs");
  await expect(move(old, picked, repo)).rejects.toThrow(`The folder ${target} already exists and isn't empty — choose another folder for the data.`);
  expect(readdirSync(target)).toEqual(["notes.txt"]);
  expect(existsSync(path.join(repo, "dataroot.txt"))).toBe(false);
  expect(readFileSync(path.join(old, "app.db"), "utf8")).toBe("db");
});

test("a picked folder inside the current data folder is refused in words", async () => {
  const { repo, old } = oldRootWithData();
  mkdirSync(path.join(old, "sub"));
  const picked = path.join(old, "sub");
  await expect(move(old, picked, repo)).rejects.toThrow(`The folder ${picked} is inside the current data folder — choose a folder outside it.`);
  // the data folder itself (here the default): the data is there already — nothing moves
  await expect(move(old, old, repo)).resolves.toBe(null);
  expect(readdirSync(old).sort()).toEqual(["app.db", CHROME_DIR, "logs", "sub"]);
});

test("a picked folder that isn't there is said missing — never made", async () => {
  const { repo, old } = oldRootWithData();
  const picked = path.join(tmp(), "Gone");
  await expect(move(old, picked, repo)).rejects.toThrow(`The folder ${picked} can't hold the data: it isn't there`);
  expect(existsSync(picked)).toBe(false);
  expect(readFileSync(path.join(old, "app.db"), "utf8")).toBe("db");
});

// The reviewer's move_crash.mjs, case 1: the picker opens in the data folder; one level up is the install folder.
// The next update's uninstall keeps only data\ and dataroot.txt there — the moved data went with the rest.
test("a folder in the app's own folder (the install folder, a Mac bundle) is refused; the default itself moves back", async () => {
  const pickedOther = tmp();
  const { repo, old } = oldRootWithData();
  writeFileSync(path.join(repo, "JustHousePaint.exe"), "exe");
  mkdirSync(path.join(repo, "resources"));
  for (const picked of [repo, path.join(repo, "resources")]) {
    await expect(move(old, picked, repo)).rejects.toThrow(`The folder ${picked} is in the app's own folder (${repo}), which an update or an uninstall replaces — choose a folder outside it.`);
  }
  expect(readdirSync(repo).sort()).toEqual(["JustHousePaint.exe", "data", "resources"]);
  expect(existsSync(path.join(repo, "dataroot.txt"))).toBe(false);
  // elsewhere, then "Move back to the default folder": the default itself, the pointer removed (the default needs none)
  const moved = await move(old, pickedOther, repo);
  await removeOldCopy(moved, old);
  expect(existsSync(old)).toBe(false);
  expect(await move(moved, old, repo)).toBe(old);
  expect(readFileSync(path.join(old, "app.db"), "utf8")).toBe("db");
  expect(existsSync(path.join(repo, "dataroot.txt"))).toBe(false);
  expect(resolveDataRoot(opts(repo))).toBe(old);
  expect(oldCopies(old).map((c) => c.root)).toEqual([moved]);
  // a Mac app's own folder is its bundle, not only Contents/MacOS
  dataPaths.runtime.frozen = true;
  const exe = dataPaths.runtime.executable;
  try {
    dataPaths.runtime.executable = path.join(tmp(), "Just House Paint.app", "Contents", "MacOS", "JustHousePaint");
    mkdirSync(path.dirname(dataPaths.runtime.executable), { recursive: true });
    expect(appHome({ packaged: true })).toBe(path.resolve(dataPaths.runtime.executable, "..", "..", ".."));
  } finally {
    dataPaths.runtime.frozen = false;
    dataPaths.runtime.executable = exe;
  }
});

test("moving back onto the default while its old copy is still there: refused, naming the old copy", async () => {
  const { repo, old } = oldRootWithData();
  const moved = await move(old, tmp(), repo);
  await expect(move(moved, old, repo)).rejects.toThrow(`The old copy of the data is still in ${old} — remove it first (Remove the old copy), then move the data there.`);
  expect(readFileSync(path.join(repo, "dataroot.txt"), "utf8")).toBe(moved);
});

test("the room is checked first: a drive without room for the data and a margin is refused in words", async () => {
  const { repo, old } = oldRootWithData();
  const picked = tmp();
  const asked = [];
  const statfs = async (p) => {
    asked.push(p);
    return { bavail: 1000, bsize: 4096 }; // 4 MB free
  };
  await expect(move(old, picked, repo, { statfs })).rejects.toThrow(`The folder ${picked} can't hold the data: the data needs 0.3 GB of room and its drive has 0.0 GB free`);
  expect(asked).toEqual([picked]); // the picked folder's drive
  expect(readdirSync(picked)).toEqual([]); // nothing made
  expect(existsSync(path.join(repo, "dataroot.txt"))).toBe(false);
  expect(readFileSync(path.join(old, "app.db"), "utf8")).toBe("db");
});

test("the copy keeps the files' times to the engines' tolerance (rsync's --modify-window; FAT's 2 s)", async () => {
  // the reviewer's mtime_cp.mjs: NTFS keeps 100 ns, fs.cp sets milliseconds — 0 of 20 copied files read back the
  // exact time; the engines now compare within 2 s (file_time.js)
  const { repo, old } = oldRootWithData();
  const then = new Date("2024-03-01T10:00:00.123Z");
  utimesSync(path.join(old, "app.db"), then, then);
  utimesSync(path.join(old, "logs", "a.log"), then, then);
  const before = statSync(path.join(old, "app.db")).mtimeMs;
  const target = await move(old, tmp(), repo);
  expect(sameFileTime(statSync(path.join(target, "app.db")).mtimeMs, before)).toBe(true);
  expect(sameFileTime(statSync(path.join(target, "logs", "a.log")).mtimeMs, then.getTime())).toBe(true);
});

test("the copy is async — fs.promises.cp with the times kept and links copied as they are", async () => {
  const { repo, old } = oldRootWithData();
  const copies = [];
  const copy = async (...args) => {
    copies.push(args);
    await new Promise((r) => setTimeout(r, 10));
    return fsp.cp(...args);
  };
  const picked = tmp();
  const moving = move(old, picked, repo, { copy });
  expect(moving).toBeInstanceOf(Promise);
  expect(await moving).toBe(path.join(picked, "TestApp"));
  // each of the old root's entries but Chromium's folder
  expect(copies.map(([src]) => path.basename(src)).sort()).toEqual(["app.db", "logs"]);
  for (const [, , options] of copies) expect(options).toEqual({ recursive: true, preserveTimestamps: true, verbatimSymlinks: true });
});

// The reviewer's symlink_move.mjs: fs.cp made a relative link absolute, into the old folder (the model cache's
// snapshots → ../../blobs; an engine's lib*.so links) — removing the old copy then broke the new one.
test("a relative link stays relative, and reads through after the old copy is removed", async () => {
  const { repo, old } = oldRootWithData();
  const snap = path.join(old, "ai-cache", "hf", "models--x--y", "snapshots", "abc");
  const blobs = path.join(old, "ai-cache", "hf", "models--x--y", "blobs");
  mkdirSync(snap, { recursive: true });
  mkdirSync(blobs, { recursive: true });
  writeFileSync(path.join(blobs, "oid1"), "weights");
  const rel = path.relative(snap, path.join(blobs, "oid1"));
  try {
    symlinkSync(rel, path.join(snap, "model.gguf"), "file");
  } catch {
    return; // no right to make links here (Windows without Developer Mode): nothing to check
  }
  const target = await move(old, tmp(), repo);
  const moved = path.join(target, "ai-cache", "hf", "models--x--y", "snapshots", "abc", "model.gguf");
  expect(readlinkSync(moved)).toBe(rel);
  await removeOldCopy(target, old);
  expect(readFileSync(moved, "utf8")).toBe("weights");
});

// the eighteenth review: a relative link pointing OUTSIDE the data (../../shared-models) dangled in the copy, whose
// place is elsewhere — re-pointed to its absolute target
test("a relative link pointing outside the data is re-pointed to where it points, and reads through in the copy", async () => {
  const { repo, old } = oldRootWithData();
  const outside = path.join(repo, "shared-models");
  mkdirSync(outside);
  writeFileSync(path.join(outside, "w.gguf"), "the user's weights");
  writeFileSync(path.join(old, "note.txt"), "x");
  const rel = path.relative(old, path.join(outside, "w.gguf")); // ..\shared-models\w.gguf
  try {
    symlinkSync(rel, path.join(old, "weights.gguf"), "file");
  } catch {
    return; // no right to make links here (Windows without Developer Mode): nothing to check
  }
  const target = await move(old, tmp(), repo);
  const moved = path.join(target, "weights.gguf");
  expect(lstatSync(moved).isSymbolicLink()).toBe(true);
  expect(path.resolve(path.dirname(moved), readlinkSync(moved))).toBe(path.join(outside, "w.gguf"));
  expect(readFileSync(moved, "utf8")).toBe("the user's weights");
  await removeOldCopy(target, old);
  expect(readFileSync(moved, "utf8")).toBe("the user's weights");
});

test("a copy that fails leaves the picked folder as it was and the old root in use — said in words", async () => {
  const { repo, old } = oldRootWithData();
  // half the files land, then the drive goes
  const copy = async (_src, dest) => {
    writeFileSync(path.join(path.dirname(dest), "app.db"), "half");
    throw Object.assign(new Error("EIO: i/o error, write"), { code: "EIO" });
  };
  const picked = tmp();
  const target = path.join(picked, "TestApp");
  await expect(move(old, picked, repo, { copy })).rejects.toThrow(`The data couldn't be copied to ${target}: its drive failed to read or write (unplugged, or failing) — it stays in ${old}.`);
  expect(readdirSync(picked)).toEqual([]); // the app's folder the move made is gone
  expect(existsSync(path.join(repo, "dataroot.txt"))).toBe(false);
  expect(readFileSync(path.join(old, "app.db"), "utf8")).toBe("db");
  expect(existsSync(path.join(old, CHROME_DIR, "moving-to.json"))).toBe(false);
  // an app folder that was there (empty) is left as it was
  mkdirSync(target);
  await expect(move(old, picked, repo, { copy })).rejects.toThrow("The data couldn't be copied");
  expect(readdirSync(target)).toEqual([]);
});

test("a FAT32 drive's 4 GB limit (EFBIG) is said in words", async () => {
  const { repo, old } = oldRootWithData();
  const copy = async () => {
    throw Object.assign(new Error("EFBIG: file too large, write"), { code: "EFBIG" });
  };
  await expect(move(old, tmp(), repo, { copy })).rejects.toThrow(
    "a file is bigger than its drive can hold (a FAT32 drive takes no file over 4 GB — use a drive formatted NTFS, exFAT or APFS)",
  );
});

test("a copy that came out short is caught by the check, before anything switches", async () => {
  const { repo, old } = oldRootWithData();
  const copy = async (src, dest, o) => {
    await fsp.cp(src, dest, o);
    if (path.basename(src) === "app.db") writeFileSync(dest, "d");
  };
  const picked = tmp();
  await expect(move(old, picked, repo, { copy })).rejects.toThrow("the copy of app.db came out incomplete (1 of 2 bytes)");
  expect(readdirSync(picked)).toEqual([]);
  expect(existsSync(path.join(repo, "dataroot.txt"))).toBe(false);
});

// The reviewer's move_crash.mjs, case 2: the pointer's write failed (a scanner, a folder in its place) and left the
// full copy behind with a raw EPERM.
test("a pointer that can't be written: the copy is removed and the failure said in words", async () => {
  const { repo, old } = oldRootWithData();
  mkdirSync(path.join(repo, "dataroot.txt.tmp")); // where the pointer is written first: a folder
  const picked = tmp();
  const pointer = path.join(repo, "dataroot.txt");
  await expect(move(old, picked, repo)).rejects.toThrow(new RegExp(`^The move couldn't be finished — ${pointer.replace(/[\\.]/g, "\\$&")} couldn't be written \\(.+\\)\\. The data stays in `));
  expect(readdirSync(picked)).toEqual([]);
  expect(existsSync(pointer)).toBe(false);
  expect(readFileSync(path.join(old, "app.db"), "utf8")).toBe("db");
  // the old folder's moved-to — written before the commit — went with the undo
  expect(existsSync(path.join(old, CHROME_DIR, "moved-to.json"))).toBe(false);
  // the retry into the same folder works once the way is clear
  rmSync(path.join(repo, "dataroot.txt.tmp"), { recursive: true, force: true });
  expect(await move(old, picked, repo)).toBe(path.join(picked, "TestApp"));
});

// The reviewer's move_crash.mjs, case 3: the app quit mid-copy; nothing cleared the half copy, ever.
test("a half copy a stopped move left is removed at the next start; a committed one never", async () => {
  const { repo, old } = oldRootWithData();
  mkdirSync(path.join(old, "houses", "1"), { recursive: true });
  writeFileSync(path.join(old, "houses", "1", "photo.jpg"), "photo");
  const picked = tmp();
  const target = path.join(picked, "TestApp");
  let n = 0;
  let end;
  // the process ends at the second entry (in this test: held there until the checks are done)
  const halfCopy = (src, dst, o) => (n++ >= 1 ? new Promise((_r, reject) => (end = reject)) : fsp.cp(src, dst, o));
  const stopped = move(old, picked, repo, { copy: halfCopy }).catch(() => {});
  try {
    await vi.waitFor(() => expect(n).toBe(2), { timeout: 15_000 });
    // a file of the user's put beside the half copy meanwhile
    writeFileSync(path.join(target, "mine.txt"), "kept");
    // the next start: the old folder (no pointer)
    const root = resolveDataRoot(opts(repo));
    expect(root).toBe(old);
    await sweepUnfinishedMove(root, ladder(repo));
    expect(readdirSync(target)).toEqual(["mine.txt"]);
    expect(readFileSync(path.join(old, "app.db"), "utf8")).toBe("db");
    expect(existsSync(path.join(old, CHROME_DIR, "moving-to.json"))).toBe(false);
  } finally {
    // the held move always ends: left waiting, it keeps the module's one-move flag and every later move is refused
    end?.(new Error("the process ended"));
    await stopped;
  }
  // a copy whose pointer was committed is never undone, even with its marker left (killed just after the commit)
  const again = path.join(tmp(), "TestApp");
  mkdirSync(again);
  writeFileSync(path.join(again, "app.db"), "the moved db");
  writeFileSync(path.join(again, ".moving"), JSON.stringify({ root: old, entries: ["app.db"], made: true }));
  writeFileSync(path.join(old, CHROME_DIR, "moving-to.json"), JSON.stringify({ target: again }));
  writeFileSync(path.join(repo, "dataroot.txt"), again);
  await sweepUnfinishedMove(old, ladder(repo)); // a start on the old folder (the variable)
  expect(readFileSync(path.join(again, "app.db"), "utf8")).toBe("the moved db");
  await sweepUnfinishedMove(again, ladder(repo)); // the start on the new folder: its stray marker goes
  expect(existsSync(path.join(again, ".moving"))).toBe(false);
});

test("a move of this old root that never finished is cleared by the next try into it, and done", async () => {
  const { repo, old } = oldRootWithData();
  const picked = tmp();
  const target = path.join(picked, "TestApp");
  mkdirSync(target);
  writeFileSync(path.join(target, ".moving"), old); // an earlier version's marker: the old root alone
  writeFileSync(path.join(target, "app.db"), "half");
  expect(await move(old, picked, repo)).toBe(target);
  expect(readFileSync(path.join(target, "app.db"), "utf8")).toBe("db");
});

test("a .moving that names another folder is never cleared — that copy isn't this move's", async () => {
  const { repo, old } = oldRootWithData();
  const picked = tmp();
  const target = path.join(picked, "TestApp");
  mkdirSync(target);
  writeFileSync(path.join(target, ".moving"), JSON.stringify({ root: path.join(tmp(), "another-old-root"), entries: ["app.db"], made: true }));
  writeFileSync(path.join(target, "app.db"), "theirs");
  await expect(move(old, picked, repo)).rejects.toThrow(`The folder ${target} already exists and isn't empty`);
  expect(readFileSync(path.join(target, "app.db"), "utf8")).toBe("theirs");
  expect(readFileSync(path.join(old, "app.db"), "utf8")).toBe("db");
});

test("two moves at once: the second is refused in words, the first finishes whole", async () => {
  // the reviewer's relocate_race.mjs: the window's button re-enabled by a remount, a second Change folder into
  // the same folder while the first copied — the first's copy was wiped as unfinished
  const { repo, old } = oldRootWithData();
  for (let i = 0; i < 40; i++) {
    mkdirSync(path.join(old, "houses", String(i)), { recursive: true });
    writeFileSync(path.join(old, "houses", String(i), "photo.jpg"), "x".repeat(1000));
  }
  const picked = tmp();
  const target = path.join(picked, "TestApp");
  let open;
  const gate = new Promise((r) => {
    open = r;
  });
  const slow = async (...args) => {
    await gate;
    return fsp.cp(...args);
  };
  const first = move(old, picked, repo, { copy: slow });
  try {
    // the room check measures the 40 houses first: on a busy machine that took past waitFor's 1 s default
    await vi.waitFor(() => expect(existsSync(path.join(target, ".moving"))).toBe(true), { timeout: 15_000 });
    await expect(move(old, picked, repo, { copy: slow })).rejects.toThrow(MOVE_UNDER_WAY);
    expect(MOVE_UNDER_WAY).toBe("The data folder is already being moved — wait for that move to finish.");
  } finally {
    // always let the first move end: one left waiting holds the module's one-move flag, and every later test's
    // move is refused as "already being moved"
    open();
  }
  expect(await first).toBe(target);
  expect(readdirSync(path.join(target, "houses")).length).toBe(40);
  expect(readFileSync(path.join(repo, "dataroot.txt"), "utf8")).toBe(target);
  // once it is done, the next move may run
  const later = tmp();
  expect(await move(target, later, repo)).toBe(path.join(later, "TestApp"));
});

test("a folder the native code can't use is refused in words, before anything moves", async () => {
  const { repo, old } = oldRootWithData();
  const dotted = path.join(tmp(), "data.");
  await expect(move(old, dotted, repo)).rejects.toThrow(`The folder ${dotted} can't hold the data: its name ends in a dot or a space, which Windows drops`);
  // the app's folder inside the picked one past 180 characters
  const base = tmp();
  const picked = path.join(base, "x".repeat(178 - base.length));
  mkdirSync(picked);
  const target = path.join(picked, "TestApp");
  await expect(move(old, picked, repo)).rejects.toThrow(`The data folder ${target} can't be used: its path is longer than 180 characters`);
  expect(existsSync(target)).toBe(false);
  expect(readFileSync(path.join(old, "app.db"), "utf8")).toBe("db");
});

test("the window's token is left for the relaunch in the new folder, read once", async () => {
  const { repo, old } = oldRootWithData();
  const target = await move(old, tmp(), repo, { token: "s3cr3t" });
  expect(takeCarried(target)).toBe("s3cr3t");
  expect(takeCarried(target)).toBe(null);
  expect(existsSync(path.join(target, CHROME_DIR, "carried.json"))).toBe(false);
  // none given: none left
  const other = await move(target, tmp(), repo);
  expect(takeCarried(other)).toBe(null);
});

// ── a data root that can't be used at start (2026-10-20) ──────────────────────

test("a root that can't be made is said in words; a usable one is null", () => {
  const repo = tmp();
  expect(dataRootProblem(path.join(repo, "data"))).toBe(null);
  writeFileSync(path.join(repo, "blocked"), "a file where the folder goes");
  expect(dataRootProblem(path.join(repo, "blocked"))).toBe("a file has that name");
});

test.runIf(process.platform === "win32")("a root on a drive that isn't there is said in words", () => {
  const free = [..."ZYXWVUTSRQPONMLKJIHG"].find((d) => !existsSync(`${d}:\\`));
  expect(dataRootProblem(`${free}:\\JustData`)).toBe("its drive isn't there (unplugged, or a network folder offline)");
});

test("a folder the user named that isn't there is said missing — never made; the default may be made", () => {
  const repo = tmp();
  const gone = path.join(tmp(), "renamed-or-deleted");
  writeFileSync(path.join(repo, "dataroot.txt"), gone);
  const root = resolveDataRoot(opts(repo));
  expect(root).toBe(gone);
  expect(dataRootProblem(root)).toBe("it isn't there");
  expect(existsSync(gone)).toBe(false);
  // the variable too
  const variable = path.join(tmp(), "not-made");
  expect(dataRootProblem(resolveDataRoot(opts(repo, { TESTAPP_DATA_DIR: variable })))).toBe("it isn't there");
  expect(existsSync(variable)).toBe(false);
  // the default, the app's own place, is made
  const fresh = tmp();
  const def = resolveDataRoot(opts(fresh));
  expect(dataRootProblem(def)).toBe(null);
  expect(existsSync(def)).toBe(true);
});

test("a pointer past the path rule is used as it is and logged; the variable is held to the rule", () => {
  // the other apps' pointers that work keep working (the rule is for a folder being chosen)
  const repo = tmp();
  const base = tmp();
  const long = path.join(base, "z".repeat(190 - base.length));
  mkdirSync(long);
  writeFileSync(path.join(repo, "dataroot.txt"), long);
  const lines = [];
  const log = { warn: (s) => lines.push(s) };
  expect(dataRootProblem(resolveDataRoot(opts(repo)), { log })).toBe(null);
  expect(lines).toEqual([`the data folder ${long} is used as Change folder left it, though its path is longer than 180 characters`]);
  expect(dataRootProblem(resolveDataRoot(opts(repo, { TESTAPP_DATA_DIR: long })), { log })).toBe("its path is longer than 180 characters");
  // the default, however deep the install, is the app's own place — never refused for its path
  const deep = path.join(tmp(), "y".repeat(190));
  mkdirSync(deep, { recursive: true });
  const def = resolveDataRoot(opts(deep));
  expect(def).toBe(path.join(deep, "data"));
  expect(dataRootProblem(def)).toBe(null);
});

test("Use the default folder: this start only — the pointer is kept; from now on — the pointer forgotten", () => {
  const repo = tmp();
  const gone = path.join(tmp(), "gone-drive");
  writeFileSync(path.join(repo, "dataroot.txt"), gone);
  expect(useDefaultRoot({ appName: "TestApp", repoRoot: repo, packaged: false })).toBe(path.join(repo, "data"));
  expect(readFileSync(path.join(repo, "dataroot.txt"), "utf8")).toBe(gone);
  expect(resolveDataRoot(opts(repo))).toBe(gone);
  // Storage's "Use the default folder from now on"
  forgetPointer({ appName: "TestApp", repoRoot: repo, packaged: false });
  expect(existsSync(path.join(repo, "dataroot.txt"))).toBe(false);
  expect(resolveDataRoot(opts(repo))).toBe(path.join(repo, "data"));
});

// ── the sixteenth and seventeenth reviews' attacks (2026-10-20; scripts: the scratchpad's adv16/shell, adv17/shell) ──

// A move is done when its pointer says so (2026-10-20, the seventeenth review: a flag in the marker, set before the
// pointer, read a stop inside the pointer's write as done — a full stray copy kept, its token in plain text).
test("a stop before the pointer's step: the copy (its token too) is swept at the next start; after it: never", async () => {
  const { repo, old } = oldRootWithData();
  const picked = tmp();
  const target = path.join(picked, "TestApp");
  // the reviewer's s7: the copy whole, the records written, the process ends before the pointer
  const realOpen = fs.openSync;
  fs.openSync = (p, ...rest) => {
    if (String(p).endsWith("dataroot.txt.tmp")) throw Object.assign(new Error("killed"), { code: "EKILLED" });
    return realOpen(p, ...rest);
  };
  let carriedSeen = false;
  const copy = async (src, dst, o) => fsp.cp(src, dst, o);
  // keep what the stop leaves: the undo is what a kill never runs — so look before it, from the pointer's step
  const realRm = fsp.rm;
  fsp.rm = async (p, o) => {
    if (String(p).endsWith("carried.json") && !carriedSeen) {
      carriedSeen = true;
      // the state at the stop: the marker (uncommitted — no pointer names the target) and the token's file
      expect(readFileSync(path.join(target, ".moving"), "utf8")).not.toContain("committed");
      expect(JSON.parse(readFileSync(p, "utf8"))).toEqual({ token: "s3cr3t" });
      await realRm(path.join(old, CHROME_DIR, "moving-to.json"), { force: true }).catch(() => {});
      writeFileSync(path.join(old, CHROME_DIR, "moving-to.json"), JSON.stringify({ target }));
      // the next start, on the old folder (the pointer never written): its sweep clears the copy, the token first
      await sweepUnfinishedMove(old, ladder(repo));
      expect(existsSync(path.join(target, CHROME_DIR, "carried.json"))).toBe(false);
      expect(existsSync(path.join(target, "app.db"))).toBe(false);
    }
    return realRm(p, o);
  };
  try {
    await expect(move(old, picked, repo, { copy, token: "s3cr3t" })).rejects.toThrow("The move couldn't be finished");
  } finally {
    fs.openSync = realOpen;
    fsp.rm = realRm;
  }
  expect(carriedSeen).toBe(true);
  expect(readFileSync(path.join(old, "app.db"), "utf8")).toBe("db");
  // committed (the pointer names it): a sweep with its marker still there never touches it
  const done = await move(old, tmp(), repo);
  writeFileSync(path.join(done, ".moving"), JSON.stringify({ root: old, entries: ["app.db", "logs"], made: true }));
  writeFileSync(path.join(old, CHROME_DIR, "moving-to.json"), JSON.stringify({ target: done }));
  await sweepUnfinishedMove(old, ladder(repo));
  expect(readFileSync(path.join(done, "app.db"), "utf8")).toBe("db");
  await sweepUnfinishedMove(done, ladder(repo)); // the start on it: the stray marker goes
  expect(existsSync(path.join(done, ".moving"))).toBe(false);
});

test("a move to the default folder stopped after its pointer's step is never swept (no pointer: the default is it)", async () => {
  const repo = tmp();
  const def = path.join(repo, "data");
  mkdirSync(path.join(def, CHROME_DIR), { recursive: true });
  writeFileSync(path.join(def, "app.db"), "the moved db");
  const old = tmp();
  mkdirSync(path.join(old, CHROME_DIR));
  writeFileSync(path.join(def, ".moving"), JSON.stringify({ root: old, entries: ["app.db"], made: false }));
  writeFileSync(path.join(old, CHROME_DIR, "moving-to.json"), JSON.stringify({ target: def }));
  await sweepUnfinishedMove(old, ladder(repo)); // a start on the old folder (the variable)
  expect(readFileSync(path.join(def, "app.db"), "utf8")).toBe("the moved db");
  expect(existsSync(path.join(old, CHROME_DIR, "moving-to.json"))).toBe(false);
});

// the reviewer's s2 (seventeenth): Move back to the default stopped midway; the next start's "Use the default folder"
// ran the app on the half copy, removed its marker, and Move back was refused for good
test("a 'Use the default folder' start clears a half copy of a move into its own folder before the server starts", async () => {
  const repo = tmp();
  const A = path.join(repo, "data");
  const stick = tmp();
  const B = path.join(stick, "TestApp");
  mkdirSync(path.join(B, "houses", "1"), { recursive: true });
  writeFileSync(path.join(B, "app.db"), "the data");
  writeFileSync(path.join(repo, "dataroot.txt"), B); // the pointer names B
  // Move back (B → A) stopped after its first entry: A holds a half copy and a marker naming B
  mkdirSync(path.join(A, CHROME_DIR), { recursive: true });
  writeFileSync(path.join(A, "app.db"), "half");
  writeFileSync(path.join(A, CHROME_DIR, "old-root.txt"), JSON.stringify({ copies: [{ root: B, entries: ["app.db"] }] }));
  writeFileSync(path.join(A, CHROME_DIR, "carried.json"), JSON.stringify({ token: "t" }));
  writeFileSync(path.join(A, CHROME_DIR, "Cookies"), "Chromium's, in use");
  writeFileSync(path.join(A, ".moving"), JSON.stringify({ root: B, entries: ["app.db", "houses"], made: false }));
  // B's drive out: this start runs on A ("Use the default folder")
  await sweepUnfinishedMove(A, ladder(repo));
  expect(readdirSync(A).sort()).toEqual([CHROME_DIR]);
  expect(readdirSync(path.join(A, CHROME_DIR))).toEqual(["Cookies"]);
  // B back, the next start on it: Move back works
  const back = await move(B, A, repo);
  expect(back).toBe(A);
  expect(readFileSync(path.join(A, "app.db"), "utf8")).toBe("the data");
});

// s5 (sixteenth): the stick pulled (often why the copy stopped): the record kept while the target can't be reached
test("a half copy whose drive isn't there keeps its record — swept once the drive is back; a deleted target drops it", async () => {
  const { repo, old } = oldRootWithData();
  const drive = tmp();
  const stick = path.join(drive, "stick");
  const target = path.join(stick, "TestApp");
  mkdirSync(target, { recursive: true });
  writeFileSync(path.join(target, "app.db"), "half");
  writeFileSync(path.join(target, ".moving"), JSON.stringify({ root: old, entries: ["app.db", "logs"], made: true }));
  writeFileSync(path.join(old, CHROME_DIR, "moving-to.json"), JSON.stringify({ target }));
  renameSync(stick, `${stick}-out`); // unplugged: the folder it copied into isn't there
  await sweepUnfinishedMove(old, ladder(repo));
  expect(existsSync(path.join(old, CHROME_DIR, "moving-to.json"))).toBe(true);
  renameSync(`${stick}-out`, stick); // back
  await sweepUnfinishedMove(old, ladder(repo));
  expect(existsSync(target)).toBe(false);
  expect(existsSync(path.join(old, CHROME_DIR, "moving-to.json"))).toBe(false);
  // the folder it copied into there, the target deleted: nothing to clear, the record dropped
  writeFileSync(path.join(old, CHROME_DIR, "moving-to.json"), JSON.stringify({ target }));
  await sweepUnfinishedMove(old, ladder(repo));
  expect(existsSync(path.join(old, CHROME_DIR, "moving-to.json"))).toBe(false);
  expect(readFileSync(path.join(old, "app.db"), "utf8")).toBe("db");
});

// s3 (seventeenth) and s11 (eighteenth): an old copy known by its move's id, in both records — a drive out, another
// stick in its place, a hand-made copy: "not found", never removed, never forgotten by the app; Forget drops the record
test("an old copy is known by its move's id: anything else is not found — never removed, never forgotten; Forget drops the record", async () => {
  const repo = tmp();
  const drive = tmp();
  const stick = path.join(drive, "Q");
  const A = path.join(stick, "TestApp");
  mkdirSync(A, { recursive: true });
  writeFileSync(path.join(A, "app.db"), "db");
  writeFileSync(path.join(repo, "dataroot.txt"), A);
  const B = await move(A, tmp(), repo);
  expect(await oldCopiesInfo(B)).toMatchObject([{ root: A, connected: true }]);
  // the stick out
  renameSync(stick, `${stick}-out`);
  expect(await oldCopiesInfo(B)).toEqual([{ root: A, bytes: null, movedAt: expect.any(Number), changedAt: null, connected: false, cause: "absent" }]);
  await expect(removeOldCopy(B, A)).rejects.toThrow(`The old copy in ${A} isn't there — its drive unplugged, the folder renamed or deleted. Connect it, then remove it, or Forget it.`);
  // another, empty stick in its place: still listed, not found — never forgotten by the app
  mkdirSync(stick);
  expect(await oldCopiesInfo(B)).toMatchObject([{ root: A, connected: false }]);
  // another stick holding its own TestApp — a hand copy, its own moved-to of another move: never taken for it
  mkdirSync(path.join(A, CHROME_DIR), { recursive: true });
  writeFileSync(path.join(A, "app.db"), "another stick's data");
  writeFileSync(path.join(A, CHROME_DIR, "moved-to.json"), JSON.stringify({ root: B, movedAt: 1, moveId: "another-move" }));
  expect(await oldCopiesInfo(B)).toMatchObject([{ root: A, connected: false, cause: "other" }]);
  await expect(removeOldCopy(B, A)).rejects.toThrow(`The folder in ${A} isn't this old copy now (another drive in its place, or a folder copied by hand) — it isn't removed; Forget it to stop listing it.`);
  expect(readFileSync(path.join(A, "app.db"), "utf8")).toBe("another stick's data");
  // the real stick back: the old copy, connected
  rmSync(stick, { recursive: true, force: true });
  renameSync(`${stick}-out`, stick);
  expect(await oldCopiesInfo(B)).toMatchObject([{ root: A, connected: true }]);
  // deleted by hand: still listed (not found) until the user forgets it — Forget touches no drive
  rmSync(A, { recursive: true, force: true });
  expect(await oldCopiesInfo(B)).toMatchObject([{ root: A, connected: false }]);
  forgetOldCopy(B, A);
  expect(await oldCopiesInfo(B)).toEqual([]);
});

// s11 (eighteenth): two moves in a row stranded the first old copy ("not connected" on a drive that is there)
// the eighteenth's fix's own attack: a move looked at each earlier copy it carries synchronously (realpath) — one on
// an offline share held the main process ~21 s
test("a move carrying an earlier copy on a drive that doesn't answer isn't held by it — the copy stays on the record", async () => {
  const slowDrive = path.parse(tmp()).root === "/" ? "/nonexistent-slow" : "Z:\\";
  const slow = (p) => path.resolve(p).toLowerCase().startsWith(slowDrive.toLowerCase());
  const real = { ...volume };
  volume.stat = (p) => (slow(p) ? new Promise(() => {}) : real.stat(p));
  volume.realpath = (p) => (slow(p) ? new Promise(() => {}) : real.realpath(p));
  try {
    _forgetUnreachable();
    const { repo, old: A } = oldRootWithData();
    const far = path.join(slowDrive, "Share", "TestApp");
    writeFileSync(path.join(A, CHROME_DIR, "old-root.txt"), JSON.stringify({ copies: [{ root: far, entries: ["app.db"], movedAt: 1, moveId: "m0" }] }));
    const t0 = Date.now();
    const B = await move(A, tmp(), repo);
    expect(Date.now() - t0).toBeLessThan(8000);
    expect(oldCopies(B).map((c) => c.root)).toEqual([A, path.resolve(far)]);
    expect(readFileSync(path.join(B, "app.db"), "utf8")).toBe("db");
  } finally {
    Object.assign(volume, real);
    _forgetUnreachable();
  }
}, 20_000);

test("two moves in a row: the first old copy is known still (its moved-to re-pointed, a chain accepted) — removed, then Move back works", async () => {
  const { repo, old: A } = oldRootWithData();
  const X = await move(A, tmp(), repo);
  const Y = await move(X, tmp(), repo);
  // the move from X re-pointed A's record at Y
  expect(JSON.parse(readFileSync(path.join(A, CHROME_DIR, "moved-to.json"), "utf8")).root).toBe(Y);
  expect((await oldCopiesInfo(Y)).map((c) => [c.root, c.connected])).toEqual([
    [X, true],
    [A, true],
  ]);
  // a chain: A's record still naming X (A was out at the second move) — still A's own move, still known
  writeFileSync(path.join(A, CHROME_DIR, "moved-to.json"), JSON.stringify({ ...JSON.parse(readFileSync(path.join(A, CHROME_DIR, "moved-to.json"), "utf8")), root: X }));
  expect((await oldCopiesInfo(Y)).find((c) => c.root === A).connected).toBe(true);
  // a start on A reads through the chain to the data's folder
  expect((await oldCopyOf(A))?.root).toBe(Y);
  await removeOldCopy(Y, A);
  expect(existsSync(A)).toBe(false);
  expect(await move(Y, A, repo)).toBe(A); // Move back to the default
  expect(readFileSync(path.join(A, "app.db"), "utf8")).toBe("db");
});

test("a start on an old copy: where the data is, connected only when that folder can be used — else the start's own words", async () => {
  const { repo, old: A } = oldRootWithData();
  const pick = tmp();
  const B = await move(A, pick, repo);
  expect(await oldCopyOf(A)).toMatchObject({ root: B, connected: true, problem: null });
  renameSync(pick, `${pick}-out`); // B's drive out
  expect(await oldCopyOf(A)).toMatchObject({ root: B, connected: false, problem: null }); // connect it — no reason
  renameSync(`${pick}-out`, pick);
  // the eighteenth review's s16: there, but the start's check refuses it — never "restart the app to use it" (its
  // write probe can't be written: a folder holds the probe's name — the check's refusal, with no rights needed)
  const probe = path.join(B, `.write-probe-${process.pid}`);
  mkdirSync(probe);
  const o = await oldCopyOf(A);
  expect(o).toMatchObject({ root: B, connected: false, problem: expect.any(String) });
  expect(dataIsElsewhere({ folder: B, ...o })).toBe(`Your data is in ${B}, which can't be used now: ${o.problem}.`);
  rmSync(probe, { recursive: true });
  expect((await oldCopyOf(A)).connected).toBe(true);
  // "Use the default folder from now on": the pointer and the default's record go
  forgetPointer(ladder(repo));
  expect(existsSync(path.join(repo, "dataroot.txt"))).toBe(false);
  expect(existsSync(path.join(A, CHROME_DIR, "moved-to.json"))).toBe(false);
  expect(await oldCopyOf(A)).toBe(null);
});

// s10 (eighteenth): a look given up on still held one of Node's four file threads — four filled the pool
// s10 (eighteenth) and s2 b (nineteenth): a look given up on still holds one of Node's file threads, so one look of the
// system's per drive at a time; the "didn't answer" memo per path — a share reached through a junction on C: made
// every copy on C: "not found" for a minute when it was per drive
test("a path that doesn't answer is looked at once, then not for a minute; its drive takes one look at a time; other drives answer", async () => {
  // one drive (POSIX: a mount's first three names — the drive's key there)
  const slowDrive = path.parse(tmp()).root === "/" ? "/nonexistent-slow/vol/x" : "Z:\\";
  const real = volume.stat;
  let calls = 0;
  // the drive doesn't answer until the system lets go (~21 s for an offline share): then each look answers at once
  let stuck = true;
  const held = [];
  const answer = () => {
    stuck = false;
    for (const r of held) r(null);
  };
  volume.stat = (p) => {
    if (!path.resolve(p).toLowerCase().startsWith(slowDrive.toLowerCase())) return real(p);
    calls++;
    return stuck ? new Promise((r) => held.push(r)) : Promise.resolve(null);
  };
  try {
    _forgetUnreachable();
    const t0 = Date.now();
    // Storage opened several times at once, each looking at its own path on the drive: one look holds a file thread
    const share = path.join(slowDrive, "Share", "TestApp");
    const looks = [share, path.join(share, "x"), path.join(slowDrive, "Local", "OldCopy")].map((p) => folderProblem(p));
    // meanwhile a folder on another drive answers at once
    expect(await folderProblem(tmp())).toBe(null);
    expect(Date.now() - t0).toBeLessThan(1000);
    for (const r of await Promise.all(looks)) expect(r).toMatch(/didn't answer/);
    expect(Date.now() - t0).toBeGreaterThanOrEqual(2900);
    expect(Date.now() - t0).toBeLessThan(4500);
    expect(calls).toBe(1);
    // the path that didn't answer: not looked at again while the minute runs
    const t1 = Date.now();
    await Promise.all([1, 2, 3, 4].map(() => folderProblem(share)));
    expect(Date.now() - t1).toBeLessThan(500);
    expect(calls).toBe(1);
    // the system lets go of the stuck look: the drive's other paths are looked at again at once — never marked
    answer();
    await new Promise((r) => setTimeout(r, 20));
    expect(await folderProblem(path.join(slowDrive, "Local", "OldCopy"))).toBe("it isn't there");
    expect(calls).toBe(2);
    expect(await folderProblem(share)).toMatch(/didn't answer/); // its minute still runs
    // Try again (Storage): its memo dropped, looked at now
    _forgetUnreachable([share]);
    expect(await folderProblem(share)).toBe("it isn't there");
    expect(calls).toBe(3);
  } finally {
    volume.stat = real;
    _forgetUnreachable();
  }
}, 20_000);

// s15 (eighteenth): the start's check of a pointer on an offline share blocked the start 21 s
test("the start's check of a named folder whose drive doesn't answer says so, never waited on", () => {
  const repo = tmp();
  const far = path.join(tmp(), "far");
  mkdirSync(far);
  writeFileSync(path.join(repo, "dataroot.txt"), far);
  const root = resolveDataRoot(opts(repo));
  expect(dataRootProblem(root, { answers: () => false })).toBe("its drive didn't answer (a network folder offline, or a drive asleep)");
  expect(dataRootProblem(root)).toBe(null); // the worker's look answers at once here
  expect(answersInTime(far)).toBe(true);
});

test("the words when the data is elsewhere: connected, the variable's old copy, out", () => {
  expect(dataIsElsewhere({ folder: "E:\\Data", connected: true })).toBe("Your data is in E:\\Data — restart the app to use it.");
  expect(dataIsElsewhere({ folder: "E:\\Data", setBy: "JUST_HOUSE_PAINT_DATA_DIR", oldCopy: true })).toBe("JUST_HOUSE_PAINT_DATA_DIR names this old copy — change it to E:\\Data.");
  expect(dataIsElsewhere({ folder: "E:\\Data" })).toBe("Your data is in E:\\Data: connect it and restart, or Use the default folder from now on.");
  expect(dataIsElsewhere({ folder: "E:\\Data", setBy: "X" })).toBe("Your data is in E:\\Data: connect it and restart.");
});

// the undo said nothing of what it couldn't remove, and left the token's file when Chromium's folder was held
test("a failed move's undo removes the token's file first and says what it couldn't remove", async () => {
  const { repo, old } = oldRootWithData();
  const picked = tmp();
  const target = path.join(picked, "TestApp");
  const realRm = fsp.rm;
  const order = [];
  fsp.rm = async (p, o) => {
    order.push(path.basename(String(p)));
    if (path.basename(String(p)) === "logs" && String(p).startsWith(target)) throw Object.assign(new Error("EBUSY"), { code: "EBUSY" });
    return realRm(p, o);
  };
  const realOpen = fs.openSync;
  fs.openSync = (p, ...rest) => {
    if (String(p).endsWith("dataroot.txt.tmp")) throw Object.assign(new Error("EACCES: denied"), { code: "EACCES" });
    return realOpen(p, ...rest);
  };
  try {
    await expect(move(old, picked, repo, { token: "s3cr3t" })).rejects.toThrow(`(logs couldn't be removed from ${target} — a program may be holding a file in it)`);
  } finally {
    fsp.rm = realRm;
    fs.openSync = realOpen;
  }
  expect(order[0]).toBe("carried.json");
  expect(existsSync(path.join(target, CHROME_DIR, "carried.json"))).toBe(false);
});

// s3: a junction in the data folder (a models folder kept on another drive) failed every move ("the app isn't allowed
// to write there" — a symbolic link needs a right Windows gives only in Developer Mode; a junction needs none). Off
// Windows a folder's symbolic link, copied as it is.
test("a folder link in the data folder moves as a link to the same folder; removing the old copy leaves its files", async () => {
  const { repo, old } = oldRootWithData();
  const big = tmp();
  writeFileSync(path.join(big, "m.gguf"), "weights");
  symlinkSync(big, path.join(old, "models"), process.platform === "win32" ? "junction" : "dir");
  // a link that points inside the data folder: to the same place in the copy
  mkdirSync(path.join(old, "cache", "real"), { recursive: true });
  writeFileSync(path.join(old, "cache", "real", "x.bin"), "inside");
  if (process.platform === "win32") symlinkSync(path.join(old, "cache", "real"), path.join(old, "cache", "alias"), "junction");
  const B = await move(old, tmp(), repo);
  expect(lstatSync(path.join(B, "models")).isSymbolicLink()).toBe(true);
  expect(readFileSync(path.join(B, "models", "m.gguf"), "utf8")).toBe("weights");
  if (process.platform === "win32") {
    expect(realpathSync.native(path.join(B, "cache", "alias"))).toBe(path.join(B, "cache", "real"));
  }
  await removeOldCopy(B, old);
  expect(existsSync(old)).toBe(false);
  expect(readFileSync(path.join(big, "m.gguf"), "utf8")).toBe("weights"); // the junction went, never its folder
  expect(readFileSync(path.join(B, "models", "m.gguf"), "utf8")).toBe("weights");
});

// The dry run 39428267423 (2026-10-20): its Windows runner — an administrator, with the symbolic-link right — holds a
// file link in the model cache; every file link was refused. Now the process is asked once (`canSymlink`): with the
// right the links are copied as they are, without it a file's link is refused, named, before anything is copied.
// Both branches need a real file link, which only an account with the right can make — elsewhere these skip.
// the seventeenth review: off Windows an absolute link inside the data kept pointing into the old copy
test("a symbolic link whose absolute target is inside the data points into the copy", async () => {
  const { repo, old } = oldRootWithData();
  mkdirSync(path.join(old, "cache", "real"), { recursive: true });
  writeFileSync(path.join(old, "cache", "real", "x.bin"), "inside");
  try {
    symlinkSync(path.join(old, "cache", "real"), path.join(old, "cache", "alias"), "dir");
  } catch {
    return; // no right to make a symbolic link here (Windows without Developer Mode — junctions are tested above)
  }
  const target = await move(old, tmp(), repo);
  expect(readlinkSync(path.join(target, "cache", "alias"))).toBe(path.join(target, "cache", "real"));
  await removeOldCopy(target, old);
  expect(readFileSync(path.join(target, "cache", "alias", "x.bin"), "utf8")).toBe("inside");
});

test.runIf(process.platform === "win32")("a file link: copied as a link when this process may make one, refused in words when it may not", async () => {
  const { repo, old } = oldRootWithData();
  writeFileSync(path.join(old, "real.txt"), "x");
  try {
    symlinkSync("real.txt", path.join(old, "linked.txt"), "file");
  } catch {
    return; // no right to make a file's symbolic link here — nor can a user's data folder hold one made by this account
  }
  const picked = tmp();
  await expect(move(old, picked, repo, { canSymlink: async () => false })).rejects.toThrow(
    "The data folder holds a link to a file (linked.txt), which Windows lets the app make again only with Developer Mode on",
  );
  expect(readdirSync(picked)).toEqual([]);
  const target = await move(old, picked, repo, { canSymlink: async () => true });
  expect(readlinkSync(path.join(target, "linked.txt"))).toBe("real.txt");
  expect(readFileSync(path.join(target, "linked.txt"), "utf8")).toBe("x");
});

test.runIf(process.platform === "win32")("the symbolic-link probe answers and leaves nothing; PowerShell tells a junction from a symbolic link", async () => {
  const dir = tmp();
  expect(typeof (await canMakeSymlink(dir))).toBe("boolean");
  expect(readdirSync(dir)).toEqual([]);
  const target = tmp();
  symlinkSync(target, path.join(dir, "j"), "junction");
  expect(await windowsLinkKinds([path.join(dir, "j")])).toEqual(["Junction"]);
});

test.runIf(process.platform === "win32")("with the right, a junction is made again as a junction (never turned into a symbolic link)", async () => {
  const { repo, old } = oldRootWithData();
  const big = tmp();
  writeFileSync(path.join(big, "m.gguf"), "weights");
  symlinkSync(big, path.join(old, "models"), "junction");
  const asked = [];
  const target = await move(old, tmp(), repo, {
    canSymlink: async () => true,
    linkKinds: async (paths) => {
      asked.push(...paths);
      return paths.map(() => "Junction");
    },
  });
  expect(asked).toEqual([path.join(old, "models")]);
  expect(await windowsLinkKinds([path.join(target, "models")])).toEqual(["Junction"]);
  expect(readFileSync(path.join(target, "models", "m.gguf"), "utf8")).toBe("weights");
});

// the nineteenth review's s2 a: old copies recorded by the fifteenth to seventeenth builds (no move id) were stranded by
// one move — their moved-to.json still named the old root
test("an old copy recorded without a move id is re-pointed by the next move when its moved-to names the old root", async () => {
  const repo = tmp();
  const A = path.join(tmp(), "A");
  const B = path.join(tmp(), "B");
  for (const d of [A, B]) mkdirSync(path.join(d, CHROME_DIR), { recursive: true });
  writeFileSync(path.join(A, "app.db"), "the old copy");
  writeFileSync(path.join(B, "app.db"), "db");
  // what a seventeenth build left: B's record of A without an id, A's moved-to naming B (with its volume then)
  writeFileSync(path.join(B, CHROME_DIR, "old-root.txt"), JSON.stringify({ copies: [{ root: A, entries: ["app.db"], movedAt: 1 }] }));
  writeFileSync(path.join(A, CHROME_DIR, "moved-to.json"), JSON.stringify({ root: B, movedAt: 1, dev: "123:456" }));
  writeFileSync(path.join(repo, "dataroot.txt"), B);
  expect(await oldCopiesInfo(B)).toMatchObject([{ root: A, connected: true }]);
  const C = await move(B, tmp(), repo);
  expect(JSON.parse(readFileSync(path.join(A, CHROME_DIR, "moved-to.json"), "utf8"))).toMatchObject({ root: C, dev: "123:456" });
  expect((await oldCopiesInfo(C)).map((c) => [c.root, c.connected])).toEqual([
    [B, true],
    [A, true],
  ]);
  await removeOldCopy(C, A);
  expect(existsSync(path.join(A, "app.db"))).toBe(false); // what its record lists (that version listed the data alone)
});

// the nineteenth review's s2 c: "connected" for the variable's folder wasn't the start's check (a 210-character path)
test("where the data is, by the start's own check for its source: the variable's folder is held to the path rule", async () => {
  const long = path.join(tmp(), "x".repeat(200), "TestApp");
  mkdirSync(long, { recursive: true });
  expect(await dataFolderState(long, { source: "variable" })).toEqual({ folder: long, connected: false, problem: `its path is longer than ${dataPaths.MAX_DATA_DIR_CHARS} characters` });
  // a pointer made before the rule: used as it is
  expect(await dataFolderState(long, { source: "pointer" })).toEqual({ folder: long, connected: true, problem: null });
});

// the nineteenth review's s4: the sweep's own-marker comparisons (realpathSync) on an offline share held the main
// process 21 s
test("the start's sweep of a half copy whose marker names a folder on a drive that doesn't answer isn't held by it", async () => {
  const slowDrive = path.parse(tmp()).root === "/" ? "/nonexistent-slow/vol/x" : "Z:\\";
  const slow = (p) => path.resolve(p).toLowerCase().startsWith(slowDrive.toLowerCase());
  const real = { ...volume };
  volume.stat = (p) => (slow(p) ? new Promise(() => {}) : real.stat(p));
  volume.realpath = (p) => (slow(p) ? new Promise(() => {}) : real.realpath(p));
  try {
    _forgetUnreachable();
    const repo = tmp();
    const root = path.join(repo, "data"); // the default, a "Use the default folder" start
    const share = path.join(slowDrive, "Share", "TestApp");
    mkdirSync(path.join(root, CHROME_DIR), { recursive: true });
    writeFileSync(path.join(root, "app.db"), "half");
    writeFileSync(path.join(root, ".moving"), JSON.stringify({ root: share, entries: ["app.db"], made: false }));
    writeFileSync(path.join(repo, "dataroot.txt"), share);
    let ticks = 0;
    const timer = setInterval(() => ticks++, 100);
    const t0 = Date.now();
    await sweepUnfinishedMove(root, ladder(repo));
    clearInterval(timer);
    const took = Date.now() - t0;
    expect(took).toBeLessThan(8000);
    expect(ticks).toBeGreaterThan(took / 100 - 10); // the event loop ran meanwhile
    expect(existsSync(path.join(root, "app.db"))).toBe(false); // the half copy of a move back that never committed
  } finally {
    Object.assign(volume, real);
    _forgetUnreachable();
  }
}, 20_000);

// the nineteenth review: the sweep dropped its record for a target at a drive's root when another stick was in — the
// half copy on the stick that wasn't
test("the sweep keeps its record until the target answers to the move's id — then clears the half copy", async () => {
  const { repo, old } = oldRootWithData();
  const drive = tmp(); // the drive's root: always there, whatever stick is in
  const target = path.join(drive, "TestApp");
  const record = path.join(old, CHROME_DIR, "moving-to.json");
  writeFileSync(record, JSON.stringify({ target, moveId: "m1" }));
  // no TestApp on the stick in now: kept
  await sweepUnfinishedMove(old, ladder(repo));
  expect(existsSync(record)).toBe(true);
  // another stick's TestApp, a marker of another move: kept, its folder untouched
  mkdirSync(target);
  writeFileSync(path.join(target, "app.db"), "another stick's");
  writeFileSync(path.join(target, ".moving"), JSON.stringify({ root: old, entries: ["app.db"], made: true, moveId: "m0" }));
  await sweepUnfinishedMove(old, ladder(repo));
  expect(existsSync(record)).toBe(true);
  expect(readFileSync(path.join(target, "app.db"), "utf8")).toBe("another stick's");
  // the move's own half copy: cleared, the record dropped
  writeFileSync(path.join(target, ".moving"), JSON.stringify({ root: old, entries: ["app.db"], made: true, moveId: "m1" }));
  await sweepUnfinishedMove(old, ladder(repo));
  expect(existsSync(target)).toBe(false);
  expect(existsSync(record)).toBe(false);
  expect(readFileSync(path.join(old, "app.db"), "utf8")).toBe("db");
});
