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
//     Use the default folder (this start only), Quit (2026-10-20).
//   - Change folder copies the data into a new folder named for the app inside the one picked (or back
//     into the default folder), one move at a time: while it copies the server stays stopped, a start
//     already under way is checked again before it forks, and Quit is held. The old folder is never
//     removed by the app on its own — Storage shows the old copy and removes it when asked; a half copy
//     a stopped move left goes at the next start; the window's token is carried to the new folder
//     (dataRoot.js, 2026-10-20). While that sweep runs the start is busy: the page's serverUrl waits, the tray's
//     server items are off, Change folder and a server start refuse.
//   - A page with unsaved work (its `beforeunload` keeps it) is asked about before a reload, the window's close or
//     Quit — "Leave without saving?" Leave / Stay (Electron's `will-prevent-unload`, 2026-10-20); Stay keeps it.
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
//     app://; navigation away from the app and <webview> refused; permissions granted only to the
//     app's own page and only from an allow-list; every IPC call checked against the sender's
//     origin; one copy of the app at a time. The fuses are set per app at packaging
//     (package.json `build.electronFuses`).
//   - The app's own page may open another window of the app with plain `window.open` (2026-10-29, JustWrite's
//     "Open in new window"; a new tab in a browser): the same preload, isolation, sandbox, right-click menu, guards
//     and unsaved-work box. A second window closes alone; the main window's close (and any Quit) asks every window
//     first and closes them all (Electron's `outlivesOpener` default). Any other window.open is refused — a web page
//     opens in the browser.

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
import { cantUseDataDir, dataDirSource, samePath } from "../platform/data_paths.js";
import { portInUse } from "../platform/port.js";
import {
  appFolderName,
  CHROME_DIR,
  dataDirSetBy,
  dataIsElsewhere,
  dataRootProblem,
  dataFolderState,
  forgetOldCopy,
  forgetMovedTo,
  forgetPointer,
  MOVE_UNDER_WAY,
  oldCopiesInfo,
  oldCopyOf,
  relocate,
  removeOldCopy,
  resolveDataRoot,
  setByVariable,
  storageInfo,
  sweepUnfinishedMove,
  takeCarried,
  useDefaultRoot,
} from "./dataRoot.js";
import { buildCsp } from "./csp.js";
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
  "storageOldCopies",
  "storageRemoveOldCopy",
  "storageUseDefault",
  "storageForgetOldCopy",
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

/** The localStorage key the kit's sign-in keeps the window's access token under (packages/ui serverToken.js `KEY` —
 *  a kit test holds the two equal). The shell reads it at Change folder and carries it to the new folder. */
export const WINDOW_TOKEN_KEY = "just.serverToken";

/** What Change folder says while the start clears what a stopped move left (2026-10-20). */
export const SWEEP_UNDER_WAY = "The app is still clearing what a stopped move left — try again in a moment.";

/** What Quit (the window, the tray, an update's restart) says while Change folder copies (2026-10-20): held. */
export const QUIT_WHILE_MOVING = "The data is being moved — quit when it's done.";

// The longest a Quit waits for the window's page to let it close (its beforeunload) before closing it without it.
const CLOSE_WAIT_MS = 10_000;

// The longest a Change folder waits for a server start already under way to end (its own steps are bounded: the
// proxy 5 s, a stale server's stop 15 s; a server past that is stopped as any other).
const START_WAIT_MS = 60_000;

/** `home` with the access token a move carried, as the kit's sign-in address takes it (serverToken.js
 *  `adoptTokenFromAddress` — `?token=`, taken once and removed from the address). */
/** A menu's words as written: on Windows and Linux Electron reads "&" in a label as the mnemonic mark — the next letter
 *  underlined, the "&" gone ("Just AI i18n & DocGen" read "Just AI i18n  DocGen" in docgen's tray, 2026-10-29) — and
 *  "&&" is a literal one (electronjs.org/docs/latest/api/menu-item, `label`); macOS shows a label as it is. Every
 *  label the shell hands a menu goes through here. */
export function menuLabel(text, platform = process.platform) {
  return platform === "darwin" || typeof text !== "string" ? text : text.replace(/&/g, "&&");
}

/** A URL's origin as Chromium writes it — `scheme://host[:port]` — or null for one without a host (data:, about:,
 *  javascript:, file:///). Node's URL gives every scheme but http(s), ws(s), ftp and blob the opaque origin "null"
 *  (WHATWG), so `app://<id>/` compared as `new URL(u).origin` equalled data:, about:blank and another app's page
 *  (2026-10-29, found by web-fc; measured in Electron 44.10: `senderFrame.origin` reads "app://probe" there). */
