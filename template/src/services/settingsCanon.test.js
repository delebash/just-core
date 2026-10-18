// SPDX-License-Identifier: MIT
// The Settings canon (app-structure §11; docgen's settingsCanon.test.js is the donor): the family's
// sections keep the kit's relative order wherever they appear, and every one of them is rendered.
// The page renders SETTINGS_SECTION_IDS directly, so this asserts what the user sees. The kit's
// manifest is imported by its path, not the barrel (which would bring the kit's styles in).
import { describe, expect, it } from "vitest";
import { SETTINGS_SECTION_ORDER } from "@delebash/ui/common/familyContract.js";
import { SETTINGS_SECTION_IDS } from "./settingsSections.js";

describe("settings canon — the sections' order", () => {
  it("keeps the family sections in the canon's relative order", () => {
    const rendered = SETTINGS_SECTION_IDS.filter((id) => SETTINGS_SECTION_ORDER.includes(id));
    const canon = SETTINGS_SECTION_ORDER.filter((id) => SETTINGS_SECTION_IDS.includes(id));
    expect(rendered).toEqual(canon);
  });

  it("renders every family section", () => {
    for (const id of SETTINGS_SECTION_ORDER) expect(SETTINGS_SECTION_IDS).toContain(id);
  });
});
