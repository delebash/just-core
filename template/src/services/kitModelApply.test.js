// SPDX-License-Identifier: MIT
// The kit's Set as default (modelApply.setAsDefault): besides repointing the presets that still use the previous
// default, it records the chosen pair as the routing default — the one a feature's Reset reads (llm/presets_api.js:
// "the model resets to the default set in the model tab", the user, 2026-07-16). Until 2026-10-29 nothing wrote it, so
// a Reset left the seed's empty model (the kit's TASKS, "two routing bugs").
import { beforeEach, expect, test, vi } from "vitest";

const routing = vi.hoisted(() => ({ loadRouting: vi.fn(async () => {}), setDefaultLlm: vi.fn(async () => {}), setDefaultEmbedding: vi.fn() }));
vi.mock("@delebash/ui/client.js", () => ({ request: vi.fn() }));
vi.mock("@delebash/ui/composables/useRouting.js", () => ({ useRouting: () => routing }));

const { request } = await import("@delebash/ui/client.js");
const { setAsDefault } = await import("@delebash/ui/services/modelApply.js");

beforeEach(() => {
  vi.clearAllMocks();
  const presets = [{ id: "p_chat", providerId: "local-llamacpp", model: "old-model", factoryModel: "" }];
  request.mockImplementation(async (url, opts) => {
    if (url === "/v1/ai/preset-assignments") return { features: { chat: "p_chat" }, defaultPresetId: "p_chat" };
    if (url === "/v1/ai/engine-presets") return { presets };
    if (url === "/v1/ai/routing") return { default: {} };
    if (opts?.method === "PUT") return {};
    return {};
  });
});

test("Set as default repoints the presets on the old default and records the pair the Reset reads", async () => {
  await setAsDefault("local-llamacpp", "new-model");
  expect(request).toHaveBeenCalledWith("/v1/ai/engine-presets/p_chat", {
    method: "PUT",
    body: expect.objectContaining({ providerId: "local-llamacpp", model: "new-model" }),
  });
  expect(routing.loadRouting).toHaveBeenCalled();
  expect(routing.setDefaultLlm).toHaveBeenCalledWith({ providerId: "local-llamacpp", model: "new-model" });
});
