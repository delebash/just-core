// SPDX-License-Identifier: MIT
// A long server job seen from the screen (services/serverJob.js — the engines plan's K9, moved from just-house-paint):
// polled until it ends inside the kit's withAiTask (its progress on the task), a poll that fails on the way tried
// again, a job the server no longer has said as that, one that ended unseen said as how it ended, a failure in the
// transport's error shape, a cancel an AbortError — over a stand-in server transport (serverApi.js get/del).
import { createPinia, setActivePinia } from "pinia";
import { beforeEach, expect, test, vi } from "vitest";

const answers = new Map();
const calls = [];
vi.mock("../src/common/services/serverApi.js", () => ({
  get: async (p) => {
    calls.push(["GET", p]);
    const a = answers.get(p);
    return typeof a === "function" ? a() : structuredClone(a);
  },
  del: async (p) => {
    calls.push(["DELETE", p]);
    return null;
  },
}));
const { jobEndedAway, jobError, runServerJob } = await import("../src/services/serverJob.js");
const { useAiTasksStore } = await import("../src/stores/aiTasks.js");

beforeEach(() => {
  setActivePinia(createPinia());
  answers.clear();
  calls.length = 0;
  vi.spyOn(console, "warn").mockImplementation(() => {}); // the kit's own English, no app i18n handed over
});

test("polls the job until it ends, its progress on the task, and resolves with its result", async () => {
  let n = 0;
  answers.set("/v1/jobs/j1", () => (++n < 2 ? { id: "j1", state: "running", progress: 0.5, message: "trim" } : { id: "j1", state: "done", result: { parts: 3 } }));
  const tasks = useAiTasksStore();
  const r = await runServerJob({
    start: async () => ({ id: "j1", state: "running", progress: 0.1 }),
    feature: "parts.find",
    label: "Find parts",
    meta: { houseId: "h1" },
    describe: (job, pct) => (job.message ? `${job.message} · ${pct}%` : ""),
    pollMs: 1,
  });
  expect(r).toEqual({ parts: 3 });
  // one task, done (it lingers a moment on its strip — the store keeps it by id)
  const task = Object.values(tasks.tasks).find((t) => t.feature === "parts.find");
  expect(task).toMatchObject({ label: "Find parts", meta: { houseId: "h1" } });
  expect(tasks.isRunning(task.id)).toBe(false);
});

test("a poll that fails on the way is tried again; a job the server no longer has is JobGone; one ended unseen is JobEnded", async () => {
  let n = 0;
  answers.set("/v1/jobs/j1", () => {
    n++;
    if (n === 1) throw new Error("Failed to fetch"); // no answer at all
    if (n === 2) throw Object.assign(new Error("503"), { status: 503 });
    return { id: "j1", state: "done", result: 7 };
  });
  expect(await runServerJob({ start: async () => ({ id: "j1", state: "running", progress: 0 }), feature: "x", label: "x", pollMs: 1 })).toBe(7);
  expect(n).toBe(3);
  answers.set("/v1/jobs/j2", () => {
    throw Object.assign(new Error("404"), { status: 404 });
  });
  await expect(runServerJob({ start: async () => ({ id: "j2", state: "running", progress: 0 }), feature: "x", label: "x", pollMs: 1 })).rejects.toMatchObject({ name: "JobGone" });
  answers.set("/v1/jobs/j3", () => {
    throw Object.assign(new Error("410"), { status: 410, problem: { state: "done" } });
  });
  await expect(runServerJob({ start: async () => ({ id: "j3", state: "running", progress: 0 }), feature: "x", label: "x", pollMs: 1 })).rejects.toMatchObject({ name: "JobEnded", state: "done" });
  // failed while the window slept, then forgotten: how it ended, never "the server started again"
  answers.set("/v1/jobs/j4", () => {
    throw Object.assign(new Error("410"), { status: 410, problem: { state: "error" } });
  });
  await expect(runServerJob({ start: async () => ({ id: "j4", state: "running", progress: 0 }), feature: "x", label: "x", pollMs: 1 })).rejects.toMatchObject({
    name: "JobEnded",
    state: "error",
    message: "This work ended while the app wasn't looking, without finishing. Start it again.",
  });
}, 10000);

test("a job that ended unseen without finishing is said as that, never as the server starting again", () => {
  expect(jobEndedAway("error").message).toBe("This work ended while the app wasn't looking, without finishing. Start it again.");
  expect(jobEndedAway("cancelled").message).toBe("This work was cancelled while the app wasn't looking.");
  expect(jobEndedAway("error").message).not.toMatch(/started again/);
});

test("its waits between polls leave no listener behind on the task's signal", async () => {
  let n = 0;
  answers.set("/v1/jobs/j1", () => (++n < 4 ? { id: "j1", state: "running", progress: n / 4 } : { id: "j1", state: "done", result: 1 }));
  const added = [];
  const removed = [];
  const real = AbortSignal.prototype.addEventListener;
  const realRemove = AbortSignal.prototype.removeEventListener;
  AbortSignal.prototype.addEventListener = function (type, fn, o) {
    if (type === "abort") added.push(fn);
    return real.call(this, type, fn, o);
  };
  AbortSignal.prototype.removeEventListener = function (type, fn, o) {
    if (type === "abort") removed.push(fn);
    return realRemove.call(this, type, fn, o);
  };
  try {
    await runServerJob({ start: async () => ({ id: "j1", state: "running", progress: 0 }), feature: "x", label: "x", pollMs: 1 });
  } finally {
    AbortSignal.prototype.addEventListener = real;
    AbortSignal.prototype.removeEventListener = realRemove;
  }
  // one for the job's own cancel, one per wait — every wait's taken off again
  expect(added.length - 1).toBe(4);
  expect(removed.length).toBe(4);
});

test("a failed job throws an error the screen can report; a cancelled one an AbortError; Cancel stops it on the server", async () => {
  answers.set("/v1/jobs/j2", { id: "j2", state: "error", error: { message: "model file damaged", status: 500 } });
  await expect(runServerJob({ start: async () => ({ id: "j2", state: "running" }), feature: "x", label: "x", pollMs: 1 })).rejects.toMatchObject({
    message: "model file damaged",
    status: 500,
  });
  await expect(runServerJob({ start: async () => ({ id: "j3", state: "cancelled" }), feature: "x", label: "x" })).rejects.toMatchObject({ name: "AbortError" });
  expect(jobError({ error: null }).status).toBe(500);
  // the server's title for what failed is the screen's heading; its words the detail
  const err = jobError({ error: { message: "sd-cli failed (exit 3)", status: null, title: "The AI photo didn't finish" } });
  expect(err.problem).toEqual({ title: "The AI photo didn't finish", detail: "sd-cli failed (exit 3)" });
  // the task's Cancel (the strip's) asks the server to stop the job
  answers.set("/v1/jobs/j5", { id: "j5", state: "running", progress: 0.2 });
  const tasks = useAiTasksStore();
  const running = runServerJob({ start: async () => ({ id: "j5", state: "running", progress: 0 }), feature: "y", label: "y", pollMs: 5 });
  const mine = () => Object.values(tasks.tasks).find((t) => t.feature === "y");
  await vi.waitFor(() => expect(mine()).toBeTruthy());
  tasks.cancel(mine().id);
  await expect(running).rejects.toMatchObject({ name: "AbortError" });
  expect(calls).toContainEqual(["DELETE", "/v1/jobs/j5"]);
});
