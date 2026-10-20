// SPDX-License-Identifier: MIT
// POST /v1/shutdown — stop this server cleanly, asked from this machine: the desktop shell asks a
// server of its app it finds on its port to stop before it would kill it (shell/stale_server.js
// POSTs to the app's `shutdownPath`, the shell's config). Moved here 2026-10-15 from JustVoice's
// system_api.js, so every app mounts the one route (JustVoice asked for it in the kit; JustWrite
// takes it up — the user's "your rec on all go" on a1ddee9's shutdown route).
//
//   - From this machine only (the three loopback names) — anyone else gets a 403.
//   - The app's own engines stop first (`beforeStop` — JustVoice's speech manager), so their GPU
//     memory is released before the answer.
//   - Then the running server stops: the stop runServer registered (serve.js), after the answer
//     has gone out; a stop that stalls (a stuck request, a hung engine) still ends the process
//     EXIT_DEADLINE_S later. With no server registered (a test, an embedding host) nothing exits,
//     and the answer says so: `{ok: true, exiting: false}`.
//
// Node's fetch sends no Origin on the shell's POST, so the CSRF guard lets it through (RESEARCH
// §2); an app with bearer auth on lists the path in `loopbackOpenPaths`, as the shell carries no
// token.

import { clientHost, isDirectLoopback } from "./auth.js";
import { HttpError } from "./errors.js";
import { getLogger } from "./log.js";
import { Hono } from "./server.js";

const log = getLogger("llm_runner.platform.shutdown_api");

/** The route's path — what an app's desktop main gives the shell as `shutdownPath`. */
export const SHUTDOWN_PATH = "/v1/shutdown";

/** `EXIT_DEADLINE_S`: a clean stop that stalls still ends this many seconds after the answer.
 * `startTimer` / `exit` are replaced by a test (the real ones would end the test run). */
export const cfg = {
  EXIT_DEADLINE_S: 10.0,
  startTimer: (seconds, fn) => setTimeout(fn, seconds * 1000).unref(),
  exit: (code) => process.exit(code),
};

// The stop of the server this process runs — runServer registers it once it listens.
let serverStop = null;

/** runServer's stop, `(why) => Promise`, for the route to call (null to forget it). */
export function registerServerStop(stop) {
  serverStop = stop;
}

const isLoopback = (host) => host === "127.0.0.1" || host === "::1" || host === "localhost";

/** The route, for an app to mount: `app.route("/", makeShutdownRouter({ beforeStop }))`.
 * `beforeStop()` stops the app's own engines (optional; may be async). */
export function makeShutdownRouter({ beforeStop = null } = {}) {
  const app = new Hono();
  app.post(SHUTDOWN_PATH, async (c) => {
    const host = clientHost(c);
    // from this machine itself — not through a proxy on it (its client is elsewhere)
    if (!isLoopback(host) || !isDirectLoopback(c)) throw new HttpError(403, "The server can only be shut down from this machine.");
    log.info(`shutdown requested from ${host} — stopping engines, then exiting`);
    if (beforeStop) await beforeStop();
    if (serverStop === null) return c.json({ ok: true, exiting: false });
    // The answer goes out first; then the server stops. In Node the answer's own "finish"; with
    // no Node response (a test's app.request), the next turn.
    const stop = serverStop;
    const go = () => stop(`POST ${SHUTDOWN_PATH}`);
    if (c.env?.outgoing) c.env.outgoing.once("finish", go);
    else setImmediate(go);
    cfg.startTimer(cfg.EXIT_DEADLINE_S, () => cfg.exit(0));
    return c.json({ ok: true, exiting: true });
  });
  return app;
}
