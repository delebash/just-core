// SPDX-License-Identifier: MIT
// The server's application — the family wiring, in the family's order (app-structure §Q.3, §8,
// §11, §14; docgen's app.js is the donor, JustWrite's the shutdown route and the database layer):
//
//   1. the log ring and the day file, before anything logs (Settings → Logs reads both);
//   2. the kit's server: request ids, problem+json errors, the family 500 (createServer);
//   3. the guards, outermost first and before every route — CSRF, CORS, bearer auth (Hono runs
//      middleware in the order added, for the routes added after it: a CSRF 403 carries no CORS
//      headers; CORS answers a preflight before auth sees it and stamps auth's 401/403);
//   4. the database (migrated) and the app state;
//   5. the family routers — health, shutdown, access tokens, prefs, logs, disk, backups;
//   6. the AI stack — the runner's router, then installLlm (seeding is serve.js's, not here: a
//      test's createApp(tmp) starts from an empty database);
//   7. the app's own routes;
//   8. the built UI for the headless path (GET only; anything else on an unrouted path is 405).

import { statSync } from "node:fs";
import path from "node:path";
import { installLlm, runnerRouter } from "@delebash/core/llm";
import {
  bearerAuth,
  CAPACITOR_ORIGINS,
  createServer,
  csrfOrigin,
  installFileLog,
  installLogRing,
  makeDiskRouter,
  makeLogsRouter,
  makeShutdownRouter,
  SHUTDOWN_PATH,
  serveStatic,
  starletteCors,
} from "@delebash/core/platform";
import { purePath } from "@delebash/core/platform/data_paths";
import { HttpError } from "@delebash/core/platform/errors";
import { getLogger } from "@delebash/core/platform/log";
import { router as healthRouter } from "./api/health_api.js";
import { router as notesRouter } from "./api/notes_api.js";
import { router as prefsRouter } from "./api/prefs_api.js";
import { router as serverAuthRouter } from "./api/server_auth_api.js";
import { router as settingsRouter } from "./api/settings_api.js";
import { AppState, setState } from "./app_state.js";
import { readAuth } from "./auth.js";
import { router as dataRouter } from "./data_admin.js";
import { openAppDatabase } from "./database/index.js";
import { FEATURE_CATALOG } from "./feature_catalog.js";
import { defaultDataDir, SOURCE_ROOT } from "./paths.js";
import { DEFAULT_FEATURE_PROMPTS } from "./seed_feature_prompts.js";
import {
  CLASS_TUNE_IDENTITY,
  CLASS_TUNES,
  DEFAULT_ENGINE_PRESETS,
  DEFAULT_FEATURE_PRESETS,
  DEFAULT_PRESET_ID,
  MODEL_CATALOG,
} from "./seed_presets.js";
import { PRODUCT } from "./version.js";

const log = getLogger("family_template.app");

/** The problem-type prefix of every error answer (`type`: `<base><slug>`, app-structure §15). */
export const TYPE_BASE = "https://family-template.local/errors/";

/** The desktop window's origin — the kit's shell loads the UI from app://<id>. */
export const DESKTOP_ORIGIN = "app://familytemplate";
/** The renderer's own origins: the desktop window and Quasar's dev server (its registered port,
 * app-structure §1 — the same number as quasar.config.js `devServer` and installLlmUi's
 * `devPorts`). The phone's webview origins are the kit's own (csrf.js CAPACITOR_ORIGINS). */
export const APP_ORIGINS = [DESKTOP_ORIGIN, "http://localhost:9000", "http://127.0.0.1:9000"];

/**
 * Where the built UI is, for the headless server (null when there is none): FAMILY_TEMPLATE_UI_DIR;
 * a checkout's browser build, dist/spa/; or, packaged, the app folder — this package is installed
 * at <app>/node_modules/family-template-server, so SOURCE_ROOT is <app>/node_modules, and Quasar
 * puts the built UI at <app> itself (resources/app.asar); then the working folder's dist/spa.
 */
export function locateUiDir() {
  const candidates = [];
  if (process.env.FAMILY_TEMPLATE_UI_DIR) candidates.push(process.env.FAMILY_TEMPLATE_UI_DIR);
  candidates.push(path.join(SOURCE_ROOT, "dist", "spa"));
  if (path.basename(SOURCE_ROOT) === "node_modules") candidates.push(path.dirname(SOURCE_ROOT));
  candidates.push(path.join(process.cwd(), "dist", "spa"));
  return candidates.find((c) => isFile(path.join(c, "index.html"))) ?? null;
}

function isFile(p) {
  try {
    return statSync(p).isFile();
  } catch {
    return false;
  }
}

