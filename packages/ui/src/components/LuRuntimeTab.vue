<script setup>
// SPDX-License-Identifier: MIT
// One kit runtime on the AI page (the engines plan, K10) — its engine and the models it runs, as llama.cpp's engine
// row and catalog are: the build for this computer and what it needs (said before anything downloads), Install with
// progress and Cancel (the kit's DownloadBar), Reinstall, Remove; each model the app brings (its runtime_model rows)
// with its size and licence, on this computer or not, running or not, Download with progress and Cancel, Delete. A page
// opened while an install or a download runs picks it up (the tasks' arm/apply — the catalog's way). Each model shows
// the catalog's chip — whether it fits this computer and its speed band, measured beating predicted (modelPick.js
// fitLabel, speedBandLabel, fitWarning: the one way, 2026-10-27). No room on the drive and removing what is busy are
// said in words (K10b). `runtimeId` names the runtime (GET /v1/ai/runtimes).
//
// Round E (2026-10-29) — the tab JustVoice's speech models live in: the app's grouping (`group`, its `group-head` and
// `group-foot`) and filter (`filter` over the `filters` its slot edits) beside the kind picker and the search; a model's
// Auto/GPU/CPU saved, where it would load and why before a load, "Try the card again"; a load that downloads first, its
// bar then its loading state, Cancel on the way; a licence the app gates (`terms-required`, with the action to repeat);
// each setting with the control the runtime declares; and `changed` after anything here changes what the app shows.
import { computed, onActivated, onBeforeUnmount, onMounted, reactive, ref, useId } from "vue";
import { useI18n } from "vue-i18n";
import { request } from "../client.js";
import DownloadBar from "../common/components/DownloadBar.vue";
import Icon from "../common/components/Icon.vue";
import UiBanner from "../common/components/UiBanner.vue";
import UiButton from "../common/components/UiButton.vue";
import UiField from "../common/components/UiField.vue";
import UiInput from "../common/components/UiInput.vue";
import UiNumber from "../common/components/UiNumber.vue";
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
  // The app's grouping (round E, G6 — JustVoice's models by engine): `(model) => ({key, label}) | null`; a model with
  // no group is listed after the groups. Absent: one flat list (sd.cpp's, ONNX's). Each group is a heading that shows
  // or hides its models, with its count, the app's `group-head` beside it and its `group-foot` under its models (both
  // `{group, models — the group's every model, shown — those listed now, refresh}`). Every slot gets `refresh()`: an
  // app's panel that changed the tab's models (JustVoice's "delete this engine's downloads") makes it read again.
  group: { type: Function, default: null },
  // The app's filter: `(model, filters) => boolean` over `filters`, the object its `filters` slot edits — with the kind
  // picker and the search.
  filter: { type: Function, default: null },
});
// `changed` {what, id}: something here changed what the app shows (G9) — `what` is load, unload, install, update,
// reinstall, remove, download, delete, addon-install, addon-remove, settings or placement; `id` the model's or the
// add-on's. `terms-required` {model, retry}: the app's licence gate refused a Download or a Load (403 terms-required,
// G5) — the app shows its terms and calls `retry()` to repeat the same action; the tab says nothing itself.
const emit = defineEmits(["changed", "terms-required"]);
const { t, te } = useI18n();
const uid = useId();

const base = `/v1/ai/runtimes/${encodeURIComponent(props.runtimeId)}`;
const modelUrl = (id) => `${base}/models/${encodeURIComponent(id)}`;
const engine = ref(null);
const models = ref([]);
const loadFailed = ref(false);
const engineTask = createDownloadTask(runtimeEngineChannel(props.runtimeId));
const modelTasks = reactive({}); // model id → its download task
const pending = reactive({}); // model id → its Load's request is on its way
// loading: its Load's request waits, or the server says a load of it runs (`loading` "downloading" | "loading")
const isLoading = (m) => !!pending[m.id] || !!m.loading;
const taskFor = (id) =>
  (modelTasks[id] ??= createDownloadTask({
    ...runtimeModelChannel(props.runtimeId, () => id),
    // a Load's download (G4) stops with its load: Unload cancels both (G12)
    cancel: () =>
      isLoading(models.value.find((x) => x.id === id) ?? { id })
        ? request(`${modelUrl(id)}/unload`, { method: "POST", body: {} })
        : request(`${modelUrl(id)}/download/cancel`, { method: "POST" }),
  }));
