// SPDX-License-Identifier: MIT
// A model row whose load failed (useRunnerModels serverTask): its bar offered Retry but no Dismiss — the user's
// screenshot, the model catalog's open call 3 (moved from JustWrite, 2026-10-28; built in the finish list, 2026-10-29).
// Dismiss is the live task's own verb: stop THIS model, which drops the failed row on the server, then the list again.
import { expect, test, vi } from "vitest";

const calls = [];
let rows = [{ id: "m1", status: "error", error: "out of memory" }];
vi.mock("../src/client.js", () => ({
  request: async (url, opts = {}) => {
    calls.push([url, opts.method || "GET", opts.body]);
    if (url === "/v1/llm-runner/models") return { models: rows, vramMb: 8192 };
    if (url === "/v1/llm-runner/stop") {
      rows = [{ id: "m1", status: "available" }];
      return {};
    }
    if (url === "/v1/llm-runner/status") return { status: "idle" };
    return {};
  },
}));
vi.mock("../src/composables/useProviderModels.js", () => ({ useProviderModels: () => ({ refreshModels() {} }) }));

const { refresh, taskFor, models } = await import("../src/composables/useRunnerModels.js");

test("a failed load's bar offers Dismiss beside Retry: the model is stopped and the row reads again", async () => {
  await refresh();
  const task = taskFor("m1");
  expect(task.state).toBe("error");
  expect(task.retry).toBeTypeOf("function");
  expect(task.dismiss).toBeTypeOf("function");
  await task.dismiss();
  expect(calls).toContainEqual(["/v1/llm-runner/stop", "POST", { modelId: "m1" }]);
  expect(models.value[0].status).toBe("available");
  expect(taskFor("m1").state).toBe("");
});
