<script setup>
// SPDX-License-Identifier: MIT
// One kit runtime on the AI page (the engines plan, K10) — its engine and the models it runs, as llama.cpp's engine
// row and catalog are: the build for this computer and what it needs (said before anything downloads), Install with
// progress and Cancel (the kit's DownloadBar), Remove; each model the app brings (its runtime_model rows) with its
// size and licence, on this computer or not, running or not, Download with progress and Cancel, Delete. A page
// opened while an install or a download runs picks it up (the tasks' arm/apply — the catalog's way). Each model shows
// the catalog's chip — whether it fits this computer and its speed band, measured beating predicted (modelPick.js
// fitLabel, speedBandLabel, fitWarning: the one way, 2026-10-27). No room on the drive and removing what is busy are
// said in words (K10b). `runtimeId` names the runtime (GET /v1/ai/runtimes).
import { computed, onBeforeUnmount, onMounted, reactive, ref } from "vue";
import { useI18n } from "vue-i18n";
import { request } from "../client.js";
import DownloadBar from "../common/components/DownloadBar.vue";
import UiBanner from "../common/components/UiBanner.vue";
import UiButton from "../common/components/UiButton.vue";
import UiField from "../common/components/UiField.vue";
import UiInput from "../common/components/UiInput.vue";
import UiProgress from "../common/components/UiProgress.vue";
import UiSegmented from "../common/components/UiSegmented.vue";
import UiSelect from "../common/components/UiSelect.vue";
import { confirmDialog } from "../common/services/dialog.js";
import { committedNumber } from "../common/components/numberBox.js";
import { fmtBytes } from "../common/services/downloadRate.js";
import { kitT } from "../common/services/kitI18n.js";
import { fitLabel, fitWarning, speedBandLabel } from "../common/services/modelPick.js";
import { pushToast } from "../common/services/toastBridge.js";
import { reportError } from "../common/services/reportError.js";
import { createDownloadTask, readEngineStatus, readRuntimeModelStatus, runtimeEngineChannel, runtimeModelChannel } from "../composables/useDownloadTask.js";
import { engineNeedWords, refusalProblem } from "../services/runtimeWords.js";

const props = defineProps({
  runtimeId: { type: String, required: true },
});
const { t, te } = useI18n();

const base = `/v1/ai/runtimes/${encodeURIComponent(props.runtimeId)}`;
const engine = ref(null);
const models = ref([]);
const loadFailed = ref(false);
const engineTask = createDownloadTask(runtimeEngineChannel(props.runtimeId));
const modelTasks = reactive({}); // model id → its download task
const taskFor = (id) => (modelTasks[id] ??= createDownloadTask(runtimeModelChannel(props.runtimeId, () => id)));

async function load() {
  try {
    const [e, m] = await Promise.all([request(`${base}/engine/status`), request(`${base}/models`)]);
    engine.value = e;
    if (idleMinutes.value === null && e?.idleSeconds != null) idleMinutes.value = Math.round(e.idleSeconds / 60);
    if (bandDrafts.fast === null && e?.bands) Object.assign(bandDrafts, { fast: e.bands.fast, fine: e.bands.fine, slow: e.bands.slow });
    models.value = m.models || [];
    loadFailed.value = false;
  } catch {
    loadFailed.value = true;
  }
}

// One poll for the tab while anything runs: the server's state fed to the tasks (a page opened mid-install arms them)
let timer = null;
let gone = false;
const busy = () =>
  engineTask.state === "running" || Object.values(modelTasks).some((x) => x.state === "running") || (engine.value?.addons ?? []).some((a) => a.status === "installing");
function feed() {
  const e = engine.value;
  if (e?.status === "installing" && engineTask.state !== "running") engineTask.arm(kitT("kit.engine.phase.downloading"));
  if (engineTask.state === "running" && e) engineTask.apply(readEngineStatus(e));
  for (const m of models.value) {
    const task = taskFor(m.id);
    if (m.status === "downloading" && task.state !== "running") task.arm(kitT("kit.phase.downloading"));
    if (task.state === "running") task.apply(readRuntimeModelStatus(m));
  }
}
function schedule() {
  if (!timer && !gone) timer = setTimeout(tick, 1200);
}
async function tick() {
  timer = null;
  await load();
  feed();
  if (busy()) schedule();
}
onMounted(async () => {
  await load();
  feed();
  if (busy()) schedule();
});
onBeforeUnmount(() => {
  gone = true;
  clearTimeout(timer);
});

