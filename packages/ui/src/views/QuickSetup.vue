<script setup>
// SPDX-License-Identifier: MIT
// Shared Quick Setup — the intuitive FRONT DOOR for local models. A modal wizard
// (detect → confirm → apply → done) that picks ONE good model that fits your box and
// wires it as the shared default across every task, plus the always-on embedding.
//
// How the pick works (the §10 speed-floor rule — modelPick.js): it joins the runner's live
// Fit (/v1/llm-runner/models — VRAM/RAM gated, re-scorable for another card) with the
// catalog's `type` (dense|moe) + quality order (/v1/ai/model-catalog, qualityRank LOWER =
// better) and takes the most capable model that still streams faster than you read — a dense
// model fully on the GPU, or a usable A3B-MoE offload — excluding the slow dense-partial-
// offload, the embedding model (by the catalog `embedding` flag), and use-limited licenses.
// The embedding is the catalog's embed model; it rides routing.default.
//
// Apply (the one-source preset model — 2026-07-15): the chosen model is written onto every
// preset the features point at (/v1/ai/engine-presets) that still points at the PREVIOUS
// shared default — NON-CLOBBER: a preset the user re-pointed (Routing by feature) keeps its
// own model. Each preset keeps its settings (top_p / samplers / reasoning); only `.model`
// changes. The embedding is set via /v1/ai/routing; then the chosen model is downloaded
// (if needed) + loaded as the active one.
//
// JustWrite mounts this kit view; JustVoice has its own (TTS) setup wizard. It replaces the
// old jobs-based wiring (/v1/ai/jobs + a routing `jobs` map — both long retired).
import { computed, onBeforeUnmount, onMounted, ref, watch } from "vue";
import { useI18n } from "vue-i18n";

import { request } from "../client.js";
import { useHardware } from "../composables/useHardware.js";
import { listClassTunes } from "../classTunes.js";
import { useCatalogMeta } from "../composables/useCatalogMeta.js";
import { recommendedModelId, pickBestEmbedId, pickByClassConfig, catalogState, speedFloorOf, FIT_GPU, FIT_RUNNABLE, fitLabel } from "../common/services/modelPick.js";
import { fmtBytes } from "../common/services/downloadRate.js";
import { applyPreview, currentDefaultId, currentDefaultProviderId, modelHasTunes, refreshApplied, setAsDefault, setAsEmbedding, LOCAL_RUNNER_ID } from "../services/modelApply.js";
import { confirmDialog } from "../common/services/dialog.js";
import { fmtTps } from "../common/services/runStats.js";
import { createDownloadTask, engineInstallChannel, modelDownloadChannel, modelLoadChannel } from "../composables/useDownloadTask.js";
import { refresh as refreshRunnerModels } from "../composables/useRunnerModels.js";
import { recordMeasurement } from "../measurements.js";
import { quickSetupApplied } from "../services/quickSetupApplied.js";
import { llmUiCapabilities } from "../installLlmUi.js";
import UiButton from "../common/components/UiButton.vue";
import UiSelect from "../common/components/UiSelect.vue";
import UiProgress from "../common/components/UiProgress.vue";
import AppModal from "../common/components/AppModal.vue";
import DownloadBar from "../common/components/DownloadBar.vue";
import { presetDisplayName } from "../services/seededWords.js";

const emit = defineEmits(["changed", "closed"]);
// inline (user, 2026-07-06: "the orginal text to be to th right of the button" · "quick setup
// button so people know what it does" · "leave out the all editable"): render the Run button
// PLUS its one-line description to the right, bare (no card), for embedding on the Built-in
// server card. ROUND 4 first shipped this as a button ONLY; the user restored the caption.
// Default (unset) keeps the full titled strip for other mounts.
const props = defineProps({ inline: { type: Boolean, default: false } });

// LOCAL_RUNNER_ID (modelApply) + fitLabel / FIT_RUNNABLE (modelPick) come from the shared kit
// — ONE source, no drift.

// ── modal + wizard state ────────────────────────────────────────────────────
const open = ref(false);
const step = ref("detect"); // detect | confirm | apply | done
const loading = ref(true);
const error = ref("");

// The kit's words (kit.quickSetup.*) in the app's language — an app rewords its voice (band
// captions, the model hint, roles, the done line) with its own kit.quickSetup.* keys — plus what
// the host's stack can do: the surgery seams (2026-08-04) that let the fork die.
const { t, n } = useI18n();
// The line after setup is an app's own (JustVoice's): the kit's catalog has it empty, so it
// shows only when the app's catalog sets kit.quickSetup.doneBody.
const doneBody = computed(() => t("kit.quickSetup.doneBody"));
const embedsOn = llmUiCapabilities().embeddings !== false;

// ── The configured-state truth (decision A1190, restored + built 2026-08-04):
// with a default already applied, the band stops pitching like a first run
// ("Local AI is set up — <model> is the default · Re-run Quick Setup") and the
// wizard opens on an "Already set up" screen offering only change-model or close.
// The manual door stays — it just tells the truth about the state.
const configured = computed(() => !!currentDefaultProviderId.value);
const configuredBandLine = computed(() =>
  t("kit.quickSetup.configuredBand", { model: currentDefaultId.value || t("kit.quickSetup.aModel") }));
onMounted(() => { refreshApplied().catch(() => {}); });

// ── THE CACHE QUESTION (family behavior, ported from the docgen fork 2026-08-04 —
// the server half was already shared: /v1/ai/engine-cache). Two family apps each
// kept their own <data>/ai-cache, so the SAME multi-GB model sat on one PC twice.
// The engine + weights are content-addressed: a sibling's cache IS the bytes we
// were about to download. Detect it, ASK, let the answer be no — asked HERE
// because the only moment it saves anything is before the download starts.
const cacheState = ref(null);
const cacheChoice = ref("");       // the root to use; "" = this app's own
const cacheNote = ref("");
// Worth asking only when a sibling actually has MODELS. Engine builds alone don't
// qualify (2026-08-08): a surviving smoke-gate scratch in %TEMP% held nothing but an
// engine, was offered here as "JustWrite Server already has the engine", pre-selected,
// and one proceed click repointed a full install's cache at a Temp dir — the wizard's
// question exists to skip model downloads, and a cache with none to offer can't.
// Never this app's OWN cache (2026-10-06): when the cache in use is a sibling's, the
// server lists "this app" among the options as the way back — and a leftover folder
// there made it look like a cache with models, so the "share" pick chose the app's own
// empty folder and the model downloaded again. Sharing means ANOTHER app's files.
// Already on another app's cache — startup takes one by itself when nothing is chosen
// (2026-10-06) — that cache is the offer, picked, so "Keep a separate copy" stays one
// choice away instead of the question vanishing.
const cacheOffer = computed(() => {
  const st = cacheState.value;
  if (st?.shared && st.current?.models?.length) return { ...st.current, root: st.root };
  return (st?.options || []).find(
    (o) => o.exists && o.models?.length && o.root !== st?.ownRoot,
  ) || null;
});
function fmtCacheBytes(bytes) {
  const units = ["B", "KB", "MB", "GB", "TB"];
  let i = 0;
  let v = bytes || 0;
  while (v >= 1024 && i < units.length - 1) { v /= 1024; i += 1; }
  const digits = v >= 10 || !v ? 0 : 1;
  return `${n(v, { minimumFractionDigits: digits, maximumFractionDigits: digits, useGrouping: false })} ${units[i]}`;
}
const cacheOptions = computed(() => {
  const o = cacheOffer.value;
  if (!o) return [];
  const who = o.product || t("kit.quickSetup.cache.anotherApp");
  return [
    { label: t("kit.quickSetup.cache.share", { who, size: fmtCacheBytes(o.bytes || 0) }), value: o.root },
    { label: t("kit.quickSetup.cache.keepSeparate"), value: cacheState.value?.ownRoot || "" },
  ];
});
// Applied the moment it is chosen (switching re-points the idle engine so the model
// list tells the truth about what still downloads). Driven by the select's EVENT,
// never a watcher: priming pre-selects the recommendation, and a watcher couldn't
// tell that assignment from a click.
async function onCacheChoice(root) {
  cacheChoice.value = root;
  if (engineTask.state === "running" || chatTask.state === "running") return;
  await applyCacheChoice(root);
}
async function applyCacheChoice(root) {
  const st = cacheState.value;
  // Nothing to do only when the cache is already in use AND recorded. In use but not
  // recorded still saves (2026-10-06): a factory reset clears the record while the
  // engine keeps running on the shared cache, so keeping it without saving sent the
  // next start back to this app's own folder — and the model downloaded again.
  const recorded = st?.stored || st?.ownRoot || "";
  if (!root || (root === st?.root && root === recorded)) return;
  const inUse = root === st?.root;
  cacheNote.value = "";
  try {
    const res = await request("/v1/ai/engine-cache", { method: "PUT", body: { root } });
    if (res?.restartRequired && !inUse) {
      cacheNote.value = res.detail || t("kit.quickSetup.cache.nextStart");
    }
    await Promise.all([loadAll(), refreshCatalogMeta()]);
    cacheState.value = await request("/v1/ai/engine-cache").catch(() => cacheState.value);
  } catch (e) {
    cacheNote.value = t("kit.quickSetup.cache.switchFailed", { error: e?.message || e });
  }
}

