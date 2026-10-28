// SPDX-License-Identifier: MIT
// The room on a drive (platform/disk_room.js): read through node:fs's namespace — the phone's bundle has no statfsSync
// and esbuild refuses a named import of it — asking the nearest folder that exists.
import { mkdtempSync, statfsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, test } from "vitest";
import { freeBytes } from "../src/platform/disk_room.js";

test("a folder's drive: the bytes this user may still write", () => {
  const dir = mkdtempSync(join(tmpdir(), "kit-room-"));
  const s = statfsSync(dir);
  const free = freeBytes(dir);
  expect(free).toBeGreaterThan(0);
  // the drive moves under a running machine — the same drive, within a GB
  expect(Math.abs(free - Number(s.bavail) * Number(s.bsize))).toBeLessThan(1e9);
});

test("a folder not made yet: its nearest existing parent's drive answers", () => {
  const dir = mkdtempSync(join(tmpdir(), "kit-room-"));
  const free = freeBytes(join(dir, "not", "made", "yet"));
  expect(free).toBeGreaterThan(0);
  expect(Math.abs(free - freeBytes(dir))).toBeLessThan(1e9);
});
