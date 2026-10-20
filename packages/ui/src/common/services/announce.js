// SPDX-License-Identifier: MIT
// What a screen reader is told without the focus moving: a toast, an AI task starting and ending.
// ONE polite and ONE assertive live region, created at start (installLlmUi calls installAnnouncer)
// and never removed — a region inserted already holding its words, or created at the moment it
// speaks, is often not read (the screens-and-keyboard review, 2026-10-20: the toasts were
// role="status" elements inserted filled, and the task strip had no live region from the start).
// Each message is a new line appended to its region (role="log", aria-relevant="additions") and
// taken away after a while, so the same words twice are read twice and the regions don't grow.
//
// The pattern is React Spectrum's LiveAnnouncer (@react-aria/live-announcer — DOM only, one
// visually hidden polite + assertive log each, a message a node removed after 7 s). The package
// itself isn't used: since 3.5 it only re-exports react-aria's copy, which needs React and
// react-dom (checked on npm, 2026-10-20; its last React-free release, 3.4.4, is from 2025-07). This
// is the kit's own few lines of the same pattern, not a copy of its code.
//
//   announce("Saved")                      — polite: read when the reader is idle
//   announce("The export failed", "assertive")  — read at once (an error)

const LINGER_MS = 7000;

let root = null;
const regions = { polite: null, assertive: null };

// visually hidden, still read (the same box as a .sr-only rule: 1px, clipped)
const HIDDEN = {
  position: "absolute",
  width: "1px",
  height: "1px",
  margin: "-1px",
  padding: "0",
  border: "0",
  overflow: "hidden",
  clip: "rect(0 0 0 0)",
  clipPath: "inset(50%)",
  whiteSpace: "nowrap",
};

/** Create the two regions, once, at the top of <body>. No document (a test in Node): nothing. */
export function installAnnouncer(doc = typeof document !== "undefined" ? document : null) {
  if (!doc?.body) return;
  if (root?.isConnected && root.ownerDocument === doc) return;
  root = doc.createElement("div");
  root.setAttribute("data-live-announcer", "");
  Object.assign(root.style, HIDDEN);
  for (const level of ["assertive", "polite"]) {
    const log = doc.createElement("div");
    log.setAttribute("role", "log");
    log.setAttribute("aria-live", level);
    log.setAttribute("aria-relevant", "additions");
    regions[level] = log;
    root.appendChild(log);
  }
  doc.body.prepend(root);
}

/** Tell a screen reader `message`: "polite" (the default) or "assertive" (an error). */
export function announce(message, level = "polite", { lingerMs = LINGER_MS } = {}) {
  const text = String(message ?? "").replace(/\s+/g, " ").trim();
  if (!text) return;
  if (!root?.isConnected) installAnnouncer();
  const log = regions[level === "assertive" ? "assertive" : "polite"];
  if (!log) return;
  const line = log.ownerDocument.createElement("div");
  line.textContent = text;
  log.appendChild(line);
  setTimeout(() => line.remove(), lingerMs);
}

/** Take back what hasn't been read yet — one level, or both. */
export function clearAnnouncer(level) {
  for (const l of level ? [level] : ["polite", "assertive"]) regions[l]?.replaceChildren();
}
