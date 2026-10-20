// SPDX-License-Identifier: MIT
// The v-tooltip directive (common/services/tooltip.js) never leaves a tooltip on screen that no
// control owns. Found by the visual review of Just House Paint (2026-10-20): Help's "?" kept one
// "Help — Your houses" tooltip on screen per open-and-Esc — closing the drawer gave the trigger its
// focus back (a keyboard focus) while the pointer, still over it, entered it again, so show() ran
// twice; each run started a show timer and the first one's tooltip was overwritten, never removed.
// A node test: a few lines of DOM stand in (no DOM library in the kit), Floating UI is a stub, and
// the timers are Vitest's fake ones.
import { afterEach, beforeEach, expect, test, vi } from "vitest";

vi.mock("@floating-ui/dom", () => ({
  autoUpdate: () => () => {},
  computePosition: async () => ({ x: 0, y: 0 }),
  offset: () => ({}),
  flip: () => ({}),
  shift: () => ({}),
}));
const { tooltipDirective } = await import("../src/common/services/tooltip.js");

/** A minimal element: listeners, attributes, classList, remove(). */
function fakeEl(tag = "div") {
  const listeners = {};
  const attrs = {};
  const classes = new Set();
  const el = {
    tagName: tag.toUpperCase(),
    isConnected: true,
    style: {},
    textContent: "",
    id: "",
    className: "",
    classList: { add: (c) => classes.add(c), remove: (c) => classes.delete(c), contains: (c) => classes.has(c) },
    setAttribute: (k, v) => {
      attrs[k] = String(v);
    },
    getAttribute: (k) => attrs[k] ?? null,
    removeAttribute: (k) => {
      delete attrs[k];
    },
    addEventListener: (type, fn) => {
      (listeners[type] ||= new Set()).add(fn);
    },
    removeEventListener: (type, fn) => listeners[type]?.delete(fn),
    dispatch: (type, init = {}) => {
      for (const fn of [...(listeners[type] || [])]) fn({ type, ...init });
    },
    matches: () => true, // :focus-visible — a keyboard focus
    remove: () => {
      el.isConnected = false;
      body.children.delete(el);
    },
  };
  return el;
}
const body = { children: new Set(), appendChild: (el) => body.children.add(el) };
const tooltips = () => [...body.children].filter((el) => el.className === "ui-tooltip");

