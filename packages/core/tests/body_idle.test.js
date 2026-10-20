// SPDX-License-Identifier: MIT
// A request body that sends nothing for a while is cut (serve.js cutIdleBodies — the twentieth review: an upload
// stalled halfway held the maintenance gate, so every Reset waited out the 60 s drain and was refused, and a body that
// never came never timed out). Through the real server (@hono/node-server), with the idle limit made short: a stalled
// upload frees the gate and its Reset runs; a Content-Length that lies gets an answer; an upload that keeps flowing past
// the limit in all is never cut; a response that streams after its body arrived is never timed.
import http from "node:http";
import net from "node:net";
import { afterEach, expect, test, vi } from "vitest";
import { MaintenanceGate } from "../src/platform/maintenance.js";
import { runServer } from "../src/platform/serve.js";
import { createServer, stream } from "../src/platform/server.js";

const IDLE = 400;

function app(gate) {
  const a = createServer({ typeBase: "t/" });
  a.use("*", gate.middleware());
  a.post("/v1/houses", async (c) => c.json({ got: (await c.req.arrayBuffer()).byteLength }));
  a.post("/v1/data/reset", async (c) => {
    await gate.closeFor("reset", async () => {}, { drainMs: 5000 });
    return c.json({ ok: true });
  });
  a.post("/v1/ai/stream", async (c) => {
    await c.req.text();
    return stream(c, async (s) => {
      await s.write("first ");
      await new Promise((r) => setTimeout(r, IDLE * 2)); // quiet longer than the limit, after the body arrived
      await s.write("last");
    });
  });
  return a;
}

let stop = null;
afterEach(async () => {
  await stop?.();
  stop = null;
  vi.restoreAllMocks();
});

async function served(gate) {
  const probe = net.createServer();
  await new Promise((r) => probe.listen(0, "127.0.0.1", r));
  const { port } = probe.address();
  await new Promise((r) => probe.close(r));
  const posted = [];
  const handlers = [];
  process.parentPort = { on: (_ev, fn) => handlers.push(fn), postMessage: (m) => posted.push(m) };
  const exited = new Promise((resolve) => vi.spyOn(process, "exit").mockImplementation((code) => resolve(code)));
  runServer({ argv: ["serve"], envPrefix: null, bodyIdleMs: IDLE, log: { error() {}, info() {} }, build: async () => ({ app: app(gate), host: "127.0.0.1", port }) });
  await vi.waitFor(() => expect(posted[0]?.type).toBe("ready"));
  stop = async () => {
    for (const fn of handlers) fn({ data: { type: "stop" } });
    await exited;
    delete process.parentPort;
  };
  return port;
}

/** A raw request that promises `length` bytes and sends `sent` of them, then waits; resolves what came back. */
function stalled(port, length, sent) {
  return new Promise((resolve) => {
    const sock = net.connect(port, "127.0.0.1", () => {
      sock.write(`POST /v1/houses HTTP/1.1\r\nHost: 127.0.0.1:${port}\r\nContent-Type: application/octet-stream\r\nContent-Length: ${length}\r\n\r\n`);
      sock.write(Buffer.alloc(sent, 1));
    });
    let text = "";
    sock.on("data", (b) => {
      text += b;
    });
    sock.on("close", () => resolve(text));
    sock.on("error", () => resolve(text));
  });
}

function post(port, path, chunks, gapMs = 0) {
  return new Promise((resolve, reject) => {
    const req = http.request({ host: "127.0.0.1", port, path, method: "POST", headers: { "content-type": "application/octet-stream", "transfer-encoding": "chunked" } }, (res) => {
      let text = "";
      res.on("data", (b) => {
        text += b;
      });
      res.on("end", () => resolve({ status: res.statusCode, text }));
    });
    req.on("error", reject);
    (async () => {
      for (const c of chunks) {
        req.write(c);
        if (gapMs) await new Promise((r) => setTimeout(r, gapMs));
      }
      req.end();
    })();
  });
}

test("a stalled upload is cut: its Content-Length's lie gets a 408, and the gate it held lets a Reset run", async () => {
  const gate = new MaintenanceGate({ exempt: ["/v1/data/reset"] }); // (as the kit's data router exempts its own)
  const port = await served(gate);
  const t0 = Date.now();
  const answer = stalled(port, 100_000, 100); // promises 100 kB, sends 100 bytes, waits
  await new Promise((r) => setTimeout(r, 50));
  const reset = await post(port, "/v1/data/reset", []);
  expect(reset.status).toBe(200); // not the 409 of a drain the write outlasted
  expect(Date.now() - t0).toBeLessThan(IDLE + 2000);
  const text = await answer;
  expect(text).toMatch(/^HTTP\/1\.1 408/);
  expect(text).toContain('"title":"Request Timeout"');
}, 15_000);

test("an upload that keeps flowing past the limit in all is never cut; a response that streams is never timed", async () => {
  const port = await served(new MaintenanceGate());
  // 8 chunks, each well inside the limit, the whole well past it
  const up = await post(port, "/v1/houses", Array.from({ length: 8 }, () => Buffer.alloc(1000, 1)), IDLE / 3);
  expect(up).toEqual({ status: 200, text: JSON.stringify({ got: 8000 }) });
  // the body arrived; the answer then quiet longer than the limit
  expect(await post(port, "/v1/ai/stream", ['{"x":1}'])).toEqual({ status: 200, text: "first last" });
}, 15_000);
