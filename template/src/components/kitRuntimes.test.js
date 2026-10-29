// SPDX-License-Identifier: MIT
// @vitest-environment jsdom
//
// The kit's runtime screens mounted for real (the kit's engines plan, K10), over a stand-in server in the kit's
// shapes: the AI page's runtime tab (the engine — what it needs, Install with its bar —, the models — Download with
// its bar, Delete), the "this feature needs its engine" banner (its next step, gone once the feature can run), and a
// runtime feature's preset pane on Routing — an image one's (its settings from the server's rules, Save, a refused
// value under its field), a vision one's (where it runs, in words).
// K10b: no room on the drive said in words; each model's chip (fits here? how fast?) is the chat catalog's own.
import { _resolveDialog, AiModelsArea, LuEngineNeeded, LuRuntimePresetPane, LuRuntimeTab, UiNumber, UiSelect, useMemoryCells } from "@delebash/ui";
import { fmtBytes } from "@delebash/ui/common/services/downloadRate.js";
import { QUASAR_TEST_OPTIONS } from "@delebash/ui/quasar/install.js";
import { flushPromises, mount } from "@vue/test-utils";
import * as quasar from "quasar";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { h, onMounted } from "vue";
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
  if (p.startsWith("/v1/ai/runtimes/audiocpp/")) return Promise.resolve(roundERoute(p, method, body));
  // the AI page (round E, G7 and G10): the runtimes this app turned on, the memory the strip reads, the hardware
  if (p === "/v1/ai/runtimes") return Promise.resolve(json({ runtimes: server.runtimes ?? [] }));
  if (p === "/v1/llm-runner/resident") return Promise.resolve(json(server.resident ?? {}));
  if (p === "/v1/llm-runner/hardware") return Promise.resolve(json(server.hardware ?? {}));
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

// Round E, E8 (2026-10-29): a runtime whose models load into running servers (audio.cpp) — its kinds to pick from, Load
// where asked with the reason said, Unload, an add-on installed with its bar, its declared settings saved as numbers.
function speechRoute(p, method, body) {
  const S = server.speech;
  const at = p.slice("/v1/ai/runtimes/audiocpp".length);
  if (at === "/engine/status") return json(S.engine);
  if (at === "/models") return json({ models: S.models });
  const load = at.match(/^\/models\/([^/]+)\/(load|unload)$/);
  if (load?.[2] === "load") {
    const held = { modelId: load[1], placement: "cpu", kind: S.models.find((m) => m.id === load[1]).kind, reason: "fast enough on the CPU" };
    S.engine = { ...S.engine, loaded: [...S.engine.loaded, held] };
    return json(held);
  }
  if (load?.[2] === "unload") {
    S.engine = { ...S.engine, loaded: S.engine.loaded.filter((l) => l.modelId !== load[1]) };
    return json({ unloaded: true, loaded: S.engine.loaded });
  }
  if (at === "/addons/unidic/install") {
    S.engine = { ...S.engine, addons: [{ ...S.engine.addons[0], status: "installing", downloaded: 10e6, total: 50e6 }] };
    return json(S.engine.addons, 202);
  }
  if (at === "/settings" && method === "PUT") {
    S.engine = { ...S.engine, settings: { ...S.engine.settings, ...body.settings } };
    return json(S.engine);
  }
  return json({});
}

