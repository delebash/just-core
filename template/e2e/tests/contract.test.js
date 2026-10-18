// SPDX-License-Identifier: MIT
// THE FAMILY SURFACE CONTRACT — static scans only: no app, no server, no driver (`npm run contract`
// in e2e/ runs it alone; `npm test` runs it with the smoke). docgen's e2e/tests/contract.test.js is
// the donor. The canon lives in the kit (familyContract.js, its catalog); drift here is a red run,
// not a screenshot someone has to catch.
import { strict as assert } from "node:assert";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const read = (p) => readFileSync(path.join(root, p), "utf8");
const pageFiles = readdirSync(path.join(root, "src", "pages")).filter((f) => f.endsWith(".vue"));

test("the nav's family rows take the kit's words", () => {
  const layout = read("src/layouts/MainLayout.vue");
  for (const key of ["kit.nav.aiSettings", "kit.nav.appSettings", "kit.nav.aiTasks"]) {
    assert.ok(layout.includes(key), `the nav's ${key} words are the kit's key`);
  }
  assert.ok(layout.includes('v-bind="aiTasksNav.navAttrs"'), "the AI-tasks row spreads the kit's navAttrs");
});

test("no hand-rolled primitive where the kit or Quasar has the control", () => {
  assert.ok(pageFiles.length >= 5, "the scan reads the pages (no vacuous pass)");
  for (const f of pageFiles) {
    const src = read(path.join("src", "pages", f));
    const rawTables = [...src.matchAll(/<table\s+class="(?!ui-)[^"]*"/g)];
    assert.equal(rawTables.length, 0, `${f}: a raw <table> — UiTable for a grid, class="ui-formgrid" for a fact sheet`);
    assert.ok(!/<input\b/.test(src), `${f}: a raw <input> — the kit's UiInput / UiNumber / UiToggle`);
    assert.ok(!/<button\b/.test(src), `${f}: a raw <button> — the kit's UiButton`);
    assert.ok(!/style="[^"]*(#[0-9a-f]{3,6}|\d+px)/i.test(src), `${f}: a literal colour or pixel size — tokens.css`);
  }
});

test("start-up is ONE picture: the static layer is the plate, never a spinner", () => {
  const html = read("index.html").replace(/<!--[\s\S]*?-->/g, ""); // the plate's comment says "no spinner"
  const layout = read("src/layouts/MainLayout.vue");
  assert.ok(html.includes("splash-plate.svg") && layout.includes("splash-plate.svg"), "index.html and the splash show the same plate");
  assert.ok(!/spinner|app-boot__spin/i.test(html), "no spinner in the static layer");
  assert.ok(layout.includes("<BootModelLoad />"), "the load group is the kit's BootModelLoad");
});

test("Settings builds its sections from settingsSections.js, with the kit's words for the family's", () => {
  const settings = read("src/pages/SettingsPage.vue");
  assert.ok(settings.includes("kit.settingsSections.") && settings.includes("SETTINGS_SECTION_IDS.map"));
  const ids = read("src/services/settingsSections.js");
  for (const key of ["appearance", "backups", "storage", "server", "logs", "updates", "about"]) {
    assert.ok(ids.includes(`"${key}"`), `Settings renders "${key}"`);
  }
});

test("the form's rules are the route's schema, imported from the server package", () => {
  const dialog = read("src/components/NoteDialog.vue");
  assert.ok(dialog.includes('from "family-template-server/schemas/notes.js"'), "NoteIn comes from the server package");
  assert.ok(dialog.includes("schemaRules(NoteIn)"), "the rules are schemaRules(NoteIn)");
  assert.ok(dialog.includes("fieldErrors(") && dialog.includes("reportError("), "422s under their fields, the rest through reportError");
  assert.ok(dialog.includes("runAiFeature("), "the AI feature runs through the kit's runner");
});
