// SPDX-License-Identifier: MIT
// Another window's changes (just-house-paint, 2026-10-20 — two windows on one server overwrote each
// other's work unseen): with `sendClientId` every request carries this window's id, so the server
// counts only the other windows' changes; the kit's watchSync calls the app with the server's answer,
// and waits while the app says so (a stroke or its save in flight) — the change lands at the first
// check after.
import { afterEach, describe, expect, test, vi } from "vitest";
import { holdChangesWhile, otherWindows, watchOtherWindows } from "../src/common/services/otherWindows.js";
import { configureServerApi } from "../src/common/services/serverApi.js";
import { replacingData, watchSync } from "../src/common/services/syncWatch.js";
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

describe("watchOtherWindows (moved from just-house-paint, 2026-10-24)", () => {
  test("the counter moving bumps the pages; a busy page holds it; a new series reloads the window", async () => {
    vi.useFakeTimers();
    configureServerApi({ resolveBase: () => "http://127.0.0.1:1" });
    const kept = new Map();
    vi.stubGlobal("sessionStorage", { getItem: (k) => kept.get(k) ?? null, setItem: (k, v) => kept.set(k, String(v)), removeItem: (k) => kept.delete(k) });
    const answer = { rev: 1, epoch: "e1", pollSeconds: 1 };
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify(answer), { headers: { "content-type": "application/json" } })));
    const reload = vi.fn();
    const stop = watchOtherWindows({ reload });
    await vi.advanceTimersByTimeAsync(10);
    const start = otherWindows.changes;

    answer.rev = 2;
    await vi.advanceTimersByTimeAsync(1000);
    expect(otherWindows.changes).toBe(start + 1);

    // a stroke being saved: the change waits for it
    let busy = true;
    const release = holdChangesWhile(() => busy);
    answer.rev = 3;
    await vi.advanceTimersByTimeAsync(2000);
    expect(otherWindows.changes).toBe(start + 1);
    busy = false;
    await vi.advanceTimersByTimeAsync(1000);
    expect(otherWindows.changes).toBe(start + 2);
    release();

    // a restore on the server: everything replaced — the window reloads
    answer.rev = 4;
    answer.epoch = "e2";
    await vi.advanceTimersByTimeAsync(1000);
    expect(reload).toHaveBeenCalledTimes(1);
    expect(otherWindows.changes).toBe(start + 2);
    // the reload is marked (a page's "leave without saving?" lets it go), the words kept for after it, and the new
    // series taken first: kept on the page, it would not reload again for it (just-house-paint's nineteenth review)
    expect(otherWindows.replaced).toBe(true);
    expect(kept.get("kit.replacedElsewhere")).toBe("1");
    await vi.advanceTimersByTimeAsync(2000);
    expect(reload).toHaveBeenCalledTimes(1);
    stop();
    // the next start says it once
    const again = watchOtherWindows({ reload });
    expect(kept.has("kit.replacedElsewhere")).toBe(false);
    again();
    otherWindows.replaced = false;
  });
});

describe("this window's own restore or reset (the twentieth review)", () => {
  test("a change seen while this window replaces the data waits — it reloads itself; a failed attempt lets it land", async () => {
    vi.useFakeTimers();
    configureServerApi({ resolveBase: () => "http://127.0.0.1:1" });
    let answer = { rev: 1, pollSeconds: 1, epoch: "e1" };
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify(answer), { headers: { "content-type": "application/json" } })));
    const seen = [];
    const stop = watchSync((r) => seen.push(r.epoch));
    await vi.advanceTimersByTimeAsync(10);
    replacingData(true);
    answer = { rev: 2, pollSeconds: 1, epoch: "e2" }; // the server moved before the restore's answer came
    await vi.advanceTimersByTimeAsync(3000);
    expect(seen).toEqual([]); // its own: held through to the reload
    replacingData(false); // (the attempt failed after all)
    await vi.advanceTimersByTimeAsync(1000);
    expect(seen).toEqual(["e2"]);
    stop();
  });
});

describe("long sessions (the twelfth review)", () => {
  test("watchSync asks nothing while the page is hidden, and at once when it shows again", async () => {
    vi.useFakeTimers();
    configureServerApi({ resolveBase: () => "http://127.0.0.1:1" });
    const listeners = {};
    const doc = { visibilityState: "hidden", addEventListener: (n, f) => (listeners[n] = f), removeEventListener: () => {}, querySelector: () => null };
    vi.stubGlobal("document", doc);
    vi.stubGlobal("window", { addEventListener: (n, f) => (listeners[`w:${n}`] = f), removeEventListener: () => {} });
    const fetch = vi.fn(async () => new Response(JSON.stringify({ rev: "b:1", pollSeconds: 1 }), { headers: { "content-type": "application/json" } }));
    vi.stubGlobal("fetch", fetch);
    const stop = watchSync(() => {});
    await vi.advanceTimersByTimeAsync(5000);
    expect(fetch).not.toHaveBeenCalled(); // hidden: nothing asked
    doc.visibilityState = "visible";
    listeners.visibilitychange();
    await vi.advanceTimersByTimeAsync(10);
    expect(fetch).toHaveBeenCalledTimes(1); // shown: at once
    await vi.advanceTimersByTimeAsync(1000);
    expect(fetch).toHaveBeenCalledTimes(2);
    doc.visibilityState = "hidden";
    await vi.advanceTimersByTimeAsync(5000);
    expect(fetch).toHaveBeenCalledTimes(2); // hidden again: the next tick asks nothing
    stop();
  });

  test("a request the token check refuses sends the app to its token page, once", async () => {
    const { serverNeedsToken, get } = await import("../src/common/services/serverApi.js");
    serverNeedsToken.value = false;
    const needed = vi.fn();
    configureServerApi({ resolveBase: () => "http://127.0.0.1:1", onTokenNeeded: needed });
    const problem = { type: "https://app.local/errors/forbidden", title: "Forbidden", status: 403, detail: "Bearer token not accepted" };
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify(problem), { status: 403, headers: { "content-type": "application/problem+json" } })));
    await expect(get("/v1/houses")).rejects.toMatchObject({ status: 403 });
    await expect(get("/v1/houses/x")).rejects.toMatchObject({ status: 403 });
    expect(needed).toHaveBeenCalledTimes(1);
    expect(serverNeedsToken.value).toBe(true);
    // another 403 (a renamed page refused — host-not-allowed) is not a token's
    serverNeedsToken.value = false;
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ ...problem, type: "https://app.local/errors/host-not-allowed" }), { status: 403 })));
    await expect(get("/v1/x")).rejects.toMatchObject({ status: 403 });
    expect(needed).toHaveBeenCalledTimes(1);
    configureServerApi({ onTokenNeeded: null });
  });
});
