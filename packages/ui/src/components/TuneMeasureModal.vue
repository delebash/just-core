<script setup>
// SPDX-License-Identifier: MIT
// THE one launch-switch editor (§7.1, locked 2026-07-08) — "Tune & measure" (its UI
// title; the canonical name since the 2026-07-22 rename — formerly "Quick tune", #20 →
// Plan B 2026-07-05), extracted from LuModelCatalog; opened from the model catalog's per-row
// Tune action AND from a Lab column's "Engine switches ↗" link (launch config lives on
// the MODEL — one editor, everywhere). Loads the model with ad-hoc Plane-1 engine
// flags + probes decode tok/s on this box.
//
// §7.6 (2026-07-08) + QC-17/18/10 (2026-07-09, the user: "the tune and measure
// works like global and hardware you have an x by each row … just like the way we
// do it on the command line"): the grid is the SAME free-row editor as the Global
// launch defaults / PC class config editors — ONLY the switches that carry a value
// render, each a name box + a plain text/number value box + ✕ (remove = the flag
// isn't sent = the engine does its own thing; the app never claims to know the
// engine's defaults), "+ Add switch" to include one — grouped under a heading per
// source layer (Your applied config · PC class config · Global launch
// defaults · Computed for this PC). Set rows pre-fill from the model's RESOLVED
// defaults INCLUDING the fit-computed values ("Add to grid" is retired). **Apply**
// is a SNAPSHOT: the model takes ownership of every set row (PUT /v1/ai/model-tunes;
// the server derives the machine key and stores the layer BASELINE beside it) — once
// applied, the model stops following later global/class changes (the user's decision:
// "once you tune a model you no longer get live updates"). Drift is surfaced honestly:
// when today's defaults differ from the baseline stored at apply time, a notice offers
// "Refresh from defaults" — it fills the GRID only; Apply commits. Apply also RELOADS
// the model immediately when it is currently running (no stale window: applied ==
// active), behind a blast-radius confirm naming the affected presets. "Remove applied
// config" (DELETE) returns the model to the live layered defaults, same reload.
// Self-contained (loads its own knob catalog); mount behind v-if with a :model
// ({id, name}) and listen for @close.
import { computed, onBeforeUnmount, onMounted, ref } from "vue";
import { useI18n } from "vue-i18n";

import { request } from "../client.js";
import { classKeyLabel, listClassTunes, putClassTune } from "../classTunes.js";
import { fetchKnobCatalog, plane1SwitchCatalog } from "../knobCatalog.js";
import { recordMeasurement } from "../measurements.js";
import { resolveModelDefaults } from "../modelDefaults.js";
import { classLayerLabel, TUNE_BADGES } from "../tuneState.js";
import { confirmDialog } from "../common/services/dialog.js";
import { pushToast } from "../common/services/toastBridge.js";
import { fmtSeconds, fmtTokens, fmtTps } from "../common/services/runStats.js";
import AppModal from "../common/components/AppModal.vue";
import KnobGrid from "./KnobGrid.vue";
import LuClassTunes from "./LuClassTunes.vue";
import LuGlobalSwitches from "./LuGlobalSwitches.vue";
import LuMeasureHistory from "./LuMeasureHistory.vue";
import UiButton from "../common/components/UiButton.vue";
import UiTag from "../common/components/UiTag.vue";
import { presetDisplayName } from "../services/seededWords.js";

const props = defineProps({
  model: { type: Object, required: true }, // { id, name } — the model being tuned
});
const emit = defineEmits(["close"]);

const gb = (mb) => (mb >= 10240 ? n(Math.round(mb / 1024)) : n(mb / 1024, { minimumFractionDigits: 1, maximumFractionDigits: 1 }));

// Knob-catalog metadata (C1) — names/help/kind for the Plane-1 switch grid.
// Fetch + map come from the shared knobCatalog.js (one source with LuClassTunes'
// global mount); the raw list also feeds the unknown-flag badge below.
const knobCatalog = ref([]);
const switchCatalog = computed(() => plane1SwitchCatalog(knobCatalog.value));
async function loadKnobCatalog() {
  knobCatalog.value = await fetchKnobCatalog(); // [] on failure — enrichment only
}

const tuneRows = ref([]); // KnobGrid rows [{ name, value }] — the SET switches
const tunePhase = ref(""); // "" | loading | measuring | done | error
const tuneDetail = ref(""); // live load detail
const tuneResult = ref(null); // { tokensPerSec, completionTokens, ms, vramTotalMb, ramTotalMb }
const tuneErr = ref("");
const tuneBusy = computed(() => tunePhase.value === "loading" || tunePhase.value === "measuring");

