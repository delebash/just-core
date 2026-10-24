// SPDX-License-Identifier: MIT
// The family's error contract (app-structure §15): every error answer carries the request's
// id (the X-Request-Id header and `requestId` in the body), a 422 names each field with the
// limit it broke (`ctx`), and an unhandled exception answers the family's problem+json 500
// unless the app hands its own.
import { expect, test, vi } from "vitest";
import { abortError } from "../src/llm/base.js";
import { badRequest } from "../src/platform/errors.js";
import { getLogger } from "../src/platform/log.js";
import { T, opt } from "../src/platform/schema.js";
import { createServer, input } from "../src/platform/server.js";

const TYPE = "https://example.test/errors/";

const NoteIn = T.Object({
  title: T.String({ minLength: 3, maxLength: 20 }),
  stars: opt(T.Integer({ minimum: 1, maximum: 5 })),
});

function app(opts = {}) {
  const a = createServer({ typeBase: TYPE, ...opts });
  a.post("/v1/notes", input({ body: NoteIn }), (c) => c.json(c.req.valid("json")));
  a.get("/v1/refuse", () => {
    throw badRequest("nope");
  });
  a.get("/v1/crash", () => {
    throw new Error("disk on fire");
  });
  return a;
}

const post = (a, body, headers = {}) =>
  a.request("/v1/notes", { method: "POST", headers: { "content-type": "application/json", ...headers }, body: JSON.stringify(body) });

test("every answer carries a request id, in the header and in an error's body", async () => {
  const a = app();
  const ok = await post(a, { title: "Fine" });
  expect(ok.status).toBe(200);
  expect(ok.headers.get("x-request-id")).toMatch(/\S{8,}/);

  const r = await a.request("/v1/refuse");
  expect(r.status).toBe(400);
  const body = await r.json();
  expect(body.requestId).toBe(r.headers.get("x-request-id"));
});

test("an incoming X-Request-Id is kept", async () => {
  const r = await a422();
  expect(r.headers.get("x-request-id")).toBe("trace-123");
  expect((await r.json()).requestId).toBe("trace-123");
  async function a422() {
    return post(app(), { title: "x" }, { "x-request-id": "trace-123" });
  }
});

test("a 422 names each field and the limit it broke", async () => {
  const r = await post(app(), { title: "ab", stars: 9 });
  expect(r.status).toBe(422);
  expect(r.headers.get("content-type")).toMatch(/application\/problem\+json/);
  const body = await r.json();
  expect(body.errors).toEqual([
    { loc: ["body", "title"], msg: "String should have at least 3 characters", type: "string_too_short", ctx: { min_length: 3 } },
    { loc: ["body", "stars"], msg: "Input should be less than or equal to 5", type: "less_than_equal", ctx: { le: 5 } },
  ]);
});

test("a missing field has no ctx", async () => {
  const body = await (await post(app(), {})).json();
  expect(body.errors).toEqual([{ loc: ["body", "title"], msg: "Field required", type: "missing" }]);
});

test("an unhandled exception answers the family's problem+json 500", async () => {
  const r = await app().request("/v1/crash");
  expect(r.status).toBe(500);
  expect(r.headers.get("content-type")).toMatch(/application\/problem\+json/);
  expect(await r.json()).toEqual({
    type: `${TYPE}internal`,
    title: "Internal Server Error",
    status: 500,
    detail: "disk on fire",
    instance: "/v1/crash",
    requestId: r.headers.get("x-request-id"),
  });
});

test("the FastAPI-mode server answers the same 500", async () => {
  const r = await app({ errors: "fastapi" }).request("/v1/crash");
  expect(r.status).toBe(500);
  const body = await r.json();
  expect(body.title).toBe("Internal Server Error");
  expect(body.detail).toBe("disk on fire");
});

test("an app's own onUnhandled still wins", async () => {
  const r = await app({ onUnhandled: (err, c) => c.json({ mine: err.message }, 500) }).request("/v1/crash");
  expect(await r.json()).toEqual({ mine: "disk on fire" });
});

test("a client that left (Cancel) is a 499 logged at info, never the 500 — only when the abort is the client's", async () => {
  const log = getLogger("llm_runner.platform.errors");
  const info = vi.spyOn(log, "info");
  const error = vi.spyOn(log, "error");
  try {
    for (const mode of [{}, { errors: "fastapi" }]) {
      const a = createServer({ typeBase: TYPE, ...mode });
      const left = new AbortController();
      const brokeAfter = new AbortController();
      // the route passed the request's signal on and its run rejected when the client went
      a.get("/v1/run", () => {
        left.abort();
        throw abortError(left.signal);
      });
      // an abort with the client still there (the server's own timeout): its failure
      a.get("/v1/timeout", () => {
        throw Object.assign(new Error("the provider timed out"), { name: "AbortError" });
      });
      // the client went, but what broke was something else
      a.get("/v1/broken", () => {
        brokeAfter.abort();
        throw new Error("disk on fire");
      });
      const r = await a.request("/v1/run", { signal: left.signal });
      expect(r.status).toBe(499);
      expect(await r.text()).toBe("");
      expect((await a.request("/v1/timeout")).status).toBe(500);
      expect((await a.request("/v1/broken", { signal: brokeAfter.signal })).status).toBe(500);
    }
    const said = (spy, re) => spy.mock.calls.filter(([m]) => re.test(m)).length;
    expect(said(info, /^GET \/v1\/run -> 499: the client left/)).toBe(2);
    expect(said(error, /\/v1\/run/)).toBe(0);
    expect(said(error, /^GET \/v1\/timeout -> 500: unhandled/)).toBe(2);
    expect(said(error, /^GET \/v1\/broken -> 500: unhandled/)).toBe(2);
  } finally {
    info.mockRestore();
    error.mockRestore();
  }
});

test("the schema helpers load without Node's built-ins (a form imports them in the browser)", async () => {
  const { readFileSync } = await import("node:fs");
  const src = readFileSync(new URL("../src/platform/schema.js", import.meta.url), "utf8");
  const imports = [...src.matchAll(/^import .* from "([^"]+)";/gm)].map((m) => m[1]);
  expect(imports).toEqual(["typebox"]);
});
