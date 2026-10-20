// SPDX-License-Identifier: MIT
// UiSlider's number box: the number it commits when it is left (blur, Enter) — what was typed, when
// that is a number. Nothing typed (the box only passed through by Tab or a click), an emptied box or a
// half-typed "-" commits nothing (null), and the box shows the slider's value again. Read as a value,
// Number(null) and Number("") are 0: every slider left by Tab went to its minimum.
//
// And what UiNumber and UiSlider's box both read: a decimal comma where it can only be one. A person
// whose own language writes "0,05" types it into an English box too, where the comma was a thousands
// separator (UiNumber read 5) or nothing (the slider's box ignored "0,5").
//
// UiNumber reads its text with @internationalized/number's NumberParser (React Spectrum's —
// react-spectrum.adobe.com/internationalized/number/NumberParser.html): the language's digits,
// decimal and grouping, a leading + or −, and a half-typed number while it is typed
// (isValidPartialNumber). The kit adds only its strictness about groups (below).

import { NumberParser } from "@internationalized/number";

/**
 * The text with a decimal comma read as the decimal point, where the comma can only be one: one comma,
 * no dot, in a field that takes fractions (its `step` isn't whole). A comma the field itself writes
 * between thousands — `groupSeparator` "," (the language's, while the field groups), "1,200" — stays
 * a thousands separator; a whole-number field's comma stays what it was. Anything else as it was.
 */
export function decimalComma(text, { step = 1, groupSeparator = null } = {}) {
  const s = String(text ?? "").trim();
  if (Number.isInteger(Number(step))) return s;
  if (!/^[^,.]*,[^,.]*$/.test(s)) return s;
  // "1,200" or "-12,345": a grouped number as the field writes it ("0,500" never is one)
  if (groupSeparator === "," && /^-?[1-9]\d{0,2},\d{3}$/.test(s)) return s;
  return s.replace(",", ".");
}

/**
 * The decimal and thousands separators a language writes — Intl.NumberFormat's own parts
 * (developer.mozilla.org/docs/Web/JavaScript/Reference/Global_Objects/Intl/NumberFormat/formatToParts).
 * `locale` undefined or null: the runtime's default.
 */
export function separators(locale) {
  const parts = new Intl.NumberFormat(locale || undefined).formatToParts(12345.6);
  return { decimal: parts.find((p) => p.type === "decimal")?.value || ".", group: parts.find((p) => p.type === "group")?.value || "" };
}

const esc = (c) => c.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

// the language a box reads in: the one given, else the runtime's
const localeOf = (locale) => locale || new Intl.NumberFormat().resolvedOptions().locale;
const parsers = new Map();
function parserFor(locale) {
  const key = localeOf(locale);
  if (!parsers.has(key)) parsers.set(key, new NumberParser(key));
  return parsers.get(key);
}

// a leading sign as people type it: + or a minus (ASCII, U+2212, the dashes) — NumberParser reads
// ASCII "-" in every language, so every minus becomes it and a "+" goes; the bidi marks some
// languages put before a sign go too
const SIGN = /^[\u061c\u200e\u200f]*([+\uff0b]|[-\u2212\u2012\u2013\ufe63\uff0d])?/u;
const SPACE = "[ \\u00a0\\u202f]"; // a space typed between groups, in any language ("1 500")
function signed(text) {
  const m = SIGN.exec(text);
  const minus = !!m[1] && !/[+\uff0b]/u.test(m[1]);
  return { minus, body: text.slice(m[0].length) };
}

/**
 * UiNumber's reading of its text, with NumberParser — and strict, so nothing typed is silently read as another
 * number (the fourteenth review: "1,5" in a whole-number English field read 15). A number as the language
 * writes it: its digits, a leading + or −, its group separator (or a space) only between groups of three (the
 * language's own only while the field groups — `grouping`), its decimal separator once, with digits on either
 * side or both (".7", "5.", "15." read — the fifteenth review); else, in a field that takes fractions (its
 * `step` isn't whole), the other separator once where it can only be a decimal point ("0,05", "12,5" in
 * English; "0.05" in German). Anything else is no number (null — the field says so), as are an empty box and
 * a lone sign.
 */
export function parseLocaleNumber(text, { locale = null, step = 1, grouping = true } = {}) {
  const loc = localeOf(locale);
  const { decimal, group } = separators(loc);
  const { minus, body } = signed(String(text ?? "").trim());
  if (!/\p{Nd}/u.test(body)) return null;
  // a space-like group separator (French, Swedish …) is a typed space too
  const spaceGroup = /^\s$/u.test(group) || group === "\u202f";
  const g = grouping && group && !spaceGroup ? `(?:${esc(group)}|${SPACE})` : SPACE;
  const d = esc(decimal);
  const read = (s) => {
    const n = parserFor(loc).parse(`${minus ? "-" : ""}${s}`);
    return Number.isFinite(n) ? n : null;
  };
  // the whole part: digits, or groups of three after the first (a grouped number never starts with 0 —
  // "0,500" is a decimal, never five hundred); then the decimal and digits, either side or both
  if (new RegExp(`^(?:(?:\\p{Nd}+|(?!0)\\p{Nd}{1,3}(?:${g}\\p{Nd}{3})+)(?:${d}\\p{Nd}*)?|${d}\\p{Nd}+)$`, "u").test(body)) {
    // the groups out (the language's separator, any space): NumberParser reads the digits, sign and decimal
    return read(body.replace(new RegExp(`${grouping && group ? `${esc(group)}|` : ""}${SPACE}`, "gu"), ""));
  }
  // the other separator once, where only a decimal point can stand (a field that takes fractions)
  const other = decimal === "." ? "," : ".";
  if (!Number.isInteger(Number(step)) && new RegExp(`^\\p{Nd}*${esc(other)}\\p{Nd}+$`, "u").test(body)) {
    return read(body.replace(other, decimal));
  }
  return null;
}

/**
 * Whether `text` is a number being typed — on its way to one, not wrong yet ("", "-", "5.", "1,", "1 5"):
 * NumberParser's isValidPartialNumber, with a leading "+" and any minus taken as a sign.
 */
export function isPartialNumber(text, { locale = null } = {}) {
  const { minus, body } = signed(String(text ?? "").trim());
  if (body === "") return true;
  return parserFor(locale).isValidPartialNumber(`${minus ? "-" : ""}${body}`);
}

/**
 * @param {string | null | undefined} typed the box's text while it is typed in, null when untouched
 * @param {{ step?: number }} [field] the slider's step: a decimal comma counts where it takes fractions
 */
export function committedNumber(typed, { step = 1 } = {}) {
  if (typed === null || typed === undefined) return null;
  const text = decimalComma(typed, { step });
  if (text === "" || text === "-") return null;
  const n = Number(text);
  return Number.isFinite(n) ? n : null;
}