// Per-row PROVENANCE (2026-07-07 origins) → SECTION GROUPING (QC-10, the user's
// "yes" + "in fact see how you have this niceely layed out grouped with a header
// easy seperation"): which layer wrote each SET value decides which heading its
// row renders under — the four user-named sections, headings instead of per-row
// tags. Unset knobs don't render at all (QC-17 — absent = the engine's own
// behavior, like the command line). Fit-computed values are ordinary rows under
// "Computed for this PC" (2026-07-08: "Add to grid" retired). FLAGGED reading
// (one-line-changeable): rows YOU add here and the auto-tune winner's rows group
// under "Your applied config" — they become exactly that on Apply.
// QC-28 (user: "add switch add row to top it should add to bottom, Your
// applied configs should show up at bottom"): "Your applied config" is the
// LAST group — and a freshly-added row (no origin) lands there via KnobGrid's
// explicit `fallback-group="applied"` (its default fallback is the FIRST
// group, which after this reorder is the class section — the B6-window probe
// caught new rows rendering at the top), so "＋ Add switch" appends at the
// visual bottom (KnobGrid's add() already appends within a section).
const { t, n } = useI18n();
const TUNE_GROUPS = computed(() => [
  // The layer's words come from the ONE source (tuneState.js classLayerLabel) — this
  // grid heading, the catalog badge and the budget line all name the same layer, and
  // two of them had already drifted before the 2026-07-26 rename converged them.
  { key: "class", label: classLayerLabel() },
  { key: "global", label: t("kit.tuneModal.group.global") },
  { key: "computed", label: t("kit.tuneModal.group.computed") },
  { key: "applied", label: t("kit.tuneModal.group.applied") },
]);
const GROUP_OF = {
  tune: "applied", autotune: "applied",
  class: "class",
  base: "global", type: "global", mtp: "global",
  computed: "computed",
};
const tuneOrigins = ref({}); // flagName -> layer id, for the SET rows
const rowGroups = computed(() =>
  Object.fromEntries(Object.entries(tuneOrigins.value).map(([k, v]) => [k, GROUP_OF[v] || "applied"])),
);

// ── the applied per-(model, machine) config (Plan B storage; §7.1 Apply semantics) ──
// { hwKey, rows, source, driftCount } | null — source ("auto" | "hand") and
// driftCount (defaults changed since apply; null = unknowable, e.g. a tune applied
// before baseline tracking) are server-derived (§7.6).
const savedTune = ref(null);
const saveState = ref(""); // "" | saving | removing
const saveErr = ref("");
const applyMsg = ref(""); // transient "Applied ✓ …" note after a completed Apply

// ── the §7.6 header badge (B3-4) — Auto-tuned / Hand-tuned / Untuned. QC-3
// (2026-07-08, the user: "this just has one class defaults andt that is not true,
// it is all of them"): the header state describes the WHOLE config, and only an
// applied snapshot genuinely is one thing — an untuned model's config is a MIX of
// layers, which the per-row origin tags show truthfully. So the header never
// claims a single layer; the has-a-class-default fact lives on the rows (and the
// catalog row badge).
const headerBadge = computed(() => {
  if (savedTune.value) {
    const fam = TUNE_BADGES[savedTune.value.source] || null;
    return {
      intent: "success",
      label: fam ? t("kit.tuneModal.badge.onThisPc", { label: t(fam.labelKey) }) : t("kit.tuneModal.badge.applied"),
    };
  }
  // Same five-state vocabulary as the catalog row (2026-07-26, the user: "should be
  // consistent") — the label comes from the shared family, never a local literal, so
  // the two surfaces cannot drift into two words for one state.
  return { intent: TUNE_BADGES.untuned.intent, label: t("kit.tuneModal.badge.untuned", { label: t(TUNE_BADGES.untuned.labelKey) }) };
});
const driftCount = computed(() => savedTune.value?.driftCount || 0);

// "Refresh from defaults" (§7.6, the user's "update from defaults" button): load
// TODAY's layer baseline (+ its computed fit) into the GRID — never the DB; the
// applied config stands until Apply commits what you see.
async function refreshFromDefaults() {
  tuneErr.value = "";
  applyMsg.value = "";
  try {
    fillFromResolved(await resolveModelDefaults(props.model.id, { excludeTune: true }));
    pushToast({ message: t("kit.tuneModal.refreshed") });
  } catch (e) {
    tuneErr.value = e.message || t("kit.tuneModal.err.defaults");
  }
}

