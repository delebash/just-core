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
  AiStatusButton,
  AiTaskStrip,
  announce,
  AppDialog,
  AppearancePanel,
  BootModelLoad,
  clearAnnouncer,
  clearToasts,
  DataManagement,
  SettingsShell,
  StoragePanel,
  UiBanner,
  UiButton,
  UiSlider,
  useAiTasksNav,
  closeHelp,
  configureHelp,
  confirmDialog,
  HelpDrawer,
  helpState,
  installAnnouncer,
  openHelp,
  PaneHeader,
  promptDialog,
  pushToast,
  replacingData,
  reportError,
  schemaRules,
  tooltipDirective,
  UiField,
  UiInput,
  UiMenu,
  UiMenuItem,
  UiMultiSelect,
  UiNumber,
  UiSegmented,
  UiSelect,
  UiTextarea,
  QuickSetup,
  useAiTasksStore,
  useRunnerModels,
  warmModelId,
  withAiTask,
} from "@delebash/ui";
import { fmtBytes, fmtSpeed } from "@delebash/ui/common/services/downloadRate.js";
import LuModelCatalog from "@delebash/ui/components/LuModelCatalog.vue";
import LuMeasureHistory from "@delebash/ui/components/LuMeasureHistory.vue";
import TuneMeasureModal from "@delebash/ui/components/TuneMeasureModal.vue";
import PricingEditor from "@delebash/ui/views/PricingEditor.vue";
import ProviderForm from "@delebash/ui/views/ProviderForm.vue";
import { QUASAR_TEST_OPTIONS } from "@delebash/ui/quasar/install.js";
import { DOMWrapper, flushPromises, mount } from "@vue/test-utils";
import { computeAccessibleDescription, computeAccessibleName } from "dom-accessibility-api";
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
  await new DOMWrapper(confirm()).trigger("click");
  expect(await answer).toEqual({ keep: true });
  await flushPromises();
  answer = promptDialog({ title: "Again?", confirmLabel: "Go", fields });
  await flushPromises();
  await new DOMWrapper(box()).trigger("click");
  await flushPromises();
  expect(box().classList.contains("is-checked")).toBe(false);
  await new DOMWrapper(confirm()).trigger("click");
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
  pushToast({ title: "The export failed", description: "the drive is full", kind: "error" }); // a server's detail: lowercase
  for (let i = 0; i < 3; i++) await flushPromises();
  expect(region("polite").textContent).toContain("Saved");
  expect(region("assertive").textContent).toContain("The export failed. The drive is full."); // "Title. Detail."
  // the detail on the toast's own line starts with a capital
  expect(create.mock.calls[1][0].caption).toBe("The drive is full");
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
  expect(region("assertive")).toContain("Suggesting a title: failed. The model stopped.");
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

// ── The sixteenth review (2026-10-20): its probes (the scratchpad's adv16/ui) made tests ─────────────────

// a UiNumber in a form, with or without rules, the values it gave and the form's submits
async function numberForm(start, props = {}, { withRules = true, ignoreNull = false } = {}) {
  const value = ref(start);
  const emitted = [];
  const submitted = [];
  const ruleProps = withRules ? { rules, lazyRules: true } : {};
  await mountHost(() =>
    h(quasar.QForm, { ref: (f) => (form = f), onSubmit: () => submitted.push(value.value) }, () =>
      h(UiNumber, {
        id: "n",
        modelValue: value.value,
        "onUpdate:modelValue": (v) => {
          emitted.push(v);
          if (!(ignoreNull && v === null)) value.value = v;
        },
        ...ruleProps,
        ...props,
      }),
    ),
  );
  return { value, emitted, submitted };
}
// Quasar validates a little later (its validation is debounced): a macrotask, then the promises
const settle = async () => {
  await new Promise((r) => setTimeout(r, 10));
  for (let i = 0; i < 3; i++) await flushPromises();
};

test("UiNumber: Enter commits the text as leaving the box does — clamped — before the form submits", async () => {
  const { value, submitted } = await numberForm(2048, { min: 512, max: 4096 });
  input().focus();
  await type("99999"); // past the max (4096)
  key(input(), "Enter");
  await form.submit();
  await settle();
  expect(value.value).toBe(4096);
  expect(input().value).toBe("4,096");
  expect(submitted).toEqual([4096]);
});

test("UiNumber: a half-typed text committed by Enter blocks the submit with its error, never the old value", async () => {
  const { value, submitted } = await numberForm(2048);
  input().focus();
  for (const s of ["2", "2,", "2,04"]) await type(s);
  expect(value.value).toBe(2); // "2," and "2,04" are on their way: nothing changed yet
  key(input(), "Enter");
  await form.submit();
  await settle();
  expect(submitted).toEqual([]);
  expect(value.value).toBeNull();
  expect(input().value).toBe("2,04");
  expect(messages()).toContain("Must be a number");
});

test("UiNumber: what NumberParser refuses fails the field first — '1e3', '0x200', '2e3 ' — and is aria-invalid", async () => {
  for (const text of ["1e3", "0x200", "0b1000000000", "2e3 "]) {
    const { value } = await numberForm(1024);
    input().focus();
    await type(text);
    input().dispatchEvent(new FocusEvent("blur"));
    await settle();
    expect(await form.validate(), text).toBe(false);
    await settle();
    expect(value.value, text).toBeNull();
    expect(input().value, text).toBe(text);
    expect(messages(), text).toContain("Must be a number");
    expect(input().getAttribute("aria-invalid"), text).toBe("true");
    wrapper.unmount();
    document.body.innerHTML = "";
  }
});

test("UiNumber with no rules (SyncPanel's minutes): '5 min' shows its error and is aria-invalid", async () => {
  const { value } = await numberForm(5, { min: 0 }, { withRules: false, ignoreNull: true });
  input().focus();
  await type("5 min");
  input().dispatchEvent(new FocusEvent("blur"));
  await settle();
  expect(input().value).toBe("5 min");
  expect(value.value).toBe(5); // the host kept its setting — and the box says why nothing was saved
  expect(messages()).toContain("Must be a number");
  expect(input().getAttribute("aria-invalid")).toBe("true");
});

