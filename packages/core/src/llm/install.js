// SPDX-License-Identifier: MIT
// installLlm — drop the ENTIRE shared LLM stack into any Hono app with ONE call (the port
// of llm_runner/llm/install.py). The app provides only its database handle and its feature
// seed DATA; installLlm creates the LLM tables, wires storage, mounts every router, sets the
// DB usage sink, builds the dispatch config, and wires the bundled runner's catalog. After
// this + a seed run the app's LLM is fully working — nothing else is per-app.
//
// The app still mounts the runner-management router (`runnerRouter`, Python's
// `llm_runner.router`) itself; this only wires the runner's catalog source to the shared DB.
//
// THE MINIMAL CONTRACT: `await installLlm(app, { db, dataDir })` is a complete, legal call —
// an app with no per-action AI features is a first-class consumer (tests/install_llm).
// `app = null` is the HEADLESS boot: everything except the router mounts.
//
// Async where Python wasn't: the hardware keys the tune layers are stored under read a memo
// that `hardware.ensureDetected()` fills (runner B's design), so installLlm awaits it first.

import nodePath from "node:path";
import * as runnerArbiter from "../runner/arbiter.js";
import { makeAutotuneRouter } from "../runner/autotune.js";
import { makeCalibrateRouter } from "../runner/calibrate.js";
import * as cacheRegistry from "../runner/cache_registry.js";
import * as hardware from "../runner/hardware.js";
import * as lifecycle from "#runner/lifecycle";
import * as runnerModels from "../runner/models.js";
import { background } from "../platform/asyncutil.js";
import { getLogger } from "../platform/log.js";
import { pyStr } from "../platform/py.js";
import * as api from "./api.js";
import { makeCacheRouter } from "./cache_api.js";
import { makeClassTunesRouter } from "./class_tunes_api.js";
import * as dispatch from "./dispatch.js";
import { makeEmbedTemplatesRouter } from "./embed_templates_api.js";
import * as identity from "./identity.js";
import { makeKnobCatalogRouter } from "./knob_catalog_api.js";
import { makeCatalogRouter } from "./model_catalog_api.js";
import { makeModelListRulesRouter } from "./model_list_rules_api.js";
import { makeModelMeasurementsRouter } from "./model_measurements_api.js";
import { makeModelTunesRouter } from "./model_tunes_api.js";
import { makePresetsRouter } from "./presets_api.js";
import { makePricingRouter } from "./pricing_api.js";
import { prepareLlm } from "./install_core.js";
import { makeFeatureRouter, makePromptRouter } from "./prompts.js";
import { makeProviderRouter } from "./provider_api.js";
import { makeReasoningMapRouter } from "./reasoning_map_api.js";
import { makeRoutingRouter } from "./routing_api.js";
import { makeRunnerConfigRouter } from "./runner_config_api.js";
import { makeRuntimesRouter } from "./runtimes_api.js";
import { placementKey, runtimeOf } from "../runner/runtimes.js";
import { configureRuntimeServices, getRuntimeService, RuntimeService } from "../runner/runtime_service.js";
import { AUDIOCPP_PROBE_ARGVS } from "../runner/audiocpp.js";
import { SDCPP_PROBE_ARGVS, SDCPP_SERVER } from "../runner/sdcpp.js";
import * as seed from "./seed.js";
import * as stores from "./stores.js";
import * as switchResolve from "./switch_resolve.js";
import { makeSwitchPresetsRouter } from "./switch_presets_api.js";
import { makeTestSamplesRouter } from "./test_samples_api.js";

const log = getLogger("llm_runner.llm.install");

// Each kit runtime's launch flags (a staged build must accept them before it replaces a working one) and its server.
const RUNTIME_PROBES = { sdcpp: SDCPP_PROBE_ARGVS, audiocpp: AUDIOCPP_PROBE_ARGVS };
const RUNTIME_SERVERS = { sdcpp: SDCPP_SERVER };

