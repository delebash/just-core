// SPDX-License-Identifier: MIT
// Convert raw fetch / HTTP errors from an LLM provider into a single
// short, user-readable line. Every aiFeature run/stream call (and the
// hosts' RAG/chat services) wraps its failures with
// friendlyAiError(err, provider) so modals and inline AI surfaces never
// show verbose "Chat stream error 500: …" to the user.
import { kitT, kitTe } from "../common/services/kitI18n.js";

// The status codes with a hint of their own: kit.aiError.status.<code>.
const statusHint = (status) => (kitTe(`kit.aiError.status.${status}`) ? kitT(`kit.aiError.status.${status}`) : null);

function pickHint(msg, status) {
  // The SPECIFIC transport cause beats the generic status text (2026-07-26). A dead
  // local engine comes back as OUR server's 502, and status-first turned "the target
  // machine actively refused it" into "Bad gateway — the provider's upstream is
  // unreachable", which tells a novelist nothing about what to do. WinError 10061 is
  // Windows' own refused-connection code and does not contain the word "refused" in
  // every locale, so it is matched explicitly.
  if (/connection.*refused|ECONNREFUSED|10061/i.test(msg))
    return kitT("kit.aiError.refused");
  if (status && statusHint(status)) return statusHint(status);
  if (/ENOTFOUND|getaddrinfo|DNS/i.test(msg))
    return kitT("kit.aiError.dns");
  if (/timed out|timeout/i.test(msg))
    return kitT("kit.aiError.timeout");
  if (/cors|preflight|origin/i.test(msg))
    return kitT("kit.aiError.cors");
  return null;
}

// The local engine's own refusal to load a model that doesn't fit in memory (core runner/lifecycle.js _admitRam): the
// engine WAS reached, and its sentence already says what the model needs, what is free and what to do — shown whole,
// under its own lead (JustWrite's chat, 2026-10-29: "Couldn't reach the LLM: …when it last", the advice cut off).
const NO_MEMORY = /not enough memory to load [^:]+:\s*([\s\S]+)$/i;

// An engine's own words, whole up to a sentence: a long one ends at the last sentence end within RAW_MAX, with "…" —
// never mid-word (a 160-character cut took the part that says what to do).
const RAW_MAX = 400;
function wholeSentences(text) {
  const s = text.trim();
  if (s.length <= RAW_MAX) return s;
  const cut = s.slice(0, RAW_MAX);
  const end = Math.max(cut.lastIndexOf(". "), cut.lastIndexOf("! "), cut.lastIndexOf("? "));
  return `${end > 0 ? cut.slice(0, end + 1) : cut.trimEnd()}…`;
}

function urlHostname(provider) {
  try { return new URL(provider?.baseUrl || "").host || ""; } catch { return ""; }
}

/**
 * Take a raw error from a chat() / chatStream() call and produce a new
 * Error with a friendlier message. The original message is preserved
 * as `.cause` so debug callers can still inspect.
 *
 * Aborts pass through unchanged so callers can branch on cancellation.
 */
export function friendlyAiError(err, provider) {
  const msg = String(err?.message || err || "");
  if (/abort/i.test(msg)) return err;
  // Try to surface an HTTP status code if the message embeds one.
  const m = msg.match(/(\d{3})/);
  const status = m ? parseInt(m[1], 10) : null;
  const noMemory = msg.match(NO_MEMORY);
  const host = urlHostname(provider);
  const hint = noMemory ? null : pickHint(msg, status);
  const lead = host ? kitT("kit.aiError.reachHost", { host }) : kitT("kit.aiError.reachLlm");
  const friendly = noMemory
    ? kitT("kit.aiError.noMemory", { detail: wholeSentences(noMemory[1]) })
    : hint
      ? kitT("kit.aiError.withHint", { lead, hint })
      : kitT("kit.aiError.withRaw", { lead, raw: wholeSentences(msg) });
  const out = new Error(friendly);
  out.cause = err;
  out.statusCode = status;
  return out;
}
