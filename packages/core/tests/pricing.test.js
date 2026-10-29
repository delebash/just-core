// SPDX-License-Identifier: MIT
// Port of tests/test_pricing.py — cloud pricing lives in the DB: priceFor reads the live
// model_pricing table (seeded from DEFAULT_PRICING), and operator edits take effect.
import { expect, test } from "vitest";
import * as pricing from "../src/llm/pricing.js";
import { makePricingRouter } from "../src/llm/pricing_api.js";
import * as seed from "../src/llm/seed.js";
import * as stores from "../src/llm/stores.js";
import { createServer } from "../src/platform/server.js";
import { freshDb } from "./helpers.js";

function freshSeeded() {
  const h = freshDb();
  h.tx(() => seed.seedDefaultPricing(h));
}

test("price_for reads seeded db", () => {
  freshSeeded();
  expect(pricing.priceFor("gpt-5")).toEqual([...pricing.DEFAULT_PRICING["gpt-5"], 0, 0]); // (no cache rates: 0)
  // dated suffix → prefix match (as before, but now from the DB)
  expect(pricing.priceFor("gpt-5-2026-01-01")).toEqual([...pricing.DEFAULT_PRICING["gpt-5"], 0, 0]);
  // unknown / local model → null (cost 0)
  expect(pricing.priceFor("some-local-model")).toBeNull();
});

test("price_for reflects edits and deletes", () => {
  freshSeeded();
  stores.getPricingStore().upsert({ modelId: "gpt-5", inputPerM: 99.0, outputPerM: 88.0 });
  expect(pricing.priceFor("gpt-5")).toEqual([99.0, 88.0, 0, 0]); // edit takes effect
  stores.getPricingStore().delete("gpt-5");
  expect(pricing.priceFor("gpt-5")).toBeNull(); // delete → cost 0
});

test("pricing store lowercases and lists", () => {
  freshSeeded();
  const st = stores.getPricingStore();
  st.upsert({ modelId: "MyCloud-X", inputPerM: 1.0, outputPerM: 2.0 });
  const row = st.list().find((r) => r.modelId === "mycloud-x");
  expect(row.inputPerM).toBe(1.0);
  expect(row.outputPerM).toBe(2.0);
  expect(pricing.priceFor("MyCloud-X")).toEqual([1.0, 2.0, 0, 0]); // case-insensitive
});

// Not in the Python file: the router's answers, including FastAPI's 422 and 400 shapes.
test("the pricing router answers as FastAPI did", async () => {
  freshSeeded();
  const app = createServer({ typeBase: "https://example.test/errors/" });
  app.route("/", makePricingRouter(stores.getPricingStore));
  const put = (payload) =>
    app.request("/v1/ai/pricing", { method: "PUT", body: JSON.stringify(payload), headers: { "content-type": "application/json" } });
  let r = await put({ modelId: "x-1", inputPerM: "2.5", junk: 1 });
  expect(r.status).toBe(200);
  expect((await r.json()).rows.find((x) => x.modelId === "x-1")).toEqual({ modelId: "x-1", inputPerM: 2.5, outputPerM: 0, cacheWritePerM: 0, cacheReadPerM: 0 });
  r = await put({ inputPerM: 1 });
  expect(r.status).toBe(422);
  expect(r.headers.get("content-type")).toMatch(/application\/problem\+json/);
  expect(await r.json()).toEqual({
    type: "https://example.test/errors/validation-error",
    title: "Validation Error",
    status: 422,
    detail: "Request body failed validation.",
    errors: [{ loc: ["body", "modelId"], msg: "Field required", type: "missing" }],
    instance: "/v1/ai/pricing",
    requestId: expect.any(String),
  });
  r = await put({ modelId: "  " });
  expect(r.status).toBe(400);
  expect(await r.json()).toMatchObject({ type: "https://example.test/errors/bad-request", detail: "modelId is required" });
  r = await app.request("/v1/ai/pricing?modelId=X-1", { method: "DELETE", headers: { "content-type": "application/json" } });
  expect(r.status).toBe(200);
  expect((await r.json()).rows.some((x) => x.modelId === "x-1")).toBe(false);
  r = await app.request("/v1/ai/pricing", { method: "DELETE" });
  expect(r.status).toBe(422);
  expect((await r.json()).errors).toEqual([{ loc: ["query", "modelId"], msg: "Field required", type: "missing" }]);
  r = await app.request("/v1/nothing-here", { method: "GET" });
  expect(r.status).toBe(404);
  expect(await r.json()).toEqual({ detail: "Not Found" });
});

// The finish list's C28: a cached prompt is priced at the model's own cache rates — writes and reads per model
// (Anthropic's pricing page, read 2026-10-29: Opus 5.5 writes $5, reads $0.20 per MTok — not one multiplier for all);
// a model with no cache rate prices its cache tokens at its input rate (never under-reported).
test("cost counts cache writes and reads at the model's own rates", () => {
  freshDb();
  seed.seedLlm();
  // 10,000 prompt tokens: 2,000 written to the cache, 7,000 read from it, 1,000 plain; 500 out
  const c = pricing.costFor("claude-opus-5-5", 10_000, 500, { cacheWrite: 2000, cacheRead: 7000 });
  expect(c).toBeCloseTo((1000 * 4 + 2000 * 5 + 7000 * 0.2 + 500 * 20) / 1e6, 10);
  stores.getPricingStore().upsert({ modelId: "plain-model", inputPerM: 1, outputPerM: 2 });
  expect(pricing.costFor("plain-model", 10_000, 0, { cacheWrite: 2000, cacheRead: 7000 })).toBeCloseTo(10_000 / 1e6, 10);
  // the rates round-trip through the store, and a seeded row's empty rates take the seed's on the next seed
  stores.getPricingStore().upsert({ modelId: "plain-model", inputPerM: 1, outputPerM: 2, cacheWritePerM: 1.25, cacheReadPerM: 0.1 });
  expect(stores.getPricingStore().asMap()["plain-model"]).toEqual([1, 2, 1.25, 0.1]);
});