// The box probe, SHARED (2026-07-27). `mainGpu` is the LARGEST GPU — the server's own
// rule (hardware.py:45); the two `gpus[0]` reads this file used to make scored the
// wizard against the iGPU on any laptop that enumerates it first.
const { hardwareInfo: hw, mainGpu, maxVramMb, refresh: refreshHardware } = useHardware();
const models = ref([]);
// The "Plan for card" what-if selector was REMOVED (model-per-hardware plan Phase 2,
// user decision #7): the wizard configures THIS machine — Apply always lands on the real
// box, so a config planned for a hypothetical card never matched where it ran. The
// hardware-class question moved to data (the class→model map); the server's vram_mb
// query param survives for the power-user catalog view.

// Editable pick: the one good LLM (`default`) + the embedding provider/model.
// Pre-filled from Fit × quality, the default is overridable in the confirm step.
const pick = ref({ default: "", embeddingId: "", embeddingModel: "" });

// QuickSetup is LOCAL-ONLY (user decision 2026-07-06, reversing the 2026-07-05 other-provider
// option): it configures the bundled runner and nothing else. External providers (Ollama /
// LM Studio / cloud) are set up on the provider list (ProviderForm), never in this wizard.

// ── catalog meta (by id) — quality order + type + embedding + use-limited + description ──
// The /v1/llm-runner/models view is fit-shaped and carries none of these; the catalog does.
// `type` (dense|moe) + `embedding` drive the §10 speed-floor pick. Shared with LuModelCatalog
// through the useCatalogMeta singleton (one source, no drift — the useRunnerModels precedent).
const { classTuneRefs, myClassKey, qualityById, typeById, embeddingById, useLimitedById, descriptionById, minVramById, estVramById, tierById, refresh: refreshCatalogMeta } = useCatalogMeta();
function qualityOf(m) { return qualityById.value[m.id] ?? 100; }
function typeOf(m) { return typeById.value[m.id] || "dense"; }
function useLimitedOf(m) { return !!useLimitedById.value[m.id]; }
function descriptionOf(id) { return descriptionById.value[id] || ""; }
function minVramOf(m) { return minVramById.value[m.id] || 0; }
function tierOf(m) { return tierById.value[m.id] || "mid"; }
// Embedding models are excluded from the LLM auto-pick + the model dropdown. The explicit
// catalog `embedding` flag is authoritative (bge-m3 has no "embed" in its name); the name
// regex stays as a fallback for a user-added embed not yet flagged.
function isEmbed(m) {
  return embeddingById.value[m.id] === true || /embed/i.test(m.id || "") || /embed/i.test(m.name || "");
}

// ── derived ─────────────────────────────────────────────────────────────────
function paramsNum(p) {
  const n = Number.parseFloat(String(p || "").replace(/[^0-9.]/g, ""));
  return Number.isFinite(n) ? n : 999;
}
// CHAT candidates need a GPU (user, 2026-07-06 — CPU prose is too slow to support);
// this feeds the RECOMMENDATION only (embedOptions below lists everything — §8.23).
const fitting = computed(() =>
  models.value
    .filter((m) => !isEmbed(m) && FIT_GPU.has(m.fit))
    .sort((a, b) => paramsNum(a.params) - paramsNum(b.params)),
);
const modelById = computed(() => Object.fromEntries(models.value.map((m) => [m.id, m])));
// One <option> per catalog LLM (embedding excluded — it has its own line), Fit annotated,
// so the default can be overridden to any model.
const modelOptions = computed(() =>
  models.value
    .filter((m) => !isEmbed(m))
    .map((m) => ({
      value: m.id,
      label: `${m.name} · ${fitLabel(m.fit)}${m.params ? ` · ${m.params}` : ""}`,
    })),
);
// The editable embedding dropdown lists EVERY embed — the fit veto came out of
// all pickers (fit-redesign §8.23, user 2026-08-13: "a user should always be
// able to run any model they want"); a non-runnable row says so on its label
// instead of vanishing. The DEFAULT pick (pickBestEmbedId) still prefers what
// fits — a recommendation, not a gate.
const embedOptions = computed(() =>
  models.value.filter((m) => isEmbed(m)).map((m) => ({
    value: m.id,
    label: `${m.name}${m.params ? ` · ${m.params}` : ""}${FIT_RUNNABLE.has(m.fit) ? "" : ` · ${fitLabel(m.fit)}`}`,
  })),
);
// The DEFAULT embed pick (#274, the user's confirmed rule): the most capable embedding
// that fits what's LEFT of the card after the chat pick — the two co-reside, so the raw
// card is the wrong fit input (the 8GB/8B bug). CPU-band embeds always qualify (the
// ROUND-4 law — deliberately CPU on the user's own box). The rule lives ONCE in
// modelPick.js; the catalog's recommendedEmbedId calls the same function.
// The wizard's leftover baseline is the chat pick's CLAIM — est_vram (what it wants)
// over min_vram (its bare floor) — 2026-07-25, matching the loader's own
// `_embed_gpu_leftover_mb` semantics so the pick and the load can't disagree.
function wizardLeftoverMb() {
  const cardMb = maxVramMb.value;
  const claim = estVramById.value[pick.value.default] || minVramById.value[pick.value.default] || 0;
  return Math.max(0, cardMb - claim);
}
function bestEmbedId() {
  return pickBestEmbedId(models.value, { leftoverMb: wizardLeftoverMb(), qualityOf, isEmbed, minVramOf, tierOf });
}
function onEmbedChange() { pick.value.embeddingId = LOCAL_RUNNER_ID; } // all embed options are local
// Where the SELECTED embed will actually run beside the wizard's chat pick (the
// honest-placement line, 2026-07-25): same rule shape as the loader — CPU-tier
// never claims the GPU; others only when their floor fits the leftover.
const embedPlaceLine = computed(() => {
  const id = pick.value.embeddingModel;
  if (!id) return "";
  const cardMb = maxVramMb.value;
  const gpuOk = cardMb > 0 && tierById.value[id] !== "cpu"
    && (minVramById.value[id] || 0) > 0 && minVramById.value[id] <= wizardLeftoverMb();
  return gpuOk
    ? t("kit.quickSetup.embed.onGpu")
    : t("kit.quickSetup.embed.onCpu");
});

const embedName = computed(() => {
  const e = models.value.find((m) => m.id === pick.value.embeddingModel);
  return e?.name || pick.value.embeddingModel || "";
});

const hwLine = computed(() => {
  const h = hw.value;
  if (!h) return "";
  const g = mainGpu.value;
  const vram = g?.vramMb ? ` · ${t("kit.quickSetup.hw.vram", { gb: Math.round(g.vramMb / 1024) })}` : "";
  const ram = h.ramMb ? ` · ${t("kit.quickSetup.hw.ram", { gb: Math.round(h.ramMb / 1024) })}` : "";
  const os = h.platform ? ` · ${h.platform}` : "";
  return `${g ? g.name : t("kit.quickSetup.hw.cpuOnly")}${vram}${ram}${os}`;
});
function fitOf(id) {
  return modelById.value[id]?.fit || "unknown";
}

// The one good LLM — the §10 speed-floor pick ("most capable that still streams faster than
// you read"): among the runnable, non-embedding, non-use-limited models, prefer the ones
// fast enough (a dense model fully on GPU, or a usable A3B-MoE offload), excluding the slow
// dense-partial-offload, and rank by quality_rank; fall back to best-runnable if none clear
// the floor. The pure rule lives in modelPick.js (Node-verifiable); here we bind the
// catalog-join accessors (type / quality / embedding / use-limited).
function bestFittingId() {
  // Delegates to the ONE composed rule in modelPick.js (a class CONFIG for this
  // box's class first — §9, 2026-07-22 — then the §10 speed-floor fallback); the
  // catalog's "Recommended for this PC" badge calls the same function, so the
  // wizard and the badge can never disagree.
  return recommendedModelId(fitting.value, {
    classTuneRefs: classTuneRefs.value,
    myClassKey: myClassKey.value,
    typeOf,
    qualityOf,
    isEmbed,
    isUseLimited: useLimitedOf,
    runnable: FIT_GPU, // chat picks never land on a CPU-spill model (user decision)
    speedFloor: speedFloor.value, // the fallback's speed floor (speed-truth plan §7)
  });
}
// band_fine_toks × (1 − speed_floor_grace) from the /models payload root — the
// catalog badge reads the same two fields, so wizard and badge cannot disagree.
const speedFloor = ref(0);

// Apply is enabled once there's a fitting local pick; a box with nothing that fits
// stays disabled (the empty-state points at a bigger card / a smaller model).
const applyDisabled = computed(() => !fitting.value.length || !pick.value.default);

// Which no-model branch renders (decision ④, 2026-08-05 — the pure rule in
// modelPick.js): "empty" = this app seeds no chat rows at all (a REAL state now
// that the shared catalog ships empty), "none-fit" = rows exist but this machine
// can't run them. The two need different words — the no-fit copy blames the
// hardware, which is a lie on an empty catalog.
const catState = computed(() => catalogState(models.value, { isEmbed }));

