// SPDX-License-Identifier: MIT
// Install the kit's Claude Code skills into the user's skills folder, so they work in every
// project on this machine (a new app's empty folder has no project skills yet):
//
//   node scripts/install-skills.js
//
// Copies skills/<name>/ → ~/.claude/skills/<name>/ (Claude Code's user-skill location). The
// guard warns when an installed copy differs from the kit's (`installedSkillDrift`).

import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const KIT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SRC = path.join(KIT, "skills");

export const userSkillsDir = () => path.join(os.homedir(), ".claude", "skills");

/** The kit's skills whose installed copy is missing or differs: [{ name, file }]. */
export function installedSkillDrift(dest = userSkillsDir()) {
  const out = [];
  if (!existsSync(SRC)) return out;
  for (const name of readdirSync(SRC)) {
    const dir = path.join(SRC, name);
    for (const file of readdirSync(dir, { recursive: true })) {
      const from = path.join(dir, String(file));
      const to = path.join(dest, name, String(file));
      if (!/\.(md|js|json)$/.test(String(file))) continue;
      if (!existsSync(to) || readFileSync(to, "utf8") !== readFileSync(from, "utf8")) out.push({ name, file: String(file) });
    }
  }
  return out;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const dest = userSkillsDir();
  mkdirSync(dest, { recursive: true });
  for (const name of readdirSync(SRC)) {
    cpSync(path.join(SRC, name), path.join(dest, name), { recursive: true });
    console.log(`installed ${name} → ${path.join(dest, name)}`);
  }
}
