// SPDX-License-Identifier: MIT
// The kit's useRunnerModels.refresh keeps an open model picker current (#305): the picker lists the DOWNLOADED models
// only (llm/api.js), so the cache refreshes when the set of rows on disk changes. Until 2026-10-29 it compared the
// catalog's id set, which a finished download doesn't change — an open picker missed the new model until a reload
// (the kit's TASKS, "two routing bugs").
import { beforeEach, expect, test, vi } from "vitest";

const picker = vi.hoisted(() => ({ refreshModels: vi.fn() }));
vi.mock("@delebash/ui/client.js", () => ({ request: vi.fn() }));
vi.mock("@delebash/ui/composables/useProviderModels.js", () => ({ useProviderModels: () => picker }));

const { request } = await import("@delebash/ui/client.js");
const { refresh } = await import("@delebash/ui/composables/useRunnerModels.js");

let rows = [];
beforeEach(() => {
  request.mockImplementation(async (url) => (url === "/v1/llm-runner/models" ? { models: rows } : {}));
});

test("a download that finishes refreshes the picker; a refresh with nothing new on disk doesn't", async () => {
  rows = [
    { id: "chat-a", status: "disk" },
    { id: "chat-b", status: "available" },
  ];
  await refresh(); // the first look only remembers
  expect(picker.refreshModels).not.toHaveBeenCalled();

  await refresh(); // nothing changed
  expect(picker.refreshModels).not.toHaveBeenCalled();

  rows = [
    { id: "chat-a", status: "disk" },
    { id: "chat-b", status: "disk" }, // its download finished: same catalog ids, one more on disk
  ];
  await refresh();
  expect(picker.refreshModels).toHaveBeenCalledTimes(1);
  expect(picker.refreshModels).toHaveBeenCalledWith("local-llamacpp");
});
