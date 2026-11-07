// SPDX-License-Identifier: MIT
// A stand-in for Claude Code's print mode (tests/subscription_providers.test.js): reads the one stream-json message on
// stdin, writes what it was given to FAKE_CLAUDE_OUT (its arguments, the system prompt file's text, the message, whether
// an API-key variable reached it), then answers in Claude Code's stream-json events — shapes as measured 2026-11-06/07
// (docs/plans/2026-11-06-subscription-providers-research.md). FAKE_CLAUDE_MODE: "ok" (default) | "auth" (a signed-out
// failure) | "schema" (a JSON answer through the structured-output tool).
import { readFileSync, writeFileSync } from "node:fs";

const args = process.argv.slice(2);
const mode = process.env.FAKE_CLAUDE_MODE || "ok";
let stdin = "";
process.stdin.setEncoding("utf8");
process.stdin.on("data", (d) => {
  stdin += d;
});
process.stdin.on("end", () => {
  const at = args.indexOf("--system-prompt-file");
  const systemPrompt = at >= 0 ? readFileSync(args[at + 1], "utf8") : null;
  if (process.env.FAKE_CLAUDE_OUT) {
    writeFileSync(
      process.env.FAKE_CLAUDE_OUT,
      JSON.stringify({ args, systemPrompt, message: JSON.parse(stdin.trim().split("\n")[0]), apiKeySeen: "ANTHROPIC_API_KEY" in process.env }),
    );
  }
  const out = (o) => process.stdout.write(`${JSON.stringify(o)}\n`);
  out({ type: "system", subtype: "init", apiKeySource: "none", model: "claude-haiku-5-5", tools: [] });
  if (mode === "auth") {
    out({ type: "result", subtype: "success", is_error: true, result: "Not logged in · Please run /login", api_error_status: null });
    return;
  }
  const delta = (d) => out({ type: "stream_event", event: { type: "content_block_delta", index: 0, delta: d } });
  if (mode === "schema") {
    delta({ type: "input_json_delta", partial_json: '{"colour": ' });
    delta({ type: "input_json_delta", partial_json: '"Blue"}' });
  } else {
    delta({ type: "thinking_delta", thinking: "hmm" });
    delta({ type: "text_delta", text: "Hello " });
    delta({ type: "text_delta", text: "there" });
  }
  out({
    type: "rate_limit_event",
    rate_limit_info: { status: "allowed", resetsAt: 1794387600, rateLimitType: "seven_day", unifiedWindows: { seven_day: { utilization: 0.37, resetsAt: 1794387600, status: "allowed" } } },
  });
  out({
    type: "result",
    subtype: "success",
    is_error: false,
    stop_reason: mode === "schema" ? "tool_use" : "end_turn",
    result: mode === "schema" ? '{"colour":"Blue"}' : "Hello there",
    total_cost_usd: 0.0012,
    usage: { input_tokens: 2, cache_creation_input_tokens: 700, cache_read_input_tokens: 50, output_tokens: 9 },
    modelUsage: { "claude-haiku-5-5": { inputTokens: 2, outputTokens: 9 } },
  });
});
