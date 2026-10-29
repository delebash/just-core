<script setup>
// SPDX-License-Identifier: MIT
// "Local engine" panel — INSTALL the llama.cpp engine as its OWN step, separate
// from downloading a model (a model load requires the engine present; see the
// runner's _run_load). Shows install status + the selected build/gpu, an
// Install / Update button with a progress bar, the last spawn-log tail, and any
// error. Backed by the shared runner /v1/llm-runner/engine/* endpoints. Its
// sibling precedent is LuModelCatalog (UiProgress + status surface); both share
// the common/composables/usePoll.js interval poller. Hosts the collapsed "Engine
// binaries" editor (LuRunnerBinaries) as its own drawer at the panel
// bottom — the binary download URLs belong to the engine you install, so they
// live UNDER this panel (user, 2026-07-02), not as a separate card by the catalog.
import { computed, onMounted, ref } from "vue";
import { useI18n } from "vue-i18n";

import UiButton from "../common/components/UiButton.vue";
import UiInput from "../common/components/UiInput.vue";
import DownloadBar from "../common/components/DownloadBar.vue";
import UiSelect from "../common/components/UiSelect.vue";
import LuRunnerBinaries from "./LuRunnerBinaries.vue";
import LuEngineInstallButton from "./LuEngineInstallButton.vue";
import LuEngineUpdateButton from "./LuEngineUpdateButton.vue";
import { request } from "../client.js";
import { engineKnobsBody } from "../engineKnobs.js";
import { pushToast } from "../common/services/toastBridge.js";
import { useEngine } from "../composables/useEngine.js";
import { usePoll } from "../common/composables/usePoll.js";

// Engine state comes from the ONE shared composable (useEngine). Since QC-39
// promoted the built-in provider out of the list (its old row — which carried
// the Install / Uninstall / Update-available / Reinstall cluster — is gone),
// THIS panel is the engine's one action surface: status line, the full button
// cluster, install progress/errors, and the Details drawer. Install POLLING
// lives in the composable, so progress keeps flowing whichever surface started
// it and whichever is mounted.
const { engineState: st, error, statusKnown, installed, installing, progressLabel, updatePolicy, setUpdatePolicy, updateInfo, checkForUpdate, refreshEngine, install: engInstall, cancel: engCancel, uninstall: engUninstall, setBackend, busy: engBusy } = useEngine();
// THE shared DownloadBar (not a hand-rolled UiProgress + separate Cancel) — a task-shaped
// view of the install so this panel matches QuickSetup / the model bars exactly. The bar's
// own header carries Cancel; `progressLabel` already carries % · size · speed · ETA.
const engineTask = computed(() => ({
  state: "running",
  done: st.value?.downloaded || 0,
  total: st.value?.total || 0,
  label: progressLabel.value,
  error: "",
  cancel: engCancel,
}));
const showLog = ref(false);
const logText = ref("");
// Collapsed by default (user, 2026-07-06: "collapse the engine panel … click to
// expand collapse for details"). Install progress + errors render OUTSIDE the
// collapse — an in-flight install or a failure must never hide. The B1 decision
// (knobs editable BEFORE install) survives: Details opens regardless of install state.
const showDetails = ref(false);
const cudaRuntimeMissing = computed(
  () => installed.value && st.value?.gpu?.startsWith("cuda") && st.value?.hasRuntime === false,
);

// Acceleration-backend selector (2026-07-14): the families this box can actually run
// (a detected runtime WITH a real binary) come from engine_status.offerBackends; the
// pin (preferredGpu) + what's installed/active drive the labels. Shown only when there's
// a genuine choice (>1 offerable), so a single-backend box stays uncluttered.
const { t, n: fmtNum } = useI18n();
const FAMILIES = new Set(["cuda", "vulkan", "rocm", "metal"]);
const famLabel = (f) => (FAMILIES.has(f) ? t(`kit.engine.family.${f}`) : f);
const familyOf = (g) => (g && g.startsWith("cuda") ? "cuda" : g || "");
const backendOptions = computed(() => {
  const fams = st.value?.offerBackends || [];
  const inst = new Set((st.value?.installedGpus || []).map(familyOf));
  return [
    { value: "", label: t("kit.engine.autoBackend") },
    ...fams.map((f) => ({
      value: f,
      label: inst.has(f) ? famLabel(f) : t("kit.engine.willDownload", { backend: famLabel(f) }),
    })),
  ];
});
const showBackendPicker = computed(() => (st.value?.offerBackends?.length || 0) > 1);
const activeBackendLabel = computed(() => {
  const a = st.value?.activeGpu;
  return a ? (FAMILIES.has(familyOf(a)) ? famLabel(familyOf(a)) : a) : "";
});
function onPickBackend(v) {
  setBackend(v);
}