/** The memoized whole-machine tuning key (gpu|vram|cores|ramGB) the model_tunes layer uses. */
export const currentHwKey = () => hardware.currentMachineKey();

/**
 * The coarse hardware-CLASS key the class_tunes layer matches on. The user's
 * `class_key_override` wins over detection — "detection proposes, never dictates" (user
 * ruling 2026-07-22). THE choke point every class-key consumer reads through.
 */
export const currentClassKey = () => stores.getClassKeyOverride() || hardware.currentClassKey();

// Python's private names, for the ported tests that reach them.
export const _currentHwKey = currentHwKey;
export const _currentClassKey = currentClassKey;

/** Every router the stack serves — the app-bound half of installLlm. */
export function mountLlmRouters(app, { featurePrompts, config, allowKeyReveal, dataDir = null, product = "" }) {
  app.route("/", api.router());
  // allowKeyReveal threads the host's opt-in to the key/reveal route: the host must guard
  // mutating /v1 with an origin check to enable it.
  app.route("/", makeProviderRouter(stores.getProviderStore, allowKeyReveal));
  app.route("/", makePromptRouter(stores.getPromptStore, featurePrompts));
  app.route("/", makeFeatureRouter(stores.getPromptStore, config));
  app.route("/", makeRoutingRouter(stores.getRoutingStore, seed.appFeatureCatalog));
  // the app's kit runtimes besides llama.cpp (installLlm({ runtimes })) — their engines' status, install, removal
  app.route("/", makeRuntimesRouter());
  app.route(
    "/",
    makePresetsRouter(
      stores.getEnginePresetStore,
      stores.getDefaultPresetId,
      stores.setDefaultPresetId,
      stores.getFeaturePresetRefStore,
      seed.resetRoutingToFactory,
      seed.resetPresetToFactory,
    ),
  );
  app.route("/", makeKnobCatalogRouter(stores.listKnobCatalog));
  app.route("/", makeTestSamplesRouter(stores.getTestSampleStore));
  // Where the engine + models are cached — offered as a CHOICE (cache_api's header).
  app.route("/", makeCacheRouter(dataDir, product));

  const stopRunnerBestEffort = async () => {
    // Full runner teardown on a reset: unload every child + clear the VRAM ledger. A
    // reset must never fail because no runner is configured here.
    try {
      await lifecycle.getService().stop();
    } catch (e) {
      log.warning("runner stop on reset failed", e);
    }
  };

  app.route(
    "/",
    makeCatalogRouter(stores.getModelCatalogStore, {
      classTuneRefsFn: stores.listClassTuneRefs,
      classKeyFn: currentClassKey,
      resolveSwitches: (mid) => switchResolve.resolveModelSwitches(mid, currentHwKey(), currentClassKey()),
      inspectFn: (repo, quant, revision = "main") => identity.inspectModelFromLink(repo, quant, revision),
      listFilesFn: (repo, revision = "main") => runnerModels.listRepoGgufs(repo, revision),
      previewFitFn: (modelId) => lifecycle.getService().previewFit(modelId),
      resolveOrigins: (mid) => switchResolve.resolveModelSwitchesWithOrigins(mid, currentHwKey(), currentClassKey()),
      resolveBaselineOrigins: (mid) => switchResolve.resolveModelSwitchesWithOrigins(mid, "", currentClassKey()),
      onReset: stopRunnerBestEffort,
    }),
  );
  app.route("/", makePricingRouter(stores.getPricingStore));
  app.route("/", makeReasoningMapRouter(stores.getReasoningMapStore));
  app.route("/", makeEmbedTemplatesRouter(stores.getEmbedTemplateStore));
  api.setEmbedTemplateResolver((mid) => stores.getEmbedTemplateStore().get(mid));
  app.route("/", makeModelListRulesRouter(stores.getModelListRules, stores.setModelListRules, stores.resetModelListRules));
  api.setModelListRulesResolver(() => {
    const d = stores.getModelListRules();
    return Object.hasOwn(d, "rules") ? d.rules : {};
  });
  app.route("/", makeRunnerConfigRouter(stores.getRunnerConfigStore));
  app.route("/", makeSwitchPresetsRouter(stores.getSwitchPresetStore));
  app.route(
    "/",
    makeModelTunesRouter(stores.getModelTuneStore, currentHwKey, {
      resolveBaseline: (mid) => switchResolve.resolveModelSwitches(mid, "", currentClassKey()),
      measurementsFn: (mid) => stores.getModelMeasurementStore().list(mid),
      classKeyFn: currentClassKey,
      classConfigsFn: () => stores.getClassTuneStore().listAll(),
    }),
  );
  app.route(
    "/",
    makeClassTunesRouter(stores.getClassTuneStore, currentClassKey, {
      hwClassStore: stores.getHardwareClassStore,
      deriveKeyFn: hardware.bandedClassKey,
      parseKeyFn: hardware.parseClassKey,
    }),
  );
  app.route("/", makeModelMeasurementsRouter(stores.getModelMeasurementStore, currentHwKey));

  // Auto-tune: the runner drives the measured sweep; the llm layer supplies switch
  // resolution + tune persistence. `saveTune` writes the winner verbatim as this machine's
  // tune (the Tune modal's Save semantics).
  const saveTune = (modelId, switches) => {
    const rows = Object.keys(switches)
      .sort()
      .map((k) => ({ flagName: k, flagValue: pyStr(switches[k]) }));
    let baseline = null;
    try {
      baseline = switchResolve.resolveModelSwitches(modelId, "", currentClassKey());
    } catch {
      baseline = null; // a baseline failure must not block the save
    }
    stores.getModelTuneStore().replace(modelId, currentHwKey(), rows, baseline);
  };
  const recordMeasurement = (modelId, trial) => {
    const sw = trial.switches || {};
    const rows = Object.keys(sw)
      .sort()
      .map((k) => ({ flagName: k, flagValue: pyStr(sw[k]) }));
    stores.getModelMeasurementStore().record(modelId, {
      machineKey: currentHwKey(),
      source: "autotune",
      label: String(trial.label || ""),
      tokensPerSec: Number(trial.tokensPerSec || 0),
      vramTotalMb: Math.trunc(Number(trial.vramTotalMb || 0)),
      at: Date.now(),
      rows,
    });
  };
  app.route(
    "/",
    makeAutotuneRouter(
      (mid) => switchResolve.resolveModelSwitches(mid, currentHwKey(), currentClassKey()),
      saveTune,
      { recordMeasurement },
    ),
  );
  // The one-minute speed check: Quick setup offers it on hardware with no curated class
  // preset; its result lands via the service's machine-probe recorder.
  app.route("/", makeCalibrateRouter());
}