// Round E's screens (G2, G4/G12, G5, G6, G8, G9 — 2026-10-29): the stand-in grows the contract the server keeps — a
// model's saved Auto/GPU/CPU and where it would load and why, Try the card again, a Load that downloads first (202) and
// its `loading`, Unload cancelling a load, the app's licence gate (403 terms-required), Reinstall (`force`), each kind's
// bands. `S.onLoad[id]` answers a model's Load in a test's own way.
const problem = (slug, status, extra = {}) => json({ type: `https://example.test/errors/${slug}`, title: slug, status, detail: `${slug} detail`, ...extra }, status);
function roundERoute(p, method, body) {
  const S = server.speech;
  const at = p.slice("/v1/ai/runtimes/audiocpp".length);
  const one = at.match(/^\/models\/([^/]+)\/(placement|try-card|load|unload|download)$/);
  const row = (id) => S.models.find((m) => m.id === id);
  const set = (id, patch) => {
    S.models = S.models.map((m) => (m.id === id ? { ...m, ...patch } : m));
    return row(id);
  };
  if (one?.[2] === "placement") return json(set(one[1], { placementChoice: body.placement, placement: S.whereFor(body.placement) }));
  if (one?.[2] === "try-card") return json(set(one[1], { placement: { ...row(one[1]).placement, cardFailed: "" } }));
  if (one?.[2] === "load" && S.onLoad?.[one[1]]) return S.onLoad[one[1]](body);
  if (one?.[2] === "download" && S.terms?.has(one[1])) return problem("terms-required", 403, { modelId: one[1] });
  if (one?.[2] === "download") return json(set(one[1], { status: "downloading", downloaded: 3, total: 10 }), 202);
  if (one?.[2] === "unload" && row(one[1])?.loading) {
    // during a load: it stops, its download included
    set(one[1], { loading: "", ...(row(one[1]).status === "downloading" ? { status: "cancelled", downloaded: 0, total: 0 } : {}) });
    return json({ unloaded: true, loaded: S.engine.loaded });
  }
  if (at === "/engine/install") {
    S.installs = [...(S.installs ?? []), body];
    S.engine = { ...S.engine, status: "installing", downloaded: 10e6, total: 90e6 };
    return json(S.engine, 202);
  }
  if (at === "/settings" && method === "PUT" && body.bandsByKind) {
    const bandsByKind = { ...S.engine.bandsByKind };
    for (const [k, b] of Object.entries(body.bandsByKind)) bandsByKind[k] = { ...bandsByKind[k], ...b };
    S.engine = { ...S.engine, bandsByKind };
    return json(S.engine);
  }
  return speechRoute(p, method, body);
}
function speechServer({ engine = {}, models }) {
  return {
    engine: {
      id: "audiocpp", kind: "tts", kinds: ["tts", "stt"], label: "audio.cpp", build: "v0.9.2-jv.6", installed: true, running: "", downloadBytes: 90e6, need: null, status: "",
      loaded: [], settings: {}, ...engine,
    },
    models,
    whereFor: (choice) => (choice === "cpu" ? { where: "cpu", reason: "you chose the CPU", cardFailed: "" } : { where: "gpu", reason: "it fits beside the AI model", cardFailed: "" }),
  };
}
const speechModel = (id, name, kind, extra = {}) => ({ id, name, kind, license: "MIT", bytes: 3e8, onDisk: true, status: "", downloaded: 0, total: 0, placementChoice: "auto", placement: null, loading: "", ...extra });
const mountSpeech = (props = {}, slots = {}) => {
  wrapper = mount(LuRuntimeTab, { props: { runtimeId: "audiocpp", ...props }, slots, attachTo: document.body, global: { plugins: plugins() } });
};
// the model row holding `name`, and a button in it by its words
const rowOf = (name) => wrapper.findAll(".lu-rt-model").find((r) => r.find("b").text() === name);
const rowButton = (name, words) => rowOf(name).findAll("button").find((b) => b.text().trim() === words);
const changes = () => (wrapper.emitted("changed") ?? []).map(([c]) => c);

