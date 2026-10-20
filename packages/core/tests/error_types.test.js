// SPDX-License-Identifier: MIT
// The family's error answers say where and what (errors.js — the twentieth review: a bad path or query said "Request
// body failed validation.", and 405, 409, 502 and 503 were all typed "error").
import { expect, test } from "vitest";
import { HttpError } from "../src/platform/errors.js";
import { T } from "../src/platform/models.js";
import { createServer, input } from "../src/platform/server.js";

function app() {
  const a = createServer({ typeBase: "t/" });
  a.get("/v1/things/:n", input({ params: T.Object({ n: T.Integer() }), querystring: T.Object({ limit: T.Integer() }) }), (c) => c.json({ ok: true }));
  a.post("/v1/things", input({ body: T.Object({ name: T.String() }) }), (c) => c.json({ ok: true }));
  for (const status of [405, 409, 502, 503]) a.get(`/v1/fail/${status}`, () => {
    throw new HttpError(status, `failed with ${status}`);
  });
  return a;
}

test("a 422 says which part failed: the path, the query, the body", async () => {
  const a = app();
  let r = await a.request("/v1/things/abc?limit=1");
  expect(await r.json()).toMatchObject({ status: 422, detail: "Request path failed validation.", errors: [{ loc: ["path", "n"] }] });
  r = await a.request("/v1/things/1?limit=lots");
  expect(await r.json()).toMatchObject({ status: 422, detail: "Request query failed validation.", errors: [{ loc: ["query", "limit"] }] });
  r = await a.request("/v1/things", { method: "POST", headers: { "content-type": "application/json" }, body: "{}" });
  expect(await r.json()).toMatchObject({ status: 422, detail: "Request body failed validation.", errors: [{ loc: ["body", "name"] }] });
});

test("405, 409, 502 and 503 each have their own problem type and title", async () => {
  const a = app();
  const want = { 405: ["method-not-allowed", "Method Not Allowed"], 409: ["conflict", "Conflict"], 502: ["bad-gateway", "Bad Gateway"], 503: ["service-unavailable", "Service Unavailable"] };
  for (const [status, [slug, title]] of Object.entries(want)) {
    const r = await a.request(`/v1/fail/${status}`);
    expect(r.status).toBe(Number(status));
    expect(await r.json()).toMatchObject({ type: `t/${slug}`, title, status: Number(status), detail: `failed with ${status}` });
  }
});
