// SPDX-License-Identifier: MIT
// pickSpellLanguages — the spellchecker languages the shell switches on for what the app asks for
// (2026-10-18): the same code, else the plain language, else its first regional variety; none the
// spellchecker lacks, none twice.
import { expect, test } from "vitest";
import { pickSpellLanguages } from "../src/shell/spellLanguages.js";

// Chromium's Hunspell list (part), as availableSpellCheckerLanguages gave it on Windows 2026-10-18
const AVAILABLE = ["de-DE", "en-AU", "en-CA", "en-GB", "en-US", "es", "es-419", "es-AR", "es-ES", "fr-FR", "pt-BR", "pt-PT"];

test("each wanted language finds its own code, the variety in use, its plain language or its first regional variety", () => {
  expect(pickSpellLanguages(["es-419", "en"], AVAILABLE, ["en-US"])).toEqual(["es-419", "en-US"]);
  expect(pickSpellLanguages(["en"], AVAILABLE, ["en-GB", "de-DE"])).toEqual(["en-GB"]);
  expect(pickSpellLanguages(["es-419", "en"], AVAILABLE)).toEqual(["es-419", "en-AU"]);
  expect(pickSpellLanguages(["es-MX"], AVAILABLE)).toEqual(["es"]);
  expect(pickSpellLanguages(["fr", "EN-us"], AVAILABLE)).toEqual(["fr-FR", "en-US"]);
});

test("a language the spellchecker lacks is skipped; none is picked twice", () => {
  expect(pickSpellLanguages(["ja", "pt", "pt-BR"], AVAILABLE)).toEqual(["pt-BR"]);
  expect(pickSpellLanguages(["", null], AVAILABLE)).toEqual([]);
  expect(pickSpellLanguages(["en"], [])).toEqual([]);
});
