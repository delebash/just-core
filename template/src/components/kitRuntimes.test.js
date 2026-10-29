// SPDX-License-Identifier: MIT
// @vitest-environment jsdom
//
// The kit's runtime screens mounted for real (the kit's engines plan, K10), over a stand-in server in the kit's
// shapes: the AI page's runtime tab (the engine — what it needs, Install with its bar —, the models — Download with
// its bar, Delete), the "this feature needs its engine" banner (its next step, gone once the feature can run), and a
// runtime feature's preset pane on Routing — an image one's (its settings from the server's rules, Save, a refused
// value under its field), a vision one's (where it runs, in words).
// K10b: no room on the drive said in words; each model's chip (fits here? how fast?) is the chat catalog's own.
import { LuEngineNeeded, LuRuntimePresetPane, LuRuntimeTab, UiSelect } from "@delebash/ui";
import { fmtBytes } from "@delebash/ui/common/services/downloadRate.js";
import { QUASAR_TEST_OPTIONS } from "@delebash/ui/quasar/install.js";
import { flushPromises, mount } from "@vue/test-utils";
import * as quasar from "quasar";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { i18n } from "../i18n/index.js";

const QUASAR_COMPONENTS = Object.fromEntries(Object.entries(quasar).filter(([k, v]) => /^Q[A-Z]/.test(k) && v?.name));
const plugins = () => [[quasar.Quasar, { ...QUASAR_TEST_OPTIONS, components: QUASAR_COMPONENTS }], i18n];

// ── a stand-in server: the engine, one model, an image feature's readiness and presets
let server;
const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
function fakeFetch(input, init = {}) {
  const url = new URL(String(input));
  const method = (init.method || "GET").toUpperCase();
  const body = typeof init.body === "string" ? JSON.parse(init.body) : undefined;
  server.calls.push([method, url.pathname + url.search, body]);
  const p = url.pathname;
  if (p === "/v1/ai/runtimes/sdcpp/engine/status") return Promise.resolve(json(server.engine));
  if (p === "/v1/ai/runtimes/sdcpp/engine/install") {
    if (server.full) {
      const detail = "stable-diffusion.cpp needs 2.4 GB on the drive that holds the app's AI engines and models; it has 1.0 GB free";
      return Promise.resolve(json({ type: "https://example.test/errors/disk-full", title: "Not enough room on the drive", status: 507, detail, ...server.full }, 507));
    }
    server.engine = { ...server.engine, status: "installing", downloaded: 100e6, total: server.engine.downloadBytes };
    return Promise.resolve(json(server.engine, 202));
  }
  if (p === "/v1/ai/runtimes/sdcpp/engine/update") {
    server.engine = { ...server.engine, status: "installing", downloaded: 100e6, total: server.engine.downloadBytes };
    return Promise.resolve(json(server.engine, 202));
  }
  if (p === "/v1/ai/runtimes/sdcpp/models") return Promise.resolve(json({ models: server.models }));
  if (p === "/v1/ai/runtimes/sdcpp/settings" && method === "PUT") {
    server.engine = { ...server.engine, ...(body.idleSeconds != null ? { idleSeconds: body.idleSeconds } : {}), ...(body.bands ? { bands: { ...server.engine.bands, ...body.bands } } : {}) };
    return Promise.resolve(json(server.engine));
  }
  // the in-process ONNX runtime (round C): part of the app
  if (p === "/v1/ai/runtimes/onnx/engine/status") return Promise.resolve(json({ id: "onnx", kind: "vision", label: "ONNX Runtime", inProcess: true, installed: true, build: "", need: null, downloadBytes: 0, status: "" }));
  if (p === "/v1/ai/runtimes/onnx/models") return Promise.resolve(json({ models: [{ id: "seg", name: "Segmenter", license: "MIT", bytes: 3e9, onDisk: true, running: false, status: "", fit: "ok", speedBand: "" }] }));
  if (p === "/v1/ai/runtimes/sdcpp/models/tiny/download") {
    server.models = server.models.map((m) => ({ ...m, status: "downloading", downloaded: 3, total: 10 }));
    return Promise.resolve(json(server.models[0], 202));
  }
  if (p === "/v1/ai/features/photo.render/readiness") return Promise.resolve(json(server.readiness()));
  if (p === "/v1/ai/engine-presets" && url.search === "?kind=image") return Promise.resolve(json({ presets: server.presets, paramRules: RULES }));
  if (p === "/v1/ai/preset-assignments") return Promise.resolve(json({ defaultPresetId: "talk", features: { "photo.render": "photo", "parts.find": "parts" } }));
  // a vision feature (round C): its presets, the kind's rules, its readiness
  if (p === "/v1/ai/engine-presets" && url.search === "?kind=vision") return Promise.resolve(json({ presets: server.visionPresets, paramRules: VISION_RULES }));
  if (p === "/v1/ai/features/parts.find/readiness") return Promise.resolve(json({ feature: "parts.find", kind: "vision", ready: true, need: "", runtime: "onnx", model: "seg" }));
  if (p === "/v1/ai/engine-presets/parts" && method === "PUT") {
    server.visionPresets = server.visionPresets.map((x) => (x.id === "parts" ? { ...x, params: body.params } : x));
    return Promise.resolve(json({ presets: server.visionPresets, paramRules: VISION_RULES }));
  }
  if (p === "/v1/ai/engine-presets/photo" && method === "PUT") {
    if (body.params.steps > 150) return Promise.resolve(json({ title: "Validation", status: 422, errors: [{ loc: ["body", "params", "steps"], msg: "Input should be less than or equal to 150", type: "less_than_equal", ctx: { le: 150 } }] }, 422));
    server.presets = server.presets.map((x) => (x.id === "photo" ? { ...x, params: body.params } : x));
    return Promise.resolve(json({ presets: server.presets, paramRules: RULES }));
  }
  return Promise.resolve(json({}));
}
const RULES = {
  steps: { type: "int", min: 1, max: 150, default: 4 },
  sampler: { values: ["euler", "lcm"], default: "euler" },
};
const VISION_RULES = { executionProvider: { values: ["auto", "cpu"], default: "auto" } };

