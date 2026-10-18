// SPDX-License-Identifier: MIT
// @vitest-environment jsdom
//
// The connection-error page says why the desktop app's server didn't start when its shell knows:
// another program holds the port, or another copy of the app holds the data folder (the shell's
// words, the kit's platform/data_lock.js); with nothing known, no extra sentence. Ported from
// JustWrite's ConnectionErrorPage.test.js (2026-10-18, the template audit: the template's page had no
// test). Mounted as JustWrite's is: Quasar installed as in the real app, the app's real vue-i18n.
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

let app;
let el;
afterEach(() => {
  app?.unmount();
  el?.remove();
  status.mockReset();
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
