// SPDX-License-Identifier: MIT
// One way to tell the user something failed (app-structure §15): `reportError(err)` shows a
// Quasar Notify toast through the kit's `pushToast` — the server's own words when it gave any,
// the kit's when it didn't, and for a server fault (5xx) the reference that finds its log line.
// A form's field errors never come here (forms.js `fieldErrors` puts them under their fields);
// a cancelled request reports nothing.

import { problemDetail } from "./apiError.js";
import { kitT } from "./kitI18n.js";
import { pushToast } from "./toastBridge.js";

const isCancel = (err) => err?.name === "AbortError" || err?.cancelled === true || err?.cutOff === true;

/** HTTP's own words for a 5xx (and the server's plain "Error"): never shown as a title — the kit's are. */
const HTTP_TITLES = new Set([
  "Error",
  "Internal Server Error",
  "Not Implemented",
  "Bad Gateway",
  "Service Unavailable",
  "Gateway Timeout",
  "HTTP Version Not Supported",
  "Insufficient Storage",
  "Loop Detected",
  "Network Authentication Required",
]);

/** `{ title, detail, reference }` for a failure, in the app's language. */
export function errorMessage(err, { t = kitT } = {}) {
  const status = Number(err?.status) || 0;
  const problem = err?.problem || null;
  const reference = err?.requestId ? t("kit.errors.reference", { id: err.requestId }) : "";
  // fetch() throwing a TypeError means the request never reached the server
  if (!status && err instanceof TypeError) return { title: t("kit.errors.offline"), detail: "", reference: "" };
  if (status >= 500) {
    const detail = typeof problem?.detail === "string" ? problem.detail : "";
    // a title the server chose ("The AI photo didn't finish") says what failed; HTTP's own phrases don't
    const own = typeof problem?.title === "string" && problem.title && !HTTP_TITLES.has(problem.title) ? problem.title : "";
    return { title: own || t("kit.errors.server"), detail, reference: reference || t("kit.errors.seeLogs") };
  }
  if (status >= 400) {
    // a validation refusal's words are its errors' own when its detail is only the generic sentence
    // (apiError.js problemDetail — the twentieth review)
    const said = problem ? problemDetail(problem, err?.errors ?? problem.errors) : "";
    const detail = said || (typeof problem?.detail === "string" ? problem.detail : String(err?.message || ""));
    return { title: problem?.title && problem.title !== "Validation Error" ? problem.title : t("kit.errors.refused"), detail, reference: "" };
  }
  return { title: t("kit.errors.title"), detail: String(err?.message || err || ""), reference: "" };
}

/** A failure said in place — a panel's or a form's line — as one sentence: the server's own,
 * else the kit's words (offline, refused). Never the wire's "HTTP 404 — …". */
export function errorText(err, { t = kitT } = {}) {
  if (typeof err === "string") return err;
  const { title, detail } = errorMessage(err, { t });
  return detail || title;
}

/** Show `err` to the user as a toast. Returns false when nothing was shown (a cancel). `title`, when
 * given, is the screen's own words for what failed ("Save failed"); the reason follows as the
 * description — the server's sentence, or the kit's words where it has none (offline). */
export function reportError(err, { t = kitT, title: said = "" } = {}) {
  if (!err || isCancel(err)) return false;
  const message = errorMessage(err, { t });
  const title = said || message.title;
  const detail = said ? message.detail || message.title : message.detail;
  const { reference } = message;
  try {
    err.reported = true; // installErrorReporting skips it if it surfaces again unhandled
  } catch {
    // a frozen or primitive error — nothing to mark
  }
  // a failed AI task's error was said already, by the task store (stores/aiTasks.js): the toast shows it,
  // the screen reader isn't told twice
  pushToast({ title, description: [detail, reference].filter(Boolean).join(" · ") || undefined, kind: "error", duration: 9000, announce: !err?.announced });
  return true;
}
