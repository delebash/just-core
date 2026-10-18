// SPDX-License-Identifier: MIT
// Words that arrive as data (docs/plans/2026-10-18-seeded-words-in-the-users-language.md): a row
// with a catalog key shows the key's text in the app's language; a row without one — renamed, a
// brand, made by the user — shows its stored name.
import { afterEach, describe, expect, test } from "vitest";
import { createI18n } from "vue-i18n";

import { setKitI18n } from "../src/common/services/kitI18n.js";
import { keyedText, presetDisplayName, providerDisplayName } from "../src/services/seededWords.js";

function appI18n(locale) {
  return createI18n({
    legacy: false,
    locale,
    fallbackLocale: "en",
    missingWarn: false,
    fallbackWarn: false,
    messages: {
      en: { kit: { provider: { seeded: { builtIn: "Built-in" } } }, app: { preset: { fast: "Fast" }, onlyEn: "Only English" } },
      es: { kit: { provider: { seeded: { builtIn: "Integrado" } } }, app: { preset: { fast: "Rápido" } } },
    },
  });
}

afterEach(() => setKitI18n(null));

describe("seeded words", () => {
  test("a keyed row shows the key's text in the app's language", () => {
    setKitI18n(appI18n("es"));
    expect(providerDisplayName({ id: "local-llamacpp", name: "Built-in", nameKey: "kit.provider.seeded.builtIn" })).toBe("Integrado");
    expect(presetDisplayName({ id: "p_fast", name: "Fast", nameKey: "app.preset.fast" })).toBe("Rápido");
  });

  test("a row without a key shows its stored name; a nameless one its id", () => {
    setKitI18n(appI18n("es"));
    expect(providerDisplayName({ id: "openrouter", name: "My OpenRouter", nameKey: null })).toBe("My OpenRouter");
    expect(presetDisplayName({ id: "p_mine", name: "", nameKey: "" })).toBe("p_mine");
    expect(providerDisplayName(null)).toBe("");
  });

  test("a key the language lacks falls back to English, an unknown key to the stored text", () => {
    setKitI18n(appI18n("es"));
    expect(keyedText("app.onlyEn", "stored")).toBe("Only English");
    expect(keyedText("app.nowhere", "stored")).toBe("stored");
    expect(keyedText("", "stored")).toBe("stored");
  });
});
