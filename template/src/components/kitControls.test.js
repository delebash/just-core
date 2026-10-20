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
// (just-house-paint's "Keep the parts you changed by hand", 2026-10-19). The boot splash's failed
// load: the kit's own help, the app's Troubleshooting page (the template audit, 2026-10-19).
//
// The screens-and-keyboard review (2026-10-20): a field built on UiField takes its label as its name
// (accessible names computed with dom-accessibility-api, Testing Library's — w3.org/TR/accname-1.2);
// UiSegmented checks on the arrows (APG Radio Group); the help drawer's text is a focused, named region;
// a menu closes on Tab and gives the focus back; a toast is said through the kit's live regions;
// UiNumber reads with NumberParser and keeps a refused text in the box.
import {
  AiTaskStrip,
  AppDialog,
  BootModelLoad,
  closeHelp,
  configureHelp,
  HelpDrawer,
  helpState,
  installAnnouncer,
  openHelp,
  PaneHeader,
  promptDialog,
  pushToast,
  schemaRules,
  tooltipDirective,
  UiField,
  UiInput,
  UiMenu,
  UiMenuItem,
  UiNumber,
  UiSegmented,
  useAiTasksStore,
  warmModelId,
} from "@delebash/ui";
import { QUASAR_TEST_OPTIONS } from "@delebash/ui/quasar/install.js";
import { flushPromises, mount } from "@vue/test-utils";
import { computeAccessibleName } from "dom-accessibility-api";
import { createPinia, setActivePinia } from "pinia";
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

const plugins = () => [[quasar.Quasar, { ...QUASAR_TEST_OPTIONS, components: QUASAR_COMPONENTS }], i18n];
const mountHost = async (render) => {
  wrapper = mount({ render }, { attachTo: document.body, global: { plugins: plugins(), directives: { tooltip: tooltipDirective } } });
  await flushPromises();
};
const key = (el, k, init = {}) => el.dispatchEvent(new KeyboardEvent("keydown", { key: k, bubbles: true, cancelable: true, ...init }));

test("a field built on UiField takes its label as its accessible name — a text box and a number box", async () => {
  await mountHost(() => [
    h(UiField, { label: "House name", for: "f-name" }, () => h(UiInput, { id: "f-name", modelValue: "" })),
    h(UiField, { label: "Working size (pixels)", for: "f-size", layout: "block" }, () => h(UiNumber, { id: "f-size", modelValue: 1024 })),
  ]);
  expect(computeAccessibleName(document.getElementById("f-name"))).toBe("House name");
  expect(computeAccessibleName(document.getElementById("f-size"))).toBe("Working size (pixels)");
});

test("UiSegmented checks on the arrows; an option that is off takes the focus, never the pick", async () => {
  const value = ref("new");
  const blocked = vi.fn();
  const options = [
    { value: "new", label: "The new color" },
    { value: "off", label: "Off here", disabled: true },
    { value: "now", label: "On it now" },
  ];
  await mountHost(() =>
    h(UiSegmented, { modelValue: value.value, "onUpdate:modelValue": (v) => (value.value = v), onBlocked: blocked, options, ariaLabel: "What a click does" }),
  );
  const group = document.querySelector('[role="radiogroup"]');
  expect(computeAccessibleName(group)).toBe("What a click does");
  const radios = () => [...document.querySelectorAll('[role="radio"]')];
  expect(radios().map((r) => r.tabIndex)).toEqual([0, -1, -1]); // one tab stop, the chosen option
  radios()[0].focus();
  key(radios()[0], "ArrowRight");
  await flushPromises();
  expect(document.activeElement).toBe(radios()[1]); // the off option takes the focus…
  expect(value.value).toBe("new"); // …and is never picked
  expect(blocked).not.toHaveBeenCalled(); // an arrow says nothing about it
  key(radios()[1], "ArrowRight");
  await flushPromises();
  expect(document.activeElement).toBe(radios()[2]);
  expect(value.value).toBe("now");
  expect(radios()[2].getAttribute("aria-checked")).toBe("true");
  key(radios()[2], "Home");
  await flushPromises();
  expect(value.value).toBe("new");
});

