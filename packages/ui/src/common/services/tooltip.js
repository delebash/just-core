// SPDX-License-Identifier: MIT
// Shared v-tooltip directive. Floating UI handles positioning (flip + shift
// fallbacks) so a tooltip near the viewport edge bounces to a side that fits.
// Delay-debounced show on a mouse hover OR keyboard focus (never a tap), instant hide on click. App-agnostic
// (styles ride on the global .ui-tooltip rule in common/styles.css). Supersedes
// the per-app services/tooltip.js forks.
//
//   v-tooltip="'text'"            — defaults to bottom
//   v-tooltip.top/.bottom/.left/.right="'text'"
//   v-tooltip.bottom="expr"       — reactive string is fine; updated() syncs
//
// What a screen reader hears (the screens-and-keyboard review, 2026-10-20 — icon buttons with no
// name, and names read twice): an element that can carry a name (a control, a link, an image, an
// element with a role or a tab stop) with no accessible name of its own (dom-accessibility-api's
// computeAccessibleName — aria-hidden text and a select's options are no name, a child's alt is) —
// takes the tooltip's words as its name
// (aria-label; ARIA's tooltip pattern: an icon button's tooltip text IS its label,
// w3.org/WAI/ARIA/apg/patterns/tooltip/). While the tooltip shows, it describes the element
// (aria-describedby) only when its words differ from the element's name — never the name read a
// second time. So no `title` beside an equal aria-label anywhere: v-tooltip instead.

import { computePosition, autoUpdate, offset, flip, shift } from "@floating-ui/dom";
import { computeAccessibleName } from "dom-accessibility-api";

const SHOW_DELAY = 350;
const HIDE_DELAY = 80;
let idCounter = 0;

const squash = (s) => String(s ?? "").replace(/\s+/g, " ").trim();

/** The element's accessible name as a screen reader computes it (w3.org/TR/accname-1.2, by
 *  dom-accessibility-api — Testing Library's), leaving out the aria-label this directive set
 *  (`ours`): aria-labelledby, aria-label, a <label>, its text but not what is aria-hidden, a child
 *  image's alt or a child's aria-label, never a <select>'s options. "" when it has none. Until
 *  2026-10-20 a hand-made reading counted aria-hidden text and a select's options as a name (the
 *  sixteenth review). */
function ownName(el, ours = null) {
  const mine = ours !== null && el.getAttribute?.("aria-label") === ours;
  if (mine) el.removeAttribute("aria-label");
  try {
    return squash(computeAccessibleName(el));
  } catch {
    return squash(el.getAttribute?.("aria-label") || el.textContent);
  } finally {
    if (mine) el.setAttribute("aria-label", ours);
  }
}

/** Whether a name may stand on the element: a control, a link, an image, or anything with a role of
 *  its own or a tab stop — never a plain <div>/<span>, where ARIA prohibits aria-label (a generic
 *  element; the review's "On this wall" on a div). */
const NAMEABLE_TAGS = new Set(["BUTTON", "A", "INPUT", "SELECT", "TEXTAREA", "IMG", "SVG", "svg"]);
function nameable(el) {
  if (NAMEABLE_TAGS.has(el.tagName)) return true;
  const role = el.getAttribute?.("role");
  if (role && !["presentation", "none", "generic"].includes(role)) return true;
  return el.getAttribute?.("tabindex") != null;
}

function placementFromModifiers(mods) {
  if (mods.top) return "top";
  if (mods.bottom) return "bottom";
  if (mods.left) return "left";
  if (mods.right) return "right";
  return "bottom";
}

function createTooltipEl(content) {
  const el = document.createElement("div");
  el.className = "ui-tooltip";
  el.setAttribute("role", "tooltip");
  el.id = `ui-tt-${++idCounter}`;
  el.textContent = content;
  document.body.appendChild(el);
  return el;
}

// One state record per element with the directive applied. Stored on the element
// under a non-enumerable property to survive Vue's reactivity layer.
function stateFor(el) {
  return el.__uiTooltip;
}

