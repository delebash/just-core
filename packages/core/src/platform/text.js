// SPDX-License-Identifier: MIT
// Words as a person reads them (docs/plans/2026-10-24-engines-the-llama-way.md F3 — moved here from just-house-paint's
// server/src/shared/text.js): cut to a length by grapheme (Intl.Segmenter) — a name or a sentence cut by UTF-16 units
// split an emoji (a lone surrogate) or a family emoji without its last member (its thirteenth review, 2026-10-20) —
// and a name a person gave kept, shown and compared as they see it. Browser-safe: an app's renderer may import it too
// (`@delebash/core/platform/text`).

/**
 * `text` cut to at most `max` UTF-16 units — the length the schema counts — between characters as a
 * person sees them (grapheme clusters, Intl.Segmenter — developer.mozilla.org/docs/Web/JavaScript/
 * Reference/Global_Objects/Intl/Segmenter): a cut at 80 units split an emoji, and the name kept half of
 * it (a lone surrogate) or a family emoji without its last member.
 */
export function cutToLength(text, max) {
  if (text.length <= max) return text;
  let out = "";
  for (const { segment } of new Intl.Segmenter(undefined, { granularity: "grapheme" }).segment(text)) {
    if (out.length + segment.length > max) break;
    out += segment;
  }
  // one such character longer than that on its own (a run of combining marks): its code points
  if (!out) {
    for (const c of text) {
      if (out.length + c.length > max) break;
      out += c;
    }
  }
  return out;
}

// Characters a name never keeps: control characters (NUL and the C0/C1 ranges — each a space: "Shade<TAB>12" is
// "Shade 12", not "Shade12") and the bidi embeddings, overrides and isolates (U+202A–202E, U+2066–2069) — an override
// in a name spilled into the sentence around it; LRM and RLM stay (a right-to-left name may need them).
const CONTROL = /[\u0000-\u001F\u007F-\u009F]/gu;
const OVERRIDES = /[\u202A-\u202E\u2066-\u2069]/gu;
// The invisible ones, which make two names that look the same different: Unicode's Default_Ignorable_Code_Point
// (the zero-width space and joiners, the soft hyphen, LRM/RLM, variation selectors, the Hangul fillers, tags, the
// BOM — "characters that should be ignored in rendering", unicode.org/reports/tr44) and the braille blank, which
// shows nothing either (the nineteenth and twentieth reviews: 13 such names were accepted, "Blue" twice).
const INVISIBLE = /[\p{Default_Ignorable_Code_Point}\u2800]/gu;

/** A name a person gave, as it is kept: in Unicode's composed form (NFC — "Café" typed two ways is one name),
 *  without bidi-override characters, its control characters spaces, its spaces collapsed and trimmed. */
export function cleanName(text) {
  return String(text ?? "")
    .normalize("NFC")
    .replace(CONTROL, " ")
    .replace(OVERRIDES, "")
    .replace(/\s+/gu, " ")
    .trim();
}

/** `text` with its control characters as spaces, nothing else changed — a box as the person types in it (a pasted TAB
 *  showed as a missing-glyph box — the twentieth review; trimming there would eat the space typed before a word). */
export const controlsAsSpaces = (text) => String(text ?? "").replace(CONTROL, " ");

/** `text` as it shows: its control characters spaces, its invisible characters gone, its spaces collapsed and
 *  trimmed — what names are compared by and what a search compares, on both sides. */
export const visibleText = (text) =>
  String(text ?? "")
    .replace(CONTROL, " ")
    .replace(INVISIBLE, "")
    .replace(/\s+/gu, " ")
    .trim();

/** What two names are compared by: the kept name as it shows, in lower case — "Blue" and "Blue" with a zero-width
 *  space are one name. Empty: the name shows nothing. */
export const nameKey = (text) => visibleText(cleanName(text)).toLocaleLowerCase();

/** What's wrong with `clean` (a cleanName) as a name of at most `max` UTF-16 units, as a pydantic error — typed, so
 *  the kit's fieldMessage says it under the field in the form's own words and language ("Required", "At most 60
 *  characters": the twentieth review found "Name required" beside the form's "Required") — or null: one that shows
 *  nothing; one the composed form made longer than the schema let through (NFC lengthens some: 60 × U+0958 is 120). */
export function nameProblem(clean, max) {
  if (!nameKey(clean)) return { msg: "Field required", type: "missing" };
  if (clean.length > max) return { msg: `String should have at most ${max} character${max === 1 ? "" : "s"}`, type: "string_too_long", ctx: { max_length: max } };
  return null;
}
