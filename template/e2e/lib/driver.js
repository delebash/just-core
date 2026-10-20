// SPDX-License-Identifier: MIT
// The e2e driver: the REAL desktop app (Electron) launched and driven through Playwright's Electron
// driver (`playwright-core`'s `_electron` — no browser download, no driver binary; app-structure
// §10). docgen's e2e/lib/driver.js is the donor; this one is hermetic (§18):
//
//   - a temp folder per run holds the data folder, and JUST_AI_HOME points there, so nothing reads
//     or writes your real data or the family's cache registry;
//   - the harness starts the app's own server on that folder itself (from source, on Electron's
//     Node — scripts/node24.js) and stops it after (POST /v1/shutdown);
//   - the app runs with the shell's <ID>_DEV_NO_SERVER=1 (§10), so the shell never starts, evicts or
//     strands a server of its own.
// The window talks to the registered port (17490): a run refuses to start while something already
// listens there — your dev server, say — rather than touch it.
//
// What it launches: the built desktop app before packaging — Quasar's dist/electron/UnPackaged
// (`npm run build:unpacked` first) — run by the checkout's Electron, loading the BUILT UI from
// app://, with the app's real CSP: page scripts run over the debugger protocol, which the CSP
// doesn't apply to. The packaged app's fuses forbid this driver (EnableNodeCliInspectArguments off),
// which is why the unfused UnPackaged build is the target.

import { spawn } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { createRequire } from "node:module";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { _electron } from "playwright-core";

const here = path.dirname(fileURLToPath(import.meta.url));
export const REPO_ROOT = path.resolve(here, "../..");
const APP_ROOT = path.join(REPO_ROOT, "dist", "electron", "UnPackaged");
// Electron is the desktop app's dependency, installed in src-electron/ (Quasar's Electron mode).
const ELECTRON = createRequire(path.join(REPO_ROOT, "src-electron", "package.json"))("electron");

/** The shell's id (src-electron/electron-main.js) — its switch is <ID>_DEV_NO_SERVER. */
const ID = "familytemplate";
const NO_SERVER = `${ID.toUpperCase()}_DEV_NO_SERVER`;

/** The registered server port (app-structure §1) — where the window looks for its server. */
export const PORT = 17490;
export const API = `http://127.0.0.1:${PORT}/v1`;

const listening = (port) =>
  new Promise((resolve) => {
    const s = net.connect({ host: "127.0.0.1", port }, () => {
      s.destroy();
      resolve(true);
    });
    s.on("error", () => resolve(false));
  });

/** Poll  until it answers truthy (no fixed sleeps); throws after . */
export async function waitFor(fn, { timeout = 30_000, interval = 200, what = "condition" } = {}) {
  const start = Date.now();
  for (;;) {
    const v = await fn().catch(() => null);
    if (v) return v;
    if (Date.now() - start > timeout) throw new Error(`timed out waiting for ${what}`);
    await new Promise((r) => setTimeout(r, interval));
  }
}

export class Driver {
  constructor() {
    this.app = null;
    this.page = null;
    this.server = null;
    this.tmp = null;
  }

  /** The app's own server on a temp data folder. */
  async startServer() {
    if (await listening(PORT)) {
      throw new Error(`port ${PORT} is in use — stop the server there (your dev server?) before running the e2e smoke; it never touches one it didn't start`);
    }
    this.tmp = mkdtempSync(path.join(os.tmpdir(), "family-template-e2e-"));
    const env = { ...process.env, JUST_AI_HOME: path.join(this.tmp, "family") };
    delete env.ELECTRON_RUN_AS_NODE;
    // a data folder the server is told of must be there (a named folder that isn't is refused, never made)
    mkdirSync(this.dataDir, { recursive: true });
    this.server = spawn(process.execPath, ["scripts/node24.js", "server/src/serve.js", "serve", "--port", String(PORT), "--data-dir", this.dataDir], {
      cwd: REPO_ROOT,
      env,
      stdio: ["ignore", "pipe", "pipe"],
    });
    this.serverLog = "";
    for (const s of [this.server.stdout, this.server.stderr]) s.on("data", (d) => (this.serverLog += d));
    await waitFor(async () => (await fetch(`${API}/health`)).ok, { what: `the server on ${PORT}` });
  }

  get dataDir() {
    return path.join(this.tmp, "data");
  }

  async launch() {
    if (!this.server) await this.startServer();
    const env = { ...process.env, [NO_SERVER]: "1", FAMILY_TEMPLATE_DATA_DIR: this.dataDir };
    delete env.ELECTRON_RUN_AS_NODE;
    delete env.DEV_URL; // the built UI, from app://
    this.app = await _electron.launch({ executablePath: ELECTRON, args: [APP_ROOT], cwd: REPO_ROOT, env });
    this.page = await this.app.firstWindow();
    await this.page.waitForLoadState("domcontentloaded");
    return this;
  }

  async close() {
    try {
      // the page first, its beforeunload skipped (Playwright's page.close runs none by default): a page with unsaved
      // work held the app's close on the shell's "Leave without saving?" box (the nineteenth review)
      await this.page?.close().catch(() => {});
      if (this.app) await this.app.close();
    } catch {
      // already gone
    }
    this.app = null;
    this.page = null;
    if (this.server) {
      const exited = new Promise((resolve) => this.server.once("exit", resolve));
      await fetch(`${API}/shutdown`, { method: "POST" }).catch(() => {});
      const killer = setTimeout(() => this.server?.kill(), 15_000);
      await exited;
      clearTimeout(killer);
      this.server = null;
    }
    if (this.tmp) {
      rmSync(this.tmp, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
      this.tmp = null;
    }
  }

  // ── helpers ────────────────────────────────────────────
  /** A WebDriver-style script body (`arguments[0]`, `return`) run in the page. */
  exec(script, args = []) {
    return this.page.evaluate(`(function(){ ${script} \n}).apply(null, ${JSON.stringify(args)})`);
  }

  navigate(hash) {
    return this.exec("window.location.hash = arguments[0];", [hash]);
  }

  screenshot(file) {
    return this.page.screenshot({ path: file });
  }

  maximize() {
    return this.app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]?.maximize());
  }

  /** The server's API, for a test's own checks (the window's server). */
  async api(pathname, init) {
    const r = await fetch(`${API}${pathname}`, init);
    return r.status === 204 ? null : r.json();
  }
}