test("the help drawer's text is a region named by its title, focused when the drawer opens", async () => {
  configureHelp({ titleForSlug: () => "Your houses", hasDoc: () => true, loadDoc: async () => "Every house you add is here.\n\nOpen one to paint it." });
  // jsdom lays nothing out, so it has no scrollTo — the drawer scrolls its text to the top on open
  if (!HTMLElement.prototype.scrollTo) HTMLElement.prototype.scrollTo = () => {};
  await mountHost(() => h(HelpDrawer));
  openHelp("home");
  for (let i = 0; i < 5; i++) await flushPromises();
  await new Promise((r) => setTimeout(r, 50));
  const body = document.querySelector(".help-drawer-body");
  expect(body.getAttribute("role")).toBe("region");
  expect(body.tabIndex).toBe(0);
  expect(computeAccessibleName(body)).toBe("Your houses");
  expect(document.activeElement).toBe(body);
  closeHelp();
  await flushPromises();
});

test("a menu closes on Tab and gives the focus back to its trigger", async () => {
  const picked = vi.fn();
  await mountHost(() => h(UiMenu, { label: "More actions for Behr" }, { trigger: () => "⋯", default: () => [h(UiMenuItem, { onSelect: picked }, () => "Remove")] }));
  const trigger = document.querySelector('[aria-haspopup="menu"]');
  expect(computeAccessibleName(trigger)).toBe("More actions for Behr");
  expect(trigger.hasAttribute("title")).toBe(false); // its tooltip is v-tooltip, never a title equal to its name
  trigger.focus();
  key(trigger, "ArrowDown"); // opens it on its first item
  for (let i = 0; i < 3; i++) await flushPromises();
  const item = document.querySelector('[role="menuitem"]');
  expect(trigger.getAttribute("aria-expanded")).toBe("true");
  item.focus();
  key(item, "Tab");
  for (let i = 0; i < 3; i++) await flushPromises();
  expect(trigger.getAttribute("aria-expanded")).toBe("false");
  expect(document.activeElement).toBe(trigger);
  expect(picked).not.toHaveBeenCalled();
});

test("a toast is said through the kit's live regions — an error at once — and carries no live role itself", async () => {
  installAnnouncer();
  await mountHost(() => h("div"));
  const region = (level) => document.querySelector(`[data-live-announcer] [aria-live="${level}"]`);
  expect(region("polite")).not.toBeNull(); // there from the start, before anything is said
  // Notify's own container left the page with an earlier test's body, so the toast is read off its options
  const create = vi.spyOn(quasar.Notify, "create");
  pushToast({ message: "Saved", kind: "success" });
  pushToast({ title: "The export failed", description: "The drive is full", kind: "error" });
  for (let i = 0; i < 3; i++) await flushPromises();
  expect(region("polite").textContent).toContain("Saved");
  expect(region("assertive").textContent).toContain("The export failed. The drive is full");
  expect(create).toHaveBeenCalledTimes(2);
  for (const [options] of create.mock.calls) expect(options.attrs.role).toBeNull(); // Notify's role="alert" taken off
  create.mockRestore();
});