test("UiNumber: the arrows do nothing on a refused text or in a read-only box; '-0' is 0", async () => {
  let n = await numberForm(40, { step: 5 }, { withRules: false });
  input().focus();
  await type("abc");
  key(input(), "ArrowUp");
  await settle();
  expect(input().value).toBe("abc");
  expect(n.emitted).toEqual([null]); // the text's null, never 0 + 5
  wrapper.unmount();
  document.body.innerHTML = "";
  n = await numberForm(5, { readonly: true }, { withRules: false });
  input().focus();
  key(input(), "ArrowUp");
  await settle();
  expect(n.value.value).toBe(5);
  expect(n.emitted).toEqual([]);
  wrapper.unmount();
  document.body.innerHTML = "";
  n = await numberForm(3, {}, { withRules: false });
  input().focus();
  await type("-0");
  input().dispatchEvent(new FocusEvent("blur"));
  await settle();
  expect(Object.is(n.value.value, 0)).toBe(true);
  expect(input().value).toBe("0");
});

test("UiSegmented: a modified arrow picks nothing; right-to-left, → goes to the option before", async () => {
  const value = ref("brush");
  const options = ["look", "brush", "eraser"].map((v) => ({ value: v, label: v }));
  await mountHost(() => h(UiSegmented, { modelValue: value.value, "onUpdate:modelValue": (v) => (value.value = v), options, ariaLabel: "Tool" }));
  const radios = () => [...document.querySelectorAll('[role="radio"]')];
  radios()[1].focus();
  for (const mod of ["altKey", "ctrlKey", "metaKey"]) key(radios()[1], "ArrowRight", { [mod]: true });
  await settle();
  expect(value.value).toBe("brush");
  key(radios()[1], "ArrowRight");
  await settle();
  expect(value.value).toBe("eraser");
  wrapper.unmount();
  document.body.innerHTML = "";
  value.value = "brush";
  document.documentElement.dir = "rtl";
  try {
    await mountHost(() => h(UiSegmented, { modelValue: value.value, "onUpdate:modelValue": (v) => (value.value = v), options, ariaLabel: "Tool" }));
    radios()[1].focus();
    key(radios()[1], "ArrowRight"); // the row runs from the right: → is the option before
    await settle();
    expect(value.value).toBe("look");
    key(radios()[0], "ArrowLeft");
    await settle();
    expect(value.value).toBe("brush");
  } finally {
    document.documentElement.dir = "";
  }
});

test("v-tooltip takes the name a screen reader computes: aria-hidden text and a select's options are none, a child's alt is", async () => {
  const Comp = {
    template: `
      <div>
        <span id="lbl">Close the panel</span>
        <button id="b1" aria-labelledby="lbl" v-tooltip="'Close'"><svg aria-hidden="true"></svg></button>
        <label for="i1">House name</label><input id="i1" v-tooltip="'Type the name'">
        <button id="b2" v-tooltip="'Zoom in'"><svg aria-hidden="true"></svg></button>
        <button id="b3" v-tooltip="'Tasks running'"><svg aria-hidden="true"></svg><span aria-hidden="true">2</span></button>
        <a id="a1" href="#" v-tooltip="'Open the help'"><img alt="Help"></a>
        <button id="b4" v-tooltip="'Delete'"><span aria-label="Remove this house"></span></button>
        <button id="b5" v-tooltip="'Details'">Details</button>
        <select id="s1" v-tooltip="'The brand'"><option>Behr</option><option>Valspar</option></select>
      </div>`,
  };
  wrapper = mount(Comp, { attachTo: document.body, global: { plugins: plugins(), directives: { tooltip: tooltipDirective } } });
  await flushPromises();
  const name = (id) => computeAccessibleName(document.getElementById(id));
  const label = (id) => document.getElementById(id).getAttribute("aria-label");
  expect([name("b1"), label("b1")]).toEqual(["Close the panel", null]); // aria-labelledby kept
  expect([name("i1"), label("i1")]).toEqual(["House name", null]); // its <label> kept
  expect(name("b2")).toBe("Zoom in");
  expect(name("b3")).toBe("Tasks running"); // its only text is aria-hidden: no name of its own
  expect([name("a1"), label("a1")]).toEqual(["Help", null]); // the image's alt is its name
  expect([name("b4"), label("b4")]).toEqual(["Remove this house", null]); // a child's aria-label is
  expect([name("b5"), label("b5")]).toEqual(["Details", null]);
  expect(name("s1")).toBe("The brand"); // a select's options are no name
});

test("a failed task is announced once — the task store's words — though the page reports it too", async () => {
  installAnnouncer();
  setActivePinia(createPinia());
  await mountHost(() => h("div"));
  const create = vi.spyOn(quasar.Notify, "create");
  try {
    await withAiTask({ feature: "aiphoto.render", label: "The AI photo of Maple street" }, async () => {
      throw Object.assign(new Error("The GPU ran out of memory"), { status: 500, problem: { title: "The AI photo didn't finish", detail: "The GPU ran out of memory" } });
    });
  } catch (e) {
    reportError(e); // the page's catch, as HousePage's
  }
  await settle();
  const lines = [...document.querySelector('[data-live-announcer] [aria-live="assertive"]').children].map((d) => d.textContent);
  // in the server's words — its problem's title and detail — never the HTTP status line (the seventeenth review)
  expect(lines).toEqual(["The AI photo of Maple street: failed. The AI photo didn't finish. The GPU ran out of memory."]);
  expect(create).toHaveBeenCalledTimes(1); // the toast still shows
  create.mockRestore();
});

test("while a modal dialog is open, what is said is said inside it (outside an aria-modal dialog isn't in the tree)", async () => {
  installAnnouncer();
  await mountHost(() => h(AppDialog));
  // said in the very tick the dialog opens: it waits a tick, and lands in the dialog (the seventeenth review)
  const answer = promptDialog({ title: "Rename", confirmLabel: "Go", fields: [{ key: "name", label: "Name" }] });
  announce("Opened");
  await settle();
  const modal = document.querySelector('[role="dialog"][aria-modal="true"]');
  expect(modal).not.toBeNull();
  // its own pair
  const inModal = () => modal.querySelector('[data-live-announcer] [aria-live="polite"]').textContent;
  expect(inModal()).toContain("Opened");
  announce("Saved");
  await settle();
  expect(inModal()).toContain("Saved");
  expect(document.body.firstElementChild.textContent).not.toContain("Saved"); // not in the page's pair
  // said in the tick it closes: the page's pair, never the closing dialog's
  {
    const el = [...document.querySelectorAll("button")].find((b) => b.textContent.trim() === "Cancel");
    if (el) await new DOMWrapper(el).trigger("click");
  }
  announce("Closed");
  await answer;
  await settle();
  expect(document.body.firstElementChild.textContent).toContain("Closed");
});