let wrapper;
beforeEach(() => {
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
  server = {
    calls: [],
    engine: { id: "sdcpp", kind: "image", label: "stable-diffusion.cpp", build: "master-1004-a85db96", installed: false, running: "", idleSeconds: 300, bands: { fast: 30, fine: 120, slow: 300, unit: "s/image", lowerIsFaster: true }, downloadBytes: 907e6, need: null, status: "", downloaded: 0, total: 0 },
    models: [{ id: "tiny", name: "Tiny", license: "MIT", bytes: 10, onDisk: false, running: false, status: "", downloaded: 0, total: 0 }],
    presets: [{ id: "photo", name: "Photo", model: "tiny", kind: "image", builtIn: true, params: { steps: 4, sampler: "euler" } }],
    visionPresets: [{ id: "parts", name: "Part finder", model: "seg", kind: "vision", builtIn: true, params: { executionProvider: "auto" } }],
    readiness: () => {
      const need = !server.engine.installed ? "engine-not-installed" : !server.models[0].onDisk ? "model-not-downloaded" : "";
      return { feature: "photo.render", kind: "image", ready: !need, need, runtime: "sdcpp", model: "tiny", engine: server.engine, modelState: server.models[0] };
    },
  };
  vi.stubGlobal("fetch", vi.fn(fakeFetch));
  vi.stubGlobal("ResizeObserver", class { observe() {} unobserve() {} disconnect() {} });
});
afterEach(() => {
  wrapper?.unmount();
  document.body.innerHTML = "";
  vi.useRealTimers();
  vi.unstubAllGlobals();
});
const text = () => document.body.textContent;
const button = (words) => [...document.body.querySelectorAll("button")].find((b) => b.textContent.includes(words));
// a click the way Vue Test Utils makes one (trigger stamps the event a millisecond on: Vue drops an event no later than its
// listener's attachment — vuejs/test-utils#1854 — and a bare .click() right after a re-render can land in that millisecond)
const click = (words) => wrapper.findAll("button").find((b) => b.text().includes(words)).trigger("click");
const settle = async () => {
  for (let i = 0; i < 4; i++) await flushPromises();
};
const later = async (ms) => {
  await vi.advanceTimersByTimeAsync(ms);
  await settle();
};

