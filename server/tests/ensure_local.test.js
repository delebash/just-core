// SPDX-License-Identifier: MIT
// dispatch.ensureLocalModelFor — a host that resolves its own adapter (docgen's engine presets)
// makes the built-in runner's model resident before the call, as the kit's run path does from a
// route (found 2026-10-15: docgen's jobs failed every key on an unloaded model).
import { afterEach, expect, test } from "vitest";
import { ensureLocalModelFor, setEnsureLocalModel } from "../src/llm/dispatch.js";

afterEach(() => setEnsureLocalModel(null));

test("the_built_in_runner_loads_its_model_first", async () => {
  const ensured = [];
  setEnsureLocalModel(async (mid) => ensured.push(mid));
  await ensureLocalModelFor({ provider_type: "local-llamacpp" }, "gemma-4-26b-a4b-qat-xl");
  expect(ensured).toEqual(["gemma-4-26b-a4b-qat-xl"]);
});

test("another_provider_or_no_model_loads_nothing", async () => {
  const ensured = [];
  setEnsureLocalModel(async (mid) => ensured.push(mid));
  await ensureLocalModelFor({ provider_type: "openai-compat" }, "llama3.2");
  await ensureLocalModelFor({ provider_type: "local-llamacpp" }, "");
  expect(ensured).toEqual([]);
});

test("no_hook_wired_is_a_no_op", async () => {
  await expect(ensureLocalModelFor({ provider_type: "local-llamacpp" }, "m")).resolves.toBeUndefined();
});

test("a_load_failure_reaches_the_caller", async () => {
  setEnsureLocalModel(async () => {
    throw new Error("not enough memory to load m");
  });
  await expect(ensureLocalModelFor({ provider_type: "local-llamacpp" }, "m")).rejects.toThrow("not enough memory");
});
