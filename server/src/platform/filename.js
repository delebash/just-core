// SPDX-License-Identifier: MIT
// A file name made from a title — one rule for every app's downloads and Save dialogs, pure, so
// a Node server and a browser import the same copy.

/**
 * The title as written, minus the characters a Windows file name can't hold (`<>:"/\|?*` and the
 * control characters below U+0020), with the ends trimmed and trailing dots dropped. Never empty:
 * "book" when nothing is left. JustWrite's rule, moved here so JustVoice's exports name their
 * files the same way (decided 2026-10-13, the JustVoice narrowings review R7); since 2026-10-15
 * JustWrite's renderer and server import this one (the server's copy also dropped the control
 * characters, so this one does too).
 */
export function safeTitle(title) {
  const s = String(title || "")
    .replace(/[<>:"/\\|?*\x00-\x1f]/g, "")
    .trim()
    .replace(/\.+$/, "");
  return s || "book";
}
