// SPDX-License-Identifier: MIT
// A provider's sign-in to the person's own plan — today "Sign in with ChatGPT" on the OpenAI provider
// (chatgpt_signin.js) — kept in its own table, `provider_signins`, never in the API-key column: one row per provider,
// with OpenAI's issued client id and this host's id kept after a sign-out (a later sign-in reuses them, as OpenAI's
// docs ask), the tokens cleared. Never logged; never in a provider response (only `signinSummary`).

import * as db from "./db.js";

const TABLE = "provider_signins";

/** The provider's sign-in row, or null (none, or storage not configured — the phone before boot, a test). */
export function getSignin(providerId) {
  if (!db.isConfigured()) return null;
  try {
    return db.session().get(TABLE, providerId) ?? null;
  } catch {
    return null; // an install whose database predates the table answers "not signed in" until its next boot
  }
}

/** Signed in: a refresh token to keep the access going. */
export const isSignedIn = (row) => Boolean(row?.refresh_token);

/** Write the provider's sign-in fields (insert or update). */
export function saveSignin(providerId, fields) {
  const h = db.session();
  const row = { ...fields, saved_at: Date.now() };
  if (h.get(TABLE, providerId)) h.update(TABLE, row, { provider_id: providerId });
  else h.insert(TABLE, { provider_id: providerId, ...row });
}

/** Sign-out: the tokens go; the issued client id, host id, account and ID token stay for the next sign-in. */
export function clearTokens(providerId) {
  if (!getSignin(providerId)) return;
  db.session().update(TABLE, { access_token: "", refresh_token: "", expires_at: 0, saved_at: Date.now() }, { provider_id: providerId });
}

/** The provider is gone: its row too. */
export function deleteSignin(providerId) {
  if (db.isConfigured()) db.session().delete(TABLE, { provider_id: providerId });
}

/** What a provider response says about the sign-in: `{method, email, signedIn}`, or null when there's none. */
export function signinSummary(providerId) {
  const row = getSignin(providerId);
  if (!row?.method) return null;
  return { method: row.method, email: row.email || "", signedIn: isSignedIn(row) };
}
