// SPDX-License-Identifier: MIT
// A person's name inside a sentence keeps its own direction (isolate — FSI/PDI, only on a name holding a letter of
// the other direction than the page's: Google Closure's goog.i18n.bidi ranges); a file named by its date takes the
// computer's own date (localDate), not Greenwich's.
import { expect, test } from "vitest";
import { localDate } from "../src/common/services/isoDate.js";
import { isolate } from "../src/common/services/isolate.js";

test("isolate marks a name of the other direction than the page's (FSI … PDI) and leaves a plain one as typed", () => {
  // no document (Node): the page is left-to-right
  expect(isolate("בית")).toBe("\u2068בית\u2069");
  expect(isolate("בית הים — 10/20")).toBe("\u2068בית הים — 10/20\u2069");
  expect(isolate("Maple street")).toBe("Maple street");
  expect(isolate("Café “Ölmühle”")).toBe("Café “Ölmühle”");
  expect(isolate("12 / 20")).toBe("12 / 20"); // no strong letter at all
  expect(isolate("Maple בית")).toBe("\u2068Maple בית\u2069"); // a mix holds the other direction
  expect(isolate("بيت")).toBe("\u2068بيت\u2069"); // Arabic
  expect(isolate("𐤀𐤁")).toBe("\u2068𐤀𐤁\u2069"); // Phoenician, outside the BMP (its high surrogate D802)
  expect(isolate(null)).toBe("");
  expect(isolate(undefined)).toBe("");
});

test("on a right-to-left page a left-to-right name is the one marked", () => {
  expect(isolate("בית", { dir: "rtl" })).toBe("בית");
  expect(isolate("Maple street", { dir: "rtl" })).toBe("\u2068Maple street\u2069");
  expect(isolate("12", { dir: "rtl" })).toBe("12");
});

// The sixteenth review (2026-10-20): a Latin name holding an override (RLO) turned the rest of the sentence
// backwards; the seventeenth: a stray PDI in a name closed its isolate early. A name's bidi controls — LRM, RLM,
// LRE…RLO, LRI…PDI — are taken out before it is judged and marked.
test("a name's bidi controls are taken out before it is judged and marked", () => {
  const ch = (cp) => String.fromCharCode(cp);
  const FSI = ch(0x2068);
  const PDI = ch(0x2069);
  for (const cp of [0x200e, 0x200f, 0x202a, 0x202b, 0x202c, 0x202d, 0x202e, 0x2066, 0x2067, 0x2068, 0x2069]) {
    expect(isolate(`abc${ch(cp)}def`), cp.toString(16)).toBe("abcdef");
    expect(isolate(`abc${ch(cp)}def`, { dir: "rtl" }), cp.toString(16)).toBe(`${FSI}abcdef${PDI}`);
  }
  // a stray PDI can't close the isolate early: the Hebrew name comes out whole, inside one isolate
  expect(isolate(`בית${PDI} הים`)).toBe(`${FSI}בית הים${PDI}`);
  expect(isolate("abc def")).toBe("abc def");
});

// A server's detail is a lowercase phrase: on its own it starts a sentence — but a first word that is a name or
// code keeps its case (the seventeenth review: "sd-cli", "macOS"). Said with its title: "Title. Detail."
test("sentence() capitalizes a detail's first word, never a name's or code's; spoken() joins title and detail", async () => {
  const { sentence, spoken } = await import("../src/common/services/announce.js");
  expect(sentence("download the part-finding model first")).toBe("Download the part-finding model first");
  expect(sentence("sd-cli failed (exit 3)")).toBe("sd-cli failed (exit 3)");
  expect(sentence("macOS 26 or later")).toBe("macOS 26 or later");
  expect(sentence("llama.cpp stopped")).toBe("llama.cpp stopped");
  expect(sentence("x64 builds only")).toBe("x64 builds only");
  expect(sentence("épuisé")).toBe("Épuisé");
  expect(spoken("The AI photo didn't finish", "the GPU ran out of memory")).toBe("The AI photo didn't finish. The GPU ran out of memory.");
  expect(spoken("Saved.", "")).toBe("Saved.");
  expect(spoken("Can't install:", "sd-cli is missing.")).toBe("Can't install: sd-cli is missing.");
});

test("the page's direction is <html dir>", () => {
  const html = { dir: "rtl" };
  globalThis.document = { documentElement: html };
  try {
    expect(isolate("Maple street")).toBe("\u2068Maple street\u2069");
    expect(isolate("בית")).toBe("בית");
    html.dir = "";
    expect(isolate("Maple street")).toBe("Maple street");
    expect(isolate("בית")).toBe("\u2068בית\u2069");
  } finally {
    delete globalThis.document;
  }
});

test("localDate is the computer's own calendar date", () => {
  // 23:30 on the 1st, local time — the 2nd somewhere east of here
  expect(localDate(new Date(2027, 2, 1, 23, 30))).toBe("2027-03-01");
});
