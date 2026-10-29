// SPDX-License-Identifier: MIT
// @vitest-environment jsdom
//
// The kit's renderAiMarkdown, in a real DOM (the template is where the kit's DOM pieces run, §18). A model's answer is
// shown as Markdown — JustWrite's Ask the book and Talk to a character printed Gemma's `**…**` and `*` bullets
// literally (2026-10-28) — and it is untrusted text: marked doesn't sanitize, so DOMPurify does, and raw HTML shows as
// text.
import { renderAiMarkdown } from "@delebash/ui";
import { expect, test } from "vitest";

const dom = (html) => {
  const div = document.createElement("div");
  div.innerHTML = html;
  return div;
};

test("a model's Markdown is shown as Markdown: bold, emphasis, bullets, a line break kept", () => {
  const d = dom(renderAiMarkdown("**Mara** is *afraid*.\nShe hides.\n\n* the cellar\n* the barn"));
  expect(d.querySelector("strong")?.textContent).toBe("Mara");
  expect(d.querySelector("em")?.textContent).toBe("afraid");
  expect(d.querySelector("br")).not.toBeNull();
  expect([...d.querySelectorAll("li")].map((li) => li.textContent)).toEqual(["the cellar", "the barn"]);
});

test("HTML in the answer shows as text; a script, a handler or a javascript: link never reaches the page", () => {
  const d = dom(renderAiMarkdown('Look <img src="x" onerror="alert(1)"> here\n\n<script>alert(2)</script>\n\n[click](javascript:alert(3))'));
  expect(d.querySelector("img, script")).toBeNull();
  expect(d.textContent).toContain('<img src="x" onerror="alert(1)">');
  expect(d.innerHTML).not.toMatch(/javascript:/i);
  expect([...d.querySelectorAll("*")].some((el) => [...el.attributes].some((a) => a.name.startsWith("on")))).toBe(false);
});

test("a web link opens outside the app; nothing at all is an empty string", () => {
  const a = dom(renderAiMarkdown("See [the source](https://example.com/page).")).querySelector("a");
  expect(a.getAttribute("href")).toBe("https://example.com/page");
  expect(a.getAttribute("target")).toBe("_blank");
  expect(a.getAttribute("rel")).toBe("noopener noreferrer");
  expect(renderAiMarkdown("")).toBe("");
  expect(renderAiMarkdown(null)).toBe("");
});
