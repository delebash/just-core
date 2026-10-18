// SPDX-License-Identifier: MIT
// Appearance — the family pattern (JustVoice's services/appearance.js is the donor): the theme
// engine and its catalogs are the kit's (@delebash/ui appearance); this file only sets this app's
// brand defaults and re-exports the catalogs a Settings surface renders. The defaults reproduce
// the palette in css/tokens.css (accent hue 166 = the green #3a7d63).
import {
  applyAppearance as applyGeneric,
  DEFAULT_APPEARANCE as GENERIC_DEFAULT,
  migrateAppearance as migrateGeneric,
} from "@delebash/ui";

export {
  ACCENT_PRESETS,
  BUTTON_DENSITY_OPTIONS,
  BUTTON_LABEL_CASE_OPTIONS,
  BUTTON_RADIUS_OPTIONS,
  currentMode,
  FUNCTIONAL_PRESETS,
  GOLD_PRESETS,
  INK_PALETTES,
  UI_FONTS,
  UI_SCALES,
} from "@delebash/ui";

export const DEFAULT_APPEARANCE = {
  ...GENERIC_DEFAULT,
  accentHue: 166,
  successHue: 166,
  dangerHue: 34,
  infoHue: 250,
};

export function applyAppearance(appearance) {
  applyGeneric({ ...DEFAULT_APPEARANCE, ...(appearance || {}) });
}

export function migrateAppearance(persisted = {}) {
  return migrateGeneric(persisted, DEFAULT_APPEARANCE);
}
