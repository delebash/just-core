// SPDX-License-Identifier: MIT
// THE family data-folder ladder (platform/data_paths.js + shell/dataRoot.js) — the one module
// the desktop shell and the headless server share since the Electron move, with the answers
// of 2026-10-08: the OS fallback is %LOCALAPPDATA%\<App>\<App>, its pointer
// %LOCALAPPDATA%\<App>\dataroot.txt, Chromium's folder `electron`. JS-only (the Python ladder
// never read the pointer — the kit FINDING this closes).
import { existsSync, mkdirSync, mkdtempSync, promises as fsp, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { expect, test, vi } from "vitest";
import * as dataPaths from "../src/platform/data_paths.js";
import { CHROME_DIR, dataRootProblem, relocate, resolveDataRoot, storageInfo, sweepOldChromeDir, useDefaultRoot } from "../src/shell/dataRoot.js";

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
});

test("a move copies, commits the pointer, empties the old root and sweeps Chromium's next start", async () => {
  const repo = tmp();
  const old = path.join(repo, "data");
  mkdirSync(path.join(old, "logs"), { recursive: true });
  mkdirSync(path.join(old, CHROME_DIR), { recursive: true });
  writeFileSync(path.join(old, "app.db"), "db");
  writeFileSync(path.join(old, "logs", "a.log"), "log");
  writeFileSync(path.join(old, CHROME_DIR, "Cookies"), "open while running");
  const target = path.join(tmp(), "NewHome");
  expect(await relocate({ oldRoot: old, newRoot: target, appName: "TestApp", packaged: false, repoRoot: repo })).toBe(target);
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

// ── Change folder into the folder the picker hands back (2026-10-20) ──────────
// The picker returns a folder that exists: renaming the staged copy onto it was EPERM on Windows, every time,
// leaving a full copy beside it; and cpSync froze the window.

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
const move = (old, target, repo, more = {}) => relocate({ oldRoot: old, newRoot: target, appName: "TestApp", packaged: false, repoRoot: repo, ...more });

test("a move into the empty folder the picker made moves the data into it", async () => {
  const { repo, old } = oldRootWithData();
  const picked = path.join(tmp(), "Picked");
  mkdirSync(picked); // the picker's "New folder"
  expect(await move(old, picked, repo)).toBe(picked);
  expect(readFileSync(path.join(picked, "app.db"), "utf8")).toBe("db");
  expect(readFileSync(path.join(picked, "logs", "a.log"), "utf8")).toBe("log");
  expect(existsSync(path.join(picked, ".moving"))).toBe(false); // marked whole
  expect(existsSync(`${picked}.moving`)).toBe(false); // nothing staged beside it
  expect(readFileSync(path.join(repo, "dataroot.txt"), "utf8")).toBe(picked);
  expect(existsSync(path.join(old, "app.db"))).toBe(false);
});

test("a folder only the system wrote in (.DS_Store, Thumbs.db) is empty", async () => {
  const { repo, old } = oldRootWithData();
  const picked = path.join(tmp(), "Picked");
  mkdirSync(picked);
  writeFileSync(path.join(picked, ".DS_Store"), "finder");
  expect(await move(old, picked, repo)).toBe(picked);
  expect(readFileSync(path.join(picked, "app.db"), "utf8")).toBe("db");
});

test("a folder that isn't empty is refused in words; nothing is copied or changed", async () => {
  const { repo, old } = oldRootWithData();
  const picked = path.join(tmp(), "Photos");
  mkdirSync(picked);
  writeFileSync(path.join(picked, "holiday.jpg"), "mine");
  await expect(move(old, picked, repo)).rejects.toThrow(`The folder ${picked} isn't empty — choose an empty folder for the data.`);
  expect(readdirSync(picked)).toEqual(["holiday.jpg"]);
  expect(existsSync(path.join(repo, "dataroot.txt"))).toBe(false);
  expect(readFileSync(path.join(old, "app.db"), "utf8")).toBe("db");
});

test("the copy is async — fs.promises.cp, the window never waits on it", async () => {
  const { repo, old } = oldRootWithData();
  const copies = [];
  const copy = async (...args) => {
    copies.push(args);
    await new Promise((r) => setTimeout(r, 10));
    return fsp.cp(...args);
  };
  const target = path.join(tmp(), "Async");
  const moving = move(old, target, repo, { copy });
  expect(moving).toBeInstanceOf(Promise);
  expect(await moving).toBe(target);
  expect(copies.length).toBe(1);
  expect(readFileSync(path.join(target, "app.db"), "utf8")).toBe("db");
});

test("a copy that fails leaves the picked folder as it was and the old root in use", async () => {
  const { repo, old } = oldRootWithData();
  const picked = path.join(tmp(), "Picked");
  mkdirSync(picked);
  // half the files land, then the drive goes
  const copy = async (_src, dest) => {
    writeFileSync(path.join(dest, "app.db"), "half");
    throw Object.assign(new Error("EIO: i/o error, write"), { code: "EIO" });
  };
  await expect(move(old, picked, repo, { copy })).rejects.toThrow("copy failed: EIO: i/o error, write");
  expect(readdirSync(picked)).toEqual([]);
  expect(existsSync(path.join(repo, "dataroot.txt"))).toBe(false);
  expect(readFileSync(path.join(old, "app.db"), "utf8")).toBe("db");
  // a folder the move made is removed whole
  const made = path.join(tmp(), "Made");
  await expect(move(old, made, repo, { copy })).rejects.toThrow("copy failed");
  expect(existsSync(made)).toBe(false);
});

test("a move into a folder that never finished (the app closed midway) is cleared and done", async () => {
  const { repo, old } = oldRootWithData();
  const picked = path.join(tmp(), "Picked");
  mkdirSync(picked);
  writeFileSync(path.join(picked, ".moving"), old);
  writeFileSync(path.join(picked, "app.db"), "half");
  expect(await move(old, picked, repo)).toBe(picked);
  expect(readFileSync(path.join(picked, "app.db"), "utf8")).toBe("db");
});

test("a folder the native code can't use is refused in words, before anything moves", async () => {
  const { repo, old } = oldRootWithData();
  const dotted = path.join(tmp(), "data.");
  await expect(move(old, dotted, repo)).rejects.toThrow(`The data folder ${dotted} can't be used: its name ends in a dot or a space, which Windows drops`);
  const long = path.join(tmp(), "x".repeat(200));
  await expect(move(old, long, repo)).rejects.toThrow("its path is longer than 180 characters");
  expect(existsSync(long)).toBe(false);
  expect(readFileSync(path.join(old, "app.db"), "utf8")).toBe("db");
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

test("a pointer naming a path the native code can't take is refused at start; the default never is", () => {
  const repo = tmp();
  const dotted = path.join(tmp(), "data.");
  writeFileSync(path.join(repo, "dataroot.txt"), dotted);
  const root = resolveDataRoot(opts(repo));
  expect(root).toBe(dotted);
  expect(dataRootProblem(root)).toBe("its name ends in a dot or a space, which Windows drops");
  // the default, however deep the install, is the app's own place — never refused for its path
  const deep = path.join(tmp(), "y".repeat(190));
  mkdirSync(deep, { recursive: true });
  const def = resolveDataRoot(opts(deep));
  expect(def).toBe(path.join(deep, "data"));
  expect(dataRootProblem(def)).toBe(null);
});

test("Use the default folder: the pointer goes, the default is used now and after", () => {
  const repo = tmp();
  writeFileSync(path.join(repo, "dataroot.txt"), path.join(tmp(), "gone-drive"));
  expect(useDefaultRoot({ appName: "TestApp", repoRoot: repo, packaged: false })).toBe(path.join(repo, "data"));
  expect(existsSync(path.join(repo, "dataroot.txt"))).toBe(false);
  expect(resolveDataRoot(opts(repo))).toBe(path.join(repo, "data"));
});
