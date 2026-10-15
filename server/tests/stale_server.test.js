// SPDX-License-Identifier: MIT
// shell/stale_server.js — this app's own server left on the port is ASKED to stop (its shutdown
// route, else SIGTERM off Windows) and killed only when it hasn't stopped within the wait. Real
// processes on real ports: the listing (netstat / lsof) and the kill are the ones the shell runs.
import { spawn } from "node:child_process";
import { afterEach, expect, test } from "vitest";
import { listenerPids, stopStaleServer } from "../src/shell/stale_server.js";

// A stand-in server: answers POST /v1/shutdown (polite: then exits; deaf: never), 404 elsewhere;
// polite exits on SIGTERM too, deaf ignores it.
const SERVER = `
import http from "node:http";
const mode = process.argv[1];
const s = http.createServer((req, res) => {
  if (req.method === "POST" && req.url === "/v1/shutdown" && mode !== "noroute") {
    res.end("{}");
    if (mode === "polite") setTimeout(() => process.exit(0), 200);
    return;
  }
  res.statusCode = 404;
  res.end();
});
process.on("SIGTERM", () => { if (mode !== "deaf") process.exit(0); });
s.listen(0, "127.0.0.1", () => console.log(s.address().port));
`;

const children = [];
afterEach(() => {
  for (const c of children.splice(0)) if (c.exitCode === null && c.signalCode === null) c.kill("SIGKILL");
});

/** Start a stand-in server; resolves {child, port, exit} (exit: its {code, signal} promise). */
async function standIn(mode) {
  const child = spawn(process.execPath, ["--input-type=module", "-e", SERVER, mode], { stdio: ["ignore", "pipe", "inherit"] });
  children.push(child);
  const exit = new Promise((resolve) => child.on("exit", (code, signal) => resolve({ code, signal })));
  const port = await new Promise((resolve) => child.stdout.once("data", (d) => resolve(Number(String(d).trim()))));
  return { child, port, exit };
}

const quiet = { warn() {} };

test("the listing finds the server's process", async () => {
  const { child, port } = await standIn("polite");
  expect(await listenerPids(port)).toEqual([child.pid]);
});

test("a server that stops when asked through its route is not killed", async () => {
  const { port, exit } = await standIn("polite");
  expect(await stopStaleServer(port, { shutdownPath: "/v1/shutdown", waitMs: 10_000, log: quiet })).toBe("asked");
  expect(await exit).toEqual({ code: 0, signal: null }); // its own exit, not a kill
});

test("a server that answers but doesn't stop is killed once the wait is over", async () => {
  const { port, exit } = await standIn("deaf");
  const t0 = Date.now();
  expect(await stopStaleServer(port, { shutdownPath: "/v1/shutdown", waitMs: 800, log: quiet })).toBe("killed");
  expect(Date.now() - t0).toBeGreaterThanOrEqual(800);
  const { code, signal } = await exit;
  expect(code === 0 && signal === null).toBe(false);
});

test("a route that refuses means a kill at once — there is nothing to wait for", async () => {
  const { port, exit } = await standIn("noroute");
  const t0 = Date.now();
  expect(await stopStaleServer(port, { shutdownPath: "/v1/shutdown", waitMs: 10_000, log: quiet })).toBe("killed");
  expect(Date.now() - t0).toBeLessThan(10_000);
  const { code, signal } = await exit;
  expect(code === 0 && signal === null).toBe(false);
});

test("without a route: SIGTERM off Windows, a kill at once on Windows", async () => {
  const { port, exit } = await standIn("noroute");
  const how = await stopStaleServer(port, { waitMs: 10_000, log: quiet });
  if (process.platform === "win32") {
    expect(how).toBe("killed");
  } else {
    expect(how).toBe("asked");
    expect(await exit).toEqual({ code: 0, signal: null });
  }
});
