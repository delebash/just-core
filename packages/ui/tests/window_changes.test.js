// SPDX-License-Identifier: MIT
// Another window's changes (just-house-paint, 2026-10-20 — two windows on one server overwrote each
// other's work unseen): with `sendClientId` every request carries this window's id, so the server
// counts only the other windows' changes; the kit's watchSync calls the app with the server's answer,
// and waits while the app says so (a stroke or its save in flight) — the change lands at the first
// check after.
import { afterEach, describe, expect, test, vi } from "vitest";
import { configureServerApi } from "../src/common/services/serverApi.js";
import { watchSync } from "../src/common/services/syncWatch.js";
import { clientId, serverFetch } from "../src/common/services/transport.js";

afterEach(() => {
  configureServerApi({ sendClientId: false });
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("this window's id", () => {
  test("every request carries it once the app asks, never over the caller's own, and none before", async () => {
    const sent = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_input, init) => {
        sent.push(new Headers(init?.headers).get("x-client-id"));
        return new Response("{}");
      }),
    );
    await serverFetch("http://127.0.0.1:1/v1/x");
    configureServerApi({ sendClientId: true });
    await serverFetch("http://127.0.0.1:1/v1/x", { method: "POST" });
    await serverFetch("http://127.0.0.1:1/v1/x", { headers: { "X-Client-Id": "mine" } });
    expect(sent).toEqual([null, clientId(), "mine"]);
    expect(clientId()).toMatch(/^[\w-]{8,}$/);
  });
});

describe("watchSync", () => {
  test("a change waits while the app says so, then lands with the server's answer", async () => {
    vi.useFakeTimers();
    configureServerApi({ resolveBase: () => "http://127.0.0.1:1" });
    let rev = 1;
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ rev, pollSeconds: 1, epoch: "e1" }), { headers: { "content-type": "application/json" } })));
    const seen = [];
    let busy = false;
    const stop = watchSync((r) => seen.push(r), { waitWhile: () => busy });
    await vi.advanceTimersByTimeAsync(10); // the first answer is where it starts
    rev = 2;
    busy = true;
    await vi.advanceTimersByTimeAsync(1000);
    await vi.advanceTimersByTimeAsync(1000);
    expect(seen).toEqual([]); // held while busy
    busy = false;
    await vi.advanceTimersByTimeAsync(1000);
    expect(seen).toEqual([{ rev: 2, pollSeconds: 1, epoch: "e1" }]);
    await vi.advanceTimersByTimeAsync(1000);
    expect(seen.length).toBe(1); // once
    stop();
  });
});