// Resident set (4a) — the live loaded/sleeping/in-flight models, the VRAM budget, and
// the two operator knobs. GET /resident is read-only + safe to poll (never spawns the
// router), so a 2nd interval poller drives this independently of the install poll.
const resident = ref(null);
const modelsMax = ref(null); // editable knob drafts: seeded ONCE from /resident, then
const sleepIdleSeconds = ref(null); // owned by the user until Save (no poll clobber).
const savingKnobs = ref(false);
const knobErr = ref("");

// The fit/speed knobs (fit-redesign §13.17 as AMENDED at the Phase 3 go — the
// user's word, verbatim: "move the margin and cap nd the new fields under
// loaded models where Models kept loaded at once live, not under engine
// binaries"): VRAM safety margin + ctx cap MOVED here from LuRunnerBinaries;
// the speed-band thresholds (§8.14) + RAM headroom (§13.13) join them. Same
// owned-until-Save drafts, same partial-PUT save path.
const safetyMarginMb = ref(null);
const ctxCapTokens = ref(null);
const bandFastToks = ref(null);
const bandFineToks = ref(null);
const bandSlowToks = ref(null);
// The band dead zone (speed-truth plan 2026-09-19 §5) — stored as a fraction,
// edited as a percent (10, not 0.1: a number a person can read).
const bandDeadzonePct = ref(null);
// The fallback pick's speed-floor grace (speed-truth plan 2026-09-19 §7) — stored as a
// fraction, edited as a percent like the dead zone above.
const speedFloorGracePct = ref(null);
const ramHeadroomMb = ref(null);

// The fit/speed drafts, seeded ONCE from GET /engine-config at mount (owned until Save).
async function loadConfigKnobs() {
  try {
    const r = await request("/v1/ai/engine-config");
    if (safetyMarginMb.value === null) safetyMarginMb.value = r.safetyMarginMb;
    if (ctxCapTokens.value === null) ctxCapTokens.value = r.ctxCapTokens;
    if (bandFastToks.value === null) bandFastToks.value = r.bandFastToks;
    if (bandFineToks.value === null) bandFineToks.value = r.bandFineToks;
    if (bandSlowToks.value === null) bandSlowToks.value = r.bandSlowToks;
    if (bandDeadzonePct.value === null) bandDeadzonePct.value = Math.round((r.bandDeadzoneFrac || 0) * 100);
    if (speedFloorGracePct.value === null) speedFloorGracePct.value = Math.round((r.speedFloorGrace || 0) * 100);
    if (ramHeadroomMb.value === null) ramHeadroomMb.value = r.ramHeadroomMb;
  } catch {
    // transient — the drafts stay null and Save simply omits them (partial PUT)
  }
}

const { start: startResPoll } = usePoll(refreshResident, 2500);

const residentModels = computed(() => resident.value?.models || []);
const vramBudget = computed(() => {
  const r = resident.value;
  if (!r?.vramTotalMb) return ""; // no measurable budget pool → hide the line
  // Phase 4: the budget is ARCH-AWARE — on a one-pool box (iGPU / Apple) the
  // numbers are the shared pool, so the label says Memory, not VRAM.
  const unified = !!r.memArch && r.memArch !== "discrete";
  return t(unified ? "kit.engine.budgetMemory" : "kit.engine.budgetVram", { used: r.committedMb, total: r.vramTotalMb, free: r.remainingMb });
});
// Every status the endpoint can emit gets a tone; unknown → treated as busy, never hidden.
function statusClass(s) {
  if (s === "loaded") return "is-on";
  if (s === "error" || s === "failed") return "is-err";
  if (s === "sleeping" || s === "unloaded") return "is-idle";
  return "is-busy"; // loading | starting | downloading | anything else
}

async function toggleLog() {
  showLog.value = !showLog.value;
  if (showLog.value) {
    try {
      const r = await request("/v1/llm-runner/engine/log?tail=200");
      logText.value = r?.text || t("kit.engine.log.none");
    } catch {
      logText.value = t("kit.engine.log.failed");
    }
  }
}

