// SPDX-License-Identifier: MIT
// @vitest-environment jsdom
//
// Settings → About, Server and Storage — the kit's panels (AboutPanel, ServerPanel, StoragePanel;
// app-structure §11) as this app's Settings page wires them, mounted over a stand-in server and a
// stand-in desktop shell: what each shows, what each asks the server and the shell, that Storage's
// moves and clears ask first, and that a token's address is what a browser elsewhere opens.
import { _resolveDialog, installLlmUi, LlmUiHosts, setServerToken } from "@delebash/ui";
import { QUASAR_TEST_OPTIONS } from "@delebash/ui/quasar/install.js";
import { flushPromises, mount } from "@vue/test-utils";
import { createPinia } from "pinia";
import * as quasar from "quasar";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { h } from "vue";
import { createMemoryHistory, createRouter, RouterView } from "vue-router";

// the desktop shell as native.js reaches it (null fields: a browser, no shell)
const shell = { version: "", root: null, picked: null, relocated: [], keepRunning: [], oldCopies: [], removed: [], forgotten: [], oldCopiesAsked: [], usedDefault: 0 };
vi.mock("../../services/native.js", () => ({
  shellVersion: () => shell.version,
  setKeepRunning: async (v) => shell.keepRunning.push(v),
  storageGetRoot: async () => shell.root,
  pickDirectory: async () => shell.picked,
  storageRelocate: async (to, options) => shell.relocated.push(options?.token ? [to, options.token] : to),
  storageOldCopies: async (options) => {
    shell.oldCopiesAsked.push(options ?? {});
    return shell.oldCopies;
  },
  storageRemoveOldCopy: async (root) => {
    shell.removed.push(root);
    shell.oldCopies = shell.oldCopies.filter((c) => c.root !== root);
    return shell.oldCopies;
  },
  storageForgetOldCopy: async (root) => {
    shell.forgotten.push(root);
    shell.oldCopies = shell.oldCopies.filter((c) => c.root !== root);
    return shell.oldCopies;
  },
  storageUseDefault: async () => {
    shell.usedDefault++;
    shell.root = { ...shell.root, defaultThisStart: null };
  },
  desktopUpdater: () => null,
}));

const { i18n } = await import("../../i18n/index.js");
const { default: SettingsPage } = await import("../../pages/SettingsPage.vue");
const { useUiStore } = await import("../../stores/ui.js");

const QUASAR_COMPONENTS = Object.fromEntries(Object.entries(quasar).filter(([k, v]) => /^Q[A-Z]/.test(k) && v?.name));