const changed = (what, id = "") => emit("changed", { what, id });
// a refusal's problem type, by its last part ("…/errors/terms-required")
const problemCode = (e) => /([^/]+)$/.exec(e?.problem?.type || "")?.[1] || "";

async function load() {
  try {
    const [e, m] = await Promise.all([request(`${base}/engine/status`), request(`${base}/models`)]);
    engine.value = e;
    if (idleMinutes.value === null && e?.idleSeconds != null) idleMinutes.value = Math.round(e.idleSeconds / 60);
    seedBands(e);
    models.value = m.models || [];
    loadFailed.value = false;
  } catch {
    loadFailed.value = true;
  }
}

// One poll for the tab while anything runs: the server's state fed to the tasks (a page opened mid-install arms them)
let timer = null;
let gone = false;
let engineVerb = "install"; // what the engine's bar runs: install, update or reinstall
const wasLoading = {}; // model id → it was loading at the last reading
const addonWas = {}; // add-on id → its status at the last reading
const busy = () =>
  engineTask.state === "running" ||
  Object.values(modelTasks).some((x) => x.state === "running") ||
  (engine.value?.addons ?? []).some((a) => a.status === "installing") ||
  models.value.some((m) => m.loading) ||
  Object.keys(pending).length > 0;
// a reinstall's build stays on disk while it installs again: its status, not `installed`, says it runs
const engineReading = (e) => (e.status === "installing" ? { detail: e.detail, done: e.downloaded, total: e.total, status: e.status } : readEngineStatus(e));
function feed() {
  const e = engine.value;
  if (e?.status === "installing" && engineTask.state !== "running") engineTask.arm(kitT("kit.engine.phase.downloading"));
  if (engineTask.state === "running" && e) {
    engineTask.apply(engineReading(e));
    if (engineTask.state === "done") changed(engineVerb);
  }
  for (const a of e?.addons ?? []) {
    if (addonWas[a.id] === "installing" && a.status !== "installing") changed("addon-install", a.id);
    addonWas[a.id] = a.status;
  }
  for (const m of models.value) {
    if (m.status === "downloading" && modelTasks[m.id]?.state !== "running") taskFor(m.id).arm(kitT("kit.phase.downloading"));
    const task = modelTasks[m.id];
    if (task?.state === "running") {
      task.apply(readRuntimeModelStatus(m));
      if (task.state === "done") changed("download", m.id);
    }
    // a load that went on here without the tab waiting on it (a 202's, or one the app started) ended
    if (wasLoading[m.id] && !m.loading && !pending[m.id]) changed("load", m.id);
    wasLoading[m.id] = !!m.loading;
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
// read again: after an app's panel acted (its slots get this as `refresh`), and when a kept-alive page comes back — a
// load the app started meanwhile is picked up with its bar
async function refresh() {
  await load();
  feed();
  if (busy()) schedule();
}
onMounted(refresh);
onActivated(refresh);
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
    changed("settings");
  } catch (e) {
    reportError(e);
  }
}

