// SPDX-License-Identifier: MIT
// Shared "hand something to the OS" — THE seam for external links (#12a) and,
// since 2026-08-14, for local FOLDERS ("Open folder" on both model catalogs).
//
// WHY A SEAM AT ALL: a desktop app hands links and folders to the OS through its shell
// (the kit's Electron shell: `openExternal` / `openPath` over the app's one preload bridge),
// and the kit cannot reach that bridge itself — each app reads it in its own
// `services/native.js` — so the host hands its openers in once at boot. In all three apps
// that is the same line (the 2026-08-14 convergence, kept through the move to Electron):
//
//   import { openPath, openUrl } from "../services/native.js";
//   installLlmUi(app, { external: { open: openUrl, openPath } });
//
// THE GATE LIVES HERE, not in the apps. Those openers only work inside the desktop
// window, and every app also runs in a plain browser (`quasar dev`, and the headless
// server's UI). So this module decides:
//   - openExternal → the host's opener in the window, `window.open` in a browser
//     (which works there).
//   - openPath → the host's opener in the window, and FALSE anywhere else. There
//     is no browser fallback and there cannot be one: a page cannot hand a
//     filesystem path to the file manager. It reports failure instead of
//     pretending, and the caller says what that means in its own words.
// That is why the apps' wiring is three words long and identical: no app decides
// what it can do, and none of them repeats this reasoning.
//
// Components keep a real <a :href> for copy-link + a11y and route the CLICK
// through openExternal via @click.prevent.

const config = { open: null, openPath: null };

/** Inside the family's desktop shell? The Electron shell's ONE preload bridge,
 *  `window.appShell` (read only by the app's `services/native.js` — and by this test).
 *  A Tauri webview's `__TAURI_INTERNALS__` counted too until 2026-10-13, when no family
 *  app ran on Tauri any more. */
export function isDesktopShell() {
  if (typeof window === "undefined") return false;
  return !!window.appShell;
}

/** Merge semantics (configureServerApi's shape): a host that wires only `open`
 *  keeps whatever folder opener was configured before, and vice versa. */
export function configureExternal({ open, openPath: openPathFn } = {}) {
  if (open !== undefined) config.open = open || null;
  if (openPathFn !== undefined) config.openPath = openPathFn || null;
}

export function openExternal(url) {
  if (!url) return;
  if (config.open && isDesktopShell()) {
    config.open(url);
    return;
  }
  if (typeof window !== "undefined") window.open(url, "_blank", "noopener,noreferrer");
}

/** Can this host reveal a local folder? False in any browser. */
export function canOpenPath() {
  return !!config.openPath && isDesktopShell();
}

/** Show `path` in the OS file manager. Returns false when this host can't —
 *  the caller says what that means to the user. */
export function openPath(path) {
  if (!path || !canOpenPath()) return false;
  config.openPath(path);
  return true;
}
