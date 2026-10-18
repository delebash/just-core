// SPDX-License-Identifier: MIT
// The task a screen started, for its in-place progress strip (app-structure §8): the running task
// of `feature` whose meta holds every pair in `meta` — a house's id, a brand — so two houses' or two
// brands' runs never show in each other's place. `feature` and `meta` may be values, refs or
// getters. null while nothing of it runs.
//
//   const findTask = useSurfaceTask("parts.find", () => ({ houseId: house.id }));
//   <AiTaskStrip :task="findTask" />   <UiButton :disabled="!!findTask" … />
//
// The strip shows the task where the user started it, and the global stack (AiTaskStack) leaves it
// out meanwhile. The family guard's check 17 finds each feature an app starts by this call: keep
// `feature` a literal string here.
import { computed, toValue } from "vue";
import { useAiTasksStore } from "../stores/aiTasks.js";

const holds = (task, want) => Object.entries(want).every(([k, v]) => task.meta?.[k] === v);

export function useSurfaceTask(feature, meta = {}) {
  const tasks = useAiTasksStore();
  return computed(() => {
    const key = toValue(feature);
    const want = toValue(meta) || {};
    return tasks.runningTasks.find((task) => task.feature === key && holds(task, want)) || null;
  });
}

/**
 * Every VISIBLE task of any of `features` whose meta holds every pair in `meta`, oldest first —
 * running, and finished ones lingering for their dwell (a failure stays until dismissed). For a page
 * that shows all its own runs, several features at once (JustVoice's pageTasks, 2026-10-05, promoted
 * to the kit 2026-10-18); AiTaskStrips renders them. Keep `features` a literal array here: the
 * guard's check 17 reads it.
 */
export function useSurfaceTasks(features, meta = {}) {
  const tasks = useAiTasksStore();
  return computed(() => {
    const keys = toValue(features) || [];
    const want = toValue(meta) || {};
    return tasks.visibleTasks.filter((task) => keys.includes(task.feature) && holds(task, want));
  });
}
