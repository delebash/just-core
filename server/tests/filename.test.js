// SPDX-License-Identifier: MIT
// `safeTitle(title)` — a download's name is the title as written, minus only what a Windows file
// name can't hold (JustWrite's rule, moved into the kit 2026-10-13).
import { expect, test } from "vitest";
import { safeTitle } from "../src/platform/filename.js";

test("a_title_keeps_its_spaces_apostrophes_and_letters", () => {
  expect(safeTitle("The Ninth Facet")).toBe("The Ninth Facet");
  expect(safeTitle("The Wizard's Tale")).toBe("The Wizard's Tale");
  expect(safeTitle("Café")).toBe("Café");
  expect(safeTitle("Война и мир")).toBe("Война и мир");
  expect(safeTitle("日本の本")).toBe("日本の本");
});

test("only_what_windows_forbids_goes", () => {
  expect(safeTitle('A <B>: "C"/D\\E|F?G*')).toBe("A B CDEFG");
  expect(safeTitle("  Trailing dots...")).toBe("Trailing dots");
});

test("never_empty", () => {
  expect(safeTitle("")).toBe("book");
  expect(safeTitle(null)).toBe("book");
  expect(safeTitle("???")).toBe("book");
});
