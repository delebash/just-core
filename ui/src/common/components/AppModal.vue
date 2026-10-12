<!-- SPDX-License-Identifier: MIT -->
<!--
  AppModal — shared generic modal wrapper. Same API both apps
  call: eyebrow / title / lede / wide / noPadding / closable / closeLabel props +
  default / header / header-extra / lede / footer slots. The lede is the window's one intro line
  (a string, or the #lede slot when it carries markup) — 2026-10-11 it took over the per-window
  copies of that paragraph's style. Self-contained, token-driven styles (no app
  global classes). Backdrop dismissal is locked unless `dismissable`;
  closable:false also blocks Esc + hides the X (for in-flight modals that hold an
  AbortSignal). Supersedes the per-app AppModal.vue forks (JV's `.jv-modal` + JW's
  `.app-modal`).

  Quasar's QDialog + QCard underneath (the kit's controls on Quasar —
  docs/plans/2026-10-09-kit-controls-on-quasar.md, slice 7): QDialog gives the focus
  trap, the scroll lock, Esc, the backdrop that blocks the page and role="dialog" /
  aria-modal on its root (.ui-modal-overlay); the card (.ui-modal) is the QCard, placed
  and drawn here as before. The overlay's look and the open/close animation are the
  kit's theme (../../quasar/theme.css, "Modal").

  Emits: close (after the leave transition, so a parent v-if removal doesn't
  tear the overlay mid-fade).
-->
<script setup>
import { computed, ref, useSlots, watch } from "vue";
import { useI18n } from "vue-i18n";
import { useDraggable } from "@vueuse/core";
import { QCard, QDialog } from "quasar";
import Icon from "./Icon.vue";
import { wrapTab } from "../composables/useTabWrap.js";

let uid = 0;

const { t } = useI18n();
const props = defineProps({
  eyebrow: { type: String, default: "" },
  title: { type: String, default: "" },
  lede: { type: String, default: "" }, // the window's intro line, atop the body
  wide: { type: Boolean, default: false },
  noPadding: { type: Boolean, default: false },
  closable: { type: Boolean, default: true },
  closeLabel: { type: String, default: "" }, // "" → the kit's "Close"
  // When true, a backdrop click closes the modal. Default false (locked) — the
  // JustWrite default that prevents accidental data loss. JustVoice's lighter
  // pickers/cheatsheets opt in to preserve their click-outside-to-close UX.
  dismissable: { type: Boolean, default: false },
  // Optional explicit width (any CSS length, e.g. "980px"); capped at 96vw.
  // Overrides the default / --wide widths for modals that need a specific size.
  maxWidth: { type: String, default: "" },
  // Drag-by-the-header, ON by default (user ruling 2026-07-19). Opt OUT for
  // shells where dragging is meaningless — an edge-anchored slide-in panel has
  // nowhere to be dragged to.
  draggable: { type: Boolean, default: true },
});
const emit = defineEmits(["close"]);

const slots = useSlots();
// QDialog emits hide this long after it starts closing — `close` comes then, as before
const TRANSITION_MS = 200;
const visible = ref(true);
function close() { visible.value = false; }
defineExpose({ close });

// The dialog's accessible name: the title block, or (when a #header slot replaces
// it) the title prop as a label.
const titleId = `ui-modal-title-${++uid}`;

// A press on the backdrop keeps the focus where it was (inside the modal), as before — the
// backdrop isn't focusable, so the browser would otherwise move the focus to the page.
function onOverlayMousedown(e) {
  if (e.target?.classList?.contains("q-dialog__backdrop")) e.preventDefault();
}

// ---------------------------------------------------------------------------
// Drag by the header (user ruling 2026-07-19). VueUse's useDraggable rather than
// a hand-rolled pointer dance: it already ships handle + disabled + a cancellable
// onStart. Position RESETS on every open: `dragged`/`position` are plain setup
// refs and the component is mounted fresh by a parent v-if at the call sites, so
// a reopen is a new setup scope. `visible` is watched anyway as a belt-and-braces
// reset for any call site that keeps AppModal mounted and toggles it instead.
const contentRef = ref(null);
const headerRef = ref(null);
const dragged = ref(false);
// The card is QCard, a component; a template ref yields the instance, so
// unwrap $el. The `?? contentRef.value` fallback covers a plain-element ref.
const dragTarget = computed(() => contentRef.value?.$el ?? contentRef.value);
// Keep at least this much of the modal reachable, so it can never be thrown
// fully off-screen with no way to grab it back.
const MIN_VISIBLE = 80;
// Dragging LEFT is reserved more generously than the other edges. MIN_VISIBLE on the
// left bound would leave only the modal's RIGHT 80px on screen — and that strip is the
// close button, which onStart refuses to start a drag from, so the modal could be pushed
// somewhere it cannot be pulled back from. Reserve enough that a grabbable slice of
// header (title side, no controls) stays reachable.
const MIN_GRABBABLE = 160;

