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
  } catch {
    // not JSON — the raw text IS the message
  }
  const errors = Array.isArray(problem?.errors) ? problem.errors : Array.isArray(problem?.detail) ? problem.detail : [];
  if (problem) {
    const j = problem;
    if (typeof j.detail === "string") human = problemDetail(j, errors) || j.detail;
    else if (Array.isArray(j.detail)) human = j.detail.map((d) => d?.msg || JSON.stringify(d)).join("; ");
    else if (j.detail && typeof j.detail === "object") human = j.detail.error || JSON.stringify(j.detail);
    else if (j.title) {
      const said = problemDetail(j, errors);
      human = said ? `${j.title} — ${said}` : j.title;
    }
  }
  const requestId = typeof problem?.requestId === "string" ? problem.requestId : null;
  return { problem, human, errors, requestId };
}

// the server's own sentence for any refused request (packages/core's validation envelope): it says
// nothing a person can act on — the words are in the problem's errors
const GENERIC_DETAIL = /^Request (body|query|path|headers?) failed validation\.?$/i;
const MAX_MESSAGES = 3;
const MAX_CHARS = 300;

/**
 * The words a refusal is said in: its `detail`, unless that is the generic validation sentence
 * ("Request body failed validation.") or empty while the problem lists its `errors` — then the
 * errors' own messages, the first few, each once, at most a few hundred characters. A 422 whose
 * words moved into `errors[]` toasted only the generic sentence ("That wasn't accepted — Request body
 * failed validation." for an empty palette file — the twentieth review, 2026-10-20). `fieldErrors`
 * (forms.js) still puts each under its field.
 */
export function problemDetail(problem, errors = problem?.errors) {
  const detail = typeof problem?.detail === "string" ? problem.detail.trim() : "";
  const list = Array.isArray(errors) ? errors : [];
  if (!list.length || (detail && !GENERIC_DETAIL.test(detail))) return detail;
  const messages = [...new Set(list.map((e) => String(e?.msg ?? "").trim()).filter(Boolean))];
  if (!messages.length) return detail;
  let text = messages.slice(0, MAX_MESSAGES).join("; ");
  if (messages.length > MAX_MESSAGES) text += "; …";
  if (text.length > MAX_CHARS) text = `${text.slice(0, MAX_CHARS - 1).trimEnd()}…`;
  return text;
}

/** Hang a parsed failure on `err` (the Error a transport throws). */
export function attachProblem(err, status, parsed, headers = null) {
  err.status = status;
  err.problem = parsed.problem;
  err.errors = parsed.errors;
  err.requestId = parsed.requestId || headers?.get?.("x-request-id") || null;
  return err;
}
