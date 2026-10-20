<!-- SPDX-License-Identifier: MIT -->
<script setup>
// Shared number input — Intl.NumberFormat for locale-aware thousands separator
// and decimal punctuation. While the user types, the raw value is preserved (so
// the cursor stays sane); on blur it's parsed, clamped to min/max, and
// reformatted. Up/Down arrows step by `step`. Supersedes JwNumber.
//
// Locale: the `locale` prop pins one input; otherwise it follows the app's vue-i18n language.
//
// Wears the shared .ui-input visual (one input style app-wide); .ui-number only
// adds tabular figures on top.
//
// Quasar's QInput underneath, as UiInput (docs/plans/2026-10-09-kit-controls-on-quasar.md): its
// root is the box, the parsing and stepping above work on its native input, whose own events
// these are (../composables/useNativeEvents.js).

import { QInput } from "quasar";
import { computed, ref, useAttrs, watch } from "vue";
import { useI18n } from "vue-i18n";
import { useNativeEvents, withoutListeners } from "../composables/useNativeEvents.js";
import { parseLocaleNumber } from "./numberBox.js";

defineOptions({ inheritAttrs: false });

const props = defineProps({
  modelValue: { type: [Number, String, null], default: null },
  min:        { type: [Number, null], default: null },
  max:        { type: [Number, null], default: null },
  step:       { type: Number, default: 1 },
  // When false, render plain digits (1200) instead of grouped (1,200).
  useGrouping:{ type: Boolean, default: true },
  // null = follow the app's language; pass e.g. "de-DE" to pin one input.
  locale:     { type: String, default: null },
  placeholder:{ type: String, default: "" },
  disabled:   { type: Boolean, default: false },
  readonly:   { type: Boolean, default: false },
  // Match UiInput's size modifier (small/regular).
  size:       { type: String, default: "regular" },
  name:       { type: String, default: undefined },
  id:         { type: String, default: undefined },
  inputId:    { type: String, default: undefined }, // compatibility alias
  invalid:    { type: Boolean, default: false },
  // Content-typed width cap — parity with UiInput. Empty = full width.
  width:      { type: String, default: "" },
});
const emit = defineEmits(["update:modelValue", "blur", "focus", "keydown"]);
const attrs = useAttrs();

const { locale: appLocale } = useI18n();
const fmt = computed(() => new Intl.NumberFormat(props.locale || appLocale.value || undefined, {
  useGrouping: props.useGrouping,
  maximumFractionDigits: 20,
}));

function formatNumber(n) {
  if (n == null || n === "" || !Number.isFinite(Number(n))) return "";
  return fmt.value.format(Number(n));
}

// Parse a possibly-localized string back to a number (./numberBox.js): strip everything that
// isn't a digit, minus, or the language's decimal separator — "1,200" (en) → 1200 AND "1.200"
// (de) → 1200 without enumerating locales — and read a decimal comma where it can only be one
// ("0,05" in an English field that takes fractions is 0.05; it was 5).
function parseNumber(s) {
  return parseLocaleNumber(s, { locale: props.locale || appLocale.value || null, step: props.step, grouping: props.useGrouping });
}

function clamp(n) {
  if (n == null) return null;
  if (props.min != null && n < props.min) return props.min;
  if (props.max != null && n > props.max) return props.max;
  return n;
}

const field = ref(null);
const inputEl = computed(() => field.value?.getNativeElement?.() ?? null);
const display = ref(formatNumber(props.modelValue));

watch(() => props.modelValue, (v) => {
  // Don't reformat while the user is actively editing — the format pass happens
  // on blur. This preserves cursor position during entry.
  if (inputEl.value && document.activeElement === inputEl.value) return;
  display.value = formatNumber(v);
});

function emitParsed(raw, { commit }) {
  const parsed = parseNumber(raw);
  const next = commit ? clamp(parsed) : parsed;
  if (next !== props.modelValue) emit("update:modelValue", next);
  return next;
}

function onInput(value) {
  display.value = value;
  emitParsed(value, { commit: false });
}

function onBlur(e) {
  const committed = emitParsed(e.target.value, { commit: true });
  display.value = formatNumber(committed);
  emit("blur", e);
}

function onFocus(e) { emit("focus", e); }

function bump(delta) {
  const current = parseNumber(display.value) ?? 0;
  const next = clamp(current + delta * props.step);
  emit("update:modelValue", next);
  display.value = formatNumber(next);
}

function onKeydown(e) {
  if (e.key === "ArrowUp")   { e.preventDefault(); bump(+1); }
  if (e.key === "ArrowDown") { e.preventDefault(); bump(-1); }
  emit("keydown", e);
}

// The rules (QInput's `rules`, e.g. the kit's schemaRules) judge the NUMBER, not the text shown:
// the shown text is formatted ("2,048"), and a rule given it said "Must be a number" for every
// value of 1,000 and more. Text that doesn't parse reaches the rule as it was typed, so the rule
// still says what is wrong with it; an empty box reaches it as null (required).
const numberRules = computed(() => {
  const rules = attrs.rules;
  if (!Array.isArray(rules)) return rules;
  const asNumber = (v) => {
    if (v === null || v === undefined || String(v).trim() === "") return null;
    const n = parseNumber(String(v));
    return n === null || Number.isNaN(n) ? v : n;
  };
  return rules.map((rule) => (typeof rule === "function" ? (v) => rule(asNumber(v)) : rule));
});

const classes = computed(() => [
  "ui-input", "ui-number",
  props.size === "small" && "ui-input--small",
  props.width && `ui-w-${props.width}`,
  { "is-invalid": props.invalid, "is-disabled": props.disabled },
]);
useNativeEvents(inputEl, attrs, { blur: onBlur, focus: onFocus, keydown: onKeydown });
</script>

<template>
  <QInput
    ref="field"
    v-bind="withoutListeners(attrs)"
    :rules="numberRules"
    :class="classes"
    type="text"
    inputmode="decimal"
    :model-value="display"
    :placeholder="placeholder"
    :disable="disabled"
    :readonly="readonly"
    :name="name"
    :for="id || inputId"
    :aria-invalid="invalid ? 'true' : undefined"
    borderless
    dense
    hide-bottom-space
    @update:model-value="onInput"
  />
</template>
