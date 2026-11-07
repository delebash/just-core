// SPDX-License-Identifier: MIT
// The person's own plans as providers (the user's go, 2026-11-07): Sign in with ChatGPT's requests and token table,
// the usage ledger's plan rows, the provider routes (sign-in, plan, detecting Claude Code) and the plan a provider
// draws on. The sign-in itself needs a person at OpenAI's page — checked by hand, not here.
import { afterEach, expect, test, vi } from "vitest";

const prog = vi.hoisted(() => ({ status: { name: "Claude Code", command: "claude", installed: true, path: "C:\\x\\claude.exe", signedIn: true, plan: "max", detail: null } }));
vi.mock("../src/llm/programs.js", async (importOriginal) => ({
  ...(await importOriginal()),
  programStatus: async () => prog.status,
}));

const { planKwargs, OpenAISDKAdapter, PLAN_OMITTED } = await import("../src/llm/openai_sdk.js");
const { clearTokens, getSignin, isSignedIn, saveSignin, signinSummary } = await import("../src/llm/signins.js");
const { providerPlan } = await import("../src/llm/plans.js");
const { DbUsageSink } = await import("../src/llm/usage_sink.js");
const { UsageEntry } = await import("../src/llm/usage.js");
const { makeProviderRouter } = await import("../src/llm/provider_api.js");
const { getLlmRegistry } = await import("../src/llm/registry.js");
const { seedRowsForType } = await import("../src/llm/reasoning_map_api.js");
const db = await import("../src/llm/db.js");
const { createServer } = await import("../src/platform/server.js");
const { freshDb } = await import("./helpers.js");

afterEach(() => db.configureStorage(null));

const signedIn = { method: "chatgpt", client_id: "app_issued", host_id: "host-1", email: "me@example.com", subject: "user-1", id_token: "idt", access_token: "at", refresh_token: "rt", expires_at: Date.now() + 3600_000, scopes: "openid chatgpt.tokens.use.direct" };

test("a ChatGPT-plan request leaves out what OpenAI's plan rules forbid and never stores", () => {
  const k = planKwargs({ model: "gpt-5", input: "hi", instructions: "sys", temperature: 0.3, top_p: 0.9, max_output_tokens: 99, user: "u", metadata: {}, store: true, text: { format: { type: "json_object" } } });
  for (const key of PLAN_OMITTED) expect(k).not.toHaveProperty(key);
  expect(k).toEqual({ model: "gpt-5", input: "hi", instructions: "sys", store: false, text: { format: { type: "json_object" } } });
});

test("a plan's usage error says where its cap is set", async () => {
  const a = new OpenAISDKAdapter("oa", "openai", { apiKey: "" });
  const err = await a._d10(new Error("429 subscription_sharing_usage_limit_exceeded"));
  expect(err.message).toMatch(/ChatGPT → Settings → Usage → App limits/);
});

test("the sign-in row: signed in while it holds a refresh token; sign-out keeps the registration, drops the tokens", () => {
  freshDb();
  expect(getSignin("oa")).toBe(null);
  expect(signinSummary("oa")).toBe(null);
  db.session().insert("llm_providers", { id: "oa", name: "OpenAI", kind: "llm", built_in: false, position: 0, provider_type: "openai", base_url: "", api_key: null, default_model: "", embedding_model: "", timeout_seconds: 60, local: false });
  saveSignin("oa", signedIn);
  expect(isSignedIn(getSignin("oa"))).toBe(true);
  expect(signinSummary("oa")).toEqual({ method: "chatgpt", email: "me@example.com", signedIn: true });
  expect(providerPlan({ id: "oa", providerType: "openai" })).toEqual({ plan: "chatgpt", used: null, window: null, resetsAt: null });
  clearTokens("oa");
  const row = getSignin("oa");
  expect([row.access_token, row.refresh_token, row.client_id, row.host_id, row.id_token]).toEqual(["", "", "app_issued", "host-1", "idt"]);
  expect(signinSummary("oa").signedIn).toBe(false);
  expect(providerPlan({ id: "oa", providerType: "openai" }), "signed out: billed per call again").toBe(null);
  expect(providerPlan({ id: "cc", providerType: "claude-code" })).toMatchObject({ plan: "claude" });
  expect(providerPlan({ id: "x", providerType: "anthropic" })).toBe(null);
});

