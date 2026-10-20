// SPDX-License-Identifier: MIT
// platform/data_lock.js + runServer's lock (approved 2026-10-15): one server per data folder. A
// second lock on the folder refuses with the approved words; a crashed server's stale lock is
// taken over; a clean exit lets the lock go; a server start on a held folder says so and exits 3
// before anything is built.
import { spawn } from "node:child_process";
import fs, { existsSync, mkdirSync, mkdtempSync, utimesSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import lockfile from "proper-lockfile";
import { afterEach, expect, test, vi } from "vitest";
import { dataFolderInUse, LOCK_NAME, lockDataDir } from "../src/platform/data_lock.js";
import { runServer } from "../src/platform/serve.js";
import { Hono } from "../src/platform/server.js";

const releases = [];
afterEach(async () => {
  for (const release of releases.splice(0)) await release().catch(() => {});
  delete process.parentPort;
  vi.restoreAllMocks();
});

const newDir = () => path.join(mkdtempSync(path.join(tmpdir(), "kit-lock-")), "data");

test("the words name the app and the folder", () => {
  expect(dataFolderInUse("JustVoice", "E:\\data")).toBe(
    "Another JustVoice server is using this data folder (E:\\data) — stop it first.",
  );
});

test("a second lock on the same folder is refused; the first one's release frees it", async () => {
  const dir = newDir();
  const release = await lockDataDir(dir); // made when missing
  expect(existsSync(path.join(dir, LOCK_NAME))).toBe(true);
  await expect(lockDataDir(dir, { retries: 0 })).rejects.toMatchObject({ code: "ELOCKED" });
  await release();
  expect(existsSync(path.join(dir, LOCK_NAME))).toBe(false);
  releases.push(await lockDataDir(dir, { retries: 0 }));
});

test("a crashed server's stale lock is taken over", async () => {
  // A lock nobody refreshes — what a killed server leaves — past proper-lockfile's default stale.
  const dir = newDir();
  mkdirSync(path.join(dir, LOCK_NAME), { recursive: true });
  const old = new Date(Date.now() - 60_000);
  utimesSync(path.join(dir, LOCK_NAME), old, old);
  releases.push(await lockDataDir(dir, { retries: 0 }));
});

test("a start right after a crash waits for the lock to go stale instead of refusing", async () => {
  // Refreshed 8 s ago: stale (10 s) about 2 s from now — inside the default retries.
  const dir = newDir();
  mkdirSync(path.join(dir, LOCK_NAME), { recursive: true });
  const recent = new Date(Date.now() - 8000);
  utimesSync(path.join(dir, LOCK_NAME), recent, recent);
  const t0 = Date.now();
  releases.push(await lockDataDir(dir));
  expect(Date.now() - t0).toBeGreaterThan(1000);
}, 20_000);

test("a process that exits cleanly lets its lock go", async () => {
  const dir = newDir();
  const mod = pathToFileURL(path.resolve(import.meta.dirname, "../src/platform/data_lock.js")).href;
  const child = spawn(
    process.execPath,
    ["--input-type=module", "-e", `const m = await import(${JSON.stringify(mod)}); await m.lockDataDir(${JSON.stringify(dir)}); console.log("locked"); process.exit(0);`],
    { stdio: ["ignore", "pipe", "inherit"] },
  );
  let out = "";
  child.stdout.on("data", (d) => {
    out += d;
  });
  const code = await new Promise((resolve) => child.on("exit", resolve));
  expect(out.trim()).toBe("locked");
  expect(code).toBe(0);
  expect(existsSync(path.join(dir, LOCK_NAME))).toBe(false);
  releases.push(await lockDataDir(dir, { retries: 0 }));
});

test("a headless server on a held data folder prints the words, exits 3, and never builds", async () => {
  const dir = newDir();
  releases.push(await lockDataDir(dir)); // the other server
  const written = [];
  vi.spyOn(process.stderr, "write").mockImplementation((s) => written.push(String(s)) || true);
  const exited = new Promise((resolve) => vi.spyOn(process, "exit").mockImplementation((code) => resolve(code)));
  const build = vi.fn(async () => ({ app: new Hono(), host: "127.0.0.1", port: 0 }));
  runServer({ argv: ["serve", "--data-dir", dir], envPrefix: null, productName: "JustVoice", lockRetries: 0, build, log: { error() {}, info() {} } });
  expect(await exited).toBe(3);
  expect(written).toContain(`Another JustVoice server is using this data folder (${dir}) — stop it first.\n`);
  expect(build).not.toHaveBeenCalled();
});

test("under the desktop app it tells the shell, and exits 3 on the shell's stop", async () => {
  const dir = newDir();
  releases.push(await lockDataDir(dir));
  vi.spyOn(process.stderr, "write").mockImplementation(() => true);
  const posted = [];
  const handlers = [];
  process.parentPort = { on: (_ev, fn) => handlers.push(fn), postMessage: (m) => posted.push(m) };
  const exited = new Promise((resolve) => vi.spyOn(process, "exit").mockImplementation((code) => resolve(code)));
  const build = vi.fn();
  runServer({ argv: ["serve", "--data-dir", dir], envPrefix: null, productName: "JustVoice", lockRetries: 0, build });
  await vi.waitFor(() => expect(posted).toEqual([{ type: "data-folder-locked", dataDir: dir }]));
  for (const fn of handlers) fn({ data: { type: "stop" } });
  expect(await exited).toBe(3);
  expect(build).not.toHaveBeenCalled();
});

test("the lock is taken before build, and only when the app names itself", async () => {
  const dir = newDir();
  mkdirSync(dir); // a folder named with --data-dir must be there (2026-10-20)
  let lockedAtBuild = null;
  const build = async () => {
    lockedAtBuild = existsSync(path.join(dir, LOCK_NAME));
    throw new Error("stop here");
  };
  await expect(runServer({ argv: ["serve", "--data-dir", dir], envPrefix: null, productName: "JustVoice", build })).rejects.toThrow("stop here");
  expect(lockedAtBuild).toBe(true);
  await lockfile.unlock(dir, { lockfilePath: path.join(dir, LOCK_NAME) });
  const other = newDir();
  mkdirSync(other);
  const build2 = async () => {
    lockedAtBuild = existsSync(path.join(other, LOCK_NAME));
    throw new Error("stop here");
  };
  await expect(runServer({ argv: ["serve", "--data-dir", other], envPrefix: null, build: build2 })).rejects.toThrow("stop here");
  expect(lockedAtBuild).toBe(false);
});

test("with no folder named, the app's default folder is locked and given to build", async () => {
  const dir = newDir();
  let seen = null;
  const build = async (args) => {
    seen = { dataDir: args.dataDir, locked: existsSync(path.join(dir, LOCK_NAME)) };
    throw new Error("stop here");
  };
  await expect(
    runServer({ argv: ["serve"], envPrefix: null, productName: "Docgen", defaultDataDir: () => dir, build }),
  ).rejects.toThrow("stop here");
  expect(seen).toEqual({ dataDir: path.resolve(dir), locked: true });
  await lockfile.unlock(dir, { lockfilePath: path.join(dir, LOCK_NAME) });
});

// ── a lock lost while the server runs (2026-10-20) ────────────────────────────
// proper-lockfile calls a lock compromised when the time it reads back isn't the one it wrote, or when it can't
// refresh it in time; its default onCompromised throws, uncaught — the server died ~15 s after starting on a
// FAT32 drive. Short `stale`/`update` (proper-lockfile's own options) keep these tests to seconds.

/** A log that keeps its lines. */
const keep = () => {
  const lines = [];
  return { lines, warn: (s) => lines.push(`warn ${s}`), info: (s) => lines.push(`info ${s}`), error: (s) => lines.push(`error ${s}`) };
};

test("FAT32's 2-second times: the lost lock is said and taken again — never thrown", async () => {
  const dir = newDir();
  // FAT32 keeps a file's time to 2 s: what proper-lockfile reads back isn't the time it wrote
  const fat = { ...fs, stat: (p, cb) => fs.stat(p, (e, s) => cb(e, s && { mtime: new Date(Math.floor(s.mtime.getTime() / 2000) * 2000) })) };
  const log = keep();
  releases.push(await lockDataDir(dir, { retries: 0, log, fs: fat, stale: 2000, update: 1000 }));
  await vi.waitFor(() => expect(log.lines.some((l) => l.startsWith("warn the data folder's lock was lost"))).toBe(true), { timeout: 10_000, interval: 100 });
  await vi.waitFor(() => expect(log.lines).toContain("info the data folder's lock is taken again"), { timeout: 10_000, interval: 100 });
  expect(existsSync(path.join(dir, LOCK_NAME))).toBe(true);
}, 20_000);

test("a share that fails once (waking from sleep): the lock is taken again", async () => {
  const dir = newDir();
  let fail = false;
  const share = {
    ...fs,
    stat: (p, cb) => {
      if (fail) {
        fail = false;
        return cb(Object.assign(new Error("ENOENT: the share isn't there"), { code: "ENOENT" }));
      }
      return fs.stat(p, cb);
    },
  };
  const log = keep();
  const release = await lockDataDir(dir, { retries: 0, log, fs: share, stale: 2000, update: 1000 });
  fail = true;
  await vi.waitFor(() => expect(log.lines).toContain("info the data folder's lock is taken again"), { timeout: 10_000, interval: 100 });
  expect(log.lines[0]).toMatch(/^warn the data folder's lock was lost \(ENOENT: the share isn't there\) — taking it again$/);
  // the release frees the lock taken again
  await release();
  expect(existsSync(path.join(dir, LOCK_NAME))).toBe(false);
}, 20_000);

