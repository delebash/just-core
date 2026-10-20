// SPDX-License-Identifier: MIT
// platform/shutdown_api.js — POST /v1/shutdown, the desktop shell's clean stop of a server it
// finds on its port (moved here from JustVoice's system_api.js, 2026-10-15). The connection's
// remote address comes through `env.incoming.socket`, as @hono/node-server hands it.
import { afterEach, beforeEach, expect, test } from "vitest";
import { createServer } from "../src/platform/server.js";
import { cfg, makeShutdownRouter, registerServerStop, SHUTDOWN_PATH } from "../src/platform/shutdown_api.js";

const from = (address) => ({ incoming: { socket: { remoteAddress: address, remotePort: 50000, remoteFamily: address.includes(":") ? "IPv6" : "IPv4" } } });
const post = (app, address) => app.request(SHUTDOWN_PATH, { method: "POST" }, from(address));
const nextTurn = () => new Promise((r) => setImmediate(r));

let timers;
let exits;
const saved = { ...cfg };
beforeEach(() => {
  timers = [];
  exits = [];
  cfg.startTimer = (seconds, fn) => timers.push({ seconds, fn });
  cfg.exit = (code) => exits.push(code);
});
afterEach(() => {
  Object.assign(cfg, saved);
  registerServerStop(null);
});

function appWith(opts) {
  const app = createServer({ typeBase: "https://example.test/errors/" });
  app.route("/", makeShutdownRouter(opts));
  return app;
}

test("only_this_machine_may_ask", async () => {
  const stops = [];
  registerServerStop(async (why) => stops.push(why));
  const r = await post(appWith(), "192.168.1.20");
  expect(r.status).toBe(403);
  // nor a proxy on this machine for a client elsewhere (its forwarding header)
  const proxied = await appWith().request(SHUTDOWN_PATH, { method: "POST", headers: { "X-Forwarded-For": "203.0.113.7" } }, from("127.0.0.1"));
  expect(proxied.status).toBe(403);
  await nextTurn();
  expect(stops).toEqual([]);
});

test("the_engines_stop_then_the_server_after_the_answer", async () => {
  const order = [];
  registerServerStop(async (why) => order.push(`stop: ${why}`));
  const app = appWith({ beforeStop: async () => order.push("engines") });
  const r = await post(app, "127.0.0.1");
  expect(await r.json()).toEqual({ ok: true, exiting: true });
  expect(order).toEqual(["engines"]); // the answer went out before the stop
  await nextTurn();
  expect(order).toEqual(["engines", `stop: POST ${SHUTDOWN_PATH}`]);
  // A stop that stalls still ends the process.
  expect(timers.map((t) => t.seconds)).toEqual([cfg.EXIT_DEADLINE_S]);
  timers[0].fn();
  expect(exits).toEqual([0]);
});

test("ipv6_loopback_counts_as_this_machine", async () => {
  registerServerStop(async () => {});
  expect((await post(appWith(), "::1")).status).toBe(200);
});

test("no_running_server_stops_the_engines_and_says_so", async () => {
  const engines = [];
  const r = await post(appWith({ beforeStop: () => engines.push("stopped") }), "127.0.0.1");
  expect(await r.json()).toEqual({ ok: true, exiting: false });
  expect(engines).toEqual(["stopped"]);
  expect(timers).toEqual([]);
});
