// SPDX-License-Identifier: MIT
// The sidebar "AI tasks" row — behaviour + the attribute it MUST carry.
//
// A composable and not a component on purpose: each app styles its own nav (JW and
// i18n-docgen share no class names), so a shared component would impose a class
// contract neither has. What IS shared is the part that broke — `data-panel-toggle`.
// The kit's `usePanelDismiss` exempts elements carrying it, so without the attribute
// the very click that OPENS the panel also counts as the outside-click that closes
// it: the panel opens and instantly shuts, and nothing in the code says why (found
// live in just_ai_i18n_docgen, 2026-08-03). Spreading `navAttrs` makes that
// unforgettable.
//
// Usage:
//   const { badge, isOpen, toggle, navAttrs } = useAiTasksNav();
//   <button class="navlink" v-bind="navAttrs" @click="toggle"> … </button>

import { computed, reactive } from "vue";

import { AI_TASKS_PANEL_ID, useAiTasksStore } from "../stores/aiTasks.js";

export function useAiTasksNav() {
  const aiTasks = useAiTasksStore();

  // Unseen errors outrank the running count — an app that finished three jobs and
  // failed one should badge the failure, not the zero.
  const badge = computed(() => aiTasks.unseenErrors || aiTasks.runningCount || 0);
  const hasErrors = computed(() => Boolean(aiTasks.unseenErrors));
  const isOpen = computed(() => aiTasks.panelOpen);

  function toggle() {
    // Through the store's togglePanel, NEVER a raw panelOpen flip: openPanel is
    // where the unseen-error badge clears (QC-37) — the raw flip left it stuck
    // red from the sidebar row (audit 2026-08-05, the exact per-place mistake
    // the store's own comment warns about).
    aiTasks.togglePanel();
  }

  return {
    badge,
    hasErrors,
    isOpen,
    toggle,
    // reactive, so the attributes follow the panel in apps that bind `v-bind="nav.navAttrs"` (the
    // nested computed unwraps on read). The row opens a dialog (the panel, AiStatusPanel on QDialog):
    // it says whether it is open and which it is (2026-10-20). No title: the row's own words are its
    // name, and a title equal to them was read twice (the seventeenth review, 2026-10-20).
    navAttrs: reactive({
      "data-panel-toggle": "",
      "aria-haspopup": "dialog",
      "aria-expanded": computed(() => (aiTasks.panelOpen ? "true" : "false")),
      "aria-controls": computed(() => (aiTasks.panelOpen ? AI_TASKS_PANEL_ID : undefined)),
    }),
  };
}