// ── a lock another server took over (2026-10-20, the fourteenth review) ───────
// The reviewer's lock_race.mjs: server A's event loop held up past `stale` (a long synchronous step), its lock
// looked stale and server B — another process — took it over; A then took it "again" every 30 s and kept
// serving: two servers on one folder. A lost lock is taken back only when it is free or still A's own gone
// stale (proper-lockfile's "compromised"); one another server keeps fresh ends A. B is a second process: one
// process's lockers share proper-lockfile's own table of locks, so two of them in one process never tell.
const SHORT = { stale: 2000, update: 1000 };
const others = [];
afterEach(() => {
  for (const child of others.splice(0)) child.kill();
});

/** Server B in its own process, trying for the folder's lock until it is stale; then A's (this process's) event
 *  loop is held up past `stale`, so B takes the lock over and keeps it fresh until killed. */
async function takeOver(dir) {
  const mod = pathToFileURL(path.resolve(import.meta.dirname, "../src/platform/data_lock.js")).href;
  const retries = { retries: 40, factor: 1, minTimeout: 250, maxTimeout: 250 };
  const code = `const m = await import(${JSON.stringify(mod)}); console.log("trying"); await m.lockDataDir(${JSON.stringify(dir)}, { retries: ${JSON.stringify(retries)}, stale: ${SHORT.stale}, update: ${SHORT.update}, log: { warn() {}, info() {} } }); console.log("locked"); setInterval(() => {}, 1000);`;
  const child = spawn(process.execPath, ["--input-type=module", "-e", code], { stdio: ["ignore", "pipe", "inherit"] });
  others.push(child);
  let out = "";
  const said = (word) =>
    new Promise((resolve, reject) => {
      const check = () => out.includes(word) && resolve();
      child.stdout.on("data", (d) => {
        out += d;
        check();
      });
      child.once("exit", (c) => reject(new Error(`server B exited (${c}) before "${word}"`)));
      check();
    });
  await said("trying");
  const end = Date.now() + SHORT.stale + 2000;
  while (Date.now() < end) {
    // A's long synchronous step: its lock isn't refreshed
  }
  await said("locked");
  return child;
}

