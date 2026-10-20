// SPDX-License-Identifier: MIT
// native.js — this app's calls into its desktop shell (app-structure §Q.2, §5).
//
// The family shape, the same file in every app: one export per shell command, so a command's name
// as a string exists in exactly one place. The shell is the kit's runDesktopApp; this file is the
// ONLY reader of its one preload object, `window.appShell` (`invoke(command, args)`,
// `on(event, fn)`, `versions`), and the one place that asks the kit's `isDesktopShell()` (the
// guard's checks 12–13). Commands throw on failure and callers use try/catch; a cancelled dialog
// resolves null. Outside the desktop app (the dev server in a browser, the headless server's UI)
// every call answers the browser's way: null or a no-op.
// Donors: docgen's src/services/native.js, plus JustWrite's saveFile / shellServerUrl /
// shellServerStatus / shellVersion.

import { isDesktopShell } from "@delebash/ui";

/** Is a desktop shell there to answer? The kit owns the one test. */
export const hasShell = () => isDesktopShell() && !!window.appShell;

const call = (command, args) => window.appShell.invoke(command, args);

/** The desktop runtime's version (Electron's) for About, or "" outside the shell. */
export const shellVersion = () => (hasShell() ? window.appShell.versions?.electron || "" : "");

// ─── Native dialogs ──────────────────────────────────────────────────

/** Folder picker. Resolves the chosen path, or null if the user cancelled. */
export function pickDirectory({ title, defaultPath } = {}) {
  if (!hasShell()) return Promise.resolve(null);
  return call("pickDirectory", { title, defaultPath }).catch(() => null);
}

/** Save-as for a file the app makes (the backup) — wired once into the kit's saveBlob in the
 *  boot file (configureFileSave). Resolves `{ ok, path }`, or null if the user cancelled. */
export async function saveFile({ blob, suggestedName, title, filterName, filterExt, defaultDir }) {
  if (!hasShell()) return null;
  const bytes = new Uint8Array(await blob.arrayBuffer());
  return call("saveFile", { bytes, suggestedName, title, filterName, filterExt, defaultDir });
}

/** "Save as" for a file the app's own server makes (a backup): the shell streams it from the server to the
 *  chosen file — the window never holds it (configureFileSave's `saveUrl`). Resolves `{ ok, path }`, or null
 *  if the user cancelled. */
export function saveFromUrl({ url, headers, suggestedName, title, filterName, filterExt, defaultDir }) {
  if (!hasShell()) return Promise.resolve(null);
  return call("saveFromUrl", { url, headers, suggestedName, title, filterName, filterExt, defaultDir });
}

// ─── The portable data root ──────────────────────────────────────────

/** `{ root, default, portable, atDefault, folderName, defaultThisStart }`, or null outside the shell. */
export function storageGetRoot() {
  if (!hasShell()) return Promise.resolve(null);
  return call("storageGetRoot").catch(() => null);
}

/** MOVE all app data to `newRoot` (a new folder for the app inside it, or the default folder itself). Throws on
 *  failure. On success the app restarts itself (Chromium's own files live under the data root and can only move
 *  with a restart), so nothing after this call runs. Pick the folder with `pickDirectory` first. `token`: the
 *  window's access token, carried to the new folder. */
export function storageRelocate(newRoot, { token } = {}) {
  return call("storageRelocate", { newRoot, token });
}

/** The old copies earlier moves left: `[{ root, bytes, connected, cause? }]` ([] outside the shell). `{ again: true }`
 *  (Storage's Try again): the ones that didn't answer are looked at now. */
export function storageOldCopies(options = {}) {
  if (!hasShell()) return Promise.resolve([]);
  return call("storageOldCopies", options);
}

/** Remove the old copy in `root` — only what the move copied. Throws on failure; resolves the list after. */
export function storageRemoveOldCopy(root) {
  return call("storageRemoveOldCopy", { root });
}

/** Forget the old copy in `root` (one that isn't found): its record goes, nothing on any drive is touched. Resolves
 *  the list after. */
export function storageForgetOldCopy(root) {
  return call("storageForgetOldCopy", { root });
}

/** "Use the default folder from now on": the folder this start couldn't use is forgotten. */
export function storageUseDefault() {
  return call("storageUseDefault");
}

// ─── The server's address ────────────────────────────────────────────

/** The desktop app's server URL (`http://127.0.0.1:<port>`): the shell answers once the server is
 *  up, or once its start ended — and asked after a start that failed, it starts the server again
 *  (the connection screen's Retry). Null outside the shell. */
export function shellServerUrl() {
  if (!hasShell()) return Promise.resolve(null);
  return call("serverUrl").catch(() => null);
}

/** Why the desktop app's server didn't start, when its shell knows: `{url, portTaken,
 *  dataFolderInUse}`. Null outside the shell. */
export function shellServerStatus() {
  if (!hasShell()) return Promise.resolve(null);
  return call("serverStatus").catch(() => null);
}

// ─── The shell's own switches ────────────────────────────────────────

/** The family headless ruling (2026-08-04): keep the server up when the window closes. */
export function setKeepRunning(keepRunning) {
  if (!hasShell()) return Promise.resolve();
  return call("setKeepRunning", { keepRunning: !!keepRunning }).catch(() => {});
}

/** The tray menu's words (the kit's shellTrayLabels) — the shell holds only English until the app
 *  sends them, at start and on every language switch (layouts/MainLayout.vue). */
export function setTrayLabels(labels) {
  if (!hasShell()) return Promise.resolve();
  return call("setTrayLabels", { labels }).catch(() => {});
}

/** The right-click menu's words (the kit's shellMenuLabels) — the menu the shell draws for spelling
 *  suggestions and cut/copy/paste; without them it speaks English. */
export function setContextMenuLabels(labels) {
  if (!hasShell()) return Promise.resolve();
  return call("setContextMenuLabels", { labels }).catch(() => {});
}

// ─── Openers (handed to the kit's installLlmUi as `external`) ────────

/** Open a web link in the user's browser. */
export function openUrl(url) {
  return call("openExternal", { url });
}

/** Show a local folder (or file) in the OS file manager. */
export function openPath(path) {
  return call("openPath", { path });
}

// ─── The shell's pushes (the tray) ───────────────────────────────────

/** Subscribe to a shell event (`tray:open-settings`, `tray:about`, `tray:copy-url`). Returns the
 *  unsubscribe function; outside the shell, a no-op. */
export function onShellEvent(event, fn) {
  if (!hasShell()) return () => {};
  return window.appShell.on(event, fn);
}

// ─── Updates (the shell's electron-updater) ──────────────────────────

/** The desktop app's updater for the kit's UpdatesPanel — its status, check, download, "Restart
 *  now", and the shell's `update:status` push. Null outside the desktop app, and off in the shell
 *  until the app has releases (electron-main.js passes no `updates`). */
export function desktopUpdater() {
  if (!hasShell()) return null;
  return {
    status: () => call("updateStatus"),
    check: () => call("updateCheck"),
    download: () => call("updateDownload"),
    install: () => call("updateInstall"),
    onStatus: (fn) => window.appShell.on("update:status", fn),
  };
}
