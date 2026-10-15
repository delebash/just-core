// SPDX-License-Identifier: MIT
// platform/data_lock.js + runServer's lock (approved 2026-10-15): one server per data folder. A
// second lock on the folder refuses with the approved words; a crashed server's stale lock is
// taken over; a clean exit lets the lock go; a server start on a held folder says so and exits 3
// before anything is built.
import { spawn } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, utimesSync } from "node:fs";
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
  const mod = pathToFileURL(path.resolve("src/platform/data_lock.js")).href;
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
  let lockedAtBuild = null;
  const build = async () => {
    lockedAtBuild = existsSync(path.join(dir, LOCK_NAME));
    throw new Error("stop here");
  };
  await expect(runServer({ argv: ["serve", "--data-dir", dir], envPrefix: null, productName: "JustVoice", build })).rejects.toThrow("stop here");
  expect(lockedAtBuild).toBe(true);
  await lockfile.unlock(dir, { lockfilePath: path.join(dir, LOCK_NAME) });
  const other = newDir();
  const build2 = async () => {
    lockedAtBuild = existsSync(path.join(other, LOCK_NAME));
    throw new Error("stop here");
  };
  await expect(runServer({ argv: ["serve", "--data-dir", other], envPrefix: null, build: build2 })).rejects.toThrow("stop here");
  expect(lockedAtBuild).toBe(false);
});
