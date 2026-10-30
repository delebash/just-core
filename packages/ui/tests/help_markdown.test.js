// SPDX-License-Identifier: MIT
// A help page as the app's HelpDrawer (and JustWrite's Help, What's new and Cheatsheet) shows it: the doc's title is
// the host's header, so its H1 goes; a leading front-matter block (`lede:`, a doc's one-line summary — docgen's
// extract reads it, 2026-10-29) is the doc's data, never text on the page.
import { expect, test } from "vitest";
import { renderHelpMarkdown, slugifyHeading } from "../src/common/services/helpMarkdown.js";

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

// GitHub's own slug (github-slugger): one anchor in the repo, on the website and in the app — each space a "-", never
// collapsed; a repeated heading numbered as GitHub numbers it (JustVoice's docs pass, 2026-10-29: "#the--menu" missed).
test("headings are slugged the way GitHub slugs them, and a repeated one is numbered", () => {
  expect(slugifyHeading("The ⋯ menu")).toBe("the--menu");
  expect(slugifyHeading("Locations & places")).toBe("locations--places");
  expect(slugifyHeading("Audiobook (M4B)")).toBe("audiobook-m4b");
  const html = renderHelpMarkdown("# Doc\n\n## Usage\n\none\n\n## Usage\n\ntwo\n");
  expect(html).toContain('<h2 id="usage">');
  expect(html).toContain('<h2 id="usage-1">');
  // the next document starts its numbering again
  expect(renderHelpMarkdown("# Other\n\n## Usage\n")).toContain('<h2 id="usage">');
});
