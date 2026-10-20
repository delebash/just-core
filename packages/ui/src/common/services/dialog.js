// SPDX-License-Identifier: MIT
// Shared imperative, promise-based dialog API — replaces the browser's built-in
// prompt() / confirm() (which leak "from localhost" chrome in dev and look out of
// place in the desktop app). App-agnostic; the host component (the shared
// AppDialog / UiDialog) reads `dialogState` and calls _resolveDialog(...) on
// confirm / cancel. Supersedes the per-app services/dialog.js forks.
//
// Usage:
//   const title = await promptDialog({ title: "New chapter", label: "Title", confirmLabel: "Create" });
//   if (!title) return;                                   // user cancelled
//   const values = await promptDialog({ title: "New article", fields: [...] });
//   const yes = await confirmDialog({ title: "Delete?", message: "…", danger: true });

import { reactive } from "vue";

export const dialogState = reactive({
  open: false,
  kind: null,        // "prompt" | "confirm"
  options: null,
  _resolve: null,
});

// A call that omits its title or button words gets the kit's (kit.dialog.*), in the app's
// language — the host AppDialog reads them through vue-i18n.

function openDialog(kind, options) {
  // If something is already open, cancel it first so the new prompt wins — answered as ITS kind cancels (a prompt
  // null, a confirm false): a prompt cancelled by a confirm was answered false, and Reset's prompt read that as a
  // typed word and said "Confirmation didn't match" (the twentieth review, 2026-10-20).
  if (dialogState.open && dialogState._resolve) {
    dialogState._resolve(dialogState.kind === "confirm" ? false : null);
  }
  return new Promise((resolve) => {
    dialogState.kind = kind;
    dialogState.options = options;
    dialogState._resolve = resolve;
    dialogState.open = true;
  });
}

export function promptDialog(options = {}) {
  return openDialog("prompt", options);
}

export function confirmDialog(options = {}) {
  return openDialog("confirm", options);
}

// Called by the dialog host on confirm / cancel. We deliberately keep `kind` and
// `options` set after closing — the host renders its body off those, and the
// modal (AppModal on Quasar's QDialog) keeps the frame mounted during its close
// animation; clearing synchronously made the body vanish mid-fade. The next openDialog
// overwrites both atomically, so the stale data is harmless until then.
export function _resolveDialog(value) {
  const r = dialogState._resolve;
  dialogState.open = false;
  dialogState._resolve = null;
  if (r) r(value);
}
