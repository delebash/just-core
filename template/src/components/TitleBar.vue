<script setup>
// SPDX-License-Identifier: MIT
// This app's title bar = the KIT's TitleBar frame (back / forward over the router's history, the
// centred title, window drag) with this app's right side in its slot: the mode cycler and the kit's
// AiStatusButton, which opens the AI tasks panel (app-structure §4, §11; docgen's
// components/TitleBar.vue is the donor).
import { AiStatusButton, Icon, TitleBar, UiButton } from "@delebash/ui";
import { computed } from "vue";
import { useI18n } from "vue-i18n";
import { useUiStore } from "../stores/ui.js";

const ui = useUiStore();
const { t } = useI18n();

// icon names per mode — ids, not words
const MODE_ICONS = { system: "Monitor", light: "Sun", dark: "Moon" };
const mode = computed(() => ui.appearance.mode || "system");
</script>

<template>
  <TitleBar :title="t('app.name')">
    <UiButton
      intent="ghost" size="icon" class="titlebar__mode"
      :title="t('titleBar.theme', { mode: t(`kit.appearance.panel.mode.${mode}`) })"
      :aria-label="t('titleBar.theme', { mode: t(`kit.appearance.panel.mode.${mode}`) })"
      @click="ui.cycleMode()"
    >
      <template #icon><Icon :name="MODE_ICONS[mode]" :size="16" /></template>
    </UiButton>
    <AiStatusButton />
  </TitleBar>
</template>