// Rows whose BARE name matches no plane-1 knob — likely a mistyped or since-
// DROPPED typed field that would render mis-spelled and fail the spawn (the D5
// degradation fold: visible badge, not a mystery load failure). A deliberate raw
// passthrough flag starts with "--" and is NOT badged.
const knownFlagNames = computed(
  () => new Set(knobCatalog.value.filter((k) => k.plane === 1).map((k) => k.flagName)),
);
const unknownNames = computed(() => {
  if (!knobCatalog.value.length) return new Set(); // catalog unavailable → don't badge
  const out = new Set();
  for (const r of tuneRows.value) {
    const n = (r.name || "").trim();
    if (n && !n.startsWith("--") && !knownFlagNames.value.has(n)) out.add(n);
  }
  return out;
});

async function loadSavedTune() {
  try {
    const res = await request(`/v1/ai/model-tunes?modelId=${encodeURIComponent(props.model.id)}`);
    savedTune.value = res.rows?.length ? res : null;
  } catch {
    savedTune.value = null; // saved-state is an enrichment; tuning still works
  }
}
// The blast radius for the Apply confirm (2026-07-15, one source): the PRESETS whose
// resolved model is THIS model, each with the number of features that use it. Best-effort
// — null means "couldn't compute" and the confirm falls back to generic copy.
async function affectedPresets() {
  try {
    const [pa, ep] = await Promise.all([
      request("/v1/ai/preset-assignments"), request("/v1/ai/engine-presets"),
    ]);
    const asg = pa || {};
    // Feature count per preset (every seeded action carries a ref → the map covers them).
    const countByPreset = {};
    for (const pid of Object.values(asg.features || {})) if (pid) countByPreset[pid] = (countByPreset[pid] || 0) + 1;
    return (ep.presets || [])
      .filter((p) => p.model === props.model.id)
      .map((p) => ({ name: presetDisplayName(p), count: countByPreset[p.id] || 0 }));
  } catch {
    return null;
  }
}

// Reload the model NOW when it is the currently-running one, so applied == active
// (the user's apply-now decision — never "wait for the next load"). Loads WITHOUT
// explicit switches so the spawn resolves the just-written config through the same
// path production uses (seen = run). Honest limit: /status reports the PRIMARY
// resident model; a co-resident secondary (e.g. the pinned embed) isn't respawned —
// its next load picks the config up.
async function reloadIfRunning() {
  const st = await request("/v1/llm-runner/status").catch(() => null);
  if (!(st?.status === "running" && st?.modelId === props.model.id)) return false;
  tunePhase.value = "loading";
  tuneDetail.value = t("kit.tuneModal.applying");
  await request("/v1/llm-runner/stop", { method: "POST" }).catch(() => {});
  await request("/v1/llm-runner/load", { method: "POST", body: { modelId: props.model.id } });
  await pollUntilSettled();
  tunePhase.value = "";
  tuneDetail.value = "";
  return true;
}

