// SPDX-License-Identifier: MIT
// The JSON body limit (platform/server.js): hono/body-limit on the JSON-reading path — a body
// over the app's limit answers the family's 413, by its Content-Length or as it streams in; a
// route that reads no JSON body is not limited. The last tests go through the real server
// (platform/serve.js on @hono/node-server): `app.request` hands the app a platform Request, the
// adapter its own lightweight one, and a body with no Content-Length took a path only the
// adapter's could break (2026-10-17: 500 "Cannot read private member #state").
import http from "node:http";
import net from "node:net";
import { afterEach, expect, test, vi } from "vitest";
import { opt, T } from "../src/platform/models.js";
import { runServer } from "../src/platform/serve.js";
import { createServer, input, readJson } from "../src/platform/server.js";

afterEach(() => {
  delete process.parentPort;
});

const LIMIT = 64;

function app() {
  const a = createServer({ typeBase: "t/", bodyLimit: LIMIT });
  a.post("/model", input({ body: T.Object({ s: opt(T.String(), "") }) }), (c) => c.json(c.req.valid("json")));
  a.post("/free", async (c) => c.json((await readJson(c)) ?? null));
  // An upload route reads its own body — no JSON limit applies.
  a.post("/upload", async (c) => c.json({ bytes: (await c.req.arrayBuffer()).byteLength }));
  return a;
}

const json = { "content-type": "application/json" };
const big = JSON.stringify({ s: "x".repeat(LIMIT * 2) });

test("a JSON body under the limit is read", async () => {
  const r = await app().request("/model", { method: "POST", headers: json, body: JSON.stringify({ s: "ok" }) });
  expect(r.status).toBe(200);
  expect(await r.json()).toEqual({ s: "ok" });
});

test("a JSON body over the limit answers 413, by its Content-Length", async () => {
  for (const url of ["/model", "/free"]) {
    const r = await app().request(url, {
      method: "POST",
      headers: { ...json, "content-length": String(big.length) },
      body: big,
    });
    expect(r.status).toBe(413);
    expect(await r.json()).toEqual({ detail: "Request body is too large" });
  }
});

test("a streamed JSON body over the limit answers 413", async () => {
  const body = new ReadableStream({
    start(ctrl) {
      ctrl.enqueue(new TextEncoder().encode(big));
      ctrl.close();
    },
  });
  const r = await app().request("/free", { method: "POST", headers: json, body, duplex: "half" });
  expect(r.status).toBe(413);
});

test("an upload route is not limited", async () => {
  const r = await app().request("/upload", {
    method: "POST",
    headers: { "content-type": "application/octet-stream" },
    body: new Uint8Array(LIMIT * 4),
  });
  expect(r.status).toBe(200);
  expect(await r.json()).toEqual({ bytes: LIMIT * 4 });
});

/** The app on the real server, as the desktop app runs it; resolves {port, stop}. */
async function served() {
  const probe = net.createServer();
  await new Promise((r) => probe.listen(0, "127.0.0.1", r));
  const { port } = probe.address();
  await new Promise((r) => probe.close(r));
  const posted = [];
  const handlers = [];
  process.parentPort = { on: (_ev, fn) => handlers.push(fn), postMessage: (m) => posted.push(m) };
  const exited = new Promise((resolve) => vi.spyOn(process, "exit").mockImplementation((code) => resolve(code)));
  runServer({ argv: ["serve"], envPrefix: null, log: { error() {}, info() {} }, build: async () => ({ app: app(), host: "127.0.0.1", port }) });
  await vi.waitFor(() => expect(posted[0]?.type).toBe("ready"));
  const stop = async () => {
    for (const fn of handlers) fn({ data: { type: "stop" } });
    await exited;
  };
  return { port, stop };
}

/** One request with Node's own client; chunks are written as they are (Transfer-Encoding: chunked). */
function send(port, path, chunks) {
  return new Promise((resolve, reject) => {
    const req = http.request({ host: "127.0.0.1", port, path, method: "POST", headers: { ...json, "transfer-encoding": "chunked" } }, (res) => {
      let text = "";
      res.on("data", (b) => {
        text += b;
      });
      res.on("end", () => resolve({ status: res.statusCode, text }));
    });
    req.on("error", reject);
    for (const c of chunks) req.write(c);
    req.end();
  });
}

test("through the real server, a chunked JSON body under the limit is read", async () => {
  const { port, stop } = await served();
  try {
    for (const url of ["/model", "/free"]) {
      const r = await send(port, url, ['{"s":', '"ok"}']);
      expect([r.status, JSON.parse(r.text)]).toEqual([200, { s: "ok" }]);
    }
  } finally {
    await stop();
  }
});

test("through the real server, a chunked JSON body over the limit answers 413", async () => {
  const { port, stop } = await served();
  try {
    const r = await send(port, "/free", [big.slice(0, 50), big.slice(50)]);
    expect([r.status, JSON.parse(r.text)]).toEqual([413, { detail: "Request body is too large" }]);
  } finally {
    await stop();
  }
});