export function originOf(url) {
  try {
    const u = new URL(url);
    return u.host ? `${u.protocol}//${u.host}` : null;
  } catch {
    return null;
  }
}

export function withCarriedToken(home, token) {
  if (!token) return home;
  const u = new URL(home);
  u.searchParams.set("token", token);
  return u.toString();
}

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
  // the box a page's unsaved work gets (will-prevent-unload) — the app sends these in its language with the tray's
  unloadTitle: "Leave without saving?",
  unloadDetail: "Your changes on this page aren't saved yet — they're lost if you leave now.",
  unloadLeave: "Leave",
  unloadStay: "Stay",
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
 *   cspAdd        sources added to a directive, e.g. {"img-src": ["https:"]} — one the default lists, or one it
 *                 doesn't, which then holds exactly these ({"frame-src": ["http://127.0.0.1:*"]}: docgen's frame of
 *                 its own server's page); see csp.js
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
    // Change folder is copying the data (2026-10-20): one move at a time — a second is refused, the server isn't
    // started (it would open the old folder mid-copy; a start already waiting checks again before it forks), the
    // tray's server items are off, and Quit is held.
    moving: false,
    // the start's sweep of what a stopped move left runs: the start is busy (setSweeping)
    sweeping: false,
    // a Quit closing the window through its page's beforeunload (quitApp)
    quitStarted: false,
    closingForQuit: false,
    onUnloadStayed: null,
    // This start uses the default folder because the folder Change folder's pointer names can't be used ("Use the
    // default folder", this start only): {folder} — Storage offers "Use the default folder from now on".
    defaultThisStart: null,
    // The window was reloaded because another server took the data folder over: its boot shows why (the
    // connection page) instead of starting a server that would only meet the same lock.
    skipRetry: false,
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
  // Folder Access, a folder the user named that isn't there (never made empty in its place), or a path given in
  // the variable that the native code can't take — is said before anything lands in it (2026-10-20: the mkdir
  // below threw Electron's "JavaScript error in the main process" dialog). Until the
  // user answers (`settleDataRoot`, once the app is ready), Chromium's folder goes under the default folder — the
  // one "Use the default folder" goes on in — or, when that can't be used either, the system's temp folder.
  let rootProblem = dataRootProblem(state.root);
  let canUseDefault = false;
  let chromeHome = state.root;
  // the window's access token a move carried here (dataRoot.js takeCarried): its first page signs in with it
  let carriedToken = null;
  const ladder = { appName: config.appName, repoRoot: config.repoRoot, packaged: app.isPackaged };
  if (rootProblem) {
    console.warn(`[shell] ${cantUseDataDir(state.root, rootProblem)}`);
    const def = storageInfo({ root: state.root, ...ladder }).default;
    canUseDefault = !samePath(def, state.root) && !dataRootProblem(def);
    chromeHome = canUseDefault ? def : path.join(os.tmpdir(), `${config.id}-start`);
  }
  const chromeDir = path.join(chromeHome, CHROME_DIR);
  fs.mkdirSync(chromeDir, { recursive: true });
  for (const k of ["userData", "sessionData", "crashDumps", "logs"]) app.setPath(k, path.join(chromeDir, k === "userData" ? "" : k));
  if (process.platform === "win32") app.setAppUserModelId(`com.${config.id}.app`);

  // One copy per data folder (the lock lives in userData, set just above): a second launch
  // would evict the first copy's server from the port. It hands over and quits; the first
  // shows its window (the "second-instance" handler at boot). Taken BEFORE anything looks at what a move left (the
  // sixteenth review, measured: a second launch during Change folder swept the copy under way, and once the pointer
  // committed to an emptied folder).
  if (!app.requestSingleInstanceLock()) {
    app.quit();
    return null;
  }
  // the token a move carried here: only the copy that holds the lock takes it (once ready — `whenReady` — a half copy
  // a stopped move left is swept, before the server starts)
  if (!rootProblem) {
    try {
      carriedToken = takeCarried(state.root);
    } catch (e) {
      console.warn(`[shell] the carried token couldn't be read: ${e?.message || e}`);
    }
  }

  // The page the window loads, and so the one origin trusted with permissions and IPC: a URL by its scheme and host
  // (originOf), an IPC sender by Chromium's own origin (the checklist's "Validate the sender of all IPC messages").
  const devUrl = !app.isPackaged ? config.devUrl || process.env.DEV_URL || null : null;
  const home = devUrl || `app://${config.id}/index.html`;
  const homeOrigin = originOf(home);
  const fromHome = (url) => originOf(url) === homeOrigin;

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

  /** A start held off by Change folder (its copy runs): the start ends without a server, and whoever waits on it
   *  (the window's `serverUrl`, the move itself) hears so. */
  function heldByMove() {
    if (!state.server && state.serverPhase === "starting") {
      state.serverPhase = "off";
      settleServerUrl();
    }
    console.warn("[shell] the data folder is being moved — the server starts when the move ends");
  }

  /** Resolves when no start is under way (a server that listens, or a start that ended), or after `ms`. */
  function startSettled(ms) {
    if (state.serverPhase !== "starting") return Promise.resolve();
    return new Promise((resolve) => {
      const t = setTimeout(resolve, ms);
      urlWaiters.push(() => {
        clearTimeout(t);
        resolve();
      });
    });
  }

  async function startServer({ evicted = false } = {}) {
    if (state.sweeping) return console.warn("[shell] what a stopped move left is being cleared — the server starts when that is done");
    if (state.server || (state.serverPhase === "starting" && !evicted)) return;
    if (state.moving) return heldByMove();
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
    // Change folder began while this start waited (the port's owner, a stale server's stop, the proxy): it must not
    // open the old folder mid-copy (the fifteenth review, measured) — checked again right before the fork
    if (state.moving) return heldByMove();
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
        guardPort(null);
        console.log(`[shell] server listening on ${m.port}`);
        settleServerUrl();
      } else if (m?.type === "listen-failed") {
        listenFailed(m, evicted);
      } else if (m?.type === "data-folder-locked") {
        // Another server of this app has the data folder open — found at the start, or taking the
        // folder's lock over while ours ran: ours stops, and the renderer's connection-error screen
        // says so. Taken over while ours served (2026-10-20): the window, which knew nothing of it, is
        // reloaded and shows the connection page's reason.
        const serving = state.serverPhase === "ready";
        state.dataFolderInUse = dataFolderInUse(config.productName, m.dataDir);
        console.warn(`[shell] ${state.dataFolderInUse}`);
        stopServer().then(() => {
          if (!serving || state.quitting || !state.win || state.win.isDestroyed()) return;
          state.skipRetry = true;
          state.win.webContents.reload();
        });
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

  // Our own server couldn't listen on its port: whatever answers there isn't ours — another OS user's copy of the
  // app (its data is theirs; it answers as this app, and the window would boot on it), or one the 500 ms health
  // probe couldn't name (a busy server reads as "port taken"). The window's requests to that port are refused
  // (Electron's webRequest.onBeforeRequest — electronjs.org/docs/latest/api/web-request) from the failed listen
  // until our own server listens (`port` null); the connection-error screen says why (`serverStatus`).
  let guardedPort = null;
  function guardPort(port) {
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
    // whatever holds it isn't our server: the window stays off it until ours listens (before the probe — it waits)
    guardPort(port);
    const who = code === "EADDRINUSE" ? await whoAnswers(port) : null;
    const ours = who === "mine" && !evicted;
    if (!ours) {
      Object.assign(state, listenFailure(code, port, who));
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

  // ── app:// — the built UI, with a written CSP (csp.js: the default, an app's cspAdd, or its own csp) ──────────
  const csp = buildCsp({ csp: config.csp, cspAdd: config.cspAdd });

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

  // every window of the app: the same page rules (the second windows window.open makes included)
  const webPreferences = () => ({
    preload: config.preload || path.join(import.meta.dirname, "preload.js"),
    contextIsolation: true,
    sandbox: true,
    nodeIntegration: false,
  });
  // the screen a window opens on: no bigger than its work area, its minimum included — a 960 × 700 minimum is taller
  // than a 1280 × 720 screen's work area (1080p at 150 %), and the window hung under the taskbar unable to shrink
  // (just-house-paint's eleventh review, measured 2026-10-20)
  const fit = (n, max) => (n ? Math.min(n, max) : n);

  /** The right-click menu Electron doesn't draw by itself (2026-10-18; electron-context-menu, the pattern
   *  electronjs.org/docs/latest/tutorial/spellchecker shows): spelling suggestions, Add to dictionary (the user's own
   *  act), cut/copy/paste, copy link or image. No web search — nothing leaves the app unasked — and no macOS Look Up. A
   *  page with its own menu (JustWrite's editor) cancels the browser's and never gets this one. */
  function addContextMenu(win) {
    contextMenu({
      window: win,
      labels: state.contextMenuLabels,
      showSearchWithGoogle: false,
      showLookUpSelection: false,
    });
  }

  /** Unsaved work (2026-10-20, the eighteenth review: closing, a reload or Quit dropped a house's unsaved colors
   *  silently): the page keeps its `beforeunload`, and Electron asks here — its documented pattern
   *  (electronjs.org/docs/latest/api/web-contents#event-will-prevent-unload: preventDefault lets the page unload). Leave
   *  lets it go; Stay keeps the page, and a Quit under way stops. True when the user stayed. */
  function askBeforeUnload(win, event) {
    const L = state.trayLabels;
    // the box is the window's: a hidden window (the tray's Quit with keep-running on) shows first — else its box
    // isn't seen and the app waits on it
    if (win.isMinimized?.()) win.restore();
    if (!win.isVisible?.()) win.show();
    win.focus?.();
    const choice = dialog.showMessageBoxSync(win, {
      type: "question",
      title: config.productName,
      message: L.unloadTitle,
      detail: L.unloadDetail,
      buttons: [L.unloadLeave, L.unloadStay],
      defaultId: 1,
      cancelId: 1,
      noLink: true,
    });
    if (choice === 0) {
      event.preventDefault();
      return false;
    }
    state.onUnloadStayed?.();
    return true;
  }

  /** Where the app's pages may go: another window of the app (window.open of its own page — the window-open handler's
   *  `allow` with the window's own options; electronjs.org/docs/latest/api/window-open, where the preload isn't
   *  inherited), a web page in the browser, nothing else. Set on every page's webContents (the checklist's
   *  `web-contents-created` pattern), so a second window has the same guards. */
  function guardPage(contents) {
    contents.setWindowOpenHandler(({ url }) => {
      if (fromHome(url)) {
        const w = config.window || {};
        const area = screen.getPrimaryDisplay().workAreaSize;
        // no width or height: the page's own (window.open's features) or Electron's 800 × 600 — this override would
        // beat the page's; never below the app's minimum
        return {
          action: "allow",
          overrideBrowserWindowOptions: {
            title: w.title || config.productName,
            minWidth: fit(w.minWidth, area.width),
            minHeight: fit(w.minHeight, area.height),
            backgroundColor: w.backgroundColor,
            icon: config.icon,
            autoHideMenuBar: true,
            webPreferences: webPreferences(),
          },
        };
      }
      if (/^https?:/i.test(url)) shell.openExternal(url);
      return { action: "deny" };
    });
    contents.on("will-navigate", (e, url) => {
      if (!fromHome(url)) {
        e.preventDefault();
        if (/^https?:/i.test(url)) shell.openExternal(url);
      }
    });
    // a second window: its menu and its unsaved-work box; it closes alone (the main window's close closes it —
    // Electron's `outlivesOpener` default — after a Quit has asked it, closeAllForQuit)
    contents.on("did-create-window", (child) => {
      addContextMenu(child);
      child.webContents.on("will-prevent-unload", (event) => askBeforeUnload(child, event));
    });
  }

  function createWindow() {
    const w = config.window || {};
    const saved = loadWindowState();
    const area = (saved?.x !== undefined && saved?.y !== undefined ? screen.getDisplayMatching({ x: saved.x, y: saved.y, width: saved.width || 1, height: saved.height || 1 }) : screen.getPrimaryDisplay()).workAreaSize;
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
      webPreferences: webPreferences(),
    });
    if (saved?.maximized) win.maximize();
    win.once("ready-to-show", () => win.show());
    addContextMenu(win);
    let holding = false;
    win.on("close", (e) => {
      saveWindowState(win);
      // (Quit closes the window itself first — through the page's beforeunload, below — and lets this close go)
      if (state.quitting || state.closingForQuit) return;
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
      // a window closed by a quit (or by the user) before it drew didn't fail to draw
      if (win.isDestroyed() || state.quitting || state.closingForQuit) return;
      console.log("[shell] window failed: the app never drew its layout and first page");
    });
    // its unsaved work asks (askBeforeUnload); Stay ends a close it was holding for
    win.webContents.on("will-prevent-unload", (event) => {
      if (askBeforeUnload(win, event)) holding = false;
    });
    // the first page after a Change folder signs in with the token the old folder's profile kept (once)
    win.loadURL(withCarriedToken(home, carriedToken));
    carriedToken = null;
    state.win = win;
    return win;
  }

  function showWindow() {
    if (!state.win || state.win.isDestroyed()) createWindow();
    state.win.show();
    state.win.focus();
  }
  // the tray's words go to the main window (it is shown first); an update's status to every window of the app
  const send = (channel, ...args) => state.win && !state.win.isDestroyed() && state.win.webContents.send(channel, ...args);
  const sendAll = (channel, ...args) => {
    for (const w of BrowserWindow.getAllWindows()) if (!w.isDestroyed()) w.webContents.send(channel, ...args);
  };

  // ── the tray ───────────────────────────────────────────────────────────────
  function buildTrayMenu() {
    const L = state.trayLabels;
    // off while Change folder copies (Electron's MenuItem `enabled` — electronjs.org/docs/latest/api/menu-item):
    // the server must not open the old folder mid-copy
    const serverItems = !state.moving && !state.sweeping;
    const items = [
      { label: L.show, click: showWindow },
      { label: L.hide, click: () => state.win?.hide() },
      { type: "separator" },
      { label: L.serverStart, enabled: serverItems, click: () => startServer() },
      { label: L.serverStop, enabled: serverItems, click: () => stopServer() },
      {
        label: L.serverRestart,
        enabled: serverItems,
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
    return Menu.buildFromTemplate(items.map((item) => (item.label ? { ...item, label: menuLabel(item.label) } : item)));
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

  /** Change folder copying, or done: the tray's server items follow (its menu built again — Linux shows a
   *  changed menu only when it is set again). */
  function setMoving(on) {
    state.moving = on;
    state.tray?.setContextMenu(buildTrayMenu());
  }
  /** The start's sweep of what a stopped move left runs (2026-10-20, the eighteenth review: a server the tray started
   *  meanwhile ran on the half copy being removed, and the page gave up on the server while it waited): the start is
   *  busy — the page's `serverUrl` / `serverStatus` wait (the phase reads "starting"), the tray's server items are off,
   *  a server isn't started, Change folder refuses. */
  function setSweeping(on) {
    state.sweeping = on;
    if (on) state.serverPhase = "starting";
    else if (!state.server && state.serverPhase === "starting") state.serverPhase = "off";
    state.tray?.setContextMenu(buildTrayMenu());
  }

  // Quit while Change folder copies is held (2026-10-20): a stop midway left a half copy for good — said in a box
  // (one at a time), the app goes on; the move's own relaunch ends it.
  let quitHeld = false;
  async function holdQuit() {
    if (quitHeld) return;
    quitHeld = true;
    const options = { type: "info", title: config.productName, message: QUIT_WHILE_MOVING, detail: "The app restarts on the new folder when the move finishes.", buttons: ["OK"], noLink: true };
    try {
      await (state.win && !state.win.isDestroyed() ? dialog.showMessageBox(state.win, options) : dialog.showMessageBox(options));
    } catch {
      /* no box: the move goes on */
    } finally {
      quitHeld = false;
    }
  }

  async function quitApp() {
    if (state.quitting || state.quitStarted) return;
    if (state.moving) return holdQuit();
    state.quitStarted = true;
    // the windows close first, each through its page's beforeunload (the box above): Stay keeps the page — and the app
    if (!(await closeAllForQuit())) {
      state.quitStarted = false;
      return;
    }
    state.quitting = true;
    await stopServer();
    app.quit();
  }

  /** Every window of the app closed for a Quit, the second windows first, then the main one: true once all have, false
   *  when a page kept its window (Stay) — the rest stay as they are. (A second window still open when the server
   *  stops could still keep app.quit() — the nineteenth review's Restart-now bug, for two windows.) */
  async function closeAllForQuit() {
    for (const w of BrowserWindow.getAllWindows()) {
      if (w === state.win || w.isDestroyed()) continue;
      if (!(await closeForQuit(w))) return false;
    }
    const win = state.win && !state.win.isDestroyed() ? state.win : null;
    return !win || closeForQuit(win);
  }

  /** Close `win` for a Quit: true once it has closed, false when its page kept it (Stay). Chromium itself closes a
   *  page whose beforeunload doesn't run within about a second — one busy with a long paint is closed without asking
   *  (measured, Electron 44: a page busy 12 s, Quit, the app gone at 1.3 s; the nineteenth review's e5_busy). The
   *  CLOSE_WAIT_MS fallback is for a close that neither ends nor asks (never seen); the box, while up, holds the main
   *  process, and that time isn't counted until it is answered. */
  function closeForQuit(win) {
    return new Promise((resolve) => {
      let timer = null;
      const done = (closed) => {
        if (timer === false) return;
        clearTimeout(timer);
        timer = false;
        state.closingForQuit = false;
        state.onUnloadStayed = null;
        win.off?.("closed", onClosed);
        resolve(closed);
      };
      const onClosed = () => done(true);
      state.closingForQuit = true;
      state.onUnloadStayed = () => done(false);
      win.once("closed", onClosed);
      timer = setTimeout(() => {
        if (timer !== false && !win.isDestroyed()) win.destroy();
      }, CLOSE_WAIT_MS);
      win.close();
    });
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
    sendAll("update:status", updateNow());
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

  // ── the data folder's moves ────────────────────────────────────────────────
  /** Where the data is when this start runs elsewhere — on the default folder this time ("Use the default folder"),
   *  or on the old copy a move left — or null. */
  async function dataElsewhere() {
    if (state.defaultThisStart) return { ...(await dataFolderState(state.defaultThisStart.folder, { source: state.defaultThisStart.source })), oldCopy: false };
    const o = await oldCopyOf(state.root);
    return o ? { folder: o.root, connected: o.connected, problem: o.problem, oldCopy: true } : null;
  }
  /** No move from here (2026-10-20, the sixteenth review): while the data is elsewhere — a move would leave it known
   *  nowhere — or while the data-dir variable names the folder (the next start ignores a pointer). Throws the words. */
  async function refuseMoveHere() {
    const setBy = dataDirSetBy({ dataDirEnv: config.dataDirEnv });
    const elsewhere = await dataElsewhere();
    if (elsewhere) throw new Error(dataIsElsewhere({ ...elsewhere, setBy }));
    if (setBy) throw new Error(setByVariable(setBy));
  }
  /** The window's access token, read from its page (the kit's sign-in keeps it in localStorage under
   *  WINDOW_TOKEN_KEY — serverToken.js): it lives in the old folder's Chromium profile, and a move carries it to the
   *  new one, so no app has to pass it (docgen passes none). Null when there is none or the page doesn't answer. */
  async function windowToken() {
    const wc = state.win && !state.win.isDestroyed() ? state.win.webContents : null;
    if (!wc) return null;
    try {
      const read = wc.executeJavaScript(`(() => { try { return localStorage.getItem(${JSON.stringify(WINDOW_TOKEN_KEY)}); } catch { return null; } })()`, true);
      const v = await Promise.race([read, new Promise((r) => setTimeout(() => r(null), 2000))]);
      return typeof v === "string" && v ? v : null;
    } catch {
      return null;
    }
  }

  // ── the renderer's commands ────────────────────────────────────────────────
  const handlers = {
    // (a file dialog opens on the window that asked — the second windows window.open makes included)
    async pickDirectory({ title, defaultPath } = {}, win = state.win) {
      const r = await dialog.showOpenDialog(win, {
        title: title || "Choose a folder",
        defaultPath: defaultPath || undefined,
        properties: ["openDirectory", "createDirectory"],
      });
      return r.canceled || !r.filePaths.length ? null : r.filePaths[0];
    },
    async pickFile({ title, filterName, filterExt, defaultDir } = {}, win = state.win) {
      const r = await dialog.showOpenDialog(win, {
        title: title || "Open a file",
        defaultPath: defaultDir || undefined,
        properties: ["openFile"],
        filters: filterExt ? [{ name: filterName || filterExt, extensions: [String(filterExt).replace(/^\./, "")] }] : [],
      });
      if (r.canceled || !r.filePaths.length) return null;
      const p = r.filePaths[0];
      return { name: path.basename(p), dir: path.dirname(p), dataBase64: fs.readFileSync(p).toString("base64") };
    },
    async saveFile({ bytes, suggestedName, title, filterName, filterExt, defaultDir } = {}, win = state.win) {
      const r = await dialog.showSaveDialog(win, {
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
    async saveFromUrl({ url, headers, suggestedName, title, filterName, filterExt, defaultDir } = {}, win = state.win) {
      const base = serverUrl();
      if (!base || typeof url !== "string" || !url.startsWith(`${base}/`)) throw new Error("saveFromUrl: only this app's server's files");
      const r = await dialog.showSaveDialog(win, {
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
    // The Storage panel's facts: {root, default, portable} (JustWrite's shape), `atDefault` (the data is in the
    // default folder — no "Move back"), `folderName` — the folder Change folder makes inside the one picked —,
    // `defaultThisStart` ({folder} while this start uses the default folder because the pointer's folder can't be
    // used, else null), `setBy` (the data-dir variable's name while it names the folder: no Change folder — its
    // pointer would be ignored) and `oldCopyOf` ({root, movedAt, connected, problem} when this folder holds the old
    // copy a move left: the app runs on stale data); `defaultThisStart` carries `connected` and `problem` too
    // (dataRoot.js `dataFolderState`: connected — the data's folder passes the start's check now, a restart takes the
    // app to it; problem — there, and that check's words). Asked asynchronously, in time (an offline share never holds
    // the window).
    async storageGetRoot() {
      const info = storageInfo({ root: state.root, ...ladder });
      const dts = state.defaultThisStart;
      return {
        ...info,
        atDefault: samePath(info.root, info.default),
        folderName: appFolderName(config.productName, config.appName),
        // "connected" only when the folder passes the start's check (else its words)
        defaultThisStart: dts ? await dataFolderState(dts.folder, { source: dts.source }) : null,
        setBy: dataDirSetBy({ dataDirEnv: config.dataDirEnv }),
        oldCopyOf: await oldCopyOf(state.root),
      };
    },
    async storageRelocate({ newRoot, token }) {
      // Stop the server so nothing holds the database open, move, then ALWAYS bring a
      // server back — under the new root on success, the old one on failure.
      // Chromium's folder can only move with a restart, so a successful move relaunches.
      // One move at a time: while one copies, a second is refused and the server stays stopped (`moving`).
      // Not while the data-dir variable names the folder: the next start would ignore the pointer; nor while this
      // start runs on the default folder this time or on an old copy — the data is elsewhere, and a move from here
      // would leave it known nowhere (2026-10-20, the sixteenth review, measured).
      if (state.sweeping) throw new Error(SWEEP_UNDER_WAY);
      await refuseMoveHere();
      if (state.moving) throw new Error(MOVE_UNDER_WAY);
      setMoving(true);
      let moved = null;
      try {
        // a start already under way ends first: it checks `moving` again before it forks, and one that forked
        // is stopped once it listens (or fails) — never killed midway through opening the database
        await startSettled(START_WAIT_MS);
        await stopServer();
        // into a new folder named for the app inside the one picked, or back into the default folder (dataRoot.js
        // relocate); the window's token goes with it
        moved = await relocate({
          oldRoot: state.root,
          newRoot,
          appName: config.appName,
          folderName: config.productName,
          packaged: app.isPackaged,
          repoRoot: config.repoRoot,
          token: typeof token === "string" && token ? token : await windowToken(),
        });
      } catch (e) {
        setMoving(false);
        await startServer();
        throw e;
      }
      if (!moved) {
        setMoving(false);
        await startServer();
        return null;
      }
      state.quitting = true;
      app.relaunch();
      app.exit(0);
      return null;
    },
    // The old copies a move left (dataRoot.js oldCopiesInfo): [{root, bytes, …, cause?}] — Storage shows each with
    // Remove, one not found with why and Forget; `again` (its Try again): the ones that didn't answer looked at now.
    storageOldCopies({ again = false } = {}) {
      return oldCopiesInfo(state.root, { again: again === true });
    },
    // "Remove the old copy": only what the move copied from `root`, never the folder in use; the list after.
    async storageRemoveOldCopy({ root }) {
      if (state.moving) throw new Error(MOVE_UNDER_WAY);
      await removeOldCopy(state.root, String(root || ""));
      return oldCopiesInfo(state.root);
    },
    // "Forget": the record of an old copy that can't be found is dropped — nothing on any drive is touched.
    storageForgetOldCopy({ root }) {
      if (state.moving) throw new Error(MOVE_UNDER_WAY); // the move carries this record to the new folder
      forgetOldCopy(state.root, String(root || ""));
      return oldCopiesInfo(state.root);
    },
    // "Use the default folder from now on" (while this start uses it — `defaultThisStart`): the pointer forgotten.
    async storageUseDefault() {
      const setBy = dataDirSetBy({ dataDirEnv: config.dataDirEnv });
      if (setBy) throw new Error(setByVariable(setBy));
      const elsewhere = await dataElsewhere();
      if (!elsewhere) return null;
      // the pointer forgotten, and this folder's record of where its data went: it is the data folder now
      forgetPointer(ladder);
      forgetMovedTo(state.root);
      console.log(`[shell] the data folder ${elsewhere.folder} is forgotten — ${state.root} from now on`);
      state.defaultThisStart = null;
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
        if (typeof labels?.[id] === "string" && labels[id]) state.contextMenuLabels[id] = menuLabel(labels[id]);
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
      // (not on the reload after another server took the folder over: the page shows why first; its Retry tries)
      if (!state.server && state.serverPhase !== "starting" && failed && !state.skipRetry) void startServer();
      state.skipRetry = false;
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
      // not while Change folder copies: the restart would stop it midway
      if (state.moving) {
        void holdQuit();
        return updateNow();
      }
      // the window's page first, as for any Quit: unsaved work asks, and Stay keeps the app as it is (the nineteenth
      // review: Restart now stopped the server and quit past the page's check — Stay left a window with no server)
      if (state.quitStarted) return updateNow();
      state.quitStarted = true;
      if (!(await closeAllForQuit())) {
        state.quitStarted = false;
        return updateNow();
      }
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
    // Only the app's own page may call (the checklist's "validate the sender": Chromium's origin of the frame, never
    // its URL's — Node reads every app:// URL's origin as "null"); the window it asked from is the dialogs' parent.
    ipcMain.handle(`shell:${name}`, (e, args) => {
      if (!e.senderFrame || e.senderFrame.origin !== homeOrigin) throw new Error(`shell:${name} refused: not the app's page`);
      return handlers[name](args || {}, (e.sender && BrowserWindow.fromWebContents(e.sender)) || state.win);
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
  // (only a window that exists: one made here before the app:// handler and the start's own window made two —
  // measured in real Electron, the seventeenth review)
  app.on("second-instance", () => {
    if (rootProblem || !state.win || state.win.isDestroyed()) return;
    state.win.show();
    state.win.focus();
  });
  // Every page's guards (guardPage), its second windows' included. No page in these apps embeds a <webview>; refuse one
  // outright.
  app.on("web-contents-created", (_e, contents) => {
    guardPage(contents);
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
  // default folder" (for this start only — the Change-folder pointer is kept, so the data stays where it is and
  // the next start asks again: dataRoot.js useDefaultRoot; the box's `detail` says so) or "Quit". True when the
  // app goes on.
  async function settleDataRoot() {
    const buttons = canUseDefault ? ["Try again", "Use the default folder", "Quit"] : ["Try again", "Quit"];
    const def = useDefaultRoot({ appName: config.appName, repoRoot: config.repoRoot, packaged: app.isPackaged });
    for (;;) {
      const { response } = await dialog.showMessageBox({
        type: "warning",
        title: config.productName,
        message: cantUseDataDir(state.root, rootProblem),
        ...(canUseDefault
          ? {
              detail: `"Use the default folder" opens the app on ${def} for this time only. Your data stays in ${state.root}, and the app asks again at its next start.`,
            }
          : {}),
        buttons,
        defaultId: 0,
        cancelId: buttons.length - 1,
        noLink: true,
      });
      const choice = buttons[response];
      if (choice === "Use the default folder") {
        console.log(`[shell] using the default data folder ${def} for this start — the data folder ${state.root} is kept`);
        // where the data is: Storage says so and offers no move from here; a pointer's folder may be forgotten ("Use
        // the default folder from now on"), the variable's is the user's to change where it is set
        // (and where it came from: the start's own check of it, by its source, says whether it can be used)
        state.defaultThisStart = { folder: state.root, source: dataDirSource(state.root) };
        state.root = def;
        rootProblem = null;
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
    // the window and the tray first (a long sweep of a big half copy leaves the user no window otherwise, and a second
    // launch meanwhile made another — the seventeenth review); the server once nothing is left of a stopped move (a
    // half copy in a folder this start doesn't run on, or — a "Use the default folder" start — in this one; never a
    // committed move's — dataRoot.js sweepUnfinishedMove)
    setSweeping(true);
    await sweepUnfinishedMove(state.root, ladder).catch((e) => console.warn(`[shell] the last move's leftovers couldn't be checked: ${e?.message || e}`));
    setSweeping(false);
    await startServer();
    // a page that asked during the sweep hears once no start is under way (a start that didn't begin — the variable
    // that runs no server — would leave it waiting)
    if (state.serverPhase !== "starting") settleServerUrl();
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
