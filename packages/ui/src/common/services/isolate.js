// SPDX-License-Identifier: MIT
// A name a person gave — a house's, a design's, a book's — set inside a sentence, isolated from it: a
// right-to-left name ("בית") took the sentence's quotes and punctuation into its own direction and
// they came out in the wrong places. In the page's own HTML the name is wrapped in <bdi> (the HTML
// standard's bidi isolate — html.spec.whatwg.org/multipage/text-level-semantics.html#the-bdi-element);
// in words that aren't HTML (a button's label, an aria-label or alt, a dialog's or a toast's words, a
// task's name) it goes between FIRST STRONG ISOLATE and POP DIRECTIONAL ISOLATE (U+2068 … U+2069),
// the Unicode Bidirectional Algorithm's own isolates (unicode.org/reports/tr9/#Explicit_Directional_Isolates;
// w3.org/International/questions/qa-bidi-unicode-controls). From just-house-paint (2026-10-20), for every app.
//
// Only a name that needs them gets the marks: one holding a strong letter of the OTHER direction than
// the page's (<html dir>; left-to-right when it has none, or with no document). A plain name in the
// page's own direction — "Maple street" on an English page — comes back as typed: the marks were in
// every name, and a braille display shows them (the screens-and-keyboard review, 2026-10-20). Which
// letters are strong left-to-right or right-to-left is Google Closure Library's goog.i18n.bidi
// (closure/goog/i18n/bidi.js, its ltrChars_ and rtlChars_ — UTF-16 ranges, so a letter outside the
// BMP is told by its high surrogate), copied below under its licence:
//
//   Copyright The Closure Library Authors.
//   SPDX-License-Identifier: Apache-2.0
//   (github.com/google/closure-library/blob/master/closure/goog/i18n/bidi.js — the Apache License 2.0,
//   www.apache.org/licenses/LICENSE-2.0)

const FSI = "\u2068"; // FIRST STRONG ISOLATE
const PDI = "\u2069"; // POP DIRECTIONAL ISOLATE

// goog.i18n.bidi.ltrChars_ and rtlChars_, as they are there
const LTR_CHARS =
  "A-Za-z\u00C0-\u00D6\u00D8-\u00F6\u00F8-\u02B8\u0300-\u0590\u0900-\u1FFF" +
  "\u200E\u2C00-\uD801\uD804-\uD839\uD83C-\uDBFF" +
  "\uF900-\uFB1C\uFE00-\uFE6F\uFEFD-\uFFFF";
const RTL_CHARS = "\u0591-\u06EF\u06FA-\u08FF\u200F\uD802-\uD803\uD83A-\uD83B" + "\uFB1D-\uFDFF\uFE70-\uFEFC";

const HAS_LTR = new RegExp(`[${LTR_CHARS}]`);
const HAS_RTL = new RegExp(`[${RTL_CHARS}]`);

/** The page's direction: "rtl" when <html dir="rtl">, else "ltr" (no dir, or no document). */
function pageDirection() {
  const dir = typeof document !== "undefined" ? document.documentElement?.dir : "";
  return String(dir || "").toLowerCase() === "rtl" ? "rtl" : "ltr";
}

/** `name` between FSI and PDI when it holds a strong letter of the other direction than the page's;
 *  else as it was typed. `dir` ("ltr" | "rtl") stands for the page's direction (a test, a server). */
export function isolate(name, { dir } = {}) {
  const text = String(name ?? "");
  const other = (dir || pageDirection()) === "rtl" ? HAS_LTR : HAS_RTL;
  return other.test(text) ? `${FSI}${text}${PDI}` : text;
}
