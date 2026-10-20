// SPDX-License-Identifier: MIT
// The family's desktop shell — the Electron main process every app runs, with a short
// per-app config (the Electron move's plan §0 and §4 "The shared Electron main module";
// it replaces the three Rust shells, which were kept in lock-step by hand).
//
// Main owns the window, the tray, the dialogs, the data folder and the server's life. No
// business logic lives here — the rule that kept logic out of Rust carries over.
//
//   - The data root is resolved before anything opens (dataRoot.js), and Chromium's own
//     files and the window position live under it — nothing lands where the user didn't
//     choose (the 2026-08-14 ruling Tauri broke).
//   - The server is the app's server module in a `utilityProcess`: it ends when main
//     dies, even on a hard kill (plan §1.1); it listens on the port its own settings name
//     and says which (`ready`), or which port it couldn't take (checked before it opens its
//     database when the app names the port first — platform/serve.js `resolvePort`) — then
//     a listener there is stopped only when it answers GET /v1/health as this app's own
//     server, and then it is asked first (its app's shutdown route, else SIGTERM off Windows —
//     stale_server.js) and killed only past the wait; our own server's stop asks it over
//     `parentPort`, waits, then kills — graceful for all three apps (JustWrite and docgen only
//     hard-killed under Tauri). The renderer asks for the URL (`serverUrl`), and on its
//     connection-error screen why a start failed (`serverStatus`: the port held by another
//     program, or the data folder held by another server of the app — platform/data_lock.js;
//     since 2026-10-20 also the port held by another OS user's copy of the app — never stopped —,
//     a port Windows has reserved, and the first error line of a server that couldn't start).
//   - A data root that can't be used (a missing drive, an offline share, read-only, a path the
//     native code can't take) is said before anything lands in it, in a message box: Try again,
//     Use the default folder, Quit (2026-10-20).
//   - The server runs with the OS's certificates trusted (NODE_USE_SYSTEM_CA) and the system's
//     proxy handed down (server_start.js, 2026-10-20).
//   - The window loads the built UI from `app://<id>/` (ruling 3) — it opens even when
//     the server is down and shows the kit's connection-error screen; in development it
//     loads the Vite dev server instead.
//   - The renderer reaches main through ONE preload object, `window.appShell`, read only
//     by the app's `src/services/native.js`.
//   - Updates are electron-updater's (2026-10-09): checked at start-up, downloaded when the
//     user presses Download, installed when the app quits (or at once, "Restart now").
//   - Electron's security checklist (electronjs.org/docs/latest/tutorial/security), checked
//     2026-10-08: context isolation, the sandbox and no Node in the renderer; a written CSP on
//     app://; navigation, new windows and <webview> refused; permissions granted only to the
//     app's own page and only from an allow-list; every IPC call checked against the sender's
//     origin; one copy of the app at a time. The fuses are set per app at packaging
//     (package.json `build.electronFuses`).

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { pathToFileURL } from "node:url";
import {
  app,
  BrowserWindow,
  dialog,
  ipcMain,
  Menu,
  nativeImage,
  net,
  powerMonitor,
  protocol,
  screen,
  session,
  shell,
  Tray,
  utilityProcess,
} from "electron";
import contextMenu from "electron-context-menu";
import { dataFolderInUse } from "../platform/data_lock.js";
import { cantUseDataDir, samePath } from "../platform/data_paths.js";
import { portInUse } from "../platform/port.js";
import { CHROME_DIR, dataRootProblem, relocate, resolveDataRoot, storageInfo, sweepOldChromeDir, useDefaultRoot } from "./dataRoot.js";
import { pickSpellLanguages } from "./spellLanguages.js";
import { placeSaved } from "./save_place.js";
import { firstErrorLine, listenFailure, PROXY_PROBE_URL, proxyFromPac, serverEnv } from "./server_start.js";
import { stopStaleServer, whoseServer } from "./stale_server.js";

/** The renderer's commands — the preload exposes exactly these (`appShell.invoke`). */
export const COMMANDS = [
  "pickDirectory",
  "pickFile",
  "saveFile",
  "saveFromUrl",
  "storageGetRoot",
  "storageRelocate",
  "setKeepRunning",
  "setTrayLabels",
  "setContextMenuLabels",
  "setSpellCheckerLanguages",
  "openExternal",
  "openPath",
  "updateStatus",
  "updateCheck",
  "updateDownload",
  "updateInstall",
  "serverUrl",
  "serverStatus",
];

const DEFAULT_TRAY_LABELS = {
  show: "📺 Show window",
  hide: "🔵 Hide window",
  serverStart: "▶️ Start server",
  serverStop: "⏹ Stop server",
  serverRestart: "🔄 Restart server",
  openSettings: "⚙️ Open settings",
  copyUrl: "📋 Copy server URL",
  openLogs: "📜 Open log file",
  about: null, // "ℹ️ About <productName>"
  quit: null, // "🚪 Quit <productName>"
};

// The right-click menu's words the app may send (`setContextMenuLabels`, in its language, like the
// tray's): electron-context-menu's item ids for what this shell shows. Until then, its own English.
const CONTEXT_MENU_LABEL_IDS = ["learnSpelling", "dictionarySuggestions", "cut", "copy", "paste", "selectAll", "copyImage", "copyLink"];

// The server's own 3 s grace plus engine shutdown — 15 s, what the Tauri shell it replaced
// waited (10 s for the shutdown reply, then 5 s for the exit).
const STOP_WAIT_MS = 15_000;

