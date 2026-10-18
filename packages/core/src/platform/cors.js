// SPDX-License-Identifier: MIT
// The family's CORS: Hono's own `cors` middleware (hono/cors — hono.dev/docs/middleware/builtin/cors),
// as the Hono plan named it (the kit's docs/plans/2026-10-09-hono-standard.md §3). Until
// 2026-10-13 this file was our port of Starlette's CORSMiddleware; the function keeps its name
// and its settings so every app calls it unchanged — JustWrite and JustVoice from their `cors`
// settings section, docgen allow-all.
//
// The settings, mapped onto hono/cors's options:
//   - `allowOrigins` (a list, `"*"` for every origin) and `allowOriginRegex` (a Python `re`
//     pattern that must match the whole origin, as the apps' settings write it) → `origin` as a
//     function: an allowed origin is mirrored back, any other gets no Allow-Origin. Every origin
//     with credentials off → `"*"`. Every origin with credentials on → the request's own origin
//     (a browser refuses `*` with credentials).
//   - `allowMethods` / `allowHeaders`: `["*"]` → hono/cors's own defaults (its method list; the
//     request's own headers mirrored back); a list → that list.
//   - `allowCredentials` → `credentials`; `exposeHeaders` → `exposeHeaders`; `maxAge` → `maxAge`
//     (600 s, as before).
// hono/cors answers every OPTIONS itself with 204 and no body; a refused preflight is a 204
// without Access-Control-Allow-Origin, which the browser refuses just the same.
//
// Wiring: `app.use("*", starletteCors({allowOrigins, allowOriginRegex, …}))` on the app, before
// its routes, AFTER the CSRF middleware and BEFORE the auth middleware — so a CSRF 403 carries no
// CORS headers, and CORS answers preflights before auth sees them (Hono keeps headers set on `c`
// before `next()` on whatever answer follows: a route's, auth's 401/403, the error envelope's 500).

import { cors } from "hono/cors";

/** A Python `re` pattern as a JS RegExp that, like `re.fullmatch`, must match the whole
 * string. The few Python-only spellings an origin pattern could use are translated. */
function pyFullMatcher(pattern) {
  const src = pattern
    .replace(/\(\?P</g, "(?<")
    .replace(/\(\?P=(\w+)\)/g, "\\k<$1>")
    .replace(/\\A/g, "^")
    .replace(/\\Z/g, "$(?![\\s\\S])");
  const re = new RegExp(`^(?:${src})$`);
  return (s) => re.test(s);
}

/** The family's CORS middleware for one configuration (hono/cors underneath). */
export function starletteCors({
  allowOrigins = [],
  allowMethods = ["GET"],
  allowHeaders = [],
  allowCredentials = false,
  allowOriginRegex = null,
  exposeHeaders = [],
  maxAge = 600,
} = {}) {
  const regex = allowOriginRegex !== null && allowOriginRegex !== undefined ? pyFullMatcher(allowOriginRegex) : null;
  const allowAllOrigins = allowOrigins.includes("*");
  const isAllowedOrigin = (origin) => allowAllOrigins || Boolean(regex?.(origin)) || allowOrigins.includes(origin);
  return cors({
    origin: allowAllOrigins && !allowCredentials ? "*" : (origin) => (origin && isAllowedOrigin(origin) ? origin : null),
    ...(allowMethods.includes("*") ? {} : { allowMethods: [...allowMethods] }),
    ...(allowHeaders.includes("*") ? {} : { allowHeaders: [...allowHeaders] }),
    credentials: allowCredentials,
    exposeHeaders: [...exposeHeaders],
    maxAge,
  });
}
