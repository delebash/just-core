// SPDX-License-Identifier: MIT
// What the desktop shell hands the server it starts, and what it makes of a start that failed (main.js). Its own
// module (no electron) so a test runs it.

import { withLoopback } from "../platform/no_proxy.js";

/** The address whose proxy the shell asks the system for: the models' host, where the big downloads go. */
export const PROXY_PROBE_URL = "https://huggingface.co/";

/**
 * A proxy for Node from what Electron's `session.resolveProxy(url)` answers — Chromium's PAC form
 * (electronjs.org/docs/latest/api/session#sesresolveproxyurl): the first entry, "PROXY host:port" →
 * "http://host:port", "HTTPS host:port" → "https://host:port"; "DIRECT" (and SOCKS, which Node's proxy
 * agents don't speak) → null.
 */
export function proxyFromPac(pac) {
  const first = String(pac || "").split(";")[0].trim();
  const m = /^(PROXY|HTTPS)\s+(\S+)$/i.exec(first);
  if (!m) return null;
  return `${m[1].toUpperCase() === "HTTPS" ? "https" : "http"}://${m[2]}`;
}

/**
 * The server's environment (2026-10-20, behind corporate networks): the data root in the app's variable;
 * NODE_USE_SYSTEM_CA=1 — Node's documented switch (nodejs.org/api/cli.html#node_use_system_ca1) — so a network
 * that inspects TLS, signing with a certificate the OS trusts, doesn't fail every download (measured on this
 * machine, Electron 44.7's utilityProcess: 121 certificates without, 269 with); and the system's `proxy` as
 * HTTPS_PROXY / HTTP_PROXY, which the kit's fetch honours (http.js) — only when the user's own environment names
 * none. Whenever any proxy is set — the system's or the user's own — this computer's own addresses are kept off
 * it (NO_PROXY: the server's calls to its local engines; undici's EnvHttpProxyAgent proxies loopback too) — for a
 * child the server starts in its turn; the kit's own agents add loopback themselves (no_proxy.js), headless too.
 */
export function serverEnv({ env = process.env, dataDirEnv, root, proxy = null }) {
  const out = { ...env, [dataDirEnv]: root };
  if (!out.NODE_USE_SYSTEM_CA) out.NODE_USE_SYSTEM_CA = "1";
  const named = ["HTTPS_PROXY", "https_proxy", "HTTP_PROXY", "http_proxy"].some((k) => out[k]);
  if (proxy && !named) {
    out.HTTPS_PROXY = proxy;
    out.HTTP_PROXY = proxy;
  }
  if (proxy || named) {
    const keys = ["no_proxy", "NO_PROXY"].filter((k) => out[k]);
    for (const k of keys.length ? keys : ["NO_PROXY"]) out[k] = withLoopback(out[k]);
  }
  return out;
}

/**
 * The first line of a server's error output that reads as an error ("Error: …", "TypeError: …",
 * "Error [ERR_MODULE_NOT_FOUND]: …"), its message only — what a server that died before it could say why
 * (a module that wouldn't load) printed. Null when there is none.
 */
export function firstErrorLine(text) {
  for (const line of String(text || "").split(/\r?\n/)) {
    const m = /^\s*\w*Error(?: \[[\w-]+\])?: (.+)$/.exec(line);
    if (m) return m[1].trim();
  }
  return null;
}

/**
 * Why the server couldn't listen on `port` (its listen error's `code`), for the connection page (`serverStatus`):
 * another OS user's copy of the app holds it (`who`, stale_server.js whoseServer), Windows has reserved it
 * (EACCES — Hyper-V and WSL reserve ranges of ports: `netsh interface ipv4 show excludedportrange
 * protocol=tcp`), or another program holds it.
 */
export function listenFailure(code, port, who) {
  if (code === "EADDRINUSE" && who === "other-user") return { portOtherUser: port };
  if (code === "EACCES") return { portReserved: port };
  if (code === "EADDRINUSE") return { portTaken: port };
  return {};
}