// A friendly verdict headline (the LocalProse-comparison review, 2026-07-19): derived from
// the REAL fit of the picked model so it never overpromises — a full-GPU fit reads "the full
// setup", a tight offload says so. Empty when nothing fits (the no-GPU empty state owns that
// case). NOT a word-count/context claim: the honest figure is the EFFECTIVE ctx (tuned per
// box), which the wizard doesn't carry — the catalog's trained 256k would mislead.
const fitVerdict = computed(() => {
  if (!fitting.value.length || !pick.value.default) return "";
  const f = fitOf(pick.value.default);
  if (f === "ok") return t("kit.quickSetup.verdict.ok");
  if (f === "tight") return t("kit.quickSetup.verdict.tight");
  return "";
});
// Only surface the QAT "good to know" when the PICK is actually a QAT model (the description
// carries the "QAT" tag) — the ladder is QAT-first, but a non-QAT pick (Llama-70B, a MoE)
// must not get a false claim. Honest-truth rule (design-conformance §5).
const isQatPick = computed(() => /\bQAT\b/i.test(descriptionOf(pick.value.default) || ""));

// ── load hardware + catalog (optionally for an overridden card) ──────────────
async function loadAll() {
  loading.value = true;
  error.value = "";
  try {
    const [, m] = await Promise.all([
      refreshHardware(),
      request("/v1/llm-runner/models"),
      refreshCatalogMeta(), // shared catalog-meta maps (quality / use-limited / description)
    ]);
    models.value = m.models || [];
    speedFloor.value = speedFloorOf(m);
    prefillPick();
  } catch (e) {
    error.value = t("kit.quickSetup.err.readHardware", { error: e.message });
  } finally {
    loading.value = false;
  }
}

// Pre-fill the chat default (the class-map/§10 pick). Never overwrites a value already
// set. The EMBED prefill deliberately does NOT happen here (#274 pass-3 find): openWizard's
// reconcile below can swap the chat default to the APPLIED model, and the embed pick now
// depends on the chat pick's leftover — so the embed fills only after the chat is final.
function prefillPick() {
  if (!pick.value.default) pick.value.default = bestFittingId();
}

// A routing-saved embedding is the user's choice and wins — openWizard's post-reconcile
// auto-fill only runs when routing carried none (or a dead reference).
async function loadRouting() {
  try {
    const r = await request("/v1/ai/routing");
    if (r.default?.embeddingId) pick.value.embeddingId = r.default.embeddingId;
    if (r.default?.embeddingModel) pick.value.embeddingModel = r.default.embeddingModel;
  } catch {
    /* routing may be empty on a fresh install — keep the pre-filled best-fit embed default */
  }
}

// Is the llama.cpp engine already installed on this box? Drives whether Apply shows the
// engine bar first (user, 2026-07-15: "if engine is not installed … first user interaction
// will be quick setup we need same type of progress bar cancel"). Fetched at openWizard.
const engineInstalled = ref(true); // assume present until the status fetch says otherwise
const engineNeeded = computed(() => !engineInstalled.value);
async function loadEngineStatus() {
  try {
    const es = await request("/v1/llm-runner/engine/status");
    engineInstalled.value = !!es.installed;
  } catch {
    engineInstalled.value = true; // unknown → don't show a spurious engine step
  }
}

// ── open / close ────────────────────────────────────────────────────────────
// The detect phase's own deadline (2026-07-26). It bounds the WHOLE load rather than
// each fetch, so it holds no matter which call stalls — including refreshCatalogMeta,
// which this file doesn't own. 20s is generous for a cold GPU probe on a slow box;
// past that the honest answer is an error the user can act on, not a spinner.
const DETECT_TIMEOUT_MS = 20000;

async function openWizard() {
  open.value = true;
  step.value = "detect";
  pick.value = { default: "", embeddingId: "", embeddingModel: "" };
  previewState.value = null;
  optState.value = null;
  tunedAlready.value = false;
  classTuned.value = false;
  optQuick.value = false;
  calState.value = null;
  embedAutoFilled = false;
  // THE SPINNER MUST ALWAYS END (2026-07-26 — reported stuck on "Probing your hardware…"
  // after a workspace reset). The step advance used to be this function's LAST statement,
  // so anything that threw in the reconcile below, or any request that never settled,
  // pinned the modal on `detect` forever — and silently, because the error banner only
  // renders once `confirm` is reached. Three guards, each closing one hole: the race
  // bounds a hang, the catch records WHY, and the finally guarantees the step advances
  // so whatever went wrong is actually readable. Every loader already swallows its own
  // rejection, so the catch here is for the reconcile and the deadline.
  try {
    await Promise.race([
      Promise.all([
        loadAll(),
        loadRouting(),
        loadEngineStatus(),
        // The family cache-offer (surgery 2026-08-04): primed WITH everything else
        // so the confirm step can ask before anything downloads.
        request("/v1/ai/engine-cache")
          .then((c) => { cacheState.value = c; })
          .catch(() => { cacheState.value = null; }),
        // D4-1 (a)+(c): the change preview — computed by the SAME dominantOf the Apply
        // writer uses (modelApply.applyPreview), so the changelist can never drift.
        applyPreview().then((p) => { previewState.value = p; }).catch(() => { previewState.value = null; }),
      ]),
      new Promise((_, reject) => setTimeout(
        () => reject(new Error(t("kit.quickSetup.err.serverSilent", { s: Math.round(DETECT_TIMEOUT_MS / 1000) }))),
        DETECT_TIMEOUT_MS,
      )),
    ]);
    // Reconcile AFTER all resolve (order-safe — the catalog is loaded here):
    // 1. The wizard opens ON the applied setup (user, 2026-07-06: "if model is already
    //    applied then drop down should select that model") — the dropdown starts at the
    //    CURRENT default when it still exists in the catalog, so re-opening the wizard
    //    proposes NO change; the recommendation is only the fresh-box/fallback pick.
    // 2. Dead references never preselect (a deleted model must not be silently kept —
    //    the round-2 dangling-refs honesty): a routing embed pointing at a model no
    //    longer in the catalog falls back to the best fitting embed, or none.
    const dom = previewState.value?.dominant;
    if (dom && modelById.value[dom]) pick.value.default = dom;
    // 3. The embed default fills LAST, once the chat default above is FINAL (#274: the
    //    pick fits the card's leftover beside the chat model, so it must see the model
    //    that will actually run). A routing-saved embed that still exists is the user's
    //    choice and is kept; empty or dead → the leftover-aware best pick.
    if (pick.value.embeddingModel && !modelById.value[pick.value.embeddingModel]) {
      pick.value.embeddingId = "";
      pick.value.embeddingModel = "";
    }
    if (embedsOn && !pick.value.embeddingModel) {
      const best = bestEmbedId();
      if (best) {
        pick.value.embeddingId = LOCAL_RUNNER_ID;
        pick.value.embeddingModel = best;
        embedAutoFilled = true; // ours to re-fit if the speed check moves the chat pick
      }
    }
    // Sharing is the recommendation when there is something to share — the option
    // that does NOT download gigabytes this PC already has. The other option is
    // right there: the ask-don't-decide half of the ruling.
    cacheChoice.value = cacheOffer.value?.root || cacheState.value?.root || "";
  } catch (e) {
    // Don't overwrite a more specific message a loader already recorded.
    if (!error.value) error.value = t("kit.quickSetup.err.readSetup", { error: e.message });
  } finally {
    // A configured box lands on the truth screen, not the pitch; everything else
    // (including errors) lands on confirm, which renders the empty-state — unless
    // the one-minute speed check applies, which is offered first (it can change
    // the recommendation the confirm screen shows). offerSpeedCheck never throws.
    let next = (!error.value && configured.value) ? "configured" : "confirm";
    if (next === "confirm" && !error.value && (await offerSpeedCheck())) next = "calibrate";
    step.value = next;
  }
}

// ── The one-minute speed check (speed-truth plan 2026-09-19 §6) ─────────────
// On hardware with NO curated class preset the recommendation is estimate-
// driven end to end, and the estimate's RAM term was measured ~3× pessimistic
// on the author's box (plan §11.4). The check runs llama.cpp itself on a small
// test model and records this machine's real expert-streaming speed, which the
// speed predictions then use. User ruling 2026-09-19: "present it to them
// clearly what this is, why it is recommended, and allow them to skip". Never
// offered where a class preset matched — there it could not change the pick
// (`pickByClassConfig` wins first) — nor where the server says it doesn't apply
// (one-pool machines), nor once this machine has been measured on this engine.
const calState = ref(null); // the GET /v1/llm-runner/calibrate payload
let calTimer = null;
let embedAutoFilled = false; // openWizard filled the embed itself (not routing)
const calRunning = computed(() => calState.value?.status === "running");
const calBody = computed(() => t("kit.quickSetup.checkBody", { size: fmtBytes(calState.value?.sizeBytes || 0) }));
const calProgressLabel = computed(() => calState.value?.detail || t("kit.quickSetup.check.starting"));

