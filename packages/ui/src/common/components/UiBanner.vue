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
// adds an intent of its own by setting those two.
import { QBanner } from "quasar";
import { computed } from "vue";
import Icon from "./Icon.vue";

const props = defineProps({
  intent: { type: String, default: "danger" }, // danger
});
const ICONS = { danger: "Alert" };
const classes = computed(() => ["ui-banner", `ui-banner--${props.intent}`]);
</script>

<template>
  <QBanner :class="classes" dense inline-actions>
    <template #avatar><Icon :name="ICONS[intent] || 'Alert'" :size="13" /></template>
    <slot />
    <template v-if="$slots.action" #action><slot name="action" /></template>
  </QBanner>
</template>
