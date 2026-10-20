// SPDX-License-Identifier: MIT
// The family server's entry — `<app>-server serve` and the desktop app's server process,
// one door (the port of each app's serve.py shape: docgen's was the donor).
//
// Run three ways, the same code:
//   - by the desktop app's main process in a `utilityProcess` — it tells main when it is
//     listening (`{type: "ready", host, port}` over `process.parentPort`; the page's first
//     request can come before the server listens — plan §1.2) and stops on `{type:
//     "stop"}`;
//   - headless, the app's own exe run as Node (`ELECTRON_RUN_AS_NODE=1`) — stops on
//     SIGINT / SIGTERM;
//   - plain `node` in development.
// A stop is graceful: the server closes (its onClose hooks stop engines and release the
// GPU), with a 3 s grace for open streams as uvicorn's `timeout_graceful_shutdown=3`, then
// the process exits 0. A server that can't listen (port taken) exits 3, uvicorn's
// STARTUP_FAILURE code — under the desktop app, once it has told main which port
// (`{type: "listen-failed", host, port, code}`) and main has asked it to stop. An app that
// names its port before it is built (`resolvePort`) has that port probed first, so a port
// another server of the app holds is reported before the app opens its database. An app that
// names itself (`productName`) has its data folder locked before it is built (data_lock.js): a
// second server of the app on the same folder says so and exits 3 — under the desktop app, once
// it has told main (`{type: "data-folder-locked", dataDir}`) and main has asked it to stop. A
// server whose lock another server takes over while it runs says the same and stops serving the
// folder (2026-10-20).

import path from "node:path";
import { getSystemErrorMap, parseArgs } from "node:util";
import { serve } from "@hono/node-server";
import { dataFolderInUse, lockDataDir } from "./data_lock.js";
import { cantUseDataDir, dataDirSource, dataDirStartProblem } from "./data_paths.js";
import { PROBE_HOST, portInUse } from "./port.js";
import { closeApp } from "./server.js";
import { registerServerStop } from "./shutdown_api.js";

// The built UI on a computer's server (Node only — the phone's in-app server serves none): an app
// takes it from here, so it uses the kit's @hono/node-server like everything else it serves.
export { serveStatic } from "@hono/node-server/serve-static";

const GRACE_MS = 3000;
// Node's own server settings as Fastify set them: no limit on receiving a request (Node's
// default 300 s would cut off a large backup upload) and Fastify's 72 s keep-alive.
const SERVER_OPTIONS = { requestTimeout: 0, keepAliveTimeout: 72_000 };
// A request body that sends nothing this long is cut (2026-10-20, the twentieth review: an upload stalled halfway held
// the maintenance gate — every Reset and Restore waited out its 60 s drain and was refused — and a body that never came
// never timed out). Idle, not total: a long backup that keeps flowing is never cut, and once the body has arrived the
// timer is off — a response that streams (an AI answer, a backup's download) is never timed.
const BODY_IDLE_MS = 60_000;

/** The socket's idle timer while `req`'s body is being read (Node's `req.setTimeout` — its socket's): past `idleMs` with
 *  nothing received, a 408 when nothing has been answered yet (a Content-Length that lies gets an answer) — written to
 *  the socket the way Node's own server answers its requestTimeout (ERR_HTTP_REQUEST_TIMEOUT: a raw 408, Connection:
 *  close) — then the socket goes once that is sent: the route's read of the body ends, and the gate's count with it. */
export function cutIdleBodies(server, idleMs = BODY_IDLE_MS) {
  server.on("request", (req, res) => {
    if (req.complete) return;
    const te = req.headers["transfer-encoding"];
    const cl = Number(req.headers["content-length"] || 0);
    if (te === undefined && !(cl > 0)) return; // no body: nothing to wait for
    const off = () => req.setTimeout(0);
    req.once("end", off);
    req.once("close", off);
    req.setTimeout(idleMs, () => {
      if (req.complete) return off(); // all of it arrived (a route that hasn't read it yet): not a stall
      const sock = req.socket;
      if (!sock || sock.destroyed) return;
      if (!res.headersSent && sock.writable) {
        const body = JSON.stringify({ type: "about:blank", title: "Request Timeout", status: 408, detail: `the request's body stopped coming for ${Math.round(idleMs / 1000)} s` });
        const head = ["HTTP/1.1 408 Request Timeout", "Content-Type: application/problem+json", `Content-Length: ${Buffer.byteLength(body)}`, "Connection: close"];
        sock.write(`${head.join("\r\n")}\r\n\r\n${body}`);
      }
      sock.destroySoon();
    });
  });
}

