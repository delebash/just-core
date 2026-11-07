// SPDX-License-Identifier: MIT
// llm/claude_code.js — the "claude-code" provider: the person's installed Claude Code on their own Claude plan (the
// user's go, 2026-11-07). The program is a stand-in (fixtures/fake_claude.js) behind a launcher like npm's, so the
// spawn through cross-spawn, the arguments, the message on stdin and the stream-json reading are all real.
import { chmodSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeAll, expect, test, vi } from "vitest";

const status = vi.hoisted(() => ({ value: { installed: true, signedIn: false, plan: null, detail: null }, launcher: null }));
vi.mock("../src/llm/programs.js", async (importOriginal) => ({
  ...(await importOriginal()),
  findProgram: async () => status.launcher,
  programStatus: async () => status.value,
}));

const { ClaudeCodeAdapter, claudeArgs, claudePlanUse, jsonSchemaOf, readRateLimit, userMessage } = await import("../src/llm/claude_code.js");
const { construct } = await import("../src/llm/registry.js");

const HERE = dirname(fileURLToPath(import.meta.url));
const WIN = process.platform === "win32";
let dir;
let outFile;

beforeAll(() => {
  dir = mkdtempSync(join(tmpdir(), "kit-claude-"));
  outFile = join(dir, "seen.json");
  const fake = join(HERE, "fixtures", "fake_claude.js");
  // started the way npm's launcher starts a program: a .cmd through cmd.exe on Windows (cross-spawn), a script elsewhere
  status.launcher = join(dir, WIN ? "claude.cmd" : "claude");
  writeFileSync(status.launcher, WIN ? `@"${process.execPath}" "${fake}" %*\r\n` : `#!/bin/sh\nexec "${process.execPath}" "${fake}" "$@"\n`);
  if (!WIN) chmodSync(status.launcher, 0o755);
});
afterEach(() => {
  delete process.env.FAKE_CLAUDE_MODE;
  delete process.env.FAKE_CLAUDE_OUT;
  delete process.env.ANTHROPIC_API_KEY;
});

const seen = () => JSON.parse(readFileSync(outFile, "utf8"));

test("the arguments: print mode, stream-json both ways, no tools, safe mode, no session, the system prompt from a file", () => {
  expect(claudeArgs({ systemFile: "s.txt" })).toEqual([
    "-p", "--input-format", "stream-json", "--output-format", "stream-json", "--verbose", "--include-partial-messages",
    "--tools", "", "--safe-mode", "--no-session-persistence", "--system-prompt-file", "s.txt",
  ]);
  const a = claudeArgs({ systemFile: "s.txt", model: "haiku", effort: "high", schema: { type: "object" } });
  expect(a.slice(-6)).toEqual(["--model", "haiku", "--effort", "high", "--json-schema", '{"type":"object"}']);
});

test("one message on stdin: the last turn's text and images; earlier turns ride in it as a transcript", () => {
  expect(userMessage([{ role: "user", content: "hi" }])).toEqual({ type: "user", message: { role: "user", content: [{ type: "text", text: "hi" }] } });
  const m = userMessage([
    { role: "user", content: "first" },
    { role: "assistant", content: "answer" },
    { role: "user", content: [{ type: "text", text: "look" }, { type: "image_url", image_url: { url: "data:image/png;base64,AAAA" } }] },
  ]);
  expect(m.message.content[0].text).toContain("User: first\n\nAssistant: answer");
  expect(m.message.content.slice(1)).toEqual([{ type: "text", text: "look" }, { type: "image", source: { type: "base64", media_type: "image/png", data: "AAAA" } }]);
});

test("a feature's JSON contract becomes a schema; plan use reads from the rate-limit event", () => {
  expect(jsonSchemaOf({ response_format: { type: "json_schema", json_schema: { schema: { type: "object", properties: {} } } } })).toEqual({ type: "object", properties: {} });
  expect(jsonSchemaOf({ response_format: { type: "json_object" } })).toEqual({ type: "object" });
  expect(jsonSchemaOf({})).toBe(null);
  expect(readRateLimit({ rateLimitType: "seven_day", unifiedWindows: { seven_day: { utilization: 0.3, resetsAt: 5, status: "allowed" } } })).toMatchObject({ used: 0.3, window: "seven_day", resetsAt: 5 });
  expect(readRateLimit({ status: "allowed" })).toBe(null);
});

