// SPDX-License-Identifier: MIT
// The app's version, read from its package.json (app-structure §14): one number, set once, read
// by /v1/health and the About section — never a constant typed into code. The guard checks the
// root and server package.json versions agree.

import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

/**
 * The `version` of the nearest package.json at or above the module at `fromUrl`
 * (`import.meta.url`) — in a checkout the server package's own, and the same file when the
 * packaged app runs it from `node_modules/<app>-server`. "0.0.0" when none is found.
 */
export function readPackageVersion(fromUrl) {
  let dir = path.dirname(fileURLToPath(fromUrl));
  for (;;) {
    try {
      const pkg = JSON.parse(readFileSync(path.join(dir, "package.json"), "utf8"));
      if (pkg?.version) return String(pkg.version);
    } catch {
      // no package.json here — keep walking up
    }
    const up = path.dirname(dir);
    if (up === dir) return "0.0.0";
    dir = up;
  }
}
