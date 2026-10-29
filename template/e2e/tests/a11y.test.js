// SPDX-License-Identifier: MIT
// Accessibility — every page of the REAL desktop app against WCAG 2.2 AA (app-structure §17), checked by axe-core,
// Deque's engine and the standard automated check (playwright.dev/docs/accessibility-testing), in the light theme
// and the dark one. axe finds what a machine can — names, roles, contrast, ARIA misuse; the keyboard path through a
// screen and its reading order stay a person's review. Hermetic like the smoke suite (lib/driver.js).
//
// Before: `npm run build:unpacked` (the harness drives what was last built). Run: `npm test` from the app's root.

import { strict as assert } from "node:assert";
import { after, before, test } from "node:test";
import { AxeBuilder } from "@axe-core/playwright";
import { Driver } from "../lib/driver.js";

// WCAG 2.0, 2.1 and 2.2, levels A and AA — axe's tags (github.com/dequelabs/axe-core/blob/develop/doc/API.md)
const TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"];
const PAGES = [
  { nav: "Home", url: /#\/$/ },
  { nav: "Notes", url: /#\/notes$/ },
  { nav: "AI Settings", url: /#\/ai$/ },
  { nav: "App Settings", url: /#\/settings/ },
];

const d = new Driver();
let page;

before(async () => {
  await d.launch();
  page = d.page;
  await page.waitForSelector(".shell", { timeout: 30_000 });
});

after(async () => {
  await d.close();
});

/** axe's violations on what the window shows now, as lines a failure can be read from. Legacy mode: axe otherwise
 *  gathers its results in a blank page it opens, and Playwright's Electron opens none ("Target.createTarget: Not
 *  supported" — measured by docgen's session on its built app, 2026-10-29); legacy mode skips that page and only
 *  loses cross-origin frames, which the app has none of (axe-core-npm's playwright README, setLegacyMode). */
async function violations() {
  const { violations: found } = await new AxeBuilder({ page }).withTags(TAGS).setLegacyMode().analyze();
  return found.map((v) => `${v.id} (${v.impact}): ${v.help} — ${v.nodes.map((n) => n.target.join(" ")).join(", ")}`);
}

for (const scheme of ["light", "dark"]) {
  test(`every page meets WCAG 2.2 AA in the ${scheme} theme`, async () => {
    await page.emulateMedia({ colorScheme: scheme }); // the theme follows the system until a user picks one
    for (const p of PAGES) {
      await page.locator(".navlink", { hasText: p.nav }).click();
      await page.waitForURL(p.url);
      await page.locator(".pane-h1").first().waitFor();
      assert.equal(await page.evaluate(() => document.documentElement.getAttribute("data-theme")), scheme);
      assert.deepEqual(await violations(), [], `${p.nav}, ${scheme}`);
    }
  });
}
