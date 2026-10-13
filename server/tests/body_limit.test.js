// SPDX-License-Identifier: MIT
// The JSON body limit (platform/server.js): hono/body-limit on the JSON-reading path — a body
// over the app's limit answers the family's 413, by its Content-Length or as it streams in; a
// route that reads no JSON body is not limited.
import { expect, test } from "vitest";
import { opt, T } from "../src/platform/models.js";
import { createServer, input, readJson } from "../src/platform/server.js";

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