function isCuratedBox() {
  return !!pickByClassConfig(classTuneRefs.value, myClassKey.value, fitting.value, {
    fitSet: FIT_GPU, qualityOf, isEmbed, isUseLimited: useLimitedOf,
  });
}
async function offerSpeedCheck() {
  if (!fitting.value.length || isCuratedBox()) return false;
  try {
    const st = await request("/v1/llm-runner/calibrate");
    calState.value = st;
    if (st.status === "running") { startCalPoll(); return true; } // adopt a run in flight
    return !!(st.mode && st.configured && !st.measuredGbps);
  } catch {
    return false; // an older server without the endpoint — the wizard is unchanged
  }
}
async function runSpeedCheck() {
  // The check measures with the engine the app will actually use, so it needs
  // the engine installed; the server job waits for it while this bar installs it.
  if (engineNeeded.value && engineTask.state !== "running" && engineTask.state !== "done") engineTask.start();
  try {
    calState.value = { ...(calState.value || {}), ...(await request("/v1/llm-runner/calibrate", { method: "POST" })) };
  } catch (e) {
    calState.value = { ...(calState.value || {}), status: "error", error: e.message || t("kit.quickSetup.check.startFailed") };
    return;
  }
  startCalPoll();
}
function startCalPoll() {
  stopCalPoll();
  calTimer = setInterval(pollSpeedCheck, 1000);
}
function stopCalPoll() {
  if (calTimer) { clearInterval(calTimer); calTimer = null; }
}
async function pollSpeedCheck() {
  try {
    const st = await request("/v1/llm-runner/calibrate");
    calState.value = st;
    if (st.status === "running") return;
    stopCalPoll();
    if (st.status === "done") await afterSpeedCheck();
  } catch { /* transient — the next tick retries */ }
}
// The predictions are calibrated now: re-read them and recompute the pre-fill
// (on this path the pick IS the pre-fill — a configured box never gets here).
async function afterSpeedCheck() {
  const prev = pick.value.default;
  try {
    const m = await request("/v1/llm-runner/models");
    models.value = m.models || [];
    speedFloor.value = speedFloorOf(m);
  } catch { return; }
  pick.value.default = bestFittingId() || prev;
  if (embedsOn && embedAutoFilled && pick.value.default !== prev) {
    const best = bestEmbedId(); // the embed fits the leftover beside the NEW chat pick
    if (best) pick.value.embeddingModel = best;
  }
}
async function skipSpeedCheck() {
  if (calRunning.value) await request("/v1/llm-runner/calibrate/cancel", { method: "POST" }).catch(() => {});
  stopCalPoll();
  step.value = "confirm";
}
function onModalClose() {
  open.value = false;
}
// The host may want to route away when a deep-linked run ends (AiModelsArea
// re-emits this only for an auto-opened wizard). Watching `open` catches BOTH
// close paths — onModalClose and attemptClose — from one place.
watch(open, (v, prev) => {
  if (!v && prev) {
    stopCalPoll(); // the speed-check poll belongs to this wizard window
    emit("closed");
  }
});
// Close guard (user, 2026-07-06 — reversing the earlier "leave it running in background": the
// sweep pegs the GPU and PAUSES every other AI feature, so a headless background run is a trap
// the user can't see). While a sweep runs, the modal's X + Esc are disabled (:closable below);
// this footer Close asks first — OK stops the sweep and closes, Cancel returns to the tuning
// screen.
async function attemptClose() {
  if (optRunning.value) {
    const ok = await confirmDialog({
      title: t("kit.quickSetup.opt.stillRunning"),
      message: t("kit.quickSetup.opt.closeBody"),
      confirmLabel: t("kit.quickSetup.opt.closeAndStop"),
      cancelLabel: t("kit.quickSetup.opt.keepOptimizing"),
    });
    if (!ok) return;
    await skipOptimize();
  }
  open.value = false;
}

// ── D4-1 (a)+(c) changelist (reactive against the live pick) ────────────────
const previewState = ref(null);
// Factory-state = never configured (model empty, exactly as seeded) — the writer adopts
// these like the first setup did (modelApply.setAsDefault), so the changelist must too.
const isFactoryState = (p) => !(p.model || "") && !(p.factoryModel || "");
const repointedPresets = computed(() => {
  const st = previewState.value;
  if (!st || !pick.value.default) return [];
  return st.presets.filter(
    (p) => (p.model === st.dominant || isFactoryState(p)) && p.model !== pick.value.default,
  );
});
const keptPresets = computed(() => {
  const st = previewState.value;
  if (!st) return [];
  return st.presets.filter((p) => p.model !== st.dominant && !isFactoryState(p));
});

// ── apply: one model → every preset (non-clobber) + embedding + download/load ──
// The runner's raw `detail` is engineer-speak ("model weights", "loading into VRAM").
// This audience gets plain language + a real progress bar with speed/ETA (user,
// 2026-07-15: "make the words more userfriendly"). The friendly phrasing moved to THE
// shared loadPhases.js (T3, 2026-07-17 — one vocabulary, every model surface; a JW
// source test pins that no local copy regrows here); imported at the top.

const applying = ref(false);

// ── the THREE download bars: engine · chat · embed (2026-07-15, the ONE-DOWNLOADER
// consolidation — user: "reuse the control … stop repeating code … if component exists to
// do this already use it instead of writing your own"). Each is the SHARED createDownloadTask
// over its server channel, rendered by the SHARED DownloadBar — ONE implementation, ONE bar,
// replacing the old hand-rolled chatBar/embedBar + runChat/runEmbed/cancel/retry copy. They
// run in parallel where they can: the embed rides its OWN download channel (needs no engine),
// so it fetches alongside the engine install; the chat LOAD needs the engine, so it waits for
// the engine task when one is running, then fires.
// The channels are THE shared factories (useDownloadTask.js, promoted 2026-07-18 —
// LuBookSearchSetup rides the same engine/download channels); the model channels take
// a thunk so each start reads the LIVE pick at call time (a re-apply may change it).
const engineTask = createDownloadTask(engineInstallChannel());
const chatTask = createDownloadTask(modelLoadChannel(() => pick.value.default));
const embedTask = createDownloadTask(modelDownloadChannel(() => pick.value.embeddingModel));

// Sequencing: the chat load is gated on the engine. When the engine install finishes, fire the
// load; when it's cancelled/errors, the chat can't proceed (no load attempt) — say so, pointing
// at the engine bar. A later successful engine retry re-fires the load automatically.
watch(() => engineTask.state, (s) => {
  if (step.value !== "apply") return;
  if (s === "done" && pick.value.default && chatTask.state !== "done") chatTask.start();
  else if (s === "cancelled") chatTask.fail(t("kit.quickSetup.apply.engineCancelled"));
  else if (s === "error") chatTask.fail(t("kit.quickSetup.apply.engineFailed"));
});
// The wizard advances only when the CHAT model is genuinely live; a successful chat retry
// advances too (the watch fires again). The embed never gates the step (it self-downloads on
// first search); its honest done-note rides the done step.
watch(() => chatTask.state, (s) => {
  if (s === "done" && step.value === "apply") finishApply();
});

// Every download of the apply step cancelled (or cancelled and dismissed), none running
// or finished (2026-10-06): the step had no bar left and no button — only the corner ×.
// It now says so and offers Back and Close.
// `applying` covers the moment between Apply and the downloads starting, when every
// task is still empty.
const applyStopped = computed(() => step.value === "apply" && !applying.value
  && [engineTask, chatTask, embedTask].every((t) => !t.state || t.state === "cancelled"));

// What Apply downloads, read when it starts (2026-10-06): the step said "both
// download at once" and "A model is several gigabytes…" with one model already on
// disk. "both" only when the chat model and the search model both download, and the
// note only when a model downloads at all.
const applyDownloads = ref({ chat: false, embed: false });
const applyLine = computed(() => {
  const two = !!(chatTask.state && embedTask.state);
  if (engineTask.state) return t(two ? "kit.quickSetup.apply.engineFirstModels" : "kit.quickSetup.apply.engineFirstModel");
  if (applyDownloads.value.chat && applyDownloads.value.embed) return t("kit.quickSetup.apply.bothDownload");
  return t(two ? "kit.quickSetup.apply.settingUpModels" : "kit.quickSetup.apply.settingUpModel");
});

// The completion tail — EXTRACTED so a Retry (via the chat watch) reaches it too. It records
// whether this box already has measured/class tunes for the chosen model (drives the done-step
// Optimize vs Re-optimize label + the "tuned for your hardware ✓" note), then advances to the
// done step. Guarded so a double-finish can't run it twice.
async function finishApply() {
  if (step.value === "done") return;
  const target = pick.value.default;
  tunedAlready.value = target ? await modelHasTunes(target) : false;
  classTuned.value = false;
  if (target && !tunedAlready.value) {
    try {
      const lib = await listClassTunes();
      classTuned.value = (lib.tunes || []).some(
        (t) => t.modelId === target && t.classKey === lib.classKey && t.rows?.length,
      );
    } catch { /* enrichment — the untuned copy still renders honestly */ }
  }
  step.value = "done";
  emit("changed");
  // The host's follow-up seam (surgery 2026-08-04) — docgen needs nothing today
  // (setAsDefault already repoints its presets); future apps hook here.
  quickSetupApplied({ modelId: target });
  if (target) measureAfterApply(target); // never awaited — setup is already done
}

// Measure the model Apply just loaded (speed-truth plan 2026-09-19 §4). Until
// something is measured, the catalog chip is a physics PREDICTION — un-sped by
// design (fit plan §13.7) and able to sit a hair either side of a band line (the
// flagship read "~slow" at 7.9 against a fine-line of 8.0). One fixed-prompt
// probe of the resident model (~15 s, MTP draft included — the speed the user
// actually gets) turns it into "Measured on this PC". measure() needs the model
// resident, which it is at this exact moment: the chat load just completed.
// Empty switches keep the row out of the bandwidth derivation (flagless rows
// never qualify) — it is display truth only. Fire-and-forget: a failed measure
// must never fail a setup that already succeeded.
async function measureAfterApply(modelId) {
  try {
    // Named explicitly: measure() otherwise probes "the most recently loaded", and
    // the row must be recorded against the model that was actually probed.
    const res = await request(`/v1/llm-runner/measure?model_id=${encodeURIComponent(modelId)}`, { method: "POST" });
    if (!res?.ok || !(res.tokensPerSec > 0)) return;
    await recordMeasurement(modelId, res.tokensPerSec, {
      vramTotalMb: res.vramTotalMb || 0, switches: {}, source: "measure", label: t("kit.measureHistory.firstRunLabel"),
    });
    await refreshRunnerModels(); // the chip reads the measured row on the next payload
  } catch { /* the chip keeps its prediction — honest, just not measured */ }
}

