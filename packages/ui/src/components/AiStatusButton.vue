<script setup>
// SPDX-License-Identifier: MIT
// Header chip + slide-in status panel for global AI task tracking.
//
// Idle:    quiet icon ("AI") — opens the panel for a peek at history.
// Active:  pulsing dot + running-count badge — opens the panel for
//          per-task elapsed/tokens/cancel.
//
// Lives in the host's title bar so it's reachable from every view. Its chrome
// is the kit's quiet icon button at the lowest specificity (:where), so a
// host's own title-bar rules still win (JW: .titlebar-right button) and an app
// that styles nothing gets a real button, not the browser's grey box (found by
// the template audit, 2026-10-18).

import { computed } from "vue";
import { useI18n } from "vue-i18n";
import { useAiTasksStore } from "../stores/aiTasks.js";
import Icon from "../common/components/Icon.vue";
import AiStatusPanel from "./AiStatusPanel.vue";

const { t } = useI18n();

const tasks = useAiTasksStore();
const count = computed(() => tasks.runningCount);
const active = computed(() => count.value > 0);
// QC-37 (the toast law): failed tasks badge the chip red until the panel is
// opened — durable, unlike a toast. openPanel() clears the count.
const errors = computed(() => tasks.unseenErrors);

function toggle() { tasks.togglePanel(); }
</script>

<template>
  <div class="ai-status-wrap">
    <button class="ai-status-btn"
      :class="{ active, 'has-errors': errors > 0 }"
      data-panel-toggle
      @click="toggle"
      v-tooltip.bottom="errors
        ? t('kit.aiTasks.button.failed', { n: errors }, errors)
        : active ? t('kit.aiTasks.button.running', { n: count }, count) : t('kit.aiTasks.button.idle')">
      <Icon name="Sparkle" :size="13" />
      <span v-if="active" class="ai-status-pulse" />
      <span v-if="active" class="ai-status-count">{{ count }}</span>
      <span v-if="errors" class="ai-status-errors">{{ errors }}</span>
    </button>
    <AiStatusPanel />
  </div>
</template>

<style scoped>
.ai-status-wrap { position: relative; display: inline-flex; }

/* the chrome, overridable by any host rule (see the header) */
:where(.ai-status-btn) {
  min-width: 32px; height: 32px; justify-content: center;
  border: none; border-radius: var(--btn-radius, 8px);
  background: transparent; color: var(--ink-2); font: inherit; cursor: pointer;
}
:where(.ai-status-btn:hover) { background: var(--surface-3, rgba(0, 0, 0, 0.05)); }

.ai-status-btn {
  position: relative;
  display: inline-flex; align-items: center; gap: 4px;
  padding: 4px 6px;
}
.ai-status-btn.active {
  color: var(--accent-ink);
}
.ai-status-count {
  font-family: var(--font-mono, monospace);
  font-size: 10px;
  font-weight: 600;
  letter-spacing: 0.04em;
  color: var(--accent-ink);
}
.ai-status-errors {
  font-family: var(--font-mono, monospace);
  font-size: 9.5px;
  font-weight: 700;
  line-height: 1;
  padding: 2px 5px;
  border-radius: 999px;
  background: var(--danger-ink, #b91c1c);
  color: var(--surface, #fff);
}
.ai-status-btn.has-errors { color: var(--danger-ink, #b91c1c); }
.ai-status-pulse {
  position: absolute;
  top: 3px; right: 3px;
  width: 6px; height: 6px;
  border-radius: 50%;
  background: var(--accent);
  box-shadow: 0 0 0 0 var(--accent);
  animation: ai-status-pulse 1.4s ease-out infinite;
}
@keyframes ai-status-pulse {
  0%   { box-shadow: 0 0 0 0 color-mix(in oklab, var(--accent) 65%, transparent); }
  70%  { box-shadow: 0 0 0 6px transparent; }
  100% { box-shadow: 0 0 0 0 transparent; }
}
</style>