// its speed bands in each kind's unit (seeded band_*:<kind>, 2026-10-29: editable here) — each above 0. A runtime with
// several kinds (audio.cpp's speech and transcription) has a row per kind (its status's bandsByKind); one with a single
// kind its kind's (`bands`, the row keyed "").
const bandRowsOf = (e) => {
  const byKind = Object.entries(e?.bandsByKind ?? {}).filter(([, b]) => b);
  if (byKind.length) return byKind.map(([kind, bands]) => ({ kind, bands }));
  return e?.bands ? [{ kind: "", bands: e.bands }] : [];
};
const bandRows = computed(() => bandRowsOf(engine.value));
const bandDrafts = reactive({}); // kind → {fast, fine, slow}
// a kind's drafts from the server's: each kind once, then `only` the one just saved (another's edit stays)
function seedBands(e, only = null) {
  for (const { kind, bands } of bandRowsOf(e)) if (only === kind || (only === null && !bandDrafts[kind])) bandDrafts[kind] = { fast: bands.fast, fine: bands.fine, slow: bands.slow };
}
function bandsBody(kind) {
  const out = {};
  for (const which of ["fast", "fine", "slow"]) {
    const n = committedNumber(bandDrafts[kind]?.[which], { step: 0.1 });
    if (n === null || n <= 0) return null;
    out[which] = n;
  }
  return out;
}
function bandsChanged(row) {
  const b = bandsBody(row.kind);
  return !!b && (b.fast !== row.bands.fast || b.fine !== row.bands.fine || b.slow !== row.bands.slow);
}
async function saveBands(kind) {
  const bands = bandsBody(kind);
  if (!bands) return;
  try {
    engine.value = await request(`${base}/settings`, { method: "PUT", body: kind ? { bandsByKind: { [kind]: bands } } : { bands } });
    seedBands(engine.value, kind);
    changed("settings");
  } catch (e) {
    reportError(e);
  }
}
const bandId = (kind, which) => `lu-rt-${props.runtimeId}-band-${kind ? `${kind}-` : ""}${which}`;
const bandLabel = (row) =>
  row.kind ? t("kit.runtimes.bands.labelKind", { kind: kindWords(row.kind), unit: unitWords(row.bands.unit) }) : t("kit.runtimes.bands.label", { unit: unitWords(row.bands.unit) });
const unitWords = (unit) => (unit === "s/image" ? t("kit.runtimes.bands.unitSecondsPerImage") : unit === "x realtime" ? t("kit.runtimes.bands.unitRealtime") : unit);
// a kind whose unit is faster when higher (speech: × real time) reads its lines as "at ≥"
const bandWord = (bands, which) => t(bands?.lowerIsFaster === false ? `kit.runtimes.bands.${which}AtLeast` : `kit.runtimes.bands.${which}`);

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

// Install; Update to the kit's tested build (status `updateTo`: the server swaps the pin and rows, installs, and puts
// the old ones back if the install fails); Reinstall the build pinned here (a repair — llama.cpp's own, `force`). The
// bar follows each the same way.
async function engineJob(verb) {
  engineVerb = verb;
  engineTask.arm(kitT("kit.phase.gettingReady"));
  try {
    if (verb === "update") await request(`${base}/engine/update`, { method: "POST", body: {} });
    else await request(`${base}/engine/install`, { method: "POST", body: verb === "reinstall" ? { force: true } : {} });
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
    changed("remove");
  } catch (e) {
    reportError(refusalProblem(e, engineName(), t) || e);
  }
  await load();
}

/** The app's licence gate refused `m`'s download (403 terms-required, G5): the app's to show, `retry` repeats it. */
function termsRefused(e, m, retry) {
  if (problemCode(e) !== "terms-required") return false;
  emit("terms-required", { model: m, retry });
  return true;
}

async function download(m) {
  const task = taskFor(m.id);
  task.arm(kitT("kit.phase.gettingReady"));
  try {
    await request(`${modelUrl(m.id)}/download`, { method: "POST" });
  } catch (e) {
    if (termsRefused(e, m, () => download(m))) task.reset();
    else startFailed(task, e, m.name);
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
    await request(modelUrl(m.id), { method: "DELETE" });
    changed("delete", m.id);
  } catch (e) {
    reportError(refusalProblem(e, m.name, t) || e);
  }
  await load();
}

