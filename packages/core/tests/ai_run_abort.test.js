// SPDX-License-Identifier: MIT
// An AI run whose caller leaves is aborted (the twenty-first review: Cancel on the app's "Suggest schemes" left the run
// going — runAction took no signal, the provider's request ran to the end and the app's local-AI hold stayed). Through
// the real server (@hono/node-server, as the desktop app runs it): a client that disconnects mid-run aborts the
// provider's request — a fake OpenAI-compatible provider that never answers records it — and the route answers the
// client as gone (nothing logged as a failure). runAction's own `signal` the same, for an app's in-server run.
import http from "node:http";
import net from "node:net";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { isAbortError } from "../src/llm/base.js";
import { OpenAICompatAdapter } from "../src/llm/openai_compat.js";
import { makeFeatureRouter, runAction } from "../src/llm/prompts.js";
import { getLlmRegistry } from "../src/llm/registry.js";
import { LLMConfig } from "../src/llm/schema.js";
import { runServer } from "../src/platform/serve.js";
import { createServer } from "../src/platform/server.js";
import { freshDb } from "./helpers.js";

const STORE = { get: () => null, list: () => [] }; // the promptless door: the body's own system and template
const RUN = { action: "probe", system: "s", userTemplate: "u" };

/** An OpenAI-compatible provider that takes a chat request and never answers — and says when its caller left. */
async function silentProvider() {
  const seen = { started: 0, aborted: 0 };
  const srv = http.createServer((req, res) => {
    seen.started += 1;
    req.resume();
    res.on("close", () => {
      if (!res.writableEnded) seen.aborted += 1;
    });
  });
  await new Promise((r) => srv.listen(0, "127.0.0.1", r));
  return { seen, url: `http://127.0.0.1:${srv.address().port}/v1`, close: () => new Promise((r) => srv.close(r)) };
}

let provider;
beforeEach(async () => {
  freshDb({ foreignKeys: false });
  provider = await silentProvider();
  getLlmRegistry()._adapters = new Map();
  getLlmRegistry().register(new OpenAICompatAdapter("fake", "openai-compat", { baseUrl: provider.url, defaultModel: "m", timeoutSeconds: 60 }));
});
afterEach(async () => {
  provider.server?.closeAllConnections?.();
  await provider.close();
  delete process.parentPort;
});

for (const path of ["/v1/ai/run", "/v1/ai/stream"]) test(`${path}: a client that leaves mid-run aborts the provider's request; nothing failed`, async () => {
  const app = createServer({ typeBase: "t/" });
  app.route("/", makeFeatureRouter(() => STORE, () => LLMConfig()));
  const probe = net.createServer();
  await new Promise((r) => probe.listen(0, "127.0.0.1", r));
  const { port } = probe.address();
  await new Promise((r) => probe.close(r));
  const posted = [];
  const handlers = [];
  process.parentPort = { on: (_ev, fn) => handlers.push(fn), postMessage: (m) => posted.push(m) };
  const exited = new Promise((resolve) => vi.spyOn(process, "exit").mockImplementation((code) => resolve(code)));
  const errors = [];
  runServer({ argv: ["serve"], envPrefix: null, log: { error: (x) => errors.push(String(x)), info() {} }, build: async () => ({ app, host: "127.0.0.1", port }) });
  await vi.waitFor(() => expect(posted[0]?.type).toBe("ready"));
  try {
    const req = http.request({ host: "127.0.0.1", port, path, method: "POST", headers: { "content-type": "application/json" } });
    req.on("error", () => {});
    req.end(JSON.stringify(RUN));
    await vi.waitFor(() => expect(provider.seen.started).toBe(1));
    req.destroy(); // the user pressed Cancel (the page's fetch aborted)
    await vi.waitFor(() => expect(provider.seen.aborted).toBe(1), { timeout: 5000 });
    expect(errors.filter((e) => /500|unhandled/i.test(e))).toEqual([]);
  } finally {
    for (const fn of handlers) fn({ data: { type: "stop" } });
    await exited;
  }
}, 20_000);

test("runAction's own signal: aborted, the provider's request goes and the run rejects with an AbortError", async () => {
  const ctl = new AbortController();
  const run = runAction(STORE, LLMConfig(), RUN, { signal: ctl.signal });
  await vi.waitFor(() => expect(provider.seen.started).toBe(1));
  ctl.abort();
  const err = await run.catch((e) => e);
  expect(isAbortError(err)).toBe(true);
  await vi.waitFor(() => expect(provider.seen.aborted).toBe(1), { timeout: 5000 });
  // an abort before the run: never sent
  const gone = new AbortController();
  gone.abort();
  expect(isAbortError(await runAction(STORE, LLMConfig(), RUN, { signal: gone.signal }).catch((e) => e))).toBe(true);
  expect(provider.seen.started).toBe(1);
}, 20_000);
