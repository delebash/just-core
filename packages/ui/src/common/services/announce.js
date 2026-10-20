// SPDX-License-Identifier: MIT
// What a screen reader is told without the focus moving: a toast, an AI task starting and ending.
// ONE polite and ONE assertive live region, created at start (installLlmUi calls installAnnouncer)
// and never removed — a region inserted already holding its words, or created at the moment it
// speaks, is often not read (the screens-and-keyboard review, 2026-10-20: the toasts were
// role="status" elements inserted filled, and the task strip had no live region from the start).
// Each message is a new line appended to its region (role="log", aria-relevant="additions") and
// taken away after a while, so the same words twice are read twice and the regions don't grow.
//
// While a modal dialog is open (QDialog's root, role="dialog" aria-modal="true" — AppModal, the
// dialogs, the help drawer), what is outside it isn't in the accessibility tree at all (Chromium
// prunes it), so the regions at the top of <body> weren't heard (the sixteenth review, 2026-10-20).
// Each open modal gets its own pair, put in it the moment it opens (a MutationObserver — still
// before anything is said), and a message goes to the TOP open modal's pair; Quasar does the same
// for a menu opened inside a dialog (its portal renders inside the aria-modal element).
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
const ATTR = "data-live-announcer";
const MODAL = '[aria-modal="true"]';

let root = null; // the page's pair, at the top of <body>
let observer = null;

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

/** A polite and an assertive log in one hidden box. */
function makeRegions(doc) {
  const box = doc.createElement("div");
  box.setAttribute(ATTR, "");
  Object.assign(box.style, HIDDEN);
  for (const level of ["assertive", "polite"]) {
    const log = doc.createElement("div");
    log.setAttribute("role", "log");
    log.setAttribute("aria-live", level);
    log.setAttribute("aria-relevant", "additions");
    box.appendChild(log);
  }
  return box;
}

/** The open modal dialogs, in document order (a dialog opened later is portalled after). */
const openModals = (doc) => [...doc.querySelectorAll(MODAL)].filter((el) => el.isConnected);

/** Every open modal dialog holds a pair of its own. */
function equipModals(doc) {
  for (const modal of openModals(doc)) {
    if (![...modal.children].some((c) => c.hasAttribute(ATTR))) modal.appendChild(makeRegions(doc));
  }
}

/** Create the page's two regions, once, at the top of <body>, and give every modal dialog that opens
 *  its own. No document (a test in Node): nothing. */
export function installAnnouncer(doc = typeof document !== "undefined" ? document : null) {
  if (!doc?.body) return;
  if (!(root?.isConnected && root.ownerDocument === doc)) {
    root = makeRegions(doc);
    doc.body.prepend(root);
  }
  equipModals(doc);
  if (!observer && typeof MutationObserver !== "undefined") {
    observer = new MutationObserver((records) => {
      const opened = records.some(
        (r) =>
          r.type === "attributes" ||
          [...r.addedNodes].some((n) => n.nodeType === 1 && (n.matches?.(MODAL) || n.querySelector?.(MODAL))),
      );
      if (opened && root?.ownerDocument) equipModals(root.ownerDocument);
    });
    observer.observe(doc.body, { childList: true, subtree: true, attributes: true, attributeFilter: ["aria-modal"] });
  }
}

/** Where a message is heard: the top open modal dialog's pair, else the page's. */
function regionsNow() {
  const doc = root?.ownerDocument;
  if (!doc) return null;
  const modals = openModals(doc);
  const top = modals[modals.length - 1];
  if (top) {
    equipModals(doc);
    return [...top.children].find((c) => c.hasAttribute(ATTR)) || root;
  }
  return root;
}

/** `s` with its first letter a capital: a server's detail is a lowercase phrase by the family's
 *  convention (a banner joins it after its title with " — "), but on its own — a toast's second line,
 *  a sentence said — it starts one. */
export function sentence(s) {
  const [first = "", ...rest] = [...String(s ?? "")];
  return first.toLocaleUpperCase() + rest.join("");
}

/** A title and a detail as one spoken text: "Title. Detail." — the detail a sentence of its own, no
 *  second stop after a title or a detail that has one. */
export function spoken(title, detail) {
  const stop = (s) => (/[.!?…:]$/u.test(s) ? s : `${s}.`);
  const head = String(title ?? "").trim();
  const tail = String(detail ?? "").trim();
  if (!tail) return head;
  return `${stop(head)} ${stop(sentence(tail))}`;
}

/** Tell a screen reader `message`: "polite" (the default) or "assertive" (an error). */
export function announce(message, level = "polite", { lingerMs = LINGER_MS } = {}) {
  const text = String(message ?? "").replace(/\s+/g, " ").trim();
  if (!text) return;
  if (!root?.isConnected) installAnnouncer();
  const box = regionsNow();
  const log = box?.querySelector(`[aria-live="${level === "assertive" ? "assertive" : "polite"}"]`);
  if (!log) return;
  const line = log.ownerDocument.createElement("div");
  line.textContent = text;
  log.appendChild(line);
  setTimeout(() => line.remove(), lingerMs);
}

/** Take back what hasn't been read yet — one level, or both — wherever it waits. */
export function clearAnnouncer(level) {
  const doc = root?.ownerDocument;
  if (!doc) return;
  for (const log of doc.querySelectorAll(`[${ATTR}] [aria-live]`)) {
    if (!level || log.getAttribute("aria-live") === level) log.replaceChildren();
  }
}