/**
 * Wire + mount the whole shared LLM stack onto `app` (a Hono app, or null for the headless
 * boot). `db` is the host's database handle (platform/sql.js) — Python took an engine and a
 * session factory. Idempotent table create.
 */
export async function installLlm(
  app,
  {
    db: handle,
    featureCatalog = [],
    featurePrompts = {},
    enginePresets = null,
    featurePresets = null,
    defaultPresetId = "",
    modelCatalogExtra = [],
    // {rowId: {field: [old exact seeded values]}}: a revised seed value of an app's catalog row reaches an install that
    // already has it, while the row still holds an old one (seed.js configureAppSeed — the prompts' featurePromptHeals)
    modelCatalogHeals = null,
    modelTunesSeed = [],
    // the kit runtimes this app turns on besides llama.cpp (["sdcpp"] — runner/runtimes.js): their builds are seeded
    runtimes = [],
    // their models — pinned file sets, e.g. FLUX.2 klein for sd.cpp (seed.seedRuntimeModels)
    runtimeModels = [],
    // the in-process ONNX runtime's module, the APP's onnxruntime-node (the engines plan's D2): `{ load: () =>
    // import("onnxruntime-node"), binDir }` — `binDir` where its native files are (the runtime check looks there)
    onnx = null,
    // `{ <runtime id>: () => a program path, {exe, backend, version}, or null }`: a server program to run instead of the
    // installed build — an app's development build (JustVoice's `npm run dev` runs its audio.cpp checkout's own — round E;
    // its backend from the build's CMake cache, its version "dev · <commit>")
    runtimeExeOverrides = {},
    // `{ <runtime id>: {warm, pieceLength, loadOptionsKey, transcribe, sessionOptions, beforeDownload} }`: a runtime that
    // registers its models (audio.cpp) — the app's warm-up after a load (`warm({server, row, modelId, entries,
    // calibrate})` → whether it calibrated), a model's piece length and its load-option set, both parts of its measured
    // price (runner/speech_placement.js — round E, E5); a transcription request's shaping (`transcribe(body, row)` →
    // `{body, timeout}` — its audio converted, its language named, its time limit in seconds; G1); a model's saved load
    // options (`sessionOptions(row)` → `{option: value}`, read by every load given none; G3); its licence gate
    // (`beforeDownload(row)`, answering at once: throws or returns a problem — a string or `{detail}` — when the user
    // hasn't accepted its terms, and nothing downloads: 403 terms-required; G5)
    runtimeSpeech = {},
    classTunesSeed = [],
    classTuneIdentity = {},
    embedTemplates = [],
    testSamples = null,
    featurePromptHeals = null,
    preferLocalFeatures = null,
    runnerCatalog = true,
    dataDir = null,
    cacheRoot = null,
    product = "",
    allowKeyReveal = false,
    // The host's loaded speech models, [{id, placement: "gpu" | "cpu"}] — the AI model's RAM
    // refusal names them, and after a credit only those on the CPU (RunnerService
    // `speechModelsFn`; JustVoice passes its slots).
    speechModelsFn = null,
  } = {},
) {
  if (!handle) throw new Error("installLlm: pass db (the host's database handle)");
  if (dataDir == null) {
    // Loud, once per install: without a dataDir the engine + every downloaded GGUF land in
    // the user cache, OUTSIDE the app's data root.
    log.warning(
      "installLlm: no dataDir passed — the LLM engine and model downloads will land in the user cache " +
        "(~/.cache/just-llm-runner), outside your app's data root. Pass dataDir unless that is deliberate.",
    );
  }
  await hardware.ensureDetected();
  // 1–4. storage, the app's feature data, the usage ledger, the dispatch config (install_core.js)
  const config = prepareLlm(handle, {
    featureCatalog,
    featurePrompts,
    enginePresets,
    featurePresets,
    defaultPresetId,
    modelCatalogExtra,
    modelCatalogHeals,
    modelTunesSeed,
    runtimes,
    runtimeModels,
    classTunesSeed,
    classTuneIdentity,
    embedTemplates,
    testSamples,
    featurePromptHeals,
    preferLocalFeatures,
    hwKeyFn: currentHwKey,
  });
  // 5. mount every LLM router (skipped for the headless boot).
  if (app) mountLlmRouters(app, { featurePrompts, config, allowKeyReveal, dataDir, product });
  // 6. point the bundled runner's catalog/switches at the shared DB.
  if (runnerCatalog) {
    // the AI model's memory refusal names the speech models loaded (the app's list, else the kit's audio.cpp's own)
    const speechModels =
      speechModelsFn ??
      (runtimes.includes("audiocpp") ? () => (getRuntimeService("audiocpp")?.loaded() ?? []).map((l) => ({ id: l.modelId, placement: l.placement })) : null);
    wireRunnerCatalog(dataDir, { cacheRoot, product, speechModelsFn: speechModels, runtimes, onnx, runtimeExeOverrides, runtimeSpeech });
    // Seed-vs-file self-heal: re-derive catalog facts from ALREADY-DOWNLOADED GGUFs whose
    // rows never got the identify pass. A background task — boot never waits on file reads.
    background(
      "catalog derive-backfill",
      async () => {
        const svc = lifecycle.getService();
        const n = await identity.backfillDerivedFromCache(
          stores.getModelCatalogStore().list(),
          (mid) => svc.cachedPath(mid),
          (mid, path) => identity.detectAndStoreModelType(mid, path),
        );
        if (n) log.info(`catalog derive-backfill: ${n} cached model(s) re-derived`);
      },
      log,
    );
  }
}

