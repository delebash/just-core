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

/**
 * UiNumber's reading of its text: everything but the digits, a minus and the language's decimal
 * separator goes ("1,200" in English and "1.200" in German are both 1200, without listing languages);
 * a decimal comma is read where it can only be one (`decimalComma` — `step` the field's, `grouping`
 * whether it writes thousands separators). Null for an empty box, a lone "-" or no number.
 */
export function parseLocaleNumber(text, { locale = null, step = 1, grouping = true } = {}) {
  const { decimal, group } = separators(locale);
  const s = decimal === "." ? decimalComma(text, { step, groupSeparator: grouping ? group : null }) : String(text ?? "");
  const cleaned = s.replace(new RegExp(`[^0-9${decimal === "." ? "\\." : decimal}\\-]`, "g"), "").replace(decimal, ".");
  if (cleaned === "" || cleaned === "-") return null;
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
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
