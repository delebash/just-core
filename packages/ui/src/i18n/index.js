// SPDX-License-Identifier: MIT
// The kit's own words — one vue-i18n catalog per language (./locales/<code>.json), every key under
// `kit.`. An app hands these to createI18n and merges its own messages after them, so an app's
// `kit.*` key rewords the kit's (the vue-i18n standard; docs/plans/2026-10-12-i18n-standard.md).
// docgen translates ./locales/en.json like any app's catalog.
//
//   import { catalogsFromFiles, kitMessages } from "@delebash/ui/i18n/index.js";
//   const own = catalogsFromFiles(import.meta.glob("./locales/*.json", { eager: true }));
//   const i18n = createI18n({ legacy: false, locale, fallbackLocale: "en", messages: kitMessages() });
//   for (const [code, msgs] of Object.entries(own)) i18n.global.mergeLocaleMessage(code, msgs);

// A catalog FILE is `<code>.json` (`es`, `pt-BR`): docgen writes `es.accepted.json` and
// `es.notes.json` beside the translations, and those are never a language.
const CATALOG_FILE = /\/([a-z]{2}(?:-[A-Za-z]{2,4})?)\.json$/;

/** `{ code: messages }` from an eager import.meta.glob of a locales folder — the kit's and every app's. */
export function catalogsFromFiles(files) {
  return Object.fromEntries(
    Object.entries(files)
      .map(([path, mod]) => [path.match(CATALOG_FILE)?.[1], mod.default ?? mod])
      .filter(([code, msgs]) => code && msgs),
  );
}

const catalogs = catalogsFromFiles(import.meta.glob("./locales/*.json", { eager: true }));

/** The kit's catalogs, `{ en: { kit: {…} }, es: … }` — a fresh copy each call: vue-i18n merges an
 *  app's messages INTO the objects it was given, which would reword the kit's own catalog. */
export function kitMessages() {
  return structuredClone(catalogs);
}

/**
 * A language's name in its OWN language — "Español", not "Spanish" — for a language picker
 * (LanguagePicker; moved from JustWrite's src/i18n/index.js, 2026-10-13).
 *
 * Someone hunting for their language is looking for the word they would use for it, not for
 * whatever the current UI happens to call it. `Intl.DisplayNames` ships this for every locale
 * the runtime knows, which is why there is no table of labels here and no seed row either.
 *
 * Spanish and French write their language names lowercase; a picker item reads better
 * capitalised, so only the first character is raised — the rest of the string is left exactly
 * as the runtime produced it, because casing rules are the runtime's business, not ours.
 */
export function languageName(code) {
  let name = code;
  try {
    name = new Intl.DisplayNames([code], { type: "language" }).of(code) || code;
  } catch {
    // An unknown or malformed tag falls back to the code itself, which is still selectable.
  }
  return name.charAt(0).toLocaleUpperCase(code) + name.slice(1);
}