// how long it keeps a model in memory with no work (its seeded idle_seconds:<id>), edited in minutes
const idleMinutes = ref(null);
const idleChanged = computed(() => engine.value?.idleSeconds != null && Math.max(0, Math.round(Number(idleMinutes.value) || 0)) * 60 !== Number(engine.value.idleSeconds));
async function saveIdle() {
  try {
    engine.value = await request(`${base}/settings`, { method: "PUT", body: { idleSeconds: Math.max(0, Math.round(Number(idleMinutes.value) || 0)) * 60 } });
    idleMinutes.value = Math.round(engine.value.idleSeconds / 60);
  } catch (e) {
    reportError(e);
  }
}

// its kind's speed bands in the kind's unit (seeded band_*:<kind>, 2026-10-29: editable here) — each above 0
const bandDrafts = reactive({ fast: null, fine: null, slow: null });
function bandsBody() {
  const out = {};
  for (const which of ["fast", "fine", "slow"]) {
    const n = committedNumber(bandDrafts[which], { step: 0.1 });
    if (n === null || n <= 0) return null;
    out[which] = n;
  }
  return out;
}
const bandsChanged = computed(() => {
  const b = bandsBody();
  const e = engine.value?.bands;
  return !!(b && e) && (b.fast !== e.fast || b.fine !== e.fine || b.slow !== e.slow);
});
async function saveBands() {
  const bands = bandsBody();
  if (!bands) return;
  try {
    engine.value = await request(`${base}/settings`, { method: "PUT", body: { bands } });
    Object.assign(bandDrafts, { fast: engine.value.bands.fast, fine: engine.value.bands.fine, slow: engine.value.bands.slow });
  } catch (e) {
    reportError(e);
  }
}
const unitWords = (unit) => (unit === "s/image" ? t("kit.runtimes.bands.unitSecondsPerImage") : unit === "x realtime" ? t("kit.runtimes.bands.unitRealtime") : unit);
// a kind whose unit is faster when higher (speech: × real time) reads its lines as "at ≥"
const bandWord = (which) => t(engine.value?.bands?.lowerIsFaster === false ? `kit.runtimes.bands.${which}AtLeast` : `kit.runtimes.bands.${which}`);

const size = (n) => fmtBytes(n || 0);
const need = () => engineNeedWords(engine.value?.need);
const engineName = () => engine.value?.label || props.runtimeId;

/** A start the server refused before anything downloaded (no room, busy): said in words, no bar left behind; any
 *  other failure on the task's bar. */
function startFailed(task, e, name) {
  const refused = refusalProblem(e, name, t);
  if (refused) {
    task.reset();
    reportError(refused);
  } else task.fail(e?.message || kitT("kit.phase.couldntStart"));
}

async function install() {
  engineTask.arm(kitT("kit.phase.gettingReady"));
  try {
    await request(`${base}/engine/install`, { method: "POST", body: {} });
  } catch (e) {
    startFailed(engineTask, e, engineName());
    return;
  }
  schedule();
}

// Update to the kit's tested build (status `updateTo`): the server swaps the pin and rows, installs, and puts the old
// ones back if the install fails — the bar follows it like an install.
async function update() {
  engineTask.arm(kitT("kit.phase.gettingReady"));
  try {
    await request(`${base}/engine/update`, { method: "POST", body: {} });
  } catch (e) {
    startFailed(engineTask, e, engineName());
    return;
  }
  schedule();
}

async function removeEngine() {
  const ok = await confirmDialog({
    title: t("kit.runtimes.removeTitle", { name: engine.value?.label || props.runtimeId }),
    message: t("kit.runtimes.removeMessage"),
    confirmLabel: t("kit.runtimes.remove"),
    danger: true,
  });
  if (!ok) return;
  try {
    const r = await request(`${base}/engine`, { method: "DELETE" });
    engineTask.reset(); // its last install's bar goes with it
    // a build another app of the family uses stays in a shared cache — said
    if (r?.keptFor?.length) pushToast({ message: t("kit.engine.keptFor", { apps: r.keptFor.join(", ") }), kind: "info" });
  } catch (e) {
    reportError(refusalProblem(e, engineName(), t) || e);
  }
  await load();
}