async function applyTune() {
  saveErr.value = "";
  applyMsg.value = "";
  // Blast-radius confirm (§7.1): name the affected presets (capped) before committing.
  const affected = await affectedPresets();
  const names = (affected || []).map((x) => (x.count ? `${x.name} (${x.count})` : x.name));
  const capped = names.length > 3
    ? t("kit.tuneModal.apply.more", { names: names.slice(0, 3).join(", "), n: names.length - 3 })
    : names.join(", ");
  const scope = affected == null
    ? t("kit.tuneModal.apply.everyPreset")
    : names.length
      ? t("kit.tuneModal.apply.presets", { names: capped })
      : t("kit.tuneModal.apply.noPreset");
  const ok = await confirmDialog({
    title: t("kit.tuneModal.apply.title", { model: props.model.name || props.model.id }),
    message: t("kit.tuneModal.apply.body", { scope }),
    confirmLabel: t("kit.tuneModal.apply.button"),
  });
  if (!ok) return;
  saveState.value = "saving";
  try {
    const switches = tuneRows.value
      .filter((r) => (r.name || "").trim())
      .map((r) => ({ flagName: r.name.trim(), flagValue: r.value ?? "" }));
    const res = await request("/v1/ai/model-tunes", {
      method: "PUT",
      body: { modelId: props.model.id, switches },
    });
    savedTune.value = res.rows?.length ? res : null;
    const reloaded = await reloadIfRunning();
    // QC-37 (toast law, supersedes B3-2/#14a): the outcome shows inline as
    // the `applyMsg` note right under the grid (lu-tune-applied) — the toast
    // duplicated a message already visible where the user is looking.
    applyMsg.value = reloaded
      ? t("kit.tuneModal.apply.doneReloaded")
      : t("kit.tuneModal.apply.doneNextLoad");
  } catch (e) {
    saveErr.value = e.message || t("kit.tuneModal.err.apply");
    tunePhase.value = "";
  } finally {
    saveState.value = "";
  }
}
async function removeTune() {
  saveErr.value = "";
  applyMsg.value = "";
  saveState.value = "removing";
  try {
    await request(`/v1/ai/model-tunes?modelId=${encodeURIComponent(props.model.id)}`, { method: "DELETE" });
    savedTune.value = null;
    await startTune(); // the grid returns to the layered defaults
    const reloaded = await reloadIfRunning(); // removal applies now too (active = resolved)
    // QC-37: the inline note is the visible surface (no toast duplicate).
    applyMsg.value = reloaded
      ? t("kit.tuneModal.remove.doneReloaded")
      : t("kit.tuneModal.remove.doneNextLoad");
  } catch (e) {
    saveErr.value = e.message || t("kit.tuneModal.err.remove");
    tunePhase.value = "";
  } finally {
    saveState.value = "";
  }
}

async function fetchResolved(id) {
  return resolveModelDefaults(id); // {switches, samplers, mtpCapable} — shared w/ ConfigColumn (one source)
}

// Fill the grid from a resolve result — SET rows = the layered switches PLUS the
// fit-computed values as ordinary rows (§7.6: the snapshot owns what you see;
// "Add to grid" is retired). ONE filler for open/reset/refresh — no drift between them.
function fillFromResolved(res) {
  tuneRows.value = [...res.switches, ...(res.computed || [])];
  tuneOrigins.value = {
    ...(res.origins || {}),
    ...Object.fromEntries((res.computed || []).map((c) => [c.name, "computed"])),
  };
}
async function startTune() {
  tuneRows.value = [];
  tuneResult.value = null;
  tuneErr.value = "";
  tunePhase.value = "";
  tuneDetail.value = "";
  try {
    fillFromResolved(await fetchResolved(props.model.id));
  } catch {
    tuneRows.value = []; // pre-fill is an enrichment; tuning still works empty
  }
}
async function resetTuneSwitches() {
  try {
    fillFromResolved(await fetchResolved(props.model.id));
  } catch (e) {
    tuneErr.value = e.message || t("kit.tuneModal.err.reset");
  }
}

// ── "Save for PC class" (ROUND 8 Task C; renamed 2026-07-26): keep a measured config as
// the PC CLASS CONFIG for every PC of this box's class — writes a class-tune row via the
// shared library client (the server derives the class when omitted). Offered ON
// a result (per the spec): you save what you just measured, not a blind grid.
const myClassKey = ref("");
const classSaveState = ref(""); // "" | saving | saved
const classSaveErr = ref("");
// #19: the library editors open as POPUPS from links (the B2-4 popups pattern) —
// nothing embedded in this modal anymore. The ref points at the per-model popup's
// mount; saveForClass's reload is optional-chained, so a closed popup is a no-op
// and an open one refreshes live.
const showClassLib = ref(false);
const showGlobalLib = ref(false);
const classTunesRef = ref(null);
const myClassLabel = computed(() => classKeyLabel(myClassKey.value));
async function loadMyClassKey() {
  try {
    const res = await listClassTunes();
    myClassKey.value = res.classKey || "";
  } catch {
    myClassKey.value = ""; // enrichment — the button simply doesn't render
  }
}
async function saveForClass() {
  classSaveErr.value = "";
  classSaveState.value = "saving";
  try {
    const switches = rowsToSwitches(tuneRows.value);
    if (!Object.keys(switches).length) throw new Error(t("kit.tuneModal.err.oneSwitch"));
    await putClassTune(props.model.id, switches);
    classSaveState.value = "saved";
    classTunesRef.value?.reload?.();
  } catch (e) {
    classSaveErr.value = e.message || t("kit.tuneModal.err.saveClass");
    classSaveState.value = "";
  }
}
function rowsToSwitches(rows) {
  const out = {};
  for (const r of rows || []) {
    const name = (r.name || "").trim();
    if (name) out[name] = r.value ?? "";
  }
  return out;
}
async function pollUntilSettled(maxMs = 180000) {
  const start = Date.now();
  for (;;) {
    const st = await request("/v1/llm-runner/status");
    if (st.status === "running") return st;
    if (st.status === "error") throw new Error(st.error || t("kit.tuneModal.err.load"));
    tuneDetail.value = st.detail || st.status || "";
    if (Date.now() - start > maxMs) throw new Error(t("kit.tuneModal.err.loadTimeout"));
    await new Promise((r) => setTimeout(r, 1200));
  }
}
// The measurement HISTORY (#142 rows 5+6): every real result persists — this
// modal records its own "Load & measure" numbers (it is the one actor that
// knows which switches it loaded; the auto-tune sweep records its trials
// server-side). Fire-and-forget: a history-write failure never fails a measure.
const measureHistRef = ref(null); // the drawer — refresh when a new row lands
function recordTuneResult(res, switches) {
  recordMeasurement(props.model.id, res.tokensPerSec, {
    vramTotalMb: res.vramTotalMb || 0, switches, source: "tune",
  })
    .then(() => measureHistRef.value?.reload?.())
    .catch(() => {});
}