/** Listen with `app` on host:port; resolves the Node server once it listens. */
function listen(app, host, port, { bodyIdleMs = BODY_IDLE_MS } = {}) {
  return new Promise((resolve, reject) => {
    const server = serve(
      // The adapter's default: its Request/Response become the globals. They are what make
      // `new Request(c.req.raw, …)` accept its lightweight request — hono/body-limit does that
      // for a body with no Content-Length, and with the platform's globals kept
      // (`overrideGlobalObjects: false`, until 2026-10-17) such a body answered 500. The kit's
      // HTTP client is its own undici (http.js) and never used the globals.
      { fetch: app.fetch, hostname: host, port, serverOptions: SERVER_OPTIONS },
      () => {
        server.off("error", reject);
        resolve(server);
      },
    );
    cutIdleBodies(server, bodyIdleMs);
    server.once("error", reject);
  });
}

/**
 * Parse `serve [--host H] [--port P] [--data-dir D] [--log-level L]`, with env fallbacks
 * named by the app (`<APP>_HOST`, `<APP>_PORT`, `<APP>_DATA_DIR`, `<APP>_LOG_LEVEL`).
 */
export function parseServeArgs(argv, { envPrefix, env = process.env } = {}) {
  const { values, positionals } = parseArgs({
    args: argv,
    allowPositionals: true,
    strict: true,
    options: {
      host: { type: "string" },
      port: { type: "string" },
      "data-dir": { type: "string" },
      "log-level": { type: "string" },
    },
  });
  const cmd = positionals[0] ?? "serve";
  if (cmd !== "serve") throw new Error(`unknown command '${cmd}' (choose from 'serve')`);
  const e = (k) => (envPrefix ? (env[`${envPrefix}_${k}`] ?? "").trim() || null : null);
  const port = values.port ?? e("PORT");
  return {
    host: values.host ?? e("HOST"),
    port: port != null ? Number(port) : null,
    // ABSOLUTE, always: a relative --data-dir resolves differently in every child process
    // with its own working directory (JustVoice's 2026-08-22 lesson).
    dataDir: (values["data-dir"] ?? e("DATA_DIR")) ? path.resolve(values["data-dir"] ?? e("DATA_DIR")) : null,
    logLevel: values["log-level"] ?? e("LOG_LEVEL") ?? "info",
  };
}

/** The error a listen on a taken port gives, in Node's own words (its system error map). */
function addressInUse() {
  const [errno, [code, message]] = [...getSystemErrorMap()].find(([, [name]]) => name === "EADDRINUSE");
  return Object.assign(new Error(`${code}: ${message}`), { code, errno });
}

/**
 * The server can't take its port: exit 3 — under the desktop app, once it has told the shell
 * which port and the shell has asked it to stop (a message posted just before exiting can be
 * lost). The shell stops the listener when it is this app's own server and starts this one
 * again; any other program keeps the port. `app` is null when the port was found taken before
 * the app was built.
 */
function cantListen(app, host, port, e, log) {
  log.error?.(`could not listen on ${host}:${port}: ${e.message}`);
  const parent = process.parentPort;
  if (!parent) return process.exit(3);
  parent.on("message", (m) => {
    if (m?.data?.type !== "stop") return;
    (app ? closeApp(app) : Promise.resolve())
      .catch((err) => log.error?.(`close failed: ${err?.stack || err}`))
      .finally(() => process.exit(3));
  });
  parent.postMessage({ type: "listen-failed", host, port, code: e.code ?? null });
  return new Promise(() => {}); // the shell's stop ends this process
}