// ── The sixteenth's screens review (2026-10-20, the scratchpad's screens3) ─────────────────────────────

test("the AI tasks panel is a modal dialog: the focus moves in, Escape closes it and gives the focus back", async () => {
  setActivePinia(createPinia());
  await mountHost(() => h(AiStatusButton));
  const trigger = document.querySelector(".ai-status-btn");
  expect(trigger.getAttribute("aria-expanded")).toBe("false");
  trigger.focus();
  await new DOMWrapper(trigger).trigger("click");
  await settle();
  await new Promise((r) => setTimeout(r, 400)); // its slide-in
  await settle();
  const dialog = document.querySelector('[role="dialog"][aria-modal="true"]');
  expect(computeAccessibleName(dialog)).toBe("AI tasks");
  expect(dialog.contains(document.activeElement)).toBe(true);
  expect(trigger.getAttribute("aria-expanded")).toBe("true");
  expect(trigger.getAttribute("aria-controls")).toBe(dialog.id);
  // Quasar's Escape is the keydown and keyup pair
  for (const type of ["keydown", "keyup"]) document.activeElement.dispatchEvent(new KeyboardEvent(type, { key: "Escape", keyCode: 27, bubbles: true }));
  await settle();
  await new Promise((r) => setTimeout(r, 400));
  await settle();
  expect(document.querySelector('[role="dialog"][aria-modal="true"]')).toBeNull();
  expect(trigger.getAttribute("aria-expanded")).toBe("false");
  expect(document.activeElement).toBe(trigger);
});

test("Appearance's selects are named by their rows' titles, not their values", async () => {
  await mountHost(() => h(AppearancePanel, { appearance: { mode: "system", uiScale: 1, uiFont: "System", accentHue: 166 }, locales: ["en", "es"] }));
  const names = [...document.querySelectorAll('[role="combobox"]')].map((el) => computeAccessibleName(el));
  expect(names).toEqual(["Theme", "Interface size", "UI font", "Language"]);
});

test("a slider's number box is named as the slider, never with its value", async () => {
  await mountHost(() => h("label", [h("span", "Texture"), h(UiSlider, { modelValue: 1, min: 0, max: 1, step: 0.05, ariaLabel: "Texture" })]));
  expect(computeAccessibleName(document.querySelector(".ui-slider-number input"))).toBe("Texture");
});

test("info and warning banners are status, a danger one an alert", async () => {
  await mountHost(() => ["info", "warning", "danger"].map((intent) => h(UiBanner, { intent }, () => intent)));
  expect([...document.querySelectorAll(".ui-banner")].map((b) => b.getAttribute("role"))).toEqual(["status", "status", "alert"]);
});

test("an emptied number box whose schema takes no null says Required before anything is sent", async () => {
  // a settings patch: every key optional, none nullable (just-house-paint's SettingsPatch)
  const patch = schemaRules({ type: "object", properties: { cardCopy: { type: "integer", minimum: 0 } } }).cardCopy;
  const value = ref(3);
  const submitted = [];
  await mountHost(() =>
    h(quasar.QForm, { ref: (f) => (form = f), onSubmit: () => submitted.push(value.value) }, () =>
      h(UiNumber, { id: "n", modelValue: value.value, "onUpdate:modelValue": (v) => (value.value = v), rules: patch, lazyRules: true }),
    ),
  );
  input().focus();
  await type("");
  input().dispatchEvent(new FocusEvent("blur"));
  await form.submit();
  await settle();
  expect(submitted).toEqual([]);
  expect(messages()).toContain("Required");
  // a nullable one may be emptied
  const nullable = schemaRules({ type: "object", properties: { n: { anyOf: [{ type: "integer" }, { type: "null" }] } } }).n;
  expect(nullable.nullable).toBe(true);
  expect(patch.nullable).toBe(false);
});

test("Settings' tabs name only the panel that is in the page", async () => {
  const sections = ["general", "appearance", "logs"].map((id) => ({ id, label: id }));
  await mountHost(() => h(SettingsShell, { sections, modelValue: "appearance" }, () => h("p", "the panel")));
  const tabs = [...document.querySelectorAll('[role="tab"]')];
  expect(tabs.map((tb) => tb.getAttribute("aria-controls") !== null)).toEqual([false, true, false]);
  const panel = document.getElementById(tabs[1].getAttribute("aria-controls"));
  expect(panel.getAttribute("role")).toBe("tabpanel");
  expect(computeAccessibleName(document.querySelector('[role="tablist"]'))).toBe("Settings sections");
});

test("Reset asks with its sentence as the message, the field 'Type RESET to confirm', Reset off until it's typed", async () => {
  await mountHost(() => [h(AppDialog), h(DataManagement, { appName: "Family Template" })]);
  await new DOMWrapper([...document.querySelectorAll("button")].find((b) => b.textContent.trim() === "Reset…")).trigger("click");
  await settle();
  const dlg = document.querySelector('[role="dialog"][aria-modal="true"]');
  expect(dlg.querySelector(".ui-dialog__message").textContent).toContain("Wipes ALL data");
  const field = dlg.querySelector("input");
  expect(computeAccessibleName(field)).toBe("Type RESET to confirm");
  const resetBtn = () => [...dlg.querySelectorAll("button")].find((b) => b.textContent.trim() === "Reset");
  expect(resetBtn().disabled).toBe(true);
  field.value = "RESET";
  field.dispatchEvent(new Event("input"));
  await settle();
  expect(resetBtn().disabled).toBe(false);
  await new DOMWrapper([...dlg.querySelectorAll("button")].find((b) => b.textContent.trim() === "Cancel")).trigger("click");
  await settle();
});

