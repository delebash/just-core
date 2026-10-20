// SPDX-License-Identifier: MIT
// This computer's own addresses never go through a proxy, headless too (2026-10-20, just-house-paint's fifteenth
// review — the reviewer's proxy_loopback.mjs: a server started on its own with the user's HTTP_PROXY and no NO_PROXY
// sent its call to the local AI engine at 127.0.0.1 to the proxy: "502 via proxy"). And a file's time compared with
// rsync's tolerance (file_time.js).
import http from "node:http";
import { afterEach, expect, test, vi } from "vitest";
import { MTIME_WINDOW_MS, sameFileTime } from "../src/platform/file_time.js";
import { LOOPBACK, noProxyWithLoopback, withLoopback } from "../src/platform/no_proxy.js";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

test("loopback added to a NO_PROXY list once, the environment's own kept", () => {
  expect(LOOPBACK).toEqual(["localhost", "127.0.0.1", "::1"]);
  expect(withLoopback("")).toBe("localhost,127.0.0.1,::1");
  expect(withLoopback("intranet.corp 127.0.0.1")).toBe("intranet.corp,127.0.0.1,localhost,::1");
  expect(noProxyWithLoopback({ no_proxy: "a.corp", NO_PROXY: "b.corp" })).toBe("a.corp,localhost,127.0.0.1,::1"); // undici reads no_proxy first
  expect(noProxyWithLoopback({ NO_PROXY: "b.corp" })).toBe("b.corp,localhost,127.0.0.1,::1");
});

/** A proxy that answers every request itself, and a local engine; `run(urlOf)` with both listening. */
async function withProxyAndEngine(run) {
  const hits = [];
  const proxy = http.createServer((req, res) => {
    hits.push(req.url);
    res.writeHead(502);
    res.end("via proxy");
  });
  const engine = http.createServer((_req, res) => res.end("direct"));
  await new Promise((r) => proxy.listen(0, "127.0.0.1", r));
  await new Promise((r) => engine.listen(0, "127.0.0.1", r));
  try {
    vi.stubEnv("HTTP_PROXY", `http://127.0.0.1:${proxy.address().port}`);
    vi.stubEnv("http_proxy", undefined);
    vi.stubEnv("NO_PROXY", undefined);
    vi.stubEnv("no_proxy", undefined);
    await run(`http://127.0.0.1:${engine.address().port}/v1/models`);
  } finally {
    await new Promise((r) => proxy.close(r));
    await new Promise((r) => engine.close(r));
  }
  return hits;
}

test("the kit's fetch reaches the local engine directly past a user's own HTTP_PROXY, with no NO_PROXY set", async () => {
  const hits = await withProxyAndEngine(async (url) => {
    const { fetch } = await import("../src/platform/http.js"); // its agent made now, with this environment
    const r = await fetch(url, { timeoutMs: 5000 });
    expect(r.status).toBe(200);
    expect(await r.text()).toBe("direct");
  });
  expect(hits).toEqual([]);
});

test("the AI adapters' agents too (llm/base.js agentFor)", async () => {
  const hits = await withProxyAndEngine(async (url) => {
    const base = await import("../src/llm/base.js");
    const { fetch } = await import("undici");
    const r = await fetch(url, { dispatcher: base.agentFor(5), signal: AbortSignal.timeout(5000) });
    expect(await r.text()).toBe("direct");
  });
  expect(hits).toEqual([]);
});

test("a file's time is the recorded one within 2 s (rsync's --modify-window; FAT's resolution)", () => {
  expect(MTIME_WINDOW_MS).toBe(2000);
  // the reviewer's mtime_cp.mjs: NTFS's 100 ns read back after fs.cp set milliseconds
  expect(sameFileTime(1792495822578.5093, 1792495822579)).toBe(true);
  expect(sameFileTime(1000, 3000)).toBe(true);
  expect(sameFileTime(1000, 3001)).toBe(false);
  expect(sameFileTime(undefined, 1000)).toBe(false);
});