/** Another server of the app holds the data folder: the words on stderr, and the shell told (it shows them). */
function sayDataFolderLocked(productName, dataDir) {
  process.stderr.write(`${dataFolderInUse(productName, dataDir)}\n`);
  process.parentPort?.postMessage({ type: "data-folder-locked", dataDir });
}

/**
 * Another server of the app holds the data folder: say so and exit 3, before anything is built —
 * under the desktop app, once the shell knows (it shows the words) and has asked this one to stop.
 */
function dataFolderLocked(productName, dataDir) {
  process.stderr.write(`${dataFolderInUse(productName, dataDir)}\n`);
  const parent = process.parentPort;
  if (!parent) return process.exit(3);
  parent.on("message", (m) => {
    if (m?.data?.type === "stop") process.exit(3);
  });
  parent.postMessage({ type: "data-folder-locked", dataDir });
  return new Promise(() => {}); // the shell's stop ends this process
}

/**
 * The start failed with `error` (one line, plain words): said in one line and exit 3 — never a stack for a data
 * folder that can't be used (2026-10-20). Under the desktop app the shell is told (`{type: "start-failed",
 * error}` — its connection page shows it) and this one exits on its stop.
 */
function startFailed(error) {
  process.stderr.write(`${error}\n`);
  const parent = process.parentPort;
  if (!parent) return process.exit(3);
  parent.on("message", (m) => {
    if (m?.data?.type === "stop") process.exit(3);
  });
  parent.postMessage({ type: "start-failed", error });
  return new Promise(() => {}); // the shell's stop ends this process
}

/**
 * Run a Hono app as the family server. `build(args)` returns `{app, host, port,
 * banner?}` — host/port already resolved (CLI/env over the app's settings store);
 * `app` is the app's Hono instance. Returns `{app, server, stop, port}`.
 *
 * `resolvePort(args)`, when given, names the port the server will listen on before `build` runs,
 * read without writing anything (the app reads its settings read-only); `build` gets it as
 * `args.port`. That port is probed first: when something already listens there — this app's own
 * old or headless server, with the same database open — it is reported as a failed listen is,
 * and `build`, which opens the database, never runs.
 *
 * `productName`, when given, is the app's name in its words (the desktop shell's `productName`,
 * e.g. "JustVoice"): the data folder (`--data-dir` / `<APP>_DATA_DIR` — the desktop shell always
 * names it) is then locked before `build`, after the port probe so this app's own old server on
 * the port is still reported to the shell, which stops it. Held by another server of the app, the
 * start ends with `dataFolderInUse`'s words. The lock goes when the process exits. Taken over by
 * another server while this one runs (data_lock.js `onLost`), the same words are said (under the
 * desktop app the shell is told, `data-folder-locked`), this server stops serving and exits 3.
 * `lockRetries` overrides proper-lockfile's retries, `lockOptions` its `stale` / `update` (tests).
 * `bodyIdleMs` (60 s; a test's shorter): a request body that sends nothing this long is cut (`cutIdleBodies`).
 * `defaultDataDir`, when given, is the app's own default folder (its family ladder), used when
 * neither `--data-dir` nor `<APP>_DATA_DIR` names one — so a headless run with no folder named is
 * locked too, and `build` gets the same folder.
 *
 * The data folder is checked first (2026-10-20, data_paths.js `dataDirStartProblem`): one that can't be used — a
 * missing drive, an offline share, a read-only folder; a folder the user named (`--data-dir`, `<APP>_DATA_DIR`,
 * a Change-folder pointer the app's ladder read) that isn't there; or, given at this start (`--data-dir`,
 * `<APP>_DATA_DIR`), a path the apps' native code can't take — ends the start in one line ("The data folder <dir>
 * can't be used: <why>"), exit 3. The ladder's default is made when missing. Under the desktop app the shell
 * checked the folder before handing it down; a start that fails there anyway — or in `build` — tells the shell
 * its first line (`start-failed`).
 */
