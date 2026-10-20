// SPDX-License-Identifier: MIT
// Shared server transport — the single fetch layer for the FastAPI server both
// apps run. App standard: serverUrl() + request/safeRequest/postForm
// + verbs (get/post/patch/put/del), in-flight GET dedupe, a reactive lastError,
// and a boot-time checkServer(). App-agnostic: the host calls
//   configureServerApi({ resolveBase, authToken })
// once at boot — resolveBase yields the origin-aware base (build one with
// makeOriginAwareResolver), authToken (optional) yields a Bearer token
// (JustVoice authenticates; JustWrite doesn't). Supersedes the per-app
// services/serverApi.js (JV's full transport; JW's resolver-only stub + its ~17
// scattered hand-rolled fetch helpers) and services/connection.js.

import { attachProblem, parseProblem } from "./apiError.js";
import { adoptTokenFromAddress, getServerToken } from "./serverToken.js";
import { serverFetch, setAuthTokenSource } from "./transport.js";
import { ref } from "vue";

// Reactive so views binding `api.lastError` update. Shared instance: the app's
// `api` store re-exposes this same ref.
export const lastError = ref("");
// The server answered the boot check with 401/403: it requires an access token this browser
// doesn't have (or has wrong) — ConnectionError asks for one instead of saying it can't be reached.
export const serverNeedsToken = ref(false);

const _cfg = {
  // Safe default: same-origin. Hosts override via configureServerApi() at boot.
  resolveBase: () => (typeof window !== "undefined" && window.location ? window.location.origin : ""),
  // the token this browser keeps for its server (serverToken.js) unless the host brings its own
  authToken: getServerToken,
};

export function configureServerApi({ resolveBase, authToken } = {}) {
  if (resolveBase) _cfg.resolveBase = resolveBase;
  if (authToken) {
    _cfg.authToken = authToken;
    setAuthTokenSource(authToken);
  }
}

// Origin-aware base resolver factory — shared machinery; only the per-app dev
// ports + loopback fallback differ. Returns the page origin when the server
// hosts the UI (same-origin, no CORS); otherwise (the dev server / the desktop window's app://) the
// fallback. The host reads its own VITE_SERVER_URL (statically) and passes the
// resolved value as `fallback`.
// `overrideKey` (2026-08-15) is a localStorage key whose value, when set, WINS
// over everything: a thin client explicitly pointed at a remote host. JustVoice
// had this layered on top in its own `src/config.js`, and read the same key a
// second time in its api store — so "which server are we talking to?" had two
// answers in one app and three shapes across the family (JustVoice: config.js;
// JustWrite: services/serverApi.js; docgen: nothing, the kit resolved it). The
// kit resolves it for all three now; an app that passes no key is unaffected.
export function makeOriginAwareResolver({ devPorts = [], fallback = "", overrideKey = "" } = {}) {
  return function resolveBase() {
    if (typeof window === "undefined" || !window.location) return fallback;
    if (overrideKey && typeof localStorage !== "undefined") {
      const override = localStorage.getItem(overrideKey);
      if (override) return override;
    }
    const { protocol, origin, port } = window.location;
    const isDev = devPorts.includes(port);
    if (!isDev && (protocol === "http:" || protocol === "https:")) return origin;
    return fallback;
  };
}

/** The headers every request carries — the access token this window keeps (serverToken.js), as `Authorization`. */
export function authHeaders(extra) {
  const headers = { ...(extra || {}) };
  const tok = _cfg.authToken();
  if (tok) headers.Authorization = `Bearer ${tok}`;
  return headers;
}

export function serverUrl(path) {
  return _cfg.resolveBase().replace(/\/$/, "") + path;
}
export const url = serverUrl; // JustVoice's name for the same fn

async function _doRequest(path, opts) {
  const headers = authHeaders(opts.headers);
  try {
    const res = await serverFetch(serverUrl(path), { ...opts, headers });
    if (!res.ok) {
      const text = await res.text();
      // A HUMAN message, not the raw envelope (audit 2026-08-05: every toast
      // built on e.message printed `400 Bad Request: {"detail":"…"}`), shaped by
      // apiError.js like client.js's — and the status prefix stays: callers key
      // on it (e.g. "409" → needsSetup). The parts ride on the Error too
      // (status, problem, errors, requestId — app-structure §15).
      const parsed = parseProblem(text);
      throw attachProblem(new Error(`${res.status} ${res.statusText}: ${parsed.human}`.trim()), res.status, parsed, res.headers);
    }
    const ct = res.headers.get("content-type") || "";
    if (ct.startsWith("audio/")) return await res.blob();
    if (ct.includes("json")) return await res.json();
    return await res.text();
  } catch (e) {
    lastError.value = String(e.message || e);
    throw e;
  }
}

// In-flight GET dedupe. Boot fires several stores/components fetching the same
// endpoint in the same tick; collapse concurrent identical GETs onto one
// in-flight promise (GETs are idempotent), cleared when it settles. Non-GETs
// untouched.
const _inflight = new Map();

export function request(path, opts = {}) {
  const method = (opts.method || "GET").toUpperCase();
  if (method !== "GET") return _doRequest(path, opts);
  const key = serverUrl(path);
  const hit = _inflight.get(key);
  if (hit) return hit;
  const p = _doRequest(path, opts);
  _inflight.set(key, p);
  const clear = () => _inflight.delete(key);
  p.then(clear, clear);
  return p;
}

