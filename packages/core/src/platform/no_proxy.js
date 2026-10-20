// SPDX-License-Identifier: MIT
// This computer's own addresses never go through a proxy (2026-10-20, just-house-paint's fifteenth review): undici's
// EnvHttpProxyAgent (8.11.2) sends a call to 127.0.0.1 — the local AI engine — to HTTP_PROXY like any other unless
// NO_PROXY names it, and a headless server started with the user's own HTTP_PROXY set had no NO_PROXY (the desktop
// shell sets one only for the server it starts — server_start.js). The agent's documented `noProxy` option
// (undici's EnvHttpProxyAgent: "noProxy — overrides NO_PROXY") is given the environment's list plus loopback, so
// every agent the kit builds (http.js, llm/base.js) keeps them off the proxy, desktop and headless alike. No
// imports: the shell's bundle takes it too.

/** The loopback names a local engine is reached by (curl's and undici's NO_PROXY forms: no brackets on ::1). */
export const LOOPBACK = Object.freeze(["localhost", "127.0.0.1", "::1"]);

/** `value` (a NO_PROXY list, comma or space separated) with every LOOPBACK name added once, comma-joined. */
export function withLoopback(value) {
  const have = String(value || "")
    .split(/[,\s]+/)
    .filter(Boolean);
  return [...have, ...LOOPBACK.filter((h) => !have.includes(h))].join(",");
}

/** The `noProxy` for an EnvHttpProxyAgent: the environment's NO_PROXY (undici reads no_proxy first) and loopback. */
export function noProxyWithLoopback(env = globalThis.process?.env ?? {}) {
  return withLoopback(env.no_proxy ?? env.NO_PROXY ?? "");
}
