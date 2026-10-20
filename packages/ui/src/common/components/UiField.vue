<script setup>
// SPDX-License-Identifier: MIT
// Shared labelled form row. Two layouts:
//   inline (default) — 160px label / 1fr control
//   block            — uppercase eyebrow label above the control
// The `label` slot lets callers put a pill/button beside the label text;
// falls back to the `label` prop. Styles are global (.ui-field* in
// common/styles.css) so raw .ui-field markup works alongside this component.
// Supersedes JvField.
// A label's trailing "(…)" — a unit, "Head silence (s)" — keeps its case under the uppercase
// eyebrow (.ui-unit): "(S)" would read as siemens (2026-10-15).
// `for` is the id of the control the label names (the control's own `id`): the label's `for`, so the
// control takes the label's words as its accessible name. Declared as a prop it never reaches
// $attrs, which the label read until 2026-10-20 — every field built on UiField had no name (the
// screens-and-keyboard review); the template's kitControls.test.js pins it.
import { computed } from "vue";

const props = defineProps({
  label: { type: String, default: "" },
  hint: { type: String, default: "" },
  layout: { type: String, default: "inline" }, // inline | block
  for: { type: String, default: undefined },
});

const parts = computed(() => {
  const m = /^(.*\S)\s+(\([^()]*\))$/.exec(props.label);
  return m ? { text: m[1], unit: m[2] } : { text: props.label, unit: "" };
});
</script>

<template>
  <div class="ui-field" :class="layout === 'block' ? 'ui-field--block' : ''">
    <label v-if="$slots.label || label" :for="props.for">
      <slot name="label">{{ parts.text }}{{ parts.unit ? " " : "" }}<span v-if="parts.unit" class="ui-unit">{{ parts.unit }}</span></slot>
    </label>
    <div>
      <slot />
      <span v-if="hint" class="ui-field__hint">{{ hint }}</span>
    </div>
  </div>
</template>
