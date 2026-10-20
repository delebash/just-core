<script setup>
// SPDX-License-Identifier: MIT
// Shared button for ALL apps — one `intent` prop encodes role + visual style
// (no separate severity/outlined/text booleans). Visual rules live in
// common/styles.css (.ui-btn*), driven by the host's design tokens (with safe
// fallbacks), so it renders correctly in any app. Supersedes the per-app
// JwButton / JvButton / LuButton. `as` picks what it is: a button (default), a link
// ("a" — give it `href`), or a file picker ("label" — put a hidden
// <input type="file"> in its slot); `loading` swaps the icon for a spinner.
//
// Quasar's QBtn underneath (the kit's controls on Quasar —
// docs/plans/2026-10-09-kit-controls-on-quasar.md), with Quasar's Material look off (no
// uppercase, no shadow, no ripple) — the look stays common/styles.css's .ui-btn*, which outranks
// Quasar's stylesheet (its own cascade layer); ../../quasar/theme.css, "Button", resets what
// Quasar sets that .ui-btn doesn't. Kept from the native element it replaces:
// - a disabled or loading button carries the native `disabled` (QBtn's own `disable` adds a class
//   whose !important opacity would override the family's disabled look);
// - the label stays beside a loading spinner (QBtn's `loading` hides it);
// - "label" was a <label> wrapping the file input; QBtn renders only <button> or <a>, so a press
//   opens the input itself.
import { QBtn } from "quasar";
import { computed, useSlots } from "vue";

const props = defineProps({
  // primary|secondary|ghost|danger|danger-outline|success|info|accent2
  intent: { type: String, default: "primary" },
  size: { type: String, default: "regular" },    // small|regular|lg|icon
  loading: { type: Boolean, default: false },
  disabled: { type: Boolean, default: false },
  as: { type: String, default: "button" },       // button|label|a
  label: { type: String, default: "" },
  type: { type: String, default: "button" },     // for a real <button>
  // An off button that keeps the focus and its Tab stop (the APG's "focusability of disabled
  // controls"): aria-disabled, not the native disabled — a button turned off while focused (Settings'
  // Save after a save) dropped the focus on <body> (the seventeenth review, 2026-10-20). It keeps the
  // disabled look and swallows its click, Enter and Space, and a submit button doesn't submit.
  focusableWhenDisabled: { type: Boolean, default: false },
  // a link's address (as="a"): left off while the button is off — an off link with its href still took a
  // middle click and opened the browser in the desktop app (the nineteenth review, 2026-10-20); it stays
  // a link to a screen reader (role="link", aria-disabled) and in the Tab order (QBtn's tabindex)
  href: { type: String, default: undefined },
});
const slots = useSlots();
const off = computed(() => props.disabled || props.loading);
const inert = computed(() => off.value && props.focusableWhenDisabled && props.as !== "a");
// the click an off-but-focusable button would make (a pointer's, Enter's or Space's — QBtn makes the
// keys' into a click) stops here, before QBtn and the caller hear it, and submits no form; an off link
// (as="a" — aria-disabled, never the native disabled, which a link hasn't) takes no click, middle click
// (auxclick) included (the eighteenth and nineteenth reviews, 2026-10-20)
function swallow(e) {
  if (!inert.value && !(off.value && props.as === "a")) return;
  e.preventDefault();
  e.stopImmediatePropagation();
}
const classes = computed(() => [
  "ui-btn",
  `ui-btn--${props.intent}`,
  // every non-default size gets a modifier (small | lg | icon)
  props.size !== "regular" && `ui-btn--${props.size}`,
  { "is-loading": props.loading, "is-disabled": off.value },
]);
// QBtn: "a" renders the <a> (an `href` from the caller makes it a link), the form types a <button>
const qType = computed(() => (props.as === "a" ? "a" : props.as === "label" ? "button" : props.type));

function onPress(e) {
  if (props.as !== "label" || e.target?.matches?.('input[type="file"]')) return;
  e.currentTarget.querySelector('input[type="file"]')?.click();
}
</script>

<template>
  <QBtn
    :class="classes"
    :type="qType"
    unelevated
    no-caps
    no-wrap
    :ripple="false"
    :disabled="as !== 'a' && off && !inert ? true : undefined"
    :href="as === 'a' && off ? undefined : href"
    :role="as === 'a' && off ? 'link' : undefined"
    :aria-disabled="(as === 'a' && off) || inert ? 'true' : undefined"
    :aria-busy="loading ? 'true' : undefined"
    @click.capture="swallow"
    @auxclick.capture="swallow"
    @click="onPress"
  >
    <span v-if="loading" class="ui-btn-spinner" aria-hidden="true" />
    <slot v-else name="icon" />
    <span v-if="label || slots.default" class="ui-btn-label"><slot>{{ label }}</slot></span>
  </QBtn>
</template>
