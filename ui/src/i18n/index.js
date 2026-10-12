// SPDX-License-Identifier: MIT
// The kit's own words — one vue-i18n catalog per language (./locales/<code>.json), every key under
// `kit.`. An app hands these to createI18n and merges its own messages after them, so an app's
// `kit.*` key rewords the kit's (the vue-i18n standard; docs/plans/2026-10-12-i18n-standard.md).
// docgen translates ./locales/en.json like any app's catalog.
//
//   import { catalogsFromFiles, kitMessages } from "@delebash/llm-ui/i18n/index.js";
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