// Convenience verbs. Path is always the FIRST arg.
export function get(path, opts = {}) {
  return request(path, { ...opts, method: "GET" });
}
export function post(path, body, opts = {}) {
  return request(path, {
    ...opts,
    method: "POST",
    headers: { "Content-Type": "application/json", ...(opts.headers || {}) },
    body: body != null ? JSON.stringify(body) : undefined,
  });
}
export function patch(path, body, opts = {}) {
  return request(path, {
    ...opts,
    method: "PATCH",
    headers: { "Content-Type": "application/json", ...(opts.headers || {}) },
    body: body != null ? JSON.stringify(body) : undefined,
  });
}
export function put(path, body, opts = {}) {
  return request(path, {
    ...opts,
    method: "PUT",
    headers: { "Content-Type": "application/json", ...(opts.headers || {}) },
    body: body != null ? JSON.stringify(body) : undefined,
  });
}
export function del(path, opts = {}) {
  return request(path, { ...opts, method: "DELETE" });
}

// The PUBLIC `@delebash/ui` blob/form pair lives HERE since 2026-08-05 (the JV
// integration's recorded later-work): path-first + authed via authHeaders(), so a thin
// client with a bearer token (JV's `jt:server` remote mode) can download backups and
// exports. client.js keeps auth-free twins for the kit's own relative imports — same
// base once installLlmUi feeds both transports, no token → no header, so JW/docgen
// behavior is unchanged. Do NOT re-add a method-first requestBlob anywhere: the old
// one was dead + shadowed and its wrong arg order caused real bugs (unified 2026-07-12).
export async function requestBlob(path, { method = "GET", body, headers } = {}) {
  const h = authHeaders(headers);
  const opts = { method, headers: h };
  if (body !== undefined) {
    h["Content-Type"] = "application/json";
    opts.body = JSON.stringify(body);
  }
  const res = await serverFetch(serverUrl(path), opts);
  if (!res.ok) {
    const parsed = parseProblem(await res.text().catch(() => ""));
    throw attachProblem(new Error(`${res.status} ${res.statusText}: ${parsed.human}`.trim()), res.status, parsed, res.headers);
  }
  return res.blob();
}

export async function postForm(path, formData, opts = {}) {
  const headers = authHeaders(opts.headers);
  const res = await serverFetch(serverUrl(path), { ...opts, method: "POST", headers, body: formData });
  if (!res.ok) {
    // the §15 parts on the Error, as request() hangs them (status, problem, errors, requestId)
    const parsed = parseProblem(await res.text());
    throw attachProblem(new Error(`${res.status} ${res.statusText}: ${parsed.human}`), res.status, parsed, res.headers);
  }
  const ct = res.headers.get("content-type") || "";
  if (ct.includes("json")) return res.json();
  return res.text();
}

// Like request() but swallows errors and returns the fallback. Use in view
// refresh() functions so server-offline doesn't blank the view.
export async function safeRequest(path, fallback = null, opts = {}) {
  try {
    const result = await request(path, opts);
    return result ?? fallback;
  } catch {
    return fallback;
  }
}

// checkServer's defaults (the reasons are in its loop).
const CHECK = { tries: 8, delayMs: 500, probeTimeoutMs: 500 };
// The longest checkServer() waits with its defaults, in ms — every try's abort plus the sleeps
// between them: about 7.5 s. A boot step before it that waits on something else (JustVoice's
// wait for its shell's server URL) gives up after the same time.
export const CHECK_SERVER_MS = CHECK.tries * CHECK.probeTimeoutMs + (CHECK.tries - 1) * CHECK.delayMs;

// Boot-time reachability check — the renderer is a thin client; with no server
// we must NOT boot (empty stores that silently fail to save). Retries briefly so
// a still-starting server (the desktop app's, just launched) isn't falsely reported down.
export async function checkServer({ tries = CHECK.tries, delayMs = CHECK.delayMs, probeTimeoutMs = CHECK.probeTimeoutMs } = {}) {
  // an address carrying `?token=…` (Settings → Server copies one) signs this browser in
  adoptTokenFromAddress();
  for (let i = 0; i < tries; i++) {
    try {
      // Per-try abort: a refused connection takes ~1s inside the production
      // webview (measured 2026-08-05), stretching a dead-server boot to ~12s
      // of splash before ConnectionError; the abort caps it at ~7.5s
      // (8×500ms + the sleeps). 500ms, not lower: this same probe serves the
      // HEADLESS browser door over real networks, and a health round-trip on
      // a slow link must not read as "server down". A local sidecar answers
      // in milliseconds either way.
      const res = await serverFetch(serverUrl("/v1/health"), {
        headers: authHeaders(), cache: "no-store",
        signal: AbortSignal.timeout(probeTimeoutMs),
      });
      if (res.ok) {
        // open from this computer, but the server requires a token even here and this window has
        // none it takes (bearerAuth marks the health answer): asked for, never a window of 401s
        const body = await res.json().catch(() => null);
        serverNeedsToken.value = body?.tokenRequired === true;
        return !serverNeedsToken.value;
      }
      // up, but it wants a token this browser doesn't have: asking again won't change that
      if (res.status === 401 || res.status === 403) {
        serverNeedsToken.value = true;
        return false;
      }
    } catch {
      /* server not up yet */
    }
    if (i < tries - 1) await new Promise((r) => setTimeout(r, delayMs));
  }
  return false;
}