export async function runServer({ argv = process.argv.slice(2), envPrefix, build, resolvePort, productName, lockRetries, lockOptions, defaultDataDir, bodyIdleMs = BODY_IDLE_MS, log = console }) {
  const args = parseServeArgs(argv, { envPrefix });
  const namedHere = !!args.dataDir;
  if (!args.dataDir && defaultDataDir) args.dataDir = path.resolve(await defaultDataDir());
  if (args.dataDir) {
    // where the folder came from: the app's ladder knows its own (an app that passes its ladder's folder as
    // --data-dir — JustVoice — keeps its default made when missing); else --data-dir / <APP>_DATA_DIR given now
    const source = process.parentPort ? null : (dataDirSource(args.dataDir) ?? (namedHere ? "variable" : null));
    const why = dataDirStartProblem(args.dataDir, { source, log });
    if (why) return startFailed(cantUseDataDir(args.dataDir, why));
  }
  // another server took the data folder's lock over: before this one serves, its start ends; after, it stops
  let lockLost = false;
  let onLockLost = () => {
    lockLost = true;
  };
  let built;
  try {
    if (resolvePort) {
      args.port = await resolvePort(args);
      if (args.port != null && (await portInUse(args.port))) return cantListen(null, PROBE_HOST, args.port, addressInUse(), log);
    }
    if (productName && args.dataDir) {
      try {
        await lockDataDir(args.dataDir, {
          log,
          onLost: () => onLockLost(),
          ...(lockOptions || {}),
          ...(lockRetries != null ? { retries: lockRetries } : {}),
        });
      } catch (e) {
        if (e?.code !== "ELOCKED") throw e;
        return dataFolderLocked(productName, args.dataDir);
      }
    }
    built = await build(args);
    if (lockLost) {
      await closeApp(built.app).catch((err) => log.error?.(`close failed: ${err?.stack || err}`));
      return dataFolderLocked(productName, args.dataDir);
    }
  } catch (e) {
    // headless, the error goes on as it always did; under the desktop app its first line reaches the window
    if (!process.parentPort) throw e;
    log.error?.(`the server couldn't start: ${e?.stack || e}`);
    return startFailed(String(e?.message || e).split("\n")[0]);
  }
  const { app, host, port, banner } = built;
  let server;
  try {
    server = await listen(app, host, port, { bodyIdleMs });
  } catch (e) {
    return cantListen(app, host, port, e, log);
  }
  const addr = server.address();
  const boundPort = typeof addr === "object" && addr ? addr.port : port;
  if (banner) process.stdout.write(`${banner}\n`);

  let stopping = null;
  // the stop, ending the process with `code` once the server has closed
  const halt = (why, code) => {
    if (stopping) return stopping;
    stopping = (async () => {
      log.info?.(`server stopping (${why})`);
      // Stop taking connections; idle keep-alive sockets go now, open streams get the grace.
      const closed = new Promise((resolve) => server.close(() => resolve()));
      server.closeIdleConnections?.();
      const t = setTimeout(() => {
        // Open streams past the grace: close their sockets so close() can finish.
        server.closeAllConnections?.();
      }, GRACE_MS);
      try {
        await closeApp(app);
        await closed;
      } catch (e) {
        log.error?.(`close failed: ${e?.stack || e}`);
      } finally {
        clearTimeout(t);
      }
      process.exit(code);
    })();
    return stopping;
  };
  const stop = (why = "stop") => halt(why, 0);
  // POST /v1/shutdown (shutdown_api.js, when the app mounts it) stops through this same stop.
  registerServerStop(stop);

  const port0 = process.parentPort;
  if (port0) {
    port0.on("message", (e) => {
      if (e?.data?.type === "stop") stop("asked by the app");
    });
    // a lock lost while it began listening: the shell hears that instead (below)
    if (!lockLost) port0.postMessage({ type: "ready", host, port: boundPort });
  }
  process.on("SIGINT", () => stop("SIGINT"));
  process.on("SIGTERM", () => stop("SIGTERM"));
  // Another server holds the data folder now (data_lock.js `onLost`): the words said, the shell told, and this
  // one stops serving it — exit 3, as a start on a held folder ends.
  onLockLost = () => {
    sayDataFolderLocked(productName, args.dataDir);
    halt("another server holds the data folder", 3);
  };
  if (lockLost) onLockLost();
  return { app, server, stop, port: boundPort };
}