test("a lock another server took over and keeps fresh: this one is told once (onLost) and never takes it back", async () => {
  const dir = newDir();
  const log = keep();
  const lost = [];
  const a = await lockDataDir(dir, { retries: 0, log, ...SHORT, onLost: (e) => lost.push(e.code) });
  releases.push(a);
  await takeOver(dir);
  await vi.waitFor(() => expect(lost).toEqual(["ELOCKED"]), { timeout: 15_000, interval: 100 });
  expect(log.lines[0]).toMatch(/^warn the data folder's lock was lost \(.+\) — taking it again$/);
  expect(log.lines).toContain("warn another server holds the data folder's lock now — this one stops using the folder");
  expect(log.lines).not.toContain("info the data folder's lock is taken again");
  // A's release leaves B's lock alone, and B keeps the folder
  await a();
  expect(existsSync(path.join(dir, LOCK_NAME))).toBe(true);
  await expect(lockfile.check(dir, { lockfilePath: path.join(dir, LOCK_NAME), ...SHORT })).resolves.toBe(true);
  await new Promise((r) => setTimeout(r, 3000));
  expect(lost).toEqual(["ELOCKED"]); // once
}, 30_000);

test("a lost lock that is free again is taken back, never reported lost", async () => {
  const dir = newDir();
  const log = keep();
  const lost = [];
  releases.push(await lockDataDir(dir, { retries: 0, log, ...SHORT, onLost: () => lost.push(1) }));
  // the lock's folder gone (a share that lost it): free, so ours again
  fs.rmSync(path.join(dir, LOCK_NAME), { recursive: true, force: true });
  await vi.waitFor(() => expect(log.lines).toContain("info the data folder's lock is taken again"), { timeout: 10_000, interval: 100 });
  expect(lost).toEqual([]);
  expect(existsSync(path.join(dir, LOCK_NAME))).toBe(true);
}, 20_000);

test("a headless server whose data folder another server takes over: the words, it stops serving, exit 3", async () => {
  const dir = newDir();
  mkdirSync(dir);
  const written = [];
  vi.spyOn(process.stderr, "write").mockImplementation((s) => written.push(String(s)) || true);
  const exited = new Promise((resolve) => vi.spyOn(process, "exit").mockImplementation((code) => resolve(code)));
  const build = async () => ({ app: new Hono(), host: "127.0.0.1", port: 0 });
  const { server } = await runServer({ argv: ["serve", "--data-dir", dir], envPrefix: null, productName: "JustVoice", lockOptions: SHORT, build, log: keep() });
  expect(server.listening).toBe(true);
  await takeOver(dir);
  expect(await exited).toBe(3);
  expect(written).toContain(`Another JustVoice server is using this data folder (${dir}) — stop it first.\n`);
  expect(server.listening).toBe(false);
}, 30_000);

test("under the desktop app the shell is told (data-folder-locked) after ready, and the server stops: exit 3", async () => {
  const dir = newDir();
  mkdirSync(dir);
  vi.spyOn(process.stderr, "write").mockImplementation(() => true);
  const posted = [];
  process.parentPort = { on: () => {}, postMessage: (m) => posted.push(m) };
  const exited = new Promise((resolve) => vi.spyOn(process, "exit").mockImplementation((code) => resolve(code)));
  const build = async () => ({ app: new Hono(), host: "127.0.0.1", port: 0 });
  const { server, port } = await runServer({ argv: ["serve", "--data-dir", dir], envPrefix: null, productName: "JustVoice", lockOptions: SHORT, build, log: keep() });
  expect(posted).toEqual([{ type: "ready", host: "127.0.0.1", port }]);
  await takeOver(dir);
  expect(await exited).toBe(3);
  expect(posted[1]).toEqual({ type: "data-folder-locked", dataDir: dir });
  expect(server.listening).toBe(false);
}, 30_000);