// ── The seventeenth review (2026-10-20, the scratchpad's screens4 and adv17) ─────────────────────────────

test("an off segment's reason is its description and the kit's tooltip (hover here; focus too, in a browser)", async () => {
  const options = [
    { value: "look", label: "Look" },
    { value: "box", label: "Box", disabled: true, title: "Install the part finder first" },
  ];
  await mountHost(() => h(UiSegmented, { modelValue: "look", options, ariaLabel: "Tool" }));
  const off = document.querySelectorAll('[role="radio"]')[1];
  expect(off.hasAttribute("title")).toBe(false); // no native title (nothing on focus or touch)
  expect(computeAccessibleDescription(off)).toBe("Install the part finder first");
  // jsdom has no keyboard-focus (:focus-visible) state to tell a keyboard focus by; the same show runs on hover
  off.dispatchEvent(new PointerEvent("pointerenter", { pointerType: "mouse" }));
  await new Promise((r) => setTimeout(r, 450)); // the tooltip's delay
  expect([...document.querySelectorAll(".ui-tooltip")].map((el) => el.textContent)).toContain("Install the part finder first");
  expect(computeAccessibleDescription(off)).toBe("Install the part finder first"); // still its own, not replaced
});

test("Reset's word in any case, spaces aside; its box a token's width; the dialog's × is Close", async () => {
  await mountHost(() => [h(AppDialog), h(DataManagement, { appName: "Family Template" })]);
  await new DOMWrapper([...document.querySelectorAll("button")].find((b) => b.textContent.trim() === "Reset…")).trigger("click");
  await settle();
  const dlg = document.querySelector('[role="dialog"][aria-modal="true"]');
  const field = dlg.querySelector("input");
  expect(field.closest(".ui-input").classList.contains("ui-w-token")).toBe(true);
  expect([...dlg.querySelectorAll("button")].filter((b) => computeAccessibleName(b) === "Cancel")).toHaveLength(1);
  expect([...dlg.querySelectorAll("button")].some((b) => computeAccessibleName(b) === "Close")).toBe(true);
  const resetBtn = () => [...dlg.querySelectorAll("button")].find((b) => b.textContent.trim() === "Reset");
  field.value = " reset ";
  field.dispatchEvent(new Event("input"));
  await settle();
  expect(resetBtn().disabled).toBe(false);
  await new DOMWrapper([...dlg.querySelectorAll("button")].find((b) => b.textContent.trim() === "Cancel")).trigger("click");
  await settle();
});

test("a button off while focused keeps the focus (focusableWhenDisabled): aria-disabled, no click, no submit", async () => {
  const off = ref(false);
  const submitted = vi.fn();
  const clicked = vi.fn();
  await mountHost(() =>
    h(quasar.QForm, { onSubmit: submitted }, () =>
      h(UiButton, { type: "submit", label: "Save", disabled: off.value, focusableWhenDisabled: true, onClick: clicked }),
    ),
  );
  const btn = document.querySelector("button.ui-btn");
  btn.focus();
  off.value = true; // saved: nothing left to save
  await settle();
  expect(document.activeElement).toBe(btn);
  expect(btn.disabled).toBe(false);
  expect(btn.getAttribute("aria-disabled")).toBe("true");
  expect(btn.classList.contains("is-disabled")).toBe(true);
  expect(computeAccessibleName(btn)).toBe("Save");
  await new DOMWrapper(btn).trigger("click");
  for (const type of ["keydown", "keyup"]) btn.dispatchEvent(new KeyboardEvent(type, { key: "Enter", keyCode: 13, bubbles: true, cancelable: true }));
  await settle();
  expect(clicked).not.toHaveBeenCalled();
  expect(submitted).not.toHaveBeenCalled();
  // on again: it works
  off.value = false;
  await settle();
  await new DOMWrapper(btn).trigger("click");
  await settle();
  expect(clicked).toHaveBeenCalledTimes(1);
});

test("the AI tasks panel gives the focus back after a click outside too, and a wheel over its backdrop scrolls nothing", async () => {
  setActivePinia(createPinia());
  await mountHost(() => h(AiStatusButton));
  const trigger = document.querySelector(".ai-status-btn");
  trigger.focus();
  await new DOMWrapper(trigger).trigger("click");
  await new Promise((r) => setTimeout(r, 400));
  await settle();
  const backdrop = document.querySelector(".aip-overlay .q-dialog__backdrop");
  const wheel = new WheelEvent("wheel", { deltaY: 300, bubbles: true, cancelable: true });
  backdrop.dispatchEvent(wheel);
  expect(wheel.defaultPrevented).toBe(true);
  // a click outside: the mousedown takes the focus to <body>, then the panel closes
  document.activeElement.blur();
  for (const type of ["mousedown", "mouseup", "click"]) backdrop.dispatchEvent(new MouseEvent(type, { bubbles: true, cancelable: true }));
  await new Promise((r) => setTimeout(r, 400));
  await settle();
  expect(document.querySelector('[role="dialog"][aria-modal="true"]')).toBeNull();
  expect(document.activeElement).toBe(trigger);
});

test("UiNumber is aria-invalid only while its error's words show", async () => {
  const { value } = await numberForm(1024);
  input().focus();
  await type("abc");
  await settle();
  expect(messages()).toBe(""); // lazy rules: no words yet
  expect(input().hasAttribute("aria-invalid")).toBe(false);
  input().blur();
  await form.validate(); // the moment the words show (a blur's, a submit's)
  await settle();
  expect(messages()).toContain("Must be a number");
  expect(input().getAttribute("aria-invalid")).toBe("true");
  expect(value.value).toBeNull();
});

test("an info banner wears the info icon; the AI tasks row has no title equal to its words", async () => {
  await mountHost(() => [h(UiBanner, { intent: "info" }, () => "A note"), h(UiBanner, { intent: "warning" }, () => "Slow here")]);
  const [info, warning] = [...document.querySelectorAll(".ui-banner path")].map((p) => p.getAttribute("d"));
  expect(info.startsWith("M12 22a10 10")).toBe(true); // Lucide's info: a circle and an i
  expect(warning.startsWith("M12 4 2 20h20")).toBe(true); // the triangle
  setActivePinia(createPinia());
  expect("title" in useAiTasksNav().navAttrs).toBe(false);
});