/**
 * Where the engine + model cache lives, and where THIS app's generated engine state lives:
 * `[cacheRoot, runtimeRoot, shared]` (null = the runner's own default). An explicit argument
 * beats the stored choice, which beats `<dataDir>/ai-cache`. The cache may be shared (hf
 * weights and llama.cpp builds are content-addressed); what an app GENERATES (models.ini,
 * spawn logs) never is — it goes under the app's own data dir whenever the cache is shared.
 */
export function resolveCacheRoots(dataDir = null, cacheRoot = null, stored = "") {
  // Paths as Python's `str(Path(...))` writes them; equal as WindowsPath compares them
  // (case-insensitive, either separator) on Windows.
  const own = dataDir ? joinPath(dataDir, "ai-cache") : null;
  const chosen = cacheRoot || stored || null;
  const root = chosen ? cacheRegistry.pyPath(String(chosen)) : own;
  const same = (a, b) => (process.platform === "win32" ? a.toLowerCase() === b.toLowerCase() : a === b);
  const shared = !!(root && own && !same(root, own));
  const runtime = shared && dataDir ? joinPath(dataDir, "ai-runtime") : null;
  return [root, runtime, shared];
}

function joinPath(a, b) {
  return cacheRegistry.pyPath(nodePath.join(String(a), b));
}

