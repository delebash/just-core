// SPDX-License-Identifier: MIT
// The appearance engine's ink palettes (src/common/services/appearance.js INK_PALETTES): each one's
// --muted is 4.5:1 or more (WCAG 2 AA, small text) on every ground the family paints text on in its
// mode — each app's surfaces (the template's, JustWrite's, docgen's), the soft accent tints at every
// accent hue, the warning tint, the engine's own surface tints — and its --ink-2 stays darker (in
// dark mode lighter) than it. Contrast is WCAG 2's; an OKLCH ground is converted by CSS Color 4's
// OKLab matrices.
import { expect, test } from "vitest";
import { INK_PALETTES, SURFACE_TINTS } from "../src/common/services/appearance.js";

const toLinear = (c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
/** Linear sRGB of "#rrggbb" or "oklch(L C H)". */
function linear(color) {
  if (color.startsWith("#")) return [1, 3, 5].map((i) => toLinear(Number.parseInt(color.slice(i, i + 2), 16) / 255));
  const [L, C, H] = color.match(/[\d.]+/g).map(Number);
  const a = C * Math.cos((H * Math.PI) / 180);
  const b = C * Math.sin((H * Math.PI) / 180);
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3;
  return [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  ].map((v) => Math.min(1, Math.max(0, v)));
}
const luminance = (color) => {
  const [r, g, b] = linear(color);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const contrast = (x, y) => {
  const [hi, lo] = [luminance(x), luminance(y)].sort((p, q) => q - p);
  return (hi + 0.05) / (lo + 0.05);
};
const everyHue = (tpl) => Array.from({ length: 36 }, (_, i) => tpl.replace("H", String(i * 10)));
const tints = (mode) => Object.values(SURFACE_TINTS).map((t) => t[mode]).filter(Boolean);

const GROUNDS = {
  light: [
    // the template (this kit's reference app) and JustVoice
    "#ffffff", "#fafaf7", "#fbfaf7", "#f3f1ec", "#f6f5f1", ...everyHue("oklch(0.948 0.011 H)"), ...everyHue("oklch(0.97 0.03 H)"),
    // JustWrite
    "oklch(0.985 0.004 85)", "oklch(0.955 0.005 85)", ...everyHue("oklch(0.92 0.028 H)"),
    // docgen
    "#eff1f4", ...everyHue("oklch(0.958 0.019 H)"),
    ...tints("light"),
  ],
  dark: [
    "#1a1c1a", "#232624", "#1e211f", "#2a2e2c", ...everyHue("oklch(0.3 0.032 H)"), ...everyHue("oklch(0.28 0.05 H)"),
    "oklch(0.16 0.005 250)", "oklch(0.21 0.005 250)", "oklch(0.255 0.006 250)", ...everyHue("oklch(0.3 0.045 H)"),
    "#1d2126", "#2a3038", ...everyHue("oklch(0.295 0.047 H)"),
    ...tints("dark"),
  ],
};

test("every ink palette's muted text is 4.5:1 or more on every ground, both modes, below its secondary text", () => {
  for (const [name, palette] of Object.entries(INK_PALETTES)) {
    if (palette.auto) continue;
    for (const mode of ["light", "dark"]) {
      const [, ink2, muted] = palette[mode];
      const worst = Math.min(...GROUNDS[mode].map((g) => contrast(muted, g)));
      expect(worst, `${name} ${mode} muted ${muted}`).toBeGreaterThanOrEqual(4.5);
      // the order of the shades holds: secondary text stands out more than muted text
      if (mode === "light") expect(luminance(ink2), `${name} light ink-2`).toBeLessThan(luminance(muted));
      else expect(luminance(ink2), `${name} dark ink-2`).toBeGreaterThan(luminance(muted));
    }
  }
});
