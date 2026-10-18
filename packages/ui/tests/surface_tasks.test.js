// SPDX-License-Identifier: MIT
// useSurfaceTask / useSurfaceTasks — the task(s) a screen started (app-structure §8): the singular is
// the one RUNNING task of a feature (a trigger disables on it); the plural every VISIBLE task of
// several features, finished ones lingering (a failure stays until dismissed), narrowed by meta.
import { createPinia, setActivePinia } from "pinia";
import { beforeEach, expect, test } from "vitest";
import { useSurfaceTask, useSurfaceTasks } from "../src/composables/useSurfaceTask.js";
import { useAiTasksStore } from "../src/stores/aiTasks.js";

beforeEach(() => setActivePinia(createPinia()));

test("the singular finds this screen's running task; the plural keeps a failed one until dismissed", () => {
  const tasks = useAiTasksStore();
  const a = tasks.start({ feature: "parts.find", meta: { houseId: "h1" } });
  const other = tasks.start({ feature: "parts.find", meta: { houseId: "h2" } });
  const render = tasks.start({ feature: "aiphoto.render", meta: { houseId: "h1" } });
  const one = useSurfaceTask("parts.find", { houseId: "h1" });
  const all = useSurfaceTasks(["parts.find", "aiphoto.render"], { houseId: "h1" });
  expect(one.value.id).toBe(a.id);
  expect(all.value.map((t) => t.id)).toEqual([a.id, render.id]);
  render.fail(new Error("out of memory"));
  expect(all.value.map((t) => t.id)).toEqual([a.id, render.id]); // the failure lingers on the page
  a.finish({});
  expect(one.value).toBeNull(); // nothing of it runs now: the trigger is free again
  tasks.dismiss(render.id);
  expect(all.value.map((t) => t.id)).not.toContain(render.id);
  expect(other.id).toBeTruthy();
});
