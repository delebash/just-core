// SPDX-License-Identifier: MIT
// @vitest-environment jsdom
//
// The connection-error page says why the desktop app's server didn't start when its shell knows:
// another program holds the port, or another copy of the app holds the data folder (the shell's
// words, the kit's platform/data_lock.js); with nothing known, no extra sentence. Ported from
// JustWrite's ConnectionErrorPage.test.js (2026-10-18, the template audit: the template's page had no
// test). Mounted as JustWrite's is: Quasar installed as in the real app, the app's real vue-i18n.
// A server that answers but wants an access token (a browser on another computer, Settings → Server's
// tokens) gets the token form instead, and an address's `?token=` signs the browser in (2026-10-19).
import { afterEach, expect, test, vi } from "vitest";
import { nextTick } from "vue";
import { createTestApp } from "@delebash/ui/quasar/install.js";
import { i18n } from "../i18n/index.js";

const status = vi.fn();
vi.mock("../services/native.js", () => ({ shellServerStatus: () => status() }));
vi.mock("@delebash/ui", async () => ({
  ConnectionError: (await import("@delebash/ui/common/components/ConnectionError.vue")).default,
  serverUrl: () => "http://127.0.0.1:17490",
}));

const { default: ConnectionErrorPage } = await import("./ConnectionErrorPage.vue");
const { checkServer, serverNeedsToken } = await import("@delebash/ui/common/services/serverApi.js");
const { adoptTokenFromAddress, getServerToken, setServerToken } = await import("@delebash/ui/common/services/serverToken.js");

let app;
let el;
afterEach(() => {
  app?.unmount();
  el?.remove();
  status.mockReset();
  serverNeedsToken.value = false;
  setServerToken("");
  vi.unstubAllGlobals();
});

async function mount() {
  el = document.createElement("div");
  document.body.appendChild(el);
  app = createTestApp(ConnectionErrorPage).use(i18n);
  app.mount(el);
  for (let i = 0; i < 5; i++) await nextTick();
  await new Promise((r) => setTimeout(r, 0));
  await nextTick();
}

test("another program on the port: the app's words, with the port", async () => {
  status.mockResolvedValue({ url: "http://127.0.0.1:17490", portTaken: 17490, dataFolderInUse: null });
  await mount();
  expect(el.textContent).toContain("Another program is using port 17490. Close it, then press Retry.");
});

test("another Family Template server on the data folder: the shell's words, as they are", async () => {
  const words = "Another Family Template server is using this data folder (E:\\JW\\data) — stop it first.";
  status.mockResolvedValue({ url: null, portTaken: null, dataFolderInUse: words });
  await mount();
  expect(el.textContent).toContain(words);
  expect(el.textContent).not.toContain("Another program is using port");
});

test("nothing known (a browser, or the server simply down): no extra sentence", async () => {
  status.mockResolvedValue(null);
  await mount();
  expect(el.textContent).toContain("It isn't responding at");
  expect(el.textContent).not.toContain("Another program is using port");
  expect(el.textContent).not.toContain("is using this data folder");
});

test("a server that wants a token: the page asks for it, keeps it, and loads the app once the server takes it", async () => {
  status.mockResolvedValue(null);
  // the server: 401 with no token, 403 with a wrong one, 200 with "good"
  const sent = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (_url, init) => {
      const auth = new Headers(init?.headers).get("authorization");
      sent.push(auth);
      return new Response("{}", { status: auth === "Bearer good" ? 200 : auth ? 403 : 401, headers: { "content-type": "application/json" } });
    }),
  );
  const reload = vi.fn();
  vi.stubGlobal("location", { ...window.location, reload });
  expect(await checkServer({ tries: 1 })).toBe(false); // the boot's check: up, but wants a token
  expect(serverNeedsToken.value).toBe(true);
  await mount();
  expect(el.textContent).toContain("Family Template needs an access token");
  expect(el.textContent).not.toContain("It isn't responding at");
  const input = el.querySelector("input[aria-label='Access token']");
  const send = async (token) => {
    input.value = token;
    input.dispatchEvent(new Event("input"));
    await nextTick();
    el.querySelector("form").dispatchEvent(new Event("submit"));
    for (let i = 0; i < 5; i++) await nextTick();
    await new Promise((r) => setTimeout(r, 0));
  };
  await send("bad");
  expect(el.textContent).toContain("That token isn't accepted");
  expect(reload).not.toHaveBeenCalled();
  await send("good");
  expect(sent.at(-1)).toBe("Bearer good");
  expect(getServerToken()).toBe("good"); // kept: every request carries it from now on
  expect(reload).toHaveBeenCalled();
});

test("an address with ?token= signs this browser in once — the token leaves the address bar", () => {
  window.history.replaceState(null, "", "/?token=t0k&x=1#/settings");
  expect(adoptTokenFromAddress()).toBe(true);
  expect(getServerToken()).toBe("t0k");
  expect(window.location.search).toBe("?x=1");
  expect(window.location.hash).toBe("#/settings");
  expect(adoptTokenFromAddress()).toBe(false); // nothing left to take
});
