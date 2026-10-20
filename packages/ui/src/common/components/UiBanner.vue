<script setup>
// SPDX-License-Identifier: MIT
// Shared banner — a tinted message in a pane or a window: an icon, the message, and an optional
// action at its end (#action, e.g. a Retry button). One `intent` picks its look, as on every
// Ui* control. Lifted 2026-10-11 from JustWrite's nineteen private error boxes (.bs-error,
// .ca-error, … — one look, written nineteen times).
//
// Quasar's QBanner underneath (the kit's controls on Quasar —
// docs/plans/2026-10-09-kit-controls-on-quasar.md). The look is the kit's theme
// (../../quasar/theme.css, "Banner"): an intent sets --ui-banner-bg / --ui-banner-ink, so a host
// adds an intent of its own by setting those two. "warning" (2026-10-20) is for what is true but
// not wrong — it will be slow here, there's little memory — on --warn-bg / --warn-ink with the ⚠ in
// that ink; "danger" is for what failed or can't be done (the slow and low-memory notes were drawn
// as errors — the screens-and-keyboard review).
import { QBanner } from "quasar";
import { computed } from "vue";
import Icon from "./Icon.vue";

const props = defineProps({
  intent: { type: String, default: "danger" }, // danger | warning | info
  // the action beside the words (the default) or under them — a narrow panel's banner with two
  // buttons stacks them, so the words keep their width (just-house-paint's design offer, 2026-10-18)
  inlineActions: { type: Boolean, default: true },
});
// danger and warning the ⚠, info Lucide's ⓘ (it wore the ⚠ — the seventeenth review)
const ICONS = { danger: "Alert", warning: "Alert", info: "Info" };
// What a screen reader hears when it appears: a danger banner interrupts (role="alert"), an info or
// warning one waits its turn (role="status") — every banner was an alert (QBanner's own role; the
// sixteenth review, 2026-10-20).
const role = computed(() => (props.intent === "danger" ? "alert" : "status"));
const classes = computed(() => ["ui-banner", `ui-banner--${props.intent}`]);
</script>

<template>
  <QBanner :class="classes" :role="role" dense :inline-actions="inlineActions">
    <template #avatar><Icon :name="ICONS[intent] || 'Alert'" :size="13" /></template>
    <slot />
    <template v-if="$slots.action" #action><slot name="action" /></template>
  </QBanner>
</template>