async function runMeasure() {
  tuneErr.value = "";
  tuneResult.value = null;
  classSaveState.value = ""; // a new measurement is a new candidate for the class save
  classSaveErr.value = "";
  tunePhase.value = "loading";
  tuneDetail.value = "preparing";
  try {
    // Respawn cleanly with the requested flags (one model runs at a time).
    await request("/v1/llm-runner/stop", { method: "POST" }).catch(() => {});
    const switches = rowsToSwitches(tuneRows.value);
    await request("/v1/llm-runner/load", {
      method: "POST",
      body: { modelId: props.model.id, switches },
    });
    await pollUntilSettled();
    tunePhase.value = "measuring";
    const res = await request("/v1/llm-runner/measure", { method: "POST" });
    if (!res.ok) throw new Error(res.error || t("kit.tuneModal.err.measure"));
    tuneResult.value = res;
    tunePhase.value = "done";
    recordTuneResult(res, switches);
  } catch (e) {
    tuneErr.value = e.message || t("kit.tuneModal.err.measure");
    tunePhase.value = "error";
  }
}

// ── Auto-tune (2026-07-06): the server-side measured sweep — a short sequence of
// real load→measure trials (batch 512/512 vs baseline, then n-cpu-moe around the
// anchor) run as ONE job (POST /v1/llm-runner/auto-tune; embed co-resident so the
// floor is production-true). The modal POLLS the job, narrates each trial, and on
// completion FILLS THE GRID with the winner — nothing auto-saves here: review,
// tweak if you like, then Save tune (the human stays in the loop; QuickSetup's
// save-on-done variant passes save:true instead).
const autoState = ref(null); // the GET payload: {status, detail, trials, best, error}
let autoTimer = null;
const autoRunning = computed(() => autoState.value?.status === "running");
const autoTrials = computed(() => autoState.value?.trials || []);

function stopAutoPoll() {
  if (autoTimer) { clearInterval(autoTimer); autoTimer = null; }
}
function switchesToRows(switches) {
  return Object.entries(switches || {}).map(([name, value]) => ({ name, value: String(value ?? "") }));
}
async function pollAutoTune() {
  try {
    const st = await request("/v1/llm-runner/auto-tune");
    autoState.value = st;
    if (st.status === "running") return;
    stopAutoPoll();
    measureHistRef.value?.reload?.(); // the sweep recorded its trials server-side
    if (st.status === "done" && st.best) {
      tuneRows.value = switchesToRows(st.best.switches);
      // §7.6 provenance: the sweep replaced the grid — every set row is the
      // winner's value until the user edits or Applies (then it's their config).
      tuneOrigins.value = Object.fromEntries(
        Object.keys(st.best.switches || {}).map((k) => [k, "autotune"]));
      tuneResult.value = {
        tokensPerSec: st.best.tokensPerSec, completionTokens: null, ms: null,
        vramTotalMb: st.best.vramTotalMb, ramTotalMb: null,
      };
      tunePhase.value = "done";
    } else if (st.status === "error") {
      tuneErr.value = st.error || t("kit.tuneModal.err.autoTune");
      tunePhase.value = "error";
    }
  } catch (e) {
    stopAutoPoll();
    autoState.value = null;
    tuneErr.value = e.message || t("kit.tuneModal.err.autoTunePoll");
  }
}
async function runAutoTune() {
  // #18: an explicit OK/Cancel before committing the box to a long sweep.
  const ok = await confirmDialog({
    title: t("kit.tuneModal.auto.confirmTitle"),
    message: t("kit.tuneModal.auto.confirmBody"),
    confirmLabel: t("kit.tuneModal.auto.button"),
  });
  if (!ok) return;
  tuneErr.value = "";
  tuneResult.value = null;
  try {
    const st = await request("/v1/llm-runner/auto-tune", {
      method: "POST",
      body: { modelId: props.model.id },
    });
    if (st.ok === false) throw new Error(st.error || t("kit.tuneModal.err.autoTuneBusy"));
    autoState.value = st;
    stopAutoPoll();
    autoTimer = setInterval(pollAutoTune, 2000);
  } catch (e) {
    tuneErr.value = e.message || t("kit.tuneModal.err.autoTuneStart");
  }
}
async function cancelAutoTune() {
  try {
    await request("/v1/llm-runner/auto-tune/cancel", { method: "POST" });
  } catch { /* the poll surfaces the final state either way */ }
}

