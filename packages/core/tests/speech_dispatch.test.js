// SPDX-License-Identifier: MIT
// Speech through the kit (round E, 2026-10-29 — the user: "transcription a kit feature on an stt preset; speech (tts) no
// preset, the voice chooses"): a transcription feature runs its stt preset's model where the preset says, loaded first
// when it isn't, its kind busy for the call; speech reuses a loaded model; the routes load, unload and list, and the
// settings route takes a kind's bands and the runtime's declared settings.
import { expect, test } from "vitest";
import * as seed from "../src/llm/seed.js";
import * as stores from "../src/llm/stores.js";
import { makeRuntimesRouter } from "../src/llm/runtimes_api.js";
import { transcribeFeature, withSpeechModel } from "../src/llm/speech_dispatch.js";
import { getArbiter } from "../src/runner/arbiter.js";
import { configureRuntimeServices } from "../src/runner/runtime_service.js";
import { createServer } from "../src/platform/server.js";
import { freshDb } from "./helpers.js";

/** A register runtime's surface, faked: what it loaded where, and its servers' calls. */
function fakeSpeechRuntime() {
  const held = new Map();
  const calls = [];
  const svc = {
    rt: { id: "audiocpp", label: "audio.cpp", kind: "tts", kinds: ["tts", "stt"], defaults: { settings: { cpu_min_realtime: 2, backend: "auto" } } },
    loads: [],
    status: () => ({ id: "audiocpp" }),
    loaded: () => [...held].map(([modelId, h]) => ({ modelId, ...h })),
    async loadModel(modelId, { placement = "auto" } = {}) {
      const kind = modelId.startsWith("stt-") ? "stt" : "tts";
      const at = placement === "auto" ? "gpu" : placement;
      this.loads.push([modelId, placement]);
      held.set(modelId, { placement: at, kind });
      return { modelId, placement: at, kind };
    },
    async unloadModel(modelId) {
      return held.delete(modelId);
    },
    serverFor(modelId) {
      return {
        transcribe: async (body) => {
          calls.push(["transcribe", modelId, body, getArbiter().busyKinds?.() ?? null]);
          return { text: "hello" };
        },
        speech: async (body) => [Buffer.from("RIFF"), { body }],
      };
    },
  };
  return { svc, calls };
}

test("transcription runs its stt preset's model where the preset says, loaded first; speech reuses a model already loaded", async () => {
  freshDb();
  seed.configureAppSeed({
    featureCatalog: [{ key: "dictation.transcribe", label: "Dictation", kind: "stt" }],
    featurePrompts: {},
    enginePresets: [{ id: "p-dictation", name: "Dictation", kind: "stt", provider_id: "local-audiocpp-stt", model: "stt-parakeet", params: { placement: "cpu" } }],
    featurePresets: { "dictation.transcribe": "p-dictation" },
    defaultPresetId: "",
    runtimes: ["audiocpp"],
  });
  seed.seedLlm();
  const { svc, calls } = fakeSpeechRuntime();
  configureRuntimeServices([["audiocpp", svc]]);

  expect(await transcribeFeature("dictation.transcribe", { language: "en", wav_b64: "AAAA" })).toEqual({ text: "hello" });
  expect(svc.loads).toEqual([["stt-parakeet", "cpu"]]);
  expect(calls[0].slice(0, 3)).toEqual(["transcribe", "stt-parakeet", { model: "stt-parakeet", language: "en", wav_b64: "AAAA" }]);
  // again: loaded already where asked — no second load
  await transcribeFeature("dictation.transcribe", { language: "en" });
  expect(svc.loads).toHaveLength(1);

  // speech: the voice's model, loaded once, then reused wherever it is ("auto")
  const [wav] = await withSpeechModel("audiocpp", "kokoro", {}, (server) => server.speech({ text: "hi" }));
  expect(wav.toString()).toBe("RIFF");
  await withSpeechModel("audiocpp", "kokoro", {}, async (server, held) => expect(held).toMatchObject({ modelId: "kokoro", kind: "tts" }));
  expect(svc.loads.filter(([m]) => m === "kokoro")).toHaveLength(1);
  // a placement asked that differs from where it is: loaded again there
  await withSpeechModel("audiocpp", "kokoro", { placement: "cpu" }, async () => {});
  expect(svc.loads.at(-1)).toEqual(["kokoro", "cpu"]);
  await expect(withSpeechModel("nope", "kokoro", {}, async () => {})).rejects.toMatchObject({ status: 409 });
});

test("the routes: load where asked, unload, what's loaded; the settings route takes a kind's bands and the declared settings", async () => {
  freshDb();
  seed.configureAppSeed({ featureCatalog: [], featurePrompts: {}, enginePresets: [], featurePresets: {}, defaultPresetId: "", runtimes: ["audiocpp"] });
  seed.seedLlm();
  const { svc } = fakeSpeechRuntime();
  configureRuntimeServices([["audiocpp", svc]]);
  const app = createServer({ typeBase: "t/" });
  app.route("/", makeRuntimesRouter());
  const post = (url, body) => app.request(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body ?? {}) });
  expect(await (await post("/v1/ai/runtimes/audiocpp/models/kokoro/load", { placement: "gpu" })).json()).toEqual({ modelId: "kokoro", placement: "gpu", kind: "tts" });
  expect((await post("/v1/ai/runtimes/audiocpp/models/kokoro/load", { placement: "npu" })).status).toBe(422);
  expect((await (await app.request("/v1/ai/runtimes/audiocpp/loaded")).json()).loaded).toEqual([{ modelId: "kokoro", placement: "gpu", kind: "tts" }]);
  expect(await (await post("/v1/ai/runtimes/audiocpp/models/kokoro/unload")).json()).toEqual({ unloaded: true, loaded: [] });

  const put = (body) => app.request("/v1/ai/runtimes/audiocpp/settings", { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  expect((await put({ bandsByKind: { stt: { fast: 8, fine: 3, slow: 1 } }, settings: { cpu_min_realtime: 3, backend: "vulkan" } })).status).toBe(200);
  const cfg = stores.getRunnerConfigStore().getRuntimeConfig("audiocpp");
  expect(cfg.bandsByKind.stt).toMatchObject({ fast: 8, fine: 3, slow: 1 });
  expect(cfg.settings).toMatchObject({ cpu_min_realtime: 3, backend: "vulkan" });
  expect((await put({ settings: { nope: 1 } })).status).toBe(400);
  expect((await put({ settings: { cpu_min_realtime: "fast" } })).status).toBe(400);
  expect((await put({ bandsByKind: { image: { fast: 1, fine: 2, slow: 3 } } })).status).toBe(400);
});
