// SPDX-License-Identifier: MIT
// uploadLimit: an upload's size checked as it streams in (hono/body-limit), the family's 413 past it.
import { expect, test } from "vitest";
import { createServer, uploadLimit } from "../src/platform/server.js";

function app(max) {
  const a = createServer({ typeBase: "t/" });
  a.post("/up", uploadLimit(max, { slug: "photo-too-large", title: "Photo too large" }), async (c) => c.json({ got: (await c.req.arrayBuffer()).byteLength }));
  return a;
}

test("under the limit the route reads its body; over it, a 413 problem before the route runs", async () => {
  const a = app(1000);
  expect(await (await a.request("/up", { method: "POST", body: new Uint8Array(900) })).json()).toEqual({ got: 900 });
  const r = await a.request("/up", { method: "POST", body: new Uint8Array(1001) });
  expect(r.status).toBe(413);
  expect(await r.json()).toMatchObject({ type: "t/photo-too-large", title: "Photo too large", status: 413, limit: 1000 });
});

test("the limit can be read on each request (a setting the user changes)", async () => {
  let max = 10;
  const a = app(() => max);
  expect((await a.request("/up", { method: "POST", body: new Uint8Array(20) })).status).toBe(413);
  max = 100;
  expect((await a.request("/up", { method: "POST", body: new Uint8Array(20) })).status).toBe(200);
});