async function apply() {
  applying.value = true;
  error.value = "";
  try {
    // A sweep still running (this wizard, the Tune dialog, an earlier window) holds the
    // GPU and its trial loop stop()s the router between trials — a load issued under it
    // gets torn down and reads as a hang (the user's 2026-07-07 repro: cancel didn't
    // take, re-ran Quick Setup, the VRAM load hung). Confirm, stop it, THEN load.
    const tune = await request("/v1/llm-runner/auto-tune").catch(() => null);
    if (tune?.status === "running") {
      const ok = await confirmDialog({
        title: t("kit.quickSetup.opt.stillRunning"),
        message: t("kit.quickSetup.opt.applyBody"),
        confirmLabel: t("kit.quickSetup.opt.stopAndApply"),
        cancelLabel: t("kit.quickSetup.opt.keepOptimizing"),
      });
      if (!ok) return;
      await request("/v1/llm-runner/auto-tune/cancel", { method: "POST" }).catch(() => {});
    }
    // The recommendation is pre-selected but only APPLIED here if the user left it
    // alone — the download must land in the cache they were shown. No-op when it is
    // already the live root.
    await applyCacheChoice(cacheChoice.value);
    step.value = "apply";
    // The chosen chat default goes through the shared modelApply.setAsDefault — the SAME
    // writer the catalog's Set-as-default uses, so the surfaces never drift: it writes
    // `{...p, providerId, model}` onto every task preset that still shares the previous
    // default (non-clobber; each preset keeps its per-task settings). The embedding stays a
    // LOCAL runner concern (the RAG index) — only written when one is chosen.
    const target = pick.value.default;
    await setAsDefault(LOCAL_RUNNER_ID, target);
    if (pick.value.embeddingModel) await setAsEmbedding(pick.value.embeddingId, pick.value.embeddingModel);

    // Fresh run for the three bars.
    engineTask.reset();
    chatTask.reset();
    embedTask.reset();

    // The embed rides its OWN download channel (no engine needed — lifecycle.download states a
    // download can proceed while another model is loaded); fire it in PARALLEL, skipped when
    // already on disk. It never gates the step (it self-downloads on first search too).
    const needEmbed = !!pick.value.embeddingModel
      && !modelById.value[pick.value.embeddingModel]?.downloaded;
    if (needEmbed) embedTask.start();

    // Re-read the engine status HERE, not just at openWizard (user-reported
    // 2026-08-14): the value is fetched once when the wizard opens and defaults to
    // "installed", so anything that removed the engine in between — an Update or a
    // Reinstall, which delete the build before unpacking the new one — left Apply
    // convinced the engine was present. It then skipped the engine step and loaded
    // the chat model straight into `engine-not-installed`, whose message tells the
    // user to install the engine from a bar that (once the reinstall finished) reads
    // "Installed". One fresh fetch removes the whole class.
    await loadEngineStatus();
    applyDownloads.value = { chat: !!target && !modelById.value[target]?.downloaded, embed: needEmbed };

    // The chat model needs the engine. Missing → install it FIRST (its own bar) and hold the
    // chat as "Waiting for the engine…"; the engine watch fires the load the moment it
    // finishes. Present → load immediately. Nothing to load (no fitting model) → straight to done.
    if (!target) {
      await finishApply();
    } else if (engineNeeded.value) {
      chatTask.waiting(t("kit.quickSetup.apply.waitingEngine"));
      engineTask.start();
    } else {
      chatTask.start();
    }
  } catch (e) {
    error.value = t("kit.quickSetup.err.apply", { error: e.message });
    step.value = "confirm";
  } finally {
    applying.value = false;
  }
}

// ── Optimize for this PC (2026-07-06, reshaped 2026-07-07): the consumer of the
// auto-tune job. Same server-side sweep the Tune modal drives, but with
// save:true — the winner is persisted as this machine's tune automatically
// (the QuickSetup audience won't open the Tune modal to review knobs; the
// measured delta is what turns "runs" into "runs fast": 8.6× TTFT on the
// reference box). EXPLICIT-ONLY: Apply never auto-starts it (user, 2026-07-07 —
// the adaptive walk runs 10+ minutes, too long for a "quick" setup; a known
// hardware class gets the seeded class-tune at load instead), it monopolizes
// the GPU while it runs, and closing the wizard mid-run confirm-stops it
// (attemptClose).
const optState = ref(null); // null (not started) | the GET payload
const tunedAlready = ref(false); // (model, THIS machine) already has measured tune rows
const classTuned = ref(false);   // a hardware-class tune matched this box + model at load
// The 2-minute pass (user: "both lab and 2 min sweep") — the SAME sweep with a
// server-side time box; the run stops with the best result so far. optQuick drives
// the honest copy (a capped pass phrases its running/done text differently).
const QUICK_TUNE_SECONDS = 120;
const optQuick = ref(false);
const optRunning = computed(() => optState.value?.status === "running");
// The finished trials so far (each a real load→measure result) — the honest "it's working"
// signal on a LONG job: shown live with their tok/s so progress is visible without a fake ETA.
const optTrialsDone = computed(() => optState.value?.trials || []);

// Live progress affordances (user, 2026-07-06: "is small … something moving to show it is still
// working" + "much longer than 2-4 mins … mine has been running for 4 mins already"). A reliable
// completion ETA is IMPOSSIBLE — the sweep (autotune.py) is an adaptive n-cpu-moe walk with no
// pre-known trial count, and each trial is a full unload→reload→measure (~2 min on the 2070S),
// so it can run 10+ minutes. So: a ticking elapsed clock + the indeterminate bar + the live
// trial list, never a countdown.
const optElapsed = ref(0); // seconds since the sweep began (this window's view of it)
let optStartedAt = 0;
let optTickTimer = null;
const optElapsedLabel = computed(() => {
  const s = optElapsed.value;
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
});
const optRunLabel = computed(() => optState.value?.detail || t("kit.quickSetup.opt.measuring"));
function startOptTick() {
  optStartedAt = Date.now();
  optElapsed.value = 0;
  if (optTickTimer) clearInterval(optTickTimer);
  optTickTimer = setInterval(() => { optElapsed.value = Math.floor((Date.now() - optStartedAt) / 1000); }, 1000);
}
function stopOptTick() { if (optTickTimer) { clearInterval(optTickTimer); optTickTimer = null; } }

let optTimer = null;
function stopOptPoll() {
  if (optTimer) { clearInterval(optTimer); optTimer = null; }
  stopOptTick();
}
async function pollOptimize() {
  try {
    const st = await request("/v1/llm-runner/auto-tune");
    optState.value = st;
    if (st.status !== "running") stopOptPoll();
  } catch {
    stopOptPoll(); // transient — the block's retry button re-arms
  }
}
async function startOptimize(budgetSeconds = 0) {
  optQuick.value = budgetSeconds > 0;
  try {
    const st = await request("/v1/llm-runner/auto-tune", {
      method: "POST",
      body: { modelId: pick.value.default, save: true,
              ...(budgetSeconds > 0 ? { budgetSeconds } : {}) },
    });
    if (st.ok === false) {
      // Busy guard: a sweep is already running (the Tune modal / another window) —
      // ADOPT the shared job instead of erroring (plan Phase 2): render its live
      // state and poll it to completion like our own.
      const cur = await request("/v1/llm-runner/auto-tune").catch(() => null);
      if (cur?.status === "running") {
        optState.value = cur;
        optQuick.value = (cur.budgetSeconds || 0) > 0; // adopt the job's own shape
        stopOptPoll();
        optTimer = setInterval(pollOptimize, 2000);
        startOptTick();
        return;
      }
      throw new Error(st.error || t("kit.quickSetup.opt.startFailed"));
    }
    optState.value = st;
    stopOptPoll();
    optTimer = setInterval(pollOptimize, 2000);
    startOptTick();
  } catch (e) {
    optState.value = { status: "error", error: e.message || t("kit.quickSetup.opt.startFailed") };
  }
}
// Skip = cancel, PROMPT (2026-07-07): the backend aborts the trial in flight (the
// load-wait observes the flag), frees the GPU, and restores the applied model with
// its resolved switches — no more waiting out a 240s trial load ("cant cance tune").
// The cancel response IS the live status ("stopping…"), reflected immediately.
async function skipOptimize() {
  try {
    const st = await request("/v1/llm-runner/auto-tune/cancel", { method: "POST" });
    if (st?.status) optState.value = st;
  } catch { /* already finished — the next poll shows the terminal state */ }
  await pollOptimize();
}
// Re-optimize (tuned machines only): explicit overwrite consent first (amendment A8 —
// the sweep's save REPLACES this machine's rows; with the 1b strict-beat rule it only
// actually replaces them when a strictly faster config is measured).
async function reOptimize() {
  const ok = await confirmDialog({
    title: t("kit.quickSetup.opt.overwriteTitle"),
    message: t("kit.quickSetup.opt.overwriteBody"),
    confirmLabel: t("kit.quickSetup.opt.reoptimize"),
  });
  if (ok) startOptimize();
}
onBeforeUnmount(stopOptPoll);