// ── The eighteenth review (2026-10-20, the scratchpad's adv18) ─────────────────────────────────────────

test("the announcer: one tick's lines all land; a region's lines go together after its last; clear takes the queued too", async () => {
  installAnnouncer();
  await mountHost(() => h("div"));
  clearAnnouncer();
  const polite = () => [...document.querySelector('[data-live-announcer] [aria-live="polite"]').children].map((d) => d.textContent);
  for (let i = 1; i <= 6; i++) announce(`line ${i}`, "polite", { lingerMs: 120 }); // a burst, one tick
  await settle();
  expect(polite()).toEqual(["line 1", "line 2", "line 3", "line 4", "line 5", "line 6"]); // none dropped
  announce("later", "polite", { lingerMs: 120 });
  await settle();
  expect(polite()).toEqual(["line 4", "line 5", "line 6", "later"]); // the cap takes earlier ticks' lines only
  await new Promise((r) => setTimeout(r, 70));
  announce("again", "polite", { lingerMs: 120 }); // resets the region's one timer
  await new Promise((r) => setTimeout(r, 80)); // 150 ms after "later": still there, the timer was reset
  expect(polite()).toContain("later");
  await new Promise((r) => setTimeout(r, 120));
  expect(polite()).toEqual([]); // all gone, 120 ms after the last
  announce("never said");
  clearAnnouncer(); // before its tick: taken back
  await settle();
  expect(polite()).toEqual([]);
});

test("a toast equal to one showing isn't added again; an off link never follows its href", async () => {
  await mountHost(() => h(UiButton, { as: "a", href: "#/elsewhere", disabled: true, label: "Open" }));
  const create = vi.spyOn(quasar.Notify, "create");
  pushToast({ title: "Copied", kind: "success" });
  pushToast({ title: "Copied", kind: "success" });
  pushToast({ title: "Copied again", kind: "success" });
  expect(create).toHaveBeenCalledTimes(2);
  create.mockRestore();
  clearToasts();
  const link = document.querySelector("a.ui-btn");
  const click = new MouseEvent("click", { bubbles: true, cancelable: true });
  link.dispatchEvent(click);
  expect(click.defaultPrevented).toBe(true);
  expect(link.getAttribute("aria-disabled")).toBe("true");
});

test("a failed task's row says the server's words, never the HTTP status line", async () => {
  setActivePinia(createPinia());
  await mountHost(() => h("div"));
  const tasks = useAiTasksStore();
  const err = Object.assign(new Error("409 Conflict: install it first, on a house's Parts tab"), {
    status: 409,
    problem: { title: "The part finder isn't installed", detail: "install it first, on a house's Parts tab" },
  });
  await withAiTask({ feature: "finder.find", label: "Find the parts", lingerMs: { failed: null } }, async () => {
    throw err;
  }).catch(() => {});
  const failed = Object.values(tasks.tasks).find((x) => x.label === "Find the parts");
  expect(failed.error).toBe("The part finder isn't installed. Install it first, on a house's Parts tab.");
  expect(failed.error).not.toMatch(/409/);
});

// ── The nineteenth review (2026-10-20, the scratchpad's adv19) ─────────────────────────────────────────

test("a toast with an action is never merged with another — each Undo its own; an off link has no href and takes no middle click", async () => {
  await mountHost(() => h(UiButton, { as: "a", href: "https://example.com/file.wav", disabled: true, label: "Download" }));
  const create = vi.spyOn(quasar.Notify, "create");
  const undoA = vi.fn();
  const undoB = vi.fn();
  pushToast({ message: "Deleted", action: { label: "Undo", fn: undoA } });
  pushToast({ message: "Deleted", action: { label: "Undo", fn: undoB } });
  expect(create).toHaveBeenCalledTimes(2);
  expect(create.mock.calls.map(([o]) => o.actions.find((a) => a.label === "Undo").handler)).toEqual([undoA, undoB]);
  pushToast({ message: "Copied" });
  pushToast({ message: "Copied" }); // no action: still one toast
  expect(create).toHaveBeenCalledTimes(3);
  create.mockRestore();
  clearToasts();
  const link = document.querySelector("a.ui-btn");
  expect(link.hasAttribute("href")).toBe(false);
  expect(link.getAttribute("role")).toBe("link");
  expect(link.getAttribute("aria-disabled")).toBe("true");
  const middle = new MouseEvent("auxclick", { button: 1, bubbles: true, cancelable: true });
  link.dispatchEvent(middle);
  expect(middle.defaultPrevented).toBe(true);
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
  await new DOMWrapper(help()).trigger("click");
  await flushPromises();
  expect(warmModelId.value).toBe(""); // the splash goes, so the help shows over the app
  expect(helpState.slug).toBe("troubleshooting");
});

// ── A model is named by its name, not its id (JustWrite's box checks, 2026-10-24) ─────────────────────

const ID = "gemma-4-26b-a4b-qat";
const NAME = "Gemma 4 26B A4B";
function serve(routes) {
  vi.stubGlobal("fetch", vi.fn(async (url) => {
    const hit = Object.entries(routes).find(([path]) => String(url).includes(path));
    return new Response(JSON.stringify(hit ? hit[1] : {}), { status: 200, headers: { "content-type": "application/json" } });
  }));
}
const withPinia = () => [[quasar.Quasar, { ...QUASAR_TEST_OPTIONS, components: QUASAR_COMPONENTS }], i18n, createPinia()];

test("the boot splash's load bar is titled with the model's name", async () => {
  serve({ "/v1/llm-runner/models": { models: [{ id: ID, name: NAME, status: "error", error: "Not enough graphics memory" }] } });
  await useRunnerModels().refresh(); // the shared list (a singleton) reads this test's catalog
  configureHelp({ hasDoc: () => false });
  warmModelId.value = ID;
  wrapper = mount(BootModelLoad, { attachTo: document.body, global: { plugins: withPinia() } });
  for (let i = 0; i < 5; i++) await flushPromises();
  expect(document.body.textContent).toContain(NAME);
  expect(document.body.textContent).not.toContain(ID);
});

