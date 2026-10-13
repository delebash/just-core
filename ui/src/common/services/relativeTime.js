// SPDX-License-Identifier: MIT
// "just now", "5m ago", "3h ago", "2d ago" — in the app's language. Intl.RelativeTimeFormat over
// the vue-i18n locale (app-structure §Q.11: dates through vue-i18n, or Intl given the i18n
// locale). Each app had grown its own English copy of this (JustWrite had ten); this is the one.
// Whole units, rounded down: 59 minutes is "59m ago", not "1h ago". Under a minute it says the
// kit's "just now" (Intl's own "now" reads as a clock, not as a moment past) — or, with
// `seconds`, the seconds themselves.
import { kitLocale, kitT } from "./kitI18n.js";

const SECOND = 1000;
const MINUTE = 60 * SECOND;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

/**
 * @param {number|string|Date} when  a time in the past (ms, ISO string or Date)
 * @param {object} [opts]
 * @param {"narrow"|"short"|"long"} [opts.style]  Intl's style — "narrow" is "5m ago"
 * @param {"always"|"auto"} [opts.numeric]  "auto" says "yesterday" for one day
 * @param {boolean} [opts.seconds]  under a minute, "12s ago" instead of "just now"
 * @param {number} [opts.dateAfterDays]  from this many days on, the date itself
 * @param {Intl.DateTimeFormatOptions} [opts.dateOptions]  how that date reads
 * @param {number} [opts.now]  the clock, for a ticking label
 */
export function relativeTime(when, {
  style = "narrow", numeric = "always", seconds = false,
  dateAfterDays = Number.POSITIVE_INFINITY, dateOptions, now = Date.now(),
} = {}) {
  if (when == null || when === "") return "";
  const then = when instanceof Date ? when.getTime() : typeof when === "number" ? when : Date.parse(when);
  if (!Number.isFinite(then)) return "";
  const locale = kitLocale();
  const elapsed = Math.max(0, now - then);
  if (elapsed >= dateAfterDays * DAY) return new Intl.DateTimeFormat(locale, dateOptions).format(then);
  const fmt = new Intl.RelativeTimeFormat(locale, { style, numeric });
  if (elapsed < MINUTE) {
    return seconds ? fmt.format(-Math.floor(elapsed / SECOND), "second") : kitT("kit.time.justNow");
  }
  if (elapsed < HOUR) return fmt.format(-Math.floor(elapsed / MINUTE), "minute");
  if (elapsed < DAY) return fmt.format(-Math.floor(elapsed / HOUR), "hour");
  return fmt.format(-Math.floor(elapsed / DAY), "day");
}
