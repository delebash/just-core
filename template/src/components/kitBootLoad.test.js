// SPDX-License-Identifier: MIT
// @vitest-environment jsdom
//
// The kit's start-up load (BootModelLoad), mounted for real: before a load starts it shows nothing; while the model
// loads, its bar and "Continue without waiting"; and after the user's Cancel — which sends the model's task back to
// idle — Continue stays, so the splash never stands with no way out (found 2026-11-08 in docgen's real window: after
// Cancel the splash kept no button at all). Continue leaves the splash (warmModelId cleared).
import { BootModelLoad } from "@delebash/ui";
import { QUASAR_TEST_OPTIONS } from "@delebash/ui/quasar/install.js";
import { warmModelId } from "@delebash/ui/services/warmBoot.js";
import { flushPromises, mount } from "@vue/test-utils";
import * as quasar from "quasar";
import { afterEach, expect, test, vi } from "vitest";
import { ref } from "vue";
import { i18n } from "../i18n/index.js";

// the runner-models singleton, as the load drives it: the model's task (the composable's IDLE when nothing runs)
const IDLE = Object.freeze({ state: "", phase: "", done: 0, total: 0, rateText: "", error: "", label: "" });
const task = ref(IDLE);
vi.mock("@delebash/ui/composables/useRunnerModels.js", () => ({
  useRunnerModels: () => ({
    models: ref([{ id: "gemma-4-26b", name: "Gemma 4 26B", status: "loading" }]),
    engineGateTask: ref(null),
    taskFor: () => task.value,
  }),
}));

const QUASAR_COMPONENTS = Object.fromEntries(Object.entries(quasar).filter(([k, v]) => /^Q[A-Z]/.test(k) && v?.name));
let wrapper;
afterEach(() => {
  wrapper?.unmount();
  warmModelId.value = "";
  task.value = IDLE;
});
const mountIt = () =>
  mount(BootModelLoad, { global: { plugins: [[quasar.Quasar, { ...QUASAR_TEST_OPTIONS, components: QUASAR_COMPONENTS }], i18n] } });
const buttons = () => wrapper.findAll("button").map((b) => b.text());
const CONTINUE = "Continue without waiting";

test("nothing before a load starts; the bar and Continue while it loads", async () => {
  warmModelId.value = "gemma-4-26b";
  wrapper = mountIt();
  await flushPromises();
  expect(wrapper.find(".lu-bootload").exists()).toBe(false);
  task.value = { ...IDLE, state: "running", phase: "loading", label: "Loading" };
  await flushPromises();
  expect(wrapper.find(".lu-bootload").exists()).toBe(true);
  expect(buttons()).toContain(CONTINUE);
});

test("after Cancel — the task back to idle — Continue stays, and it leaves the splash", async () => {
  warmModelId.value = "gemma-4-26b";
  task.value = { ...IDLE, state: "running", phase: "loading", label: "Loading" };
  wrapper = mountIt();
  await flushPromises();
  task.value = IDLE; // the user's Cancel
  await flushPromises();
  expect(buttons()).toEqual([CONTINUE]);
  await wrapper.find("button").trigger("click");
  expect(warmModelId.value).toBe("");
});
