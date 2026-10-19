// SPDX-License-Identifier: MIT
// The desktop shell's "Restart now" (Settings → Updates): the downloaded update installs silently and
// the app starts again — electron-updater's quitAndInstall(isSilent, isForceRunAfter) runs the NSIS
// installer with `--updated /S --force-run`; without /S the family's assisted installer showed its
// whole wizard and waited (just-house-paint's 0.1.0 → 0.1.1 update, 2026-10-19). main.js is
// Electron's main process, not importable here, so its source is read.
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { expect, test } from "vitest";

const main = readFileSync(resolve(import.meta.dirname, "../src/shell/main.js"), "utf8");

test("Restart now installs the update silently and starts the app again", () => {
  const install = main.match(/async updateInstall\(\) \{[\s\S]*?\n {4}\},/)?.[0];
  expect(install, "the shell's updateInstall handler").toBeTruthy();
  expect(install).toMatch(/quitAndInstall\(true, true\)/);
  expect(main).toMatch(/autoInstallOnAppQuit = true/); // and a quit installs it too (silently)
});
