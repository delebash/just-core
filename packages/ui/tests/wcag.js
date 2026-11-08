// SPDX-License-Identifier: MIT
// WCAG 2's contrast ratio for the kit's colour tests (ink_palettes, warm_chips): "#rrggbb" or "oklch(L C H)", an
// OKLCH colour converted by CSS Color 4's OKLab matrices, clipped to sRGB.

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
export const luminance = (color) => {
  const [r, g, b] = linear(color);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
export const contrast = (x, y) => {
  const [hi, lo] = [luminance(x), luminance(y)].sort((p, q) => q - p);
  return (hi + 0.05) / (lo + 0.05);
};