test("Quick Setup's set-up line names the default model, before the wizard ever opens", async () => {
  serve({
    "/v1/llm-runner/models": { models: [{ id: ID, name: NAME, status: "disk", fit: "gpu" }] },
    "/v1/ai/preset-assignments": { defaultPresetId: "chat" },
    "/v1/ai/engine-presets": { presets: [{ id: "chat", model: ID, providerId: "local-llamacpp", position: 0 }] },
  });
  await useRunnerModels().refresh();
  wrapper = mount(QuickSetup, { props: { inline: true }, attachTo: document.body, global: { plugins: withPinia() } });
  for (let i = 0; i < 5; i++) await flushPromises();
  expect(document.body.textContent).toContain(`Local AI is set up — ${NAME} is the default`);
  expect(document.body.textContent).not.toContain(ID);
});

test("the catalog's fit chip says its facts as a sentence, then the speed as its own", async () => {
  serve({
    "/v1/llm-runner/models": { vramMb: 8192, models: [{ id: ID, name: NAME, status: "disk", fit: "gpu", minVramMb: 3174, predTokS: 7.9 }] },
  });
  await useRunnerModels().refresh();
  wrapper = mount(LuModelCatalog, { attachTo: document.body, global: { plugins: withPinia() } });
  for (let i = 0; i < 8; i++) await flushPromises();
  const chip = document.body.querySelector(".lu-fit[title]");
  expect(chip, document.body.textContent.slice(0, 400)).not.toBeNull();
  expect(chip.getAttribute("title")).toMatch(
    /^Estimated — needs ~3\.1 GB VRAM · you have 8 GB( · not yet tested on your PC class)?\. Estimated speed: ~7\.9 tok\/s — a real run replaces this estimate\.$/,
  );
});

// ── JustWrite's box checks, round two (2026-10-24) ─────────────────────────────────────────────────

const flushAll = async (n = 8) => {
  for (let i = 0; i < n; i++) await flushPromises();
};
const typeInto = async (input, text) => {
  input.value = text;
  input.dispatchEvent(new Event("input"));
  await flushAll(2);
};

test("the Tune dialog's header says the catalog row's state — a class-configured model isn't 'Not tuned'", async () => {
  serve({ "/v1/ai/model-tunes/state": { classKey: "vram8|ram32", tuned: {}, classConfigured: [ID] } });
  wrapper = mount(TuneMeasureModal, { props: { model: { id: ID, name: NAME } }, attachTo: document.body, global: { plugins: withPinia() } });
  await flushAll();
  expect(document.body.querySelector(".lu-tune-savedtag")?.textContent.trim()).toBe("Tuned by PC class config — using the layered defaults");
});

test("the price table: Save only on an edited row, one row's save keeps another's edit, the buttons inside their cell", async () => {
  let rows = [
    { modelId: "gpt-a", inputPerM: 1, outputPerM: 2 },
    { modelId: "gpt-b", inputPerM: 3, outputPerM: 4 },
  ];
  const puts = [];
  vi.stubGlobal("fetch", vi.fn(async (_url, init = {}) => {
    if (init.method === "PUT") {
      const b = JSON.parse(init.body);
      puts.push(b);
      rows = rows.map((r) => (r.modelId === b.modelId ? b : r));
    }
    return new Response(JSON.stringify({ rows }), { status: 200, headers: { "content-type": "application/json" } });
  }));
  wrapper = mount(PricingEditor, { attachTo: document.body, global: { plugins: withPinia() } });
  await flushAll();
  const saves = () => [...document.body.querySelectorAll("button")].filter((b) => b.textContent.trim() === "Save");
  const boxes = () => [...document.body.querySelectorAll(".lu-price-tbl tbody tr")].slice(0, 2).map((tr) => tr.querySelectorAll("input"));
  expect(saves()).toHaveLength(0); // nothing edited, no primary button on every row
  // a <td> set to flex stops being a table cell: the buttons' row is a div inside it
  expect(document.body.querySelector("td > .lu-price-act")).not.toBeNull();
  expect(document.body.querySelector("td.lu-price-act")).toBeNull();
  await typeInto(boxes()[0][0], "1.5");
  await typeInto(boxes()[1][1], "9");
  expect(saves()).toHaveLength(2);
  await new DOMWrapper(saves()[0]).trigger("click");
  await flushAll();
  expect(puts).toEqual([{ modelId: "gpt-a", inputPerM: 1.5, outputPerM: 2 }]);
  expect(saves()).toHaveLength(1); // gpt-a saved; gpt-b's edit is still there, still unsaved
  expect(boxes()[1][1].value).toBe("9");
});

test("the provider form shows the timeout it saves, and picks the provider type with the kit's select", async () => {
  serve({});
  const provider = { id: "p1", name: "My server", providerType: "openai-compat", baseUrl: "http://127.0.0.1:9/v1", timeoutSeconds: 120, local: true };
  wrapper = mount(ProviderForm, { props: { provider }, attachTo: document.body, global: { plugins: withPinia() } });
  await flushAll();
  const text = document.body.textContent;
  expect(text).toContain("Timeout (seconds)");
  expect([...document.body.querySelectorAll("input")].some((i) => i.value === "120")).toBe(true);
  expect(document.body.querySelector("select.lu-input")).toBeNull(); // the hand-rolled <select> is gone
});

test("a size and its unit never part: a no-break space between them", () => {
  expect(fmtBytes(5.0 * 1024 ** 3)).toBe("5.0 GB");
  expect(fmtBytes(300 * 1024 ** 2)).toBe("300 MB");
  expect(fmtSpeed(12 * 1024 ** 2)).toBe("12 MB/s");
});

// ── The twentieth review (2026-10-20): a field in error ─────────────────────────────────────────────────