/** A model's state, in words. */
function modelState(m) {
  if (m.loading === "downloading") return t("kit.runtimes.model.downloadingToLoad");
  if (m.loading || pending[m.id]) return t("kit.runtimes.model.loading");
  if (m.running) return t("kit.runtimes.model.running");
  return m.onDisk ? t("kit.runtimes.model.onDisk") : t("kit.runtimes.model.notDownloaded");
}
// ── a runtime whose models load into running servers (audio.cpp — round E, 2026-10-29) ──────────────────────────
// Its models have kinds (speech, transcription), found by kind and name; a model on this computer loads where its saved
// choice says (Auto lets the engine decide, and it says why) and lets go; its add-ons install on demand; its settings
// are its own.
const kinds = computed(() => [...new Set(models.value.map((m) => m.kind).filter(Boolean))]);
const kindFilter = ref("");
const kindOptions = computed(() => [{ value: "", label: t("kit.runtimes.kinds.all") }, ...kinds.value.map((k) => ({ value: k, label: kindWords(k) }))]);
const kindWords = (k) => (["tts", "stt"].includes(k) ? t(`kit.runtimes.kinds.${k}`) : k);
const kindOk = (m) => !kindFilter.value || m.kind === kindFilter.value;
const search = ref("");
// what the app's `filters` slot edits — its own fields, read by its `filter`
const filters = reactive({});
const shown = computed(() => {
  const q = search.value.trim().toLowerCase();
  const words = (m) => `${m.name} ${props.group?.(m)?.label ?? ""}`.toLowerCase(); // a model is found by its group's name too
  return models.value.filter((m) => kindOk(m) && (!q || words(m).includes(q)) && (!props.filter || props.filter(m, filters)));
});
// The list as the app groups it (G6), its groups in the order of their first model: each `{key, group, models (shown),
// all (the group's every model), inKind (those of the kind picked)}`. No `group`: one section, no heading.
const sections = computed(() => {
  if (!props.group) return [{ key: "", group: null, models: shown.value, all: shown.value, inKind: shown.value.length }];
  const on = new Set(shown.value.map((m) => m.id));
  const groups = new Map();
  const loose = [];
  for (const m of models.value) {
    const g = props.group(m);
    if (!g) {
      if (on.has(m.id)) loose.push(m);
      continue;
    }
    const key = `g:${g.key}`;
    if (!groups.has(key)) groups.set(key, { key, group: g, models: [], all: [], inKind: 0 });
    const sec = groups.get(key);
    sec.all.push(m);
    if (kindOk(m)) sec.inKind++;
    if (on.has(m.id)) sec.models.push(m);
  }
  const list = [...groups.values()].filter((s) => s.models.length);
  if (loose.length) list.push({ key: "", group: null, models: loose, all: loose, inKind: loose.length });
  return list;
});
// A group shows its models when the user opened it; until then (JustVoice's engine list's rule) when a search runs, the
// filter leaves some of its models out, or one is loaded, loading or downloading.
const openGroups = reactive({});
function isOpen(sec) {
  if (openGroups[sec.key] !== undefined) return openGroups[sec.key];
  if (search.value.trim() || sec.models.length < sec.inKind) return true;
  return sec.models.some((m) => loadedOf(m) || isLoading(m) || modelTasks[m.id]?.state === "running");
}
const toggleGroup = (sec) => (openGroups[sec.key] = !isOpen(sec));
function groupCount(sec) {
  const n = sec.all.length;
  const k = sec.all.filter((m) => m.onDisk).length;
  return k ? t("kit.runtimes.group.countOnDisk", { n, k }, n) : t("kit.runtimes.group.count", { n }, n);
}