test("the runtime tab: the engine's install with its bar, then the model's download with its own", async () => {
  wrapper = mount(LuRuntimeTab, { props: { runtimeId: "sdcpp" }, attachTo: document.body, global: { plugins: plugins() } });
  await settle();
  expect(text()).toContain("Engine: stable-diffusion.cpp");
  expect(text()).toContain(`Not installed — ${fmtBytes(907e6)} to download.`);
  expect(text()).toContain("Tiny");
  expect(text()).toContain("not downloaded");

  await click(`Install (${fmtBytes(907e6)})`);
  await settle();
  expect(server.calls.some(([m, u]) => m === "POST" && u === "/v1/ai/runtimes/sdcpp/engine/install")).toBe(true);
  await later(1300);
  expect(document.body.querySelector(".ui-progress, [role='progressbar']")).not.toBeNull(); // the bar, while it runs
  server.engine = { ...server.engine, installed: true, status: "installed", downloaded: 0, total: 0 };
  await later(1300);
  expect(text()).toContain("Installed — build master-1004-a85db96.");

  await click(`Download (${fmtBytes(10)})`);
  await settle();
  expect(server.calls.some(([m, u]) => m === "POST" && u === "/v1/ai/runtimes/sdcpp/models/tiny/download")).toBe(true);
  server.models = [{ ...server.models[0], status: "downloaded", onDisk: true }];
  await later(1300);
  expect(text()).toContain("on this computer");
  expect(button("Delete")).toBeTruthy();
});

test("what this computer lacks is said before anything downloads, and Install waits for it", async () => {
  server.engine = { ...server.engine, need: { reason: "vc-runtime", missing: ["VCRUNTIME140.dll"], url: "https://aka.ms/vs/17/release/vc_redist.x64.exe" } };
  wrapper = mount(LuRuntimeTab, { props: { runtimeId: "sdcpp" }, attachTo: document.body, global: { plugins: plugins() } });
  await settle();
  expect(text()).toContain("Microsoft's Visual C++ runtime isn't on this computer (VCRUNTIME140.dll missing)");
  expect(document.body.querySelector("a[href='https://aka.ms/vs/17/release/vc_redist.x64.exe']")).not.toBeNull();
  expect(button("Install").getAttribute("aria-disabled") ?? String(button("Install").disabled)).toMatch(/true/);
});

test("the banner: the next step in place — the engine, then the model — and gone once the feature can run", async () => {
  const ready = vi.fn();
  wrapper = mount(LuEngineNeeded, { props: { feature: "photo.render", label: "The AI photo", onReady: ready }, attachTo: document.body, global: { plugins: plugins() } });
  await settle();
  expect(text()).toContain("The AI photo runs on stable-diffusion.cpp, which isn't installed on this computer yet.");
  await click("Install the engine");
  await settle();
  server.engine = { ...server.engine, installed: true, status: "installed" };
  await later(1300);
  expect(text()).toContain("The AI photo needs its model, Tiny, which isn't on this computer yet.");
  await click("Download the model");
  await settle();
  expect(server.calls.some(([m, u]) => m === "POST" && u === "/v1/ai/runtimes/sdcpp/models/tiny/download")).toBe(true);
  server.models = [{ ...server.models[0], status: "downloaded", onDisk: true }];
  await later(1300);
  expect(text()).not.toContain("The AI photo");
  expect(ready).toHaveBeenCalledTimes(1);
});

