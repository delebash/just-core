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