async function refreshResident() {
  try {
    const r = await request("/v1/llm-runner/resident");
    resident.value = r;
    // Seed the editable knobs ONCE; later polls must not clobber an in-progress edit.
    if (modelsMax.value === null && r.modelsMax != null) modelsMax.value = r.modelsMax;
    if (sleepIdleSeconds.value === null && r.sleepIdleSeconds != null) sleepIdleSeconds.value = r.sleepIdleSeconds;
  } catch {
    // a transient read failure just leaves the last snapshot; the poll retries
  }
}

async function saveKnobs() {
  savingKnobs.value = true;
  knobErr.value = "";
  try {
    // Send ONLY this form's knobs — a partial PUT. Never echo a full config, or it
    // would clobber the binaries / pinned build / VRAM margin the binaries editor
    // owns. A box with no number in it (a failed seed fetch, or cleared) is omitted (engineKnobs.js).
    const body = engineKnobsBody({
      modelsMax: modelsMax.value,
      sleepIdleSeconds: sleepIdleSeconds.value,
      safetyMarginMb: safetyMarginMb.value,
      ctxCapTokens: ctxCapTokens.value,
      bandFastToks: bandFastToks.value,
      bandFineToks: bandFineToks.value,
      bandSlowToks: bandSlowToks.value,
      bandDeadzonePct: bandDeadzonePct.value,
      speedFloorGracePct: speedFloorGracePct.value,
      ramHeadroomMb: ramHeadroomMb.value,
    });
    const r = await request("/v1/ai/engine-config", { method: "PUT", body });
    modelsMax.value = r.modelsMax; // re-sync from the server (reflects the clamps)
    sleepIdleSeconds.value = r.sleepIdleSeconds;
    safetyMarginMb.value = r.safetyMarginMb;
    ctxCapTokens.value = r.ctxCapTokens;
    bandFastToks.value = r.bandFastToks;
    bandFineToks.value = r.bandFineToks;
    bandSlowToks.value = r.bandSlowToks;
    bandDeadzonePct.value = Math.round((r.bandDeadzoneFrac || 0) * 100); // reflects the server clamp
    speedFloorGracePct.value = Math.round((r.speedFloorGrace || 0) * 100);
    ramHeadroomMb.value = r.ramHeadroomMb;
    // The user's 2026-08-13 checkpoint ask: Save must SAY it saved (the
    // fields re-syncing silently read as nothing happening). After the await
    // → success-only (the FeatureLab precedent).
    pushToast({ message: t("kit.engine.saved"), kind: "success" });
    await refreshResident();
  } catch (e) {
    knobErr.value = e.message || t("kit.engine.err.save");
  } finally {
    savingKnobs.value = false;
  }
}

onMounted(() => {
  refreshEngine();
  checkForUpdate(); // A5 — policy-gated; feeds the panel's own Update-available slot
  refreshResident();
  startResPoll();
  loadConfigKnobs();
});
</script>

