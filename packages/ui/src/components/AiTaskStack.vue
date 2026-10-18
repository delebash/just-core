<!-- SPDX-License-Identifier: MIT -->
<script setup>
// The global AI task stack (app-structure §8): every RUNNING task that no screen shows in place,
// each as the kit's AiTaskStrip — progress, elapsed, Cancel, Details — stacked at the window's
// bottom right (the toasts take the bottom centre). <LlmUiHosts /> mounts it, so every app has it
// and no AI task runs without visible progress.
//
// A screen that shows its task where the user started it (an AiTaskStrip, found with
// useSurfaceTask) takes the task out of the stack while that strip is mounted; a task started
// `inline` never enters it. Finished tasks leave at once — their outcome is the screen's, and the
// AI tasks panel keeps the record.
import { computed } from "vue";
import { useI18n } from "vue-i18n";
import { useAiTasksStore } from "../stores/aiTasks.js";
import AiTaskStrip from "./AiTaskStrip.vue";

const tasks = useAiTasksStore();
const { t } = useI18n();
const list = computed(() => tasks.unshownRunningTasks);
</script>

<template>
  <div v-if="list.length" class="ai-task-stack" role="region" :aria-label="t('kit.nav.aiTasks')" aria-live="polite">
    <AiTaskStrip v-for="task in list" :key="task.id" :task="task" :in-place="false" class="ai-task-stack__item" />
  </div>
</template>

<style>
/* Above the page and its drawers, under Quasar's dialogs (6000) and notifications. */
.ai-task-stack {
  position: fixed;
  right: 16px;
  bottom: 16px;
  z-index: 5000;
  display: flex;
  flex-direction: column;
  gap: 8px;
  width: min(440px, calc(100vw - 32px));
  pointer-events: none;
}
.ai-task-stack__item.sts {
  margin: 0;
  pointer-events: auto;
  box-shadow: var(--shadow-2, 0 8px 24px rgba(0, 0, 0, 0.12));
}
</style>
