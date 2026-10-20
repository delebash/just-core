// SPDX-License-Identifier: MIT
// The desktop shell is bundled into ONE file (each app's Electron main — Quasar's Rolldown build, `output.file`):
// a dynamic import() anywhere in the code the shell imports makes chunks the build refuses ("When building
// multiple chunks, the output.dir option must be used") — the shell's Change folder once borrowed dirSize from
// disk_api.js, which imports the AI runner lazily, and every app's build failed (2026-10-20). Walks the shell's
// static imports from main.js and preload.js: no file reached may import() — electron-updater excepted (an
// external, not bundled).
import { readFileSync } from "node:fs";
import path from "node:path";
import { expect, test } from "vitest";

const SHELL = path.resolve(import.meta.dirname, "../src/shell");

function reached(entry) {
  const seen = new Set();
  const visit = (file) => {
    if (seen.has(file)) return;
    seen.add(file);
    const text = readFileSync(file, "utf8");
    for (const m of text.matchAll(/^\s*(?:import|export)\s[^;]*?from\s+["'](\.{1,2}\/[^"']+)["']/gm)) visit(path.resolve(path.dirname(file), m[1]));
  };
  visit(entry);
  return [...seen];
}

test("nothing the shell imports loads a module lazily (one bundle)", () => {
  const files = [...new Set([...reached(path.join(SHELL, "main.js")), ...reached(path.join(SHELL, "preload.js"))])];
  const lazy = files.flatMap((f) =>
    [...readFileSync(f, "utf8").matchAll(/\bimport\(\s*["'`]([^"'`]+)["'`]/g)].map((m) => m[1]).filter((spec) => spec !== "electron-updater").map((spec) => `${path.relative(SHELL, f)}: import("${spec}")`),
  );
  expect(lazy).toEqual([]);
  expect(files.some((f) => f.endsWith(`${path.sep}disk_api.js`))).toBe(false);
});
