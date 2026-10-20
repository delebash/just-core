<script setup>
// SPDX-License-Identifier: MIT
// Shared segmented radio control — a row of mutually-exclusive buttons.
// Supersedes JwSegmented/JvSegmented/LuSegmented. Provides role="radiogroup" +
// roving tabindex + arrow/Home/End nav + type-ahead, a "connected" variant, and
// a `disabled` (locked) state. Self-contained: the shared useRovingTabindex
// composable, and its look in the kit's theme.
//
//   v-model="value"
//   :options="[{ value, label, sublabel?, disabled?, title? }, ...]"
//   :option-label / :option-value / :option-sublabel  (defaults label/value/sublabel)
//   :aria-label  :size  :variant ("default" | "connected")  :disabled
//   <template #option="{ option, selected }">…</template>
//   @blocked="(option) => …"   — a click on an option marked `disabled`
//
// An option marked `disabled: true` stays in the row, dimmed, with its `title`
// as the tooltip, and can't be picked; clicking it emits `blocked` so the host
// can say why (born 2026-10-03 for JustVoice's persona editor: a voice kind
// that needs a model not yet available is shown off with its reason, never
// hidden — the user can't tell "off" from "absent" otherwise).
//
// The keys are the WAI-ARIA APG Radio Group's (w3.org/WAI/ARIA/apg/patterns/radio/): an arrow,
// Home or End moves the focus AND picks the option it lands on; an option marked off takes the
// focus but is never picked there, and an arrow emits no `blocked` (only a click or Enter/Space
// on it does). One tab stop — the chosen option, or the first one that isn't off when none is.
// Until 2026-10-20 the arrows only moved the focus (the screens-and-keyboard review). An arrow with
// Ctrl, Alt or Meta does nothing here, and right-to-left the left and right arrows are mirrored.
//
// Quasar's QBtnToggle underneath (the kit's controls on Quasar —
// docs/plans/2026-10-09-kit-controls-on-quasar.md): its group is the row (.ui-seg) and its QBtns
// the options — native <button>s as before, with the `active` / `is-off` classes — and the look
// is the kit's theme (../../quasar/theme.css, "Segmented"). The kit keeps what QBtnToggle doesn't
// do: the radio roles and the roving tabindex (one tab stop; arrows move and pick; Enter/Space pick),
// type-ahead, and an off option that stays clickable (QBtnToggle's would be disabled). Its value
// is the option's index, so any option value works; a click on the chosen option reaches
// QBtnToggle's `clear` (it's clearable for that alone) and is picked again, as before.
import { QBtnToggle } from "quasar";
import { computed, nextTick, onBeforeUnmount, onMounted, onUpdated, ref, useId } from "vue";
import { useRovingTabindex } from "../composables/useRovingTabindex.js";
import { tooltipDirective } from "../services/tooltip.js";

const props = defineProps({
  modelValue: {},
  options: { type: Array, required: true },
  optionLabel: { type: String, default: "label" },
  optionValue: { type: String, default: "value" },
  optionSublabel: { type: String, default: "sublabel" },
  ariaLabel: { type: String, default: "" },
  size: { type: String, default: "regular" }, // small | regular
  variant: { type: String, default: "default" }, // default | connected
  disabled: { type: Boolean, default: false },
});
const emit = defineEmits(["update:modelValue", "blocked"]);

function getValue(opt) { return opt?.[props.optionValue]; }
function labelOf(opt) { return opt?.[props.optionLabel]; }
function sublabelOf(opt) { return opt?.[props.optionSublabel]; }
function isOff(opt) { return !!opt?.disabled; }
function pick(opt) {
  if (props.disabled) return;
  if (isOff(opt)) { emit("blocked", opt); return; }
  emit("update:modelValue", getValue(opt));
}

const length = computed(() => props.options.length);
const { activeIndex, onKeydown: rovingKeydown, registerItem, focusAt } = useRovingTabindex({
  length,
  orientation: "both",
  loop: true,
  onActivate: (i) => pick(props.options[i]),
});

