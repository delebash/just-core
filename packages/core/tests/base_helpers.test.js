// SPDX-License-Identifier: MIT
// Port of tests/test_base_helpers.py — the four shared adapter helpers in base.js: the
// OpenAI-shape message builder, the system sweep, the sampler allowlist filter, and the
// one-place D10 error formatter.
import { expect, test } from "vitest";
import { adapterHttpError, buildChatMessages, iterLines, LLMMessage, selectAllowed, splitSystem } from "../src/llm/base.js";
import { RuntimeError } from "../src/platform/py.js";

test("build_chat_messages_prepends_system_then_turns", () => {
  const out = buildChatMessages([LLMMessage("user", "hi"), LLMMessage("assistant", "yo")], "be terse");
  expect(out).toEqual([
    { role: "system", content: "be terse" },
    { role: "user", content: "hi" },
    { role: "assistant", content: "yo" },
  ]);
  // no system argument → no leading system turn
  expect(buildChatMessages([LLMMessage("user", "q")], null)).toEqual([{ role: "user", content: "q" }]);
});

test("split_system_sweeps_kwarg_and_system_turns", () => {
  const [sysText, rest] = splitSystem(
    [LLMMessage("system", "rule A"), LLMMessage("user", "q"), LLMMessage("system", "rule B"), LLMMessage("assistant", "a")],
    "kwarg sys",
  );
  // the argument first, then the swept system turns, joined by a blank line
  expect(sysText).toBe("kwarg sys\n\nrule A\n\nrule B");
  // the remainder is the non-system turns (each adapter maps them)
  expect(rest.map((m) => [m.role, m.content])).toEqual([
    ["user", "q"],
    ["assistant", "a"],
  ]);
  // nothing to sweep → null + the turns unchanged
  const [noneSys, kept] = splitSystem([LLMMessage("user", "x")], null);
  expect(noneSys).toBeNull();
  expect(kept.map((m) => m.content)).toEqual(["x"]);
});

test("select_allowed_keeps_allowed_applies_renames_drops_rest", () => {
  const out = selectAllowed(
    { top_p: 0.9, min_p: 0.05, mirostat: 2, samplers: ["a"], stop: ["END"] },
    new Set(["top_p", "seed", "stop"]),
    { stop: "stop_sequences" },
  );
  expect(out).toEqual({ top_p: 0.9, stop_sequences: ["END"] }); // min_p/mirostat/samplers dropped
  expect(selectAllowed(null, new Set(["top_p"]))).toEqual({}); // null → {}
  expect(selectAllowed({}, new Set(["top_p"]))).toEqual({}); // empty → {}
});

test("adapter_http_error_formats_the_three_D10_forms", () => {
  const nonStream = adapterHttpError("gemini", 404, "not found");
  expect(nonStream.message).toBe("gemini 404: not found");
  expect(nonStream).toBeInstanceOf(RuntimeError);
  const stream = adapterHttpError("gemini", 500, "boom", { stream: true });
  expect(stream.message).toBe("gemini stream 500: boom");
  const transport = adapterHttpError("anthropic", null, "connection reset");
  expect(transport.message).toBe("anthropic request failed: connection reset");
  // detail is capped at 400 chars (the envelope's contract)
  expect(adapterHttpError("openai", 400, "x".repeat(600)).message).toBe(`openai 400: ${"x".repeat(400)}`);
});

/** A fetch body that hands over `chunks`, as a server's stream arrives. */
const bodyOf = (chunks) =>
  new ReadableStream({
    start(c) {
      for (const s of chunks) c.enqueue(new TextEncoder().encode(s));
      c.close();
    },
  });
const linesOf = async (chunks) => {
  const out = [];
  for await (const line of iterLines(bodyOf(chunks))) out.push(line);
  return out;
};

// The finish list's A7 (2026-10-29): the reader was httpx's iter_lines — Python's splitlines, which also breaks at
// \v \f \x1c-\x1e U+0085 U+2028 U+2029. A JSON string carries those three raw (llama.cpp escapes only below 0x20), so a
// token holding one was cut in two and silently lost. A stream's lines end at \r\n, \n or \r only (WHATWG SSE's end of
// line; NDJSON).
test("a stream's lines end at CR, LF or CRLF only — a token holding U+2028, U+2029, U+0085, VT or FF stays whole", async () => {
  const token = 'data: {"delta":"a b c\u0085d\u000be\u000cf"}';
  expect(await linesOf([`${token}\n\n`])).toEqual([token, ""]);
  // across chunks, and a CRLF split between two
  expect(await linesOf(["data: {\"x\":", "\"a b\"}\r", "\ndata: 2\r\n"])).toEqual(['data: {"x":"a b"}', "data: 2"]);
  // a lone CR ends a line; a last line without an end is still read
  expect(await linesOf(["one\rtwo\nthree"])).toEqual(["one", "two", "three"]);
});
