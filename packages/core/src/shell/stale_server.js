// SPDX-License-Identifier: MIT
// Stopping this app's own server left on its port (a crashed run, a headless server) before the
// desktop app starts its own (main.js; the shell has already checked that the listener answers
// GET /v1/health as this app's server). It is ASKED first, the way the server documents a stop:
// its app's shutdown route when the app names one (JustVoice's POST /v1/shutdown — open from this
// machine without a token), else on macOS and Linux SIGTERM, which the family server takes as a
// graceful stop (platform/serve.js). It is killed only when it hasn't stopped within the wait.
// Until 2026-10-15 the shell killed it at once (taskkill /F, kill -9), cutting off its engines'
// own shutdown (the narrowings review, "found on the way"). Windows can't ask a process to stop
// without a route, so there an app that names none is still killed at once.

import { portInUse } from "../platform/port.js";
import { checkOutput, run } from "../platform/procs.js";

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
// After a kill, how long the port gets to come free (as before 2026-10-15).
const FREE_WAIT_MS = 5000;
const POLL_MS = 150;

/** The ids of the processes listening on `port` (netstat on Windows, lsof elsewhere). */
export async function listenerPids(port, platform = process.platform) {
  if (platform === "win32") {
    const out = await checkOutput(["netstat", "-ano"]);
    const pids = new Set();
    for (const line of out.split(/\r?\n/)) {
      const cols = line.trim().split(/\s+/);
      if (cols.length < 5 || cols[0] !== "TCP" || !cols.includes("LISTENING")) continue;
      if (!cols[1].endsWith(`:${port}`)) continue;
      const pid = Number(cols[cols.length - 1]);
      if (pid) pids.add(pid);
    }
    return [...pids];
  }
  const out = await run(["lsof", "-nP", `-iTCP:${port}`, "-sTCP:LISTEN", "-t"]);
  return out.stdout.split(/\s+/).filter(Boolean).map(Number);
}

/** Is process `pid` still running? Signal 0 tests for it without sending anything (Node's
 * `process.kill` docs). */
function alive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch (e) {
    return e.code === "EPERM";
  }
}

/** Ask the server on `port` to stop: true when asked (it may still be stopping). */
async function ask(port, pids, { shutdownPath, waitMs, platform, log }) {
  if (shutdownPath) {
    try {
      const r = await fetch(`http://127.0.0.1:${port}${shutdownPath}`, { method: "POST", signal: AbortSignal.timeout(waitMs) });
      if (!r.ok) log.warn?.(`[shell] ${shutdownPath} answered ${r.status}`);
      return r.ok;
    } catch {
      return true; // the connection went as the server stopped, or the answer was slower than the wait
    }
  }
  if (platform === "win32" || !pids.length) return false;
  for (const pid of pids) {
    try {
      process.kill(pid, "SIGTERM");
    } catch {
      /* already gone */
    }
  }
  return true;
}

async function kill(pids, platform) {
  for (const pid of pids.filter(alive)) {
    if (platform === "win32") await run(["taskkill", "/F", "/PID", String(pid)]);
    else await run(["kill", "-9", String(pid)]);
  }
}

/**
 * Stop this app's server listening on `port`: ask it, wait up to `waitMs` for its process to end
 * and the port to come free, then kill whatever is left. Resolves "asked" (it stopped by itself)
 * or "killed".
 */
export async function stopStaleServer(port, { shutdownPath = null, waitMs, platform = process.platform, log = console } = {}) {
  let pids = [];
  try {
    pids = await listenerPids(port, platform);
  } catch (e) {
    log.warn?.(`[shell] could not list what listens on port ${port}: ${e.message}`);
  }
  const running = async () => pids.some(alive) || (await portInUse(port));
  const t0 = Date.now();
  if (await ask(port, pids, { shutdownPath, waitMs, platform, log })) {
    while (Date.now() - t0 < waitMs && (await running())) await sleep(POLL_MS);
    if (!(await running())) return "asked";
    log.warn?.(`[shell] the server on port ${port} did not stop in time — killing it`);
  }
  try {
    await kill(pids, platform);
  } catch (e) {
    log.warn?.(`[shell] could not stop the server on port ${port}: ${e.message}`);
  }
  const t1 = Date.now();
  while (Date.now() - t1 < FREE_WAIT_MS && (await portInUse(port))) await sleep(POLL_MS);
  return "killed";
}
