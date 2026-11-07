// SPDX-License-Identifier: MIT
// The "claude-code" provider: the person's own installed Claude Code, signed in to their own Claude plan, run headless
// for each request — the plan pays, not an API key (the user's go, 2026-11-07; the record:
// docs/plans/2026-11-06-subscription-providers-research.md).
//
// Standard: Anthropic's headless mode (code.claude.com/docs/en/headless) — `claude -p` with stream-json in and out.
// Each call is a fresh process (the documented way; keeping one ready is a separate decision, not taken):
//   claude -p --input-format stream-json --output-format stream-json --verbose --include-partial-messages
//          --tools "" --safe-mode --no-session-persistence --system-prompt-file <file> [--model m] [--effort e]
//          [--json-schema <schema>]
// `--tools ""` turns its built-in tools off; `--safe-mode` keeps the sign-in but leaves out the person's CLAUDE.md,
// hooks, MCP servers and plugins (measured 2026-11-06: 14,822 prompt tokens without it, 767 with); the system prompt
// always comes from a file — an empty file too, so Claude Code's own coding prompt never rides along (measured
// 2026-11-07: 758 prompt tokens with an empty file). The message goes on stdin, so no prompt text passes through a
// command line (an npm `.cmd` launcher runs through cmd.exe — platform/procs.js popenProgram).
//
// What it can't do: temperature and a reply-length limit (no such flags — dropped, as the provider's own default);
// history (earlier turns ride in the message as a transcript — `-p` takes one turn); embeddings. The kit never reads
// Claude Code's credentials, and the API-key variables are taken out of its environment so it uses the plan sign-in.
// `--bare` will become `-p`'s default in a future release, and bare mode never uses a plan: a call that fails to
// authenticate while `claude auth status` says signed in is reported as exactly that.

import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createInterface } from "node:readline";
import { getLogger } from "../platform/log.js";
import { popenProgram, run } from "../platform/procs.js";
import { errText, isJsonObject, pyInt } from "../platform/py.js";
import { abortError, adapterHttpError, contentParts, contentText, LLMResponse, popReasoning, StreamDelta, splitSystem } from "./base.js";
import { findProgram, forgetStatus, programFor, programStatus } from "./programs.js";

const log = getLogger("llm_runner.llm.claude_code");
const TYPE = "claude-code";

// The environment variables that would make Claude Code bill an API key instead of the plan it's signed in to.
const KEY_VARS = ["ANTHROPIC_API_KEY", "ANTHROPIC_AUTH_TOKEN"];

// The latest plan use each provider's calls reported (Claude Code's `rate_limit_event`), by provider id.
const planUse = new Map();

/** The plan use a provider's last call reported → `{used (0..1), window ("seven_day" …), resetsAt (epoch s), status,
 *  at (epoch ms)}`, or null before its first call this session. */
export const claudePlanUse = (providerId) => planUse.get(providerId) ?? null;

/** A `rate_limit_event`'s info → the plan-use record, or null when it carries no usage figure. */
export function readRateLimit(info) {
  if (!isJsonObject(info)) return null;
  const windowName = info.rateLimitType || "";
  const windows = isJsonObject(info.unifiedWindows) ? info.unifiedWindows : {};
  const w = windows[windowName] ?? Object.values(windows)[0] ?? null;
  const used = typeof w?.utilization === "number" ? w.utilization : typeof info.utilization === "number" ? info.utilization : null;
  if (used == null) return null;
  return { used, window: windowName || Object.keys(windows)[0] || "", resetsAt: w?.resetsAt ?? info.resetsAt ?? null, status: w?.status ?? info.status ?? "", at: Date.now() };
}

/** End a call's process and what it started: an npm launcher runs Claude Code under cmd.exe, and killing cmd.exe
 *  alone leaves it running (Windows: `taskkill /T`, as shell/stale_server.js ends a server). */
function endCall(child) {
  if (child.exitCode != null || child.pid == null) return;
  if (process.platform === "win32") run(["taskkill", "/T", "/F", "/PID", String(child.pid)]).catch(() => child.kill());
  else child.kill();
}

/** Earlier turns as a transcript ahead of the last one (`-p` takes one turn). */
function transcript(turns) {
  const said = turns.map((m) => `${m.role === "assistant" ? "Assistant" : "User"}: ${contentText(m.content)}`);
  return `The conversation so far:\n\n${said.join("\n\n")}\n\n---\n\n`;
}

