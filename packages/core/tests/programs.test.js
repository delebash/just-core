// SPDX-License-Identifier: MIT
// llm/programs.js — finding the AI programs a person installed (Claude Code) and reading their sign-in status
// (the user's go on the subscription providers, 2026-11-07).
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, test } from "vitest";
import { DEFAULT_AI_PROGRAMS, findProgram, programFor, programTypes, readStatus, seedDoc } from "../src/llm/programs.js";
import { seedAiPrograms } from "../src/llm/seed.js";
import { freshDb } from "./helpers.js";

const WIN = process.platform === "win32";
const savedPath = { PATH: process.env.PATH, Path: process.env.Path };
afterEach(() => {
  for (const [k, v] of Object.entries(savedPath)) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
});

/** A `claude` launcher in `dir` (an npm-style `.cmd` on Windows, a script elsewhere). */
function launcher(dir) {
  mkdirSync(dir, { recursive: true });
  const file = join(dir, WIN ? "claude.cmd" : "claude");
  writeFileSync(file, WIN ? "@echo off\r\n" : "#!/bin/sh\n", { mode: 0o755 });
  return file;
}

test("the status command's JSON reads as signed in or out, its plan word kept; anything else is the detail", () => {
  expect(readStatus('{"loggedIn": true, "authMethod": "claude.ai", "subscriptionType": "max"}')).toEqual({ signedIn: true, plan: "max", detail: null });
  expect(readStatus('{"loggedIn": false}', 1)).toEqual({ signedIn: false, plan: null, detail: null });
  expect(readStatus("error: unknown command 'auth'", 1, "")).toEqual({ signedIn: false, plan: null, detail: "error: unknown command 'auth'" });
  expect(readStatus("", 3, "")).toEqual({ signedIn: false, plan: null, detail: "exit 3" });
});

test("a program is found in a seeded folder after PATH, never in a path the row skips — and not at all when absent", async () => {
  process.env.PATH = "";
  if (WIN) process.env.Path = "";
  const root = mkdtempSync(join(tmpdir(), "kit-programs-"));
  const doc = seedDoc();
  const skipped = join(root, "AnthropicClaude");
  const real = join(root, "bin");
  doc.folders = { win32: [skipped, real], other: [skipped, real] };
  expect(await findProgram("claude-code", doc), "nothing installed yet").toBe(null);
  launcher(skipped); // the Claude desktop app's own claude, first in the list
  expect(await findProgram("claude-code", doc), "only the desktop app's").toBe(null);
  const file = launcher(real);
  expect((await findProgram("claude-code", doc))?.toLowerCase()).toBe(file.toLowerCase());
  expect(await findProgram("no-such-type", doc)).toBe(null);
});

test("the seeded document names Claude Code with its status command and models; the seed row follows it until edited", () => {
  expect(programTypes(DEFAULT_AI_PROGRAMS)).toEqual(["claude-code"]);
  expect(programFor("claude-code", DEFAULT_AI_PROGRAMS)).toMatchObject({ command: "claude", statusArgs: ["auth", "status", "--json"], name: "Claude Code" });
  const h = freshDb();
  expect(seedAiPrograms(h)).toBe(1);
  expect(JSON.parse(h.get("runner_setting", "ai_programs").value)).toEqual(DEFAULT_AI_PROGRAMS);
  // an old seed, unedited, is refreshed; a user's edit is kept
  h.update("runner_setting", { value: JSON.stringify({ programs: [], folders: {} }) }, { key: "ai_programs" });
  expect(seedAiPrograms(h)).toBe(0);
  expect(JSON.parse(h.get("runner_setting", "ai_programs").value)).toEqual(DEFAULT_AI_PROGRAMS);
  h.update("runner_setting", { value: JSON.stringify({ programs: [], folders: {} }), built_in: false }, { key: "ai_programs" });
  seedAiPrograms(h);
  expect(JSON.parse(h.get("runner_setting", "ai_programs").value)).toEqual({ programs: [], folders: {} });
});
