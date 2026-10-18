// SPDX-License-Identifier: MIT
// A calendar date kept as ISO ("2027-03-01") — what a UiDate field holds — shown in the app's
// language (Intl over the vue-i18n locale, as relativeTime.js does). Read as a LOCAL date:
// `new Date("2027-03-01")` is midnight UTC, the evening before anywhere west of Greenwich.
import { kitLocale } from "./kitI18n.js";

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

/** Is `value` an ISO calendar date ("2027-03-01")? */
export function isIsoDate(value) {
  return ISO_DATE.test(value || "");
}

/**
 * The date in the app's language ("March 1, 2027", "1 de marzo de 2027"). A value that isn't an
 * ISO date — words typed while the field was free text — comes back as it is.
 */
export function dateLabel(value, options = { dateStyle: "long" }) {
  const m = ISO_DATE.exec(value || "");
  if (!m) return value || "";
  return new Intl.DateTimeFormat(kitLocale(), options).format(new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
}