test("each model shows the catalog's chip — won't fit, its predicted speed; no room on the drive in the app's words, no bar left", async () => {
  server.models = [{ ...server.models[0], fit: "no", speedBand: "painful", predSpeed: 600, measuredSpeed: null, speedUnit: "s/image" }];
  server.full = { needBytes: 2.4e9, freeBytes: 1e9 };
  wrapper = mount(LuRuntimeTab, { props: { runtimeId: "sdcpp" }, attachTo: document.body, global: { plugins: plugins() } });
  // after the mount: installing Quasar's Notify sets its create; the toast is read off its options
  const create = vi.spyOn(quasar.Notify, "create");
  await settle();
  // the same chip and words as the chat models' catalog (modelPick.js): a predicted band carries the "~"
  expect(document.body.querySelector(".lu-fit.lu-fit--no").textContent).toBe("Won't fit · ~very slow");
  expect(text()).toContain("The estimate says this PC doesn't have the memory for it.");
  await click(`Install (${fmtBytes(907e6)})`);
  await settle();
  const toast = create.mock.calls.at(-1)?.[0];
  expect(toast.message).toBe("Not enough room on the drive");
  // the sizes in the kit's one byte formatter, the Install button's
  expect(toast.caption).toMatch(
    new RegExp(`^This needs ${fmtBytes(2.4e9)} on the drive that holds the app's AI engines and models, which has ${fmtBytes(1e9)} free — make room`),
  );
  expect(document.body.querySelector(".ui-progress, [role='progressbar']")).toBeNull(); // refused before it started: no bar
  create.mockRestore();
});

test("the banner shows the model's chip beside its next step — a speed not banded yet says its number", async () => {
  server.models = [{ ...server.models[0], fit: "ok", speedBand: "", predSpeed: 29, measuredSpeed: null, speedUnit: "s/image" }];
  wrapper = mount(LuEngineNeeded, { props: { feature: "photo.render", label: "The AI photo" }, attachTo: document.body, global: { plugins: plugins() } });
  await settle();
  expect(text()).toContain("The AI photo runs on stable-diffusion.cpp, which isn't installed on this computer yet.");
  expect(text()).toContain("Tiny on this computer:");
  expect(document.body.querySelector(".lu-fit.lu-fit--ok").textContent).toBe("Fits · ~29 s an image"); // in the dead zone: the number
});

test("a runtime's idle time: shown in minutes, saved in seconds", async () => {
  wrapper = mount(LuRuntimeTab, { props: { runtimeId: "sdcpp" }, attachTo: document.body, global: { plugins: plugins() } });
  await settle();
  const field = document.body.querySelector("#lu-rt-sdcpp-idle");
  expect(field.value).toBe("5");
  expect(button("Save").getAttribute("aria-disabled") ?? String(button("Save").disabled)).toMatch(/true/); // nothing changed
  field.value = "10";
  field.dispatchEvent(new Event("input"));
  await settle();
  await click("Save");
  await settle();
  expect(server.calls.find(([m, u]) => m === "PUT" && u === "/v1/ai/runtimes/sdcpp/settings")[2]).toEqual({ idleSeconds: 600 });
});

test("an in-process runtime (ONNX Runtime) is part of the app: nothing to install or remove, its models as any runtime's", async () => {
  wrapper = mount(LuRuntimeTab, { props: { runtimeId: "onnx" }, attachTo: document.body, global: { plugins: plugins() } });
  await settle();
  expect(text()).toContain("Engine: ONNX Runtime");
  expect(text()).toContain("Part of this app — nothing to install.");
  expect(button("Install")).toBeUndefined();
  expect(button("Remove")).toBeUndefined();
  expect(text()).toContain("Segmenter");
  expect(button("Delete")).toBeTruthy();
});

test("an image feature's preset pane: its settings from the server's rules, saved; a refused value said under its field", async () => {
  server.engine = { ...server.engine, installed: true };
  server.models = [{ ...server.models[0], onDisk: true }];
  wrapper = mount(LuRuntimePresetPane, { props: { feature: "photo.render", kind: "image", label: "The AI photo" }, attachTo: document.body, global: { plugins: plugins() } });
  await settle();
  const steps = document.body.querySelector("#lu-imgpane-photo\\.render-steps");
  expect(steps.value).toBe("4");
  steps.value = "8";
  steps.dispatchEvent(new Event("input"));
  await settle();
  await click("Save");
  await settle();
  const put = server.calls.find(([m, u]) => m === "PUT" && u === "/v1/ai/engine-presets/photo");
  expect(put[2].params).toEqual({ steps: 8, sampler: "euler" });
  expect(text()).not.toContain("runs on"); // ready: no banner
  steps.value = "500";
  steps.dispatchEvent(new Event("input"));
  await settle();
  await click("Save");
  await settle();
  expect(text()).toMatch(/150/); // the server's refusal, under Steps
});

