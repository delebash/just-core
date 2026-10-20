// SPDX-License-Identifier: MIT
// CSRF hardening — reject cross-site browser requests to the mutating API (the port of
// llm_runner/platform/csrf.py; the Starlette middleware becomes a Hono middleware on the
// app).
//
// THE family implementation (P2 of the target tree, 2026-08-08; JustWrite's original is
// the donor, and its deciding factor was the user's "prefer not locking anyone out, do
// the vector directly"). The servers are localhost sidecars; the real CSRF threat is a
// page in the user's OTHER browser tab POSTing to 127.0.0.1:<port>. A MUTATING `/v1`
// request whose `Origin` marks it cross-site is rejected UNLESS the origin is the app's
// own. No token, so it can never lock a user out; the only failure mode is a missing app
// origin blocking the app itself — which each app's smoke catches immediately.
//
// Allowed: no `Origin` (non-browser clients) · SAME-ORIGIN, derived per request (the
// server-hosted UI — browsers DO send Origin on same-origin mutations; JW hit that
// 2026-07-15) · the shared Capacitor (phone) origins + the app's own `appOrigins` (its dev server and its
// desktop window, `app://<id>`) ·
// `extraOrigins`/`originRegex` (an app's CORS allowlist, reused — ONE allowlist, never a
// second list) · any non-mutating method. Rejected: everything else, 403 problem+json.
//
// Wiring: `app.use("*", csrfOrigin({appOrigins, extraOrigins, originRegex, typeBase,
// prefixes}))` on the app, before its routes and BEFORE the auth middleware (it was the
// outermost middleware).
// `prefixes`: the paths guarded, `["/v1"]` by default — an app that guards more names them all
// (2026-10-08 — JustVoice: `["/v1", "/mcp"]`), as for the auth middleware.

import { requestPath, sendProblem } from "./auth.js";

// The phone app's webview origins (Capacitor: Android serves the page from https://localhost, iOS
// from capacitor://localhost) — identical for every app in the family. A phone syncing with a
// laptop's server, or using it directly, sends these (2026-10-08, the sync product: the kit's
// docs/plans/2026-10-08-sync-product-design.md). Its requests also carry the bearer token.
export const CAPACITOR_ORIGINS = Object.freeze(["https://localhost", "capacitor://localhost"]);

const MUTATING = new Set(["POST", "PUT", "PATCH", "DELETE"]);

/** A Python `re` pattern as a JS RegExp that, like `re.match`, anchors at the start only
 * (sticky). The few Python-only spellings an origin pattern could use are translated. */
function pyMatcher(pattern) {
  const src = pattern
    .replace(/\(\?P</g, "(?<")
    .replace(/\(\?P=(\w+)\)/g, "\\k<$1>")
    .replace(/\\A/g, "^")
    .replace(/\\Z/g, "$(?![\\s\\S])");
  const re = new RegExp(src, "y");
  return (s) => {
    re.lastIndex = 0;
    return re.test(s);
  };
}

/** The server's OWN origin for this request (scheme://host[:port]) — a page we served
 * ourselves. Read from the request so it follows whatever host/port the server runs on. */
function sameOrigin(c) {
  const url = new URL(c.req.url);
  return `${url.protocol.slice(0, -1)}://${c.req.header("host") || url.host}`;
}

/** The one allowlist (csrfOrigin's and resourceIsolation's): the phone's origins, the app's own, its CORS list and
 *  pattern, and the server's own origin for this request. */
function originAllowlist({ appOrigins = [], extraOrigins = [], originRegex = "" } = {}) {
  const allow = new Set([
    ...CAPACITOR_ORIGINS,
    ...(appOrigins || []).filter(Boolean),
    ...(extraOrigins || []).filter(Boolean),
  ]);
  const matches = originRegex ? pyMatcher(originRegex) : null;
  return (c, origin) => allow.has(origin) || origin === sameOrigin(c) || Boolean(matches?.(origin));
}

/** `app.add_middleware(CsrfOriginMiddleware, …)` → `app.use("*", csrfOrigin({…}))`, added before
 * the routes so it covers every route. */
export function csrfOrigin({ appOrigins = [], extraOrigins = [], originRegex = "", typeBase = "", prefixes = ["/v1"] } = {}) {
  const guarded = (p) => (prefixes || []).some((pre) => p.startsWith(pre));
  const allowed = originAllowlist({ appOrigins, extraOrigins, originRegex });

  return async function csrfOriginMiddleware(c, next) {
    const p = requestPath(c);
    if (!MUTATING.has(c.req.method) || !guarded(p)) return next();
    const origin = c.req.header("origin");
    if (origin && !allowed(c, origin)) {
      return sendProblem(c, 403, {
        type: `${typeBase}cross-origin`,
        title: "Forbidden",
        status: 403,
        detail: "cross-origin request rejected",
        instance: p,
      });
    }
    return next();
  };
}

// Fetch Metadata resource isolation (2026-10-20, the nineteenth review: a GET has no CSRF check, so a cross-site
// `<img src="http://127.0.0.1:<port>/v1/data/backup">` on any page made full backups). The browser says where a
// request comes from in `Sec-Fetch-Site` (web.dev, "Protect your resources from web attacks with Fetch Metadata" —
// the Resource Isolation Policy; w3c.github.io/webappsec-fetch-metadata): a GET or HEAD it marks `cross-site` is
// refused — unless it carries an Origin the allowlist above takes (the app's own windows: the desktop window's
// `app://<id>` fetches its server cross-site, measured in Electron 44 — `mode=cors`, `Origin: app://<id>`; the dev
// server, the phone), or it is a top-level navigation (`Sec-Fetch-Mode: navigate`, `Sec-Fetch-Dest: document`) to
// the UI's own pages (not the API: a link elsewhere to /v1/data/backup is refused too). `same-origin`, `same-site`
// and `none` (the user's own typing, a bookmark) pass, and so does a request without the header (curl, another app,
// an older browser, a page over plain http to another computer — browsers send it only to secure and loopback
// addresses). A no-cors load from the app's own window (`<img>`, `<audio>` with the server's address) carries no
// Origin and is refused: an app that loads its server's files that way fetches them instead (the kit's
// useServerImage). Wired by the app beside csrfOrigin, before its routes.
const READS = new Set(["GET", "HEAD"]);
const PASSING_SITES = new Set(["same-origin", "same-site", "none"]);

/** `app.use("*", resourceIsolation({appOrigins, extraOrigins, originRegex, typeBase, apiPrefixes}))` — refuses a
 *  read the browser marks cross-site (403 problem+json), but the app's own origins and a navigation to its pages. */
export function resourceIsolation({ appOrigins = [], extraOrigins = [], originRegex = "", typeBase = "", apiPrefixes = ["/v1"] } = {}) {
  const allowed = originAllowlist({ appOrigins, extraOrigins, originRegex });
  const isApi = (p) => (apiPrefixes || []).some((pre) => p.startsWith(pre));
  return async function resourceIsolationMiddleware(c, next) {
    if (!READS.has(c.req.method)) return next();
    const site = c.req.header("sec-fetch-site");
    if (!site || PASSING_SITES.has(site)) return next();
    const origin = c.req.header("origin");
    if (origin && allowed(c, origin)) return next();
    const p = requestPath(c);
    if (c.req.header("sec-fetch-mode") === "navigate" && c.req.header("sec-fetch-dest") === "document" && !isApi(p)) return next();
    return sendProblem(c, 403, {
      type: `${typeBase}cross-site`,
      title: "Forbidden",
      status: 403,
      detail: "cross-site request rejected",
      instance: p,
    });
  };
}
