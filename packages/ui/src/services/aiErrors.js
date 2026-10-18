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
  const host = urlHostname(provider);
  const hint = pickHint(msg, status);
  const lead = host ? kitT("kit.aiError.reachHost", { host }) : kitT("kit.aiError.reachLlm");
  const friendly = hint ? kitT("kit.aiError.withHint", { lead, hint }) : kitT("kit.aiError.withRaw", { lead, raw: msg.slice(0, 160) });
  const out = new Error(friendly);
  out.cause = err;
  out.statusCode = status;
  return out;
}
