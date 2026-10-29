// SPDX-License-Identifier: MIT
// A help page as the app's HelpDrawer (and JustWrite's Help, What's new and Cheatsheet) shows it: the doc's title is
// the host's header, so its H1 goes; a leading front-matter block (`lede:`, a doc's one-line summary — docgen's
// extract reads it, 2026-10-29) is the doc's data, never text on the page.
import { expect, test } from "vitest";
import { renderHelpMarkdown } from "../src/common/services/helpMarkdown.js";

test("a doc's front-matter is never shown; its H1 still goes; the rest renders", () => {
  const doc = "---\nlede: Paint your house in real colors.\n---\n# Getting started\n\nAdd a **photo**.\n";
  const html = renderHelpMarkdown(doc);
  expect(html).not.toContain("lede");
  expect(html).not.toContain("<hr");
  expect(html).not.toContain("Getting started");
  expect(html).toContain("<strong>photo</strong>");
});

test("a CRLF checkout's front-matter and H1 go too", () => {
  const html = renderHelpMarkdown("---\r\nlede: x\r\n---\r\n# Title\r\n\r\nBody text.\r\n");
  expect(html).not.toContain("lede");
  expect(html).not.toContain("Title");
  expect(html).toContain("Body text.");
});

test("a doc without front-matter is unchanged; a rule further down stays a rule", () => {
  const html = renderHelpMarkdown("# Title\n\nOne.\n\n---\n\nTwo.\n");
  expect(html).not.toContain("Title");
  expect(html).toContain("<hr");
  expect(html).toContain("Two.");
});