const MOVES = new Set(["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "Home", "End"]);
// Right-to-left, the row runs from the right: → goes to the option before, ← to the one after (the
// APG's keyboard conventions mirror the horizontal arrows for RTL). The row's own direction decides —
// its computed `direction`, else the nearest dir attribute (a DOM without layout).
function rtl(el) {
  const dir = el && typeof getComputedStyle === "function" ? getComputedStyle(el).direction : "";
  if (dir === "rtl" || dir === "ltr") return dir === "rtl";
  return el?.closest?.("[dir]")?.getAttribute("dir")?.toLowerCase() === "rtl";
}
const MIRRORED = { ArrowLeft: "ArrowRight", ArrowRight: "ArrowLeft" };
let typeBuffer = "";
let typeTimer = null;
function onKeydown(e, idx) {
  if (props.disabled) return;
  // a modified arrow (Ctrl, Alt, Meta) is the browser's or the app's shortcut, never a pick (the sixteenth
  // review: Alt+→ and Ctrl+→ picked)
  if (MOVES.has(e.key) && (e.ctrlKey || e.altKey || e.metaKey)) return;
  if (MIRRORED[e.key] && rtl(e.currentTarget || e.target)) {
    // the roving composable reads the key; it gets the mirrored one, its preventDefault reaches the real event
    rovingKeydown({ key: MIRRORED[e.key], preventDefault: () => e.preventDefault() }, idx);
  } else {
    rovingKeydown(e, idx);
  }
  // an arrow, Home or End moved the focus: the option it landed on is picked, unless it is off
  if (MOVES.has(e.key) && e.defaultPrevented) {
    const landed = props.options[activeIndex.value];
    if (landed && !isOff(landed) && !isSelected(landed)) emit("update:modelValue", getValue(landed));
    return;
  }
  if (e.defaultPrevented) return;
  if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
    clearTimeout(typeTimer);
    typeBuffer += e.key.toLowerCase();
    const match = props.options.findIndex((o) =>
      String(labelOf(o) ?? "").toLowerCase().startsWith(typeBuffer),
    );
    if (match >= 0) {
      e.preventDefault();
      pick(props.options[match]);
      nextTick(() => focusAt(match));
    }
    typeTimer = setTimeout(() => { typeBuffer = ""; }, 600);
  }
}

const isSelected = (opt) => props.modelValue === getValue(opt);
const selectedIndex = computed(() => props.options.findIndex(isSelected));
// the one tab stop: the chosen option, else the first that isn't off (else the first)
const tabStop = computed(() => {
  if (selectedIndex.value >= 0) return selectedIndex.value;
  const on = props.options.findIndex((o) => !isOff(o));
  return on >= 0 ? on : 0;
});
// QBtnToggle's options: the index as the value, the kit's attributes on each button (QBtnToggle
// spreads `attrs` into the QBtn), and a slot of its own per option
const btnOptions = computed(() => props.options.map((opt, i) => ({
  value: i,
  slot: `opt-${i}`,
  attrs: {
    role: "radio",
    "aria-pressed": undefined,
    "aria-checked": isSelected(opt) ? "true" : "false",
    "aria-disabled": isOff(opt) ? "true" : undefined,
    // its `title` (an off option's reason) is its description and the kit's tooltip — shown on hover
    // AND on keyboard focus; a native title showed nothing on focus or touch (the seventeenth review)
    "aria-describedby": opt?.title ? descId(i) : undefined,
    tabindex: i === tabStop.value ? 0 : -1,
    disabled: props.disabled ? "" : undefined,
    class: { active: isSelected(opt), "is-off": isOff(opt) },
    onKeydown: (e) => onKeydown(e, i),
  },
})));
function onToggle(i) {
  if (i !== null) pick(props.options[i]);
}
function onReclick() {
  pick(props.options[selectedIndex.value]);
}

// an option's description: a hidden element its button names (aria-describedby)
const uid = useId();
const descId = (i) => `ui-seg-${uid}-desc-${i}`;

// the roving focus needs the buttons themselves, which QBtnToggle renders — and the tooltips go on
// them (the kit's v-tooltip, applied here: QBtnToggle builds the buttons, so no directive reaches them
// from the template)
const group = ref(null);
const tipped = new Set();
function registerButtons() {
  const buttons = group.value?.$el?.querySelectorAll?.(":scope > .q-btn") ?? [];
  props.options.forEach((opt, i) => {
    const el = buttons[i] ?? null;
    registerItem(i, el);
    if (!el) return;
    const binding = { value: opt?.title || "", modifiers: { bottom: true } };
    if (tipped.has(el)) tooltipDirective.updated(el, binding);
    else if (binding.value) {
      tooltipDirective.mounted(el, binding);
      tipped.add(el);
    }
  });
  for (const el of tipped) {
    if (![...buttons].includes(el)) {
      tooltipDirective.beforeUnmount(el);
      tipped.delete(el);
    }
  }
}
onMounted(registerButtons);
onUpdated(registerButtons);
onBeforeUnmount(() => {
  for (const el of tipped) tooltipDirective.beforeUnmount(el);
  tipped.clear();
});
</script>

<template>
  <QBtnToggle
    ref="group"
    :model-value="selectedIndex"
    :options="btnOptions"
    flat
    no-caps
    no-wrap
    clearable
    toggle-color=""
    :ripple="false"
    class="ui-seg"
    :class="{
      'ui-seg--small': size === 'small',
      'ui-seg--connected': variant === 'connected',
      'is-locked': disabled,
    }"
    role="radiogroup" :aria-label="ariaLabel || undefined"
    @update:model-value="onToggle"
    @clear="onReclick"
  >
    <template v-for="(opt, i) in options" :key="i" #[`opt-${i}`]>
      <slot name="option" :option="opt" :selected="isSelected(opt)">
        <b class="ui-seg__label">{{ labelOf(opt) }}</b>
        <span v-if="sublabelOf(opt)" class="ui-seg__sub">{{ sublabelOf(opt) }}</span>
      </slot>
    </template>
    <!-- the options' descriptions, hidden, after the buttons (QBtnToggle's default slot) -->
    <template v-for="(opt, i) in options" :key="`d${i}`">
      <span v-if="opt?.title" :id="descId(i)" hidden>{{ opt.title }}</span>
    </template>
  </QBtnToggle>
</template>
