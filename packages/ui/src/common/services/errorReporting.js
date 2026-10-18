// SPDX-License-Identifier: MIT
// Renderer errors reach the server's log (app-structure §15): `installErrorReporting(app)` in
// the app's boot file hooks Vue's `app.config.errorHandler` (vuejs.org/api/application.html)
// and the window's `error` and `unhandledrejection` events, and posts each failure to the kit's
// `POST /v1/logs/client` — Settings → Logs then shows the page's failures beside the server's.
// The same message is sent at most once a minute and at most 20 a minute in all (the server
// caps it again); a failed post is dropped, never retried or reported, so this can't loop.

import { post } from "./serverApi.js";
import { reportError } from "./reportError.js";

const PER_MINUTE = 20;
// The log is read in English (a log line, not screen text — §Q.11).
const UNKNOWN_ERROR = "unknown error";

function entryOf(err, context) {
  const e = err instanceof Error ? err : null;
  const message = String(e?.message || err?.message || err || UNKNOWN_ERROR).slice(0, 2000) || UNKNOWN_ERROR;
  const stack = e?.stack ? String(e.stack).slice(0, 8000) : undefined;
  const url = typeof location !== "undefined" ? String(location.hash || location.pathname || "").slice(0, 500) : undefined;
  return { level: "error", message, ...(stack ? { stack } : {}), ...(url ? { url } : {}), context: String(context).slice(0, 200) };
}

/**
 * Install the hooks on a Vue app. `send(entry)` defaults to the kit transport's POST;
 * `notify` (default true) also tells the user, once per distinct message, through
 * `reportError`. Returns a function that removes the window listeners (tests).
 */
export function installErrorReporting(app, { send = (entry) => post("/v1/logs/client", entry), notify = true } = {}) {
  const lastSent = new Map();
  const window60 = [];
  let sending = false;

  const report = (err, context) => {
    // a request failure the caller already showed (reportError) or a cancel isn't news
    if (err?.reported || err?.name === "AbortError") return;
    const entry = entryOf(err, context);
    const now = Date.now();
    while (window60.length && now - window60[0] > 60_000) window60.shift();
    if (now - (lastSent.get(entry.message) || 0) < 60_000 || window60.length >= PER_MINUTE) return;
    lastSent.set(entry.message, now);
    window60.push(now);
    if (notify) reportError(err instanceof Error ? err : new Error(entry.message));
    if (sending) return; // an error raised while sending one is not sent
    sending = true;
    Promise.resolve()
      .then(() => send(entry))
      .catch(() => {})
      .finally(() => {
        sending = false;
      });
  };

  const previous = app.config.errorHandler;
  app.config.errorHandler = (err, instance, info) => {
    report(err, `vue: ${info}`);
    if (previous) previous(err, instance, info);
    else console.error(err);
  };
  if (typeof window === "undefined") return () => {};
  const onError = (ev) => report(ev.error || ev.message, "window");
  const onRejection = (ev) => report(ev.reason, "promise");
  window.addEventListener("error", onError);
  window.addEventListener("unhandledrejection", onRejection);
  return () => {
    window.removeEventListener("error", onError);
    window.removeEventListener("unhandledrejection", onRejection);
  };
}
