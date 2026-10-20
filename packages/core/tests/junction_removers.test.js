// SPDX-License-Identifier: MIT
// Every recursive remove in the kit leaves what a link points to (2026-10-20, the sixteenth review, measured with
// Node 24.21 — Electron 44's: fs.rmSync(dir, {recursive}) follows an NTFS junction and empties the folder it points to;
// fs.promises.rm removes the junction alone). A folder holding a link (a junction on Windows — made without any
// right — a folder's symbolic link elsewhere) to a folder OUTSIDE it is handed to each of the kit's removers; the
// outside folder must keep its files.
import { existsSync, lstatSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, realpathSync, symlinkSync, utimesSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { expect, test, vi } from "vitest";
import { finishInterruptedRestore, sweepWorkFolders } from "../src/platform/data_api.js";
import setupTmp from "../src/platform/vitest_tmp.js";
import { _swapIntoPlace } from "../src/runner/binary.js";
import { _rmtreeWithRetry, RunnerService } from "../src/runner/lifecycle.js";

const tmp = () => realpathSync.native(mkdtempSync(path.join(tmpdir(), "junction-")));

/** A folder `outside` with files, and `holder/models` a link to it. */
function linked(holder) {
  const outside = tmp();
  mkdirSync(path.join(outside, "sub"));
  writeFileSync(path.join(outside, "sub", "keep.bin"), "the user's");
  mkdirSync(holder, { recursive: true });
  writeFileSync(path.join(holder, "a.db"), "z");
  symlinkSync(outside, path.join(holder, "models"), process.platform === "win32" ? "junction" : "dir");
  return outside;
}
const kept = (outside) => readFileSync(path.join(outside, "sub", "keep.bin"), "utf8") === "the user's";

test("Clear models and the runner's removes (lifecycle rmTree, through _rmtreeWithRetry)", async () => {
  const holder = path.join(tmp(), "hf");
  const outside = linked(holder);
  expect(await _rmtreeWithRetry(holder)).toBe(true);
  expect(existsSync(holder)).toBe(false);
  expect(kept(outside)).toBe(true);
});

// the seventeenth review's s8: through a link Clear models and a model's Delete removed the link, freed nothing, and
// put an empty folder in its place — now the linked folder is emptied and the link kept
test("Clear models and a model's Delete on a linked folder: its contents freed, the link kept", async () => {
  const kind = process.platform === "win32" ? "junction" : "dir";
  const cache = tmp();
  const far = path.join(tmp(), "hf");
  mkdirSync(path.join(far, "models--a--b", "blobs"), { recursive: true });
  writeFileSync(path.join(far, "models--a--b", "blobs", "w.gguf"), Buffer.alloc(4000, 1));
  symlinkSync(far, path.join(cache, "hf"), kind);
  const svc = { _cacheRoot: cache, resident: async () => ({ models: [] }) };
  expect(await RunnerService.prototype.clearModelsCache.call(svc)).toEqual({ ok: true, bytes: 4000 });
  expect(lstatSync(path.join(cache, "hf")).isSymbolicLink()).toBe(true);
  expect(readdirSync(far)).toEqual([]);
  // one model's repo folder as a link
  const repoFar = path.join(tmp(), "models--c--d");
  mkdirSync(path.join(repoFar, "blobs"), { recursive: true });
  writeFileSync(path.join(repoFar, "blobs", "x.gguf"), Buffer.alloc(2000, 1));
  symlinkSync(repoFar, path.join(far, "models--c--d"), kind);
  const [freed] = await RunnerService.prototype._purgeModelWeights.call({ _cacheRoot: cache }, { id: "m", hfRepo: "c/d" }, []);
  expect(freed).toBe(2000);
  expect(readdirSync(repoFar)).toEqual([]);
  expect(lstatSync(path.join(far, "models--c--d")).isSymbolicLink()).toBe(true);
});

test("an engine's swap (binary.js rmtree on the retired build and the staging)", async () => {
  const base = tmp();
  const dest = path.join(base, "b0001");
  const outside = linked(dest); // the live build holds a link
  const staging = path.join(base, "staging");
  mkdirSync(staging);
  writeFileSync(path.join(staging, "llama-server"), "new");
  await _swapIntoPlace(staging, dest);
  expect(readFileSync(path.join(dest, "llama-server"), "utf8")).toBe("new");
  expect(existsSync(path.join(base, ".old-b0001"))).toBe(false);
  expect(kept(outside)).toBe(true);
});

test("a stopped backup's or restore's work folder (data_api.js sweepWorkFolders)", async () => {
  const dir = tmp();
  const work = path.join(dir, ".backup-x1");
  const outside = linked(work);
  const old = new Date(Date.now() - 2 * 3600_000);
  utimesSync(work, old, old);
  expect(sweepWorkFolders(path.join(dir, "app.db"))).toBe(1);
  await vi.waitFor(() => expect(existsSync(work)).toBe(false));
  expect(kept(outside)).toBe(true);
});

test("a stopped restore's recovery (data_api.js finishInterruptedRestore): the old folders and the backup's copy", async () => {
  const dir = tmp();
  const db = path.join(dir, "app.db");
  // tables committed: the folder it had moved aside goes
  const old = path.join(dir, "images.replaced-7");
  const outside = linked(old);
  mkdirSync(path.join(dir, "images"));
  const { openDatabase } = await import("../src/platform/sql.js");
  const h = openDatabase(db, { foreignKeys: false });
  h.exec("CREATE TABLE _kit_restore (stamp INTEGER NOT NULL)");
  h.run("INSERT INTO _kit_restore (stamp) VALUES (7)");
  h.close();
  writeFileSync(`${db}.restoring`, JSON.stringify({ stamp: 7, dirs: [{ dir: path.join(dir, "images"), old }] }));
  expect(await finishInterruptedRestore(db)).toBe("forward");
  expect(existsSync(old)).toBe(false);
  expect(kept(outside)).toBe(true);
  // not committed, no folder before: the backup's copy goes
  const fresh = path.join(dir, "audio");
  const outside2 = linked(fresh);
  writeFileSync(`${db}.restoring`, JSON.stringify({ stamp: 8, dirs: [{ dir: fresh, old: null }] }));
  expect(await finishInterruptedRestore(db)).toBe("back");
  expect(existsSync(fresh)).toBe(false);
  expect(kept(outside2)).toBe(true);
});

test("a test run's temp folder (vitest_tmp.js's teardown)", async () => {
  const saved = { TMP: process.env.TMP, TEMP: process.env.TEMP, TMPDIR: process.env.TMPDIR };
  const outside = tmp(); // made before the run's folder takes over TMP
  mkdirSync(path.join(outside, "sub"));
  writeFileSync(path.join(outside, "sub", "keep.bin"), "the user's");
  const teardown = setupTmp();
  const root = process.env.TEMP || process.env.TMPDIR;
  symlinkSync(outside, path.join(root, "models"), process.platform === "win32" ? "junction" : "dir");
  await teardown();
  expect(existsSync(root)).toBe(false);
  expect(kept(outside)).toBe(true);
  expect({ TMP: process.env.TMP, TEMP: process.env.TEMP, TMPDIR: process.env.TMPDIR }).toEqual(saved);
});