beforeEach(() => {
  vi.useFakeTimers();
  const doc = fakeEl("document");
  doc.body = body;
  doc.createElement = (tag) => fakeEl(tag);
  vi.stubGlobal("document", doc);
  vi.stubGlobal("requestAnimationFrame", (fn) => setTimeout(fn, 0));
});
afterEach(() => {
  body.children.clear();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

test("a focus and a pointer entering together show ONE tooltip, and leaving takes it away", () => {
  const trigger = fakeEl("button");
  tooltipDirective.mounted(trigger, { value: "Help — Your houses", modifiers: { bottom: true } });
  // the drawer closed by Esc: focus comes back to the "?" while the pointer enters it again
  trigger.dispatch("focus");
  trigger.dispatch("pointerenter", { pointerType: "mouse" });
  vi.advanceTimersByTime(1000);
  expect(tooltips()).toHaveLength(1);
  trigger.dispatch("pointerleave");
  trigger.dispatch("blur");
  vi.advanceTimersByTime(1000);
  expect(tooltips()).toHaveLength(0);
});

test("open-and-close five times leaves nothing behind", () => {
  const trigger = fakeEl("button");
  tooltipDirective.mounted(trigger, { value: "Help — Your houses", modifiers: {} });
  for (let i = 0; i < 5; i++) {
    trigger.dispatch("click"); // opens the drawer: the tooltip goes at once
    trigger.dispatch("focus");
    trigger.dispatch("pointerenter", { pointerType: "mouse" });
    vi.advanceTimersByTime(1000);
    expect(tooltips().length).toBeLessThanOrEqual(1);
  }
  trigger.dispatch("click");
  vi.advanceTimersByTime(1000);
  expect(tooltips()).toHaveLength(0);
});

test("the anchor unmounted during the show delay never opens one", () => {
  const trigger = fakeEl("button");
  tooltipDirective.mounted(trigger, { value: "Rename", modifiers: {} });
  trigger.dispatch("pointerenter", { pointerType: "mouse" });
  tooltipDirective.beforeUnmount(trigger);
  vi.advanceTimersByTime(1000);
  expect(tooltips()).toHaveLength(0);
});

// The screens-and-keyboard review (2026-10-20): icon buttons with no name, and names read twice. An element
// with no name of its own takes the tooltip's words as its name; the tooltip describes it only when its words
// differ from that name.
test("an icon-only element is named by its tooltip, and the tooltip then describes nothing", () => {
  const trigger = fakeEl("button");
  tooltipDirective.mounted(trigger, { value: "Run it again", modifiers: {} });
  expect(trigger.getAttribute("aria-label")).toBe("Run it again");
  trigger.dispatch("pointerenter", { pointerType: "mouse" });
  vi.advanceTimersByTime(1000);
  expect(tooltips()).toHaveLength(1);
  expect(trigger.getAttribute("aria-describedby")).toBeNull();
  // its words change: so does its name
  tooltipDirective.updated(trigger, { value: "Run it again now", modifiers: {} });
  expect(trigger.getAttribute("aria-label")).toBe("Run it again now");
  // gone with the directive
  tooltipDirective.beforeUnmount(trigger);
  expect(trigger.getAttribute("aria-label")).toBeNull();
});

test("an element with words of its own keeps them; a tooltip that says more describes it", () => {
  const save = fakeEl("button");
  save.textContent = "Save";
  tooltipDirective.mounted(save, { value: "Save the house's colors", modifiers: {} });
  expect(save.getAttribute("aria-label")).toBeNull();
  save.dispatch("pointerenter", { pointerType: "mouse" });
  vi.advanceTimersByTime(1000);
  const tip = tooltips()[0];
  expect(save.getAttribute("aria-describedby")).toBe(tip.id);
  save.dispatch("pointerleave");
  vi.advanceTimersByTime(1000);
  expect(save.getAttribute("aria-describedby")).toBeNull();
});

test("a tooltip equal to the element's own name adds no description", () => {
  const help = fakeEl("button");
  help.setAttribute("aria-label", "Help — Your houses");
  tooltipDirective.mounted(help, { value: "Help — Your houses", modifiers: {} });
  expect(help.getAttribute("aria-label")).toBe("Help — Your houses");
  help.dispatch("pointerenter", { pointerType: "mouse" });
  vi.advanceTimersByTime(1000);
  expect(tooltips()).toHaveLength(1);
  expect(help.getAttribute("aria-describedby")).toBeNull();
  // and the directive never takes away a name it didn't give
  tooltipDirective.beforeUnmount(help);
  expect(help.getAttribute("aria-label")).toBe("Help — Your houses");
});

test("a plain <div> or <span> is never named — ARIA prohibits a name on a generic element", () => {
  const dot = fakeEl("span");
  tooltipDirective.mounted(dot, { value: "Stalling", modifiers: {} });
  expect(dot.getAttribute("aria-label")).toBeNull();
  const swatch = fakeEl("div");
  swatch.setAttribute("role", "img");
  tooltipDirective.mounted(swatch, { value: "Rosemary", modifiers: {} });
  expect(swatch.getAttribute("aria-label")).toBe("Rosemary");
});

test("an element whose own words arrive later gives the tooltip's name up", () => {
  const chip = fakeEl("button");
  tooltipDirective.mounted(chip, { value: "Running: 2 tasks", modifiers: {} });
  expect(chip.getAttribute("aria-label")).toBe("Running: 2 tasks");
  chip.textContent = "AI tasks";
  tooltipDirective.updated(chip, { value: "Running: 2 tasks", modifiers: {} });
  expect(chip.getAttribute("aria-label")).toBeNull();
  // its template sets an aria-label of its own: the directive leaves it be
  chip.textContent = "";
  chip.setAttribute("aria-label", "AI tasks");
  tooltipDirective.updated(chip, { value: "Running: 2 tasks", modifiers: {} });
  expect(chip.getAttribute("aria-label")).toBe("AI tasks");
});
