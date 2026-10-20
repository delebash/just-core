// SPDX-License-Identifier: MIT
// UiSlider's number box: the number it commits when it is left (blur, Enter) — what was typed, when
// that is a number. Nothing typed (the box only passed through by Tab or a click), an emptied box or a
// half-typed "-" commits nothing (null), and the box shows the slider's value again. Read as a value,
// Number(null) and Number("") are 0: every slider left by Tab went to its minimum.

/** @param {string | null | undefined} typed the box's text while it is typed in, null when untouched */
export function committedNumber(typed) {
  if (typed === null || typed === undefined) return null;
  const text = String(typed).trim();
  if (text === "" || text === "-") return null;
  const n = Number(text);
  return Number.isFinite(n) ? n : null;
}
