// SPDX-License-Identifier: MIT
// @vitest-environment jsdom
//
// The kit's controls mounted for real, through this app's alias to the kit's source — the kit's UI
// package installs no Vue or Quasar of its own (a second copy beside the aliased source would split
// every app's Vue in two), so the template is where the kit's components are mounted (§18).
//
// UiNumber's rules judge the NUMBER, not the text it shows: the text is formatted ("2,048"), and a
// rule given it said "Must be a number" for every value of 1,000 and more (just-house-paint's
// settings form found it, 2026-10-18; the kit's 3d83749).
//
// The dialog's checkbox field: a choice that goes with a confirm, answered true or false
// (just-house-paint's "Keep the parts you changed by hand", 2026-10-19).
import { AppDialog, promptDialog, schemaRules, UiNumber } from "@delebash/ui";
import { QUASAR_TEST_OPTIONS } from "@delebash/ui/quasar/install.js";
import { flushPromises, mount } from "@vue/test-utils";
import * as quasar from "quasar";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { h, ref } from "vue";
import { i18n } from "../i18n/index.js";

const QUASAR_COMPONENTS = Object.fromEntries(Object.entries(quasar).filter(([k, v]) => /^Q[A-Z]/.test(k) && v?.name));
// the JSON Schema TypeBox builds for T.Object({ size: T.Integer({ minimum: 512, maximum: 4096 }) })
const rules = schemaRules({ type: "object", required: ["size"], properties: { size: { type: "integer", minimum: 512, maximum: 4096 } } }).size;

let wrapper;
let form;
async function mountNumber(start) {
  const value = ref(start);
  const Host = {
    render: () =>
      h(quasar.QForm, { ref: (f) => (form = f) }, () =>
        h(UiNumber, { id: "n", modelValue: value.value, "onUpdate:modelValue": (v) => (value.value = v), rules, lazyRules: true }),
      ),
  };
  wrapper = mount(Host, { attachTo: document.body, global: { plugins: [[quasar.Quasar, { ...QUASAR_TEST_OPTIONS, components: QUASAR_COMPONENTS }], i18n] } });
  await flushPromises();
  return value;
}
const input = () => document.body.querySelector("#n");
const type = async (text) => {
  input().value = text;
  input().dispatchEvent(new Event("input"));
  await flushPromises();
};
const messages = () => [...document.body.querySelectorAll(".q-field__messages")].map((e) => e.textContent.trim()).join(" | ");

beforeEach(() => {
  vi.stubGlobal("ResizeObserver", class { observe() {} unobserve() {} disconnect() {} });
});
afterEach(() => {
  wrapper?.unmount();
  document.body.innerHTML = "";
  vi.unstubAllGlobals();
});

test("a value of 1,000 and more shows grouped and passes its rules", async () => {
  await mountNumber(2048);
  expect(input().value).toBe("2,048");
  expect(await form.validate()).toBe(true);
  expect(messages()).toBe("");
});

test("the rules still refuse what is wrong: out of range, not whole, not a number, empty", async () => {
  await mountNumber(2048);
  await type("9000");
  expect(await form.validate()).toBe(false);
  expect(messages()).toMatch(/4,?096/);
  await type("600.5");
  expect(await form.validate()).toBe(false);
  expect(messages()).toContain("Must be a whole number");
  await type("");
  expect(await form.validate()).toBe(false);
  expect(messages()).toContain("Required");
});

test("a dialog's checkbox field starts as its default and answers what the user left it at", async () => {
  wrapper = mount(AppDialog, { attachTo: document.body, global: { plugins: [[quasar.Quasar, { ...QUASAR_TEST_OPTIONS, components: QUASAR_COMPONENTS }], i18n] } });
  const fields = [{ key: "keep", type: "checkbox", label: "Keep the parts you changed by hand", defaultValue: true }];
  const confirm = () => [...document.body.querySelectorAll("button")].find((b) => b.textContent.trim() === "Go");
  const box = () => document.body.querySelector(".ui-checkbox");
  let answer = promptDialog({ title: "Again?", confirmLabel: "Go", fields });
  await flushPromises();
  expect(box().textContent).toContain("Keep the parts you changed by hand");
  expect(box().classList.contains("is-checked")).toBe(true);
  expect(confirm().disabled).toBe(false); // a checkbox is never "required"
  confirm().click();
  expect(await answer).toEqual({ keep: true });
  await flushPromises();
  answer = promptDialog({ title: "Again?", confirmLabel: "Go", fields });
  await flushPromises();
  box().click();
  await flushPromises();
  expect(box().classList.contains("is-checked")).toBe(false);
  confirm().click();
  expect(await answer).toEqual({ keep: false });
});
