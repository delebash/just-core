// SPDX-License-Identifier: MIT
// The kit's website/scripts/sync-docs.js, run as a site runs it: copied into a site folder with its package.json, then
// `node scripts/sync-docs.js --from local` over an app's docs beside it. The site folder sits under this package, so
// the script's `front-matter` (a site's dependency, as it is this package's) resolves from here.
//
// A doc may open with front-matter (docgen's single-source pages: `lede:`, `hints:` — §19 "A help page"): the block
// never reaches the page, and its `lede:` — the doc's one-line summary — is the page's description, before the
// contents file's hint.
import { execFileSync } from "node:child_process";
import { copyFileSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { afterAll, expect, test } from "vitest";

const KIT = resolve(import.meta.dirname, "../../..");
const WORK = join(import.meta.dirname, `.tmp-site-${process.pid}`);
afterAll(() => rmSync(WORK, { recursive: true, force: true }));

function siteOver(docs, toc) {
  const app = join(WORK, "app");
  const site = join(WORK, "site");
  mkdirSync(join(app, "docs"), { recursive: true });
  mkdirSync(join(site, "scripts"), { recursive: true });
  for (const [name, text] of Object.entries(docs)) writeFileSync(join(app, "docs", name), text);
  writeFileSync(join(app, "docs", "toc.json"), JSON.stringify(toc));
  copyFileSync(join(KIT, "website/scripts/sync-docs.js"), join(site, "scripts/sync-docs.js"));
  writeFileSync(join(site, "package.json"), JSON.stringify({ type: "module", justSite: { appRepo: "x/app", appDir: "../app", siteRepo: "x/app-website" } }));
  execFileSync(process.execPath, ["scripts/sync-docs.js", "--from", "local"], { cwd: site, stdio: "pipe" });
  return (slug) => readFileSync(join(site, "src/content/docs/docs", `${slug}.md`), "utf8");
}

test("a doc's front-matter never reaches the page; its lede is the page's description, before the contents' hint", () => {
  const page = siteOver(
    {
      "translate.md": '---\nlede: "Translate the catalog into each language."\nhints:\n  model: The model that translates.\n---\n# Translating\n\nBody text.\n',
      "review.md": "# Reviewing\n\nNo front-matter here.\n",
    },
    [{ group: "Use", items: [{ slug: "translate", hint: "the contents' words" }, { slug: "review", hint: "Check each translation." }] }],
  );
  const translate = page("translate");
  expect(translate).toMatch(/^---\ntitle: "Translating"\ndescription: "Translate the catalog into each language."\n---\n\nBody text\./);
  expect(translate).not.toContain("hints:");
  expect(translate).not.toContain("lede:");
  // without front-matter, as before: the contents' hint
  expect(page("review")).toMatch(/^---\ntitle: "Reviewing"\ndescription: "Check each translation."\n---\n\nNo front-matter here\./);
});