test("a call on a plan is recorded at no cost, its API-price estimate kept beside it", () => {
  freshDb();
  const sink = new DbUsageSink();
  sink.record(UsageEntry({ feature: "f", model: "claude-haiku-5-5", prompt_tokens: 752, completion_tokens: 9, duration_ms: 5, ok: true, provider_id: "cc", plan: "claude", estimate_usd: 0.0012 }));
  sink.record(UsageEntry({ feature: "f", model: "gpt-x", prompt_tokens: 10, completion_tokens: 10, duration_ms: 5, ok: true, provider_id: "oa", plan: "chatgpt" }));
  const rows = db.session().all("select * from llm_usage order by provider_id", [], "llm_usage");
  expect(rows.map((r) => r.cost)).toEqual([0, 0]);
  const meta = rows.map((r) => JSON.parse(r.meta));
  expect(meta[0]).toMatchObject({ plan: "claude", estimateUsd: 0.0012 });
  expect(meta[1]).toMatchObject({ plan: "chatgpt" });
  expect(sink.snapshot().total_cost).toBe(0);
});

test("Claude Code speaks effort words at every level", () => {
  expect(seedRowsForType("claude-code").map((r) => [r.level, r.word, r.tokens])).toEqual([
    ["low", "low", null], ["medium", "medium", null], ["high", "high", null], ["xhigh", "xhigh", null], ["max", "max", null],
  ]);
});

class MemStore {
  constructor(rows = []) {
    this.rows = rows;
  }
  list() {
    return [...this.rows];
  }
  get(pid) {
    return this.rows.find((p) => p.id === pid) ?? null;
  }
  add(cfg) {
    this.rows.push(cfg);
  }
  replace(pid, cfg) {
    this.rows = this.rows.map((p) => (p.id === pid ? cfg : p));
  }
  remove(pid) {
    this.rows = this.rows.filter((p) => p.id !== pid);
  }
}

function client(store) {
  getLlmRegistry()._adapters = new Map();
  const app = createServer({ typeBase: "https://example.test/errors/" });
  app.route("/", makeProviderRouter(() => store));
  return {
    get: (url) => app.request(url, { method: "GET" }),
    post: (url, body) => app.request(url, { method: "POST", body: JSON.stringify(body), headers: { "content-type": "application/json" } }),
    delete: (url) => app.request(url, { method: "DELETE" }),
  };
}

test("the routes: Claude Code is created keyless and offered when found; sign-in is for an OpenAI provider only", async () => {
  const store = new MemStore();
  const c = client(store);
  let det = (await (await c.get("/v1/llm-providers/detect-local?programs=1")).json()).detected.filter((d) => d.program);
  expect(det).toEqual([{ providerType: "claude-code", name: "Claude Code", baseUrl: "", models: ["sonnet", "opus", "haiku", "fable"], alreadyRegistered: false, program: { path: "C:\\x\\claude.exe", signedIn: true, plan: "max", detail: null } }]);
  expect((await (await c.get("/v1/llm-providers/detect-local")).json()).detected.some((d) => d.program), "only when asked").toBe(false);
  const r = await c.post("/v1/llm-providers", { name: "Your Claude plan (through Claude Code)", providerType: "claude-code", local: false });
  expect(r.status).toBe(201);
  expect(await r.json()).toMatchObject({ id: "your-claude-plan-through-claude-code", plan: "claude", signin: null, registered: true, hasApiKey: false });
  det = (await (await c.get("/v1/llm-providers/detect-local?programs=1")).json()).detected.filter((d) => d.program);
  expect(det[0].alreadyRegistered).toBe(true);
  const plan = await (await c.get("/v1/llm-providers/your-claude-plan-through-claude-code/plan")).json();
  expect(plan).toMatchObject({ plan: { plan: "claude" }, program: { installed: true, signedIn: true, plan: "max" } });
  expect((await c.post("/v1/llm-providers/your-claude-plan-through-claude-code/signin", {})).status).toBe(400);
  expect((await c.get("/v1/llm-providers/nope/signin")).status).toBe(404);
});