test("a model's Auto/GPU/CPU is saved; where it would load and why shows before a load; Try the card again; Load sends no placement", async () => {
  server.speech = speechServer({
    models: [speechModel("kokoro", "Kokoro", "tts", { placement: { where: "cpu", reason: "the card failed it last time", cardFailed: "failed" } })],
  });
  server.speech.onLoad = {
    kokoro: () => {
      const held = { modelId: "kokoro", placement: "gpu", kind: "tts", reason: "it fits beside the AI model" };
      server.speech.engine = { ...server.speech.engine, loaded: [held] };
      return json(held);
    },
  };
  mountSpeech();
  await settle();
  expect(text()).toContain("Would load on the CPU — the card failed it last time");
  const where = wrapper.findAllComponents(UiSelect).find((c) => c.props("ariaLabel") === "Where Kokoro runs");
  expect(where.props("modelValue")).toBe("auto");
  where.vm.$emit("update:modelValue", "gpu");
  await settle();
  expect(server.calls.find(([m, u]) => m === "PUT" && u === "/v1/ai/runtimes/audiocpp/models/kokoro/placement")[2]).toEqual({ placement: "gpu" });
  expect(where.props("modelValue")).toBe("gpu");
  expect(text()).toContain("Would load on the graphics card — it fits beside the AI model");
  expect(changes()).toContainEqual({ what: "placement", id: "kokoro" });

  // the card failed it here once: Try the card again forgets it
  server.speech.models = server.speech.models.map((m) => ({ ...m, placement: { ...m.placement, cardFailed: "spilled" } }));
  await wrapper.vm.refresh();
  await settle();
  await rowButton("Kokoro", "Try the card again").trigger("click");
  await settle();
  expect(server.calls.some(([m, u]) => m === "POST" && u === "/v1/ai/runtimes/audiocpp/models/kokoro/try-card")).toBe(true);
  expect(rowButton("Kokoro", "Try the card again")).toBeUndefined();

  // Load: the server reads the saved choice — nothing sent
  await rowButton("Kokoro", "Load").trigger("click");
  await settle();
  expect(server.calls.find(([m, u]) => m === "POST" && u === "/v1/ai/runtimes/audiocpp/models/kokoro/load")[2]).toEqual({});
  expect(text()).toContain("Loaded on the graphics card — it fits beside the AI model");
  expect(changes()).toContainEqual({ what: "load", id: "kokoro" });
});

test("a Load that downloads first: its bar, then its loading state with Cancel, then loaded — and the app told", async () => {
  server.speech = speechServer({ models: [speechModel("parakeet", "Parakeet", "stt")] });
  server.speech.onLoad = {
    parakeet: () => {
      server.speech.models = server.speech.models.map((m) => ({ ...m, onDisk: false, status: "downloading", downloaded: 3e7, total: 3e8, loading: "downloading" }));
      return json({ status: "downloading" }, 202);
    },
  };
  mountSpeech();
  await settle();
  await rowButton("Parakeet", "Load").trigger("click");
  await settle();
  expect(text()).toContain("downloading, then loading");
  expect(rowOf("Parakeet").find(".lu-dlbar").exists()).toBe(true); // its download bar
  // one Cancel while it downloads: the bar's
  expect(rowOf("Parakeet").findAll("button").filter((b) => b.text().trim() === "Cancel")).toHaveLength(1);
  expect(rowOf("Parakeet").find(".lu-dlbar").findAll("button").some((b) => b.text().trim() === "Cancel")).toBe(true);

  server.speech.models = server.speech.models.map((m) => ({ ...m, onDisk: true, status: "downloaded", downloaded: 0, total: 0, loading: "loading" }));
  await later(1300);
  expect(text()).toContain("loading…");
  expect(rowButton("Parakeet", "Cancel")).toBeTruthy(); // the row's, now the bar is done
  expect(changes()).toContainEqual({ what: "download", id: "parakeet" });

  server.speech.models = server.speech.models.map((m) => ({ ...m, loading: "" }));
  server.speech.engine = { ...server.speech.engine, loaded: [{ modelId: "parakeet", placement: "cpu", kind: "stt", reason: "fast enough on the CPU" }] };
  await later(1300);
  expect(text()).toContain("Loaded on the CPU — fast enough on the CPU");
  expect(changes()).toContainEqual({ what: "load", id: "parakeet" });
});

test("Cancel on a load's download is an Unload — it stops the load; a load answered 'load-cancelled' says nothing", async () => {
  server.speech = speechServer({
    models: [
      speechModel("whisper", "Whisper", "stt", { onDisk: false, status: "downloading", downloaded: 3e7, total: 3e8, loading: "downloading" }),
      speechModel("kokoro", "Kokoro", "tts"),
    ],
  });
  server.speech.onLoad = { kokoro: () => problem("load-cancelled", 409) };
  mountSpeech();
  const create = vi.spyOn(quasar.Notify, "create");
  await settle();
  // a load the app started, picked up mid-download
  expect(text()).toContain("downloading, then loading");
  await rowOf("Whisper").find(".lu-dlbar").findAll("button").find((b) => b.text().trim() === "Cancel").trigger("click");
  await settle();
  expect(server.calls.some(([m, u]) => m === "POST" && u === "/v1/ai/runtimes/audiocpp/models/whisper/unload")).toBe(true);
  expect(server.calls.some(([, u]) => u === "/v1/ai/runtimes/audiocpp/models/whisper/download/cancel")).toBe(false);
  await later(1300);
  expect(text()).not.toContain("downloading, then loading");
  expect(changes()).toContainEqual({ what: "load", id: "whisper" });

  await rowButton("Kokoro", "Load").trigger("click");
  await settle();
  expect(create).not.toHaveBeenCalled();
  create.mockRestore();
});