test("a field in error says its rule's words under the box, outside its edge, with no error icon — every kit field on QField", async () => {
  const fail = [() => "Write it like #a1b2c3"];
  await mountHost(() =>
    // greedy: every field validated, not only up to the first that fails
    h(quasar.QForm, { ref: (f) => (form = f), greedy: true }, () => [
      h(UiInput, { id: "e-text", modelValue: "zz", rules: fail }),
      h(UiNumber, { id: "e-num", modelValue: 5, rules: fail }),
      h(UiTextarea, { id: "e-area", modelValue: "zz", rules: fail }),
      h(UiSelect, { id: "e-sel", modelValue: "a", options: ["a", "b"], rules: fail }),
      h(UiMultiSelect, { id: "e-msel", modelValue: ["a"], options: ["a", "b"], rules: fail }),
      h(UiInput, { id: "e-icon", modelValue: "zz", rules: fail, noErrorIcon: false }),
    ]),
  );
  expect(await form.validate()).toBe(false);
  await settle();
  for (const id of ["e-text", "e-num", "e-area", "e-sel", "e-msel"]) {
    const field = document.getElementById(id).closest(".q-field");
    expect(field.classList.contains("q-field--error"), id).toBe(true);
    const bottom = field.querySelector(".q-field__bottom");
    expect(bottom?.textContent.trim(), id).toBe("Write it like #a1b2c3");
    // the words are the box's sibling, never inside the control (the box's edge, for a select)
    expect(bottom.closest(".q-field__control"), id).toBeNull();
    expect(field.querySelector(".q-field__control").compareDocumentPosition(bottom) & Node.DOCUMENT_POSITION_FOLLOWING, id).toBeTruthy();
    // no Quasar error icon of its own (its own row, 40px)
    expect(field.querySelector(".q-icon.text-negative"), id).toBeNull();
  }
  // the words describe the text box (aria-describedby, Quasar's)
  expect(computeAccessibleDescription(document.getElementById("e-text"))).toBe("Write it like #a1b2c3");
  // an app that wants Quasar's icon asks for it
  expect(document.getElementById("e-icon").closest(".q-field").querySelector(".q-icon.text-negative")).not.toBeNull();
});

// The backup panel's restore: a file chosen, the confirm answered, what the server said back
async function restoreWith(response, props = {}) {
  // the reload a restore starts is never run here (jsdom can't navigate): from the request on, the timers are fake
  vi.stubGlobal("fetch", vi.fn(async () => {
    vi.useFakeTimers({ toFake: ["setTimeout"] });
    return response;
  }));
  await mountHost(() => [h(AppDialog), h(DataManagement, { appName: "Family Template", ...props })]);
  const create = vi.spyOn(quasar.Notify, "create");
  const picker = document.querySelector('input[type="file"]');
  Object.defineProperty(picker, "files", { value: [new File(["zip"], "old.zip", { type: "application/zip" })], configurable: true });
  picker.dispatchEvent(new Event("change"));
  await settle();
  await new DOMWrapper([...document.querySelectorAll('[role="dialog"] button')].find((b) => b.textContent.trim() === "Restore")).trigger("click");
  // the dialog closes (Quasar's transition, a real timer), then the request (its timers fake from then on)
  await vi.waitFor(() => expect(fetch).toHaveBeenCalled());
  for (let i = 0; i < 6; i++) await flushPromises();
  vi.useRealTimers();
  replacingData(false);
  const said = create.mock.calls.map(([o]) => o.message);
  create.mockRestore();
  clearToasts();
  return said;
}
const json = (status, body) => new Response(JSON.stringify(body), { status, headers: { "content-type": status < 400 ? "application/json" : "application/problem+json" } });

test("a restore that fails says the server's words — never 'HTTP 400 —'", async () => {
  const said = await restoreWith(json(400, { type: "about:blank", title: "Bad Request", status: 400, detail: "not a valid backup zip" }));
  expect(said).toEqual(["Restore failed: not a valid backup zip"]);
});

test("a restore's settings set back to their defaults are named each in quotes, in the language's list", async () => {
  sessionStorage.clear();
  const labels = { "render.size": "Size, in pixels", "render.light": "Light, outdoors", "ui.zoom": "Zoom" };
  await restoreWith(json(200, { restored: true, resetSettings: ["render.size", "render.light", "ui.zoom"] }), { settingLabel: (k) => labels[k] });
  // said after the reload the restore starts (kept in this tab's sessionStorage until then)
  expect(JSON.parse(sessionStorage.getItem("kit.dataManagement.afterRestore")).message).toBe(
    "Some settings in the backup didn't fit this version and were set back to their defaults: “Size, in pixels”, “Light, outdoors”, and “Zoom”.",
  );
  sessionStorage.clear();
});

test("a reset that fails says the server's words and the reference that finds its log line — never 'HTTP 500 —'", async () => {
  vi.stubGlobal("fetch", vi.fn(async () => json(500, { type: "about:blank", title: "Internal Server Error", status: 500, detail: "database is locked", requestId: "r-42" })));
  await mountHost(() => [h(AppDialog), h(DataManagement, { appName: "Family Template" })]);
  const create = vi.spyOn(quasar.Notify, "create");
  await new DOMWrapper([...document.querySelectorAll("button")].find((b) => b.textContent.trim() === "Reset…")).trigger("click");
  await settle();
  const dlg = document.querySelector('[role="dialog"][aria-modal="true"]');
  dlg.querySelector("input").value = "RESET";
  dlg.querySelector("input").dispatchEvent(new Event("input"));
  await settle();
  await new DOMWrapper([...dlg.querySelectorAll("button")].find((b) => b.textContent.trim() === "Reset")).trigger("click");
  await vi.waitFor(() => expect(create).toHaveBeenCalled());
  expect(create.mock.calls.map(([o]) => o.message)).toEqual(["Reset failed: database is locked · Reference r-42"]);
  create.mockRestore();
  clearToasts();
});