test("a vision feature's preset pane: its kind's presets, where it runs in words, Save sends the choice", async () => {
  wrapper = mount(LuRuntimePresetPane, { props: { feature: "parts.find", kind: "vision", label: "The part finder" }, attachTo: document.body, global: { plugins: plugins() } });
  await settle();
  expect(server.calls.some(([m, u]) => m === "GET" && u === "/v1/ai/engine-presets?kind=vision")).toBe(true);
  expect(server.calls.some(([, u]) => u === "/v1/ai/engine-presets?kind=image")).toBe(false);
  expect(text()).toContain("Vision model");
  expect(text()).toContain("Runs on");
  expect(text()).toContain("The graphics card, where it can");
  expect(text()).not.toContain("seed"); // no seed here: no seed's hint
  const where = wrapper.findAllComponents(UiSelect).find((c) => c.attributes("id") === "lu-imgpane-parts.find-executionProvider" || c.props("id") === "lu-imgpane-parts.find-executionProvider");
  expect(where.props("options")).toEqual([
    { value: "auto", label: "The graphics card, where it can" },
    { value: "cpu", label: "The processor only" },
  ]);
  where.vm.$emit("update:modelValue", "cpu");
  await settle();
  await click("Save");
  await settle();
  expect(server.calls.find(([m, u]) => m === "PUT" && u === "/v1/ai/engine-presets/parts")[2].params).toEqual({ executionProvider: "cpu" });
});

// The finish list's A13 (2026-10-29): a runtime's speed bands, seeded in its kind's unit, are edited on its tab.
test("a runtime's speed bands: shown in its unit, Save sends the three lines", async () => {
  wrapper = mount(LuRuntimeTab, { props: { runtimeId: "sdcpp" }, attachTo: document.body, global: { plugins: plugins() } });
  await settle();
  expect(document.body.textContent).toContain("Speed bands (seconds per image)");
  const fast = document.body.querySelector("#lu-rt-sdcpp-band-fast");
  expect(fast.value).toBe("30");
  fast.value = "20";
  fast.dispatchEvent(new Event("input"));
  await settle();
  // the bands' own Save (the second on the tab — the idle time's is first)
  await wrapper.findAll("button").filter((b) => b.text().trim() === "Save").at(-1).trigger("click");
  await settle();
  expect(server.calls.find(([m, u, b]) => m === "PUT" && u === "/v1/ai/runtimes/sdcpp/settings" && b?.bands)[2]).toEqual({ bands: { fast: 20, fine: 120, slow: 300 } });
});

// An existing install reaches the kit's new pin by Update (2026-10-29: seeding is insert-if-missing, so the pin here stays
// until the user presses it): the status's updateTo shows the button with llama.cpp's own words, and it asks the server.
test("the runtime tab offers Update to the kit's tested build when the pin here is older", async () => {
  server.engine = { ...server.engine, installed: true, status: "installed", updateTo: "master-1024-77b72a2" };
  wrapper = mount(LuRuntimeTab, { props: { runtimeId: "sdcpp" }, attachTo: document.body, global: { plugins: plugins() } });
  await settle();
  expect(button("Update to master-1024-77b72a2")).toBeTruthy();
  expect(button("Remove")).toBeTruthy(); // an installed build can still be removed
  await click("Update to master-1024-77b72a2");
  await settle();
  expect(server.calls.some(([m, u]) => m === "POST" && u === "/v1/ai/runtimes/sdcpp/engine/update")).toBe(true);
  server.engine = { ...server.engine, build: "master-1024-77b72a2", updateTo: "", status: "installed", downloaded: 0, total: 0 };
  await later(1300);
  expect(button("Update to")).toBeFalsy();
  expect(text()).toContain("Installed — build master-1024-77b72a2.");
});