test("the app's licence gate: Download and Load refused 'terms-required' hand the app the model and the action to repeat — no error, no bar", async () => {
  server.speech = speechServer({ models: [speechModel("pocket", "Pocket TTS", "tts", { onDisk: false }), speechModel("voxcpm", "VoxCPM2", "tts")] });
  server.speech.terms = new Set(["pocket"]);
  server.speech.onLoad = { voxcpm: () => problem("terms-required", 403, { modelId: "voxcpm" }) };
  mountSpeech();
  const create = vi.spyOn(quasar.Notify, "create");
  await settle();
  await rowButton("Pocket TTS", `Download (${fmtBytes(3e8)})`).trigger("click");
  await settle();
  const [asked] = wrapper.emitted("terms-required").at(-1);
  expect(asked.model.id).toBe("pocket");
  expect(rowOf("Pocket TTS").find(".lu-dlbar").exists()).toBe(false);
  expect(create).not.toHaveBeenCalled();
  // accepted in the app's dialog: it repeats the download
  server.speech.terms = new Set();
  await asked.retry();
  await settle();
  expect(server.calls.filter(([m, u]) => m === "POST" && u === "/v1/ai/runtimes/audiocpp/models/pocket/download")).toHaveLength(2);
  expect(rowOf("Pocket TTS").find(".lu-dlbar").exists()).toBe(true);

  await rowButton("VoxCPM2", "Load").trigger("click");
  await settle();
  const [load] = wrapper.emitted("terms-required").at(-1);
  expect(load.model.id).toBe("voxcpm");
  server.speech.onLoad = {};
  await load.retry();
  await settle();
  expect(server.calls.filter(([m, u]) => m === "POST" && u === "/v1/ai/runtimes/audiocpp/models/voxcpm/load")).toHaveLength(2);
  expect(create).not.toHaveBeenCalled();
  create.mockRestore();
});

test("the app's groups and filters: a heading per group that shows its models, the app's head and foot, its filters with the kind and the search", async () => {
  server.speech = speechServer({
    models: [
      speechModel("kokoro-q8", "Kokoro 8-bit", "tts", { engine: "kokoro", cloning: false }),
      speechModel("kokoro-f16", "Kokoro 16-bit", "tts", { engine: "kokoro", cloning: false, onDisk: false }),
      speechModel("pocket-en", "Pocket English", "tts", { engine: "pocket", cloning: true }),
      speechModel("pocket-fr", "Pocket French", "tts", { engine: "pocket", cloning: false }),
      speechModel("parakeet", "Parakeet", "stt", { engine: "parakeet" }),
      speechModel("loose", "Loose one", "stt"),
    ],
  });
  const names = { kokoro: "Kokoro", pocket: "Pocket TTS", parakeet: "Parakeet" };
  mountSpeech(
    { group: (m) => (m.engine ? { key: m.engine, label: names[m.engine] } : null), filter: (m, f) => !f.cloning || m.cloning === true },
    {
      "group-head": ({ group, models }) => h("span", { class: "app-head" }, `${group.key} head · ${models.length}`),
      // the app's foot acts on the server, then has the tab read again
      "group-foot": ({ group, refresh }) =>
        h("button", { type: "button", class: "app-foot", onClick: async () => { server.speech.models = server.speech.models.map((m) => (m.engine === group.key ? { ...m, onDisk: false } : m)); await refresh(); } }, `${group.key} foot`),
      filters: ({ filters }) => h("button", { type: "button", class: "app-cloning", onClick: () => (filters.cloning = !filters.cloning) }, "Cloning only"),
    },
  );
  await settle();
  const heading = (label) => wrapper.findAll(".lu-rt-gh button").find((b) => b.text().trim() === label);
  // closed until opened: the heading, its count, the app's head
  expect(heading("Kokoro").attributes("aria-expanded")).toBe("false");
  expect(text()).toContain("2 models, 1 on this computer");
  expect(text()).toContain("kokoro head · 2");
  expect(rowOf("Kokoro 8-bit")).toBeUndefined();
  expect(text()).not.toContain("kokoro foot");
  expect(rowOf("Loose one")).toBeTruthy(); // in no group: listed after them
  await heading("Kokoro").trigger("click");
  await settle();
  expect(heading("Kokoro").attributes("aria-expanded")).toBe("true");
  expect(document.getElementById(heading("Kokoro").attributes("aria-controls")).textContent).toContain("Kokoro 16-bit");
  expect(text()).toContain("kokoro foot");
  await wrapper.find(".app-foot").trigger("click");
  await settle();
  expect(text()).toContain("2 models");
  expect(text()).not.toContain("2 models, 1 on this computer");

  // the app's filter: a group it leaves some models of shows them; one it leaves none of goes
  await wrapper.find(".app-cloning").trigger("click");
  await settle();
  expect(heading("Kokoro")).toBeUndefined();
  expect(heading("Pocket TTS").attributes("aria-expanded")).toBe("true");
  expect(rowOf("Pocket English")).toBeTruthy();
  expect(rowOf("Pocket French")).toBeUndefined();
  await wrapper.find(".app-cloning").trigger("click");
  await settle();

  // with the kind picker: transcription's groups only
  await click("Transcription");
  await settle();
  expect(heading("Pocket TTS")).toBeUndefined();
  expect(heading("Parakeet")).toBeTruthy();
});