onMounted(() => {
  loadKnobCatalog();
  startTune();
  loadSavedTune();
  loadMyClassKey();
});
onBeforeUnmount(stopAutoPoll);
</script>

<template>
  <AppModal :title="t('kit.tuneModal.title', { model: model.name || model.id })" :max-width="'560px'" @close="emit('close')">
    <div class="lu-tune">
      <!-- QC-6 (2026-07-08) + QC-12 (2026-07-08, the user's exact copy: "replace
           (how tasks ask the model …) with new line below Apply, Samplers like
           temperature are set on the Tasks or Routing by feature tabs"). -->
      <p class="lu-muted lu-tune-lede">
        <i18n-t keypath="kit.tuneModal.lede" scope="global"><template #apply><b>{{ t('kit.tuneModal.apply.button') }}</b></template></i18n-t>
        <br />{{ t('kit.tuneModal.ledeSamplers') }}
      </p>

      <!-- #16 + B3-4: the tune state reads BIG — the §7.6 badge family (Auto-tuned /
           Hand-tuned / PC class config / Untuned); Remove lives in the footer beside
           Apply ("move it next to save button so you can see it"). -->
      <div class="lu-tune-saved">
        <UiTag :intent="headerBadge.intent" class="lu-tune-savedtag">{{ headerBadge.label }}</UiTag>
      </div>
      <!-- §7.6 drift: defaults changed SINCE this config was applied (vs the baseline
           stored at apply time) — refresh fills the GRID only; Apply commits. -->
      <div v-if="driftCount > 0" class="lu-tune-drift">
        <span>{{ t('kit.tuneModal.drift', { n: driftCount }, driftCount) }}</span>
        <UiButton intent="secondary" size="small"
          :title="t('kit.tuneModal.refreshTitle')"
          @click="refreshFromDefaults">{{ t('kit.tuneModal.refresh') }}</UiButton>
      </div>

      <!-- #21: ONLY the switch grid scrolls — everything after this block (status,
           auto-tune narration, the result) stays in view without scrolling. The
           grid is the SAME free-row editor as Global/Hardware (QC-17/18: only set
           switches render; ✕ removes = engine's own default; values are plain
           boxes), sectioned by source layer (QC-10). -->
      <div class="lu-tune-scroll">
        <KnobGrid v-model="tuneRows" :catalog="switchCatalog"
          :groups="TUNE_GROUPS" :row-groups="rowGroups" fallback-group="applied" />
        <div v-if="unknownNames.size" class="lu-tune-unk lu-muted">
          <UiTag intent="danger">{{ t('kit.tuneModal.unknown.tag') }}</UiTag>
          <span>{{ t('kit.tuneModal.unknown.body', { names: [...unknownNames].join(", ") }) }}</span>
        </div>
      </div>

      <!-- #19: the shared launch-config libraries open as popups — links, not
           embedded editors. -->
      <div class="lu-tune-tools">
        <UiButton intent="ghost" size="small" @click="resetTuneSwitches">{{ t('kit.tuneModal.resetDefault') }}</UiButton>
        <!-- the two library links wrap TOGETHER (a grouped flex child), never one
             stranded on each line -->
        <span class="lu-tune-libs">
          <UiButton intent="secondary" size="small"
            :title="t('kit.tuneModal.classLibTitle')"
            @click="showClassLib = true">{{ t('kit.tuneModal.classLib') }}</UiButton>
          <UiButton intent="secondary" size="small"
            :title="t('kit.tuneModal.globalLibTitle')"
            @click="showGlobalLib = true">{{ t('kit.tuneModal.globalLib') }}</UiButton>
        </span>
      </div>

      <LuMeasureHistory ref="measureHistRef" :model-id="model.id" />
      <div v-if="applyMsg" class="lu-tune-applied">{{ applyMsg }}</div>
      <div v-if="saveErr" class="lu-error">{{ saveErr }}</div>

      <div v-if="tunePhase === 'loading'" class="lu-tune-status">{{ t('kit.common.loading') }} {{ tuneDetail }}</div>
      <div v-else-if="tunePhase === 'measuring'" class="lu-tune-status">{{ t('kit.tuneModal.measuring') }}</div>

      <div v-if="autoRunning || (autoTrials.length && autoState?.status !== 'done')" class="lu-tune-status">
        {{ t('kit.tuneModal.auto.running', { detail: autoState?.detail || t('kit.tuneModal.auto.working') }) }}
      </div>
      <div v-if="autoTrials.length" class="lu-tune-trials lu-muted">
        <span v-for="trial in autoTrials" :key="trial.label" class="lu-tune-trial"
          :class="{ 'lu-tune-trial-bad': !trial.ok }"
          :title="trial.ok ? fmtTps(trial.tokensPerSec) : trial.error">
          {{ trial.label }}: {{ trial.ok ? fmtTps(trial.tokensPerSec) : "✗" }}
        </span>
        <span v-if="autoState?.status === 'done' && autoState?.best" class="lu-tune-trial lu-tune-trial-win">
          {{ t('kit.tuneModal.auto.winner') }}
        </span>
      </div>

      <div v-if="tuneResult" class="lu-tune-result">
        <div class="lu-tune-tps"><b>{{ fmtTps(tuneResult.tokensPerSec) }}</b></div>
        <div class="lu-tune-meta">
          {{ fmtTokens({ outputTokens: tuneResult.completionTokens }) }} · {{ fmtSeconds(tuneResult.ms) }}<template
            v-if="tuneResult.vramTotalMb"> · {{ t('kit.tuneModal.result.vram', { gb: gb(tuneResult.vramTotalMb) }) }}</template><template
            v-if="tuneResult.ramTotalMb"> · {{ t('kit.tuneModal.result.ram', { gb: gb(tuneResult.ramTotalMb) }) }}</template>
        </div>
        <div v-if="!tuneResult.vramTotalMb" class="lu-muted lu-tune-cpu">{{ t('kit.tuneModal.result.cpu') }}</div>
        <!-- Apply keeps this config for THIS machine; this keeps it as the shared
             starting point for every PC of the same class (ROUND 8 Task C — "on a
             result": you share what you measured, not a blind grid). -->
        <div v-if="myClassKey" class="lu-tune-clsrow">
          <template v-if="classSaveState === 'saved'">
            <span class="lu-muted">{{ t('kit.tuneModal.result.classSaved', { name: myClassLabel }) }}</span>
          </template>
          <template v-else>
            <span class="lu-muted">{{ t('kit.tuneModal.result.offerClass', { name: myClassLabel }) }}</span>
            <UiButton intent="secondary" size="small" :loading="classSaveState === 'saving'"
              @click="saveForClass">{{ t('kit.tuneModal.result.saveClass') }}</UiButton>
          </template>
        </div>
        <div v-if="classSaveErr" class="lu-error">{{ classSaveErr }}</div>
      </div>

      <div v-if="tuneErr" class="lu-error">{{ tuneErr }}</div>
    </div>

    <!-- #19: the library popups — the SAME shared components the Edit view's
         buttons open (B2-4), here scoped to this model where it applies. -->
    <AppModal v-if="showClassLib" :title="t('kit.tuneModal.classLibModal', { model: model.name || model.id })"
      :max-width="'700px'" @close="showClassLib = false">
      <LuClassTunes ref="classTunesRef" expanded :model-id="model.id" :catalog="switchCatalog" />
    </AppModal>
    <AppModal v-if="showGlobalLib" :title="t('kit.globalSwitches.title')"
      :max-width="'760px'" @close="showGlobalLib = false">
      <LuGlobalSwitches expanded />
    </AppModal>

    <template #footer>
      <UiButton intent="ghost" @click="emit('close')">{{ t('kit.common.close') }}</UiButton>
      <span class="lu-tmm-spacer" />
      <UiButton v-if="savedTune" intent="secondary" :loading="saveState === 'removing'" :disabled="autoRunning"
        :title="t('kit.tuneModal.remove.title')"
        @click="removeTune">{{ t('kit.tuneModal.remove.button') }}</UiButton>
      <UiButton v-if="!autoRunning" intent="secondary" :disabled="tuneBusy"
        :title="t('kit.tuneModal.auto.title')"
        @click="runAutoTune">{{ t('kit.tuneModal.auto.button') }}</UiButton>
      <UiButton v-else intent="danger"
        :title="t('kit.tuneModal.auto.cancelTitle')"
        @click="cancelAutoTune">{{ t('kit.tuneModal.auto.cancel') }}</UiButton>
      <UiButton intent="success" :loading="saveState === 'saving'" :disabled="autoRunning"
        :title="t('kit.tuneModal.apply.buttonTitle')"
        @click="applyTune">{{ t('kit.tuneModal.apply.button') }}</UiButton>
      <UiButton intent="primary" :loading="tuneBusy" :disabled="autoRunning" @click="runMeasure">
        {{ tuneResult ? t('kit.tuneModal.measureAgain') : t('kit.tuneModal.loadMeasure') }}
      </UiButton>
    </template>
  </AppModal>
</template>

<style scoped>
.lu-tune { display: flex; flex-direction: column; gap: 12px; }
.lu-tune-lede { font-size: 12px; margin: 0; }
.lu-tune-saved { display: flex; align-items: center; gap: 10px; }
/* #16: the tune state reads BIG — a full-size badge, not row-note fine print. */
.lu-tune-saved .lu-tune-savedtag { font-size: 13px; padding: 5px 14px; }
/* §7.6 drift notice: one line + its action, quietly urgent (warn tint). */
.lu-tune-drift {
  display: flex; align-items: center; gap: 10px; flex-wrap: wrap;
  font-size: 11.5px; line-height: 1.45; color: var(--ink-2);
  padding: 7px 10px; border: 1px solid var(--warn-line, var(--border));
  background: var(--warn-soft, var(--surface-2)); border-radius: var(--r-sm, 8px);
}
.lu-tune-drift > span { flex: 1; min-width: 200px; }
/* #21: the switch grid scrolls in ITS OWN capped region so the load/measure status
   and the result below never fall out of view. scrollbar-gutter keeps a classic
   (space-taking) scrollbar from shifting rows when it appears. */
.lu-tune-scroll {
  max-height: 280px; overflow-y: auto; scrollbar-gutter: stable;
  display: flex; flex-direction: column; gap: 12px; padding-right: 4px;
}
.lu-tune-tools { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.lu-tune-libs { margin-left: auto; display: flex; gap: 8px; flex-wrap: wrap; justify-content: flex-end; }
.lu-tune-unk { display: flex; align-items: baseline; gap: 8px; font-size: 11.5px; }
.lu-tune-applied { font-size: 12px; color: var(--success, #3a7d63); font-weight: 600; }
.lu-tune-status { font-size: 12.5px; color: var(--ink-2); }
.lu-tune-result { padding: 12px 14px; background: var(--accent-soft); border: 1px solid var(--accent-line, var(--accent)); border-radius: var(--r-sm, 8px); }
.lu-tune-tps { font-size: 13px; color: var(--ink-2); }
.lu-tune-tps b { font-size: 22px; color: var(--accent-ink, var(--accent)); font-weight: 800; }
.lu-tune-meta { font-size: 11.5px; color: var(--ink-2); margin-top: 3px; }
.lu-tune-cpu { font-size: 11px; margin-top: 3px; }
.lu-tune-clsrow { display: flex; align-items: center; gap: 10px; margin-top: 8px; font-size: 11.5px; }
.lu-tune-clsrow > span { flex: 1; min-width: 0; line-height: 1.45; }
.lu-tune-trials { display: flex; flex-wrap: wrap; gap: 6px; font-size: 11px; }
.lu-tune-trial { padding: 2px 8px; background: var(--surface-2); border: 1px solid var(--border); border-radius: 999px; }
.lu-tune-trial-bad { opacity: 0.6; text-decoration: line-through; }
.lu-tune-trial-win { border-color: var(--accent-line, var(--accent)); background: var(--accent-soft); color: var(--accent-ink, var(--accent)); }
.lu-tmm-spacer { flex: 1; }
</style>
