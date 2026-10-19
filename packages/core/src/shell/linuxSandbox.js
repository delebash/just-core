// SPDX-License-Identifier: MIT
// Whether Chromium's sandbox can't start for a desktop app run as an AppImage on Linux. Its sandbox
// needs either a setuid-root `chrome-sandbox` helper (a .deb sets one; an AppImage's files are mounted
// read-only and can't be setuid) or unprivileged user namespaces — which Ubuntu 24.04 and later keep
// unprivileged programs out of through AppArmor (`kernel.apparmor_restrict_unprivileged_userns` = 1),
// and some Debian kernels turn off (`kernel.unprivileged_userns_clone` = 0). Then the window never
// opens ("The SUID sandbox helper binary was found, but is not configured correctly"): the app runs
// with --no-sandbox, the switch every such user would otherwise type — its window loads only the
// app's own pages (app://<id> and its own server), never the web (the shell's navigation rules).
// chromium.googlesource.com/chromium/src/+/main/docs/security/apparmor-userns-restrictions.md
import fs from "node:fs";

const read = (file) => {
  try {
    return fs.readFileSync(file, "utf8").trim();
  } catch {
    return null; // not there: that restriction isn't in this kernel
  }
};

/** True when the app is an AppImage on a Linux whose kernel keeps it out of user namespaces. */
export function sandboxBlocked({ platform = process.platform, env = process.env, readFile = read } = {}) {
  if (platform !== "linux" || !env.APPIMAGE) return false;
  return readFile("/proc/sys/kernel/apparmor_restrict_unprivileged_userns") === "1" || readFile("/proc/sys/kernel/unprivileged_userns_clone") === "0";
}
