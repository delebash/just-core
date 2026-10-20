// SPDX-License-Identifier: MIT
// The access token a browser sends its server (common/services/serverToken.js, transport.js): every
// request through the kit's transport carries it — the kit's own views' (client.js) as much as the
// app's — never over a header the caller set, and nothing at all when there is none; the host's own
// token (configureServerApi's `authToken`, JustVoice's) wins over the kept one.
import { afterEach, describe, expect, test, vi } from "vitest";
import { configureServerApi } from "../src/common/services/serverApi.js";
import { getServerToken, setServerToken } from "../src/common/services/serverToken.js";
import { serverFetch, setAuthTokenSource } from "../src/common/services/transport.js";

let sent;
afterEach(() => {
  setServerToken("");
  setAuthTokenSource(null);
  vi.unstubAllGlobals();
});
function stubFetch() {
  sent = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (_input, init) => {
      sent.push(new Headers(init?.headers).get("authorization"));
      return new Response("{}");
    }),
  );
}

describe("a server that requires a token even on this computer", () => {
  // its health check stays open from this computer (the lockout escape) and says the window has no token
  // it takes: the window asks for one (ConnectionError) instead of loading into 401s — 2026-10-20
  test("the boot check asks for a token when the health answer says one is required", async () => {
    const { checkServer, serverNeedsToken } = await import("../src/common/services/serverApi.js");
    configureServerApi({ resolveBase: () => "http://127.0.0.1:1", askTokenOnThisComputer: true });
    let tokenRequired = true;
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ status: "ok", ...(tokenRequired ? { tokenRequired } : {}) }))));
    expect(await checkServer({ tries: 1, delayMs: 0 })).toBe(false);
    expect(serverNeedsToken.value).toBe(true);
    tokenRequired = false; // a token it takes, kept
    expect(await checkServer({ tries: 1, delayMs: 0 })).toBe(true);
    expect(serverNeedsToken.value).toBe(false);
    // an app that keeps its token elsewhere (not opted in): the window loads as before, its Settings the way out
    configureServerApi({ askTokenOnThisComputer: false });
    tokenRequired = true;
    expect(await checkServer({ tries: 1, delayMs: 0 })).toBe(true);
    expect(serverNeedsToken.value).toBe(false);
  });
});

describe("the access token on every request", () => {
  test("none kept: requests go as they were", async () => {
    stubFetch();
    await serverFetch("http://127.0.0.1:1/v1/x", { headers: { "content-type": "application/json" } });
    expect(sent).toEqual([null]);
  });

  test("kept: every request carries it as a Bearer token, but never over the caller's own", async () => {
    stubFetch();
    setServerToken("  abc  ");
    expect(getServerToken()).toBe("abc");
    await serverFetch("http://127.0.0.1:1/v1/x");
    await serverFetch("http://127.0.0.1:1/v1/y", { method: "POST", headers: { Authorization: "Bearer mine" } });
    expect(sent).toEqual(["Bearer abc", "Bearer mine"]);
    setServerToken("");
    await serverFetch("http://127.0.0.1:1/v1/z");
    expect(sent.at(-1)).toBe(null);
  });

  test("the host's own token wins over the kept one", async () => {
    stubFetch();
    setServerToken("kept");
    configureServerApi({ authToken: () => "host" });
    await serverFetch("http://127.0.0.1:1/v1/x");
    expect(sent).toEqual(["Bearer host"]);
  });
});