/**
 * Run the desktop app. `config`:
 *   id            short id — the app:// host, tray id, window-state key (e.g. "justvoice")
 *   appName       the data folder's name under the OS fallback (`%LOCALAPPDATA%\<App>\<App>`)
 *   productName   shown in the tray and dialogs
 *   port          the app's registered server port (the family port registry) — its server's
 *                 default. The server listens where its own settings say (JustVoice's Port
 *                 setting) and tells the shell the port when it is ready.
 *   serverProduct the `product` the app's server names in GET /v1/health (default
 *                 productName) — a listener already on the server's port is stopped only when
 *                 it answers with it, as this app's own server
 *   shutdownPath  the app server's own shutdown route, POSTed from this machine (JustVoice:
 *                 "/v1/shutdown") — such a server is asked through it to stop before it is
 *                 killed; without one it is sent SIGTERM (Windows: killed at once)
 *   serverEntry   absolute path of the app's server module (runs `serve`)
 *   dataDirEnv    the app's data-dir variable (e.g. "JUSTVOICE_DATA_DIR")
 *   repoRoot      the checkout root (development: the data root is <repoRoot>/data)
 *   distDir       the built UI (vite build output; Quasar: the folder beside electron-main.js)
 *   preload       the preload script's path — default this kit's preload.js; a Quasar app passes
 *                 its bundled electron-preload.cjs, which imports this kit's preload
 *   devUrl        the renderer's dev server URL when not packaged — Quasar passes
 *                 import.meta.env.QUASAR_APP_URL; DEV_URL in the environment also works
 *   window        {width, height, minWidth, minHeight, backgroundColor, title}
 *   icon          the window icon path
 *   trayIcon      the tray icon path (default: icon)
 *   logFile       the server's live log, relative to the data root (tray "Open log file")
 *   closeHoldMs   wait before closing so a `pagehide` save lands (JustWrite: 400)
 *   csp           the Content-Security-Policy for app:// pages (a default is used)
 *   cspAdd        sources added to the default's directives, e.g. {"img-src": ["https:"]}
 *   trayExtras    extra tray items [{id, label, event}] sent to the renderer as `tray:<event>`
 *   permissions   web permissions the app's page may have beyond the clipboard (e.g. "media"
 *                 for the microphone); every other request is denied
 *   updates       {releasesUrl} — the app's releases page; with it, a packaged app updates
 *                 itself from the feed its electron-builder `publish` names (none: updates off)
 */
