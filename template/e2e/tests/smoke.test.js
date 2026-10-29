// SPDX-License-Identifier: MIT
// The smoke suite — the REAL desktop app (Electron, the built UI from app://) driven through
// Playwright (app-structure §10, §18). It asserts the CONTRACT, not pixels: the shell mounts, the
// nav works, the AI status button and the AI-tasks toggle behave, a note is created through the
// window and reaches the server, the once-ever AI offer comes once, Settings shows the family's
// sections in their order. Hermetic (lib/driver.js): a temp data folder, the harness's own server,
// the shell's <ID>_DEV_NO_SERVER=1. One launch shared by the tests, in order.
//
// Before: `npm run build:unpacked` (the harness drives what was last built). Run: `npm test` from
// the app's root.

import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import { after, before, test } from "node:test";
import { Driver, waitFor } from "../lib/driver.js";

// The version About shows: the app's own, where `npm run bump` writes it (a literal broke on the first bump).
const VERSION = JSON.parse(readFileSync(new URL("../../package.json", import.meta.url), "utf8")).version;

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

test("the window is the app's", async () => {
  assert.equal(await page.title(), "Family Template");
  assert.match(page.url(), /^app:\/\/familytemplate\//);
});

test("the shell mounts: the title bar, the nav and the AI status button", async () => {
  await page.locator(".titlebar").waitFor();
  await page.locator(".shell__nav").waitFor();
  const labels = await page.locator(".shell__nav .navlink").allTextContents();
  for (const word of ["Home", "Notes", "AI Settings", "App Settings", "AI tasks"]) {
    assert.ok(labels.some((l) => l.includes(word)), `the nav has "${word}" (${labels.join(" | ")})`);
  }
  assert.equal(await page.locator(".titlebar .ai-status-btn").count(), 1, "the kit's AiStatusButton is in the title bar");
});

test("the boot plate is gone once the app shows", async () => {
  assert.equal(await page.locator("#app-boot").count(), 0);
});

test("the nav works: Notes, AI Settings and App Settings open their pages", async () => {
  await page.locator(".navlink", { hasText: "Notes" }).click();
  await page.waitForURL(/#\/notes$/);
  await page.locator(".pane-h1", { hasText: "Notes" }).waitFor();

  await page.locator(".navlink", { hasText: "AI Settings" }).click();
  await page.waitForURL(/#\/ai$/);
  await page.locator(".pane-h1", { hasText: "Providers, models and usage" }).waitFor();

  await page.locator(".navlink", { hasText: "App Settings" }).click();
  await page.waitForURL(/#\/settings/);
  await page.locator(".pane-h1", { hasText: "Settings" }).waitFor();
});

test("the AI-tasks row is a real toggle: it opens, stays open, and a second click closes it", async () => {
  // Behaviour, not presence: without the kit's navAttrs the opening click was also the panel's
  // outside-click, and it shut at once (docgen, 2026-08-03).
  const row = page.locator(".navlink", { hasText: "AI tasks" });
  await row.click();
  await page.waitForTimeout(400); // long enough for a wrong dismiss to have fired
  assert.equal(await page.locator('[role="dialog"][aria-label="AI tasks"]').count(), 1, "the panel opens and stays open");
  // a modal panel since the sixteenth review (Quasar's QDialog): the second click lands on its backdrop, over the
  // row, and closes it; Escape closes it too and gives the focus back to the row
  await row.click({ force: true });
  await page.locator('[role="dialog"][aria-label="AI tasks"]').waitFor({ state: "detached" });
  await row.click();
  await page.locator('[role="dialog"][aria-label="AI tasks"]').waitFor();
  await page.keyboard.press("Escape");
  await page.locator('[role="dialog"][aria-label="AI tasks"]').waitFor({ state: "detached" });
  assert.equal(await row.evaluate((el) => el === document.activeElement || el.contains(document.activeElement)), true, "the focus is back on the row");
});

test("Settings shows General, then the family's seven sections in canon order", async () => {
  await d.navigate("#/settings/general");
  await page.locator(".set-shell").waitFor();
  const tabs = (await page.locator(".set-shell [role=tab]").allTextContents()).map((s) => s.trim()).filter(Boolean);
  assert.deepEqual(tabs, ["General", "Appearance", "Backups", "Storage", "Server", "Logs", "Updates", "About"]);
  await d.navigate("#/settings/about");
  await page.locator(".ui-formgrid td", { hasText: VERSION }).waitFor(); // the version, from the server (the kit's AboutPanel)
});

test("a note is created through the window, saved by the server, and the AI offer comes once", async () => {
  await d.navigate("#/notes");
  await page.locator(".ui-empty", { hasText: "No notes yet" }).waitFor();

  // the form refuses an empty title before anything is sent
  await page.locator(".ui-empty button", { hasText: "New note" }).click();
  await page.locator("#note-title").waitFor();
  await page.locator(".form__actions button", { hasText: "Save" }).click();
  await page.locator(".ui-modal", { hasText: "Required" }).waitFor();
  assert.deepEqual((await d.api("/notes")).items, []);

  await page.locator("#note-title").fill("From the real window");
  await page.locator("#note-body").fill("Typed through Electron.");
  await page.locator(".form__actions button", { hasText: "Save" }).click();
  await page.locator("tr.ui-table-row", { hasText: "From the real window" }).waitFor();

  const saved = (await d.api("/notes")).items;
  assert.equal(saved.length, 1);
  assert.equal(saved[0].title, "From the real window");
  assert.equal(saved[0].body, "Typed through Electron.");

  // the first note is this app's moment for the once-ever AI offer (no AI set up in a fresh folder)
  const offer = page.locator(".ui-modal", { hasText: "Set up AI features" });
  await offer.waitFor();
  await offer.locator("button", { hasText: "Skip for now" }).click();
  await offer.waitFor({ state: "detached" });
  // the kit batches preference writes: wait for this one to reach the server
  const kept = await waitFor(async () => (await d.api("/prefs")).aiOfferShown === true);
  assert.ok(kept, "the flag is kept by the server");

  // a second note: no offer again
  await page.locator(".pane-actions button", { hasText: "New note" }).click();
  await page.locator("#note-title").fill("The second one");
  await page.locator(".form__actions button", { hasText: "Save" }).click();
  await page.locator("tr.ui-table-row", { hasText: "The second one" }).waitFor();
  await page.waitForTimeout(600);
  assert.equal(await page.locator(".ui-modal", { hasText: "Set up AI features" }).count(), 0, "the offer never comes twice");
});

// The kit's second windows (2026-10-29, JustWrite's "Open in new window"): window.open of the app's own page is another
// window of the app — the shell's preload bridge, its server — and any other window.open is refused.
test("window.open of the app's own page opens another window of the app, which closes alone; a data: page is refused", async () => {
  const [child] = await Promise.all([d.app.waitForEvent("window"), page.evaluate(() => void window.open("#/notes", "_blank", "noopener"))]);
  await child.waitForSelector(".shell", { timeout: 30_000 });
  assert.match(child.url(), /^app:\/\/familytemplate\/.*#\/notes/);
  assert.equal(await child.evaluate(() => typeof window.appShell?.invoke), "function", "the shell's preload ran in it");
  assert.equal(await child.evaluate(() => window.appShell.invoke("updateStatus").then((s) => typeof s.state)), "string", "the shell answers it");
  const open = d.app.windows().length;
  await page.evaluate(() => void window.open("data:text/html,refused"));
  await new Promise((r) => setTimeout(r, 1000));
  assert.equal(d.app.windows().length, open, "no window for a data: page");
  await child.close();
  await waitFor(async () => d.app.windows().length === 1, { what: "the second window closed, the app still open" });
  assert.ok(await page.evaluate(() => !!document.querySelector(".shell")));
});
