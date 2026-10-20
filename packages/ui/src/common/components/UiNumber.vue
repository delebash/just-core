<!-- SPDX-License-Identifier: MIT -->
<script setup>
// Shared number input — Intl.NumberFormat for locale-aware thousands separator
// and decimal punctuation. While the user types, the raw value is preserved (so
// the cursor stays sane); on blur it's parsed, clamped to min/max, and
// reformatted. Up/Down arrows step by `step`. Supersedes JwNumber.
//
// The text is read with @internationalized/number's NumberParser (./numberBox.js — the language's
// digits, minus and grouping; ".7", "5.", "+15", "1 500" read). A number on its way while it is
// typed ("-", "1,") is no error yet (isValidPartialNumber) and changes nothing; text that isn't a
// number makes the value null and STAYS in the box, with its rule's error — never cleared on blur
// (it was, to an empty box: the fifteenth review, 2026-10-20).
//
// The sixteenth review (2026-10-20): Enter commits the text exactly as leaving the box does (read,
// clamped to min/max, the value given) before the form submits — Enter had submitted the old value,
// or one past the max; a text that isn't a number fails the field by UiNumber's own rule, first,
// with or without the caller's rules ("1e3" and "0x200" passed a schema's rules and Save sent null;
// with no rules, "5 min" showed no error) — aria-invalid and the red edge come with its words (Quasar's
// error state), never before them (the seventeenth review); the arrows do nothing on such a
// text (they replaced it with 0 + step) or in a read-only box; "-0" is 0.
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
import { takesNull } from "../services/forms.js";
import { isPartialNumber, parseLocaleNumber } from "./numberBox.js";

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

const { t, locale: appLocale } = useI18n();
const fmt = computed(() => new Intl.NumberFormat(props.locale || appLocale.value || undefined, {
  useGrouping: props.useGrouping,
  maximumFractionDigits: 20,
}));

function formatNumber(n) {
  if (n == null || n === "" || !Number.isFinite(Number(n))) return "";
  return fmt.value.format(Number(n));
}

// Parse a possibly-localized string back to a number (./numberBox.js, NumberParser): "1,200" (en)
// → 1200 AND "1.200" (de) → 1200, and a decimal comma read where it can only be one ("0,05" in an
// English field that takes fractions is 0.05; it was 5). null: not a number.
const localeNow = () => props.locale || appLocale.value || null;
function parseNumber(s) {
  return parseLocaleNumber(s, { locale: localeNow(), step: props.step, grouping: props.useGrouping });
}
const blank = (s) => String(s ?? "").trim() === "";
// on its way to a number, not one yet ("-", "1,")
const partial = (s) => !blank(s) && parseNumber(String(s)) === null && isPartialNumber(String(s), { locale: localeNow() });
// text in the box that isn't a number (a half-typed one too) — kept as typed while the value is null
const refused = (s) => !blank(s) && parseNumber(String(s)) === null;

function clamp(n) {
  if (n == null) return null;
  if (props.min != null && n < props.min) return props.min;
  if (props.max != null && n > props.max) return props.max;
  return n;
}

const field = ref(null);
const inputEl = computed(() => field.value?.getNativeElement?.() ?? null);
const display = ref(formatNumber(props.modelValue));
// typed into since its last commit (leaving the box, Enter, an arrow): only then is a half-typed
// number no error yet
const typing = ref(false);
// the box holds a text that isn't a number (one being typed excepted) — the field's own error
const refusedNow = () => refused(display.value) && !(typing.value && partial(display.value));

watch(() => props.modelValue, (v) => {
  // Don't reformat while the user is actively editing — the format pass happens
  // on blur. This preserves cursor position during entry.
  if (inputEl.value && document.activeElement === inputEl.value) return;
  // a refused text stays in the box while the value is null (its rule says what's wrong)
  if (v == null && refused(display.value)) return;
  display.value = formatNumber(v);
});

function setValue(next) {
  if (next !== props.modelValue) emit("update:modelValue", next);
}

function onInput(value) {
  display.value = value;
  typing.value = true;
  const n = parseNumber(value);
  if (n !== null) setValue(n);
  else if (!partial(value)) setValue(null); // emptied, or not a number — a half-typed one changes nothing yet
}

// What leaving the box and Enter both do with its text: a number is clamped, given and shown in the
// language's form; an empty box is null; any other text is null and stays as typed, never cleared.
function commit(text) {
  typing.value = false;
  const n = parseNumber(text);
  if (n !== null) {
    const committed = clamp(n);
    setValue(committed);
    display.value = formatNumber(committed);
  } else {
    setValue(null);
    display.value = blank(text) ? "" : text;
  }
}

function onBlur(e) {
  commit(e.target.value);
  emit("blur", e);
}

function onFocus(e) { emit("focus", e); }

function bump(delta) {
  const current = parseNumber(display.value) ?? 0;
  const next = clamp(current + delta * props.step);
  typing.value = false;
  setValue(next);
  display.value = formatNumber(next);
}

function onKeydown(e) {
  if (e.key === "ArrowUp" || e.key === "ArrowDown") {
    // a read-only box doesn't change, and a text that isn't a number isn't stepped from 0
    if (!props.readonly && !refused(display.value)) {
      e.preventDefault();
      bump(e.key === "ArrowUp" ? 1 : -1);
    }
  } else if (e.key === "Enter" && !e.isComposing && !props.readonly) {
    // committed before the key's default — the form's submit — sees the value
    commit(e.target.value);
  }
  emit("keydown", e);
}

// The rules (QInput's `rules`, e.g. the kit's schemaRules) judge the NUMBER, not the text shown:
// the shown text is formatted ("2,048"), and a rule given it said "Must be a number" for every
// value of 1,000 and more. Text that doesn't parse reaches the rule as it was typed, so the rule
// still says what is wrong with it; an empty box reaches it as null (required). The field's OWN
// rule comes first, with or without the caller's: a text that isn't a number is "Must be a number"
// (a half-typed one, while it is typed, is no error yet). Every rule reads the box's text as it is
// now (`display`) — Enter commits it just before the form validates, ahead of QInput's prop.
const numberRules = computed(() => {
  const rules = Array.isArray(attrs.rules) ? attrs.rules : [];
  const asNumber = (v) => {
    if (v === null || v === undefined || String(v).trim() === "") return null;
    const n = parseNumber(String(v));
    return n === null || Number.isNaN(n) ? v : n;
  };
  // an emptied box is null: where the schema takes no null (schemaRules' `nullable` false), it is
  // "Required" before anything is sent
  const own = () => {
    if (refusedNow()) return t("kit.validation.number");
    if (!takesNull(rules) && blank(display.value)) return t("kit.validation.required");
    return true;
  };
  const theirs = rules.map((rule) => (typeof rule === "function" ? () => (refusedNow() || (typing.value && partial(display.value)) ? true : rule(asNumber(display.value))) : rule));
  return [own, ...theirs];
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
