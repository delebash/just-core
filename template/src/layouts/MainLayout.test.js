// SPDX-License-Identifier: MIT
// @vitest-environment jsdom
//
// The chrome's tray half (app-structure §11): keep-running re-applied to the shell at every start
// (the shell forgets it per launch), and the tray's three pushes — Open settings, About, Copy
// server URL — answered in the window; leaving the layout drops the listeners. And the shell's two
// menus in the app's language: the tray's words and the right-click menu's, sent at start and again
// on a language switch.
import { QUASAR_TEST_OPTIONS } from "@delebash/ui/quasar/install.js";
import { flushPromises, mount } from "@vue/test-utils";
import { createPinia } from "pinia";
import * as quasar from "quasar";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { createMemoryHistory, createRouter } from "vue-router";

// the shell's side, as native.js reaches it: the pushes it sends, the keep-running it is told
const shell = { handlers: {}, keepRunning: [], trayLabels: [], menuLabels: [] };
vi.mock("../services/native.js", () => ({
  onShellEvent: (event, fn) => {
    shell.handlers[event] = fn;
    return () => delete shell.handlers[event];
  },
  setKeepRunning: (v) => shell.keepRunning.push(v),
  setTrayLabels: (labels) => shell.trayLabels.push(labels),
  setContextMenuLabels: (labels) => shell.menuLabels.push(labels),
}));
const toasts = [];
vi.mock("@delebash/ui", async (importOriginal) => ({ ...(await importOriginal()), pushToast: (t) => toasts.push(t) }));

const { i18n } = await import("../i18n/index.js");
const { useUiStore } = await import("../stores/ui.js");
const { default: MainLayout } = await import("./MainLayout.vue");

const QUASAR_COMPONENTS = Object.fromEntries(Object.entries(quasar).filter(([k, v]) => /^Q[A-Z]/.test(k) && v?.name));
const Blank = { render: () => null };

let wrapper;
let router;
async function mountLayout({ keepServerRunning = false } = {}) {
  router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: "/", component: Blank },
      { path: "/settings/:section?", component: Blank },
    ],
  });
  router.push("/");
  await router.isReady();
  const pinia = createPinia();
  // the flag as the boot's prefs left it, before the layout mounts and re-applies it
  useUiStore(pinia).keepServerRunning = keepServerRunning;
  wrapper = mount(MainLayout, {
    attachTo: document.body,
    global: {
      plugins: [[quasar.Quasar, { ...QUASAR_TEST_OPTIONS, components: QUASAR_COMPONENTS }], i18n, pinia, router],
      stubs: { TitleBar: true, LlmUiHosts: true, HelpDrawer: true, AiSetupOffer: true, BootModelLoad: true, RouterView: true },
    },
  });
  await flushPromises();
  return wrapper;
}

beforeEach(() => {
  shell.handlers = {};
  shell.keepRunning = [];
  shell.trayLabels = [];
  shell.menuLabels = [];
  toasts.length = 0;
  // what jsdom lacks and Quasar's layout reads
  vi.stubGlobal("ResizeObserver", class { observe() {} unobserve() {} disconnect() {} });
  vi.stubGlobal("matchMedia", vi.fn(() => ({ matches: false, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {} })));
  // the kit's chrome asks its server: nothing to answer here
  vi.stubGlobal("fetch", vi.fn(async () => new Response("{}", { status: 200, headers: { "content-type": "application/json" } })));
});
afterEach(() => {
  wrapper?.unmount();
  wrapper = null;
  document.body.innerHTML = "";
  vi.unstubAllGlobals();
});

test("keep-running is told to the shell at every start when it is on, and not when it is off", async () => {
  await mountLayout({ keepServerRunning: true });
  expect(shell.keepRunning).toEqual([true]);
  wrapper.unmount();
  wrapper = null;
  shell.keepRunning = [];
  await mountLayout({ keepServerRunning: false });
  expect(shell.keepRunning).toEqual([]);
});

test("Open settings and About open their pages; leaving the layout drops the tray's listeners", async () => {
  await mountLayout();
  expect(Object.keys(shell.handlers).sort()).toEqual(["tray:about", "tray:copy-url", "tray:open-settings"]);
  shell.handlers["tray:open-settings"]();
  await flushPromises();
  expect(router.currentRoute.value.path).toBe("/settings");
  shell.handlers["tray:about"]();
  await flushPromises();
  expect(router.currentRoute.value.path).toBe("/settings/about");
  wrapper.unmount();
  wrapper = null;
  expect(shell.handlers).toEqual({});
});

test("the tray's and the right-click menu's words go to the shell at start, and again on a language switch", async () => {
  await mountLayout();
  const t = i18n.global.t;
  expect(shell.trayLabels).toHaveLength(1);
  expect(shell.trayLabels[0]).toMatchObject({ show: t("kit.shellTray.show"), about: t("kit.shellTray.about", { app: t("app.name") }) });
  expect(shell.trayLabels[0].about).toContain(t("app.name"));
  expect(shell.menuLabels).toEqual([expect.objectContaining({ learnSpelling: t("kit.shellMenu.addToDictionary") })]);
  i18n.global.locale.value = "es";
  await flushPromises();
  try {
    expect(shell.trayLabels).toHaveLength(2);
    expect(shell.menuLabels[1].learnSpelling).toBe(i18n.global.t("kit.shellMenu.addToDictionary"));
  } finally {
    i18n.global.locale.value = "en";
  }
});

test("Copy server URL writes the address the shell sends and says so — or says it couldn't", async () => {
  const writeText = vi.fn(async () => {});
  Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });
  await mountLayout();
  await shell.handlers["tray:copy-url"]("http://127.0.0.1:17490");
  expect(writeText).toHaveBeenCalledWith("http://127.0.0.1:17490");
  expect(toasts.at(-1)).toMatchObject({ kind: "success", description: "http://127.0.0.1:17490" });
  writeText.mockRejectedValueOnce(new Error("denied"));
  await shell.handlers["tray:copy-url"]("http://127.0.0.1:17490");
  expect(toasts.at(-1)).toMatchObject({ kind: "error", description: "denied" });
});
