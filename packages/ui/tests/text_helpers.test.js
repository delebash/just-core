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

// The sixteenth review (2026-10-20): a Latin name holding an override (RLO) came back unwrapped, and the override
// turned the rest of the sentence backwards. Any bidi control — LRM, RLM, LRE…RLO, LRI…PDI — gets the marks.
test("a name holding a bidi control is isolated whatever its letters", () => {
  const ch = (cp) => String.fromCharCode(cp);
  const FSI = ch(0x2068);
  const PDI = ch(0x2069);
  for (const cp of [0x200e, 0x200f, 0x202a, 0x202b, 0x202c, 0x202d, 0x202e, 0x2066, 0x2067, 0x2068, 0x2069]) {
    const name = `abc${ch(cp)}def`;
    expect(isolate(name), cp.toString(16)).toBe(`${FSI}${name}${PDI}`);
    expect(isolate(name, { dir: "rtl" }), cp.toString(16)).toBe(`${FSI}${name}${PDI}`);
  }
  expect(isolate("abc def")).toBe("abc def");
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
