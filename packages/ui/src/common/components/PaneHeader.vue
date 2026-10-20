<script setup>
// SPDX-License-Identifier: MIT
// The page header — ONE for every page. LIFTED from JustWrite's components/PaneHeader.vue
// (2026-08-04, the consistency sweep: both apps had invented their own page-header shape because
// the kit had none); 2026-10-11 it took over JustWrite's fifteen hand-built headers and the copy
// of these rules they ran on, so this file is the header's only definition.
//
// Above the title, an eyebrow or a breadcrumb trail (`crumbs`). The title is plain text, or —
// `editable` — the page's own name, edited in place (v-model:title; `before-title` holds a mark
// before it, like a strand's colour dot; `after-title` a control that works on it, like a
// character's Name ideas). The default slot holds the actions. With `helpKey`
// the "?" affordance (HelpTrigger) ends the actions — the last of them, inside their row — or,
// with no actions, stands at the far right.
//
// The title keeps its one-line width: when it and the actions don't fit on one row, the actions
// drop to the row below — at every width, not only on phones — rather than squeezing the title
// (a character page's name box had shrunk to 14 px at 1280 px). The "?" goes with them: it wraps
// as one of the actions, so it is never alone on a row (at 960 px a long title made three rows,
// the "?" alone on the last — the screens-and-keyboard review, 2026-10-20; until then a resize
// observer moved it to the title's row, which a long title had no room left on).
//
// variant "intro": a page-intro block inside the page's scroller rather than the pane's top bar —
// a larger title, a `sub` line, the actions under them, the "?" in the top-right corner.
//
// Exposes focus() and select() on the editable title (a page selects a new entity's name).
import { ref } from "vue";
import Breadcrumb from "./Breadcrumb.vue";
import HelpTrigger from "./HelpTrigger.vue";

defineProps({
  eyebrow: { type: String, default: "" },
  crumbs: { type: Array, default: null }, // Breadcrumb segments, shown instead of the eyebrow
  title: { type: String, default: "" },
  editable: { type: Boolean, default: false },
  placeholder: { type: String, default: "" },
  sub: { type: String, default: "" },
  helpKey: { type: String, default: "" },
  helpLabel: { type: String, default: "" }, // the "?"'s label, when the title isn't the page's name
  variant: { type: String, default: "bar" }, // bar | intro
});
const emit = defineEmits(["update:title"]);

const input = ref(null);
defineExpose({
  focus: () => input.value?.focus(),
  select: () => input.value?.select(),
});
</script>

<template>
  <header class="pane-header" :class="`pane-header--${variant}`">
    <div class="pane-title">
      <Breadcrumb v-if="crumbs?.length" :segments="crumbs" />
      <span v-else-if="eyebrow" class="pane-eyebrow">{{ eyebrow }}</span>
      <div class="pane-title-row">
        <slot name="before-title" />
        <input v-if="editable" ref="input" class="pane-title-input"
          :value="title" :placeholder="placeholder"
          @input="emit('update:title', $event.target.value)" />
        <h1 v-else class="pane-h1">{{ title }}</h1>
        <slot name="after-title" />
      </div>
      <p v-if="sub" class="pane-sub">{{ sub }}</p>
    </div>
    <div class="pane-actions" v-if="$slots.default">
      <slot />
      <HelpTrigger v-if="helpKey" :slug="helpKey" :label="helpLabel || title" class="pane-help" />
    </div>
    <HelpTrigger v-else-if="helpKey" :slug="helpKey" :label="helpLabel || title" class="pane-help" />
  </header>
</template>

<style scoped>
/* ── bar: the pane's top bar ── */
.pane-header {
  display: flex; align-items: center; flex-wrap: wrap;
  gap: 8px 16px;
  padding: 14px 22px 14px;
  border-bottom: 1px solid var(--border);
  flex-shrink: 0;
}
/* flex-basis auto: the title's one-line width decides whether the actions share its row. */
.pane-title {
  display: flex; flex-direction: column; gap: 2px;
  flex: 1 1 auto; min-width: 0;
}
.pane-title-row { display: flex; align-items: center; gap: 8px; min-width: 0; }
.pane-eyebrow {
  font-size: 10.5px; font-weight: 600; letter-spacing: 0.06em;
  text-transform: uppercase; color: var(--muted);
}
.pane-h1 {
  font-size: 20px; font-weight: 600; letter-spacing: -0.015em;
  margin: 0;
}
/* The editable title: flat text until hovered or focused (a field box would break the
   heading's look), as wide as its text. */
.pane-title-input {
  appearance: none;
  font-family: var(--font-serif, inherit);
  font-size: 20px; font-weight: 600;
  letter-spacing: -0.015em;
  color: var(--ink);
  border: 1px solid transparent;
  background: transparent;
  border-radius: 6px;
  padding: 2px 6px;
  margin-left: -6px;
  outline: none;
  field-sizing: content;
  min-width: 4ch;
  max-width: 100%;
  flex: 0 1 auto; /* beside an after-title control, a long name shrinks rather than pushing it out */
}
.pane-title-input:hover { border-color: var(--border-soft); }
.pane-title-input:focus { border-color: var(--accent); background: var(--surface); box-shadow: 0 0 0 3px var(--accent-soft); }
/* Never wider than the header: on a row of its own, a control that gives way (the AI feature chip
   shortens its model name) shrinks to fit — on Brainstorm it held the actions 37 px past a
   390 px window in Spanish, 3 px in English. */
.pane-actions { display: flex; flex-wrap: wrap; gap: 6px; align-items: center; min-width: 0; max-width: 100%; }
/* With no actions the "?" stands at the far right of the title's row; with actions it is their
   last, wrapping with them (a little apart from them). */
.pane-help { margin-left: auto; }
.pane-actions > .pane-help { margin-left: 4px; }
/* At phone width (Quasar's xs: under 600px — `$breakpoint-xs-max`) the title keeps its row and the
   actions, the "?" with them, take the row below. */
@media (max-width: 599.98px) {
  .pane-header { padding: 12px 16px; }
  .pane-actions { order: 3; flex-basis: 100%; }
}

/* ── intro: a page-intro block inside the page's scroller ── */
.pane-header--intro {
  flex-direction: column; align-items: stretch; flex-wrap: nowrap;
  gap: 6px; position: relative;
}
.pane-header--intro .pane-title { gap: 4px; }
.pane-header--intro .pane-h1 {
  font-family: var(--font-serif, inherit); font-size: 28px; font-weight: 600;
  letter-spacing: -0.01em; color: var(--ink);
}
.pane-sub { margin: 0; max-width: 70ch; color: var(--muted); font-size: 13.5px; line-height: 1.55; }
.pane-header--intro .pane-actions { gap: 10px; margin-top: 8px; }
.pane-header--intro .pane-help { position: absolute; top: 0; right: 0; }
@media (max-width: 599.98px) {
  .pane-header--intro { padding: 0; }
  .pane-header--intro .pane-actions { order: 0; flex-basis: auto; }
}
</style>
