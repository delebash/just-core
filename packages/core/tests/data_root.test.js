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
  appHome,
  CHROME_DIR,
  dataDirSetBy,
  dataRootProblem,
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
  expect(record).toEqual({ root: old, entries: ["app.db", "logs", CHROME_DIR, LOCK_NAME], movedAt: expect.any(Number) });
  // the old folder says where its data went (its Chromium folder: removed with the old copy)
  expect(oldCopyOf(old)).toEqual({ root: target, movedAt: record.movedAt });
  expect(oldCopyOf(target)).toBe(null);
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
  expect(oldCopies(root)).toEqual([{ root: old, entries: ["a.txt"], movedAt: null }]);
  await removeOldCopy(root, old);
  expect(existsSync(old)).toBe(false);
  expect(existsSync(path.join(parent, "outside.txt"))).toBe(true);
});

test("an earlier version's record (the old root alone, or {root, entries}) is read as one old copy", () => {
  const root = tmp();
  mkdirSync(path.join(root, CHROME_DIR));
  const old = tmp();
  writeFileSync(path.join(root, CHROME_DIR, "old-root.txt"), old);
  expect(oldCopies(root)).toEqual([{ root: old, entries: [CHROME_DIR], movedAt: null }]);
  writeFileSync(path.join(root, CHROME_DIR, "old-root.txt"), JSON.stringify({ root: old, entries: ["app.db"] }));
  expect(oldCopies(root)).toEqual([{ root: old, entries: ["app.db"], movedAt: null }]);
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
  expect(oldCopyOf(D)).toEqual({ root: E, movedAt });
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
  expect(lastChanged(D, ["app.db", "houses"])).toBeLessThan(movedAt + 2000);
  expect((await oldCopiesInfo(E))[0].changedAt).toBe(null);
  // the user's work: the database written — every run writes its files (the database, its -wal beside it)
  utimesSync(path.join(D, "app.db"), later, later);
  expect(lastChanged(D, ["app.db", "houses"])).toBe(later.getTime());
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

// ── the sixteenth review's attack on the fifteenth's code (2026-10-20; its scripts: the scratchpad's adv16/shell) ──

// s1, case A: a second launch of the app while Change folder copies swept the copy under way (its sweep ran before
// the single-instance lock — main.js now takes the lock first; and the record names the copying process)
test("a start while another process copies leaves the copy alone (its pid), and the move finishes whole", async () => {
  const { repo, old } = oldRootWithData();
  const picked = tmp();
  const target = path.join(picked, "TestApp");
  let swept = false;
  const copy = async (src, dst, o) => {
    await fsp.cp(src, dst, o);
    if (!swept) {
      swept = true;
      // the second launch: the same root (no pointer yet), the record's process alive
      expect(JSON.parse(readFileSync(path.join(old, CHROME_DIR, "moving-to.json"), "utf8"))).toEqual({ target, pid: process.pid });
      await sweepUnfinishedMove(resolveDataRoot(opts(repo)), { ...ladder(repo), alive: (pid) => pid === process.pid });
      expect(existsSync(path.join(target, ".moving"))).toBe(true);
    }
  };
  expect(await move(old, picked, repo, { copy })).toBe(target);
  expect(readFileSync(path.join(target, "app.db"), "utf8")).toBe("db");
  expect(readFileSync(path.join(target, "logs", "a.log"), "utf8")).toBe("log");
});

// s1, case B: a sweep between the copy's check and the pointer's commit emptied the folder the pointer then named
test("once the copy is whole its marker says committed: a sweep at the pointer's step never empties it", async () => {
  const { repo, old } = oldRootWithData();
  const picked = tmp();
  const target = path.join(picked, "TestApp");
  const realOpen = fs.openSync;
  let seen = null;
  fs.openSync = (p, ...rest) => {
    if (String(p).endsWith("dataroot.txt.tmp") && !seen) {
      seen = JSON.parse(readFileSync(path.join(target, ".moving"), "utf8"));
      // the worst case: a process that can't be told alive (its pid gone or reused)
      void sweepUnfinishedMove(old, { ...ladder(repo), alive: () => false });
    }
    return realOpen(p, ...rest);
  };
  try {
    expect(await move(old, picked, repo)).toBe(target);
  } finally {
    fs.openSync = realOpen;
  }
  expect(seen).toMatchObject({ root: old, committed: true });
  // the new root's own records were written before the commit
  expect(oldCopies(target).map((c) => c.root)).toEqual([old]);
  await new Promise((r) => setTimeout(r, 50));
  expect(readFileSync(path.join(target, "app.db"), "utf8")).toBe("db");
  expect(readFileSync(path.join(repo, "dataroot.txt"), "utf8")).toBe(target);
});

test("a move to the default folder stopped after its pointer's step is never swept (its marker committed)", async () => {
  // the finding: the default as the target, the pointer removed, the marker still there — a start on the old folder
  // (the variable) swept the default's data as an unfinished copy
  const repo = tmp();
  const def = path.join(repo, "data");
  mkdirSync(path.join(def, CHROME_DIR), { recursive: true });
  writeFileSync(path.join(def, "app.db"), "the moved db");
  const old = tmp();
  mkdirSync(path.join(old, CHROME_DIR));
  writeFileSync(path.join(def, ".moving"), JSON.stringify({ root: old, entries: ["app.db"], made: false, pid: 99999999, committed: true }));
  writeFileSync(path.join(old, CHROME_DIR, "moving-to.json"), JSON.stringify({ target: def, pid: 99999999 }));
  await sweepUnfinishedMove(old, { ...ladder(repo), alive: () => false });
  expect(readFileSync(path.join(def, "app.db"), "utf8")).toBe("the moved db");
  expect(existsSync(path.join(old, CHROME_DIR, "moving-to.json"))).toBe(false);
});

// s5: the stick pulled (often why the copy stopped): the record went at the next start, and the half copy stayed
// for good once the stick was back
test("a half copy whose drive isn't there at the next start keeps its record — swept once the drive is back", async () => {
  const { repo, old } = oldRootWithData();
  const stick = tmp();
  const target = path.join(stick, "TestApp");
  mkdirSync(target);
  writeFileSync(path.join(target, "app.db"), "half");
  writeFileSync(path.join(target, ".moving"), JSON.stringify({ root: old, entries: ["app.db", "logs"], made: true, pid: 99999999, committed: false }));
  writeFileSync(path.join(old, CHROME_DIR, "moving-to.json"), JSON.stringify({ target, pid: 99999999 }));
  renameSync(stick, `${stick}-out`); // unplugged
  await sweepUnfinishedMove(old, { ...ladder(repo), alive: () => false });
  expect(existsSync(path.join(old, CHROME_DIR, "moving-to.json"))).toBe(true);
  renameSync(`${stick}-out`, stick); // back
  await sweepUnfinishedMove(old, { ...ladder(repo), alive: () => false });
  expect(existsSync(target)).toBe(false);
  expect(existsSync(path.join(old, CHROME_DIR, "moving-to.json"))).toBe(false);
  expect(readFileSync(path.join(old, "app.db"), "utf8")).toBe("db");
});

// s6: the data moved from a USB stick to the computer; Storage opened with the stick out forgot the old copy for good
test("an old copy whose drive isn't there is listed as not connected and kept — never forgotten for that", async () => {
  const repo = tmp();
  const stick = tmp();
  const A = path.join(stick, "TestApp");
  mkdirSync(A);
  writeFileSync(path.join(A, "app.db"), "db");
  writeFileSync(path.join(repo, "dataroot.txt"), A);
  const B = await move(A, tmp(), repo);
  renameSync(stick, `${stick}-out`);
  expect(await oldCopiesInfo(B)).toEqual([{ root: A, bytes: null, movedAt: expect.any(Number), changedAt: null, connected: false }]);
  await expect(removeOldCopy(B, A)).rejects.toThrow(`The old copy in ${A} isn't connected — connect its drive, then remove it.`);
  renameSync(`${stick}-out`, stick);
  expect(await oldCopiesInfo(B)).toMatchObject([{ root: A, connected: true }]);
  // its drive there and nothing of it left (removed by hand): forgotten
  rmSync(A, { recursive: true, force: true });
  expect(await oldCopiesInfo(B)).toEqual([]);
});

// s2: Use the default folder from now on — the default's record of where its data went goes with it; a deleted
// folder named by that record is no banner either
test("from now on, the default's moved-to record goes; a record naming a folder that's gone says nothing", async () => {
  const { repo, old: A } = oldRootWithData();
  const pick = tmp();
  const B = await move(A, pick, repo);
  expect(oldCopyOf(A)?.root).toBe(B);
  // B's drive out: still said (the data may be there)
  renameSync(pick, `${pick}-out`);
  expect(oldCopyOf(A)?.root).toBe(B);
  renameSync(`${pick}-out`, pick);
  // B deleted, its drive there: nothing to say
  rmSync(B, { recursive: true, force: true });
  expect(oldCopyOf(A)).toBe(null);
  // "Use the default folder from now on": the pointer and the default's record go
  writeFileSync(path.join(A, CHROME_DIR, "moved-to.json"), JSON.stringify({ root: path.join(tmp(), "Elsewhere"), movedAt: 1 }));
  forgetPointer(ladder(repo));
  expect(existsSync(path.join(repo, "dataroot.txt"))).toBe(false);
  expect(existsSync(path.join(A, CHROME_DIR, "moved-to.json"))).toBe(false);
  expect(oldCopyOf(A)).toBe(null);
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

test.runIf(process.platform === "win32")("a link to a file in the data folder is named in the refusal, before anything is copied", async () => {
  const { repo, old } = oldRootWithData();
  writeFileSync(path.join(old, "real.txt"), "x");
  try {
    symlinkSync(path.join(old, "real.txt"), path.join(old, "linked.txt"), "file");
  } catch {
    return; // no right to make a file's symbolic link here — nor can a user's data folder hold one made by this account
  }
  const picked = tmp();
  await expect(move(old, picked, repo)).rejects.toThrow("The data folder holds a link to a file (linked.txt), which Windows lets the app make again only with Developer Mode on");
  expect(readdirSync(picked)).toEqual([]);
});