test("Storage's old copies: each button named with its folder; Try again and Remove keep the focus on the rows and say what happened", async () => {
  installAnnouncer();
  vi.stubGlobal("fetch", vi.fn(async () => new Response("{}", { status: 200, headers: { "content-type": "application/json" } })));
  let copies = [
    { root: "F:\\old", bytes: 0, connected: false, cause: "slow" },
    { root: "E:\\older", bytes: 1048576, connected: true },
  ];
  const list = async () => copies.map((c) => ({ ...c }));
  const shell = {
    getRoot: async () => ({ root: "D:\\data", default: "C:\\data", portable: false }),
    oldCopies: vi.fn(list),
    forgetOldCopy: async (root) => {
      copies = copies.filter((c) => c.root !== root);
      return list();
    },
    removeOldCopy: async (root) => {
      copies = copies.filter((c) => c.root !== root);
      return list();
    },
    pickDirectory: async () => null,
  };
  await mountHost(() => [h(AppDialog), h(StoragePanel, { shell })]);
  await settle();
  const polite = () => document.querySelector('[data-live-announcer] [aria-live="polite"]').textContent;
  const named = (name) => [...document.querySelectorAll("button")].find((b) => computeAccessibleName(b) === name);
  // the visible words first, then the folder (WCAG 2.5.3)
  expect(named("Try again: the old copy in F:\\old")).toBeTruthy();
  expect(named("Forget… the old copy in F:\\old")).toBeTruthy();
  expect(named("Remove the old copy… in E:\\older")).toBeTruthy();
  // the row that didn't answer says so once
  const row = document.querySelector("[data-old-copy-row]");
  expect(row.textContent.split("Didn't answer just now").length - 1).toBe(1);

  // Try again, and it still doesn't answer: the focus stays on its row, and that is said
  named("Try again: the old copy in F:\\old").focus();
  await new DOMWrapper(named("Try again: the old copy in F:\\old")).trigger("click");
  await settle();
  expect(shell.oldCopies).toHaveBeenLastCalledWith({ again: true });
  expect(computeAccessibleName(document.activeElement)).toBe("Try again: the old copy in F:\\old");
  expect(polite()).toContain("The old copy in F:\\old still doesn't answer");

  // Try again, and it answers now: its Try again is gone — the focus goes to its row's Remove, and that is said
  copies[0] = { root: "F:\\old", bytes: 2048, connected: true };
  await new DOMWrapper(named("Try again: the old copy in F:\\old")).trigger("click");
  await settle();
  expect(computeAccessibleName(document.activeElement)).toBe("Remove the old copy… in F:\\old");
  expect(polite()).toContain("The old copy in F:\\old answers now");

  // Remove: asked, removed, the focus on the copy in its place, and said
  await new DOMWrapper(named("Remove the old copy… in F:\\old")).trigger("click");
  await settle();
  await new DOMWrapper([...document.querySelectorAll('[role="dialog"] button')].find((b) => b.textContent.trim() === "Remove the old copy")).trigger("click");
  await vi.waitFor(() => expect(polite()).toContain("The old copy in F:\\old was removed"));
  expect(computeAccessibleName(document.activeElement)).toBe("Remove the old copy… in E:\\older");
});

test("a dialog opened over another cancels it as its own kind cancels — a prompt null, a confirm false", async () => {
  await mountHost(() => h(AppDialog));
  const prompt = promptDialog({ title: "Type RESET" });
  const confirm = confirmDialog({ title: "Restore from backup?" });
  expect(await prompt).toBeNull(); // it was false: Reset's prompt read it as a typed word ("Confirmation didn't match")
  const again = promptDialog({ title: "Name?" });
  expect(await confirm).toBe(false);
  await settle();
  await new DOMWrapper([...document.querySelectorAll('[role="dialog"] button')].find((b) => b.textContent.trim() === "Cancel")).trigger("click");
  expect(await again).toBeNull();
});

// The finish list's A10 (2026-10-29): a measurement the Tune dialog's "Load & measure" recorded has no label, and the
// history named it the bare word "measured" — it reads as the button that made it. The load-footprint rows each load
// records (source "load", 0 tok/s) stay out: they are fit evidence, not speed runs (measurements.js SPEED_SOURCES).
test("measurement history: an unnamed run reads as the button that made it; a load's footprint row isn't listed", async () => {
  serve({
    "/v1/ai/model-measurements": {
      measurements: [
        { id: 1, modelId: ID, source: "tune", label: "", tokensPerSec: 12.3, at: "2026-10-29T10:00:00Z", switches: [] },
        { id: 2, modelId: ID, source: "load", label: "load footprint (measured)", tokensPerSec: 0, at: "2026-10-29T09:00:00Z", switches: [] },
      ],
    },
  });
  wrapper = mount(LuMeasureHistory, { props: { modelId: ID }, attachTo: document.body, global: { plugins: withPinia() } });
  const drawer = wrapper.find("details");
  drawer.element.open = true;
  await drawer.trigger("toggle");
  await flushAll();
  const table = wrapper.find(".lu-mh-tbl").text();
  expect(table).toContain("Load & measure");
  expect(table).not.toMatch(/\bmeasured\b/);
  expect(table).not.toContain("load footprint");
});

// The finish list's C25 (2026-10-29; JustVoice's import-format picker): UiSelect takes groups — `{label, options}` beside
// plain options — each group's name a header above its first option (Quasar's option slot, the extra element marked
// q-virtual-scroll--with-prev so the list's size math holds); the keyboard moves over the options only.
test("UiSelect groups its options under headers; choosing one emits its value", async () => {
  const value = ref("txt");
  wrapper = mount(
    {
      render: () =>
        h(UiSelect, {
          id: "g-sel",
          modelValue: value.value,
          "onUpdate:modelValue": (v) => (value.value = v),
          options: [
            { label: "Text", options: [{ label: "Plain text", value: "txt" }, { label: "Markdown", value: "md" }] },
            { label: "Books", options: [{ label: "EPUB", value: "epub" }] },
          ],
        }),
    },
    { attachTo: document.body, global: { plugins: withPinia() } },
  );
  await flushAll();
  wrapper.findComponent(quasar.QSelect).vm.showPopup();
  await flushAll();
  const menu = document.body.querySelector(".ui-select-content");
  expect([...menu.querySelectorAll(".ui-select-group")].map((g) => g.textContent.trim())).toEqual(["Text", "Books"]);
  expect([...menu.querySelectorAll(".ui-select-item")].map((i) => i.textContent.trim())).toEqual(["Plain text", "Markdown", "EPUB"]);
  expect(menu.querySelectorAll('[role="option"]').length).toBe(3); // headers are no options
  await new DOMWrapper([...menu.querySelectorAll(".ui-select-item")].at(-1)).trigger("click");
  await flushAll();
  expect(value.value).toBe("epub");
});