test("the settings' controls as the runtime declares them; each kind's speed bands; Reinstall — and the app told", async () => {
  server.speech = speechServer({
    engine: {
      settings: { backend: "auto", gpu: 0, cpu_threads: 0, start_timeout_s: 60 },
      settingsUi: {
        backend: { control: "select", choices: [{ value: "auto", label: "Auto" }, { value: "vulkan", label: "Vulkan" }] },
        gpu: { control: "select", hidden: true, choices: [{ value: 0, label: "RTX 4060" }] },
        cpu_threads: { control: "number", of: 16 },
      },
      bands: { fast: 4, fine: 2, slow: 1, unit: "x realtime", lowerIsFaster: false },
      bandsByKind: {
        tts: { fast: 4, fine: 2, slow: 1, unit: "x realtime", lowerIsFaster: false },
        stt: { fast: 20, fine: 10, slow: 5, unit: "x realtime", lowerIsFaster: false },
      },
    },
    models: [speechModel("kokoro", "Kokoro", "tts")],
  });
  mountSpeech();
  await settle();
  // a select, a number "of 16", a text box for one it doesn't name, nothing for a hidden one
  const backend = wrapper.findAllComponents(UiSelect).find((c) => c.props("id") === "lu-rt-audiocpp-set-backend");
  expect(backend.props("options")).toEqual([{ value: "auto", label: "Auto" }, { value: "vulkan", label: "Vulkan" }]);
  expect(wrapper.findAllComponents(UiNumber).some((c) => c.props("id") === "lu-rt-audiocpp-set-cpu_threads")).toBe(true);
  expect(text()).toContain("of 16");
  expect(document.body.querySelector("#lu-rt-audiocpp-set-start_timeout_s")).not.toBeNull();
  expect(document.body.querySelector("#lu-rt-audiocpp-set-gpu")).toBeNull();
  backend.vm.$emit("update:modelValue", "vulkan");
  const threads = document.body.querySelector("#lu-rt-audiocpp-set-cpu_threads");
  threads.value = "many";
  threads.dispatchEvent(new Event("input"));
  await settle();
  const saveSettings = () => wrapper.find("section[aria-label='Engine settings']").findAll("button").find((b) => b.text().trim() === "Save");
  expect(saveSettings().attributes("aria-disabled") ?? String(saveSettings().element.disabled)).toMatch(/true/); // a word in a number
  threads.value = "6";
  threads.dispatchEvent(new Event("input"));
  await settle();
  await saveSettings().trigger("click");
  await settle();
  expect(server.calls.find(([m, u, b]) => m === "PUT" && u === "/v1/ai/runtimes/audiocpp/settings" && b?.settings)[2]).toEqual({ settings: { backend: "vulkan", cpu_threads: 6 } });
  expect(changes()).toContainEqual({ what: "settings", id: "" });

  // a row of bands per kind, saved for its kind
  expect(text()).toContain("Speech speed bands (× real time)");
  expect(text()).toContain("Transcription speed bands (× real time)");
  expect(text()).not.toContain("Speed bands (× real time)");
  const sttFast = document.body.querySelector("#lu-rt-audiocpp-band-stt-fast");
  expect(sttFast.value).toBe("20");
  sttFast.value = "25";
  sttFast.dispatchEvent(new Event("input"));
  await settle();
  const ttsFast = document.body.querySelector("#lu-rt-audiocpp-band-tts-fast");
  ttsFast.value = "5";
  ttsFast.dispatchEvent(new Event("input"));
  await settle();
  const bandSave = (kind) => wrapper.findAll(".lu-rt-idle").find((row) => row.find(`#lu-rt-audiocpp-band-${kind}-fast`).exists()).find("button");
  await bandSave("stt").trigger("click");
  await settle();
  expect(server.calls.find(([m, u, b]) => m === "PUT" && u === "/v1/ai/runtimes/audiocpp/settings" && b?.bandsByKind)[2]).toEqual({ bandsByKind: { stt: { fast: 25, fine: 10, slow: 5 } } });
  expect(document.body.querySelector("#lu-rt-audiocpp-band-tts-fast").value).toBe("5"); // the other kind's edit stays

  // Reinstall: the build pinned here again, its bar, then the app told
  await click("Reinstall");
  await settle();
  expect(server.speech.installs).toEqual([{ force: true }]);
  expect(document.body.querySelector(".lu-dlbar")).not.toBeNull();
  server.speech.engine = { ...server.speech.engine, status: "installed", downloaded: 0, total: 0 };
  await later(1300);
  expect(changes()).toContainEqual({ what: "reinstall", id: "" });
});

