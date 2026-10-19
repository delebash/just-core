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
