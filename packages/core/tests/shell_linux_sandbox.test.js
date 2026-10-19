// SPDX-License-Identifier: MIT
// An AppImage on a Linux that keeps unprivileged programs out of user namespaces can't start
// Chromium's sandbox (no setuid helper in a read-only mount): the shell runs it with --no-sandbox —
// only then (shell/linuxSandbox.js; Ubuntu 24.04's AppArmor default, some Debian kernels).
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { expect, test } from "vitest";
import { sandboxBlocked } from "../src/shell/linuxSandbox.js";

const files = (map) => (file) => map[file] ?? null;
const APPARMOR = "/proc/sys/kernel/apparmor_restrict_unprivileged_userns";
const CLONE = "/proc/sys/kernel/unprivileged_userns_clone";

test("an AppImage on Ubuntu 24.04's default (AppArmor restricts user namespaces) can't sandbox", () => {
  expect(sandboxBlocked({ platform: "linux", env: { APPIMAGE: "/home/u/app.AppImage" }, readFile: files({ [APPARMOR]: "1" }) })).toBe(true);
  expect(sandboxBlocked({ platform: "linux", env: { APPIMAGE: "/a" }, readFile: files({ [CLONE]: "0" }) })).toBe(true);
});

test("anything else keeps Chromium's sandbox", () => {
  // the restriction off; a .deb or the unpacked folder (no APPIMAGE: its helper can be setuid); Windows, macOS
  expect(sandboxBlocked({ platform: "linux", env: { APPIMAGE: "/a" }, readFile: files({ [APPARMOR]: "0", [CLONE]: "1" }) })).toBe(false);
  expect(sandboxBlocked({ platform: "linux", env: { APPIMAGE: "/a" }, readFile: files({}) })).toBe(false);
  expect(sandboxBlocked({ platform: "linux", env: {}, readFile: files({ [APPARMOR]: "1" }) })).toBe(false);
  expect(sandboxBlocked({ platform: "win32", env: { APPIMAGE: "/a" }, readFile: files({ [APPARMOR]: "1" }) })).toBe(false);
  expect(sandboxBlocked({ platform: "darwin", env: { APPIMAGE: "/a" }, readFile: files({ [APPARMOR]: "1" }) })).toBe(false);
});

test("the shell asks before Chromium starts, and only then turns the sandbox off", () => {
  const main = readFileSync(resolve(import.meta.dirname, "../src/shell/main.js"), "utf8");
  expect(main).toMatch(/if \(sandboxBlocked\(\)\) \{[\s\S]{0,300}?app\.commandLine\.appendSwitch\("no-sandbox"\)/);
  // before the data root and the single-instance lock — both start Chromium's work
  expect(main.indexOf("sandboxBlocked()")).toBeLessThan(main.indexOf("requestSingleInstanceLock"));
});
