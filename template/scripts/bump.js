#!/usr/bin/env node
// SPDX-License-Identifier: MIT
// Set the app's version: the root package.json (electron-builder, the update feed and Settings →
// About read it) and the server package's, which equals it (server/src/version.js). It doesn't
// commit or tag — release.js says what comes next.
//
//   npm run bump 0.2.0

import { readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const version = process.argv[2];
if (!version || !/^\d+\.\d+\.\d+(-[\w.]+)?$/.test(version)) {
  console.error("Usage: npm run bump <version>   (a version like 0.2.0 or 0.2.0-rc.1)");
  process.exit(1);
}
for (const rel of ["package.json", "server/package.json"]) {
  const file = resolve(ROOT, rel);
  const text = readFileSync(file, "utf8");
  const json = JSON.parse(text);
  const old = json.version;
  json.version = version;
  const nl = text.includes("\r\n") ? "\r\n" : "\n";
  writeFileSync(file, `${JSON.stringify(json, null, 2)}\n`.replace(/\n/g, nl));
  console.log(`${rel}: ${old} → ${version}`);
}
console.log(`Next: a "## v${version}" section in docs/whats-new.md, then
  git commit -am "Release v${version}"
  git tag v${version}
  git push && git push origin v${version}
  npm run release`);
