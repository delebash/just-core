// SPDX-License-Identifier: MIT
// Screenshot capture — drives the REAL desktop app (Electron, the built UI from app://) through every
// surface and saves PNGs of its real rendering into e2e/shots/ (gitignored). `npm run screenshots`
// from the app's root (app-structure §10). docgen's capture-direct.js is the donor.
//
// Hermetic like the smoke (lib/driver.js): a temp data folder with one example note, the harness's
// own server, the shell's <ID>_DEV_NO_SERVER=1 — the shots never show or change your own data.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Driver } from "./lib/driver.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const OUT_DIR = path.resolve(here, "shots");

const SURFACES = [
  { name: "home", hash: "#/" },
  { name: "notes", hash: "#/notes", ready: "tr.ui-table-row" },
  { name: "ai", hash: "#/ai" },
  { name: "settings-general", hash: "#/settings/general" },
  { name: "settings-appearance", hash: "#/settings/appearance" },
  { name: "settings-backups", hash: "#/settings/backups" },
  { name: "settings-storage", hash: "#/settings/storage" },
  { name: "settings-server", hash: "#/settings/server" },
  { name: "settings-logs", hash: "#/settings/logs" },
  { name: "settings-updates", hash: "#/settings/updates" },
  { name: "settings-about", hash: "#/settings/about" },
  { name: "not-found", hash: "#/no-such-page" },
];

async function main() {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const d = new Driver();
  console.log("→ starting the server and the desktop app (hermetic)");
  await d.startServer();
  // one example note, through the API, so the list has something to show
  await d.api("/notes", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ title: "An example note", body: "Written for the screenshots.", pinned: true }) });
  await d.api("/prefs", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ aiOfferShown: true }) });
  await d.launch();
  await d.maximize();
  await d.page.waitForSelector(".shell", { timeout: 30_000 });
  try {
    for (const s of SURFACES) {
      console.log(`→ ${s.name} (${s.hash})`);
      await d.navigate(s.hash);
      if (s.ready) await d.page.waitForSelector(s.ready, { timeout: 10_000 });
      await d.page.waitForLoadState("networkidle").catch(() => {});
      await d.page.waitForTimeout(600); // let transitions settle before the picture
      await d.screenshot(path.join(OUT_DIR, `${s.name}.png`));
    }
    // the note editor, open — a dialog never shows in a route's shot
    console.log("→ note-editor (dialog)");
    await d.navigate("#/notes");
    await d.page.locator("tr.ui-table-row").first().click();
    await d.page.waitForSelector("#note-title");
    await d.page.waitForTimeout(400);
    await d.screenshot(path.join(OUT_DIR, "note-editor.png"));
  } finally {
    console.log("→ closing");
    await d.close();
  }
  console.log(`done — ${OUT_DIR}`);
}

main().catch((e) => {
  console.error("FAIL:", e.message);
  process.exit(1);
});
