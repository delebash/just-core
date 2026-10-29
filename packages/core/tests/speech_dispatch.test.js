// SPDX-License-Identifier: MIT
// Speech through the kit (round E, 2026-10-29 — the user: "transcription a kit feature on an stt preset; speech (tts) no
// preset, the voice chooses"): a transcription feature runs its stt preset's model where the preset says, through the
// runtime's useModel (its locks and loads: speech_placement.test.js), its audio's length for the after-line pass; the
// routes load, unload and list, and the settings route takes a kind's bands and the runtime's declared settings.
import { expect, test } from "vitest";
import * as seed from "../src/llm/seed.js";
import * as stores from "../src/llm/stores.js";
import { makeRuntimesRouter, runtimeProblem } from "../src/llm/runtimes_api.js";
import { transcribeFeature, withSpeechModel } from "../src/llm/speech_dispatch.js";
import { configureRuntimeServices } from "../src/runner/runtime_service.js";
import { NotEnoughMemoryError } from "../src/runner/speech_placement.js";
import { createServer } from "../src/platform/server.js";
import { freshDb } from "./helpers.js";

/** A register runtime's surface, faked: what it loaded where, the lines it ran (and what each said), its servers'
 *  calls. Its useModel loads the way the service's does: not loaded, elsewhere than asked, or other options. */
function fakeSpeechRuntime() {
  const held = new Map();
  const calls = [];
  const svc = {
    rt: { id: "audiocpp", label: "audio.cpp", kind: "tts", kinds: ["tts", "stt"], defaults: { settings: { cpu_min_realtime: 2, backend: "auto" } } },
    loads: [],
    lines: [],
    async useModel(modelId, { placement = "auto", sessionOptions, line } = {}, fn) {
      const h = held.get(modelId);
      const at = h && (placement === "auto" || h.placement === placement) && sessionOptions === undefined ? { modelId, ...h } : await this.loadModel(modelId, { placement });
      const result = await fn(this.serverFor(modelId), at);
      this.lines.push(line ? line(result) : null);
      return result;
    },
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
        transcribe: async (body, timeout) => {
          calls.push(["transcribe", modelId, body, ...(timeout != null ? [timeout] : [])]);
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

  // a second of 16 kHz mono 16-bit audio: its length goes to the after-line pass (the CPU's real-time factor)
  const clip = Buffer.alloc(44 + 32000);
  clip.write("RIFF", 0, "latin1");
  clip.writeUInt32LE(36 + 32000, 4);
  clip.write("WAVEfmt ", 8, "latin1");
  clip.writeUInt32LE(16, 16);
  clip.writeUInt16LE(1, 20);
  clip.writeUInt16LE(1, 22);
  clip.writeUInt32LE(16000, 24);
  clip.writeUInt32LE(32000, 28);
  clip.writeUInt16LE(2, 32);
  clip.writeUInt16LE(16, 34);
  clip.write("data", 36, "latin1");
  clip.writeUInt32LE(32000, 40);
  const wav_b64 = clip.toString("base64");
  expect(await transcribeFeature("dictation.transcribe", { language: "en", wav_b64 })).toEqual({ text: "hello" });
  expect(svc.loads).toEqual([["stt-parakeet", "cpu"]]);
  expect(calls[0]).toEqual(["transcribe", "stt-parakeet", { model: "stt-parakeet", language: "en", wav_b64 }]);
  expect(svc.lines[0]).toEqual({ audioS: 1 });
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
  await expect(withSpeechModel("nope", "kokoro", {}, async () => {})).rejects.toMatchObject({ statusCode: 409 });
});

// Round E, G1: JustVoice's 16 kHz conversion, its language names, its word list and its "3 × the recording" limit had
// nowhere to go — the app's hook shapes the request; the preset's "auto" leaves the place to the model's saved choice (G2).
test("a transcription goes as the app's hook shapes it, with the limit it gives; the preset's auto defers to the model's saved choice", async () => {
  freshDb();
  seed.configureAppSeed({
    featureCatalog: [{ key: "dictation.transcribe", label: "Dictation", kind: "stt" }],
    featurePrompts: {},
    enginePresets: [{ id: "p-dictation", name: "Dictation", kind: "stt", provider_id: "local-audiocpp-stt", model: "stt-parakeet", params: { placement: "auto" } }],
    featurePresets: { "dictation.transcribe": "p-dictation" },
    defaultPresetId: "",
    runtimes: ["audiocpp"],
  });
  seed.seedLlm();
  const { svc, calls } = fakeSpeechRuntime();
  const asked = [];
  const order = [];
  svc.useModel = async function (modelId, opts, fn) {
    asked.push(opts);
    order.push("line starts"); // the kind's activity lock is held from here (runtime_service.js useModel)
    return fn(this.serverFor(modelId), { modelId, placement: "cpu", kind: "stt" });
  };
  svc.transcriptionRequest = async (modelId, body) => {
    order.push("hook shapes");
    return { body: { ...body, language: "English", converted: modelId }, timeout: 21 };
  };
  configureRuntimeServices([["audiocpp", svc]]);
  await transcribeFeature("dictation.transcribe", { language: "en", wav_b64: "x" });
  expect(calls[0]).toEqual(["transcribe", "stt-parakeet", { model: "stt-parakeet", language: "English", wav_b64: "x", converted: "stt-parakeet" }, 21]);
  // the hook runs INSIDE the line, under its lock: JustVoice's converted copy can't be another request's to delete
  // (JustVoice's session, 2026-10-29)
  expect(order).toEqual(["line starts", "hook shapes"]);
  expect(asked[0]).toMatchObject({ placement: undefined, needs: [] });
  // the caller's own limit wins over the hook's
  await transcribeFeature("dictation.transcribe", { language: "en" }, { timeout: 5 });
  expect(calls[1][3]).toBe(5);
  // the line's on-demand companions go through withSpeechModel
  await withSpeechModel("audiocpp", "stt-parakeet", { needs: ["aligner"] }, async () => {});
  expect(asked[2]).toMatchObject({ needs: ["aligner"] });
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

// The routes' refusals, exported: app code that runs a runtime outside them (JustVoice's speech door) words a refusal the
// same way — never a second mapping (JustVoice's session, 2026-10-29).
test("runtimeProblem words a runtime's refusal as the routes do; anything else comes back as it was", () => {
  const mem = runtimeProblem(new NotEnoughMemoryError("not enough memory to load kokoro", { where: "card", neededMb: 900, freeMb: 400 }));
  expect(mem).toMatchObject({ statusCode: 409, slug: "not-enough-memory", extra: { where: "card", neededMb: 900, freeMb: 400 } });
  const terms = runtimeProblem(Object.assign(new Error("accept its licence first"), { termsRequired: { modelId: "xtts" } }));
  expect(terms).toMatchObject({ statusCode: 403, slug: "terms-required", extra: { modelId: "xtts" } });
  const cancelled = runtimeProblem(Object.assign(new Error("cancelled"), { loadCancelled: { modelId: "kokoro" } }));
  expect(cancelled).toMatchObject({ statusCode: 409, slug: "load-cancelled" });
  // the engine not installed: the screen's Install, not a 500 (JustVoice's session, 2026-10-29)
  const missing = runtimeProblem(Object.assign(new Error("audio.cpp isn't installed"), { notInstalled: true, runtime: "audiocpp" }));
  expect(missing).toMatchObject({ statusCode: 409, slug: "engine-not-installed", extra: { runtime: "audiocpp" } });
  const other = new Error("boom");
  expect(runtimeProblem(other)).toBe(other);
});
