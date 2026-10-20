// SPDX-License-Identifier: MIT
// One way to tell the user something failed (app-structure §15): `reportError(err)` shows a
// Quasar Notify toast through the kit's `pushToast` — the server's own words when it gave any,
// the kit's when it didn't, and for a server fault (5xx) the reference that finds its log line.
// A form's field errors never come here (forms.js `fieldErrors` puts them under their fields);
// a cancelled request reports nothing.

import { kitT } from "./kitI18n.js";
import { pushToast } from "./toastBridge.js";

const isCancel = (err) => err?.name === "AbortError" || err?.cancelled === true || err?.cutOff === true;

/** `{ title, detail, reference }` for a failure, in the app's language. */
export function errorMessage(err, { t = kitT } = {}) {
  const status = Number(err?.status) || 0;
  const problem = err?.problem || null;
  const reference = err?.requestId ? t("kit.errors.reference", { id: err.requestId }) : "";
  // fetch() throwing a TypeError means the request never reached the server
  if (!status && err instanceof TypeError) return { title: t("kit.errors.offline"), detail: "", reference: "" };
  if (status >= 500) {
    const detail = typeof problem?.detail === "string" ? problem.detail : "";
    // a title the server chose ("The AI photo didn't finish") says what failed; HTTP's own doesn't
    const own = typeof problem?.title === "string" && problem.title && problem.title !== "Internal Server Error" ? problem.title : "";
    return { title: own || t("kit.errors.server"), detail, reference: reference || t("kit.errors.seeLogs") };
  }
  if (status >= 400) {
    const detail = typeof problem?.detail === "string" ? problem.detail : String(err?.message || "");
    return { title: problem?.title && problem.title !== "Validation Error" ? problem.title : t("kit.errors.refused"), detail, reference: "" };
  }
  return { title: t("kit.errors.title"), detail: String(err?.message || err || ""), reference: "" };
}

/** Show `err` to the user as a toast. Returns false when nothing was shown (a cancel). */
export function reportError(err, { t = kitT } = {}) {
  if (!err || isCancel(err)) return false;
  const { title, detail, reference } = errorMessage(err, { t });
  try {
    err.reported = true; // installErrorReporting skips it if it surfaces again unhandled
  } catch {
    // a frozen or primitive error — nothing to mark
  }
  pushToast({ title, description: [detail, reference].filter(Boolean).join(" · ") || undefined, kind: "error", duration: 9000 });
  return true;
}
