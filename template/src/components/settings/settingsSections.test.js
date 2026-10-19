// SPDX-License-Identifier: MIT
// @vitest-environment jsdom
//
// Settings → About, Server and Storage — the family's sections as the template carries them
// (app-structure §11), mounted over a stand-in server and a stand-in desktop shell: what each shows,
// what each asks the server and the shell, and that Storage's moves and clears ask first.
import { _resolveDialog, installLlmUi, LlmUiHosts } from "@delebash/ui";
import { QUASAR_TEST_OPTIONS } from "@delebash/ui/quasar/install.js";
import { flushPromises, mount } from "@vue/test-utils";
import { createPinia } from "pinia";
import * as quasar from "quasar";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { h } from "vue";

// the desktop shell as native.js reaches it (null fields: a browser, no shell)
const shell = { version: "", root: null, picked: null, relocated: [], keepRunning: [] };
vi.mock("../../services/native.js", () => ({
  shellVersion: () => shell.version,
  setKeepRunning: async (v) => shell.keepRunning.push(v),
  storageGetRoot: async () => shell.root,
  pickDirectory: async () => shell.picked,
  storageRelocate: async (to) => shell.relocated.push(to),
}));

const { i18n } = await import("../../i18n/index.js");
const { default: AboutSection } = await import("./AboutSection.vue");
const { default: ServerSection } = await import("./ServerSection.vue");
const { default: StorageSection } = await import("./StorageSection.vue");

const QUASAR_COMPONENTS = Object.fromEntries(Object.entries(quasar).filter(([k, v]) => /^Q[A-Z]/.test(k) && v?.name));

// ── a stand-in server, in the real one's shapes
let server;
const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
function fakeFetch(input, init = {}) {
  const url = new URL(String(input));
  const method = (init.method || "GET").toUpperCase();
  server.calls.push([method, url.pathname, init.body ? JSON.parse(init.body) : undefined]);
  if (url.pathname === "/v1/server-auth" && method === "GET") return Promise.resolve(json(server.auth));
  if (url.pathname === "/v1/server-auth" && method === "PUT") {
    server.auth = JSON.parse(init.body);
    return Promise.resolve(json(server.auth));
  }
  if (url.pathname === "/v1/disk/usage") return Promise.resolve(json(server.disk));
  if (url.pathname === "/v1/llm-runner/models-cache/clear") return Promise.resolve(json({ ok: true }));
  return Promise.resolve(json({}));
}

let wrapper;
async function mountSection(Section, props = {}) {
  const Host = { render: () => [h(Section, props), h(LlmUiHosts)] };
  wrapper = mount(Host, {
    attachTo: document.body,
    global: {
      plugins: [
        [quasar.Quasar, { ...QUASAR_TEST_OPTIONS, components: QUASAR_COMPONENTS }],
        i18n,
        createPinia(),
        { install: (app) => installLlmUi(app, { i18n, external: false }) },
      ],
      directives: { tooltip: {} },
    },
  });
  await flushPromises();
  return wrapper;
}
const text = () => document.body.textContent;
const button = (words) => [...document.body.querySelectorAll("button")].find((b) => b.textContent.includes(words));

beforeEach(() => {
  server = { calls: [], auth: { tokens: [], requireForLoopback: false }, disk: { modelsCache: 2e9, spawnLogs: 1e6, total: 3e9, diskFree: 5e10 } };
  Object.assign(shell, { version: "", root: null, picked: null, relocated: [], keepRunning: [] });
  vi.stubGlobal("fetch", vi.fn(fakeFetch));
  vi.stubGlobal("ResizeObserver", class { observe() {} unobserve() {} disconnect() {} });
});
afterEach(() => {
  wrapper?.unmount();
  document.body.innerHTML = "";
  vi.unstubAllGlobals();
});

describe("About", () => {
  test("the version, the data folder, and the desktop runtime only inside the desktop app", async () => {
    await mountSection(AboutSection, { version: "1.2.3", dataDir: "C:/data" });
    expect(text()).toContain("1.2.3");
    expect(text()).toContain("C:/data");
    expect(text()).not.toContain("Electron");
    wrapper.unmount();
    shell.version = "44.7.0";
    await mountSection(AboutSection, { version: "" });
    expect(text()).toContain("Electron 44.7.0");
    expect(text()).toContain("—"); // no version yet
  });
});

describe("Server", () => {
  test("tokens: read from the server, added, removed and required on this computer — each saved whole", async () => {
    server.auth = { tokens: ["abc"], requireForLoopback: false };
    await mountSection(ServerSection);
    expect(text()).toContain("abc");
    const input = document.body.querySelector("input[aria-label='Paste or generate a token']");
    input.value = "  def  ";
    input.dispatchEvent(new Event("input"));
    await flushPromises();
    button("Add token").click();
    await flushPromises();
    expect(server.auth).toEqual({ tokens: ["abc", "def"], requireForLoopback: false });
    document.body.querySelector("button[aria-label='Remove token']").click();
    await flushPromises();
    expect(server.auth.tokens).toEqual(["def"]);
    document.body.querySelector("[aria-label='Require a token on this computer too']").click();
    await flushPromises();
    expect(server.auth.requireForLoopback).toBe(true);
  });

  test("keep running is told to the shell at once", async () => {
    await mountSection(ServerSection);
    document.body.querySelector("[aria-label='Keep server running after the app closes']").click();
    await flushPromises();
    expect(shell.keepRunning).toEqual([true]);
  });
});

describe("Storage", () => {
  test("in a browser: the server's folder, no Change folder; the disk's parts in sizes", async () => {
    await mountSection(StorageSection, { dataDir: "D:/hp-data" });
    expect(text()).toContain("D:/hp-data");
    expect(button("Change folder")).toBeUndefined();
    expect(text()).toMatch(/\d(\.\d)? GB/); // the models cache, 2e9 bytes
  });

  test("Change folder asks first, then hands the folder to the shell; No moves nothing", async () => {
    shell.root = { root: "C:/old", default: "C:/old", portable: false };
    shell.picked = "D:/new";
    vi.stubGlobal("location", { ...window.location, reload: vi.fn() });
    await mountSection(StorageSection);
    button("Change folder").click();
    await flushPromises();
    _resolveDialog(false);
    await flushPromises();
    expect(shell.relocated).toEqual([]);
    button("Change folder").click();
    await flushPromises();
    _resolveDialog(true);
    await flushPromises();
    expect(shell.relocated).toEqual(["D:/new"]);
  });

  test("clearing the models asks first, then clears and reads the sizes again", async () => {
    await mountSection(StorageSection);
    const before = server.calls.filter((c) => c[1] === "/v1/disk/usage").length;
    [...document.body.querySelectorAll("button")].find((b) => b.textContent.trim() === "Clear…").click();
    await flushPromises();
    _resolveDialog(true);
    await flushPromises();
    expect(server.calls.some((c) => c[0] === "POST" && c[1] === "/v1/llm-runner/models-cache/clear")).toBe(true);
    expect(server.calls.filter((c) => c[1] === "/v1/disk/usage").length).toBe(before + 1);
  });
});
