// SPDX-License-Identifier: MIT
// What a failed request tells the GUI (app-structure §15). The family's servers answer every
// error as problem+json (RFC 9457): `title`, `detail`, `status`, `instance`, the request's
// `requestId`, and for a 422 `errors: [{loc, msg, type, ctx?}]`. Both kit transports
// (serverApi.js and client.js) read a failed answer through `parseProblem` and hang the parts
// on the Error they throw — `status`, `problem`, `errors`, `requestId` — beside the message
// they always built, so a caller keying on the message ("409 …") keeps working and a form can
// put each field's error under its field (forms.js `fieldErrors`).

/**
 * Read a failed answer's text. Returns `{ problem, human, errors, requestId }`: `problem` the
 * parsed JSON body (null when it isn't JSON), `human` the one line a person reads (FastAPI's
 * string detail, a 422 detail array joined, a problem's title — detail), `errors` the field
 * errors (problem+json `errors`, or FastAPI's 422 `detail` array), `requestId` the id the
 * server logged the failure under.
 */
export function parseProblem(raw) {
  let problem = null;
  let human = raw ?? "";
  try {
    const j = JSON.parse(raw);
    if (j && typeof j === "object") problem = j;
    if (j && typeof j.detail === "string") human = j.detail;
    else if (j && Array.isArray(j.detail)) human = j.detail.map((d) => d?.msg || JSON.stringify(d)).join("; ");
    else if (j?.detail && typeof j.detail === "object") human = j.detail.error || JSON.stringify(j.detail);
    else if (j?.title) human = j.detail ? `${j.title} — ${j.detail}` : j.title;
  } catch {
    // not JSON — the raw text IS the message
  }
  const errors = Array.isArray(problem?.errors) ? problem.errors : Array.isArray(problem?.detail) ? problem.detail : [];
  const requestId = typeof problem?.requestId === "string" ? problem.requestId : null;
  return { problem, human, errors, requestId };
}

/** Hang a parsed failure on `err` (the Error a transport throws). */
export function attachProblem(err, status, parsed, headers = null) {
  err.status = status;
  err.problem = parsed.problem;
  err.errors = parsed.errors;
  err.requestId = parsed.requestId || headers?.get?.("x-request-id") || null;
  return err;
}