test("the app is told after an unload, a delete and an add-on's install and removal", async () => {
  server.speech = speechServer({
    engine: {
      loaded: [{ modelId: "kokoro", placement: "cpu", kind: "tts", reason: "" }],
      addons: [{ id: "unidic", name: "Japanese dictionary", bytes: 50e6, installedBytes: 120e6, installed: false, status: "", error: "", downloaded: 0, total: 0 }],
    },
    models: [speechModel("kokoro", "Kokoro", "tts"), speechModel("parakeet", "Parakeet", "stt")],
  });
  mountSpeech();
  await settle();
  await rowButton("Kokoro", "Unload").trigger("click");
  await settle();
  expect(changes()).toContainEqual({ what: "unload", id: "kokoro" });

  const deleting = rowButton("Parakeet", "Delete").trigger("click");
  await settle();
  _resolveDialog(true);
  await deleting;
  await settle();
  expect(server.calls.some(([m, u]) => m === "DELETE" && u === "/v1/ai/runtimes/audiocpp/models/parakeet")).toBe(true);
  expect(changes()).toContainEqual({ what: "delete", id: "parakeet" });

  await click(`Install (${fmtBytes(50e6)})`);
  await settle();
  server.speech.engine = { ...server.speech.engine, addons: [{ ...server.speech.engine.addons[0], installed: true, status: "installed", downloaded: 0, total: 0 }] };
  await later(1300);
  expect(changes()).toContainEqual({ what: "addon-install", id: "unidic" });
  const removing = wrapper.find("section[aria-label='Add-ons']").findAll("button").find((b) => b.text().trim() === "Remove").trigger("click");
  await settle();
  _resolveDialog(true);
  await removing;
  await settle();
  expect(changes()).toContainEqual({ what: "addon-remove", id: "unidic" });
});

