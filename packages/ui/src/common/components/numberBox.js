// SPDX-License-Identifier: MIT
// UiSlider's number box: the number it commits when it is left (blur, Enter) — what was typed, when
// that is a number. Nothing typed (the box only passed through by Tab or a click), an emptied box or a
// half-typed "-" commits nothing (null), and the box shows the slider's value again. Read as a value,
// Number(null) and Number("") are 0: every slider left by Tab went to its minimum.
//
// And what UiNumber and UiSlider's box both read: a decimal comma where it can only be one. A person
// whose own language writes "0,05" types it into an English box too, where the comma was a thousands
// separator (UiNumber read 5) or nothing (the slider's box ignored "0,5").

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

/**
 * UiNumber's reading of its text — strict, so nothing typed is silently read as another number (the fourteenth
 * review: "1,5" in a whole-number English field read 15). A number as the language writes it: digits, the
 * language's group separator only between groups of three (and only while the field groups — `grouping`), its
 * decimal separator once; else, in a field that takes fractions (its `step` isn't whole), the other separator
 * once where it can only be a decimal point ("0,05", "12,5" in English; "0.05" in German). Anything else is no
 * number (null — the field says so), as are an empty box and a lone "-".
 */
export function parseLocaleNumber(text, { locale = null, step = 1, grouping = true } = {}) {
  const { decimal, group } = separators(locale);
  let s = String(text ?? "").trim();
  if (s === "" || s === "-") return null;
  // a space-like group separator (French, Swedish …) is typed as a plain space too
  const spaced = /^\s$/u.test(group) || group === "\u202f";
  if (spaced) s = s.replace(/[\s\u202f\u00a0]/gu, grouping ? group : "");
  const g = grouping && group ? esc(group) : null;
  const d = esc(decimal);
  // a grouped number never starts with 0 ("0,500" is a decimal, never five hundred)
  const strict = new RegExp(`^-?(\\d+${g ? `|[1-9]\\d{0,2}(?:${g}\\d{3})+` : ""})(?:${d}\\d+)?$`, "u");
  if (strict.test(s)) {
    const n = Number(s.split(group).join("").replace(decimal, "."));
    return Number.isFinite(n) ? n : null;
  }
  // the other separator once, where only a decimal point can stand (a field that takes fractions)
  const other = decimal === "." ? "," : ".";
  if (!Number.isInteger(Number(step)) && new RegExp(`^-?\\d*${esc(other)}\\d+$`).test(s)) {
    const n = Number(s.replace(other, "."));
    return Number.isFinite(n) ? n : null;
  }
  return null;
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
