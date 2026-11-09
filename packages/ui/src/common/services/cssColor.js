// SPDX-License-Identifier: MIT
// Any colour the page's CSS can write (the family's oklch tokens, a name, rgb(), hex) as #rrggbb — for what speaks only
// hex: the native colour input (UiColorPicker) and three.js (Mocap3DView: its Color.setStyle reads rgb/hsl/hex and
// names, not oklch — the take's skeleton drew white on the light 3D view, 2026-11-08). The browser does the conversion:
// a 1×1 canvas painted with the colour as its fillStyle hands back sRGB bytes.

const HEX = /^#[0-9a-f]{6}$/i;

/** `value` as "#rrggbb"; `fallback` when it is empty, no canvas is there to paint it, or painting fails. */
export function cssColorToHex(value, fallback = "#888888") {
  const v = String(value ?? "").trim();
  if (HEX.test(v)) return v.toLowerCase();
  if (!v) return fallback;
  try {
    const c = document.createElement("canvas");
    c.width = c.height = 1;
    const ctx = c.getContext("2d");
    if (!ctx) return fallback;
    ctx.fillStyle = fallback;
    ctx.fillStyle = v; // a value the browser can't read leaves the fallback in place
    ctx.fillRect(0, 0, 1, 1);
    const [r, g, b] = ctx.getImageData(0, 0, 1, 1).data;
    const hex = (n) => n.toString(16).padStart(2, "0");
    return `#${hex(r)}${hex(g)}${hex(b)}`;
  } catch {
    return fallback;
  }
}