const registers = computed(() => Array.isArray(engine.value?.loaded));
const loadedOf = (m) => engine.value?.loaded?.find((l) => l.modelId === m.id) ?? null;
const placementOptions = computed(() => ["auto", "gpu", "cpu"].map((v) => ({ value: v, label: t(`kit.runtimes.placement.${v}`) })));
// where it would load (`placement.where`) and why, before a load (G2)
const wouldLoadOn = (m) => (["gpu", "cpu"].includes(m.placement?.where) ? t(`kit.runtimes.wouldLoadOn.${m.placement.where}`) : "");
function replaceModel(row) {
  if (row?.id) models.value = models.value.map((x) => (x.id === row.id ? { ...x, ...row } : x));
}
// a model's Auto/GPU/CPU is saved (G2): every load reads it, here or the app's
async function setPlacement(m, placement) {
  replaceModel({ id: m.id, placementChoice: placement }); // shown at once; the server's row follows
  try {
    replaceModel(await request(`${modelUrl(m.id)}/placement`, { method: "PUT", body: { placement } }));
    changed("placement", m.id);
  } catch (e) {
    reportError(e);
    await load();
  }
}
// "Try the card again": forget that a card load of it failed or spilled here (its price and CPU speed stay)
async function tryCardAgain(m) {
  try {
    replaceModel(await request(`${modelUrl(m.id)}/try-card`, { method: "POST", body: {} }));
    changed("placement", m.id);
  } catch (e) {
    reportError(e);
  }
}
// Load: where its saved choice says (the server reads it). A model not on this computer downloads first (202
// {status: "downloading"}, G4): its bar, then its loading state, from the poll. Unloaded on its way (G12) it answers
// 409 load-cancelled — what was asked, not a failure.
async function loadModel(m) {
  pending[m.id] = true;
  schedule(); // its loading state from the server while the request waits
  try {
    const r = await request(`${modelUrl(m.id)}/load`, { method: "POST", body: {} });
    if (r?.status === "downloading") taskFor(m.id).arm(kitT("kit.phase.downloading"));
    else changed("load", m.id);
  } catch (e) {
    if (!termsRefused(e, m, () => loadModel(m)) && problemCode(e) !== "load-cancelled") reportError(refusalProblem(e, m.name, t) || e);
  } finally {
    await load();
    feed();
    delete pending[m.id]; // after the feed: the load it waited on is this request's, said above
    if (busy()) schedule();
  }
}
// Unload — a load on its way stops (its download included)
async function unloadModel(m) {
  try {
    await request(`${modelUrl(m.id)}/unload`, { method: "POST", body: {} });
    changed("unload", m.id);
  } catch (e) {
    reportError(e);
  }
  await load();
  feed();
}
async function installAddon(a) {
  try {
    await request(`${base}/addons/${encodeURIComponent(a.id)}/install`, { method: "POST", body: {} });
    addonWas[a.id] = "installing"; // its end, however soon, is heard
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
    changed("addon-remove", a.id);
  } catch (e) {
    reportError(e);
  }
  await load();
}
// The settings the runtime declares (its status's `settings`), each with the control its `settingsUi` names (G8): a
// select of its `choices`, a number (with "of N" beside it), a text box — a text box for one it doesn't name; one it
// marks `hidden` isn't shown (JustVoice's GPU choice on a computer with one card). Saved together.
const settingDrafts = reactive({});
const settingUi = (n) => engine.value?.settingsUi?.[n] ?? {};
const settingNames = computed(() => Object.keys(engine.value?.settings ?? {}).filter((n) => !settingUi(n).hidden));
const settingControl = (n) => (["select", "number"].includes(settingUi(n).control) ? settingUi(n).control : "text");
const settingWords = (name) => (te(`kit.runtimes.settings.${name}`) ? t(`kit.runtimes.settings.${name}`) : name);
const settingValue = (n) => ((n in settingDrafts) ? settingDrafts[n] : engine.value.settings[n]);
// its choices — the one set here too when the list lacks it (a build no longer on this computer), so the box never
// shows empty over a value
function settingChoices(n) {
  const choices = (settingUi(n).choices ?? []).map((c) => ({ value: c.value, label: String(c.label ?? c.value) }));
  const now = engine.value.settings[n];
  return choices.some((c) => c.value === now) ? choices : [{ value: now, label: String(now) }, ...choices];
}
const changedSettings = () => settingNames.value.filter((n) => (n in settingDrafts) && String(settingDrafts[n] ?? "").trim() !== String(engine.value.settings[n]));
// a number setting takes a number: a blank or a word keeps Save off rather than saving 0 (the route reads "" as 0)
const settingOk = (n) =>
  typeof engine.value.settings[n] !== "number" || (settingDrafts[n] != null && String(settingDrafts[n]).trim() !== "" && Number.isFinite(Number(settingDrafts[n])));