<template>
  <div class="lu-eng">
    <div class="lu-eng-row">
      <div class="lu-eng-info">
        <div class="lu-eng-title">{{ t('kit.engine.title') }}</div>
        <div class="lu-eng-sub">
          <template v-if="installing">{{ t('kit.engine.installing') }}</template>
          <template v-else-if="installed">
            {{ t('kit.engine.installed') }}<span v-if="st.build"> · {{ st.build }}</span><span v-if="st.gpu"> · {{ st.gpu }}</span>
            <span v-if="cudaRuntimeMissing" class="lu-eng-warn"> · {{ t('kit.engine.cudaMissing') }}</span>
          </template>
          <!-- QC-13: never claim "Not installed" before the status has actually been
               fetched — the false claim (with an Install button) rendered during the
               pre-fetch window, and stuck when the first fetch failed. -->
          <template v-else-if="!statusKnown">{{ t('kit.engine.checking') }}</template>
          <template v-else>{{ t('kit.engine.notInstalled') }}</template>
        </div>
      </div>
      <div class="lu-eng-actions">
        <!-- The full engine cluster (QC-39 — the built-in's list row that used to
             carry it is gone): Install when NOT installed (#135), and when
             installed Uninstall + the update slot next to it (the row's own
             grammar, user 2026-07-07: "move update button next to uninstall") —
             "Update available" (info) when a newer build exists, else "Reinstall"
             (re-download the pinned build — a REPAIR, distinct from an update:
             the user's words). While an install RUNS the buttons yield to the
             progress bar below (#119 — the exe lands on disk early, so a
             mid-install `installed` flip must not swap the cluster). -->
        <LuEngineInstallButton v-if="statusKnown && !installed && !installing" />
        <template v-if="installed && !installing">
          <UiButton intent="ghost" size="small"
            :loading="engBusy" :title="t('kit.engine.uninstallTitle')"
            @click="engUninstall">{{ t('kit.engine.uninstall') }}</UiButton>
          <LuEngineUpdateButton v-if="updateInfo?.updateAvailable" />
          <UiButton v-else intent="secondary" size="small"
            :loading="engBusy" :title="t('kit.engine.reinstallTitle')"
            @click="engInstall(true)">{{ t('kit.engine.reinstall') }}</UiButton>
        </template>
        <UiButton intent="ghost" size="small" @click="showDetails = !showDetails">
          {{ showDetails ? t('kit.engine.hideDetails') : t('kit.engine.details') }}
        </UiButton>
      </div>
    </div>

    <!-- Acceleration backend (2026-07-14): a REAL switch, replacing the old phantom
         "CUDA available" label — pick which GPU backend the engine runs on; the variant
         downloads on demand and a manual restart applies it. Shown only when the box has
         a genuine choice (e.g. an NVIDIA driver exposes both CUDA and Vulkan). -->
    <!-- Warm-on-startup moved OUT of this per-provider Edit panel onto the main Local page
         (AiModelsArea → LuWarmStartupToggle) — it's a global engine-config knob, not a
         per-provider one (user, 2026-07-21: "its buried in edit put it on main local"). -->
    <div v-if="showBackendPicker" class="lu-eng-backend">
      <span class="lu-eng-backend-cap">{{ t('kit.engine.backend') }}</span>
      <UiSelect :model-value="st.preferredGpu || ''" width="name"
        :options="backendOptions" :disabled="engBusy || installing"
        @update:model-value="onPickBackend" />
      <span v-if="activeBackendLabel" class="lu-eng-backend-active">{{ t('kit.engine.runningOn', { backend: activeBackendLabel }) }}</span>
    </div>

    <!-- Progress + errors live OUTSIDE the collapse: an in-flight install or a failure
         must stay visible while the panel is folded (user, 2026-07-06). -->
    <DownloadBar v-if="installing" class="lu-eng-installing"
      :task="engineTask" :title="t('kit.quickSetup.engineBarTitle')" :role="t('kit.quickSetup.engineBarRole')" />

    <p v-if="error" class="lu-eng-err">{{ error }}</p>

    <template v-if="showDetails">
      <div class="lu-eng-logrow">
        <UiButton intent="ghost" size="small" @click="toggleLog">{{ showLog ? t('kit.engine.log.hide') : t('kit.engine.log.view') }}</UiButton>
      </div>
      <pre v-if="showLog" class="lu-eng-log">{{ logText }}</pre>

      <!-- Resident set + the two residency knobs (4a). The RUNTIME half (loaded list + VRAM
           budget) needs an installed engine; the two knobs are persisted config (engine-config)
           and stay editable BEFORE install (ledger B1 — the user's "C" pick; the collapse gates
           on a click, never on install state). -->
      <div class="lu-eng-res">
        <template v-if="installed">
          <div class="lu-eng-res-head">
            <span class="lu-eng-res-title">{{ t('kit.engine.loaded') }}</span>
            <span v-if="vramBudget" class="lu-eng-res-vram">{{ vramBudget }}</span>
          </div>

          <ul v-if="residentModels.length" class="lu-eng-res-list">
            <li v-for="m in residentModels" :key="m.id" class="lu-eng-res-item">
              <span class="lu-eng-res-id">{{ m.id }}</span>
              <span class="lu-eng-res-status" :class="statusClass(m.status)">{{ m.status }}</span>
              <span v-if="m.nCtx" class="lu-eng-res-meta">{{ t('kit.engine.ctx', { n: fmtNum(m.nCtx) }) }}</span>
              <span v-if="m.vramMb" class="lu-eng-res-meta">{{ t('kit.engine.mb', { n: m.vramMb }) }}</span>
            </li>
          </ul>
          <p v-else class="lu-eng-res-empty">
            {{ resident?.router ? t('kit.engine.noneLoaded') : t('kit.engine.loadsOnFirstUse') }}
          </p>
        </template>

        <div class="lu-eng-knobs">
          <label class="lu-eng-knob">
            <span class="lu-eng-knob-cap">{{ t('kit.engine.knob.maxModels') }}</span>
            <UiInput v-model="modelsMax" type="number" width="token" />
          </label>
          <label class="lu-eng-knob">
            <span class="lu-eng-knob-cap">{{ t('kit.engine.knob.idleUnload') }}</span>
            <UiInput v-model="sleepIdleSeconds" type="number" width="token" />
          </label>
          <!-- Memory + speed knobs — HERE, with the loaded-models knobs, by the
               user's ruling at the Phase 3 go ("move the margin and cap nd the new
               fields under loaded models…, not under engine binaries"). -->
          <label class="lu-eng-knob" :title="t('kit.engine.knob.vramMarginTitle')">
            <span class="lu-eng-knob-cap">{{ t('kit.engine.knob.vramMargin') }}</span>
            <UiInput v-model="safetyMarginMb" type="number" width="token" />
          </label>
          <label class="lu-eng-knob" :title="t('kit.engine.knob.ctxCapTitle')">
            <span class="lu-eng-knob-cap">{{ t('kit.engine.knob.ctxCap') }}</span>
            <UiInput v-model="ctxCapTokens" type="number" width="token" />
          </label>
          <label class="lu-eng-knob" :title="t('kit.engine.knob.ramHeadroomTitle')">
            <span class="lu-eng-knob-cap">{{ t('kit.engine.knob.ramHeadroom') }}</span>
            <UiInput v-model="ramHeadroomMb" type="number" width="token" />
          </label>
          <!-- The speed-band lines (§8.14): where the catalog's fast/fine/slow/painful
               labels switch over, in tokens per second. ~8 is reading speed. -->
          <div class="lu-eng-dlgroup">
            <div class="lu-eng-dlgroup-head">
              <span class="lu-eng-dlgroup-title">{{ t('kit.engine.band.title') }}</span>
            </div>
            <div class="lu-eng-dlgroup-fields">
              <label class="lu-eng-knob" :title="t('kit.engine.band.fastTitle')">
                <span class="lu-eng-knob-cap">{{ t('kit.engine.band.fast') }}</span>
                <UiInput v-model="bandFastToks" type="number" width="token" />
              </label>
              <label class="lu-eng-knob" :title="t('kit.engine.band.fineTitle')">
                <span class="lu-eng-knob-cap">{{ t('kit.engine.band.fine') }}</span>
                <UiInput v-model="bandFineToks" type="number" width="token" />
              </label>
              <label class="lu-eng-knob" :title="t('kit.engine.band.slowTitle')">
                <span class="lu-eng-knob-cap">{{ t('kit.engine.band.slow') }}</span>
                <UiInput v-model="bandSlowToks" type="number" width="token" />
              </label>
              <label class="lu-eng-knob" :title="t('kit.engine.band.deadZoneTitle')">
                <span class="lu-eng-knob-cap">{{ t('kit.engine.band.deadZone') }}</span>
                <UiInput v-model="bandDeadzonePct" type="number" width="token" />
              </label>
              <label class="lu-eng-knob" :title="t('kit.engine.band.floorTitle')">
                <span class="lu-eng-knob-cap">{{ t('kit.engine.band.floor') }}</span>
                <UiInput v-model="speedFloorGracePct" type="number" width="token" />
              </label>
            </div>
          </div>
          <label class="lu-eng-knob">
            <span class="lu-eng-knob-cap">{{ t('kit.engine.updates') }}</span>
            <UiSelect :model-value="updatePolicy" width="token"
              :options="[{ value: 'notify', label: t('kit.engine.updateNotify') }, { value: 'off', label: t('kit.engine.updateOff') }]"
              @update:model-value="setUpdatePolicy" />
          </label>
          <UiButton intent="primary" size="small" :loading="savingKnobs" @click="saveKnobs">{{ t('kit.common.save') }}</UiButton>
        </div>
        <p v-if="knobErr" class="lu-eng-err">{{ knobErr }}</p>
      </div>

      <LuRunnerBinaries />
    </template>
  </div>
</template>

<style scoped>
.lu-eng {
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 14px 16px;
  border: 1px solid var(--lu-border, var(--border, #e2e2e2));
  border-radius: 10px;
  background: var(--lu-surface, var(--surface, #fff));
}
.lu-eng-row {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
}
.lu-eng-info { min-width: 0; }
.lu-eng-title { font-weight: 600; font-size: 14px; }
.lu-eng-sub {
  font-size: 12.5px;
  color: var(--lu-ink-2, var(--ink-2, #666));
  margin-top: 2px;
  line-height: 1.4;
}
.lu-eng-warn { color: var(--lu-warn, #b45309); }
.lu-eng-actions { display: flex; gap: 6px; flex-shrink: 0; }
.lu-eng-backend { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
.lu-eng-backend-cap { font-size: 12.5px; font-weight: 600; color: var(--lu-ink-2, var(--ink-2, #666)); }
.lu-eng-backend-active { font-size: 11.5px; color: var(--lu-ink-2, var(--ink-2, #666)); font-variant-numeric: tabular-nums; }
/* Content-size the backend select so its box hugs the current label (Auto / CUDA /
   Vulkan) instead of filling the width="name" max-width cap — the shared trigger is
   width:100% by default, so the cap alone leaves a wide dead gap before the chevron. */
.lu-eng-backend :deep(.ui-select-trigger) { width: fit-content; }
.lu-eng-err { margin: 0; font-size: 12.5px; color: var(--lu-danger, var(--danger, #b91c1c)); }
/* the install progress IS the shared DownloadBar now (it styles itself) — no local bar CSS */
.lu-eng-log {
  max-height: 220px;
  overflow: auto;
  margin: 0;
  padding: 8px 10px;
  border-radius: 6px;
  border: 1px solid var(--lu-border, var(--border, #e2e2e2));
  background: var(--lu-surface-2, var(--surface-2, #f6f6f6));
  font-size: 11.5px;
  line-height: 1.45;
  white-space: pre-wrap;
  word-break: break-word;
}

/* Resident set + the two residency knobs (4a) */
.lu-eng-res {
  border-top: 1px solid var(--lu-border, var(--border, #e2e2e2));
  padding-top: 12px;
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.lu-eng-res-head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 12px;
  flex-wrap: wrap;
}
.lu-eng-res-title { font-weight: 600; font-size: 13px; }
.lu-eng-res-vram {
  font-size: 11.5px;
  color: var(--lu-ink-2, var(--ink-2, #666));
  font-variant-numeric: tabular-nums;
}
.lu-eng-res-list { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 4px; }
.lu-eng-res-item { display: flex; align-items: center; gap: 8px; font-size: 12.5px; }
.lu-eng-res-id {
  font-family: var(--font-mono, monospace);
  color: var(--lu-ink, var(--ink, #222));
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  min-width: 0;
}
.lu-eng-res-status {
  flex-shrink: 0;
  font-size: 10.5px;
  font-weight: 700;
  letter-spacing: .03em;
  text-transform: uppercase;
  padding: 1px 6px;
  border-radius: 10px;
  background: var(--lu-surface-2, var(--surface-2, #f0f0f0));
  color: var(--lu-ink-2, var(--ink-2, #666));
}
.lu-eng-res-status.is-on { background: rgba(21, 128, 61, .14); color: #15803d; }
.lu-eng-res-status.is-busy { background: rgba(180, 83, 9, .14); color: #b45309; }
.lu-eng-res-status.is-err { background: rgba(185, 28, 28, .14); color: #b91c1c; }
.lu-eng-res-meta {
  flex-shrink: 0;
  font-size: 11.5px;
  color: var(--lu-ink-2, var(--ink-2, #666));
  font-variant-numeric: tabular-nums;
}
.lu-eng-res-empty { margin: 0; font-size: 12.5px; color: var(--lu-ink-2, var(--ink-2, #666)); }
.lu-eng-knobs { display: flex; flex-wrap: wrap; align-items: flex-end; gap: 12px; }
.lu-eng-knob { display: flex; flex-direction: column; gap: 3px; }
.lu-eng-knob-cap { font-size: 11.5px; color: var(--lu-ink-2, var(--ink-2, #666)); }
/* A titled sub-group of knobs (the speed bands): its title over its fields, a rule above. */
.lu-eng-dlgroup { flex-basis: 100%; display: flex; flex-direction: column; gap: 8px; margin-top: 4px; padding-top: 10px; border-top: 1px solid var(--lu-border, var(--border, #e5e5e5)); }
.lu-eng-dlgroup-head { display: flex; align-items: center; gap: 10px; }
.lu-eng-dlgroup-title { font-size: 12px; font-weight: 700; letter-spacing: .01em; color: var(--lu-ink-1, var(--ink-1, #222)); }
.lu-eng-dlgroup-fields { display: flex; flex-wrap: wrap; align-items: flex-end; gap: 12px; }
</style>
