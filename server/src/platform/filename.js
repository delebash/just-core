// SPDX-License-Identifier: MIT
// A file name made from a title — one rule for every app's downloads and Save dialogs, pure, so
// a Node server and a browser import the same copy.

/**
 * The title as written, minus the characters a Windows file name can't hold (`<>:"/\|?*`), with
 * the ends trimmed and trailing dots dropped. Never empty: "book" when nothing is left.
 * JustWrite's rule (`justwrite-app/src/services/bookTransfer.js` `safeTitle`), copied here so
 * JustVoice's exports name their files the same way (decided 2026-10-13, the JustVoice
 * narrowings review R7).
 */
export function safeTitle(title) {
  const s = (title || "").replace(/[<>:"/\\|?*]/g, "").trim().replace(/\.+$/, "");
  return s || "book";
}