/** installLlm's arguments: this app's AI data (app-structure §8). */
const llmArgs = (db, dataDir) => ({
  db,
  // Always: without it the engine and the models land outside the data folder.
  dataDir,
  // Names this app in the family's cache registry, so the next app installed can offer to share
  // the engine and models already on this machine instead of downloading them again.
  product: PRODUCT,
  featureCatalog: FEATURE_CATALOG,
  featurePrompts: DEFAULT_FEATURE_PROMPTS,
  enginePresets: DEFAULT_ENGINE_PRESETS,
  featurePresets: DEFAULT_FEATURE_PRESETS,
  defaultPresetId: DEFAULT_PRESET_ID,
  modelCatalogExtra: MODEL_CATALOG,
  classTunesSeed: CLASS_TUNES,
  classTuneIdentity: CLASS_TUNE_IDENTITY,
});

/** The Hono app, not yet listening. `dataDir` defaults to the family data-folder ladder. */
export async function createApp(dataDir = null) {
  dataDir = dataDir ? purePath(String(dataDir)) : defaultDataDir();

  // 1. Server logs → the in-memory ring (Settings → Logs) and a day file that survives a crash.
  installLogRing();
  installFileLog(path.join(dataDir, "logs", "family-template.log"));

  // 2. The kit's server — no onUnhandled of our own: the kit's answer is the family's.
  const app = createServer({ typeBase: TYPE_BASE });

  // 3. The guards. CSRF refuses a cross-site browser write to /v1 (no token, so it can never
  // lock anyone out). CORS answers the app's own origins only — the desktop window (app://), the
  // dev server, the phone — which call this port directly (server/tests/real_server.test.js proves
  // it through a real socket); the UI this server hosts is its own origin and needs none. Never
  // every origin: any web page the user opened could then read this computer's server, backups
  // and keys included (the security review, 2026-10-19). Bearer auth is off until Settings →
  // Server adds a token, and refuses a page that renamed itself to reach this computer (DNS
  // rebinding; FAMILY_TEMPLATE_ALLOWED_HOSTS names a reverse proxy's public name); the desktop shell's
  // POST /v1/shutdown carries no token and stays open from this machine (the route refuses
  // anyone else itself).
  const allowedHosts = (process.env.FAMILY_TEMPLATE_ALLOWED_HOSTS || "").split(",").map((h) => h.trim()).filter(Boolean);
  // a reverse proxy's public names: the browser's Origin there (https://paint.example.com) is the server's own,
  // though the server sees another scheme and host behind the proxy
  const proxyOrigins = allowedHosts.flatMap((h) => [`https://${h}`, `http://${h}`]);
  app.use("*", csrfOrigin({ appOrigins: APP_ORIGINS, extraOrigins: proxyOrigins, typeBase: TYPE_BASE }));
  app.use("*", starletteCors({ allowOrigins: [...APP_ORIGINS, ...CAPACITOR_ORIGINS], allowMethods: ["*"], allowHeaders: ["*"] }));
  app.use("*", bearerAuth({ readAuth, typeBase: TYPE_BASE, loopbackOpenPaths: [SHUTDOWN_PATH], allowedHosts }));

  // 4. The database and the app state the routes read.
  const db = openAppDatabase(dataDir);
  setState(new AppState(dataDir, db));

  // 5. The family routers.
  app.route("/", healthRouter());
  // POST /v1/shutdown — the desktop shell's clean stop of this app's server it finds on its port
  // (src-electron/electron-main.js `shutdownPath`). The AI engine runs in this process's
  // kill-on-close job and ends with it.
  app.route("/", makeShutdownRouter());
  app.route("/", serverAuthRouter());
  app.route("/", prefsRouter());
  app.route("/", makeLogsRouter(PRODUCT));
  app.route("/", makeDiskRouter(dataDir));
  app.route("/", dataRouter(dataDir));

  // 6. The AI stack: the host mounts the runner's process API, installLlm mounts the rest.
  app.route("/", runnerRouter());
  await installLlm(app, llmArgs(db, dataDir));

  // 7. The app's own routes.
  app.route("/", settingsRouter());
  app.route("/", notesRouter());

  // 8. The built UI, served for the headless path — a browser at this address is the whole app.
  // Every /v1 route above wins first (Hono runs routes in the order added).
  const uiDir = locateUiDir();
  if (uiDir !== null) {
    app.on(["POST", "PUT", "PATCH", "DELETE", "OPTIONS"], "/*", () => {
      throw new HttpError(405, "Method Not Allowed");
    });
    app.get("/*", serveStatic({ root: uiDir }));
    log.info(`UI served from ${uiDir}`);
  } else {
    log.warning("no built UI found — the headless UI is off. `npm run build:spa` makes dist/spa/, or set FAMILY_TEMPLATE_UI_DIR.");
  }

  return app;
}