async function download(m) {
  const task = taskFor(m.id);
  task.arm(kitT("kit.phase.gettingReady"));
  try {
    await request(`${base}/models/${encodeURIComponent(m.id)}/download`, { method: "POST" });
  } catch (e) {
    startFailed(task, e, m.name);
    return;
  }
  schedule();
}

async function removeModel(m) {
  const ok = await confirmDialog({
    title: t("kit.runtimes.model.deleteTitle", { name: m.name }),
    message: t("kit.runtimes.model.deleteMessage", { size: size(m.bytes) }),
    confirmLabel: t("kit.runtimes.model.delete"),
    danger: true,
  });
  if (!ok) return;
  try {
    await request(`${base}/models/${encodeURIComponent(m.id)}`, { method: "DELETE" });
  } catch (e) {
    reportError(refusalProblem(e, m.name, t) || e);
  }
  await load();
}

/** A model's state, in words. */
function modelState(m) {
  if (m.running) return t("kit.runtimes.model.running");
  return m.onDisk ? t("kit.runtimes.model.onDisk") : t("kit.runtimes.model.notDownloaded");
}
// ── a runtime whose models load into running servers (audio.cpp — round E, 2026-10-29) ──────────────────────────
// Its models have kinds (speech, transcription), found by kind and name; a model on this computer loads where asked
// (Auto lets the engine decide and says why) and lets go; its add-ons install on demand; its settings are its own.
const kinds = computed(() => [...new Set(models.value.map((m) => m.kind).filter(Boolean))]);
const kindFilter = ref("");
const kindOptions = computed(() => [{ value: "", label: t("kit.runtimes.kinds.all") }, ...kinds.value.map((k) => ({ value: k, label: kindWords(k) }))]);
const kindWords = (k) => (["tts", "stt"].includes(k) ? t(`kit.runtimes.kinds.${k}`) : k);
const search = ref("");
const shown = computed(() => {
  const q = search.value.trim().toLowerCase();
  return models.value.filter((m) => (!kindFilter.value || m.kind === kindFilter.value) && (!q || String(m.name).toLowerCase().includes(q)));
});
const registers = computed(() => Array.isArray(engine.value?.loaded));
const loadedOf = (m) => engine.value?.loaded?.find((l) => l.modelId === m.id) ?? null;
const placements = reactive({}); // model id → "auto" | "gpu" | "cpu"
const loadingId = ref("");
const placementOptions = computed(() => ["auto", "gpu", "cpu"].map((v) => ({ value: v, label: t(`kit.runtimes.placement.${v}`) })));
async function loadModel(m) {
  loadingId.value = m.id;
  try {
    await request(`${base}/models/${encodeURIComponent(m.id)}/load`, { method: "POST", body: { placement: placements[m.id] || "auto" } });
  } catch (e) {
    reportError(refusalProblem(e, m.name, t) || e);
  } finally {
    loadingId.value = "";
    await load();
  }
}
async function unloadModel(m) {
  try {
    await request(`${base}/models/${encodeURIComponent(m.id)}/unload`, { method: "POST", body: {} });
  } catch (e) {
    reportError(e);
  }
  await load();
}
async function installAddon(a) {
  try {
    await request(`${base}/addons/${encodeURIComponent(a.id)}/install`, { method: "POST", body: {} });
  } catch (e) {
    reportError(refusalProblem(e, a.name, t) || e);
  }
  await load();
  schedule();
}
async function removeAddon(a) {
  const ok = await confirmDialog({
    title: t("kit.runtimes.addon.removeTitle", { name: a.name }),
    message: t("kit.runtimes.addon.removeMessage", { size: size(a.installedBytes) }),
    confirmLabel: t("kit.runtimes.remove"),
    danger: true,
  });
  if (!ok) return;
  try {
    await request(`${base}/addons/${encodeURIComponent(a.id)}`, { method: "DELETE" });
  } catch (e) {
    reportError(e);
  }
  await load();
}
// the settings the runtime declares (its status's `settings`): one box each, saved together
const settingDrafts = reactive({});
const settingNames = computed(() => Object.keys(engine.value?.settings ?? {}));
const settingWords = (name) => (te(`kit.runtimes.settings.${name}`) ? t(`kit.runtimes.settings.${name}`) : name);
const changedSettings = () => settingNames.value.filter((n) => settingDrafts[n] !== undefined && String(settingDrafts[n]).trim() !== String(engine.value.settings[n]));
// a number setting takes a number: a blank or a word keeps Save off rather than saving 0 (the route reads "" as 0)
const settingOk = (n) => typeof engine.value.settings[n] !== "number" || (String(settingDrafts[n]).trim() !== "" && Number.isFinite(Number(settingDrafts[n])));
const settingsChanged = computed(() => changedSettings().length > 0 && changedSettings().every(settingOk));
async function saveSettings() {
  const body = {};
  for (const n of changedSettings()) body[n] = typeof engine.value.settings[n] === "number" ? Number(settingDrafts[n]) : String(settingDrafts[n]).trim();
  try {
    await request(`${base}/settings`, { method: "PUT", body: { settings: body } });
    for (const n of Object.keys(body)) delete settingDrafts[n];
  } catch (e) {
    reportError(e);
  }
  await load();
}
defineExpose({ refresh: load });
</script>