export function runDesktopApp(config) {
  const state = {
    root: null,
    server: null, // the utilityProcess
    serverPhase: "off", // off · starting · ready
    port: config.port ?? null,
    // Why the last start failed, for the renderer's connection-error screen (`serverStatus`): the
    // port another program holds, or the words for a data folder another server of the app holds;
    // since 2026-10-20 the port another OS user's copy of the app holds, a port Windows has
    // reserved, and the first error line of a server that couldn't start.
    portTaken: null,
    dataFolderInUse: null,
    portOtherUser: null,
    portReserved: null,
    serverError: null,
    keepRunning: false,
    quitting: false,
    win: null,
    tray: null,
    trayLabels: { ...DEFAULT_TRAY_LABELS },
    contextMenuLabels: {}, // read each time the menu opens (electron-context-menu `labels`)
  };

  protocol.registerSchemesAsPrivileged([
    {
      scheme: "app",
      privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true, stream: true },
    },
  ]);

  // ── the data root, before Chromium writes anything ─────────────────────────
  state.root = resolveDataRoot({
    appName: config.appName,
    dataDirEnv: config.dataDirEnv,
    repoRoot: config.repoRoot,
    packaged: app.isPackaged,
  });
  // A root that can't be used — a missing drive, an unplugged USB stick, an offline share, read-only, Controlled
  // Folder Access, or a path named by the user that the native code can't take — is said before anything lands
  // in it (2026-10-20: the mkdir below threw Electron's "JavaScript error in the main process" dialog). Until the
  // user answers (`settleDataRoot`, once the app is ready), Chromium's folder goes under the default folder — the
  // one "Use the default folder" goes on in — or, when that can't be used either, the system's temp folder.
  let rootProblem = dataRootProblem(state.root);
  let canUseDefault = false;
  let chromeHome = state.root;
  if (rootProblem) {
    console.warn(`[shell] ${cantUseDataDir(state.root, rootProblem)}`);
    const def = storageInfo({ root: state.root, appName: config.appName, repoRoot: config.repoRoot, packaged: app.isPackaged }).default;
    canUseDefault = !samePath(def, state.root) && !dataRootProblem(def);
    chromeHome = canUseDefault ? def : path.join(os.tmpdir(), `${config.id}-start`);
  } else sweepOldChromeDir(state.root);
  const chromeDir = path.join(chromeHome, CHROME_DIR);
  fs.mkdirSync(chromeDir, { recursive: true });
  for (const k of ["userData", "sessionData", "crashDumps", "logs"]) app.setPath(k, path.join(chromeDir, k === "userData" ? "" : k));
  if (process.platform === "win32") app.setAppUserModelId(`com.${config.id}.app`);

  // One copy per data folder (the lock lives in userData, set just above): a second launch
  // would evict the first copy's server from the port. It hands over and quits; the first
  // shows its window (the "second-instance" handler at boot).
  if (!app.requestSingleInstanceLock()) {
    app.quit();
    return null;
  }

  // The page the window loads, and so the one origin trusted with permissions and IPC.
  const devUrl = !app.isPackaged ? config.devUrl || process.env.DEV_URL || null : null;
  const home = devUrl || `app://${config.id}/index.html`;
  const homeOrigin = new URL(home).origin;
  const fromHome = (url) => {
    try {
      return new URL(url).origin === homeOrigin;
    } catch {
      return false;
    }
  };

  // ── the server ─────────────────────────────────────────────────────────────
  const serverUrl = () => (state.port ? `http://127.0.0.1:${state.port}` : null);

  // The renderer's `serverUrl`: answered once the server listens (the port is the server's own —
  // it says it then), or once a start ends without one.
  const urlWaiters = [];
  function settleServerUrl() {
    for (const resolve of urlWaiters.splice(0)) resolve(serverUrl());
  }

  /** Whose is the listener on `port` (stale_server.js `whoseServer`)? This app's own server answers GET /v1/health
   * with the app's `product` (the family health baseline), and since 2026-10-20 its OS user's `owner`: "mine",
   * "other-user" (another OS user's copy of the app — never stopped), or null. The wait is the window's own for
   * one health probe (the kit UI's `checkServer`, `probeTimeoutMs` 500 ms): a listener that takes the connection
   * and never answers is not taken for this app's server. */
  async function whoAnswers(port) {
    try {
      const r = await fetch(`http://127.0.0.1:${port}/v1/health`, { signal: AbortSignal.timeout(500) });
      const body = r.ok ? await r.json() : null;
      return whoseServer(body, { product: config.serverProduct || config.productName });
    } catch {
      return null;
    }
  }

  /** The system's proxy for the server's downloads, or null (DIRECT, none, or no answer in 5 s). */
  async function systemProxy() {
    try {
      const pac = await Promise.race([session.defaultSession.resolveProxy(PROXY_PROBE_URL), new Promise((r) => setTimeout(() => r(null), 5000))]);
      return proxyFromPac(pac);
    } catch {
      return null;
    }
  }

  async function evictListener(port) {
    // A server of this app's left on the port (a crashed run, a headless server) would answer
    // this app's UI with its own code, its database open beside ours. Asked to stop first, killed
    // only past the wait (the Rust shells killed any listener at once).
    console.warn(`[shell] port ${port} is held by this app's own server — asking it to stop`);
    await stopStaleServer(port, { shutdownPath: config.shutdownPath || null, waitMs: STOP_WAIT_MS });
  }

  async function startServer({ evicted = false } = {}) {
    if (state.server || (state.serverPhase === "starting" && !evicted)) return;
    if (process.env[`${config.id.toUpperCase().replace(/-/g, "_")}_DEV_NO_SERVER`]) return; // run it yourself
    state.serverPhase = "starting";
    Object.assign(state, { portTaken: null, dataFolderInUse: null, portOtherUser: null, portReserved: null, serverError: null });
    // Before the start: this app's own server left on its usual port (a crashed run, a headless
    // server) is stopped first, so the new one never opens the database beside it. An app whose
    // port is a setting checks that port too, before it opens anything (platform/serve.js
    // `resolvePort`). Another OS user's copy of the app on the port is left running: the start
    // below can't listen and says so.
    if (!evicted && config.port && (await portInUse(config.port)) && (await whoAnswers(config.port)) === "mine") {
      await evictListener(config.port);
    }
    // No --port: the server listens where its own settings say, and says where once it listens
    // (`ready`), or which port it couldn't take (`listen-failed` — before it opens its database,
    // when the app names its port first).
    const proxy = await systemProxy();
    const child = utilityProcess.fork(config.serverEntry, ["serve"], {
      env: serverEnv({ env: process.env, dataDirEnv: config.dataDirEnv, root: state.root, proxy }),
      serviceName: `${config.productName} server`,
      stdio: "pipe",
    });
    state.server = child;
    // what it wrote to stderr while starting: a server that dies before it can say why (a module that won't
    // load) left its error there
    let startOutput = "";
    child.stdout?.on("data", (d) => process.stdout.write(d));
    child.stderr?.on("data", (d) => {
      process.stderr.write(d);
      if (state.server === child && state.serverPhase === "starting" && startOutput.length < 16_384) startOutput += d;
    });
    child.on("message", (m) => {
      if (m?.type === "ready") {
        state.port = m.port;
        state.serverPhase = "ready";
        guardOtherUsersPort(null);
        console.log(`[shell] server listening on ${m.port}`);
        settleServerUrl();
      } else if (m?.type === "listen-failed") {
        listenFailed(m, evicted);
      } else if (m?.type === "data-folder-locked") {
        // Another server of this app has the data folder open: the start ends, and the renderer's
        // connection-error screen says so.
        state.dataFolderInUse = dataFolderInUse(config.productName, m.dataDir);
        console.warn(`[shell] ${state.dataFolderInUse}`);
        stopServer();
      } else if (m?.type === "start-failed") {
        // The server couldn't start (its data folder, its database …): its first line reaches the
        // connection-error screen.
        state.serverError = String(m.error || "") || null;
        console.warn(`[shell] the server couldn't start: ${state.serverError}`);
        stopServer();
      }
    });
    child.on("exit", (code) => {
      if (state.server === child) {
        const why = ["portTaken", "dataFolderInUse", "portOtherUser", "portReserved", "serverError"].some((k) => state[k]);
        if (state.serverPhase === "starting" && !why) state.serverError = firstErrorLine(startOutput);
        state.server = null;
        state.serverPhase = "off";
        settleServerUrl();
      }
      if (!state.quitting) console.warn(`[shell] server exited (${code})`);
    });
  }

  // Another OS user's copy of the app holds the port: its data is theirs, so this window must not use it — it
  // answers as this app, and the window would boot on it. The window's requests to that port are refused
  // (Electron's webRequest.onBeforeRequest — electronjs.org/docs/latest/api/web-request) until our own server
  // listens (`port` null); the connection-error screen says why (`serverStatus` portOtherUser).
  let guardedPort = null;
  function guardOtherUsersPort(port) {
    if (port === guardedPort) return;
    guardedPort = port;
    const ses = session.defaultSession;
    if (!port) return ses.webRequest.onBeforeRequest(null);
    ses.webRequest.onBeforeRequest({ urls: ["http://*/*"] }, (d, callback) => {
      let held = false;
      try {
        const u = new URL(d.url);
        held = ["127.0.0.1", "localhost", "[::1]"].includes(u.hostname) && u.port === String(guardedPort);
      } catch {
        /* not a URL */
      }
      callback({ cancel: held });
    });
  }

  // The server couldn't listen; it waits for our stop. When this app's own server holds the
  // port, stop that one and start again (once); any other program — or another OS user's copy of
  // the app — keeps the port, and the connection-error screen says which (`serverStatus`).
  async function listenFailed({ port, code }, evicted) {
    state.port = port; // the server's port, taken or not
    const who = code === "EADDRINUSE" ? await whoAnswers(port) : null;
    const ours = who === "mine" && !evicted;
    if (!ours) {
      Object.assign(state, listenFailure(code, port, who));
      if (state.portOtherUser) guardOtherUsersPort(port);
      if (state.portOtherUser) console.warn(`[shell] another user of this computer has ${config.productName} running on port ${port} — left running`);
      else if (state.portReserved) console.warn(`[shell] the server may not use port ${port} (${code}) — on Windows, a port Hyper-V or WSL reserved`);
      else console.warn(`[shell] the server could not listen on port ${port} (${code}) — whatever holds it is left running`);
    }
    await stopServer({ restarting: ours });
    if (!ours) return;
    await evictListener(port);
    await startServer({ evicted: true });
  }

  function stopServer({ restarting = false } = {}) {
    const child = state.server;
    if (!child) return Promise.resolve();
    state.server = null;
    // A restart keeps the renderer's `serverUrl` waiting for the next start.
    state.serverPhase = restarting ? "starting" : "off";
    if (!restarting) settleServerUrl();
    return new Promise((resolve) => {
      let done = false;
      const finish = () => {
        if (!done) {
          done = true;
          resolve();
        }
      };
      child.once("exit", finish);
      try {
        child.postMessage({ type: "stop" });
      } catch {
        /* already gone */
      }
      setTimeout(() => {
        if (!done) {
          console.warn("[shell] server did not stop in time — killing it");
          child.kill();
          setTimeout(finish, 500);
        }
      }, STOP_WAIT_MS);
    });
  }

  // ── app:// — the built UI, with a written CSP ──────────────────────────────
  const cspDefault = [
    ["default-src", "'self'"],
    ["script-src", "'self'"],
    ["style-src", "'self' 'unsafe-inline'"],
    ["img-src", "'self' data: blob: http://127.0.0.1:* http://localhost:*"],
    ["media-src", "'self' data: blob: http://127.0.0.1:* http://localhost:*"],
    ["font-src", "'self' data:"],
    ["connect-src", "'self' http://127.0.0.1:* http://localhost:*"],
    ["worker-src", "'self' blob:"],
    ["object-src", "'none'"],
    ["base-uri", "'self'"],
  ];
  const csp =
    config.csp ||
    cspDefault.map(([d, src]) => [d, src, ...((config.cspAdd || {})[d] || [])].join(" ")).join("; ");

  function serveApp(request) {
    const url = new URL(request.url);
    const dist = path.resolve(config.distDir);
    let rel = decodeURIComponent(url.pathname);
    if (rel === "/" || rel === "") rel = "/index.html";
    const file = path.resolve(dist, `.${rel}`);
    if (!file.startsWith(dist + path.sep) && file !== dist) return new Response("Not Found", { status: 404 });
    let target = file;
    if (!fs.existsSync(target) || fs.statSync(target).isDirectory()) target = path.join(dist, "index.html");
    return net.fetch(pathToFileURL(target).toString()).then((r) => {
      const headers = new Headers(r.headers);
      if (target.endsWith(".html")) headers.set("Content-Security-Policy", csp);
      return new Response(r.body, { status: r.status, headers });
    });
  }

  // ── the window ─────────────────────────────────────────────────────────────
  const stateFile = path.join(chromeDir, "window-state.json");
  function loadWindowState() {
    try {
      const s = JSON.parse(fs.readFileSync(stateFile, "utf8"));
      const fits = screen
        .getAllDisplays()
        .some(
          (d) =>
            s.x >= d.workArea.x - 50 &&
            s.y >= d.workArea.y - 50 &&
            s.x + 100 <= d.workArea.x + d.workArea.width &&
            s.y + 100 <= d.workArea.y + d.workArea.height,
        );
      return fits ? s : { width: s.width, height: s.height, maximized: s.maximized };
    } catch {
      return null;
    }
  }
  function saveWindowState(win) {
    try {
      const b = win.getNormalBounds();
      fs.writeFileSync(stateFile, JSON.stringify({ ...b, maximized: win.isMaximized() }));
    } catch {
      /* best effort */
    }
  }

  function createWindow() {
    const w = config.window || {};
    const saved = loadWindowState();
    // the screen it opens on: no bigger than its work area, its minimum included — a 960 × 700 minimum is taller
    // than a 1280 × 720 screen's work area (1080p at 150 %), and the window hung under the taskbar unable to
    // shrink (just-house-paint's eleventh review, measured 2026-10-20)
    const area = (saved?.x !== undefined && saved?.y !== undefined ? screen.getDisplayMatching({ x: saved.x, y: saved.y, width: saved.width || 1, height: saved.height || 1 }) : screen.getPrimaryDisplay()).workAreaSize;
    const fit = (n, max) => (n ? Math.min(n, max) : n);
    const win = new BrowserWindow({
      title: w.title || config.productName,
      width: fit(saved?.width || w.width || 1280, area.width),
      height: fit(saved?.height || w.height || 800, area.height),
      x: saved?.x,
      y: saved?.y,
      minWidth: fit(w.minWidth, area.width),
      minHeight: fit(w.minHeight, area.height),
      backgroundColor: w.backgroundColor,
      icon: config.icon,
      show: false,
      autoHideMenuBar: true,
      webPreferences: {
        preload: config.preload || path.join(import.meta.dirname, "preload.js"),
        contextIsolation: true,
        sandbox: true,
        nodeIntegration: false,
      },
    });
    if (saved?.maximized) win.maximize();
    win.once("ready-to-show", () => win.show());
    // The right-click menu Electron doesn't draw by itself (2026-10-18; electron-context-menu, the
    // pattern electronjs.org/docs/latest/tutorial/spellchecker shows): spelling suggestions, Add to
    // dictionary (the user's own act), cut/copy/paste, copy link or image. No web search — nothing
    // leaves the app unasked — and no macOS Look Up. A page with its own menu (JustWrite's editor)
    // cancels the browser's and never gets this one.
    contextMenu({
      window: win,
      labels: state.contextMenuLabels,
      showSearchWithGoogle: false,
      showLookUpSelection: false,
    });
    win.webContents.setWindowOpenHandler(({ url }) => {
      if (/^https?:/i.test(url)) shell.openExternal(url);
      return { action: "deny" };
    });
    win.webContents.on("will-navigate", (e, url) => {
      if (new URL(url).origin !== homeOrigin) {
        e.preventDefault();
        if (/^https?:/i.test(url)) shell.openExternal(url);
      }
    });
    let holding = false;
    win.on("close", (e) => {
      saveWindowState(win);
      if (state.quitting) return;
      if (state.keepRunning) {
        e.preventDefault();
        win.hide();
        return;
      }
      // Closing stops everything. JustWrite holds the window a moment first so the page's
      // `pagehide` autosave reaches the server before it stops (closeHoldMs).
      if (config.closeHoldMs && !holding) {
        e.preventDefault();
        holding = true;
        setTimeout(() => quitApp(), config.closeHoldMs);
        return;
      }
      e.preventDefault();
      quitApp();
    });
    // the app drawn in the window — the release's start check waits for this line (scripts/start-packaged.js):
    // a server that answers behind a window that never draws isn't a working app. An error page or a
    // missing bundle "finishes loading" too (measured, Electron 44.7), so the app's own layout is asked for
    // (Quasar's .q-layout in #q-app — a failed start's message has none) and, inside it, its first page
    // (the page container's content — a page that throws or a lazy chunk that's missing leaves it empty);
    // a failed load says so instead.
    let failedLoad = null;
    win.webContents.on("did-fail-load", (_e, code, description, _url, isMainFrame) => {
      // the page itself (a frame inside it failing isn't the window failing); -3: a navigation the page replaced
      if (isMainFrame && code !== -3) failedLoad = `${code} ${description}`;
    });
    win.webContents.on("render-process-gone", (_e, d) => console.log(`[shell] window failed: the page's process ${d.reason}`));
    win.webContents.once("did-finish-load", async () => {
      if (failedLoad) return console.log(`[shell] window failed: ${failedLoad}`);
      for (let i = 0; i < 120 && !win.isDestroyed(); i++) {
        const drawn = await win.webContents
          .executeJavaScript(
            "(() => { const l = document.querySelector('#q-app .q-layout'); const c = l && l.querySelector('.q-page-container'); return !!l && (!c || c.childElementCount > 0); })()",
            true,
          )
          .catch(() => false);
        if (drawn) return console.log("[shell] window loaded");
        await new Promise((r) => setTimeout(r, 500));
      }
      console.log("[shell] window failed: the app never drew its layout and first page");
    });
    win.loadURL(home);
    state.win = win;
    return win;
  }

  function showWindow() {
    if (!state.win || state.win.isDestroyed()) createWindow();
    state.win.show();
    state.win.focus();
  }
  const send = (channel, ...args) => state.win && !state.win.isDestroyed() && state.win.webContents.send(channel, ...args);

  // ── the tray ───────────────────────────────────────────────────────────────
  function buildTrayMenu() {
    const L = state.trayLabels;
    const items = [
      { label: L.show, click: showWindow },
      { label: L.hide, click: () => state.win?.hide() },
      { type: "separator" },
      { label: L.serverStart, click: () => startServer() },
      { label: L.serverStop, click: () => stopServer() },
      {
        label: L.serverRestart,
        click: async () => {
          await stopServer();
          await startServer();
        },
      },
      { type: "separator" },
      ...(config.trayExtras || []).map((x) => ({
        label: L[x.id] || x.label,
        click: () => {
          showWindow();
          send(`tray:${x.event}`);
        },
      })),
      {
        label: L.openSettings,
        click: () => {
          showWindow();
          send("tray:open-settings");
        },
      },
      {
        label: L.copyUrl,
        click: () => {
          showWindow();
          send("tray:copy-url", serverUrl());
        },
      },
      {
        label: L.openLogs,
        click: () => {
          const live = path.join(state.root, config.logFile || "logs");
          shell.openPath(fs.existsSync(live) ? live : path.join(state.root, "logs"));
        },
      },
      { type: "separator" },
      {
        label: L.about || `ℹ️ About ${config.productName}`,
        click: () => {
          showWindow();
          send("tray:about");
        },
      },
      { label: L.quit || `🚪 Quit ${config.productName}`, click: () => quitApp() },
    ];
    return Menu.buildFromTemplate(items);
  }
  function createTray() {
    const tray = new Tray(nativeImage.createFromPath(config.trayIcon || config.icon));
    tray.setToolTip(config.productName);
    tray.setContextMenu(buildTrayMenu());
    tray.on("click", () => {
      if (state.win?.isVisible()) state.win.hide();
      else showWindow();
    });
    state.tray = tray;
  }

  async function quitApp() {
    if (state.quitting) return;
    state.quitting = true;
    await stopServer();
    app.quit();
  }

  // ── updates ────────────────────────────────────────────────────────────────
  // electron-updater (https://www.electron.build/auto-update; JustVoice's plan 2026-10-09 §6,
  // decided 2026-10-09): one check once the server is up, a download only when asked, and a
  // downloaded update installs when the app quits. A Mac can't install an unsigned update
  // (MacUpdater takes only a signed zip), so there it checks and links to the release. On in a
  // packaged app that names its releases, or in development with a local feed (<ID>_UPDATE_FEED,
  // read only when not packaged).
  const envId = config.id.toUpperCase().replace(/-/g, "_");
  const devFeed = !app.isPackaged ? process.env[`${envId}_UPDATE_FEED`] || null : null;
  const updatesOn = !!config.updates?.releasesUrl && (app.isPackaged || !!devFeed);
  // state: off · idle · checking · latest · available · downloading · ready · error
  const update = {
    state: updatesOn ? "idle" : "off",
    version: null,
    percent: 0,
    error: null,
    releaseUrl: null,
    canInstall: process.platform !== "darwin",
  };
  let updater = null;
  const updateNow = () => ({ ...update });
  const firstLine = (e) => String(e?.message || e).split("\n")[0].slice(0, 200);
  function setUpdate(patch) {
    Object.assign(update, patch);
    send("update:status", updateNow());
  }
  async function loadUpdater() {
    if (updater || !updatesOn) return updater;
    const { autoUpdater } = (await import("electron-updater")).default;
    autoUpdater.autoDownload = false;
    autoUpdater.autoInstallOnAppQuit = true;
    autoUpdater.logger = console;
    if (devFeed) {
      // electron-updater's development route: a dev-app-update.yml naming the feed. Both the
      // check and the download read it (setFeedURL alone fails the download: ENOENT).
      const devConfig = path.join(chromeDir, "dev-app-update.yml");
      fs.writeFileSync(devConfig, `provider: generic\nurl: ${JSON.stringify(devFeed)}\nupdaterCacheDirName: ${config.id}-updater-dev\n`);
      autoUpdater.forceDevUpdateConfig = true;
      autoUpdater.updateConfigPath = devConfig;
    }
    autoUpdater.on("checking-for-update", () => setUpdate({ state: "checking", error: null }));
    autoUpdater.on("update-not-available", () => setUpdate({ state: "latest", version: null }));
    autoUpdater.on("update-available", (info) =>
      setUpdate({ state: "available", version: info.version, releaseUrl: `${config.updates.releasesUrl}/tag/v${info.version}` }),
    );
    autoUpdater.on("download-progress", (p) => setUpdate({ state: "downloading", percent: Math.floor(p.percent || 0) }));
    autoUpdater.on("update-downloaded", (info) => setUpdate({ state: "ready", version: info.version, percent: 100 }));
    autoUpdater.on("error", (e) => setUpdate({ state: "error", error: firstLine(e) }));
    updater = autoUpdater;
    return updater;
  }
  // a check of its own (every six hours, on wake): one that fails — no network yet — leaves the panel as it was
  let quietFrom = null;
  async function checkForUpdates({ quiet = false } = {}) {
    const u = await loadUpdater();
    if (!u || ["checking", "downloading", "ready"].includes(update.state)) return updateNow();
    if (quiet) quietFrom = { ...update };
    try {
      await u.checkForUpdates();
    } catch (e) {
      if (!quietFrom) setUpdate({ state: "error", error: firstLine(e) });
    } finally {
      if (quietFrom && update.state === "error") setUpdate(quietFrom);
      quietFrom = null;
    }
    return updateNow();
  }

  // ── the renderer's commands ────────────────────────────────────────────────
  const handlers = {
    async pickDirectory({ title, defaultPath } = {}) {
      const r = await dialog.showOpenDialog(state.win, {
        title: title || "Choose a folder",
        defaultPath: defaultPath || undefined,
        properties: ["openDirectory", "createDirectory"],
      });
      return r.canceled || !r.filePaths.length ? null : r.filePaths[0];
    },
    async pickFile({ title, filterName, filterExt, defaultDir } = {}) {
      const r = await dialog.showOpenDialog(state.win, {
        title: title || "Open a file",
        defaultPath: defaultDir || undefined,
        properties: ["openFile"],
        filters: filterExt ? [{ name: filterName || filterExt, extensions: [String(filterExt).replace(/^\./, "")] }] : [],
      });
      if (r.canceled || !r.filePaths.length) return null;
      const p = r.filePaths[0];
      return { name: path.basename(p), dir: path.dirname(p), dataBase64: fs.readFileSync(p).toString("base64") };
    },
    async saveFile({ bytes, suggestedName, title, filterName, filterExt, defaultDir } = {}) {
      const r = await dialog.showSaveDialog(state.win, {
        title: title || "Save as",
        defaultPath: path.join(defaultDir || app.getPath("downloads"), suggestedName || ""),
        filters: filterExt ? [{ name: filterName || filterExt, extensions: [String(filterExt).replace(/^\./, "")] }] : [],
      });
      if (r.canceled || !r.filePath) return null;
      // beside it first, then in its place: a disk that fills leaves no cut-off file under the chosen name
      const part = `${r.filePath}.part`;
      try {
        fs.writeFileSync(part, Buffer.from(bytes));
        await placeSaved(part, r.filePath);
      } catch (e) {
        fs.rmSync(part, { force: true });
        throw e;
      }
      return { ok: true, path: r.filePath };
    },
    /** "Save as" for a file the app's own server makes (a backup — gigabytes of photos): streamed from the
     *  server straight to the chosen file, never held whole by the window or here (2026-10-20). Only this
     *  app's server: `url` must start at its address; `headers` carry the window's access token. */
    async saveFromUrl({ url, headers, suggestedName, title, filterName, filterExt, defaultDir } = {}) {
      const base = serverUrl();
      if (!base || typeof url !== "string" || !url.startsWith(`${base}/`)) throw new Error("saveFromUrl: only this app's server's files");
      const r = await dialog.showSaveDialog(state.win, {
        title: title || "Save as",
        defaultPath: path.join(defaultDir || app.getPath("downloads"), suggestedName || ""),
        filters: filterExt ? [{ name: filterName || filterExt, extensions: [String(filterExt).replace(/^\./, "")] }] : [],
      });
      if (r.canceled || !r.filePath) return null;
      const res = await fetch(url, { headers: headers || {} });
      if (!res.ok || !res.body) throw new Error(`${res.status} ${res.statusText}`);
      const part = `${r.filePath}.part`;
      try {
        await pipeline(Readable.fromWeb(res.body), fs.createWriteStream(part));
        await placeSaved(part, r.filePath);
      } catch (e) {
        fs.rmSync(part, { force: true });
        throw e;
      }
      return { ok: true, path: r.filePath };
    },
    storageGetRoot() {
      return storageInfo({ root: state.root, appName: config.appName, repoRoot: config.repoRoot, packaged: app.isPackaged });
    },
    async storageRelocate({ newRoot }) {
      // Stop the server so nothing holds the database open, move, then ALWAYS bring a
      // server back — under the new root on success, the old one on failure.
      // Chromium's folder can only move with a restart, so a successful move relaunches.
      await stopServer();
      let moved = null;
      try {
        moved = await relocate({
          oldRoot: state.root,
          newRoot,
          appName: config.appName,
          packaged: app.isPackaged,
          repoRoot: config.repoRoot,
        });
      } catch (e) {
        await startServer();
        throw e;
      }
      if (!moved) {
        await startServer();
        return null;
      }
      state.quitting = true;
      app.relaunch();
      app.exit(0);
      return null;
    },
    setKeepRunning({ keepRunning }) {
      state.keepRunning = !!keepRunning;
      return null;
    },
    setTrayLabels({ labels }) {
      for (const [k, v] of Object.entries(labels || {})) if (k in state.trayLabels && v) state.trayLabels[k] = v;
      state.tray?.setContextMenu(buildTrayMenu());
      return null;
    },
    // The right-click menu's words in the app's language (CONTEXT_MENU_LABEL_IDS); a missing one
    // keeps electron-context-menu's English.
    setContextMenuLabels({ labels }) {
      for (const id of CONTEXT_MENU_LABEL_IDS) {
        if (typeof labels?.[id] === "string" && labels[id]) state.contextMenuLabels[id] = labels[id];
      }
      return null;
    },
    // The spellchecker's languages, most wanted first (JustWrite: the book's, then the
    // interface's): pickSpellLanguages maps each to one the spellchecker has. Returns the ones set
    // — none on macOS, where the system's spellchecker picks the language itself and the call
    // does nothing.
    setSpellCheckerLanguages({ languages }) {
      const ses = state.win?.webContents?.session;
      if (!ses || process.platform === "darwin") return [];
      const picked = pickSpellLanguages(languages, ses.availableSpellCheckerLanguages, ses.getSpellCheckerLanguages());
      if (picked.length) ses.setSpellCheckerLanguages(picked);
      return picked;
    },
    openExternal({ url }) {
      if (!/^(https?|mailto):/i.test(String(url))) throw new Error("only http(s) and mailto links open outside");
      return shell.openExternal(url);
    },
    async openPath({ path: p }) {
      const err = await shell.openPath(String(p));
      if (err) throw new Error(err);
      return null;
    },
    // The server's URL for the renderer's API base: at once when the server listens (or none
    // is starting), else once its start ends. A start that failed — another program or user held
    // the port, Windows reserved it, another server held the data folder, the server couldn't
    // start — is tried again first: the connection-error screen's Retry reloads the window, and
    // its boot asks here (P6, 2026-10-15 — that program may be closed by now, the drive plugged
    // in). A server stopped from the tray stays stopped.
    serverUrl() {
      const failed = state.portTaken || state.dataFolderInUse || state.portOtherUser || state.portReserved || state.serverError;
      if (!state.server && state.serverPhase !== "starting" && failed) void startServer();
      if (state.serverPhase !== "starting") return serverUrl();
      return new Promise((resolve) => urlWaiters.push(resolve));
    },
    // The server's URL and why its last start failed — {url, portTaken, dataFolderInUse,
    // portOtherUser, portReserved, serverError} — when it is known: at once, or once a start under
    // way ends. The renderer's connection-error screen asks. `portTaken`, `portOtherUser` (another
    // OS user's copy of the app) and `portReserved` (Windows reserved it) are port numbers;
    // `dataFolderInUse` and `serverError` (the server's first error line) are words.
    serverStatus() {
      const status = () => ({
        url: serverUrl(),
        portTaken: state.portTaken,
        dataFolderInUse: state.dataFolderInUse,
        portOtherUser: state.portOtherUser,
        portReserved: state.portReserved,
        serverError: state.serverError,
      });
      if (state.serverPhase !== "starting") return status();
      return new Promise((resolve) => urlWaiters.push(() => resolve(status())));
    },
    updateStatus() {
      return updateNow();
    },
    updateCheck() {
      return checkForUpdates();
    },
    async updateDownload() {
      const u = await loadUpdater();
      if (!u || update.state !== "available" || !update.canInstall) return updateNow();
      setUpdate({ state: "downloading", percent: 0 });
      u.downloadUpdate().catch((e) => setUpdate({ state: "error", error: firstLine(e) }));
      return updateNow();
    },
    async updateInstall() {
      // "Restart now": the server stops first, as on any quit; then the installer runs and the
      // app quits without the close handler stepping in.
      if (!updater || update.state !== "ready") return updateNow();
      await stopServer();
      state.quitting = true;
      // silently (/S), then the app starts again (--force-run). Without /S the family's assisted
      // NSIS installer shows its whole wizard ("Who should this application be installed for?") and
      // waits — measured on just-house-paint's 0.1.0 → 0.1.1 update, 2026-10-19; electron-updater's
      // install on quit is silent already (BaseUpdater: install(true, false)).
      updater.quitAndInstall(true, true);
      return null;
    },
  };
  for (const name of COMMANDS) {
    // Only the app's own page may call (the checklist's "validate the sender").
    ipcMain.handle(`shell:${name}`, (e, args) => {
      if (!fromHome(e.senderFrame?.url)) throw new Error(`shell:${name} refused: not the app's page`);
      return handlers[name](args || {});
    });
  }

  // Web permissions: the clipboard for every app, plus what the app names (JustVoice's
  // microphone), and only for the app's own page. Everything else is denied.
  const allowed = new Set(["clipboard-sanitized-write", "clipboard-read", ...(config.permissions || [])]);
  function guardPermissions() {
    const ses = session.defaultSession;
    ses.setPermissionRequestHandler((wc, permission, callback, details) => {
      callback(allowed.has(permission) && fromHome(details?.requestingUrl || wc?.getURL()));
    });
    ses.setPermissionCheckHandler((_wc, permission, requestingOrigin) => allowed.has(permission) && fromHome(requestingOrigin));
  }

  // ── boot ───────────────────────────────────────────────────────────────────
  // (not while the data root's message box waits for an answer: the app isn't set up yet)
  app.on("second-instance", () => !rootProblem && showWindow());
  // No page in these apps embeds a <webview>; refuse one outright.
  app.on("web-contents-created", (_e, contents) => {
    contents.on("will-attach-webview", (ev) => ev.preventDefault());
  });
  app.on("window-all-closed", () => {
    // Keep-running hides the window instead of closing it; anything else quits.
    if (!state.keepRunning) quitApp();
  });
  app.on("before-quit", (e) => {
    if (!state.quitting) {
      e.preventDefault();
      quitApp();
    }
  });
  // The data root can't be used (above): the user says what now, in Electron's message box
  // (electronjs.org/docs/latest/api/dialog#dialogshowmessageboxwindow-options), asked once the app is ready —
  // "Try again" (a drive plugged back in: the app starts again, its Chromium folder under the root), "Use the
  // default folder" (the Change-folder pointer goes — dataRoot.js useDefaultRoot — and the app goes on in it) or
  // "Quit". True when the app goes on.
  async function settleDataRoot() {
    const buttons = canUseDefault ? ["Try again", "Use the default folder", "Quit"] : ["Try again", "Quit"];
    for (;;) {
      const { response } = await dialog.showMessageBox({
        type: "warning",
        title: config.productName,
        message: cantUseDataDir(state.root, rootProblem),
        buttons,
        defaultId: 0,
        cancelId: buttons.length - 1,
        noLink: true,
      });
      const choice = buttons[response];
      if (choice === "Use the default folder") {
        state.root = useDefaultRoot({ appName: config.appName, repoRoot: config.repoRoot, packaged: app.isPackaged });
        rootProblem = null;
        console.log(`[shell] using the default data folder ${state.root}`);
        return true;
      }
      if (choice === "Try again") {
        rootProblem = dataRootProblem(state.root);
        if (rootProblem) continue;
        app.relaunch();
      }
      state.quitting = true;
      app.exit(0);
      return false;
    }
  }

  app.whenReady().then(async () => {
    if (rootProblem && !(await settleDataRoot())) return;
    protocol.handle("app", serveApp);
    guardPermissions();
    createWindow();
    createTray();
    await startServer();
    if (updatesOn) {
      checkForUpdates();
      // a copy left running for weeks hears of a release too: every six hours, and when the computer wakes (the
      // twelfth review, 2026-10-20 — electron-updater checks only when asked)
      setInterval(() => checkForUpdates({ quiet: true }).catch(() => {}), 6 * 3600_000).unref?.();
      // on wake the network is often not back yet: a moment later
      powerMonitor.on("resume", () => setTimeout(() => checkForUpdates({ quiet: true }).catch(() => {}), 30_000));
    }
  });
  return { state, startServer, stopServer, quitApp };
}
