// SPDX-License-Identifier: MIT
// platform/serve.js — a server that can't listen under the desktop app says which port to the
// shell (`listen-failed`) and waits for the shell's stop, then exits 3 (the shell decides whether
// the listener is this app's own server). A port the app names before it is built
// (`resolvePort`) is probed first, so a taken one is reported before the build opens anything.
import net from "node:net";
import { afterEach, expect, test, vi } from "vitest";
import { runServer } from "../src/platform/serve.js";
import { Hono } from "../src/platform/server.js";

const silent = { error() {}, info() {} };

afterEach(() => {
  delete process.parentPort;
  vi.restoreAllMocks();
});

/** A fake desktop-app parent: what the server posts, and a way to send it the shell's stop. */
function fakeParent() {
  const posted = [];
  const handlers = [];
  process.parentPort = { on: (_ev, fn) => handlers.push(fn), postMessage: (m) => posted.push(m) };
  const exited = new Promise((resolve) => vi.spyOn(process, "exit").mockImplementation((code) => resolve(code)));
  const stop = () => {
    for (const fn of handlers) fn({ data: { type: "stop" } });
  };
  return { posted, exited, stop };
}

async function holdPort(host) {
  const holder = net.createServer();
  await new Promise((r) => holder.listen(0, host, r));
  return holder;
}

test("a taken port is reported to the shell, and the stop exits 3", async () => {
  const holder = await holdPort("127.0.0.1");
  const { port } = holder.address();
  const { posted, exited, stop } = fakeParent();
  try {
    runServer({ argv: ["serve"], envPrefix: null, log: silent, build: async () => ({ app: new Hono(), host: "127.0.0.1", port }) });
    await vi.waitFor(() => expect(posted.length).toBe(1));
    expect(posted[0]).toEqual({ type: "listen-failed", host: "127.0.0.1", port, code: "EADDRINUSE" });
    stop();
    expect(await exited).toBe(3);
  } finally {
    await new Promise((r) => holder.close(r));
  }
});

test("a port named before the build is probed first: taken, it is reported and the build never runs", async () => {
  // A listener on every address: Windows would let 127.0.0.1:<port> bind beside it, so only the
  // probe's connection finds it.
  const holder = await holdPort("0.0.0.0");
  const { port } = holder.address();
  const { posted, exited, stop } = fakeParent();
  const build = vi.fn(async () => ({ app: new Hono(), host: "127.0.0.1", port }));
  try {
    runServer({ argv: ["serve"], envPrefix: null, log: silent, resolvePort: () => port, build });
    await vi.waitFor(() => expect(posted.length).toBe(1));
    expect(posted[0]).toEqual({ type: "listen-failed", host: "127.0.0.1", port, code: "EADDRINUSE" });
    expect(build).not.toHaveBeenCalled();
    stop();
    expect(await exited).toBe(3);
    expect(build).not.toHaveBeenCalled();
  } finally {
    await new Promise((r) => holder.close(r));
  }
});

test("a free port named before the build reaches the build as args.port", async () => {
  const holder = await holdPort("127.0.0.1");
  const { port } = holder.address();
  await new Promise((r) => holder.close(r));
  const { posted, exited, stop } = fakeParent();
  const build = vi.fn(async (args) => ({ app: new Hono(), host: "127.0.0.1", port: args.port }));
  runServer({ argv: ["serve"], envPrefix: null, log: silent, resolvePort: () => port, build });
  await vi.waitFor(() => expect(posted.length).toBe(1));
  expect(build).toHaveBeenCalledTimes(1);
  expect(build.mock.calls[0][0].port).toBe(port);
  expect(posted[0]).toEqual({ type: "ready", host: "127.0.0.1", port });
  stop();
  expect(await exited).toBe(0);
});
