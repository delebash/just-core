// SPDX-License-Identifier: MIT
// @vitest-environment jsdom
//
// The kit's FeatureLab mounted for real (the template is where the kit's components are mounted, §18). Its
// `dataLinks` — the app's doors to the data a prompt is fed — show on a prompt row's Lab as on a promptless one
// (docgen, 2026-10-29: its translate/confirm/review became prompt rows whose context, glossary and notes still come
// from its own pages; the links lived only in the promptless block and vanished).
import { installLlmUi, LlmUiHosts } from "@delebash/ui";
import FeatureLab from "@delebash/ui/components/FeatureLab.vue";
import FeatureWorkbench from "@delebash/ui/views/FeatureWorkbench.vue";
import { QUASAR_TEST_OPTIONS } from "@delebash/ui/quasar/install.js";
import { flushPromises, mount } from "@vue/test-utils";
import { createPinia } from "pinia";
import * as quasar from "quasar";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { h } from "vue";
import { i18n } from "../i18n/index.js";

const QUASAR_COMPONENTS = Object.fromEntries(Object.entries(quasar).filter(([k, v]) => /^Q[A-Z]/.test(k) && v?.name));
const LINKS = [
  { label: "Context & glossary", href: "#/setup" },
  { label: "Notes", href: "#/review" },
];

let wrapper;
async function mountLab(props, component = FeatureLab) {
  const Host = { render: () => [h(component, props), h(LlmUiHosts)] };
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
}

beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn(async () => new Response("{}", { status: 200, headers: { "content-type": "application/json" } })));
  vi.stubGlobal("ResizeObserver", class { observe() {} unobserve() {} disconnect() {} });
  vi.stubGlobal("matchMedia", vi.fn(() => ({ matches: false, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {} })));
});
afterEach(() => {
  wrapper?.unmount();
  document.body.innerHTML = "";
  vi.unstubAllGlobals();
});

const links = () => [...document.querySelectorAll(".lu-fw-datalinks a")].map((a) => [a.textContent.trim(), a.getAttribute("href")]);

test("a prompt row's Lab shows the app's doors to the data its prompt is fed", async () => {
  await mountLab({
    action: "translate",
    prompt: { key: "translate", feature: "translate", system: "You translate.", user_template: "{{context}} {{text}}" },
    dataLinks: LINKS,
  });
  expect(links()).toEqual([
    ["Context & glossary", "#/setup"],
    ["Notes", "#/review"],
  ]);
});

// The way an app reaches it — AI Settings → the workbench → the row's Lab (docgen's e2e, 2026-10-29: the workbench
// handed the links only to the promptless Lab, so the test above passed and the app showed none)
test("through the workbench: the prompt row's Lab shows the app's links", async () => {
  const PROMPT = { key: "translate", feature: "translate", system: "You translate.", user_template: "{{text}}", label: "Translate" };
  const ANSWERS = {
    "/v1/ai/prompts": { prompts: [PROMPT] },
    "/v1/ai/routing": { features: [{ key: "translate", kind: "llm", label: "Translate" }] },
    "/v1/llm-providers": { providers: [] },
  };
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url) => {
      const body = ANSWERS[new URL(String(url), "http://x").pathname] ?? {};
      return new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json" } });
    }),
  );
  await mountLab({ dataLinks: LINKS, initialAction: "translate" }, FeatureWorkbench);
  await vi.waitFor(() => expect(links()).toEqual([
    ["Context & glossary", "#/setup"],
    ["Notes", "#/review"],
  ]));
});

test("without dataLinks no line shows (JustWrite passes none)", async () => {
  await mountLab({ action: "translate", prompt: { key: "translate", feature: "translate", system: "S", user_template: "{{text}}" } });
  expect(document.querySelector(".lu-fw-datalinks")).toBeNull();
});

// The pipeline-owned kind retired (2026-10-29: docgen's translate/confirm/review became prompt rows, the last app with
// `featurePrompts: {}`): only a SECTIONED feature (JustVoice's refine) asks the app for its prompt preview. A chat
// feature with no prompt rows that isn't sectioned is a bug state — said, with no request for a preview that no app
// serves.
test("a chat feature with no prompt rows, not sectioned: no prompt preview is asked for, and the pane says why", async () => {
  const fetch = vi.fn(async (url) => {
    const path = new URL(String(url), "http://x").pathname;
    const body = { "/v1/ai/prompts": { prompts: [] }, "/v1/ai/routing": { features: [{ key: "draft", kind: "llm", label: "Draft" }] }, "/v1/llm-providers": { providers: [] } }[path] ?? {};
    return new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json" } });
  });
  vi.stubGlobal("fetch", fetch);
  await mountLab({ initialAction: "draft" }, FeatureWorkbench);
  await vi.waitFor(() => expect(document.querySelector(".lu-fw-edit .lu-error")?.textContent).toContain(i18n.global.t("kit.workbench.err.noPrompt", { feature: "Draft" })));
  expect(fetch.mock.calls.map(([u]) => new URL(String(u), "http://x").pathname)).not.toContain("/v1/ai/prompt-preview");
});
