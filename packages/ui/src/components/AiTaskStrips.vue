<!-- SPDX-License-Identifier: MIT -->
<!--
  The kit's AI task strip for each task a page started (JustVoice's PageTaskStrips, promoted to the
  kit 2026-10-18 so every app has it): `features` names the tasks, `meta` narrows them to this page's
  own (a project, a chapter, a house) — the keys the page stamps on its tasks. Running, done, failed
  or cancelled, each strip keeps the kit's own lifetime (a failure stays until dismissed). Each strip
  claims its task, so the global stack (AiTaskStack) never shows it twice. `#extra-stats="{ task }"`
  passes through to each strip. Found with useSurfaceTasks; the family guard's check 17 reads the
  `:features="[…]"` literal here.
-->
<script setup>
import { useSurfaceTasks } from "../composables/useSurfaceTask.js";
import AiTaskStrip from "./AiTaskStrip.vue";

const props = defineProps({
  features: { type: Array, required: true },
  meta: { type: Object, default: () => ({}) },
});

const mine = useSurfaceTasks(() => props.features, () => props.meta);
</script>

<template>
  <div v-if="mine.length" class="ai-task-strips">
    <AiTaskStrip v-for="t in mine" :key="t.id" :task="t">
      <template v-if="$slots['extra-stats']" #extra-stats="{ task }"><slot name="extra-stats" :task="task" /></template>
    </AiTaskStrip>
  </div>
</template>