test("a runtime that loads its models: its kinds, Load where asked and why, Unload, an add-on with its bar, its settings", async () => {
  server.speech = {
    engine: {
      id: "audiocpp", kind: "tts", kinds: ["tts", "stt"], label: "audio.cpp", build: "v0.9.2-jv.6", installed: true, running: "", downloadBytes: 0, need: null, status: "",
      loaded: [],
      addons: [{ id: "unidic", name: "Japanese dictionary", bytes: 50e6, installedBytes: 120e6, installed: false, status: "", error: "", downloaded: 0, total: 0 }],
      settings: { backend: "auto", cpu_threads: 0 },
    },
    models: [
      { id: "kokoro", name: "Kokoro", kind: "tts", license: "Apache-2.0", bytes: 3e8, onDisk: true, status: "" },
      { id: "parakeet", name: "Parakeet", kind: "stt", license: "CC-BY-4.0", bytes: 6e8, onDisk: true, status: "" },
      { id: "whisper", name: "Whisper", kind: "stt", license: "MIT", bytes: 1.5e9, onDisk: false, status: "" },
    ],
  };
  wrapper = mount(LuRuntimeTab, { props: { runtimeId: "audiocpp" }, attachTo: document.body, global: { plugins: plugins() } });
  await settle();
  // two kinds: picked by kind
  expect(text()).toContain("Kokoro");
  await click("Transcription");
  await settle();
  expect(text()).not.toContain("Kokoro");
  expect(text()).toContain("Parakeet");

  // Load: where its saved choice says, then where it went and why; a loaded model isn't deleted from under its server
  await click("Load");
  await settle();
  expect(server.calls.find(([m, u]) => m === "POST" && u === "/v1/ai/runtimes/audiocpp/models/parakeet/load")[2]).toEqual({}); // where: the saved choice, read by the server (G2)
  expect(text()).toContain("Loaded on the CPU — fast enough on the CPU");
  expect(button("Delete").getAttribute("aria-disabled") ?? String(button("Delete").disabled)).toMatch(/true/);
  await click("Unload");
  await settle();
  expect(server.calls.some(([m, u]) => m === "POST" && u === "/v1/ai/runtimes/audiocpp/models/parakeet/unload")).toBe(true);
  expect(text()).not.toContain("Loaded on the CPU");

  // the add-on: Install, its bar while it downloads, then installed
  expect(text()).toContain(`Not installed — ${fmtBytes(50e6)} to download, ${fmtBytes(120e6)} once installed.`);
  await click(`Install (${fmtBytes(50e6)})`);
  await settle();
  expect(server.calls.some(([m, u]) => m === "POST" && u === "/v1/ai/runtimes/audiocpp/addons/unidic/install")).toBe(true);
  expect(document.body.querySelector(".ui-progress, [role='progressbar']")).not.toBeNull();
  server.speech.engine = { ...server.speech.engine, addons: [{ ...server.speech.engine.addons[0], installed: true, status: "installed", downloaded: 0, total: 0 }] };
  await later(1300);
  expect(text()).toContain(`Installed — ${fmtBytes(120e6)} on this computer.`);

  // its settings: a number box takes a number (a word keeps Save off), sent as a number
  const threads = document.body.querySelector("#lu-rt-audiocpp-set-cpu_threads");
  expect(threads.value).toBe("0");
  const save = () => wrapper.findAll("button").filter((b) => b.text().trim() === "Save").at(-1);
  threads.value = "many";
  threads.dispatchEvent(new Event("input"));
  await settle();
  expect(save().attributes("aria-disabled") ?? String(save().element.disabled)).toMatch(/true/);
  threads.value = "4";
  threads.dispatchEvent(new Event("input"));
  await settle();
  await save().trigger("click");
  await settle();
  expect(server.calls.find(([m, u]) => m === "PUT" && u === "/v1/ai/runtimes/audiocpp/settings")[2]).toEqual({ settings: { cpu_threads: 4 } });
});

// Round E, G7 and G10 (2026-10-29): the AI page hosts a runtime's tab the app's way — its props and listeners, its slots
// by the `runtime-<id>-<slot>` names, another runtime's tab hidden — and the memory strip shows each runtime's booking
// beside the chat models, the cells an app's Home shows through useMemoryCells.
const RESIDENT = {
  vramTotalMb: 8192, usedMb: 6144, committedMb: 4000, remainingMb: 4192, memArch: "discrete",
  models: [{ id: "qwen3-4b", status: "loaded", vramMb: 2048 }],
  runtimeBookings: [
    { key: "tts:audiocpp:gpu", kind: "tts", runtime: "audiocpp", placement: "gpu", mb: 1200, source: "measured" },
    { key: "stt:audiocpp:cpu", kind: "stt", runtime: "audiocpp", placement: "cpu", mb: 800, source: "computed" },
  ],
};
// the strip's cells as label → value
const cells = (root) => Object.fromEntries([...root.querySelectorAll(".lu-hwstat, .home-cell")].map((c) => [c.children[0].textContent.trim(), c.children[1].textContent.trim()]));

