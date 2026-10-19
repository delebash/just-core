// SPDX-License-Identifier: MIT
// The family's languages, by BCP-47 code — the list an app offers wherever a person picks a language
// that isn't the interface's own: docgen's translation targets, JustWrite's book language. Pure data,
// so a Node server and a browser import the same copy (as filename.js). Names come from
// Intl.DisplayNames at the point of use (the UI kit's languageName), never from a table here.
// Moved 2026-10-18 from docgen's server/src/config/languages.json, unchanged, when JustWrite's book
// language needed the same list (the family rule: a list two apps need is the kit's).

/** The codes, as docgen listed them: bare where one variety serves, regioned where two differ. */
export const LANGUAGE_CODES = Object.freeze([
  "af", "am", "ar", "az", "be", "bg", "bn", "bs", "ca", "cs", "cy", "da", "de", "el", "en", "es",
  "es-419", "et", "eu", "fa", "fi", "fil", "fr", "fr-CA", "ga", "gl", "gu", "he", "hi", "hr", "hu",
  "hy", "id", "is", "it", "ja", "ka", "kk", "km", "kn", "ko", "lo", "lt", "lv", "mk", "ml", "mn",
  "mr", "ms", "my", "nb", "ne", "nl", "pa", "pl", "pt", "pt-BR", "ro", "ru", "si", "sk", "sl",
  "sq", "sr", "sv", "sw", "ta", "te", "th", "tr", "uk", "ur", "uz", "vi", "zh-Hans", "zh-Hant",
  "zu",
]);