const { x, y, position } = useDraggable(dragTarget, {
  handle: headerRef,
  disabled: computed(() => !props.draggable),
  preventDefault: true,
  onStart: (_pos, event) => {
    // Never start a drag from an interactive control in the header — the close
    // button and any #header-extra badges/buttons/inputs must still click.
    if (event.target?.closest?.("button, a, input, select, textarea, [role=button]")) return false;
    if (!dragged.value) {
      // THE TRANSFORM COLLISION: .ui-modal is centred by translate(-50%,-50%) and
      // useDraggable positions with left/top. Seed the position from the element's
      // CURRENT centred rect and drop the centring transform in the same tick,
      // otherwise the modal jumps by half its own size the instant left/top win.
      const r = dragTarget.value?.getBoundingClientRect?.();
      if (r) position.value = { x: r.left, y: r.top };
      dragged.value = true;
    }
  },
  onMove: (p) => {
    // Clamp ourselves rather than passing `containerElement`. VueUse's start()
    // computes the grab offset as
    //   e.clientX - (targetRect.left - containerRect.left + container.scrollLeft)
    // and for document.documentElement when the page is scrolled,
    // -containerRect.top contributes +scrollY AND container.scrollTop contributes
    // another +scrollY — the scroll offset is double-counted and the modal jumps
    // by 2x the scroll distance on grab. Independently of that, its move() then
    // clamps with Math.max(0, x) in DOCUMENT coords — the wrong space for a
    // position:fixed element. With no container, move() is
    // `e.clientX - pressedDelta.x` — pure viewport coords, exactly right here.
    // (Read from @vueuse/core 14.3.0 dist/index.js:2881-2896, 2906, 2910; unchanged in 15.0.0,
    // dist/index.js:2861-2875 (start) and 2876-2888 (move).)
    const el = dragTarget.value;
    if (!el) return;
    const maxX = window.innerWidth - MIN_VISIBLE;
    const minX = MIN_GRABBABLE - el.offsetWidth;
    const maxY = window.innerHeight - MIN_VISIBLE;
    const cx = Math.min(Math.max(p.x, minX), maxX);
    const cy = Math.min(Math.max(p.y, 0), maxY);
    if (cx !== p.x || cy !== p.y) position.value = { x: cx, y: cy };
  },
});

watch(visible, (v) => { if (v) { dragged.value = false; position.value = { x: 0, y: 0 }; } });

const contentStyle = computed(() => {
  const s = {};
  if (props.maxWidth) s.width = `min(${props.maxWidth}, 96vw)`;
  if (dragged.value) {
    s.left = `${x.value}px`;
    s.top = `${y.value}px`;
    s.transform = "none";
  }
  return s;
});
</script>

<template>
  <QDialog
    v-model="visible"
    class="ui-modal-overlay"
    :no-esc-dismiss="!closable"
    :no-backdrop-dismiss="!dismissable"
    no-shake
    no-route-dismiss
    transition-show="ui-modal"
    transition-hide="ui-modal"
    :transition-duration="TRANSITION_MS"
    :aria-labelledby="slots.header ? undefined : titleId"
    :aria-label="slots.header ? title || t('kit.modal.dialog') : undefined"
    @mousedown="onOverlayMousedown"
    @keydown="(e) => wrapTab(e, dragTarget)"
    @hide="emit('close')"
  >
    <QCard
      ref="contentRef"
      class="ui-modal"
      :class="{
        'ui-modal--wide': wide,
        'ui-modal--flush': noPadding,
        'ui-modal--draggable': draggable,
        'is-dragged': dragged,
      }"
      :style="contentStyle"
    >
      <header ref="headerRef" class="ui-modal__header">
        <div class="ui-modal__headmain">
          <slot name="header">
            <div :id="titleId" class="ui-modal__titleblock">
              <div v-if="eyebrow" class="ui-modal__eyebrow">{{ eyebrow }}</div>
              <div v-if="title" class="ui-modal__title">{{ title }}</div>
            </div>
          </slot>
          <!-- Extra header content (an AI chip, badges, a header action) beside the title —
               keeps the eyebrow/title props + their styling. -->
          <slot name="header-extra" />
        </div>
        <button v-if="closable" type="button" class="ui-modal__close" :aria-label="closeLabel || t('kit.modal.close')" @click="close">
          <Icon name="Close" :size="14" />
        </button>
      </header>

      <div class="ui-modal__body">
        <p v-if="lede || slots.lede" class="ui-modal__lede"><slot name="lede">{{ lede }}</slot></p>
        <slot />
      </div>

      <footer v-if="slots.footer" class="ui-modal__footer">
        <slot name="footer" />
      </footer>
    </QCard>
  </QDialog>
