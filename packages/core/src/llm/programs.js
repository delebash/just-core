// SPDX-License-Identifier: MIT
// The AI programs a person installed and signed in to themselves — Claude Code today — that a provider runs on their
// own plan instead of an API key (docs/plans/2026-11-06-subscription-providers-research.md; the user's go, 2026-11-07).
//
// "Installed" is a file lookup, never a settings folder (a `~/.copilot` folder exists on a machine with no `copilot`
// program): PATH with PATHEXT through `which` (ISC, github.com/npm/node-which), then the folders installers put
// programs in — an app started before the install has an older PATH. Signed in is the program's own status command
// (`claude auth status --json`); the kit never reads a program's credentials.
//
// Which programs, their status command, the folders and the paths to skip are DATA: one seeded JSON document in
// runner_setting (`ai_programs`), refreshed while unedited — the model-list rules' convention (seed.js
// seedModelListRules). The folder list is Craft Anything's (github.com/storytold/craft-anything,
// crates/platform/src/which.rs, MIT/Apache-2.0 — NOTICE.md).

import { statSync } from "node:fs";
import { homedir } from "node:os";
import { delimiter } from "node:path";
import which from "which";
import { getLogger } from "../platform/log.js";
import { run } from "../platform/procs.js";
import { errText } from "../platform/py.js";
import * as db from "./db.js";

const log = getLogger("llm_runner.llm.programs");

export const PROGRAMS_SETTING = "ai_programs";

/** The seeded document. `programs[]`: one per provider type that runs an installed program — its command, the
 *  status command's arguments, path pieces that mark another program of the same name (the Claude desktop app's
 *  `claude.exe`), the name people know it by, and the model names offered in the form (the program's own aliases; any full model name works too).
 *  `folders`: where to look after PATH, per platform ("win32" | "other"); `~` is the home folder. */
export const DEFAULT_AI_PROGRAMS = {
  programs: [
    {
      providerType: "claude-code",
      name: "Claude Code",
      command: "claude",
      statusArgs: ["auth", "status", "--json"],
      skip: ["AnthropicClaude", "WindowsApps"],
      models: ["sonnet", "opus", "haiku", "fable"],
    },
  ],
  folders: {
    win32: [
      "~\\.local\\bin",
      "~\\AppData\\Roaming\\npm",
      "~\\AppData\\Local\\Microsoft\\WinGet\\Links",
      "~\\.bun\\bin",
      "C:\\Program Files\\WinGet\\Links",
    ],
    other: ["~/.local/bin", "~/.claude/local", "~/.npm-global/bin", "~/.bun/bin", "~/.volta/bin", "/opt/homebrew/bin", "/usr/local/bin"],
  },
};

/** The seed for runner_setting's `ai_programs` row (seed.js). */
export const seedDoc = () => structuredClone(DEFAULT_AI_PROGRAMS);

/** The document in force: the database's row, or the seed when storage isn't configured or the row won't parse. */
export function programsDoc() {
  if (!db.isConfigured()) return seedDoc();
  try {
    const row = db.session().get("runner_setting", PROGRAMS_SETTING);
    const doc = row ? JSON.parse(row.value) : null;
    if (doc && Array.isArray(doc.programs)) return doc;
  } catch (e) {
    log.warning(`the ${PROGRAMS_SETTING} setting doesn't parse — using the seed: ${errText(e)}`);
  }
  return seedDoc();
}

/** The program row for a provider type, or null. */
export const programFor = (providerType, doc = programsDoc()) => doc.programs.find((p) => p.providerType === providerType) ?? null;

/** The provider types that run an installed program. */
export const programTypes = (doc = programsDoc()) => doc.programs.map((p) => p.providerType);

const expandHome = (f) => (f.startsWith("~") ? homedir() + f.slice(1) : f);

/** PATH, then the seeded folders for this platform. */
export function searchPath(doc = programsDoc(), env = process.env) {
  const folders = (doc.folders?.[process.platform === "win32" ? "win32" : "other"] ?? []).map(expandHome);
  return [env.PATH ?? env.Path ?? "", ...folders].filter(Boolean).join(delimiter);
}

const found = new Map(); // providerType → path, re-checked on use (a program moved or removed is looked up again)

const isFile = (p) => {
  try {
    return statSync(p).isFile();
  } catch {
    return false;
  }
};

/** Where the program for `providerType` is installed, or null. Skips a path holding any of the row's `skip` pieces. */
export async function findProgram(providerType, doc = programsDoc()) {
  const row = programFor(providerType, doc);
  if (!row) return null;
  const cached = found.get(providerType);
  if (cached && isFile(cached)) return cached;
  const hits = (await which(row.command, { all: true, nothrow: true, path: searchPath(doc) })) ?? [];
  const skip = (row.skip ?? []).map((s) => s.toLowerCase());
  const hit = hits.find((p) => !skip.some((s) => p.toLowerCase().includes(s))) ?? null;
  if (hit) found.set(providerType, hit);
  else found.delete(providerType);
  return hit;
}

const statusCache = new Map(); // providerType → {at, value}
const STATUS_FRESH_MS = 30_000; // the settings screen's repeated looks reuse one check (each costs 0.7–2 s)

/**
 * Is the program installed and signed in? → `{name, command, installed, path, signedIn, plan, detail}`. `plan` is the program's own
 * word for the subscription ("max", "pro"); `detail` says what failed when the status command did. `fresh` skips the
 * short cache.
 */
export async function programStatus(providerType, { fresh = false } = {}) {
  const cached = statusCache.get(providerType);
  if (!fresh && cached && Date.now() - cached.at < STATUS_FRESH_MS) return cached.value;
  const doc = programsDoc();
  const row = programFor(providerType, doc);
  const path = row ? await findProgram(providerType, doc) : null;
  let value = { name: row?.name ?? providerType, command: row?.command ?? "", installed: Boolean(path), path, signedIn: false, plan: null, detail: null };
  if (path && row.statusArgs?.length) {
    try {
      const r = await run([path, ...row.statusArgs], { timeout: 15, program: true });
      value = { ...value, ...readStatus(r.stdout, r.returncode, r.stderr) };
    } catch (e) {
      value.detail = errText(e);
    }
  }
  statusCache.set(providerType, { at: Date.now(), value });
  return value;
}

/** Forget the cached status (after a call found the program signed out). */
export const forgetStatus = (providerType) => statusCache.delete(providerType);

/** `claude auth status --json`'s answer → `{signedIn, plan, detail}` (exit 1 with `loggedIn: false` when signed out). */
export function readStatus(stdout, returncode = 0, stderr = "") {
  let j = null;
  try {
    j = JSON.parse(String(stdout).trim());
  } catch {
    // not JSON — an old version or a failure; its words are the detail
  }
  if (j && typeof j === "object") {
    return { signedIn: j.loggedIn === true, plan: j.subscriptionType || null, detail: null };
  }
  const words = String(stderr || stdout || "").trim().slice(-400);
  return { signedIn: false, plan: null, detail: words || `exit ${returncode}` };
}
