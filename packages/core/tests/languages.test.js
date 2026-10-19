// SPDX-License-Identifier: MIT
// `LANGUAGE_CODES` — the family's languages (docgen's translation targets, JustWrite's book
// language; moved into the kit 2026-10-18): each a canonical BCP-47 tag, none twice.
import { expect, test } from "vitest";
import { LANGUAGE_CODES } from "../src/platform/languages.js";

test("every_code_is_a_canonical_bcp47_tag_and_none_repeats", () => {
  expect(LANGUAGE_CODES.length).toBe(77);
  expect(new Set(LANGUAGE_CODES).size).toBe(LANGUAGE_CODES.length);
  for (const code of LANGUAGE_CODES) expect(Intl.getCanonicalLocales(code)[0]).toBe(code);
  expect(LANGUAGE_CODES).toContain("en");
  expect(LANGUAGE_CODES).toContain("es");
});