const settingsChanged = computed(() => changedSettings().length > 0 && changedSettings().every(settingOk));
async function saveSettings() {
  const body = {};
  for (const n of changedSettings()) body[n] = typeof engine.value.settings[n] === "number" ? Number(settingDrafts[n]) : String(settingDrafts[n]).trim();
  try {
    await request(`${base}/settings`, { method: "PUT", body: { settings: body } });
    for (const n of Object.keys(body)) delete settingDrafts[n];
    changed("settings");
  } catch (e) {
    reportError(e);
  }
  await load();
}
defineExpose({ refresh, filters });
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
        <UiField
          v-for="row in bandRows" :key="row.kind" :label="bandLabel(row)" :hint="t(row.bands.lowerIsFaster === false ? 'kit.runtimes.bands.hintHigher' : 'kit.runtimes.bands.hint')"
          :for="bandId(row.kind, 'fast')"
        >
          <div v-if="bandDrafts[row.kind]" class="lu-rt-idle">
            <label v-for="which in ['fast', 'fine', 'slow']" :key="which" class="lu-rt-band">{{ bandWord(row.bands, which) }}
              <UiInput :id="bandId(row.kind, which)" v-model="bandDrafts[row.kind][which]" type="number" width="token" :aria-label="bandWord(row.bands, which)" />
            </label>
            <UiButton intent="secondary" size="small" :disabled="!bandsChanged(row)" :label="t('kit.common.save')" @click="saveBands(row.kind)" />
          </div>
        </UiField>
        <div v-if="!engine.inProcess" class="lu-rt-actions">
          <UiButton
            v-if="!engine.installed" intent="primary" size="small" focusable-when-disabled
            :disabled="!!need() || engineTask.state === 'running'"
            :label="engine.downloadBytes ? t('kit.runtimes.install', { size: size(engine.downloadBytes) }) : t('kit.runtimes.installPlain')"
            @click="engineJob('install')"
          />
          <UiButton
            v-if="engine.updateTo" intent="primary" size="small" focusable-when-disabled
            :disabled="!!need() || engineTask.state === 'running'"
            :title="t('kit.engine.update.tipTested', { latest: engine.updateTo, current: engine.build })"
            :label="t('kit.engine.update.button', { latest: engine.updateTo })"
            @click="engineJob('update')"
          />
          <!-- Reinstall: the build pinned here again (a repair) — llama.cpp's, which an offered update replaces -->
          <UiButton
            v-else-if="engine.installed" intent="secondary" size="small" focusable-when-disabled
            :disabled="!!need() || engineTask.state === 'running'" :title="t('kit.engine.reinstallTitle')"
            :label="t('kit.engine.reinstall')" @click="engineJob('reinstall')"
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

      <!-- the settings the runtime declares (audio.cpp's build, threads, timeouts …), each with its declared control -->
      <section v-if="settingNames.length" class="lu-rt-part" :aria-label="t('kit.runtimes.settingsTitle')">
        <h3 class="lu-rt-h">{{ t("kit.runtimes.settingsTitle") }}</h3>
        <UiField v-for="n in settingNames" :key="n" :label="settingWords(n)" :for="`lu-rt-${runtimeId}-set-${n}`">
          <UiSelect
            v-if="settingControl(n) === 'select'" :id="`lu-rt-${runtimeId}-set-${n}`" :model-value="settingValue(n)" :options="settingChoices(n)" width="fit"
            @update:model-value="(v) => (settingDrafts[n] = v)"
          />
          <div v-else-if="settingControl(n) === 'number'" class="lu-rt-idle">
            <UiNumber
              :id="`lu-rt-${runtimeId}-set-${n}`" :model-value="settingValue(n)" width="token" :use-grouping="false"
              @update:model-value="(v) => (settingDrafts[n] = v)"
            />
            <span v-if="settingUi(n).of != null" class="lu-rt-line">{{ t("kit.runtimes.settingOf", { n: settingUi(n).of }) }}</span>
          </div>
          <UiInput
            v-else :id="`lu-rt-${runtimeId}-set-${n}`" :model-value="String(settingValue(n) ?? '')" width="token" :invalid="(n in settingDrafts) && !settingOk(n)"
            @update:model-value="(v) => (settingDrafts[n] = v)"
          />
        </UiField>
        <div class="lu-rt-actions">
          <UiButton intent="secondary" size="small" :disabled="!settingsChanged" :label="t('kit.common.save')" @click="saveSettings" />
        </div>
      </section>

      <slot name="before-models" :engine="engine" :models="models" :refresh="refresh" />
      <section class="lu-rt-part" :aria-label="t('kit.runtimes.modelsTitle')">
        <h3 class="lu-rt-h">{{ t("kit.runtimes.modelsTitle") }}</h3>
        <div v-if="kinds.length > 1 || models.length > 12 || $slots.filters" class="lu-rt-find">
          <UiSegmented v-if="kinds.length > 1" v-model="kindFilter" :options="kindOptions" size="small" :aria-label="t('kit.runtimes.kinds.label')" />
          <UiInput v-if="models.length > 12" v-model="search" size="small" width="name" :placeholder="t('kit.runtimes.search')" :aria-label="t('kit.runtimes.search')" />
          <!-- the app's own filters (G6): its controls over `filters`, read by its `filter` -->
          <slot name="filters" :filters="filters" />
        </div>
        <p v-if="!models.length" class="lu-rt-line">{{ t("kit.runtimes.noModels") }}</p>
        <p v-else-if="!shown.length" class="lu-rt-line">{{ t("kit.runtimes.noMatch") }}</p>
        <!-- one section per group of the app's (a heading that shows or hides its models — the APG's disclosure), or the
             one flat list -->
        <div v-for="(sec, i) in sections" :key="sec.key" class="lu-rt-sec" :class="{ 'lu-rt-group': sec.group }">
          <div v-if="sec.group" class="lu-rt-group-head">
            <h4 class="lu-rt-gh">
              <UiButton intent="ghost" size="small" :aria-expanded="isOpen(sec) ? 'true' : 'false'" :aria-controls="isOpen(sec) ? `${uid}-g${i}` : undefined" @click="toggleGroup(sec)">
                <template #icon><Icon :name="isOpen(sec) ? 'ChevDown' : 'ChevRight'" :size="14" /></template>
                {{ sec.group.label }}
              </UiButton>
            </h4>
            <span class="lu-rt-line">{{ groupCount(sec) }}</span>
            <slot name="group-head" :group="sec.group" :models="sec.all" :shown="sec.models" :refresh="refresh" />
          </div>
          <div v-if="!sec.group || isOpen(sec)" :id="sec.group ? `${uid}-g${i}` : undefined" class="lu-rt-sec" :class="{ 'lu-rt-group-body': sec.group }">
            <div v-for="m in sec.models" :key="m.id" class="lu-rt-model">
              <div class="lu-rt-model-row">
                <div class="lu-rt-model-main">
                  <span class="lu-rt-model-name">
                    <b>{{ m.name }}</b>
                    <span v-if="m.fit" class="lu-fit" :class="`lu-fit--${m.fit}`">{{ fitLabel(m.fit) }}<template v-if="speedBandLabel(m)"> · {{ speedBandLabel(m) }}</template></span>
                  </span>
                  <span class="lu-rt-line">{{ [size(m.bytes), m.license].filter(Boolean).join(" · ") }} — {{ modelState(m) }}</span>
                </div>
                <!-- a load on its way (its download first — G4): Cancel lets it go (Unload — G12); while it downloads, its
                     bar's own Cancel does -->
                <template v-if="registers && isLoading(m)">
                  <UiButton v-if="modelTasks[m.id]?.state !== 'running'" intent="secondary" size="small" :label="t('kit.common.cancel')" @click="unloadModel(m)" />
                </template>
                <UiButton
                  v-else-if="!m.onDisk" intent="primary" size="small" focusable-when-disabled :disabled="modelTasks[m.id]?.state === 'running'"
                  :label="t('kit.runtimes.model.download', { size: size(m.bytes) })" @click="download(m)"
                />
                <template v-else>
                  <!-- a runtime that loads its models: where to (saved — G2), then Load / Unload -->
                  <template v-if="registers">
                    <UiSelect
                      v-if="!loadedOf(m)" :model-value="m.placementChoice || 'auto'" :options="placementOptions" width="fit"
                      :aria-label="t('kit.runtimes.placement.label', { name: m.name })" @update:model-value="(v) => setPlacement(m, v)"
                    />
                    <UiButton
                      v-if="!loadedOf(m)" intent="primary" size="small" :disabled="!engine.installed || Object.keys(pending).length > 0"
                      :label="t('kit.runtimes.model.load')" @click="loadModel(m)"
                    />
                    <UiButton v-else intent="secondary" size="small" :label="t('kit.runtimes.model.unload')" @click="unloadModel(m)" />
                  </template>
                  <UiButton intent="secondary" size="small" :disabled="!!loadedOf(m)" :label="t('kit.runtimes.model.delete')" @click="removeModel(m)" />
                </template>
              </div>
              <!-- where it runs and why — or, before a load, where it would (G2); a card that failed it here, tried again -->
              <div v-if="loadedOf(m) || (registers && wouldLoadOn(m))" class="lu-rt-where">
                <span v-if="loadedOf(m)" class="lu-rt-line">{{ t(`kit.runtimes.loadedOn.${loadedOf(m).placement}`) }}<template v-if="loadedOf(m).reason"> — {{ loadedOf(m).reason }}</template></span>
                <span v-else class="lu-rt-line">{{ wouldLoadOn(m) }}<template v-if="m.placement.reason"> — {{ m.placement.reason }}</template></span>
                <UiButton
                  v-if="registers && m.placement?.cardFailed" intent="secondary" size="small" :disabled="isLoading(m)"
                  :label="t('kit.runtimes.placement.tryCard')" @click="tryCardAgain(m)"
                />
              </div>
              <slot name="model" :model="m" :loaded="loadedOf(m)" :refresh="refresh" />
              <!-- a load that ran on its own (after its download, or the app's) and failed: the runtime's words -->
              <UiBanner v-if="m.loadError" intent="danger" class="lu-rt-note">{{ m.loadError }}</UiBanner>
              <UiBanner v-if="fitWarning(m)" intent="warning" class="lu-rt-note">{{ fitWarning(m) }}</UiBanner>
              <DownloadBar v-if="modelTasks[m.id]?.state" :task="modelTasks[m.id]" :title="m.name" />
            </div>
            <slot v-if="sec.group" name="group-foot" :group="sec.group" :models="sec.all" :shown="sec.models" :refresh="refresh" />
          </div>
        </div>
      </section>
      <slot name="after-models" :engine="engine" :models="models" :refresh="refresh" />
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
/* a section of the list: the flat list, or one group — its heading row, its models a step in */
.lu-rt-sec { display: flex; flex-direction: column; gap: 8px; }
.lu-rt-group { gap: 4px; padding-top: 6px; border-top: 1px solid var(--border); }
.lu-rt-group-head { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
.lu-rt-gh { margin: 0; font-size: 13px; }
.lu-rt-gh :deep(.ui-btn-label) { font-weight: 700; }
.lu-rt-group-body { padding-left: 22px; }
.lu-rt-where { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
</style>
