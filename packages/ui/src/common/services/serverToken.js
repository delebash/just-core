// SPDX-License-Identifier: MIT
// The access token this browser sends its server — the family's sign-in for a server that requires
// tokens (Settings → Server, the kit's bearerAuth). Jupyter's pattern (jupyter-server, "Security in
// the Jupyter Server": a token in the address once, then remembered by the browser): the address's
// `?token=…` is taken once and removed from the address bar, or the connection page asks for one
// (ConnectionError, when the server answers 401/403); either way it is kept in this browser's
// storage for that server's origin and sent as `Authorization: Bearer` on every request
// (transport.js). The desktop window never needs one: its server is on the same computer.
// Storage can be missing (a private window, blocked site data): then the token lives for the page.

const KEY = "just.serverToken";
let inMemory = "";

function storage() {
  try {
    return typeof localStorage !== "undefined" ? localStorage : null;
  } catch {
    return null;
  }
}

/** The token to send, or "". */
export function getServerToken() {
  try {
    return storage()?.getItem(KEY) || inMemory;
  } catch {
    return inMemory;
  }
}

/** Keep `token` for this server ("" forgets it). */
export function setServerToken(token) {
  inMemory = String(token || "").trim();
  try {
    if (inMemory) storage()?.setItem(KEY, inMemory);
    else storage()?.removeItem(KEY);
  } catch {
    // kept for the page only
  }
}

/** The address's `?token=…`, taken once: kept, and removed from the address bar (and history). */
export function adoptTokenFromAddress() {
  if (typeof window === "undefined" || !window.location?.search) return false;
  const params = new URLSearchParams(window.location.search);
  const token = params.get("token");
  if (!token) return false;
  setServerToken(token);
  params.delete("token");
  const query = params.toString();
  try {
    window.history.replaceState(window.history.state, "", `${window.location.pathname}${query ? `?${query}` : ""}${window.location.hash}`);
  } catch {
    // an address that can't be rewritten still works; the token is kept either way
  }
  return true;
}
