// SPDX-License-Identifier: MIT
// Every switch the kit draws has a name a screen reader says: UiToggle is QToggle's div (role="switch"), which a
// UiField's `<label for>` can't name — four Motion capture switches had none (UI Automation read Button name '' in
// JustDirect's real window, 2026-11-08). So each <UiToggle> in the kit's sources carries aria-label or aria-labelledby,
// as the kit's other switches do (ServerPanel, SyncPanel, LuWarmStartupToggle).
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { expect, test } from "vitest";

const SRC = join(import.meta.dirname, "..", "src");
const vueFiles = (dir) =>
  readdirSync(dir).flatMap((name) => {
    const full = join(dir, name);
    return statSync(full).isDirectory() ? vueFiles(full) : name.endsWith(".vue") ? [full] : [];
  });

test("every UiToggle in the kit has an accessible name (aria-label or aria-labelledby)", () => {
  const unnamed = [];
  let seen = 0;
  for (const file of vueFiles(SRC)) {
    const template = readFileSync(file, "utf8").replace(/<!--[\s\S]*?-->/g, "");
    // the whole tag: a quoted value may hold a `>` (`@update:model-value="(v) => …"`)
    for (const [tag] of template.matchAll(/<UiToggle\b(?:[^>"]|"[^"]*")*>/g)) {
      seen += 1;
      if (!/\s:?aria-label(ledby)?=/.test(tag)) unnamed.push(`${relative(SRC, file)}: ${tag.slice(0, 80)}`);
    }
  }
  expect(seen).toBeGreaterThan(5);
  expect(unnamed).toEqual([]);
});