test("the AI page: a runtime's tab takes the app's props, listeners and slots, another is hidden; the strip shows each runtime's booking", async () => {
  server.speech = speechServer({ models: [speechModel("kokoro", "Kokoro", "tts", { engine: "kokoro" })] });
  server.runtimes = [{ id: "audiocpp", kind: "tts", label: "audio.cpp" }, { id: "sdcpp", kind: "image", label: "stable-diffusion.cpp" }];
  server.resident = RESIDENT;
  server.hardware = { os: "Windows", cpuCores: 16, ramMb: 32768, gpus: [{ name: "RTX 4060", vramMb: 8192 }], runtimes: { cuda: true } };
  const onChanged = vi.fn();
  wrapper = mount(AiModelsArea, {
    props: {
      initialTab: "runtime-audiocpp",
      runtimeTabs: { audiocpp: { props: { group: (m) => ({ key: m.engine, label: "Kokoro engine" }), onChanged } }, sdcpp: { hidden: true } },
    },
    slots: {
      "runtime-audiocpp-group-head": ({ group }) => h("span", { class: "app-head" }, `${group.label}: set as default`),
      "runtime-audiocpp-before-models": () => h("p", { class: "app-before" }, "The app's own panel"),
    },
    attachTo: document.body,
    global: {
      plugins: plugins(),
      stubs: { QuickSetup: true, FeatureWorkbench: true, ConsolePanel: true, PricingEditor: true, LuModelCatalog: true, LuWarmStartupToggle: true, LuEngineInstallButton: true, LuEngineUpdateButton: true },
    },
  });
  await settle();
  const tabs = [...document.body.querySelectorAll("[role='tab']")].map((x) => x.textContent.trim());
  expect(tabs).toContain("Speech");
  expect(tabs).not.toContain("Images");
  expect(text()).toContain("The app's own panel");
  expect(text()).toContain("Kokoro engine: set as default");
  // the app's listener hears the tab
  await wrapper.findAll(".lu-rt-gh button").find((b) => b.text().trim() === "Kokoro engine").trigger("click");
  await settle();
  await rowButton("Kokoro", "Load").trigger("click");
  await settle();
  expect(onChanged).toHaveBeenCalledWith({ what: "load", id: "kokoro" });

  // the strip: the chat models, then each runtime's booking by its kind and where it runs — an estimate marked
  const strip = cells(document.body.querySelector(".lu-hwstrip"));
  expect(strip.LLM).toBe("2.0 GB");
  expect(strip["Speech · Graphics card"]).toBe("1.2 GB");
  expect(strip["Transcription · CPU"]).toBe("~800 MB");
  expect(strip["Other apps"]).toBe("2.1 GB");
  const order = Object.keys(strip);
  expect(order.indexOf("Speech · Graphics card")).toBe(order.indexOf("LLM") + 1);
});

test("an app's Home shows the strip's own memory cells through useMemoryCells", async () => {
  server.resident = RESIDENT;
  const Home = {
    setup() {
      const memory = useMemoryCells({ llmClaim: () => ({ text: "~4 GB on demand" }) });
      onMounted(memory.start);
      return () => h("div", memory.cells.value.map((c) => h("div", { key: c.key, class: "home-cell" }, [h("span", c.label), h("span", c.value)])));
    },
  };
  wrapper = mount(Home, { attachTo: document.body, global: { plugins: plugins() } });
  await settle();
  expect(cells(document.body)).toEqual({
    "VRAM used": "6.0 of 8.0 GB",
    Free: "2.0 GB",
    LLM: "2.0 GB",
    "Speech · Graphics card": "1.2 GB",
    "Transcription · CPU": "~800 MB",
    "Other apps": "2.1 GB",
  });
});