/** The one stream-json user message for `turns` (the last turn's text and images; earlier turns as a transcript). */
export function userMessage(turns) {
  if (!turns.length) throw adapterHttpError(TYPE, null, "no message to send");
  const last = turns[turns.length - 1];
  const content = [];
  if (turns.length > 1) content.push({ type: "text", text: transcript(turns.slice(0, -1)) });
  for (const p of contentParts(last.content)) {
    content.push(p.type === "image" ? { type: "image", source: { type: "base64", media_type: p.mimeType, data: p.data } } : { type: "text", text: p.text });
  }
  return { type: "user", message: { role: "user", content } };
}

/** The JSON schema a feature asked for (`extra.response_format`), or null. */
export function jsonSchemaOf(extra) {
  const rf = extra?.response_format;
  if (!isJsonObject(rf)) return null;
  if (rf.type === "json_schema" && isJsonObject(rf.json_schema?.schema)) return rf.json_schema.schema;
  // json_object asks only for JSON: the loosest schema says that
  if (rf.type === "json_object" || rf.type === "json" || rf.type === "json_schema") return { type: "object" };
  return null;
}

/** The arguments after the program's path. */
export function claudeArgs({ systemFile, model = "", effort = "", schema = null }) {
  const args = ["-p", "--input-format", "stream-json", "--output-format", "stream-json", "--verbose", "--include-partial-messages"];
  args.push("--tools", "", "--safe-mode", "--no-session-persistence", "--system-prompt-file", systemFile);
  if (model) args.push("--model", model);
  if (effort) args.push("--effort", effort);
  if (schema) args.push("--json-schema", JSON.stringify(schema));
  return args;
}

const FINISH = { end_turn: "stop", stop_sequence: "stop", max_tokens: "length", tool_use: "stop", refusal: "stop" };
const AUTH_WORDS = /log ?in|logged|sign(ed)? ?in|api key|authenticat|unauthori[sz]ed|\b401\b|credential/i;

/** Adapter for the person's installed Claude Code (see the header). */
export class ClaudeCodeAdapter {
  constructor(providerId, { defaultModel = "", timeoutSeconds = 60 } = {}) {
    this.provider_id = providerId;
    this.provider_type = TYPE;
    this.default_model = defaultModel || "";
    // the plan this provider's calls draw on — dispatch records them as plan use, not as billed (usage.js)
    this.plan = "claude";
    this._timeoutSeconds = timeoutSeconds;
  }