/**
 * Another family app's cache that holds finished models, when this app's own holds none —
 * the most models, then the most bytes; "" when there is none.
 */
export function siblingCacheWithModels(dataDir) {
  const own = joinPath(dataDir, "ai-cache");
  try {
    if (cacheRegistry.summarize(own).models.length) return "";
    const found = cacheRegistry.discover([own]).filter((o) => o.exists && o.models?.length);
    if (!found.length) return "";
    let best = found[0];
    for (const o of found.slice(1)) {
      const k = [o.models.length, o.bytes || 0];
      const b = [best.models.length, best.bytes || 0];
      if (k[0] > b[0] || (k[0] === b[0] && k[1] > b[1])) best = o;
    }
    return String(best.root);
  } catch (e) {
    log.warning("engine cache: could not read the family registry", e);
    return "";
  }
}

/** Point the bundled runner at the shared DB: catalog, switches, config, the cache. */
export function wireRunnerCatalog(
  dataDir = null,
  { cacheRoot = null, product = "", speechModelsFn = null, runtimes = [], onnx = null, runtimeExeOverrides = {}, runtimeSpeech = {} } = {},
) {
  const catalogFn = () =>
    stores
      .getModelCatalogStore()
      .list()
      .map((r) => ({
        id: r.id,
        name: r.name,
        tier: r.tier,
        candidateFor: [],
        hfRepo: r.hfRepo,
        quant: r.quant,
        mmproj: r.mmproj,
        totalParams: r.totalParams || null,
        activeParams: r.activeParams || null,
        mtp: r.mtp,
        pooling: r.pooling,
        embedding: r.embedding,
        mtpDraftRepo: r.mtpDraftRepo,
        mtpDraftFile: r.mtpDraftFile,
        mtpDraftQuant: r.mtpDraftQuant,
        minRamMb: r.minRamMb,
        recommendedFor: { minVramMb: r.minVramMb, estVramMb: r.estVramMb },
        sizeBytes: r.sizeBytes,
        trainedCtx: r.trainedCtx,
        experts: r.experts || 0,
        physicsFacts: r.physicsFacts,
      }));
  const embeddingIdsFn = () => {
    // The catalog id the routing default points at the bundled runner as the embedding
    // provider — that .ini section gets `embeddings = true` and is pinned resident.
    const d = stores.getRoutingStore().getRouting().default;
    return d.embeddingId === "local-llamacpp" && d.embeddingModel ? new Set([d.embeddingModel]) : new Set();
  };
  const defaultLlmIdFn = () => {
    // The chat default on the bundled runner — the embed CPU-placement guarantee's baseline.
    const d = stores.getRoutingStore().getRouting().default;
    return d.llmId === "local-llamacpp" && d.model ? d.model : "";
  };
  const switchesFn = (modelId) => switchResolve.resolveModelSwitches(modelId, currentHwKey(), currentClassKey());
  const identifyFn = async (modelId, ggufPath) => {
    const { fetchGenerationConfigSamplers } = await import("../runner/gguf_remote.js");
    return identity.detectAndStoreModelType(modelId, ggufPath, {
      samplersFallback: (meta) => fetchGenerationConfigSamplers(meta.baseRepoUrl),
    });
  };

  // The user's stored choice of cache. Best-effort: a DB that can't answer must not stop a
  // boot — fall back to own.
  let stored = "";
  let chosen = true;
  try {
    stored = stores.getRunnerConfigStore().getCacheRoot();
    chosen = stores.getRunnerConfigStore().cacheRootChosen();
  } catch {
    stored = "";
    chosen = true;
  }
  // Nothing ever chosen (a fresh or reset database) and this app's own cache holds no
  // models: share a sibling app's that does, and save the choice (decided 2026-10-06: no
  // choice saved and a sibling's cache holds models → use it and save the choice; "and this
  // app's own cache holds none" was the implementer's, kept by the user's word on 2026-10-13 —
  // the narrowings review K5).
  if (!cacheRoot && !chosen && dataDir) {
    const sibling = siblingCacheWithModels(dataDir);
    if (sibling) {
      stored = sibling;
      try {
        stores.getRunnerConfigStore().setCacheRoot(sibling);
      } catch (e) {
        log.warning("engine cache: could not save the shared choice", e);
      }
      log.info(`engine cache: none chosen and this app's own holds no models — sharing ${sibling}, which does`);
    }
  }
  const [resolvedCache, runtimeRoot, shared] = resolveCacheRoots(dataDir, cacheRoot, stored);
  if (shared) log.info(`engine cache SHARED at ${resolvedCache} (this app's generated state stays in ${runtimeRoot})`);
  if (resolvedCache && dataDir) {
    // Tell the rest of the family where this app keeps its cache (a path, never contents), and which engine builds it
    // uses — what another app's update or uninstall keeps in a shared cache (2026-10-29)
    let builds = null;
    try {
      const store = stores.getRunnerConfigStore();
      builds = { llamacpp: stores.buildRunnerConfig().llamacpp.pinnedBuild };
      for (const id of runtimes || []) {
        const folder = runtimeOf(id)?.folder;
        const pin = folder && store.getRuntimeConfig(id)?.pinnedBuild;
        if (pin) builds[folder] = pin;
      }
    } catch (e) {
      log.warning("engine cache: the builds this app uses couldn't be read for the family registry", e);
    }
    cacheRegistry.register(product || baseName(dataDir), resolvedCache, dataDir, builds);
  }

  const recordProbe = (gbps, machineKeyStr, modelId, label) =>
    stores.getModelMeasurementStore().record(modelId, {
      machineKey: machineKeyStr,
      source: "probe",
      label,
      tokensPerSec: Number(gbps),
      vramTotalMb: 0,
      at: Date.now(),
      rows: [],
    });
  const recordLoad = (modelId, { vramModelMb = 0, switches, source, label, ramModelMb = 0 }) => {
    const store = stores.getModelMeasurementStore();
    const sw = switches || {};
    const rows = Object.keys(sw)
      .sort()
      .map((k) => ({ flagName: k, flagValue: pyStr(sw[k]) }));
    store.record(modelId, {
      machineKey: currentHwKey(),
      source,
      label,
      tokensPerSec: 0.0,
      vramTotalMb: 0,
      at: Date.now(),
      rows,
      vramModelMb: Math.trunc(vramModelMb),
      kind: "llm",
      ramModelMb: Math.trunc(ramModelMb),
    });
    store.pruneLoadRows(modelId, currentHwKey(), stores.listFitRelevantFlags(), stores.loadRowsKeep(), source);
  };

  lifecycle.configureService({
    catalogFn,
    switchesFn,
    identifyFn,
    embeddingIdsFn,
    defaultLlmIdFn,
    configFn: stores.buildRunnerConfig,
    cacheRoot: resolvedCache ? String(resolvedCache) : null,
    runtimeRoot: runtimeRoot ? String(runtimeRoot) : null,
    knobBackendsFn: stores.listKnobBackends,
    measurementsFn: () => stores.getModelMeasurementStore().list(null),
    classBwFn: (key) => stores.getHardwareClassStore().bwFor(key),
    recordProbeFn: recordProbe,
    recordLoadFn: recordLoad,
    fitRelevantFlagsFn: stores.listFitRelevantFlags,
    speechModelsFn,
  });
  // One engine service per kit runtime the app turned on (runner/runtime_service.js), in the same engine cache; its
  // server's log beside llama-server's spawn logs (Storage's one bucket), its generated files in this app's own root.
  const generated = runtimeRoot ? String(runtimeRoot) : nodePath.join(String(resolvedCache), "llamacpp");
  configureRuntimeServices(
    (runtimes || []).map((id) => [
      id,
      new RuntimeService({
        id,
        cacheRoot: String(resolvedCache),
        configFn: () => stores.getRunnerConfigStore().getRuntimeConfig(id),
        probeArgvs: RUNTIME_PROBES[id] ?? null,
        modelsFn: () => stores.getRunnerConfigStore().listRuntimeModels(id),
        server: RUNTIME_SERVERS[id] ?? null,
        logDir: nodePath.join(generated, "logs"),
        stateDir: generated,
        // the one measurement ledger every kind writes and reads (speed bands, measured beating predicted)
        measurements: stores.getModelMeasurementStore(),
        // an in-process runtime's engine: the app's module
        ort: id === "onnx" ? onnx : null,
        exeOverride: runtimeExeOverrides?.[id] ?? null,
        speech: runtimeSpeech?.[id] ?? {},
        // the user's Auto / GPU / CPU per model, saved as runner settings (round E, G2)
        placementChoices: {
          get: (modelId) => stores.getRunnerConfigStore().getSetting(placementKey(id, modelId)),
          set: (modelId, choice) => stores.getRunnerConfigStore().setSetting(placementKey(id, modelId), choice),
        },
      }),
    ]),
  );

  // A run routed to the bundled runner makes its model resident BEFORE dispatch.
  dispatch.setEnsureLocalModel((modelId) => lifecycle.getService().ensureModelReady(modelId));
  // WHERE that model answers: the router binds a free port at spawn, so the adapter asks
  // the live service per request rather than trust the stored baseUrl.
  dispatch.setLocalRunnerBaseUrl(() => lifecycle.getService().routerUrl());
  // The ACTIVE engine family reaches the llm-side tune layers.
  switchResolve.setActiveBackendFn(() => lifecycle.getService()._activeBackend());
  // The llm-busy guard: a local-runner chat/stream marks the arbiter's llm kind busy for its
  // whole duration, so a cross-kind admission can never evict the model mid-run.
  dispatch.setLocalBusyGuard(() => {
    const arb = runnerArbiter.getArbiter();
    arb.busyBegin("llm");
    return () => arb.busyEnd("llm");
  });
}

function baseName(p) {
  const parts = String(p).split(/[\\/]+/).filter(Boolean);
  return parts[parts.length - 1] || String(p);
}
