// SPDX-License-Identifier: MIT
// platform/serve.js — a data folder that can't be used ends the start in one plain line, exit 3, before anything
// is built (2026-10-20: a missing drive gave a raw stack); under the desktop app the shell is told the line
// (`start-failed`), and a start that fails in `build` tells the shell its first line too.
import { existsSync, mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import lockfile from "proper-lockfile";
import { afterEach, expect, test, vi } from "vitest";
import { LOCK_NAME } from "../src/platform/data_lock.js";
import * as dataPaths from "../src/platform/data_paths.js";
import { resolveDataDir } from "../src/platform/data_paths.js";
import { runServer } from "../src/platform/serve.js";

const silent = { error() {}, info() {}, warn() {} };
const newTmp = () => mkdtempSync(path.join(tmpdir(), "kit-start-"));

afterEach(() => {
  delete process.parentPort;
  vi.restoreAllMocks();
});

function catchExit() {
  const written = [];
  vi.spyOn(process.stderr, "write").mockImplementation((s) => written.push(String(s)) || true);
  const exited = new Promise((resolve) => vi.spyOn(process, "exit").mockImplementation((code) => resolve(code)));
  return { written, exited };
}

test("headless, a data folder that can't be made: one line, exit 3, never built", async () => {
  const tmp = newTmp();
  const blocked = path.join(tmp, "data");
  writeFileSync(blocked, "a file where the folder goes");
  const { written, exited } = catchExit();
  const build = vi.fn();
  runServer({ argv: ["serve", "--data-dir", blocked], envPrefix: null, productName: "Demo", build, log: silent });
  expect(await exited).toBe(3);
  expect(written).toEqual([`The data folder ${blocked} can't be used: a file has that name\n`]);
  expect(build).not.toHaveBeenCalled();
});

test("headless, --data-dir or <APP>_DATA_DIR the native code can't take is refused in words", async () => {
  const tmp = newTmp();
  const dotted = path.join(tmp, "data.");
  const one = catchExit();
  runServer({ argv: ["serve", "--data-dir", dotted], envPrefix: null, build: vi.fn(), log: silent });
  expect(await one.exited).toBe(3);
  expect(one.written).toEqual([`The data folder ${dotted} can't be used: its name ends in a dot or a space, which Windows drops\n`]);
  vi.restoreAllMocks();
  const long = path.join(tmp, "x".repeat(200));
  const two = catchExit();
  vi.stubEnv("DEMO_DATA_DIR", long);
  runServer({ argv: ["serve"], envPrefix: "DEMO", build: vi.fn(), log: silent });
  expect(await two.exited).toBe(3);
  expect(two.written).toEqual([`The data folder ${long} can't be used: its path is longer than 180 characters\n`]);
  vi.unstubAllEnvs();
});

test("headless, a Change-folder pointer past the path rule is used as it is, the problem logged (it worked before)", async () => {
  const repo = newTmp();
  const base = newTmp();
  const long = path.join(base, "z".repeat(190 - base.length));
  mkdirSync(long);
  writeFileSync(path.join(repo, "dataroot.txt"), long);
  const lines = [];
  const log = { ...silent, warn: (s) => lines.push(s) };
  let seen = null;
  const build = async (args) => {
    seen = args.dataDir;
    throw new Error("stop here");
  };
  const defaultDataDir = () => resolveDataDir({ appName: "Demo", envVar: "DEMO_DATA_DIR", sourceRoot: repo, env: {} });
  await expect(runServer({ argv: ["serve"], envPrefix: null, defaultDataDir, build, log })).rejects.toThrow("stop here");
  expect(seen).toBe(long);
  expect(lines).toEqual([`the data folder ${long} is used as Change folder left it, though its path is longer than 180 characters`]);
});

// 2026-10-20 (the fourteenth review): a folder the user named that was moved, renamed or deleted was made empty
// in its place, and the server started on no data
test("headless, a folder the user named that isn't there is said missing in one line — never made", async () => {
  const tmp = newTmp();
  const gone = path.join(tmp, "renamed");
  const one = catchExit();
  const build = vi.fn();
  runServer({ argv: ["serve", "--data-dir", gone], envPrefix: null, productName: "Demo", build, log: silent });
  expect(await one.exited).toBe(3);
  expect(one.written).toEqual([`The data folder ${gone} can't be used: it isn't there\n`]);
  expect(existsSync(gone)).toBe(false);
  vi.restoreAllMocks();
  // <APP>_DATA_DIR, and a Change-folder pointer the app's ladder reads
  const two = catchExit();
  vi.stubEnv("DEMO_DATA_DIR", gone);
  runServer({ argv: ["serve"], envPrefix: "DEMO", build, log: silent });
  expect(await two.exited).toBe(3);
  expect(two.written).toEqual([`The data folder ${gone} can't be used: it isn't there\n`]);
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
  const repo = newTmp();
  writeFileSync(path.join(repo, "dataroot.txt"), gone);
  const three = catchExit();
  const defaultDataDir = () => resolveDataDir({ appName: "Demo", envVar: "DEMO_DATA_DIR", sourceRoot: repo, env: {} });
  runServer({ argv: ["serve"], envPrefix: null, productName: "Demo", defaultDataDir, build, log: silent });
  expect(await three.exited).toBe(3);
  expect(three.written).toEqual([`The data folder ${gone} can't be used: it isn't there\n`]);
  expect(existsSync(gone)).toBe(false);
  expect(build).not.toHaveBeenCalled();
});

test("headless, the ladder's default handed down as --data-dir (JustVoice's way) is made when missing", async () => {
  // a read-only install: the default is the OS folder, which nothing has made yet
  const local = newTmp();
  vi.stubEnv("WIN_PD_OVERRIDE_LOCAL_APPDATA", local);
  vi.stubEnv("XDG_DATA_HOME", local);
  vi.spyOn(dataPaths, "_isWritable").mockReturnValue(false);
  const dd = resolveDataDir({ appName: "Demo", envVar: "DEMO_DATA_DIR", sourceRoot: newTmp(), env: {} });
  vi.mocked(dataPaths._isWritable).mockRestore();
  expect(existsSync(dd)).toBe(false);
  let seen = null;
  const build = async (args) => {
    seen = args.dataDir;
    throw new Error("stop here");
  };
  await expect(runServer({ argv: ["serve", "--data-dir", dd], envPrefix: null, productName: "Demo", build, log: silent })).rejects.toThrow("stop here");
  expect(seen).toBe(path.resolve(dd));
  expect(existsSync(dd)).toBe(true);
  await lockfile.unlock(dd, { lockfilePath: path.join(dd, LOCK_NAME) });
  vi.unstubAllEnvs();
});

test("headless, the app's own default is never held to the path rule", async () => {
  const deep = path.join(newTmp(), "d".repeat(190));
  const defaultDataDir = () => resolveDataDir({ appName: "Demo", envVar: "DEMO_DATA_DIR", sourceRoot: deep, env: {} });
  let seen = null;
  const build = async (args) => {
    seen = args.dataDir;
    throw new Error("stop here");
  };
  await expect(runServer({ argv: ["serve"], envPrefix: null, defaultDataDir, build, log: silent })).rejects.toThrow("stop here");
  expect(seen).toBe(path.join(deep, "data"));
});

test("under the desktop app the shell is told the line, and the shell's stop exits 3", async () => {
  const tmp = newTmp();
  const blocked = path.join(tmp, "data");
  writeFileSync(blocked, "x");
  const { exited } = catchExit();
  const posted = [];
  const handlers = [];
  process.parentPort = { on: (_ev, fn) => handlers.push(fn), postMessage: (m) => posted.push(m) };
  runServer({ argv: ["serve", "--data-dir", blocked], envPrefix: null, build: vi.fn(), log: silent });
  await vi.waitFor(() => expect(posted).toEqual([{ type: "start-failed", error: `The data folder ${blocked} can't be used: a file has that name` }]));
  for (const fn of handlers) fn({ data: { type: "stop" } });
  expect(await exited).toBe(3);
});

test("under the desktop app a build that throws tells the shell its first line", async () => {
  const dir = path.join(newTmp(), "data");
  const { exited } = catchExit();
  const posted = [];
  const handlers = [];
  process.parentPort = { on: (_ev, fn) => handlers.push(fn), postMessage: (m) => posted.push(m) };
  const build = async () => {
    throw new Error("unable to open database file\nmore detail");
  };
  runServer({ argv: ["serve", "--data-dir", dir], envPrefix: null, build, log: silent });
  await vi.waitFor(() => expect(posted).toEqual([{ type: "start-failed", error: "unable to open database file" }]));
  for (const fn of handlers) fn({ data: { type: "stop" } });
  expect(await exited).toBe(3);
});

test("headless, a build that throws still throws (its stack is the operator's)", async () => {
  const dir = path.join(newTmp(), "data");
  mkdirSync(dir); // a folder named with --data-dir must be there
  await expect(
    runServer({
      argv: ["serve", "--data-dir", dir],
      envPrefix: null,
      log: silent,
      build: async () => {
        throw new Error("boom");
      },
    }),
  ).rejects.toThrow("boom");
});