test("a call streams the text, counts the whole prompt, reports the plan and its use, and never passes an API key", async () => {
  process.env.FAKE_CLAUDE_OUT = outFile;
  process.env.ANTHROPIC_API_KEY = "sk-not-for-the-plan";
  const a = construct({ id: "cc", providerType: "claude-code", defaultModel: "haiku", timeoutSeconds: 60 });
  expect(a).toBeInstanceOf(ClaudeCodeAdapter);
  const events = [];
  for await (const d of a.streamChat([{ role: "user", content: "Say hi" }], { system: "Be brief.\nTwo lines.", temperature: 0.2, maxTokens: 10 })) events.push(d);
  expect(events.filter((d) => d.text).map((d) => d.text).join("")).toBe("Hello there");
  expect(events.find((d) => d.reasoning)?.reasoning).toBe("hmm");
  const done = events.at(-1);
  expect(done).toMatchObject({ done: true, prompt_tokens: 752, completion_tokens: 9, cache_write_tokens: 700, cache_read_tokens: 50, finish_reason: "stop", plan: "claude", estimate_usd: 0.0012 });
  expect(claudePlanUse("cc")).toMatchObject({ used: 0.37, window: "seven_day" });
  const s = seen();
  expect(s.args[s.args.indexOf("--tools") + 1], "the empty tool list arrives as an empty argument").toBe("");
  expect(s.args).toContain("--safe-mode");
  expect(s.args.slice(s.args.indexOf("--model"), s.args.indexOf("--model") + 2)).toEqual(["--model", "haiku"]);
  expect(s.systemPrompt, "the system prompt, line breaks and all, by file").toBe("Be brief.\nTwo lines.");
  expect(s.message.message.content).toEqual([{ type: "text", text: "Say hi" }]);
  expect(s.apiKeySeen, "the plan sign-in, not a key").toBe(false);
});

test("chat() reads the stream whole; a JSON feature's answer comes from the structured-output tool", async () => {
  process.env.FAKE_CLAUDE_MODE = "schema";
  process.env.FAKE_CLAUDE_OUT = outFile;
  const schema = { type: "object", properties: { colour: { type: "string", description: 'a "plain" name & no <tags>' } }, required: ["colour"] };
  const a = construct({ id: "cc2", providerType: "claude-code", timeoutSeconds: 60 });
  const r = await a.chat([{ role: "user", content: "a colour" }], { extra: { response_format: { type: "json_schema", json_schema: { schema } } } });
  expect(JSON.parse(r.text)).toEqual({ colour: "Blue" });
  expect(r).toMatchObject({ model: "claude-haiku-5-5", plan: "claude", estimate_usd: 0.0012, finish_reason: "stop" });
  // the schema's quotes, & and <> arrive whole through the launcher (cmd.exe on Windows)
  const s = seen();
  expect(JSON.parse(s.args[s.args.indexOf("--json-schema") + 1])).toEqual(schema);
});

test("signed out: the error says how to sign in; signed in yet refused: it names --bare", async () => {
  process.env.FAKE_CLAUDE_MODE = "auth";
  const a = construct({ id: "cc3", providerType: "claude-code", timeoutSeconds: 60 });
  status.value = { installed: true, signedIn: false, plan: null, detail: null };
  await expect(a.chat([{ role: "user", content: "x" }])).rejects.toThrow(/claude-code 401: .*claude auth login/);
  status.value = { installed: true, signedIn: true, plan: "max", detail: null };
  await expect(a.chat([{ role: "user", content: "x" }])).rejects.toThrow(/--bare/);
});

test("not installed: a plain error before anything starts", async () => {
  const saved = status.launcher;
  status.launcher = null;
  try {
    const a = construct({ id: "cc4", providerType: "claude-code", timeoutSeconds: 60 });
    await expect(a.chat([{ role: "user", content: "x" }])).rejects.toThrow(/isn't installed/);
  } finally {
    status.launcher = saved;
  }
});
