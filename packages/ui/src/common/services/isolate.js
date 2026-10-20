// SPDX-License-Identifier: MIT
// A name a person gave — a house's, a design's, a book's — set inside a sentence, isolated from it: a
// right-to-left name ("בית") took the sentence's quotes and punctuation into its own direction and
// they came out in the wrong places. In the page's own HTML the name is wrapped in <bdi> (the HTML
// standard's bidi isolate — html.spec.whatwg.org/multipage/text-level-semantics.html#the-bdi-element);
// in words that aren't HTML (a button's label, an aria-label or alt, a dialog's or a toast's words, a
// task's name) it goes between FIRST STRONG ISOLATE and POP DIRECTIONAL ISOLATE (U+2068 … U+2069),
// the Unicode Bidirectional Algorithm's own isolates (unicode.org/reports/tr9/#Explicit_Directional_Isolates;
// w3.org/International/questions/qa-bidi-unicode-controls). From just-house-paint (2026-10-20), for every app.

const FSI = "\u2068"; // FIRST STRONG ISOLATE
const PDI = "\u2069"; // POP DIRECTIONAL ISOLATE

/** `name` between FSI and PDI: its direction its own, the sentence's around it untouched. */
export const isolate = (name) => `${FSI}${name ?? ""}${PDI}`;