<template>
  <div class="lu-rt">
    <UiBanner v-if="loadFailed" intent="danger">{{ t("kit.runtimes.loadFailed") }}</UiBanner>
    <template v-if="engine">
      <section class="lu-rt-part" :aria-label="t('kit.runtimes.engineTitle', { name: engine.label })">
        <h3 class="lu-rt-h">{{ t("kit.runtimes.engineTitle", { name: engine.label }) }}</h3>
        <p class="lu-rt-line">
          <!-- in-process (ONNX Runtime): part of the app — nothing to install or remove -->
          <template v-if="engine.inProcess">{{ t("kit.runtimes.inProcess") }}</template>
          <template v-else-if="engine.installed">{{ engine.running ? t("kit.runtimes.installedRunning", { build: engine.build, model: engine.running }) : t("kit.runtimes.installed", { build: engine.build }) }}</template>
          <template v-else>{{ engine.downloadBytes ? t("kit.runtimes.notInstalled", { size: size(engine.downloadBytes) }) : t("kit.runtimes.notInstalledNoSize") }}</template>
        </p>
        <UiBanner v-if="need()" intent="danger" class="lu-rt-note">
          {{ t(need().key, need().values) }}
          <a v-if="need().link" :href="need().link" target="_blank" rel="noopener">{{ t("kit.runtimes.needs.vcRuntimeLink") }}</a>
        </UiBanner>
        <UiField v-if="engine.idleSeconds != null" :label="t('kit.runtimes.idle.label')" :hint="t('kit.runtimes.idle.hint')" :for="`lu-rt-${runtimeId}-idle`">
          <div class="lu-rt-idle">
            <UiInput :id="`lu-rt-${runtimeId}-idle`" v-model="idleMinutes" type="number" width="token" />
            <UiButton intent="secondary" size="small" :disabled="!idleChanged" :label="t('kit.common.save')" @click="saveIdle" />
          </div>
        </UiField>
        <UiField v-if="engine.bands" :label="t('kit.runtimes.bands.label', { unit: unitWords(engine.bands.unit) })" :hint="t(engine.bands.lowerIsFaster === false ? 'kit.runtimes.bands.hintHigher' : 'kit.runtimes.bands.hint')" :for="`lu-rt-${runtimeId}-band-fast`">
          <div class="lu-rt-idle">
            <label class="lu-rt-band">{{ bandWord("fast") }}
              <UiInput :id="`lu-rt-${runtimeId}-band-fast`" v-model="bandDrafts.fast" type="number" width="token" />
            </label>
            <label class="lu-rt-band">{{ bandWord("fine") }}
              <UiInput :id="`lu-rt-${runtimeId}-band-fine`" v-model="bandDrafts.fine" type="number" width="token" />
            </label>
            <label class="lu-rt-band">{{ bandWord("slow") }}
              <UiInput :id="`lu-rt-${runtimeId}-band-slow`" v-model="bandDrafts.slow" type="number" width="token" />
            </label>
            <UiButton intent="secondary" size="small" :disabled="!bandsChanged" :label="t('kit.common.save')" @click="saveBands" />
          </div>
        </UiField>
        <div v-if="!engine.inProcess" class="lu-rt-actions">
          <UiButton
            v-if="!engine.installed" intent="primary" size="small" focusable-when-disabled
            :disabled="!!need() || engineTask.state === 'running'"
            :label="engine.downloadBytes ? t('kit.runtimes.install', { size: size(engine.downloadBytes) }) : t('kit.runtimes.installPlain')"
            @click="install"
          />
          <UiButton
            v-if="engine.updateTo" intent="primary" size="small" focusable-when-disabled
            :disabled="!!need() || engineTask.state === 'running'"
            :title="t('kit.engine.update.tipTested', { latest: engine.updateTo, current: engine.build })"
            :label="t('kit.engine.update.button', { latest: engine.updateTo })"
            @click="update"
          />
          <UiButton v-if="engine.installed" intent="secondary" size="small" :disabled="engineTask.state === 'running'" :label="t('kit.runtimes.remove')" @click="removeEngine" />
        </div>
        <DownloadBar v-if="engineTask.state" :task="engineTask" :title="engine.label" />
      </section>

      <!-- a runtime's add-ons (audio.cpp's Japanese dictionary): installed when asked -->
      <section v-if="engine.addons?.length" class="lu-rt-part" :aria-label="t('kit.runtimes.addonsTitle')">
        <h3 class="lu-rt-h">{{ t("kit.runtimes.addonsTitle") }}</h3>
        <div v-for="a in engine.addons" :key="a.id" class="lu-rt-model">
          <div class="lu-rt-model-row">
            <div class="lu-rt-model-main">
              <b>{{ a.name }}</b>
              <span class="lu-rt-line">{{ a.installed ? t("kit.runtimes.addon.installed", { size: size(a.installedBytes) }) : t("kit.runtimes.addon.notInstalled", { size: size(a.bytes), installed: size(a.installedBytes) }) }}</span>
              <span v-if="a.status === 'error'" class="lu-rt-line lu-rt-error">{{ a.error }}</span>
            </div>
            <UiButton v-if="!a.installed" intent="secondary" size="small" :loading="a.status === 'installing'" :disabled="!engine.installed" :label="t('kit.runtimes.addon.install', { size: size(a.bytes) })" @click="installAddon(a)" />
            <UiButton v-else intent="secondary" size="small" :label="t('kit.runtimes.remove')" @click="removeAddon(a)" />
          </div>
          <UiProgress v-if="a.status === 'installing'" :value="a.downloaded || 0" :max="a.total || 0" :label="t('kit.runtimes.addon.installing')" />
        </div>
      </section>

      <!-- the settings the runtime declares (audio.cpp's build, threads, timeouts …) -->
      <section v-if="settingNames.length" class="lu-rt-part" :aria-label="t('kit.runtimes.settingsTitle')">
        <h3 class="lu-rt-h">{{ t("kit.runtimes.settingsTitle") }}</h3>
        <UiField v-for="n in settingNames" :key="n" :label="settingWords(n)" :for="`lu-rt-${runtimeId}-set-${n}`">
          <UiInput
            :id="`lu-rt-${runtimeId}-set-${n}`" :model-value="settingDrafts[n] ?? String(engine.settings[n])" width="token" :invalid="settingDrafts[n] !== undefined && !settingOk(n)"
            @update:model-value="(v) => (settingDrafts[n] = v)"
          />
        </UiField>
        <div class="lu-rt-actions">
          <UiButton intent="secondary" size="small" :disabled="!settingsChanged" :label="t('kit.common.save')" @click="saveSettings" />
        </div>
      </section>

      <slot name="before-models" :engine="engine" :models="models" />
      <section class="lu-rt-part" :aria-label="t('kit.runtimes.modelsTitle')">
        <h3 class="lu-rt-h">{{ t("kit.runtimes.modelsTitle") }}</h3>
        <div v-if="kinds.length > 1 || models.length > 12" class="lu-rt-find">
          <UiSegmented v-if="kinds.length > 1" v-model="kindFilter" :options="kindOptions" size="small" :aria-label="t('kit.runtimes.kinds.label')" />
          <UiInput v-if="models.length > 12" v-model="search" size="small" width="name" :placeholder="t('kit.runtimes.search')" :aria-label="t('kit.runtimes.search')" />
        </div>
        <p v-if="!models.length" class="lu-rt-line">{{ t("kit.runtimes.noModels") }}</p>
        <div v-for="m in shown" :key="m.id" class="lu-rt-model">
          <div class="lu-rt-model-row">
            <div class="lu-rt-model-main">
              <span class="lu-rt-model-name">
                <b>{{ m.name }}</b>
                <span v-if="m.fit" class="lu-fit" :class="`lu-fit--${m.fit}`">{{ fitLabel(m.fit) }}<template v-if="speedBandLabel(m)"> · {{ speedBandLabel(m) }}</template></span>
              </span>
              <span class="lu-rt-line">{{ [size(m.bytes), m.license].filter(Boolean).join(" · ") }} — {{ modelState(m) }}</span>
            </div>
            <UiButton
              v-if="!m.onDisk" intent="primary" size="small" focusable-when-disabled :disabled="taskFor(m.id).state === 'running'"
              :label="t('kit.runtimes.model.download', { size: size(m.bytes) })" @click="download(m)"
            />
            <template v-else>
              <!-- a runtime that loads its models: where to, then Load / Unload -->
              <template v-if="registers">
                <UiSelect
                  v-if="!loadedOf(m)" :model-value="placements[m.id] || 'auto'" :options="placementOptions" width="fit"
                  :aria-label="t('kit.runtimes.placement.label', { name: m.name })" @update:model-value="(v) => (placements[m.id] = v)"
                />
                <UiButton
                  v-if="!loadedOf(m)" intent="primary" size="small" :loading="loadingId === m.id" :disabled="!engine.installed || (!!loadingId && loadingId !== m.id)"
                  :label="t('kit.runtimes.model.load')" @click="loadModel(m)"
                />
                <UiButton v-else intent="secondary" size="small" :label="t('kit.runtimes.model.unload')" @click="unloadModel(m)" />
              </template>
              <UiButton intent="secondary" size="small" :disabled="!!loadedOf(m)" :label="t('kit.runtimes.model.delete')" @click="removeModel(m)" />
            </template>
          </div>
          <span v-if="loadedOf(m)" class="lu-rt-line">{{ t(`kit.runtimes.loadedOn.${loadedOf(m).placement}`) }}<template v-if="loadedOf(m).reason"> — {{ loadedOf(m).reason }}</template></span>
          <slot name="model" :model="m" :loaded="loadedOf(m)" />
          <UiBanner v-if="fitWarning(m)" intent="warning" class="lu-rt-note">{{ fitWarning(m) }}</UiBanner>
          <DownloadBar v-if="taskFor(m.id).state" :task="taskFor(m.id)" :title="m.name" />
        </div>
      </section>
      <slot name="after-models" :engine="engine" :models="models" />
    </template>
  </div>
</template>

<style scoped>
.lu-rt { display: flex; flex-direction: column; gap: 18px; padding: 4px 0; max-width: 720px; }
.lu-rt-part { display: flex; flex-direction: column; gap: 8px; }
.lu-rt-h { margin: 0; font-size: 13px; font-weight: 700; color: var(--ink); }
.lu-rt-line { margin: 0; font-size: 12.5px; color: var(--muted); }
.lu-rt-note { margin: 0; }
.lu-rt-actions { display: flex; gap: 8px; }
.lu-rt-idle { display: flex; align-items: center; gap: 8px; }
.lu-rt-band { display: inline-flex; align-items: center; gap: 6px; }
.lu-rt-model { display: flex; flex-direction: column; gap: 6px; padding: 8px 0; border-top: 1px solid var(--border); }
.lu-rt-model-row { display: flex; align-items: center; gap: 12px; }
.lu-rt-model-main { display: flex; flex-direction: column; gap: 2px; min-width: 0; flex: 1; }
.lu-rt-model-name { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.lu-rt-find { display: flex; align-items: center; gap: 12px; flex-wrap: wrap; }
.lu-rt-error { color: var(--danger-ink); }
</style>
