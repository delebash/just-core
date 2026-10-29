// SPDX-License-Identifier: MIT
// A stream's lines, read as they arrive — the one reader for any server's SSE or NDJSON stream the kit follows (an AI
// provider's answer, llama-server's /models/sse). Moved here from llm/base.js 2026-10-29 so runner/ can read one too
// (runner/ never imports llm/).

// A stream's lines end at \r\n, \n or \r — and only there (WHATWG SSE's end of line,
// html.spec.whatwg.org/multipage/server-sent-events.html#parsing-an-event-stream; NDJSON, github.com/ndjson/ndjson-spec).
// The Python port read them with httpx's iter_lines — str.splitlines(), which also breaks at \v \f \x1c-\x1e \x85
// U+2028 U+2029 — and JSON carries those last three raw (llama.cpp escapes only below 0x20): a token holding one was cut
// in two and both halves dropped (fixed 2026-10-29, the finish list's A7).
const NEWLINE_CHARS = "\n\r";
const LINE_END = /\r\n|\r|\n/;

/** httpx._decoders.LineDecoder's incremental shape (a CR at a chunk's end waits for a possible LF), on those line ends. */
class LineDecoder {
  buffer = [];
  trailingCr = false;

  decode(input) {
    let text = input;
    if (this.trailingCr) {
      text = `\r${text}`;
      this.trailingCr = false;
    }
    if (text.endsWith("\r")) {
      this.trailingCr = true;
      text = text.slice(0, -1);
    }
    if (!text) return [];
    const trailingNewline = NEWLINE_CHARS.includes(text[text.length - 1]);
    let lines = text.split(LINE_END);
    if (trailingNewline) lines.pop(); // the empty tail after the last line end (splitlines' shape)
    if (lines.length === 1 && !trailingNewline) {
      this.buffer.push(lines[0]);
      return [];
    }
    if (this.buffer.length) {
      lines = [this.buffer.join("") + lines[0], ...lines.slice(1)];
      this.buffer = [];
    }
    if (!trailingNewline) this.buffer = [lines.pop()];
    return lines;
  }

  flush() {
    if (!this.buffer.length && !this.trailingCr) return [];
    const lines = [this.buffer.join("")];
    this.buffer = [];
    this.trailingCr = false;
    return lines;
  }
}

/**
 * httpx `response.iter_lines()` over a fetch body: UTF-8 with replacement (httpx's default
 * for a response with no charset), lines split as above. Leaving early (a `break`, an
 * error) cancels the body — the `with client.stream(...)` exit. A failed read throws `readError(e)` — the caller's own
 * error for a dropped connection (llm/base.js: its TransportError); the error itself by default.
 */
export async function* iterLines(body, { readError = (e) => e } = {}) {
  if (!body) return;
  const decoder = new TextDecoder("utf-8");
  const ld = new LineDecoder();
  const reader = body.getReader();
  let finished = false;
  try {
    for (;;) {
      let chunk;
      try {
        chunk = await reader.read();
      } catch (e) {
        throw readError(e);
      }
      if (chunk.done) break;
      const text = decoder.decode(chunk.value, { stream: true });
      if (text) yield* ld.decode(text);
    }
    const tail = decoder.decode();
    if (tail) yield* ld.decode(tail);
    yield* ld.flush();
    finished = true;
  } finally {
    if (!finished) reader.cancel().catch(() => {});
    else reader.releaseLock();
  }
}
