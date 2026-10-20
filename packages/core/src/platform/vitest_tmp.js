// SPDX-License-Identifier: MIT
// The vitest globalSetup every family server suite shares: a test run gets ONE temp folder,
// and TMP / TEMP / TMPDIR point the test workers at it, so everything a test makes through
// os.tmpdir() lands there — and the whole folder goes when the run ends. Before 2026-10-08 the
// suites left a folder per test behind (7,500 `jv-test-*` in one %TEMP%).
//
//   // vitest.config.js
//   globalSetup: [fileURLToPath(import.meta.resolve("@delebash/core/platform/vitest_tmp"))]

import { mkdtempSync } from "node:fs";
import { rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

const VARS = ["TMP", "TEMP", "TMPDIR"];

export default function setup() {
  const root = mkdtempSync(path.join(tmpdir(), "vitest-run-"));
  const saved = Object.fromEntries(VARS.map((k) => [k, process.env[k]]));
  // Set before the workers start, so each inherits it (os.tmpdir() reads TEMP/TMP on Windows,
  // TMPDIR elsewhere).
  for (const k of VARS) process.env[k] = root;
  // (vitest awaits a teardown that returns a promise; fs.promises.rm, never rmSync — Node 24's rmSync recursive follows
  // an NTFS junction a test made and empties its target, measured 2026-10-20)
  return async () => {
    for (const k of VARS) {
      if (saved[k] === undefined) delete process.env[k];
      else process.env[k] = saved[k];
    }
    try {
      await rm(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
    } catch (e) {
      console.warn(`[vitest] could not remove the run's temp folder ${root}: ${e.message}`);
    }
  };
}
