// SPDX-License-Identifier: MIT
// The room on a drive (platform/disk_room.js): read through node:fs's namespace — the phone's bundle has no statfsSync
// and esbuild refuses a named import of it — asking the nearest folder that exists; what a download's own unfinished
// files already hold; whether a download fits (the engines plan, K10b — just-house-paint's checks and tests, moved).
import { mkdtempSync, rmSync, statfsSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, expect, test } from "vitest";
import { freeBytes, lacksRoom, partBytes, partRoom, ROOM_MARGIN } from "../src/platform/disk_room.js";

const GiB = 1024 ** 3;
let dir;
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "kit-room-"));
});
afterEach(() => rmSync(dir, { recursive: true, force: true }));

test("a folder's drive: the bytes this user may still write", () => {
  const s = statfsSync(dir);
  const free = freeBytes(dir);
  expect(free).toBeGreaterThan(0);
  // the drive moves under a running machine — the same drive, within a GB
  expect(Math.abs(free - Number(s.bavail) * Number(s.bsize))).toBeLessThan(1e9);
});

test("a folder not made yet: its nearest existing parent's drive answers", () => {
  const free = freeBytes(join(dir, "not", "made", "yet"));
  expect(free).toBeGreaterThan(0);
  expect(Math.abs(free - freeBytes(dir))).toBeLessThan(1e9);
});

// house-paint's fifteenth review (2026-10-20): a sparse .part's full size was credited (macOS, Linux), and any leftover
test("only the download's own unfinished files count, at the room they take", () => {
  writeFileSync(join(dir, "a.gguf.part"), Buffer.alloc(1000));
  writeFileSync(join(dir, "old-build.zip.part"), Buffer.alloc(5000)); // a leftover: not fetched now
  expect(partBytes([join(dir, "a.gguf"), join(dir, "b.gguf")])).toBe(1000); // written whole: its size
  // a sparse 4 GiB file with 1 MiB written: what it takes on macOS/Linux, its size on Windows (allocated whole)
  const sparse = { size: 4 * GiB, blocks: 2048 };
  expect(partRoom(sparse, "linux")).toBe(1024 * 1024);
  expect(partRoom(sparse, "darwin")).toBe(1024 * 1024);
  expect(partRoom(sparse, "win32")).toBe(4 * GiB);
  expect(partRoom({ size: 100, blocks: 8 }, "linux")).toBe(100); // never more than its size
});

test("a download that won't fit is said with the sizes, the margin counted; what its .part holds is room it has", () => {
  const free = () => ROOM_MARGIN + 1500;
  expect(lacksRoom({ dir, bytes: 3000, free })).toEqual({ needBytes: 3000 + ROOM_MARGIN, freeBytes: ROOM_MARGIN + 1500 });
  expect(lacksRoom({ dir, bytes: 1500, free })).toBeNull(); // exactly fits
  // a resumed download (house-paint's fourteenth review: refused 507 for room it had)
  writeFileSync(join(dir, "model.gguf.part"), Buffer.alloc(2000));
  expect(lacksRoom({ dir, bytes: 3000, files: [join(dir, "model.gguf")], free })).toBeNull();
  // a drive that doesn't say: the download's own errors stand
  expect(lacksRoom({ dir, bytes: 1e15, free: () => null })).toBeNull();
  // nothing more to put there: the drive isn't asked
  expect(lacksRoom({ dir, bytes: 0, free: () => 0 })).toBeNull();
});
