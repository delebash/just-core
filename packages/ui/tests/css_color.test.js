// SPDX-License-Identifier: MIT
// cssColorToHex (common/services/cssColor.js): a hex passes through, anything else is painted on a 1×1 canvas and read
// back as sRGB bytes — the browser's own colour conversion (the family's oklch tokens: three.js can't read them,
// Mocap3DView drew its skeleton white, 2026-11-08). A node test: the canvas is a stand-in that records what was painted.
import { afterEach, expect, test, vi } from "vitest";
import { cssColorToHex } from "../src/common/services/cssColor.js";

afterEach(() => vi.unstubAllGlobals());

/** A document whose canvas "paints" a colour the browser would: `known` maps a CSS value to its sRGB bytes. */
function fakeDocument(known) {
  const painted = [];
  const ctx = {
    _fill: "",
    set fillStyle(v) {
      if (v in known || /^#/.test(v)) this._fill = v; // an unreadable value leaves the last one, as a browser does
    },
    get fillStyle() {
      return this._fill;
    },
    fillRect() {
      painted.push(this._fill);
    },
    getImageData() {
      const hex = this._fill.startsWith("#") ? this._fill : null;
      const rgb = hex ? [1, 3, 5].map((i) => Number.parseInt(hex.slice(i, i + 2), 16)) : known[this._fill];
      return { data: [...rgb, 255] };
    },
  };
  return { painted, document: { createElement: () => ({ getContext: () => ctx }) } };
}

test("a hex passes through without a canvas; oklch comes back as the bytes the browser paints", () => {
  expect(cssColorToHex("#3B82F6")).toBe("#3b82f6");
  const { document, painted } = fakeDocument({ "oklch(0.538 0.08 165)": [47, 116, 96] });
  vi.stubGlobal("document", document);
  expect(cssColorToHex("oklch(0.538 0.08 165)", "#3b82f6")).toBe("#2f7460");
  expect(painted).toEqual(["oklch(0.538 0.08 165)"]);
});

test("empty, unreadable or no canvas: the fallback", () => {
  expect(cssColorToHex("", "#123456")).toBe("#123456");
  const { document } = fakeDocument({});
  vi.stubGlobal("document", document);
  expect(cssColorToHex("not-a-colour", "#123456")).toBe("#123456");
  vi.stubGlobal("document", { createElement: () => ({ getContext: () => null }) });
  expect(cssColorToHex("oklch(0.5 0.1 200)", "#abcdef")).toBe("#abcdef");
});
