// SPDX-License-Identifier: MIT
// friendlyAiError (src/services/aiErrors.js): an AI call's failure as one line a person can act on. JustWrite's chat,
// 2026-10-29: the engine's not-enough-memory refusal (runner/lifecycle.js _admitRam) came out as "Couldn't reach the
// LLM: …: it took about 9.6 GB of this machine's memory when it last" — the engine had been reached and refused the
// load, and the 160-character cut took the part that says what is free and what to do.
import { expect, test } from "vitest";
import { friendlyAiError } from "../src/services/aiErrors.js";

const REFUSAL =
  "Chat stream error 503: not enough memory to load gemma-4-26b-a4b: it took about 9.6 GB of this machine's memory when it last loaded here " +
  "(+512 MB safety margin) but only 3.1 GB of this machine's 31.9 GB is free. Close other programs, or pick a smaller model.";

test("the not-enough-memory refusal says the model didn't fit, whole: what it needs, what is free, what to do", () => {
  const out = friendlyAiError(new Error(REFUSAL), { baseUrl: "http://127.0.0.1:8080/v1" }).message;
  expect(out).toMatch(/^The model didn't fit in this computer's memory: /);
  expect(out).not.toMatch(/reach/i);
  expect(out).toContain("it took about 9.6 GB of this machine's memory when it last loaded here (+512 MB safety margin)");
  expect(out).toContain("but only 3.1 GB of this machine's 31.9 GB is free. Close other programs, or pick a smaller model.");
  expect(out).not.toContain("Service unavailable");
});

test("an engine's own words are never cut mid-sentence: a long one ends at a sentence, with an ellipsis", () => {
  const sentence = "The provider said something long and particular about this request that a person may need to read. ";
  const raw = `Error 418: ${sentence.repeat(12)}`;
  const out = friendlyAiError(new Error(raw), null).message;
  expect(out.length).toBeLessThan(raw.length);
  expect(out).toMatch(/read\.…$/);
  const short = friendlyAiError(new Error("Error 418: brief and complete."), null).message;
  expect(short).toContain("brief and complete.");
  expect(short).not.toContain("…");
});