defineExpose({ openWizard });
</script>

<template>
  <div class="lu-qs" :class="{ 'lu-qs--bare': props.inline }">
    <!-- Trigger (replaces the old inline card; opens the wizard). inline = the button + its
         one-line description to the right (user restored the caption "so people know what it
         does"); the default is the full titled strip. -->
    <template v-if="props.inline">
      <!-- The configured-state truth (A1190): a set-up box is not pitched — but
           the QC-42 scope line STAYS (user QC ruling 2026-08-04: the configured
           band keeps "built-in provider only"; it was dropped once, on my own). -->
      <template v-if="configured">
        <UiButton intent="secondary" @click="openWizard">{{ t('kit.quickSetup.rerunButton') }}</UiButton>
        <span class="lu-qs-barefor">{{ configuredBandLine }}</span>
        <span class="lu-muted lu-qs-baresub">{{ t('kit.quickSetup.bandScope') }}</span>
      </template>
      <template v-else>
        <UiButton intent="primary" @click="openWizard">{{ t('kit.quickSetup.runButton') }}</UiButton>
        <!-- QC-42: the wizard is built-in-only — say so right of the button, bigger
             than the description, so nobody expects it to configure an online
             provider. Since 2026-07-19 this band sits at the top of the Local tab
             rather than inside the built-in provider's card, so these WORDS are the
             only thing carrying the scope — hence naming llama.cpp outright. -->
        <span class="lu-qs-barefor">{{ t('kit.quickSetup.bandScope') }}</span>
        <span class="lu-muted lu-qs-baresub">{{ t('kit.quickSetup.bandSub') }}</span>
      </template>
    </template>
    <div v-else class="lu-qs-head">
      <div>
        <b class="lu-qs-title">{{ t('kit.quickSetup.title') }}</b>
        <span class="lu-muted lu-qs-sub">{{ configured ? configuredBandLine : t('kit.quickSetup.headSub') }}</span>
      </div>
      <UiButton :intent="configured ? 'secondary' : 'primary'" size="small" @click="openWizard">{{ configured ? t('kit.quickSetup.rerunButton') : t('kit.quickSetup.runButton') }}</UiButton>
    </div>

    <AppModal
      v-if="open"
      :title="step === 'detect' ? t('kit.quickSetup.step.probing') : step === 'configured' ? t('kit.quickSetup.alreadyTitle') : step === 'calibrate' ? t('kit.quickSetup.checkTitle') : step === 'apply' ? (applyStopped ? t('kit.quickSetup.step.stopped') : t('kit.quickSetup.step.settingUp')) : step === 'done' ? t('kit.quickSetup.step.allSet') : t('kit.quickSetup.confirmTitle')"
      :max-width="'640px'"
      :closable="!optRunning && !calRunning && engineTask.state !== 'running' && chatTask.state !== 'running' && embedTask.state !== 'running'"
      @close="onModalClose"
    >
      <!-- DETECT -->
      <div v-if="step === 'detect'" class="lu-muted lu-qs-loading">{{ t('kit.quickSetup.step.reading') }}</div>

      <!-- ALREADY SET UP (the configured-state truth, A1190). The scope sentence
           is the QC-42 canon line with the feature named (ruling 2026-08-04: this
           screen's words must carry the built-in-only scope too). -->
      <template v-else-if="step === 'configured'">
        <i18n-t keypath="kit.quickSetup.configured.line" tag="p" style="margin: 0" scope="global"><template #model><b>{{ currentDefaultId || pick.default }}</b></template></i18n-t>
        <p class="lu-muted lu-qs-hint">{{ t('kit.quickSetup.configured.hint') }}</p>
      </template>

      <!-- THE ONE-MINUTE SPEED CHECK (speed-truth plan 2026-09-19 §6) — offered
           only on hardware with no curated preset; always skippable. -->
      <template v-else-if="step === 'calibrate'">
        <p style="margin: 0">{{ calBody }}</p>
        <p class="lu-muted lu-qs-hint">{{ t('kit.quickSetup.checkSkipNote') }}</p>
        <DownloadBar v-if="engineTask.state && engineTask.state !== 'done'" :title="t('kit.quickSetup.engineBarTitle')" :role="t('kit.quickSetup.engineBarRole')" :task="engineTask" />
        <template v-if="calRunning">
          <UiProgress
            v-if="calState.phase === 'download'"
            :label="calProgressLabel" :value="calState.done || 0" :max="calState.total || 0" />
          <UiProgress v-else :label="calProgressLabel" />
        </template>
        <p v-else-if="calState?.status === 'done'" class="lu-qs-opt-ok" style="margin: 0">
          {{ t('kit.quickSetup.checkDoneNote') }}
        </p>
        <p v-else-if="calState?.status === 'error'" class="lu-error" style="margin: 0">{{ calState.error }}</p>
        <p v-else-if="calState?.status === 'cancelled'" class="lu-muted" style="margin: 0">{{ t('kit.quickSetup.check.cancelled') }}</p>
      </template>

      <!-- CONFIRM (editable) -->
      <template v-else-if="step === 'confirm'">
        <div v-if="error" class="lu-error">{{ error }}</div>

        <!-- The family cache-offer, asked FIRST (ported from the docgen fork
             2026-08-04): the answer changes what the model choice below costs —
             a model already in a sibling app's cache downloads in 0 s. -->
        <section v-if="cacheOffer" class="lu-qs-sec lu-qs-cache">
          <i18n-t keypath="kit.quickSetup.cache.offer" tag="p" style="margin: 0" scope="global" :plural="cacheOffer.models?.length || 0">
            <template #app><b>{{ cacheOffer.product || t('kit.quickSetup.cache.anotherAppCap') }}</b></template>
            <template #n>{{ cacheOffer.models?.length || 0 }}</template>
            <template #size>{{ fmtCacheBytes(cacheOffer.bytes || 0) }}</template>
          </i18n-t>
          <UiSelect
            :model-value="cacheChoice" :options="cacheOptions" width="prose"
            @update:model-value="onCacheChoice"
          />
          <p class="lu-muted lu-qs-hint">{{ t('kit.quickSetup.cache.sharingHint') }}</p>
          <p v-if="cacheNote" class="lu-muted lu-qs-hint">{{ cacheNote }}</p>
        </section>

        <p v-if="fitVerdict" class="lu-qs-verdict">{{ fitVerdict }}</p>
        <!-- Hardware requirements only make sense when there ARE curated models
             to run (an empty catalog has no floor to state). -->
        <p v-if="catState !== 'empty'" class="lu-muted lu-qs-req">{{ t('kit.quickSetup.confirm.requirements') }}</p>

        <section class="lu-qs-sec">
          <div class="lu-qs-k">{{ t('kit.quickSetup.confirm.detected') }}</div>
          <div class="lu-qs-detected"><b>{{ hwLine }}</b></div>
        </section>

        <div v-if="loading" class="lu-muted">{{ t('kit.quickSetup.confirm.readingCatalog') }}</div>
        <template v-else-if="fitting.length">
          <!-- The one good model — a single editable pick that runs every task. -->
          <section class="lu-qs-sec">
            <div class="lu-qs-k">
              {{ t('kit.quickSetup.confirm.defaultModel') }}
              <span class="lu-fit lu-qs-fit" :class="`lu-fit--${fitOf(pick.default)}`">{{ fitLabel(fitOf(pick.default)) }}</span>
            </div>
            <UiSelect v-model="pick.default" :options="modelOptions" />
            <p class="lu-muted lu-qs-hint">{{ t('kit.quickSetup.modelHint') }}</p>
            <p v-if="descriptionOf(pick.default)" class="lu-qs-why">
              <b>{{ t('kit.quickSetup.confirm.aboutModel') }}</b> {{ descriptionOf(pick.default) }}
            </p>
          </section>
          <p v-if="isQatPick" class="lu-qs-goodtoknow">
            <b>{{ t('kit.quickSetup.confirm.goodToKnow') }}</b> {{ t('kit.quickSetup.confirm.qatNote') }}
          </p>
        </template>
        <!-- TWO distinct no-model states (decision ④): an EMPTY catalog is this
             app's seed choice, not the machine's fault — say so. -->
        <div v-else-if="catState === 'empty'" class="lu-qs-empty">
          <i18n-t keypath="kit.quickSetup.confirm.emptyCatalog" scope="global">
            <template #edit><b>{{ t('kit.quickSetup.confirm.edit') }}</b></template>
            <template #add><b>{{ t('kit.quickSetup.confirm.addModel') }}</b></template>
            <template #online><b>{{ t('kit.quickSetup.confirm.onlineProvider') }}</b></template>
          </i18n-t>
        </div>
        <div v-else class="lu-qs-empty">
          <i18n-t keypath="kit.quickSetup.confirm.noLocal" scope="global">
            <template #online><b>{{ t('kit.quickSetup.confirm.onlineProvider') }}</b></template>
          </i18n-t>
        </div>

        <!-- The embedding — always LOCAL (the RAG index). Hidden when no chat model fits:
             that state routes OUT to an online provider (no local Apply happens), so the
             local embed picker + the Apply changelist below would be contradictory UI. -->
        <section v-if="embedsOn && fitting.length && embedOptions.length" class="lu-qs-sec">
          <div class="lu-qs-k">{{ t('kit.quickSetup.confirm.embedding') }}</div>
          <UiSelect v-model="pick.embeddingModel" :options="embedOptions" @update:model-value="onEmbedChange" />
          <p class="lu-muted lu-qs-hint">{{ t('kit.quickSetup.embed.powers') }} {{ embedPlaceLine || t('kit.quickSetup.embed.bundled') }}</p>
        </section>

        <!-- What will happen on Apply. -->
        <section v-if="fitting.length" class="lu-qs-sec lu-qs-routing">
          <div class="lu-qs-k">{{ t('kit.quickSetup.confirm.whatHappens') }}</div>
          <ul class="lu-qs-rlist">
            <li v-if="modelById[pick.default]"><b>{{ modelById[pick.default].name }}</b> <span class="lu-muted">— {{ t('kit.quickSetup.confirm.becomesDefault') }}</span></li>
            <li v-if="pick.default"><i18n-t keypath="kit.quickSetup.confirm.downloadsNow" scope="global"><template #now><b>{{ t('kit.quickSetup.confirm.downloadsNowWords') }}</b></template></i18n-t></li>
            <li v-if="pick.embeddingModel"><i18n-t keypath="kit.quickSetup.confirm.searchModel" scope="global"><template #name><code>{{ embedName }}</code></template><template #now><b>{{ t('kit.quickSetup.confirm.downloadsNowWords') }}</b></template></i18n-t></li>
          </ul>
        </section>

        <!-- D4-1 (a)+(c): a box that's already configured (mixed task models, or measured
             tunes for a current model) sees EXACTLY which tasks Apply will change before
             anything writes — the lists come from the SAME dominant-model logic the Apply
             writer uses. A fresh box renders nothing here and stays one-click. -->
        <section v-if="fitting.length && previewState?.configured" class="lu-qs-sec lu-qs-changes">
          <div class="lu-qs-k">{{ t('kit.quickSetup.confirm.alreadyTitle') }}</div>
          <template v-if="repointedPresets.length">
            <ul class="lu-qs-rlist">
              <li v-for="p in repointedPresets" :key="p.id">
                <b>{{ presetDisplayName(p) }}</b> <i18n-t keypath="kit.quickSetup.confirm.repoints" tag="span" class="lu-muted" scope="global"><template #from><code>{{ p.model }}</code></template><template #to><code>{{ pick.default }}</code></template></i18n-t>
              </li>
            </ul>
          </template>
          <p v-else class="lu-muted">{{ t('kit.quickSetup.confirm.noRouting') }}</p>
          <p v-if="keptPresets.length" class="lu-muted lu-qs-hint">
            {{ t('kit.quickSetup.confirm.kept', { names: keptPresets.map((p) => presetDisplayName(p)).join(", ") }) }}
          </p>
          <p class="lu-muted lu-qs-hint">{{ t('kit.quickSetup.confirm.tunesKept') }}</p>
        </section>
      </template>

      <!-- APPLY -->
      <template v-else-if="step === 'apply'">
        <template v-if="applyStopped">
          <p class="lu-qs-applying"><b>{{ t('kit.quickSetup.apply.stopped') }}</b></p>
          <p class="lu-muted lu-qs-applynote">{{ t('kit.quickSetup.apply.stoppedNote', { rerun: t('kit.quickSetup.rerunButton') }) }}</p>
        </template>
        <p v-else class="lu-qs-applying">{{ applyLine }}</p>

        <!-- ONE bar per download (the SHARED DownloadBar over the SHARED createDownloadTask):
             the engine (only when it isn't installed yet), the chat model, and the search
             model. Each carries its own Cancel / Retry. -->
        <DownloadBar v-if="engineTask.state" :title="t('kit.quickSetup.engineBarTitle')" :role="t('kit.quickSetup.engineBarRole')" :task="engineTask" />
        <DownloadBar v-if="chatTask.state" :title="modelById[pick.default]?.name || pick.default" :role="t('kit.quickSetup.chatRole')" :task="chatTask" />
        <DownloadBar v-if="embedTask.state" :title="embedName" :role="t('kit.quickSetup.embedRole')" :task="embedTask" />

        <p v-if="!applyStopped && (applyDownloads.chat || applyDownloads.embed)" class="lu-muted lu-qs-applynote">
          {{ t('kit.quickSetup.apply.sizeNote') }}
        </p>
      </template>

      <!-- DONE -->
      <template v-else-if="step === 'done'">
        <p><b>{{ t('kit.quickSetup.done.applied') }}</b></p>
        <ul class="lu-qs-summary">
          <li>{{ t('kit.quickSetup.confirm.defaultModel') }} · <code>{{ modelById[pick.default]?.name || pick.default }}</code></li>
          <li v-if="pick.embeddingModel">{{ t('kit.quickSetup.confirm.embedding') }} · <code>{{ embedName }}</code></li>
        </ul>
        <p v-if="doneBody" class="lu-muted">{{ doneBody }}</p>
        <p v-if="embedTask.state && embedTask.state !== 'done'" class="lu-muted lu-qs-applynote">
          {{ t('kit.quickSetup.done.searchPending') }}
        </p>

        <!-- C8 integration: the wizard is local-only, so the old `isBundled` guard is gone —
             the optimize offer needs only a picked model. EXPLICIT-ONLY (2026-07-07): Apply
             never auto-starts the sweep; an untuned machine gets "Optimize for this PC", a
             tuned machine gets Re-optimize behind an explicit overwrite confirm. -->
        <div v-if="pick.default" class="lu-qs-opt">
          <!-- The truth ladder (ROUND 8 Task B remainder): own measured tune >
               a matching hardware-class tune > the engine's computed fit. The
               wholly-untuned branch offers BOTH the 2-minute pass and the
               full sweep (user: "both lab and 2 min sweep"); the deeper path is
               the model's Tune dialog. -->
          <template v-if="!optState">
            <template v-if="tunedAlready">
              <UiButton intent="secondary" size="small" @click="reOptimize">{{ t('kit.quickSetup.opt.reoptimize') }}</UiButton>
              <span class="lu-muted">{{ t('kit.quickSetup.opt.tunedAlready') }}</span>
            </template>
            <template v-else-if="classTuned">
              <span class="lu-qs-opt-ok">{{ t('kit.quickSetup.opt.classApplied') }}</span>
              <span class="lu-muted">{{ t('kit.quickSetup.opt.classNote') }}</span>
              <UiButton intent="secondary" size="small" @click="startOptimize()">{{ t('kit.quickSetup.opt.optimizePc') }}</UiButton>
            </template>
            <template v-else>
              <span class="lu-muted">{{ t('kit.quickSetup.opt.untuned') }}</span>
              <div class="lu-qs-opt-btns">
                <UiButton intent="secondary" size="small" @click="startOptimize(QUICK_TUNE_SECONDS)">{{ t('kit.quickSetup.opt.quick') }}</UiButton>
                <UiButton intent="secondary" size="small" @click="startOptimize()">{{ t('kit.quickSetup.opt.full') }}</UiButton>
              </div>
              <span class="lu-muted">{{ t('kit.quickSetup.opt.quickVsFull') }}</span>
            </template>
          </template>
          <template v-else-if="optRunning">
            <div class="lu-qs-opt-run">
              <div class="lu-qs-opt-line">
                <b class="lu-qs-opt-title">{{ optQuick ? t('kit.quickSetup.opt.quickRunning') : t('kit.quickSetup.opt.fullRunning') }}</b>
                <span class="lu-qs-opt-elapsed">{{ t('kit.quickSetup.opt.elapsed', { time: optElapsedLabel }) }}</span>
              </div>
              <UiProgress :label="optRunLabel" />
              <p class="lu-muted lu-qs-opt-eta">
                {{ optQuick ? t('kit.quickSetup.opt.quickEta') : t('kit.quickSetup.opt.fullEta') }}
              </p>
              <ul v-if="optTrialsDone.length" class="lu-qs-opt-trials">
                <li v-for="(trial, i) in optTrialsDone" :key="i" :class="{ 'is-fail': !trial.ok }">
                  <span class="lu-qs-opt-tl">{{ trial.label }}</span>
                  <span v-if="trial.ok" class="lu-qs-opt-tv">{{ fmtTps(trial.tokensPerSec) }}</span>
                  <span v-else class="lu-qs-opt-tx">{{ trial.error && trial.error.startsWith("skipped") ? t('kit.quickSetup.opt.trialSkipped') : t('kit.quickSetup.opt.trialFailed') }}</span>
                </li>
              </ul>
              <div class="lu-qs-opt-act">
                <UiButton intent="secondary" @click="skipOptimize">{{ t('kit.quickSetup.opt.skip') }}</UiButton>
                <span class="lu-muted lu-qs-opt-skiphint">{{ t('kit.quickSetup.opt.skipHint') }}</span>
              </div>
            </div>
          </template>
          <template v-else-if="optState.status === 'done' && optState.best">
            <!-- Self-diagnosing 2-minute pass (ROUND 8): a capped run that saved nothing
                 routes the user deeper (the full sweep / the Tune dialog) instead of
                 reading like a verdict — 2 minutes is a probe, not proof. -->
            <span class="lu-qs-opt-ok">{{ t('kit.quickSetup.opt.optimized', { speed: fmtTps(optState.best.tokensPerSec) }) }} —
              {{ optState.saved
                ? t('kit.quickSetup.opt.saved')
                : (optState.best.label === "baseline"
                    ? (optQuick ? t('kit.quickSetup.opt.quickNothing') : t('kit.quickSetup.opt.alreadyFastest'))
                    : t('kit.quickSetup.opt.saveFailed')) }}</span>
          </template>
          <template v-else-if="optState.status === 'cancelled'">
            <span class="lu-muted">{{ t('kit.quickSetup.opt.cancelled') }}</span>
            <UiButton intent="ghost" size="small" @click="startOptimize()">{{ t('kit.quickSetup.checkRetryButton') }}</UiButton>
          </template>
          <template v-else>
            <span class="lu-error">{{ optState.error || t('kit.quickSetup.opt.failed') }}</span>
            <UiButton intent="ghost" size="small" @click="startOptimize()">{{ t('kit.quickSetup.checkRetryButton') }}</UiButton>
          </template>
        </div>
      </template>

      <template #footer>
        <template v-if="step === 'configured'">
          <UiButton intent="ghost" @click="onModalClose">{{ t('kit.quickSetup.closeButton') }}</UiButton>
          <span class="lu-qs-spacer" />
          <UiButton intent="primary" @click="step = 'confirm'">{{ t('kit.quickSetup.changeModelButton') }}</UiButton>
        </template>
        <template v-else-if="step === 'calibrate'">
          <UiButton intent="ghost" @click="skipSpeedCheck">{{ t('kit.quickSetup.checkSkipButton') }}</UiButton>
          <span class="lu-qs-spacer" />
          <UiButton v-if="calState?.status === 'done'" intent="primary" @click="step = 'confirm'">{{ t('kit.quickSetup.checkContinueButton') }}</UiButton>
          <UiButton v-else intent="primary" :loading="calRunning" :disabled="calRunning" @click="runSpeedCheck">
            {{ calState?.status === 'error' || calState?.status === 'cancelled' ? t('kit.quickSetup.checkRetryButton') : t('kit.quickSetup.checkRunButton') }}
          </UiButton>
        </template>
        <template v-else-if="step === 'confirm'">
          <UiButton intent="ghost" @click="onModalClose">{{ t('kit.quickSetup.cancelButton') }}</UiButton>
          <span class="lu-qs-spacer" />
          <!-- Nothing fits locally: the primary action routes OUT to the provider list (this
               wizard sits inside the Providers & models tab, so closing lands there). C8 holds
               — no provider-connect INSIDE the wizard; it just hands off. -->
          <UiButton v-if="!fitting.length" intent="primary" @click="onModalClose">{{ t('kit.quickSetup.confirm.setUpOnline') }}</UiButton>
          <UiButton v-else intent="primary" :disabled="applyDisabled" :loading="applying" @click="apply">
            {{ t('kit.quickSetup.applyButton') }}
          </UiButton>
        </template>
        <template v-else-if="step === 'apply' && applyStopped">
          <UiButton intent="ghost" @click="step = 'confirm'">{{ t('kit.quickSetup.apply.back') }}</UiButton>
          <span class="lu-qs-spacer" />
          <UiButton intent="primary" @click="attemptClose">{{ t('kit.quickSetup.closeButton') }}</UiButton>
        </template>
        <template v-else-if="step === 'done'">
          <span class="lu-qs-spacer" />
          <UiButton intent="primary" @click="attemptClose">{{ t('kit.quickSetup.closeButton') }}</UiButton>
        </template>
      </template>
    </AppModal>
  </div>
</template>

<style scoped>
.lu-qs { border: 1px solid var(--border); border-radius: var(--r-md, 10px); background: var(--surface); padding: 12px 16px; }
/* Wraps: the line beside the button drops below it when the row doesn't fit (at 390 px in Spanish
   the button alone is 292 px, and the unwrapped row ran 127 px past its card). */
.lu-qs--bare { border: none; border-radius: 0; background: transparent; padding: 0; display: inline-flex; flex-wrap: wrap; align-items: center; gap: 12px; }
.lu-qs-barefor { font-size: 13.5px; font-weight: 600; color: var(--ink); }
/* a note's lines at most 30em (~70 characters; it ran 91 — the seventeenth review, 2026-10-20) */
.lu-qs-baresub { font-size: 12px; line-height: 1.4; max-width: 30em; }
.lu-qs-head { display: flex; align-items: center; gap: 12px; }
.lu-qs-head > div { flex: 1; min-width: 0; }
.lu-qs-title { font-size: 14px; color: var(--ink); }
.lu-qs-sub { font-size: 11.5px; margin-left: 8px; }
.lu-qs-loading { text-align: center; padding: 24px 0; }
.lu-qs-sec { margin-bottom: 18px; }
.lu-qs-k {
  font-size: 10.5px; text-transform: uppercase; letter-spacing: .06em;
  color: var(--muted); margin-bottom: 8px; font-weight: 700;
  display: flex; align-items: center; gap: 8px;
}
.lu-qs-fit { margin-left: auto; }
.lu-qs-detected { font-size: 13px; color: var(--ink-2); }
.lu-qs-hint { font-size: 11.5px; line-height: 1.55; margin: 6px 0 0; }
.lu-qs-why {
  font-size: 12px; line-height: 1.5; margin: 8px 0 0;
  padding: 8px 10px; background: var(--surface-2); border-radius: 6px;
  color: var(--ink-2); border-left: 2px solid var(--accent);
}
.lu-qs-why b { color: var(--ink); }
.lu-qs-routing { background: var(--surface-2); padding: 12px 14px; border-radius: 8px; border: 1px solid var(--border); }
.lu-qs-rlist { list-style: none; padding: 0; margin: 0; display: flex; flex-direction: column; gap: 6px; font-size: 12.5px; line-height: 1.45; }
.lu-qs-rlist li { padding-left: 14px; position: relative; }
.lu-qs-rlist li::before { content: "•"; position: absolute; left: 0; color: var(--muted); }
.lu-qs-rlist code { font-family: var(--font-mono, monospace); font-size: 11.5px; }
.lu-qs-empty { font-size: 12.5px; line-height: 1.55; padding: 8px 0; color: var(--ink-2); }
.lu-qs-empty b { color: var(--ink); }
.lu-qs-req { font-size: 12px; margin: 0 0 12px; }
.lu-qs-verdict { font-size: 15px; font-weight: 700; color: var(--ink); margin: 0 0 10px; }
.lu-qs-goodtoknow { font-size: 12px; line-height: 1.5; margin: 14px 0 0; padding: 8px 10px; background: var(--surface-2); border-radius: 6px; color: var(--ink-2); }
.lu-qs-goodtoknow b { color: var(--ink); }
.lu-qs-applying { font-size: 13px; }
.lu-qs-applynote { font-size: 11.5px; margin-top: 8px; }
.lu-qs-summary { margin: 8px 0; padding-left: 18px; display: flex; flex-direction: column; gap: 4px; font-size: 12.5px; }
.lu-qs-opt { display: flex; flex-direction: column; gap: 6px; align-items: flex-start; margin: 10px 0; padding: 10px 12px; background: var(--surface-2); border: 1px solid var(--border); border-radius: var(--r-sm, 8px); font-size: 12px; }
.lu-qs-opt-btns { display: flex; gap: 8px; flex-wrap: wrap; }
.lu-qs-opt-run { display: flex; flex-direction: column; gap: 8px; width: 100%; }
.lu-qs-opt-line { display: flex; align-items: baseline; justify-content: space-between; gap: 10px; }
.lu-qs-opt-title { font-size: 13.5px; color: var(--ink); }
.lu-qs-opt-elapsed { font-size: 12.5px; color: var(--muted); font-variant-numeric: tabular-nums; }
.lu-qs-opt-eta { font-size: 12px; margin: 0; line-height: 1.5; }
.lu-qs-opt-trials { list-style: none; margin: 2px 0 0; padding: 0; display: flex; flex-direction: column; gap: 3px; max-height: 132px; overflow-y: auto; }
.lu-qs-opt-trials li { display: flex; align-items: baseline; gap: 8px; font-size: 12px; }
.lu-qs-opt-trials li.is-fail { opacity: .6; }
.lu-qs-opt-tl { flex: 1; min-width: 0; color: var(--ink-2); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.lu-qs-opt-tv { font-variant-numeric: tabular-nums; color: var(--accent-ink, var(--accent)); font-weight: 600; }
.lu-qs-opt-tx { font-size: 11px; color: var(--muted); }
.lu-qs-opt-act { display: flex; align-items: center; gap: 10px; margin-top: 2px; }
.lu-qs-opt-skiphint { font-size: 11.5px; }
.lu-qs-opt-ok { font-size: 12.5px; color: var(--accent-ink, var(--accent)); font-weight: 600; }
.lu-qs-spacer { flex: 1; }
.lu-fit { display: inline-flex; align-items: center; white-space: nowrap; border-radius: 999px; padding: 1px 8px; font-size: 10.5px; font-weight: 700; border: 1px solid var(--border-strong); color: var(--ink-2); flex: none; }
.lu-fit--ok { background: var(--accent-soft); border-color: var(--accent-line, var(--accent)); color: var(--accent-ink, var(--accent)); }
.lu-fit--tight { background: var(--gold-soft, #f5edda); border-color: var(--gold-line, #e2d2b0); color: var(--gold, #b08a3e); }
.lu-fit--no { background: var(--danger-bg, #f7e7e4); border-color: var(--danger-line, var(--danger)); color: var(--danger); }
.lu-fit--cpu, .lu-fit--unknown { background: var(--surface-3); }
</style>
