#!/usr/bin/env node
// SPDX-License-Identifier: MIT
// Start the release build (.github/workflows/release.yml) — manual only, as JustWrite's: pushes and
// tags never start one; this script (or the Actions page's "Run workflow") is the only way.
//
//   npm run release                    # every platform, the version in package.json
//   npm run release -- 0.2.0           # an explicit version
//   npm run release -- --platform windows
//   npm run release -- --yes           # no question (a scripted run)
//
// Checks first: the gh CLI is signed in, the tag v<version> is on origin, and docs/whats-new.md has
// a "## v<version>" section (the release notes). `npm run bump <version>` sets the version.

import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { stdin, stdout } from "node:process";
import { createInterface } from "node:readline/promises";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const run = (cmd, opts = {}) => execSync(cmd, { encoding: "utf8", cwd: ROOT, ...opts }).trim();
const tryRun = (cmd) => {
  try {
    return run(cmd, { stdio: ["ignore", "pipe", "ignore"] });
  } catch {
    return null;
  }
};
const fail = (msg) => {
  console.error(`Release aborted: ${msg}`);
  process.exit(1);
};

if (tryRun("gh --version") === null) fail("the gh CLI isn't installed (https://cli.github.com/), then run `gh auth login`.");
if (tryRun("gh auth status") === null) fail("the gh CLI isn't signed in — run `gh auth login`.");

const PLATFORMS = ["all", "windows", "macos", "linux"];
const argv = process.argv.slice(2);
let platform = "all";
let version = null;
let yes = false;
for (let i = 0; i < argv.length; i++) {
  if (argv[i] === "--platform" || argv[i] === "-p") platform = argv[++i];
  else if (argv[i] === "--yes" || argv[i] === "-y") yes = true;
  else if (!argv[i].startsWith("-") && !version) version = argv[i];
}
if (!PLATFORMS.includes(platform)) fail(`unknown platform "${platform}" — one of ${PLATFORMS.join(", ")}.`);
const pkg = JSON.parse(readFileSync(resolve(ROOT, "package.json"), "utf8"));
version ??= pkg.version;
if (!/^\d+\.\d+\.\d+(-[\w.]+)?$/.test(version)) fail(`"${version}" isn't a version like 0.2.0.`);
const tag = `v${version}`;

if (!tryRun(`git ls-remote --tags origin ${tag}`)) {
  fail(`the tag ${tag} isn't on origin. First:\n  npm run bump ${version}\n  git commit -am "Release ${tag}"\n  git tag ${tag}\n  git push && git push origin ${tag}`);
}
const whatsNew = readFileSync(resolve(ROOT, "docs", "whats-new.md"), "utf8");
if (!new RegExp(`^## ${tag.replace(/\./g, "\\.")}\\s*$`, "m").test(whatsNew)) fail(`docs/whats-new.md has no "## ${tag}" section — the release notes.`);

const repo = tryRun("gh repo view --json nameWithOwner -q .nameWithOwner");
console.log(`${pkg.productName} ${tag} (${repo ?? "this repository"}) — platforms: ${platform}.`);
console.log("This builds the installers on GitHub's runners and attaches them, with the update feed, to the release.");
if (!yes) {
  const rl = createInterface({ input: stdin, output: stdout });
  const answer = (await rl.question("Proceed? [y/N] ")).trim().toLowerCase();
  rl.close();
  if (answer !== "y" && answer !== "yes") {
    console.log("Cancelled.");
    process.exit(0);
  }
}
try {
  // stdin closed: gh exits non-zero on the closed pipe a readline prompt can leave behind
  run(`gh workflow run release.yml -f tag=${tag} -f platforms=${platform}`, { stdio: ["ignore", "inherit", "inherit"] });
} catch {
  fail("`gh workflow run` failed — is .github/workflows/release.yml on the default branch?");
}
console.log("Started. Follow it with `gh run watch`, or `gh run list -w release.yml`.");
