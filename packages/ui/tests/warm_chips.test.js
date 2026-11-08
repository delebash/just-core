// SPDX-License-Identifier: MIT
// The warm chips' words are readable: the "tight" fit chip (styles.css and QuickSetup's copy), the "loaded" pill and
// the model catalog's use-limited licence paint --warn-ink on --warn-bg (as .ui-tag--accent2), never gold on gold-soft
// (2.22:1 light in the template's tokens, 1.73:1 its dark; just-core TASKS, 2026-11-08). The pair is 4.5:1 or more
// (WCAG 2 AA, small text) as the appearance engine sets it, at every gold hue in both modes, and as the template's
// tokens.css sets it before the engine runs.
import { readFileSync } from "node:fs";
import { afterAll, expect, test } from "vitest";
import { applyAppearance, GOLD_PRESETS } from "../src/common/services/appearance.js";
import { contrast } from "./wcag.js";

const read = (rel) => readFileSync(new URL(rel, import.meta.url), "utf8");
const SOURCES = {
  "../src/common/styles.css": [".lu-fit--tight", ".lu-pill--load"],
  "../src/views/QuickSetup.vue": [".lu-fit--tight"],
  "../src/components/LuModelCatalog.vue": [".lu-lic--warn"],
};
/** Each CSS rule `selector { body }` in a file's text, one-line or not. */
const rules = (text) => [...text.matchAll(/([^{}]+)\{([^{}]*)\}/g)].map(([, sel, body]) => ({ sel: sel.trim(), body }));

test("the warm chips paint --warn-ink on --warn-bg", () => {
  for (const [file, selectors] of Object.entries(SOURCES)) {
    const all = rules(read(file));
    for (const selector of selectors) {
      const found = all.filter((r) => r.sel.split("\n").pop().trim() === selector);
      expect(found, `${file} ${selector}`).toHaveLength(1);
      expect(found[0].body, `${file} ${selector}`).toMatch(/(^|[;\s])background:\s*var\(--warn-bg[,)]/);
      expect(found[0].body, `${file} ${selector}`).toMatch(/(^|[;\s])color:\s*var\(--warn-ink[,)]/);
    }
  }
});

test("no kit rule paints gold words on gold-soft", () => {
  for (const file of Object.keys(SOURCES)) {
    for (const { sel, body } of rules(read(file))) {
      const goldOnSoft = /background:\s*var\(--gold-soft[,)]/.test(body) && /(^|[;\s])color:\s*var\(--gold[,)]/.test(body);
      expect(goldOnSoft, `${file} ${sel}`).toBe(false);
    }
  }
});

// a stand-in for the window's root element: applyAppearance writes its tokens onto documentElement.style
const props = new Map();
globalThis.document = {
  documentElement: {
    setAttribute() {},
    style: { setProperty: (k, v) => props.set(k, v), removeProperty: (k) => props.delete(k) },
  },
};
afterAll(() => {
  delete globalThis.document;
});

test("the engine's --warn-ink on --warn-bg is 4.5:1 or more at every gold hue, both modes", () => {
  const hues = [...new Set([...GOLD_PRESETS.map((p) => p.hue), ...Array.from({ length: 36 }, (_, i) => i * 10)])];
  for (const mode of ["light", "dark"]) {
    for (const goldHue of hues) {
      props.clear();
      applyAppearance({ mode, goldHue });
      const [ink, bg] = [props.get("--warn-ink"), props.get("--warn-bg")];
      expect(ink && bg, `${mode} ${goldHue}: the engine set both`).toBeTruthy();
      expect(contrast(ink, bg), `${mode} hue ${goldHue}: ${ink} on ${bg}`).toBeGreaterThanOrEqual(4.5);
    }
  }
});

test("the template's tokens.css --warn-ink on --warn-bg is 4.5:1 or more, both modes", () => {
  // the comments out first (they name the dark block too), then split at the dark block's own rule
  const css = read("../../../template/src/css/tokens.css").replace(/\/\*[\s\S]*?\*\//g, "");
  const [light, dark] = css.split(/^\[data-theme="dark"\]\s*\{/m);
  for (const [mode, block] of Object.entries({ light, dark })) {
    const ink = block.match(/--warn-ink:\s*([^;]+);/)?.[1].trim();
    const bg = block.match(/--warn-bg:\s*([^;]+);/)?.[1].trim();
    expect(ink && bg, `${mode}: tokens.css sets both`).toBeTruthy();
    expect(contrast(ink, bg), `${mode}: ${ink} on ${bg}`).toBeGreaterThanOrEqual(4.5);
  }
});
