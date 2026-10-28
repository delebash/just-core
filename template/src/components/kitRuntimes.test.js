// SPDX-License-Identifier: MIT
// @vitest-environment jsdom
//
// The kit's runtime screens mounted for real (the kit's engines plan, K10), over a stand-in server in the kit's
// shapes: the AI page's runtime tab (the engine — what it needs, Install with its bar —, the models — Download with
// its bar, Delete), the "this feature needs its engine" banner (its next step, gone once the feature can run), and an
// image feature's preset pane on Routing (its settings from the server's rules, Save, a refused value under its field).
// K10b: the notes said before anything downloads (slow here, less memory), no room on the drive said in words.
import { LuEngineNeeded, LuImagePresetPane, LuRuntimeTab } from "@delebash/ui";
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
  if (p === "/v1/ai/runtimes/sdcpp/models") return Promise.resolve(json({ models: server.models }));
  if (p === "/v1/ai/runtimes/sdcpp/models/tiny/download") {
    server.models = server.models.map((m) => ({ ...m, status: "downloading", downloaded: 3, total: 10 }));
    return Promise.resolve(json(server.models[0], 202));
  }
  if (p === "/v1/ai/features/photo.render/readiness") return Promise.resolve(json(server.readiness()));
  if (p === "/v1/ai/engine-presets" && url.search === "?kind=image") return Promise.resolve(json({ presets: server.presets, paramRules: RULES }));
  if (p === "/v1/ai/preset-assignments") return Promise.resolve(json({ defaultPresetId: "talk", features: { "photo.render": "photo" } }));
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

let wrapper;
beforeEach(() => {
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
  server = {
    calls: [],
    engine: { id: "sdcpp", kind: "image", label: "stable-diffusion.cpp", build: "master-1004-a85db96", installed: false, running: "", downloadBytes: 907e6, need: null, status: "", downloaded: 0, total: 0 },
    models: [{ id: "tiny", name: "Tiny", license: "MIT", bytes: 10, onDisk: false, running: false, status: "", downloaded: 0, total: 0 }],
    presets: [{ id: "photo", name: "Photo", model: "tiny", kind: "image", builtIn: true, params: { steps: 4, sampler: "euler" } }],
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

  button(`Install (${fmtBytes(907e6)})`).click();
  await settle();
  expect(server.calls.some(([m, u]) => m === "POST" && u === "/v1/ai/runtimes/sdcpp/engine/install")).toBe(true);
  await later(1300);
  expect(document.body.querySelector(".ui-progress, [role='progressbar']")).not.toBeNull(); // the bar, while it runs
  server.engine = { ...server.engine, installed: true, status: "installed", downloaded: 0, total: 0 };
  await later(1300);
  expect(text()).toContain("Installed — build master-1004-a85db96.");

  button(`Download (${fmtBytes(10)})`).click();
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
  button("Install the engine").click();
  await settle();
  server.engine = { ...server.engine, installed: true, status: "installed" };
  await later(1300);
  expect(text()).toContain("The AI photo needs its model, Tiny, which isn't on this computer yet.");
  button("Download the model").click();
  await settle();
  server.models = [{ ...server.models[0], status: "downloaded", onDisk: true }];
  await later(1300);
  expect(text()).not.toContain("The AI photo");
  expect(ready).toHaveBeenCalledTimes(1);
});

test("said before anything downloads: slow here, less memory than the model takes; no room on the drive in the app's words, no bar left", async () => {
  server.engine = { ...server.engine, gpu: "cpu", slow: true };
  server.models = [{ ...server.models[0], lowMemory: { needGb: 16, haveGb: 8 } }];
  server.full = { needBytes: 2.4e9, freeBytes: 1e9 };
  wrapper = mount(LuRuntimeTab, { props: { runtimeId: "sdcpp" }, attachTo: document.body, global: { plugins: plugins() } });
  // after the mount: installing Quasar's Notify sets its create; the toast is read off its options
  const create = vi.spyOn(quasar.Notify, "create");
  await settle();
  expect(text()).toContain("This computer has no graphics card stable-diffusion.cpp can use: each run here goes on the processor and may take ten minutes or more.");
  expect(text()).toContain("This computer has 8 GB of memory, and Tiny takes about 16 GB: here it may be very slow, or not finish.");
  button(`Install (${fmtBytes(907e6)})`).click();
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

test("the banner says the same notes beside its next step", async () => {
  server.engine = { ...server.engine, gpu: "vulkan", slow: true };
  server.models = [{ ...server.models[0], lowMemory: { needGb: 12, haveGb: 8 } }];
  wrapper = mount(LuEngineNeeded, { props: { feature: "photo.render", label: "The AI photo" }, attachTo: document.body, global: { plugins: plugins() } });
  await settle();
  expect(text()).toContain("The AI photo runs on stable-diffusion.cpp, which isn't installed on this computer yet.");
  expect(text()).toContain("stable-diffusion.cpp has no build measured fast for this computer's graphics card: each run here may take several minutes.");
  expect(text()).toContain("Tiny takes about 12 GB");
});

test("an image feature's preset pane: its settings from the server's rules, saved; a refused value said under its field", async () => {
  server.engine = { ...server.engine, installed: true };
  server.models = [{ ...server.models[0], onDisk: true }];
  wrapper = mount(LuImagePresetPane, { props: { feature: "photo.render", label: "The AI photo" }, attachTo: document.body, global: { plugins: plugins() } });
  await settle();
  const steps = document.body.querySelector("#lu-imgpane-photo\\.render-steps");
  expect(steps.value).toBe("4");
  steps.value = "8";
  steps.dispatchEvent(new Event("input"));
  await settle();
  button("Save").click();
  await settle();
  const put = server.calls.find(([m, u]) => m === "PUT" && u === "/v1/ai/engine-presets/photo");
  expect(put[2].params).toEqual({ steps: 8, sampler: "euler" });
  expect(text()).not.toContain("runs on"); // ready: no banner
  steps.value = "500";
  steps.dispatchEvent(new Event("input"));
  await settle();
  button("Save").click();
  await settle();
  expect(text()).toMatch(/150/); // the server's refusal, under Steps
});
