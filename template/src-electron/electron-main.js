// SPDX-License-Identifier: MIT
// The desktop app: the family's shared shell (`runDesktopApp` from the kit) — the data folder,
// the server in a utilityProcess, the tray, the window on app://<id>, the security settings —
// with this app's names (app-structure §Q.2). Quasar builds this file (Rolldown, ESM) and runs it
// in Electron's main process; nothing app-specific lives here but the settings below.
import path from "node:path";
import { runDesktopApp } from "@delebash/core/shell";
import { resolveElectronAssetsPath } from "#q-app/electron/main";

const here = import.meta.dirname;
const dev = Boolean(import.meta.env.QUASAR_DEV);

runDesktopApp({
  // The window's origin is app://familytemplate — the server's CSRF guard and CORS allow it
  // (server/src/app.js DESKTOP_ORIGIN).
  id: "familytemplate",
  // The data folder's name under the OS fallback (%LOCALAPPDATA%\<name>\<name>) — the same name
  // the server's ladder uses (server/src/paths.js APP_NAME).
  appName: "FamilyTemplate",
  // Shown in the tray and dialogs, and the `product` the server answers in GET /v1/health
  // (server/src/version.js PRODUCT): a listener on the port is stopped only when it is this app's.
  productName: "Family Template",
  port: 17490, // the family port registry: JW 17495 · JV 17494 · docgen 8742 · template 17490
  // A server of this app found on its port is asked to stop through its own route first (the
  // kit's platform/shutdown_api.js, mounted in server/src/app.js), killed only past the shell's wait.
  shutdownPath: "/v1/shutdown",
  // the server package (server/): its source in development, the installed copy when packaged
  serverEntry: dev ? path.resolve("server", "src", "serve.js") : path.join(here, "node_modules", "family-template-server", "src", "serve.js"),
  dataDirEnv: "FAMILY_TEMPLATE_DATA_DIR",
  repoRoot: dev ? path.resolve(".") : null, // development: the data root is <repo>/data
  distDir: here, // Quasar puts the built renderer beside this file
  devUrl: import.meta.env.QUASAR_APP_URL,
  preload: path.join(here, "electron-preload.cjs"),
  window: { title: "Family Template", width: 1200, height: 800, minWidth: 800, minHeight: 600, backgroundColor: "#fafaf7" },
  icon: resolveElectronAssetsPath(process.platform === "win32" ? "icons/icon.ico" : "icons/icon.png"),
  trayIcon: resolveElectronAssetsPath("icons/tray.png"),
  // the server's live log, relative to the data root (the tray's "Open log file")
  logFile: path.join("logs", "family-template.log"),
  // `updates` is left out until the app has releases: no feed, no update checks.
});
