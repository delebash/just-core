// SPDX-License-Identifier: MIT
// Rules of the kit's Quasar theme (src/quasar/theme.css) that a look alone doesn't keep:
//   - the keyboard focus ring leaves an editable area alone — a rich-text editor (JustWrite's
//     TipTap manuscript, tabindex="0" and contenteditable) shows its caret, and the browser counts
//     a mouse click into it as a keyboard focus, so the ring went round the whole writing area;
//   - a tab strip has no gap between its tabs: QTabs decides it overflows (and shows its arrows)
//     from the sum of its tabs' widths, which a gap isn't part of.
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { expect, test } from "vitest";

const css = readFileSync(resolve(import.meta.dirname, "../src/quasar/theme.css"), "utf8").replace(/\/\*[\s\S]*?\*\//g, "");

test("the focus ring is never drawn round an editable area", () => {
  const rule = css.match(/:where\(\.q-btn, \.q-item, \.q-focusable[^{]*\{/)?.[0];
  expect(rule, "the ring's rule").toBeTruthy();
  const left = rule.match(/:where\(:not\(([^{]*)\)\)\s*\{$/)?.[1] || "";
  expect(left).toContain('[contenteditable]:not([contenteditable="false"])');
  expect(left).toContain(".ProseMirror");
  // the controls that wear their own ring stay left out too
  for (const own of [".ui-checkbox", ".ui-toggle", ".q-field__native", ".q-select__focus-target"]) expect(left).toContain(own);
});

test("a tab strip is one row with no gap between its tabs", () => {
  expect(css).toMatch(/\.ui-tabstrip \{[^}]*flex-wrap: nowrap/);
  expect(css).toMatch(/:where\(\.ui-tabstrip\) \.q-tabs__content \{[^}]*gap: 0/);
  expect(css).not.toMatch(/:where\(\.ui-tabstrip\) \.q-tabs__arrow \{[^}]*display: none/);
});