  async *streamChat(messages, { model = null, maxTokens = null, system = null, think = false, extra = null, signal = null } = {}) {
    void maxTokens; // no reply-length flag in Claude Code's print mode
    if (signal?.aborted) throw abortError(signal);
    const program = await findProgram(TYPE);
    if (!program) throw adapterHttpError(TYPE, null, "Claude Code isn't installed on this computer (no `claude` program found). Install it, sign in to it once in a terminal (`claude auth login`), then try again.");
    const [rest, effort] = popReasoning(extra);
    const [sysText, turns] = splitSystem(messages, system);
    const schema = jsonSchemaOf(rest);
    const dir = await mkdtemp(join(tmpdir(), "just-ai-claude-"));
    const systemFile = join(dir, "system.txt");
    await writeFile(systemFile, sysText ?? "", "utf8");
    const env = { ...process.env };
    for (const k of KEY_VARS) delete env[k];
    const useModel = model || this.default_model;
    const child = popenProgram([program, ...claudeArgs({ systemFile, model: useModel, effort: think ? effort : "", schema })], { cwd: dir, env });
    const stderr = [];
    child.stderr.on("data", (d) => stderr.push(d));
    const exited = new Promise((resolve) => {
      child.on("error", (e) => resolve({ code: null, error: e }));
      child.on("close", (code) => resolve({ code, error: null }));
    });
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      endCall(child);
    }, this._timeoutSeconds * 1000);
    const onAbort = () => endCall(child);
    signal?.addEventListener("abort", onAbort, { once: true });
    child.stdin.on("error", () => {}); // a program gone before it read its message reports through its exit
    child.stdin.end(`${JSON.stringify(userMessage(turns))}\n`);

    let result = null;
    let init = null;
    let sentText = false;
    let readAll = false;
    try {
      for await (const line of createInterface({ input: child.stdout, crlfDelay: Number.POSITIVE_INFINITY })) {
        if (!line.trim()) continue;
        let ev;
        try {
          ev = JSON.parse(line);
        } catch {
          continue; // not an event (a stray line) — the result says how the call went
        }
        if (ev.type === "system" && ev.subtype === "init") init = ev;
        else if (ev.type === "stream_event") {
          const d = ev.event?.type === "content_block_delta" ? ev.event.delta : null;
          if (d?.type === "text_delta" && d.text) {
            sentText = true;
            yield StreamDelta({ text: d.text });
          } else if (d?.type === "input_json_delta" && d.partial_json) {
            // a JSON feature's answer arrives as the structured-output tool's input
            sentText = true;
            yield StreamDelta({ text: d.partial_json });
          } else if (d?.type === "thinking_delta" && d.thinking) yield StreamDelta({ reasoning: d.thinking });
        } else if (ev.type === "rate_limit_event") {
          const use = readRateLimit(ev.rate_limit_info);
          if (use) planUse.set(this.provider_id, use);
        } else if (ev.type === "result") result = ev;
      }
      readAll = true;
    } finally {
      clearTimeout(timer);
      signal?.removeEventListener("abort", onAbort);
      if (!readAll) endCall(child); // the consumer stopped reading early, or reading failed
    }
    const exit = await exited;
    rm(dir, { recursive: true, force: true }).catch(() => {});
    if (signal?.aborted) throw abortError(signal);
    if (timedOut) throw adapterHttpError(TYPE, null, `no answer within ${this._timeoutSeconds} s (the provider's timeout)`);
    if (exit.error) throw adapterHttpError(TYPE, null, `Claude Code could not start: ${errText(exit.error)}`, { cause: exit.error });
    if (init && init.apiKeySource && init.apiKeySource !== "none") {
      log.warning(`Claude Code answered on an API key (${init.apiKeySource}), not the plan sign-in`);
    }
    if (!result || result.is_error) {
      const words = String(result?.result || result?.errors?.join?.("; ") || Buffer.concat(stderr).toString("utf8")).trim().slice(-600) || `exit ${exit.code}`;
      throw await this._failure(words, result?.api_error_status ?? null);
    }
    if (!sentText && typeof result.result === "string" && result.result) yield StreamDelta({ text: result.result });
    const u = result.usage ?? {};
    const cacheWrite = pyInt(u.cache_creation_input_tokens || 0);
    const cacheRead = pyInt(u.cache_read_input_tokens || 0);
    const done = StreamDelta({
      done: true,
      prompt_tokens: pyInt(u.input_tokens || 0) + cacheWrite + cacheRead,
      completion_tokens: pyInt(u.output_tokens || 0),
      cache_write_tokens: cacheWrite,
      cache_read_tokens: cacheRead,
      finish_reason: FINISH[result.stop_reason] ?? "stop",
    });
    // on a plan: what the call would have cost at API prices (Claude Code's own estimate) — recorded, never billed
    done.plan = this.plan;
    done.estimate_usd = typeof result.total_cost_usd === "number" ? result.total_cost_usd : null;
    done.answered_by = Object.keys(result.modelUsage ?? {})[0] || init?.model || "";
    yield done;
  }

  /** A failed call's error: signed out, `--bare` print mode (signed in, yet the call had no sign-in), or the words. */
  async _failure(words, status) {
    if (AUTH_WORDS.test(words) || status === 401) {
      forgetStatus(TYPE);
      const st = await programStatus(TYPE, { fresh: true }).catch(() => null);
      if (st?.signedIn) {
        return adapterHttpError(TYPE, 401, `Claude Code is signed in, but this call ran without the sign-in — its print mode may now start in --bare mode, which never uses a plan (Claude Code's headless docs). ${words}`);
      }
      return adapterHttpError(TYPE, 401, `Claude Code isn't signed in. Open a terminal and run \`claude auth login\`, then try again. (${words})`);
    }
    return status ? adapterHttpError(TYPE, status, words) : adapterHttpError(TYPE, null, words);
  }

  async chat(messages, opts = {}) {
    let text = "";
    let done = null;
    for await (const d of this.streamChat(messages, opts)) {
      if (d.done) done = d;
      else text += d.text;
    }
    const r = LLMResponse({
      text,
      model: done?.answered_by || opts.model || this.default_model,
      finish_reason: done?.finish_reason || "stop",
      prompt_tokens: done?.prompt_tokens ?? 0,
      completion_tokens: done?.completion_tokens ?? 0,
      cache_write_tokens: done?.cache_write_tokens ?? 0,
      cache_read_tokens: done?.cache_read_tokens ?? 0,
    });
    r.plan = this.plan;
    r.estimate_usd = done?.estimate_usd ?? null;
    return r;
  }

  /** The model names offered in the form — the program's own aliases from the seeded `ai_programs` row. */
  async models() {
    return [...(programFor(TYPE)?.models ?? [])];
  }

  /** Installed and signed in. */
  async ping() {
    try {
      return (await programStatus(TYPE)).signedIn;
    } catch {
      return false;
    }
  }
}
