// SPDX-License-Identifier: MIT
// The family's sync watcher, beside the sync screen (components/SyncPanel.vue) — copied
// 2026-10-13 from JustWrite's `watchSync` (its services/projectApi.js, which is to switch to this
// one). The server's counter (GET /v1/sync/rev — the sync product
// `@delebash/sqlite-sync`) moves when another device's changes land: a sync with the cloud
// folder or a paired device, or a file imported by hand. Then `onChange` runs, and the app
// reloads what it shows by itself (JustWrite: its book list and the open book; JustVoice: the
// window). The interval is the server's sync setting `pollSeconds`. Returns a stop function.
//
// `waitWhileEditing`: the change waits while a dialog is open or the cursor is in a text box,
// and lands at the first check after (decided 2026-10-15, JustVoice TASKS "The register's 35
// questions…", P18 — a reload would lose unsaved typing). `waitWhile()`: the app's own reason to
// wait (just-house-paint: a brush stroke or its save in flight, which no text box shows). `onChange`
// gets the server's answer (`{ rev, pollSeconds, … }`).
//
// A server that tells its windows apart (installLlmUi `sendClientId`) moves the counter only for
// the OTHER windows' changes — just-house-paint's counter of changes made in other windows on one
// server (2026-10-20), the same contract as a sync product's.
import { get } from "./serverApi.js";
import { onBack, pageShown } from "./visibility.js";

// <input> types that aren't text boxes
const NOT_TEXT = new Set(["button", "checkbox", "color", "file", "hidden", "image", "radio", "range", "reset", "submit"]);

/** Is the user mid-edit: a dialog open (Quasar renders `.q-dialog` only while one shows) or the
 * cursor in a text box? */
export function isEditing(doc = globalThis.document) {
  if (!doc) return false;
  if (doc.querySelector(".q-dialog")) return true;
  const el = doc.activeElement;
  if (!el) return false;
  if (el.isContentEditable || el.tagName === "TEXTAREA") return true;
  return el.tagName === "INPUT" && !NOT_TEXT.has(String(el.type || "text").toLowerCase());
}

// While the page is hidden (a minimized window, a background tab, a sleeping phone) it asks nothing; it asks at once
// when the page shows again or the network comes back (visibility.js).
export function watchSync(onChange, { waitWhileEditing = false, waitWhile = null } = {}) {
  let last = null;
  let timer = null;
  let stopped = false;
  let asking = false;
  const tick = async () => {
    timer = null;
    if (stopped || asking) return;
    if (!pageShown()) return; // asleep: onBack wakes it
    asking = true;
    let wait = 5;
    try {
      const r = await get("/v1/sync/rev");
      wait = Number(r?.pollSeconds) > 0 ? Number(r.pollSeconds) : wait;
      const changed = last !== null && r.rev !== last;
      // mid-edit: `last` stays, so the next check sees the change again
      const hold = changed && ((waitWhileEditing && isEditing()) || waitWhile?.());
      if (!hold) {
        if (changed) await onChange(r);
        last = r.rev;
      }
    } catch {
      // the server is busy or restarting: try again next time
    } finally {
      asking = false;
    }
    if (!stopped) timer = setTimeout(tick, wait * 1000);
  };
  const offBack = onBack(() => {
    clearTimeout(timer);
    void tick();
  });
  void tick();
  return () => {
    stopped = true;
    clearTimeout(timer);
    offBack();
  };
}
