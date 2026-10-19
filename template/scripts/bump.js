#!/usr/bin/env node
// SPDX-License-Identifier: MIT
// Set the app's version: `npm version` (docs.npmjs.com/cli/commands/npm-version) on the root
// package and its server workspace — package.json, server/package.json (equal to it:
// server/src/version.js) and package-lock.json together. electron-builder, the update feed and
// Settings → About read it. It doesn't commit or tag — release.js says what comes next.
//
//   npm run bump 0.2.0

import { execSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const version = process.argv[2];
if (!version || !/^\d+\.\d+\.\d+(-[\w.]+)?$/.test(version)) {
  console.error("Usage: npm run bump <version>   (a version like 0.2.0 or 0.2.0-rc.1)");
  process.exit(1);
}
execSync(`npm version ${version} --no-git-tag-version --workspaces --include-workspace-root --allow-same-version`, { cwd: ROOT, stdio: "inherit" });
console.log(`Next: a "## v${version}" section in docs/whats-new.md, then
  git commit -am "Release v${version}"
  git tag v${version}
  git push && git push origin v${version}
  npm run release`);