test("an AI task's start and end are said; its strip's bar is a progressbar with its value", async () => {
  installAnnouncer();
  setActivePinia(createPinia());
  const tasks = useAiTasksStore();
  const handle = tasks.start({ feature: "notes.suggestTitle", label: "Suggesting a title", lingerMs: {} });
  const task = () => tasks.tasks[handle.id];
  await mountHost(() => h(AiTaskStrip, { task: task() }));
  const region = (level) => document.querySelector(`[data-live-announcer] [aria-live="${level}"]`).textContent;
  expect(region("polite")).toContain("Suggesting a title: started");
  // no count yet: the spinner is an indeterminate progressbar
  let bar = document.querySelector('.sts [role="progressbar"]');
  expect(bar.hasAttribute("aria-valuenow")).toBe(false);
  expect(computeAccessibleName(bar)).toBe("Suggesting a title");
  handle.setProgress(3, 10);
  await flushPromises();
  bar = document.querySelector('.sts [role="progressbar"]');
  expect(bar.getAttribute("aria-valuenow")).toBe("30");
  expect([bar.getAttribute("aria-valuemin"), bar.getAttribute("aria-valuemax")]).toEqual(["0", "100"]);
  handle.fail(new Error("The model stopped"));
  await flushPromises();
  expect(region("assertive")).toContain("Suggesting a title: failed — The model stopped");
  tasks.cancelAll();
});

test("the help '?' ends the page header's actions — it wraps with them, never alone on a row", async () => {
  await mountHost(() => [
    h(PaneHeader, { title: "Maple street", eyebrow: "Your houses", helpKey: "house" }, () => [h("button", "Save image")]),
    h(PaneHeader, { title: "Paint colors", helpKey: "paint-colors", class: "bare" }),
  ]);
  const [withActions, bare] = document.querySelectorAll(".pane-header");
  const actions = withActions.querySelector(".pane-actions");
  expect(actions.lastElementChild.classList.contains("pane-help")).toBe(true);
  expect(withActions.querySelectorAll(".pane-help")).toHaveLength(1);
  // no actions: the "?" stands at the header's end, as before
  expect(bare.querySelector(".pane-actions")).toBeNull();
  expect(bare.lastElementChild.classList.contains("pane-help")).toBe(true);
});

test("UiNumber reads '.7', '5.', '+15' and '1 500'; a refused text stays in the box with its rule's error", async () => {
  const value = await mountNumber(2048);
  for (const [typed, n] of [[".7", 0.7], ["5.", 5], ["+15", 15], ["1 500", 1500]]) {
    await type(typed);
    expect(value.value, typed).toBe(n);
  }
  // a number on its way changes nothing yet
  await type("1,");
  expect(value.value).toBe(1500);
  // not a number: null, the text kept through the blur, the rule's words under it
  await type("12abc");
  expect(value.value).toBeNull();
  input().dispatchEvent(new Event("blur"));
  for (let i = 0; i < 3; i++) await flushPromises();
  expect(input().value).toBe("12abc");
  expect(await form.validate()).toBe(false);
  expect(messages()).toMatch(/number/i);
});

test("a model that failed to load at start offers the app's Troubleshooting page — only when the app has one", async () => {
  // the runner's catalog: the warm-start model ended in an error
  const models = { models: [{ id: "gemma", status: "error", error: "Not enough graphics memory" }] };
  vi.stubGlobal("fetch", vi.fn(async (url) => new Response(JSON.stringify(String(url).includes("/v1/llm-runner/models") ? models : {}), { status: 200, headers: { "content-type": "application/json" } })));
  configureHelp({ hasDoc: () => false });
  warmModelId.value = "gemma";
  wrapper = mount(BootModelLoad, { attachTo: document.body, global: { plugins: [[quasar.Quasar, { ...QUASAR_TEST_OPTIONS, components: QUASAR_COMPONENTS }], i18n] } });
  for (let i = 0; i < 5; i++) await flushPromises();
  const help = () => [...document.body.querySelectorAll("button")].find((b) => b.textContent.trim() === "What can I do?");
  expect(document.body.textContent).toContain("Not enough graphics memory");
  expect(help()).toBeUndefined(); // no page, no link
  configureHelp({ hasDoc: (slug) => slug === "troubleshooting" });
  await flushPromises();
  help().click();
  await flushPromises();
  expect(warmModelId.value).toBe(""); // the splash goes, so the help shows over the app
  expect(helpState.slug).toBe("troubleshooting");
});