function setupState(el, content, placement) {
  let tooltipEl = null;
  let cleanupPos = null;
  let showTimer = null;
  let hideTimer = null;

  // QC-33/34 (#231): while a tooltip is VISIBLE, any scroll, pointerdown, or
  // Escape kills it instantly — a tooltip that outlives the interaction that
  // summoned it is the "stuck" class the user kept hitting. Document-level,
  // capture-phase (scrolls in nested panes don't bubble), attached only for
  // the tooltip's lifetime.
  const onDocInteract = () => killNow();
  const onDocKey = (e) => { if (e.key === "Escape") killNow(); };
  function addDocListeners() {
    document.addEventListener("scroll", onDocInteract, { capture: true, passive: true });
    document.addEventListener("pointerdown", onDocInteract, { capture: true });
    document.addEventListener("keydown", onDocKey, { capture: true });
  }
  function removeDocListeners() {
    document.removeEventListener("scroll", onDocInteract, { capture: true });
    document.removeEventListener("pointerdown", onDocInteract, { capture: true });
    document.removeEventListener("keydown", onDocKey, { capture: true });
  }

  // Immediate teardown — no fade, no timers. The one path every kill route
  // (click, scroll, Escape, detached anchor, destroy) funnels through.
  function killNow() {
    clearTimeout(showTimer); showTimer = null;
    clearTimeout(hideTimer); hideTimer = null;
    if (cleanupPos) { cleanupPos(); cleanupPos = null; }
    removeDocListeners();
    if (tooltipEl) { tooltipEl.remove(); tooltipEl = null; }
    undescribe();
  }

  // The tooltip describes the element only when its words aren't the element's name already.
  let described = false;
  function describe(id) {
    if (squash(s.content) === ownName(el)) return;
    el.setAttribute("aria-describedby", id);
    described = true;
  }
  function undescribe() {
    if (described) el.removeAttribute("aria-describedby");
    described = false;
  }

  // ONE pending show at a time. A focus and a pointerenter can both arrive
  // during the delay (Help's drawer closed by Esc hands the "?" its focus back
  // while the pointer re-enters it): each armed a timer, and the first one's
  // tooltip was overwritten by the second's — never removed, one more on
  // screen per open-and-close (the visual review, 2026-10-20;
  // tests/tooltip.test.js).
  const show = () => {
    clearTimeout(hideTimer); hideTimer = null;
    if (tooltipEl || !s.content) return;
    clearTimeout(showTimer);
    showTimer = setTimeout(() => {
      showTimer = null;
      // The anchor can leave the DOM during the show delay (a closing modal,
      // a re-rendered row) — never open against a detached node.
      if (!el.isConnected || tooltipEl) return;
      tooltipEl = createTooltipEl(s.content);
      describe(tooltipEl.id);
      addDocListeners();
      cleanupPos = autoUpdate(el, tooltipEl, () => {
        // QC-33 root cause: an anchor detached by non-Vue DOM ops (editor
        // content, swapped rows) never fires beforeUnmount OR mouseleave —
        // the orphaned tooltip then positions against a dead 0×0 reference
        // and sticks at the top-left corner forever. Detect and kill.
        if (!el.isConnected) { killNow(); return; }
        if (!tooltipEl) return;
        computePosition(el, tooltipEl, {
          strategy: "fixed",
          placement: s.placement,
          middleware: [offset(6), flip(), shift({ padding: 6 })],
        }).then(({ x, y }) => {
          if (!tooltipEl) return;
          tooltipEl.style.transform = `translate(${Math.round(x)}px, ${Math.round(y)}px)`;
        });
      });
      requestAnimationFrame(() => tooltipEl?.classList.add("is-visible"));
    }, SHOW_DELAY);
  };

  // QC-34: clicking a control keeps it focused, and a bare `focus` listener
  // re-summons the tooltip the pointer already dismissed — only KEYBOARD
  // focus (:focus-visible) should show it.
  const onFocus = () => {
    try {
      if (!el.matches(":focus-visible")) return;
    } catch { /* older engines without :focus-visible — show as before */ }
    show();
  };

  // A tooltip answers a mouse (or pen) hover, never a tap: a touch has no hover, and a tap's
  // compatibility mouse events left the tooltip of the button just tapped standing over the
  // screen it opened (the phone, 2026-10-09).
  const onPointerEnter = (e) => {
    if (e.pointerType === "touch") return;
    show();
  };

  const hide = () => {
    clearTimeout(showTimer); showTimer = null;
    if (!tooltipEl) return;
    clearTimeout(hideTimer);
    hideTimer = setTimeout(() => {
      if (!tooltipEl) return;
      tooltipEl.classList.remove("is-visible");
      if (cleanupPos) { cleanupPos(); cleanupPos = null; }
      removeDocListeners();
      const node = tooltipEl;
      tooltipEl = null;
      undescribe();
      // Let the fade-out finish before removing from the DOM.
      setTimeout(() => node.remove(), 160);
    }, HIDE_DELAY);
  };

  // The tooltip's words as the element's name while it has none of its own (`named` holds the
  // aria-label this directive set). Run at mount and after every update: an element that gains a
  // name of its own (its text arrives, its template binds an aria-label) gives ours up.
  let named = null;
  function syncName() {
    const current = el.getAttribute?.("aria-label") ?? null;
    if (named !== null && current !== named) named = null; // its template set its own since
    const own = ownName(el, named);
    if (own || !squash(s.content) || !nameable(el)) {
      if (named !== null) el.removeAttribute("aria-label");
      named = null;
      return;
    }
    if (current !== s.content) el.setAttribute("aria-label", s.content);
    named = s.content;
  }

  const s = {
    content,
    placement,
    show, hide, syncName,
    destroy() {
      killNow();
      if (named !== null && el.getAttribute?.("aria-label") === named) el.removeAttribute("aria-label");
      named = null;
      el.removeEventListener("pointerenter", onPointerEnter);
      el.removeEventListener("pointerleave", hide);
      el.removeEventListener("focus", onFocus);
      el.removeEventListener("blur", hide);
      el.removeEventListener("click", killNow);
    },
  };

  el.addEventListener("pointerenter", onPointerEnter);
  el.addEventListener("pointerleave", hide);
  el.addEventListener("focus", onFocus);
  el.addEventListener("blur", hide);
  el.addEventListener("click", killNow);

  Object.defineProperty(el, "__uiTooltip", { value: s, configurable: true, writable: true });
  syncName();
}

export const tooltipDirective = {
  mounted(el, binding) {
    const content = binding.value == null ? "" : String(binding.value);
    if (!content) return;
    setupState(el, content, placementFromModifiers(binding.modifiers));
  },
  updated(el, binding) {
    const content = binding.value == null ? "" : String(binding.value);
    const placement = placementFromModifiers(binding.modifiers);
    const s = stateFor(el);
    if (!s) {
      if (content) setupState(el, content, placement);
      return;
    }
    if (!content) { s.destroy(); el.__uiTooltip = null; return; }
    s.content = content;
    s.placement = placement;
    s.syncName();
  },
  beforeUnmount(el) {
    const s = stateFor(el);
    if (s) { s.destroy(); el.__uiTooltip = null; }
  },
};
