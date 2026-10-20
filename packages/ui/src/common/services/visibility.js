// SPDX-License-Identifier: MIT
// Whether the page is shown, for the kit's polls (watchSync, the connection page, the AI tasks clock): a minimized or
// hidden window, a background tab or a sleeping phone asks nothing — a hidden window polled 15 times a minute, all
// day, behind a desktop app's tray (just-house-paint's twelfth review, 2026-10-20). The standard: the Page Visibility
// API (document.visibilityState, `visibilitychange` — html.spec.whatwg.org "Page visibility"), and `online` for the
// network coming back.

/** True while the page is shown (no document — a worker, a test without one: always). */
export const pageShown = () => typeof document === "undefined" || document.visibilityState !== "hidden";

/** `fn()` each time the page is shown again or the network comes back. Returns the stop. */
export function onBack(fn) {
  if (typeof document === "undefined" || typeof window === "undefined") return () => {};
  const shown = () => {
    if (pageShown()) fn();
  };
  document.addEventListener("visibilitychange", shown);
  window.addEventListener("online", shown);
  return () => {
    document.removeEventListener("visibilitychange", shown);
    window.removeEventListener("online", shown);
  };
}
