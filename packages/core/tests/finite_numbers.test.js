// SPDX-License-Identifier: MIT
// A JSON body can't carry Infinity, but JSON.parse turns a literal past a double's range (1e400) into one — a settings
// value of 1e400 was stored as null (the nineteenth review's fuzz). Every body the kit reads (input()'s and readJson's,
// plain and with the float opt-in) refuses it: 422, pydantic's words, at the field's place.
import { expect, test } from "vitest";
import { createServer, input, readJson } from "../src/platform/server.js";

const BODY = { type: "object", properties: { value: {}, list: { type: "array" } } };

function app(options = {}) {
  const a = createServer({ typeBase: "t/", ...options });
  a.patch("/v1/settings", input({ body: BODY }), (c) => c.json({ got: c.req.valid("json") }));
  a.patch("/v1/prefs", async (c) => c.json({ got: (await readJson(c)) ?? null }));
  return a;
}
const send = (a, url, text) => a.request(url, { method: "PATCH", headers: { "content-type": "application/json" }, body: text });

test("1e400 in a schema'd body, a free field and a nested list: 422 at its place, nothing reaches the route", async () => {
  const a = app();
  let r = await send(a, "/v1/settings", '{"value": 1e400}');
  expect(r.status).toBe(422);
  expect((await r.json()).errors).toEqual([{ loc: ["body", "value"], msg: "Input should be a finite number", type: "finite_number" }]);
  r = await send(a, "/v1/settings", '{"list": [1, {"deep": [-1e999]}]}');
  expect((await r.json()).errors).toEqual([{ loc: ["body", "list", "1", "deep", "0"], msg: "Input should be a finite number", type: "finite_number" }]);
  // a route with no schema (prefs)
  r = await send(a, "/v1/prefs", '{"pref.zoom": 1e400}');
  expect(r.status).toBe(422);
  expect((await r.json()).errors[0].loc).toEqual(["body", "pref.zoom"]);
  // the body itself
  expect((await send(a, "/v1/prefs", "1e400")).status).toBe(422);
});

test("finite numbers, the largest double and whole-number floats pass as before", async () => {
  const a = app();
  expect(await (await send(a, "/v1/settings", '{"value": 1.7976931348623157e308, "list": [0, -2.5, 1e-400]}')).json()).toEqual({
    got: { value: 1.7976931348623157e308, list: [0, -2.5, 0] },
  });
  // the float opt-in (pyFloats): 1.0 kept a float, 1e400 refused the same
  const p = app({ pyFloats: { routes: ["PATCH /v1/prefs"] } });
  expect(await (await send(p, "/v1/prefs", '{"x": 1.0}')).text()).toBe('{"got":{"x":1}}');
  expect((await send(p, "/v1/prefs", '{"x": 1e400}')).status).toBe(422);
});

test("FastAPI's own answers (an app that never took problem+json) say it the same", async () => {
  const a = app({ errors: "fastapi" });
  const r = await send(a, "/v1/settings", '{"value": [1e400]}');
  expect(r.status).toBe(422);
  expect(await r.json()).toEqual({ detail: [{ type: "finite_number", loc: ["body", "value", 0], msg: "Input should be a finite number", input: null }] });
});

test("a body nested thousands deep is walked without running out of stack", async () => {
  const a = app();
  const deep = `${"[".repeat(5000)}1e400${"]".repeat(5000)}`;
  const r = await send(a, "/v1/prefs", deep);
  expect(r.status).toBe(422);
  expect((await r.json()).errors[0].loc).toHaveLength(5001);
});