</template>

<style scoped>
/* The overlay (QDialog's root) and the open/close animation: the kit's theme,
   ../../quasar/theme.css, "Modal". */
.ui-modal {
  position: fixed;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  z-index: 201;
  width: min(560px, 92vw);
  max-height: 88vh;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  background: var(--surface);
  color: var(--ink);
  border: 1px solid var(--border);
  border-radius: var(--r-card, var(--r-md, 10px));
  box-shadow: var(--shadow-3, var(--shadow-2, 0 12px 40px rgba(0, 0, 0, 0.2)));
  /* QDialog caps its content's width and promotes it to a layer of its own
     (will-change: scroll-position, which costs its text the sub-pixel smoothing) */
  max-width: none;
  will-change: auto;
}
/* Once dragged, left/top own the position: kill the centring transform AND the
   animation — the close keyframe animates transform back toward the centre and
   would yank a dragged modal across the screen on the way out. */
.ui-modal.is-dragged { transform: none; animation: none; }
.ui-modal--draggable .ui-modal__header { cursor: move; }
.ui-modal--wide { width: min(840px, 94vw); }
.ui-modal--flush .ui-modal__body { padding: 0; }

.ui-modal__header {
  display: flex;
  align-items: flex-start;
  gap: 12px;
  padding: 14px 20px;
  border-bottom: 1px solid var(--border);
  flex-shrink: 0;
}
/* The title and what sits beside it (an AI chip, badges) share one row while they fit; when they
   don't, the rest drops to the row below — at every width, not only on phones — rather than
   squeezing the title (Entity sweep's title had wrapped to four lines beside its chip). The
   close button stays outside the row, top right; the row is at least its height, so a one-line
   header centres on it. */
.ui-modal__headmain {
  flex: 1; min-width: 0; min-height: 28px;
  display: flex; flex-wrap: wrap; align-items: center; gap: 8px 12px;
}
.ui-modal__headmain > :deep(*) { min-width: 0; max-width: 100%; }
/* flex-basis auto: the title's one-line width decides whether the rest shares its row. */
.ui-modal__headmain > :deep(:first-child) { flex: 1 1 auto; }
.ui-modal__titleblock { display: flex; flex-direction: column; gap: 3px; }
.ui-modal__eyebrow {
  font-size: 10.5px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: var(--muted);
}
.ui-modal__title {
  font-family: var(--font-display, inherit);
  font-size: 16px;
  font-weight: 600;
  color: var(--ink);
  margin: 0;
  line-height: 1.25;
}
.ui-modal__close {
  appearance: none;
  background: transparent;
  border: 0;
  color: var(--muted);
  cursor: pointer;
  width: 28px;
  height: 28px;
  display: grid;
  place-items: center;
  border-radius: var(--r-sm, 6px);
  flex-shrink: 0;
}
.ui-modal__close:hover { background: var(--hover, var(--surface-2)); color: var(--ink); }
.ui-modal__body { padding: 18px 20px; overflow-y: auto; flex: 1; min-height: 0; }
.ui-modal__lede { margin: 0 0 16px; max-width: 80ch; font-size: 12.5px; line-height: 1.55; color: var(--muted); }
.ui-modal__lede :deep(strong) { color: var(--ink-2, var(--ink)); font-weight: 600; }
.ui-modal__footer {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  padding: 12px 20px;
  border-top: 1px solid var(--border);
  background: var(--surface-2);
  flex-shrink: 0;
}
</style>