// ── a stand-in server, in the real one's shapes
let server;
const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
function fakeFetch(input, init = {}) {
  const url = new URL(String(input));
  const method = (init.method || "GET").toUpperCase();
  server.calls.push([method, url.pathname, typeof init.body === "string" ? JSON.parse(init.body) : undefined]);
  if (url.pathname === "/v1/health") return Promise.resolve(json({ status: "ok", version: "1.2.3", dataDir: "D:/hp-data" }));
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
let pinia;
async function mountSettings(section) {
  const router = createRouter({ history: createMemoryHistory(), routes: [{ path: "/settings/:section?", component: SettingsPage, props: true }] });
  router.push(`/settings/${section}`);
  await router.isReady();
  pinia = createPinia();
  const Host = { render: () => [h(quasar.QLayout, { view: "hhh lpr fff" }, () => h(quasar.QPageContainer, () => h(RouterView))), h(LlmUiHosts)] };
  wrapper = mount(Host, {
    attachTo: document.body,
    global: {
      plugins: [
        [quasar.Quasar, { ...QUASAR_TEST_OPTIONS, components: QUASAR_COMPONENTS }],
        i18n,
        pinia,
        router,
        { install: (app) => installLlmUi(app, { i18n, external: false }) },
      ],
      directives: { tooltip: {} },
    },
  });
  for (let i = 0; i < 3; i++) await flushPromises();
  return wrapper;
}
const text = () => document.body.textContent;
const button = (words) => [...document.body.querySelectorAll("button")].find((b) => b.textContent.includes(words));

beforeEach(() => {
  server = { calls: [], auth: { tokens: [], requireForLoopback: false }, disk: { modelsCache: 2e9, spawnLogs: 1e6, total: 3e9, diskFree: 5e10 } };
  Object.assign(shell, { version: "", root: null, picked: null, relocated: [], keepRunning: [], oldCopies: [], removed: [], forgotten: [], oldCopiesAsked: [], usedDefault: 0 });
  setServerToken(""); // a token a test's window kept (the Server panel) isn't the next test's
  vi.stubGlobal("fetch", vi.fn(fakeFetch));
  vi.stubGlobal("ResizeObserver", class { observe() {} unobserve() {} disconnect() {} });
  vi.stubGlobal("matchMedia", vi.fn(() => ({ matches: false, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {} })));
});
afterEach(() => {
  wrapper?.unmount();
  document.body.innerHTML = "";
  vi.unstubAllGlobals();
});

describe("About", () => {
  test("what the app is, the server's version and data folder; the desktop runtime only inside the desktop app", async () => {
    await mountSettings("about");
    expect(text()).toContain("The family's reference app");
    expect(text()).toContain("1.2.3");
    expect(text()).toContain("D:/hp-data");
    expect(text()).toContain("github.com/delebash/family-template");
    expect(text()).not.toContain("Electron");
    wrapper.unmount();
    shell.version = "44.7.0";
    await mountSettings("about");
    expect(text()).toContain("Electron 44.7.0");
  });
});

describe("Server", () => {
  test("tokens: read from the server, added, removed and required on this computer — each saved whole", async () => {
    server.auth = { tokens: ["abc"], requireForLoopback: false };
    await mountSettings("server");
    expect(text()).toContain("family-template-server serve");
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

  test("keep running is kept as a preference and told to the shell at once", async () => {
    await mountSettings("server");
    document.body.querySelector("[aria-label='Keep server running after the app closes']").click();
    await flushPromises();
    expect(shell.keepRunning).toEqual([true]);
    expect(useUiStore(pinia).keepServerRunning).toBe(true);
  });

  test("a token's address is the server's with ?token= — what a browser on another computer opens", async () => {
    server.auth = { tokens: ["s3cr3t"], requireForLoopback: false };
    const writeText = vi.fn(async () => {});
    Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });
    await mountSettings("server");
    button("Copy the address with this token").click();
    await flushPromises();
    expect(writeText).toHaveBeenCalledWith(`${window.location.origin}/?token=s3cr3t`);
  });
});

describe("Storage", () => {
  test("in a browser: the server's folder, no Change folder; the disk's parts in sizes", async () => {
    await mountSettings("storage");
    expect(text()).toContain("D:/hp-data");
    expect(text()).toContain("your notes"); // what this app saves, in the kit's sentence
    expect(button("Change folder")).toBeUndefined();
    expect(text()).toMatch(/\d(\.\d)? GB/); // the models cache, 2e9 bytes
  });

  test("Change folder asks first, then hands the folder to the shell; No moves nothing", async () => {
    shell.root = { root: "C:/old", default: "C:/old", portable: false };
    shell.picked = "D:/new";
    vi.stubGlobal("location", { ...window.location, reload: vi.fn() });
    await mountSettings("storage");
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

  // 2026-10-20 (just-house-paint's fifteenth review): the question names the folder the move makes and the apps
  // sharing this app's models; the window's token goes with the data; the old copy is removed only when asked
  test("Change folder's question names the folder it makes and the apps sharing the models (the shell carries the token itself)", async () => {
    shell.root = { root: "C:\\Data\\Old", default: "C:\\App\\data", portable: false, atDefault: false, folderName: "Family Template", defaultThisStart: null };
    shell.picked = "D:\\Folders";
    server.disk = { ...server.disk, sharedWith: ["JustWrite"] };
    vi.stubGlobal("location", { ...window.location, reload: vi.fn() });
    await mountSettings("storage");
    button("Change folder").click();
    await flushPromises();
    expect(text()).toContain("is copied to D:\\Folders\\Family Template, and the app restarts on it");
    expect(text()).toContain("JustWrite use this app's AI models");
    _resolveDialog(true);
    await flushPromises();
    expect(shell.relocated).toEqual(["D:\\Folders"]);
  });

  test("Move back to the default folder, the old copy removed after asking, and the default folder from now on", async () => {
    shell.root = { root: "D:\\Folders\\Family Template", default: "C:\\App\\data", portable: false, atDefault: false, folderName: "Family Template", defaultThisStart: null };
    shell.oldCopies = [{ root: "C:\\App\\data", bytes: 3e9 }];
    const removeOld = () => [...document.body.querySelectorAll(".ui-formgrid button")].find((b) => b.textContent.includes("Remove the old copy"));
    vi.stubGlobal("location", { ...window.location, reload: vi.fn() });
    await mountSettings("storage");
    expect(text()).toContain("Old copy");
    removeOld().click();
    await flushPromises();
    _resolveDialog(true);
    await flushPromises();
    expect(shell.removed).toEqual(["C:\\App\\data"]);
    expect(removeOld()).toBeUndefined();
    button("Move back to the default folder").click();
    // the second question, once the first dialog has closed (AppDialog waits a tick around open and close)
    await vi.waitFor(() => expect(text()).toContain("is copied to C:\\App\\data, and the app restarts on it"));
    _resolveDialog(true);
    await vi.waitFor(() => expect(shell.relocated).toEqual(["C:\\App\\data"]));
    wrapper.unmount();
    shell.root = { root: "C:\\App\\data", default: "C:\\App\\data", portable: true, atDefault: true, folderName: "Family Template", defaultThisStart: { folder: "E:\\Family Template" } };
    await mountSettings("storage");
    expect(button("Move back to the default folder")).toBeUndefined();
    expect(text()).toContain("This start uses the default folder: your data is in E:\\Family Template, which isn't there now — connect it and restart, or use the default folder from now on.");
    // one sentence, the folder named once (the nineteenth review's screens: three times, five lines at 960)
    expect(document.body.querySelector(".lu-storage__banner").textContent.split("E:\\Family Template").length - 1).toBe(1);
    button("Use the default folder from now on").click();
    await flushPromises();
    _resolveDialog(true);
    await flushPromises();
    expect(shell.usedDefault).toBe(1);
  });

  // the sixteenth review (2026-10-20): no move from a start that runs elsewhere than the data; an old copy on a drive
  // that isn't there; Move back said, not offered, while the default holds the old copy; Remove names the apps
  // sharing the models
  test("a start on the default folder this time: no Change folder or Move back — the data is elsewhere, said", async () => {
    shell.root = { root: "C:\\App\\data", default: "C:\\App\\data", portable: true, atDefault: true, folderName: "Family Template", defaultThisStart: { folder: "E:\\Family Template" } };
    await mountSettings("storage");
    expect(text()).toContain("your data is in E:\\Family Template, which isn't there now — connect it and restart, or use the default folder from now on.");
    expect(button("Change folder")).toBeUndefined();
    expect(button("Move back to the default folder")).toBeUndefined();
    // the variable's folder missing: the variable's own words off too, and no "from now on"
    wrapper.unmount();
    shell.root = { ...shell.root, setBy: "VARNAME" };
    await mountSettings("storage");
    expect(text()).toContain("your data is in E:\\Family Template, which isn't there now — connect it and restart.");
    expect(text()).not.toContain("set by VARNAME");
    expect(button("Use the default folder from now on")).toBeUndefined();
  });

  // the seventeenth review: "connect it and restart" said when the data's folder is connected and a restart won't help
  test("the data's folder connected: restart to use it; the variable naming the old copy: change it to the data's folder", async () => {
    shell.root = { root: "C:\\App\\data", default: "C:\\App\\data", portable: true, atDefault: true, folderName: "Family Template", defaultThisStart: { folder: "E:\\Family Template", connected: true } };
    await mountSettings("storage");
    expect(text()).toContain("This start uses the default folder; your data is in E:\\Family Template, which can be used again — restart the app to use it.");
    wrapper.unmount();
    shell.root = {
      root: "C:\\App\\data",
      default: "C:\\App\\data",
      portable: true,
      atDefault: true,
      folderName: "Family Template",
      defaultThisStart: null,
      setBy: "FAMILY_TEMPLATE_DATA_DIR",
      oldCopyOf: { root: "E:\\Family Template", movedAt: 1, connected: true },
    };
    await mountSettings("storage");
    expect(text()).toContain("FAMILY_TEMPLATE_DATA_DIR names this old copy — what you change here isn't in your data, which moved to E:\\Family Template: change FAMILY_TEMPLATE_DATA_DIR to that folder.");
    expect(button("Change folder")).toBeUndefined();
  });

  // the eighteenth review's s11: "not connected" had no way out — now Not found, never removed, and Forget (asks first,
  // drops the record only)
  test("an old copy that isn't found: Not found, no Remove, Forget asks then drops it; Move back said while the default holds one", async () => {
    shell.root = { root: "D:\\New\\Family Template", default: "C:\\App\\data", portable: false, atDefault: false, folderName: "Family Template", defaultThisStart: null };
    shell.oldCopies = [
      { root: "F:\\Stick\\Family Template", bytes: null, movedAt: 1, changedAt: null, connected: false, cause: "absent" },
      { root: "C:\\App\\data", bytes: 1e9, movedAt: 1, changedAt: null, connected: true },
    ];
    server.disk = { ...server.disk, sharedWith: ["JustWrite"] };
    await mountSettings("storage");
    expect(text()).toContain("Not found");
    expect(text()).toContain("Its folder isn't there — its drive unplugged, or the folder renamed or deleted. Connect it to remove it, or Forget it: the app stops listing it, and nothing on any drive is touched.");
    const removes = () => [...document.body.querySelectorAll(".ui-formgrid button")].filter((b) => b.textContent.includes("Remove the old copy"));
    expect(removes().length).toBe(1); // only the found one's
    expect(button("Move back to the default folder")).toBeUndefined();
    expect(text()).toContain("To move the data back to the default folder, remove the old copy there first.");
    removes()[0].click();
    await flushPromises();
    expect(text()).toContain("JustWrite use this app's AI models: if they still use the old copy's, they download their models again.");
    _resolveDialog(false);
    await flushPromises();
    // Forget: asked first; No keeps it
    button("Forget").click();
    await flushPromises();
    expect(text()).toContain("The app stops listing the old copy in F:\\Stick\\Family Template. Nothing on any drive is touched");
    _resolveDialog(false);
    await flushPromises();
    expect(shell.forgotten).toEqual([]);
    button("Forget").click();
    await flushPromises();
    _resolveDialog(true);
    await flushPromises();
    expect(shell.forgotten).toEqual(["F:\\Stick\\Family Template"]);
    expect(text()).not.toContain("Not found");
    expect(shell.removed).toEqual([]);
    // the row and its button gone: the focus on the next copy's button, never dropped on the page; said as forgotten
    expect(document.activeElement?.textContent).toContain("Remove the old copy");
    const said = () => [...document.body.querySelectorAll('[aria-live="polite"]')].map((e) => e.textContent).join(" ");
    await vi.waitFor(() => expect(said()).toContain("Forgotten"));
  });

  // the nineteenth review: "Not found" said "connect its drive" whatever the cause; a share that didn't answer had no
  // way but Forget; after the last row's Forget the focus fell on the page
  test("each cause in its words; one that didn't answer offers Try again; the last one forgotten, the focus on Change folder", async () => {
    shell.root = { root: "D:\\New\\Family Template", default: "C:\\App\\data", portable: false, atDefault: false, folderName: "Family Template", defaultThisStart: null };
    shell.oldCopies = [
      { root: "\\\\nas\\share\\Family Template", bytes: null, movedAt: 1, changedAt: null, connected: false, cause: "slow" },
      { root: "G:\\Family Template", bytes: null, movedAt: 1, changedAt: null, connected: false, cause: "other" },
    ];
    await mountSettings("storage");
    // said once: the row's label, then its note without the same words again (the twentieth review)
    expect(text().split("Didn't answer just now").length - 1).toBe(1);
    expect(text()).toContain("A network folder offline, or a drive waking? Try again in a moment, or Forget it");
    expect(text()).toContain("The folder there now isn't this copy — another drive in its place, or a folder copied by hand — so it isn't removed.");
    // Try again: looked at now
    shell.oldCopies = [shell.oldCopies[1]];
    button("Try again").click();
    await flushPromises();
    expect(shell.oldCopiesAsked.at(-1)).toEqual({ again: true });
    expect(text()).not.toContain("Didn't answer just now");
    // the last one forgotten: the focus on Change folder
    button("Forget").click();
    await flushPromises();
    _resolveDialog(true);
    await flushPromises();
    expect(document.activeElement?.textContent).toContain("Change folder");
  });

  // the eighteenth review's s16: "restart the app to use it" for a folder that is there but the start's check refuses
  test("the data's folder there but not usable: the shell's reason, and restart once it can", async () => {
    shell.root = {
      root: "C:\\App\\data",
      default: "C:\\App\\data",
      portable: true,
      atDefault: true,
      folderName: "Family Template",
      defaultThisStart: { folder: "E:\\Family Template", connected: false, problem: "the app isn't allowed to write there" },
    };
    await mountSettings("storage");
    expect(text()).toContain("This start uses the default folder: your data is in E:\\Family Template, which can't be used now (the app isn't allowed to write there) — put that right and restart, or use the default folder from now on.");
    expect(text()).not.toContain("restart the app to use it");
  });

  test("the data-dir variable names the folder: no Change folder or Move back, the variable named", async () => {
    shell.root = { root: "D:\\e2e-data", default: "C:\\App\\data", portable: false, atDefault: false, folderName: "Family Template", defaultThisStart: null, setBy: "FAMILY_TEMPLATE_DATA_DIR" };
    await mountSettings("storage");
    expect(text()).toContain("This data folder is set by FAMILY_TEMPLATE_DATA_DIR — change it there.");
    expect(button("Change folder")).toBeUndefined();
    expect(button("Move back to the default folder")).toBeUndefined();
  });

  test("an old copy used after the move says when, beside its button and in the question; a start on an old copy is told", async () => {
    const changedAt = new Date(2026, 9, 21, 14, 30).getTime();
    shell.root = {
      root: "C:\\App\\data",
      default: "C:\\App\\data",
      portable: true,
      atDefault: true,
      folderName: "Family Template",
      defaultThisStart: null,
      oldCopyOf: { root: "E:\\Family Template", movedAt: changedAt - 86_400_000 },
    };
    shell.oldCopies = [{ root: "F:\\Older", bytes: 1e9, movedAt: changedAt - 3_600_000, changedAt }];
    await mountSettings("storage");
    expect(text()).toContain("This folder holds an old copy — what you change here isn't in your data, which moved to E:\\Family Template: that folder isn't there now — connect it and restart, or use the default folder from now on.");
    const said = "The old copy was used after the move — last changed";
    const times = () => text().split(said).length - 1;
    expect(times()).toBe(1);
    const removeOld = () => [...document.body.querySelectorAll(".ui-formgrid button")].find((b) => b.textContent.includes("Remove the old copy"));
    removeOld().click();
    await flushPromises();
    expect(times()).toBe(2);
    _resolveDialog(false);
    await flushPromises();
    expect(shell.removed).toEqual([]);
  });

  test("clearing the models asks first, then clears and reads the sizes again", async () => {
    await mountSettings("storage");
    const before = server.calls.filter((c) => c[1] === "/v1/disk/usage").length;
    [...document.body.querySelectorAll("button")].find((b) => b.textContent.trim() === "Clear…").click();
    await flushPromises();
    _resolveDialog(true);
    await flushPromises();
    expect(server.calls.some((c) => c[0] === "POST" && c[1] === "/v1/llm-runner/models-cache/clear")).toBe(true);
    expect(server.calls.filter((c) => c[1] === "/v1/disk/usage").length).toBe(before + 1);
  });
});
