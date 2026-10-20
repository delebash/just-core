// SPDX-License-Identifier: MIT
// THE family data-folder ladder (platform/data_paths.js + shell/dataRoot.js) — the one module
// the desktop shell and the headless server share since the Electron move, with the answers
// of 2026-10-08: the OS fallback is %LOCALAPPDATA%\<App>\<App>, its pointer
// %LOCALAPPDATA%\<App>\dataroot.txt, Chromium's folder `electron`. JS-only (the Python ladder
// never read the pointer — the kit FINDING this closes).
import { existsSync, mkdirSync, mkdtempSync, promises as fsp, readdirSync, readFileSync, statSync, utimesSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { expect, test, vi } from "vitest";
import * as dataPaths from "../src/platform/data_paths.js";
import { CHROME_DIR, dataRootProblem, MOVE_UNDER_WAY, relocate, resolveDataRoot, storageInfo, sweepOldChromeDir, useDefaultRoot } from "../src/shell/dataRoot.js";

const tmp = () => mkdtempSync(path.join(tmpdir(), "ladder-"));
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

test("a move copies, commits the pointer, empties the old root and sweeps Chromium's next start", async () => {
  const repo = tmp();
  const old = path.join(repo, "data");
  mkdirSync(path.join(old, "logs"), { recursive: true });
  mkdirSync(path.join(old, CHROME_DIR), { recursive: true });
  writeFileSync(path.join(old, "app.db"), "db");
  writeFileSync(path.join(old, "logs", "a.log"), "log");
  writeFileSync(path.join(old, CHROME_DIR, "Cookies"), "open while running");
  const picked = tmp();
  const target = path.join(picked, "TestApp");
  expect(await relocate({ oldRoot: old, newRoot: picked, appName: "TestApp", packaged: false, repoRoot: repo })).toBe(target);
  expect(readFileSync(path.join(target, "app.db"), "utf8")).toBe("db");
  expect(readFileSync(path.join(target, "logs", "a.log"), "utf8")).toBe("log");
  expect(existsSync(path.join(target, CHROME_DIR, "Cookies"))).toBe(false); // Chromium rebuilds its own
  expect(readFileSync(path.join(repo, "dataroot.txt"), "utf8")).toBe(target);
  expect(existsSync(path.join(old, "app.db"))).toBe(false);
  expect(existsSync(path.join(old, CHROME_DIR))).toBe(true); // still held by the running app
  expect(resolveDataRoot(opts(repo))).toBe(target);
  sweepOldChromeDir(target); // the next start
  expect(existsSync(old)).toBe(false);
  expect(storageInfo({ root: target, appName: "TestApp", repoRoot: repo, packaged: false })).toEqual({
    root: target,
    default: path.join(repo, "data"),
    portable: false,
  });
});

// ── Change folder: into a new folder named for the app inside the one picked (2026-10-20) ──────────
// The picker returns a folder that exists (renaming onto it was EPERM on Windows); the data goes into a new folder
// named for the app inside it — the picked folder's own files are never touched (the fourteenth review: a known
// folder like Documents, holding only desktop.ini, counted as empty and was deleted whole after a later move).

/** An old root with a database, a log and Chromium's folder; the repo whose pointer the move writes. */
function oldRootWithData() {
  const repo = tmp();
  const old = path.join(repo, "data");
  mkdirSync(path.join(old, "logs"), { recursive: true });
  mkdirSync(path.join(old, CHROME_DIR), { recursive: true });
  writeFileSync(path.join(old, "app.db"), "db");
  writeFileSync(path.join(old, "logs", "a.log"), "log");
  return { repo, old };
}
const move = (old, picked, repo, more = {}) => relocate({ oldRoot: old, newRoot: picked, appName: "TestApp", packaged: false, repoRoot: repo, ...more });

test("the data moves into a new folder named for the app; the picked folder's own files are never touched", async () => {
  const { repo, old } = oldRootWithData();
  const picked = path.join(tmp(), "Documents");
  mkdirSync(picked);
  writeFileSync(path.join(picked, "desktop.ini"), "[.ShellClassInfo]");
  writeFileSync(path.join(picked, "holiday.jpg"), "mine");
  // the shell's productName, made safe for a folder name
  const target = path.join(picked, "Just Demo");
  expect(await move(old, picked, repo, { folderName: "Just: Demo." })).toBe(target);
  expect(readFileSync(path.join(target, "app.db"), "utf8")).toBe("db");
  expect(readFileSync(path.join(target, "logs", "a.log"), "utf8")).toBe("log");
  expect(existsSync(path.join(target, ".moving"))).toBe(false); // marked whole
  expect(readdirSync(picked).sort()).toEqual(["Just Demo", "desktop.ini", "holiday.jpg"]);
  expect(readFileSync(path.join(picked, "holiday.jpg"), "utf8")).toBe("mine");
  expect(readFileSync(path.join(repo, "dataroot.txt"), "utf8")).toBe(target);
  expect(existsSync(path.join(old, "app.db"))).toBe(false);
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
  for (const picked of [old, path.join(old, "sub")]) {
    await expect(move(old, picked, repo)).rejects.toThrow(`The folder ${picked} is inside the current data folder — choose a folder outside it.`);
  }
  expect(readdirSync(old).sort()).toEqual(["app.db", CHROME_DIR, "logs", "sub"]);
});

test("a picked folder that isn't there is said missing — never made", async () => {
  const { repo, old } = oldRootWithData();
  const picked = path.join(tmp(), "Gone");
  await expect(move(old, picked, repo)).rejects.toThrow(`The folder ${picked} can't hold the data: it isn't there`);
  expect(existsSync(picked)).toBe(false);
  expect(readFileSync(path.join(old, "app.db"), "utf8")).toBe("db");
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

test("the copy keeps the files' times — the engines know their files by size and time", async () => {
  const { repo, old } = oldRootWithData();
  const then = new Date("2024-03-01T10:00:00Z");
  utimesSync(path.join(old, "app.db"), then, then);
  utimesSync(path.join(old, "logs", "a.log"), then, then);
  const target = await move(old, tmp(), repo);
  expect(statSync(path.join(target, "app.db")).mtimeMs).toBe(then.getTime());
  expect(statSync(path.join(target, "logs", "a.log")).mtimeMs).toBe(then.getTime());
});

test("the copy is async — fs.promises.cp with the times kept, the window never waits on it", async () => {
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
  for (const [, , options] of copies) expect(options).toEqual({ recursive: true, preserveTimestamps: true });
  expect(readFileSync(path.join(picked, "TestApp", "app.db"), "utf8")).toBe("db");
});

test("a copy that fails leaves the picked folder as it was and the old root in use", async () => {
  const { repo, old } = oldRootWithData();
  // half the files land, then the drive goes
  const copy = async (_src, dest) => {
    writeFileSync(path.join(path.dirname(dest), "app.db"), "half");
    throw Object.assign(new Error("EIO: i/o error, write"), { code: "EIO" });
  };
  const picked = tmp();
  await expect(move(old, picked, repo, { copy })).rejects.toThrow("copy failed: EIO: i/o error, write");
  expect(readdirSync(picked)).toEqual([]); // the app's folder the move made is gone
  expect(existsSync(path.join(repo, "dataroot.txt"))).toBe(false);
  expect(readFileSync(path.join(old, "app.db"), "utf8")).toBe("db");
  // an app folder that was there (empty) is left as it was
  const there = path.join(picked, "TestApp");
  mkdirSync(there);
  await expect(move(old, picked, repo, { copy })).rejects.toThrow("copy failed");
  expect(readdirSync(there)).toEqual([]);
});

test("a move of this old root that never finished (the app closed midway) is cleared and done", async () => {
  const { repo, old } = oldRootWithData();
  const picked = tmp();
  const target = path.join(picked, "TestApp");
  mkdirSync(target);
  writeFileSync(path.join(target, ".moving"), old);
  writeFileSync(path.join(target, "app.db"), "half");
  expect(await move(old, picked, repo)).toBe(target);
  expect(readFileSync(path.join(target, "app.db"), "utf8")).toBe("db");
});

test("a .moving that names another folder is never cleared — that copy isn't this move's", async () => {
  const { repo, old } = oldRootWithData();
  const picked = tmp();
  const target = path.join(picked, "TestApp");
  mkdirSync(target);
  writeFileSync(path.join(target, ".moving"), path.join(tmp(), "another-old-root"));
  writeFileSync(path.join(target, "app.db"), "theirs");
  await expect(move(old, picked, repo)).rejects.toThrow(`The folder ${target} already exists and isn't empty`);
  expect(readFileSync(path.join(target, "app.db"), "utf8")).toBe("theirs");
  expect(readFileSync(path.join(old, "app.db"), "utf8")).toBe("db");
});

test("two moves at once: the second is refused in words, the first finishes whole", async () => {
  // the reviewer's relocate_race.mjs: the window's button re-enabled by a remount, a second Change folder into
  // the same folder while the first copied — the first's copy was wiped as unfinished, the old root emptied
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
  await vi.waitFor(() => expect(existsSync(path.join(target, ".moving"))).toBe(true));
  await expect(move(old, picked, repo, { copy: slow })).rejects.toThrow(MOVE_UNDER_WAY);
  expect(MOVE_UNDER_WAY).toBe("The data folder is already being moved — wait for that move to finish.");
  open();
  expect(await first).toBe(target);
  expect(readdirSync(path.join(target, "houses")).length).toBe(40);
  expect(readFileSync(path.join(target, "app.db"), "utf8")).toBe("db");
  expect(readFileSync(path.join(repo, "dataroot.txt"), "utf8")).toBe(target);
  expect(existsSync(path.join(old, "houses"))).toBe(false);
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

// ── the next start's cleanup of the old folder (2026-10-20) ───────────────────

test("the next start removes only what the move copied, then the old folder only when empty", async () => {
  // the reviewer's relocate_docs.mjs: the data moved into Documents, the user kept a letter there, a later move
  // went elsewhere — and the next start deleted Documents whole
  const { repo, old } = oldRootWithData();
  const docs = path.join(tmp(), "Documents");
  mkdirSync(docs);
  writeFileSync(path.join(docs, "desktop.ini"), "[.ShellClassInfo]");
  const first = await move(old, docs, repo);
  sweepOldChromeDir(first); // the next start
  expect(existsSync(old)).toBe(false); // the old root held only what was moved
  writeFileSync(path.join(docs, "my-letter.docx"), "the user's own file");
  const elsewhere = tmp();
  const second = await move(first, elsewhere, repo);
  sweepOldChromeDir(second); // the next start
  expect(readdirSync(docs).sort()).toEqual(["desktop.ini", "my-letter.docx"]);
  expect(readFileSync(path.join(docs, "my-letter.docx"), "utf8")).toBe("the user's own file");
  expect(readFileSync(path.join(second, "app.db"), "utf8")).toBe("db");
});

test("a file put in the old folder after the move stays, and so does the folder", async () => {
  const { repo, old } = oldRootWithData();
  const target = await move(old, tmp(), repo);
  writeFileSync(path.join(old, "later.txt"), "kept");
  sweepOldChromeDir(target);
  expect(readdirSync(old)).toEqual(["later.txt"]);
  expect(existsSync(path.join(target, CHROME_DIR, "old-root.txt"))).toBe(false); // swept once
});

test("an earlier version's marker (the old root's path alone): its Chromium folder goes, the folder only when empty", () => {
  const root = tmp();
  const old = tmp();
  mkdirSync(path.join(old, CHROME_DIR));
  writeFileSync(path.join(old, "held.bin"), "a file a scanner held at the move");
  mkdirSync(path.join(root, CHROME_DIR));
  writeFileSync(path.join(root, CHROME_DIR, "old-root.txt"), old);
  sweepOldChromeDir(root);
  expect(readdirSync(old)).toEqual(["held.bin"]);
  // and one with nothing left but Chromium's folder is removed
  const emptied = tmp();
  mkdirSync(path.join(emptied, CHROME_DIR));
  writeFileSync(path.join(root, CHROME_DIR, "old-root.txt"), emptied);
  sweepOldChromeDir(root);
  expect(existsSync(emptied)).toBe(false);
});

test("a marker never reaches the root in use, nor past the old folder's own entries", () => {
  const parent = tmp();
  const root = path.join(parent, "Root");
  mkdirSync(path.join(root, CHROME_DIR), { recursive: true });
  writeFileSync(path.join(parent, "keep.txt"), "x");
  writeFileSync(path.join(root, CHROME_DIR, "old-root.txt"), JSON.stringify({ root: parent, entries: ["Root", "keep.txt"] }));
  sweepOldChromeDir(root);
  expect(existsSync(root)).toBe(true);
  expect(existsSync(path.join(parent, "keep.txt"))).toBe(true);
  const old = tmp();
  writeFileSync(path.join(old, "a.txt"), "x");
  writeFileSync(path.join(parent, "outside.txt"), "x");
  writeFileSync(path.join(root, CHROME_DIR, "old-root.txt"), JSON.stringify({ root: old, entries: ["..", `..${path.sep}outside.txt`] }));
  sweepOldChromeDir(root);
  expect(existsSync(path.join(old, "a.txt"))).toBe(true);
  expect(existsSync(path.join(parent, "outside.txt"))).toBe(true);
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

test("Use the default folder: this start only — the pointer is kept, the next start looks for the data again", () => {
  const repo = tmp();
  const gone = path.join(tmp(), "gone-drive");
  writeFileSync(path.join(repo, "dataroot.txt"), gone);
  expect(useDefaultRoot({ appName: "TestApp", repoRoot: repo, packaged: false })).toBe(path.join(repo, "data"));
  expect(readFileSync(path.join(repo, "dataroot.txt"), "utf8")).toBe(gone);
  expect(resolveDataRoot(opts(repo))).toBe(gone);
});
