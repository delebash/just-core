<script setup>
// SPDX-License-Identifier: MIT
// The shared "AI / Models" area (from the shared-ai-models mock) — ONE UI for
// both apps: Providers & models · Features · Usage, with a hardware strip. Built
// in plain-JS Vue on the shared client; the host mounts it at a top-level route
// and passes its appName. Wired to the real shared endpoints (/v1/llm-providers*,
// /v1/llm-runner/hardware, /v1/ai-usage). The provider card + rows mirror
// JustWrite's polished Settings → AI engines (outer card, icon, name, URL on its
// own line, model + key on the next, status + Test + Edit). The Features routing
// table + the per-provider local-model/Fit section are the next chunks.
import { copyToClipboard } from "quasar";
import { computed, nextTick, onMounted, ref, useId, watch } from "vue";
import { useI18n } from "vue-i18n";

import AppModal from "../common/components/AppModal.vue";
import UiButton from "../common/components/UiButton.vue";
import UiCheckbox from "../common/components/UiCheckbox.vue";
import UiSegmented from "../common/components/UiSegmented.vue";
import UiTable from "../common/components/UiTable.vue";
import UiTabStrip from "../common/components/UiTabStrip.vue";
import { tabPanelAttrs } from "../common/components/tabPanels.js";
import FeatureWorkbench from "./FeatureWorkbench.vue";

const { t, n: fmtNum } = useI18n();
// An example address, not a word — never translated.
const LOCAL_URL_EXAMPLE = "http://localhost:…";
import ProviderForm from "./ProviderForm.vue";
import QuickSetup from "./QuickSetup.vue";
import PricingEditor from "./PricingEditor.vue";
import ConsolePanel from "../components/ConsolePanel.vue";
import LuBookSearchSetup from "../components/LuBookSearchSetup.vue";
import LuModelCatalog from "../components/LuModelCatalog.vue";
import LuEngineInstallButton from "../components/LuEngineInstallButton.vue";
import LuEngineUpdateButton from "../components/LuEngineUpdateButton.vue";
import LuWarmStartupToggle from "../components/LuWarmStartupToggle.vue";
import { pushToast } from "../common/services/toastBridge.js";
import { request } from "../client.js";
import { providerDisplayName } from "../services/seededWords.js";
import { useHardware } from "../composables/useHardware.js";
import { useModelApply } from "../services/modelApply.js";
import { useEngine } from "../composables/useEngine.js";
import { refresh as refreshRunnerModels } from "../composables/useRunnerModels.js";
import { usePoll } from "../common/composables/usePoll.js";
import { llmUiCapabilities } from "../installLlmUi.js";

// Engine state here feeds only the debug snapshot — the engine ACTIONS
// (Install / Uninstall / Update available / Reinstall + progress + errors) all
// live on the Local-engine panel inside the built-in provider's ProviderForm —
// reached by Edit on its row since 2026-07-19; same shared useEngine state, so
// no surface can disagree.
// `updateInfo` gates the row's engine-update affordance (LuEngineUpdateButton owns
// the label/title/action, bound to the same useEngine singleton — one control, two
// surfaces, can't drift).
const { engineState: engState, checkForUpdate, refreshEngine, updateInfo: engineUpdateInfo, statusKnown: engineStatusKnown, installed: engineInstalled, installing: engineInstalling } = useEngine();

// Host-contributed tabs: an app passes appTabLabel + #app-tab (one tab) or the
// appTabs array + #app-tab-<id> slots (many, positioned) with its own AI-domain
// surfaces (JW's "Writing AI"; JV's "TTS providers" / "Speech engines"). Keeps
// ALL AI settings in this one shared area while each app's specifics stay
// app-side. No label/entries → no extra tabs.
// A no-embeddings host hides every embed affordance (the capability, not per-flag).
const embedsOn = llmUiCapabilities().embeddings !== false;
// A host with no local engine (the phone: online providers only) hides the local half — the
// Local scope and its Quick Setup, the machine strip, the engine console — and never asks the
// engine or the hardware probe (those routes do not exist there).
const localOn = llmUiCapabilities().localEngine !== false;

const props = defineProps({
  appTabLabel: { type: String, default: "" },
  // MULTI host tabs (family parity batch 2026-08-05): [{ id, label, after? }].
  // Each entry renders a tab whose content the host fills via the named slot
  // `app-tab-<id>`. `after` anchors it behind a kit tab id ('providers' |
  // 'models' | 'features' | 'usage' | 'console') or an earlier app tab id;
  // without it the tab sits in the legacy slot (after Routing, before Usage).
  // The single-tab `appTabLabel` + `#app-tab` API above stays back-compatible —
  // it is exactly `appTabs: [{ id: 'app', label: appTabLabel }]`.
  appTabs: { type: Array, default: () => [] },
  // Deep-link seam (?tab=<id>, host-passed like the other ?-seams): land on this
  // tab after mount. Unknown / empty → the first tab (providers).
  initialTab: { type: String, default: "" },
  // OPT-IN kit Models tab (decision trail: JV's console holds TWO provider kinds,
  // so "Providers & models" stopped naming one thing there). ON → the model
  // catalog renders as its own tab right after Providers — the SAME shared
  // LuModelCatalog the built-in provider's Edit shows (one component, one store,
  // two surfaces can't drift — the engine-buttons precedent). OFF (default) →
  // JW/docgen keep the combined tab, unchanged.
  modelsTab: { type: Boolean, default: false },
  // Host runner forwarded to the Feature Workbench test panel (streaming +
  // cancel + the app's batch AI list). See FeatureWorkbench `runStream`.
  runStream: { type: Function, default: null },
  // Deep-link focus for the Routing tab's workbench (?action= — forwarded to
  // FeatureWorkbench initialAction; JV's retired #speakerlab rides it).
  initialFeatureAction: { type: String, default: "" },
  // Forwarded to the promptless Lab: the app's doors to its prompt-feeding data
  // (Option-A seam, ruling 2026-08-04). [{label, href}].
  dataLinks: { type: Array, default: () => [] },
  // Deep-link seam: when a host routes here to run Quick Setup (JW's welcome
  // screen, QC-46, via ?quicksetup=1), open the wizard ONCE after the first
  // load. Off by default — JustVoice inherits it inert.
  autoOpenQuickSetup: { type: Boolean, default: false },
  // Deep-link seam for the provider TABS: "online" lands the provider list on the
  // Online tab (JW's first-run AI setup dialog, "Connect an online provider", via
  // ?providers=online). Anything else — including the default "" — starts on Local.
  initialProviderScope: { type: String, default: "" },
  // The setup-wizard seam (2026-08-03): an app passes its OWN thin wizard component
  // (must expose openWizard(), emit changed/closed, accept `inline`) and the whole
  // local-setup band renders it instead of the default QuickSetup. Machinery stays
  // in the kit composables; the wizard's steps and words belong to the app.
  wizard: { type: [Object, Function], default: null },
  // The one-strip consolidation (JV decision 2026-08-15): live memory renders as
  // header CELLS on this strip — the kit owns used/free + the LLM cell, and a host
  // appends its own cells here ([{key, label, value, sub?, title?}] — JV feeds
  // TTS/STT/Other-apps from its /v1/engines/vram, the only place that sees both
  // ledgers). No feed → the kit cells alone, so JW/docgen inherit this inert.
  hwCells: { type: Array, default: () => [] },
  // The LLM cell's IDLE text ({text, title}), host-fed: with no model resident the
  // cell says "—" unless the host knows better (JV's on-demand claim line — Q3's
  // "how does a user know what fits when the LLM loads on demand"). One cell, one
  // owner; the host supplies only the idle words.
  llmClaim: { type: Object, default: null },
});
const emit = defineEmits(["quick-setup-closed"]);

// The subnav tab. (Was the shared `activeAiTab` from labHandoff.js — that channel
// existed only for the Tune→Tasks switch-carry handoff, removed with §7.1: engine
// switches live on the model, so there is nothing to hand to the Lab anymore.)
const tab = ref("providers");
// The strip is the kit's UiTabStrip (role tablist / tab, its keys) and each section its tab's
// tabpanel (APG Tabs — until 2026-10-20 the tabs were <a>s with no href: links a keyboard never
// reached; the screens-and-keyboard review).
const tabPrefix = `ai-area-${useId()}`;
// The tabs that fill the area's height (their own panes scroll); on every other tab the area
// itself is the ONE scroller — the hardware card, the strip (sticky) and the tab's content
// together (the tab was a scroller under the hardware card, 195px tall at 960×700).
const FILL_TABS = new Set(["features", "console"]);
// A tab opens at the top of the area — a fill tab would otherwise sit under the scroll the last tab
// left (its overflow hidden, the scroll kept), its bottom cut off.
const areaEl = ref(null);
watch(tab, () => {
  if (areaEl.value) areaEl.value.scrollTop = 0;
});

// ── The tab strip, as data (multi host tabs, 2026-08-05) ─────────────────────
// Kit tabs + the host's appTabs merged into ONE ordered list. `after` inserts
// behind the named id; entries without it take the legacy single-tab slot
// (after Routing) so `appTabLabel` hosts render exactly as before.
const tabDefs = computed(() => {
  const defs = [{ id: "providers", label: t('kit.aiTabs.providers'), kit: true }];
  if (props.modelsTab) defs.push({ id: "models", label: t('kit.aiTabs.models'), kit: true });
  defs.push({ id: "features", label: t('kit.aiTabs.routing'), kit: true });
  const legacy = props.appTabLabel ? [{ id: "app", label: props.appTabLabel, slot: "app-tab" }] : [];
  const anchored = [];
  const floating = [...legacy];
  for (const t of props.appTabs || []) {
    if (!t?.id) continue;
    const def = { id: t.id, label: t.label || t.id, slot: `app-tab-${t.id}` };
    (t.after ? anchored : floating).push({ ...def, after: t.after });
  }
  defs.push(...floating);
  defs.push({ id: "usage", label: t('kit.aiTabs.usage'), kit: true });
  if (localOn) defs.push({ id: "console", label: t('kit.aiTabs.console'), kit: true });
  for (const t of anchored) {
    const at = defs.findIndex((d) => d.id === t.after);
    // An unknown anchor falls back to the legacy slot's neighborhood (before
    // Usage) rather than vanishing — a misspelled `after` must stay visible.
    defs.splice(at >= 0 ? at + 1 : defs.findIndex((d) => d.id === "usage"), 0, t);
  }
  return defs;
});
const appTabDefs = computed(() => tabDefs.value.filter((t) => !t.kit));
// the tabs whose panels are in the page (each is v-show, Models once visited) — the only ones whose
// tab names its panel (aria-controls)
const panelsInPage = computed(() => tabDefs.value.filter((d) => d.id !== "models" || visitedTabs.value.has("models")).map((d) => d.id));

// Lazy mount: a host tab's content mounts on FIRST activation and stays mounted
// after (v-show), so switching away keeps its state — same reason the provider
// tab is v-show (the qsRef note below).
const visitedTabs = ref(new Set(["providers"]));
watch(tab, (id) => {
  if (!visitedTabs.value.has(id)) {
    visitedTabs.value = new Set([...visitedTabs.value, id]);
  }
}, { immediate: true });
// ?tab= deep link: adopt it only when it names a real tab.
if (props.initialTab && tabDefs.value.some((t) => t.id === props.initialTab)) {
  tab.value = props.initialTab;
}
// A kept-alive host re-consumes a later deep link by UPDATING the prop — the
// setup read above fires once per session (JV's #engines redirect, 2026-08-06).
// Static hosts (JW passes a constant) never trigger it.
watch(() => props.initialTab, (t) => {
  if (t && tabDefs.value.some((x) => x.id === t)) tab.value = t;
});
// Local vs Online is a TAB on the provider list (not two stacked eyebrow groups) —
// deliberately NOT named `tab`, which is the page subnav above.
const providerScope = ref(!localOn || props.initialProviderScope === "online" ? "online" : "local");
const providers = ref([]);
// The box probe comes from the SHARED singleton (2026-07-27) — this file used to hold
// TWO independent fetches of /v1/llm-runner/hardware, the strip below and the change
// detector, alongside three more across the kit.
const { hardwareInfo: hardware, mainGpu, largestGpu, refresh: refreshHardware } = useHardware();
const usage = ref(null);
const loading = ref(true);
const error = ref("");
const editingId = ref(null); // "new" | provider id | null
const status = ref({}); // provider id -> "checking" | "ok" | "fail"

// Group by the provider's stored Local/Online choice (set in the form), not a
// URL guess — a local provider at a LAN IP still groups under Local.
// 2026-07-19: the built-in is IN the local list (the promoted card is gone) and is
// always its FIRST row. `.filter()` already returns a fresh array, so sorting it in
// place never touches `providers.value`.
const isBuiltin = (p) => p.providerType === "local-llamacpp";
const localProviders = computed(() => providers.value
  .filter((p) => p.local)
  .sort((a, b) => Number(isBuiltin(b)) - Number(isBuiltin(a))));
const cloudProviders = computed(() => providers.value.filter((p) => !p.local));
// ONE row template renders whichever scope the tab is on.
const shownProviders = computed(() => (providerScope.value === "online" ? cloudProviders.value : localProviders.value));

const hwLabel = computed(() => {
  const h = hardware.value;
  if (!h) return null;
  // The LARGEST GPU, not the first: on a laptop that enumerates its iGPU first, `gpus[0]`
  // made this strip name the wrong card (fixed 2026-07-27 — the rule now lives once, in
  // useHardware, and matches the server's own `max_vram_mb`).
  const gpu = mainGpu.value;
  // Every detected runtime, with the one the engine actually uses marked (priority =
  // select_binary's pick order: cuda → rocm → vulkan → cpu). A bare "CUDA / VULKAN"
  // read as a question (user, 2026-07-06) — both APIs ship with the ONE GPU driver;
  // nothing extra is installed.
  const order = ["cuda", "rocm", "vulkan", "cpu"];
  const rank = (k) => (order.indexOf(k) < 0 ? 99 : order.indexOf(k));
  const rts = Object.entries(h.runtimes || {}).filter(([, v]) => v).map(([k]) => k)
    .sort((a, b) => rank(a) - rank(b));
  const active = rts[0] || "";
  const accel = rts
    .map((k) => (k === active ? t("kit.aiArea.hw.inUse", { rt: k.toUpperCase() }) : t("kit.aiArea.hw.supported", { rt: k.toUpperCase() })))
    .join(" · ");
  return {
    os: h.os || "—",
    cpu: h.cpuCores ? t("kit.aiArea.hw.threads", { n: h.cpuCores }) : "—",
    gpu: gpu ? gpu.name : t("kit.aiArea.hw.cpuOnly"),
    vram: gpu?.vramMb ? `${fmtNum(gpu.vramMb / 1024, { maximumFractionDigits: 0 })} GB` : null,
    ram: h.ramMb ? `${fmtNum(h.ramMb / 1024, { maximumFractionDigits: 0 })} GB` : "—",
    accel: accel || "—",
  };
});

// ── Live VRAM + debug info on the strip (user, 2026-07-07) ───────────────────
// GET /resident is read-only + safe to poll (never spawns the router — the
// LuRunnerEngine precedent); it carries the measured VRAM ledger (total /
// committed / free) + the loaded-models list the debug snapshot includes.
const resident = ref(null);
// The catalog rows' status comes from useRunnerModels, whose own poller only runs
// while a load IT started is in flight — a load from another surface (Quick Setup,
// a chat leg's ensure, an eviction) left the rows stale ("loads on first use" beside
// a 6.6 GB header, 2026-07-11). This poll already sees the live resident set every
// tick, so a CHANGE in the loaded set kicks the shared models refresh — one truth.
let _loadedSig = "";
const { start: startResPoll } = usePoll(async () => {
  try {
    resident.value = await request("/v1/llm-runner/resident");
    // ONE workflow (2026-07-21): a model-load button can now install the engine (retryLoad) — so
    // keep the engine panel live while it's NOT yet installed, so that install shows here too, not
    // just on the boot splash. Once installed, useEngine's own poll owns any further transitions.
    if (!engineInstalled.value) refreshEngine();
    const sig = (resident.value?.models || [])
      .filter((m) => m.status === "loaded" || m.status === "sleeping")
      .map((m) => m.id)
      .sort()
      .join("|");
    if (_loadedSig !== null && sig !== _loadedSig) refreshRunnerModels();
    _loadedSig = sig;
  } catch { /* keep last */ }
}, 2500);
const gb1 = (mb) => fmtNum(mb / 1024, { minimumFractionDigits: 1, maximumFractionDigits: 1 });
// the debug report's own (English, like the logs)
const gbEn = (mb) => (mb / 1024).toFixed(1);
// GB past a gigabyte, MB below it — a "0.3 GB" cell reads as a rounding error.
const mem1 = (mb) => (mb >= 1024 ? `${gb1(mb)} GB` : `${fmtNum(Math.round(mb))} MB`);

// ── "Other apps" → which ones (2026-08-15) ──────────────────────────────────
// The strip has always been able to say HOW MUCH memory it can't account for
// and never WHICH processes hold it. This is that answer, and it is fetched
// ON DEMAND only: the probe is one shell-out for the whole machine, but the
// Windows counter arm costs ~1 s, which has no business on the 2.5 s poll.
const gpuAppsOpen = ref(false);
const gpuApps = ref(null);      // null = never fetched; else the response body
const gpuAppsBusy = ref(false);

async function loadGpuApps(fresh = false) {
  gpuAppsBusy.value = true;
  try {
    gpuApps.value = await request(`/v1/llm-runner/gpu-processes${fresh ? "?fresh=true" : ""}`);
  } catch (e) {
    // A failed fetch is NOT "nothing is using the GPU" — say so in the same
    // shape the server uses for an unmeasurable box.
    gpuApps.value = { available: false, reason: t("kit.aiArea.gpuApps.readFailed", { error: e?.message || e }), processes: [] };
  } finally {
    gpuAppsBusy.value = false;
  }
}

function toggleGpuApps() {
  gpuAppsOpen.value = !gpuAppsOpen.value;
  if (gpuAppsOpen.value && gpuApps.value === null) loadGpuApps();
}
// MEASURED first (2026-08-14, user: the top strip read "0.0 / 8.0 GB used" while
// the card actually held 2.1 GB). `committedMb` is only what the AI runner BOOKED
// for its own models — true, but not an answer to "how much VRAM is in use", and
// it was labelled as if it were. The card's real occupancy leads; our reservation
// rides alongside so the two can never be confused again. Unmeasurable box
// (usedMb null) → the ledger numbers, labelled "reserved".
// The one-strip consolidation (JV decision 2026-08-15): the old inline
// `vramLine` clause chain became header CELLS — the same layout as the
// hardware facts — followed by the host's own cells (props.hwCells).
const memCells = computed(() => {
  const r = resident.value;
  if (!r?.vramTotalMb) return []; // no detectable GPU VRAM → no memory cells
  const unified = !!r.memArch && r.memArch !== "discrete";
  const total = gb1(r.vramTotalMb);
  const cells = [];
  if (r.usedMb == null) {
    cells.push({ key: "used", label: t(unified ? "kit.aiArea.mem.memoryReserved" : "kit.aiArea.mem.vramReserved"), value: t("kit.aiArea.mem.ofTotal", { gb: gb1(r.committedMb || 0), total }),
      title: t("kit.aiArea.mem.reservedTitle") });
    cells.push({ key: "free", label: t("kit.aiArea.mem.free"), value: t("kit.aiArea.mem.gb", { gb: gb1(r.remainingMb || 0) }) });
  } else {
    cells.push({ key: "used", label: t(unified ? "kit.aiArea.mem.memoryUsed" : "kit.aiArea.mem.vramUsed"), value: t("kit.aiArea.mem.ofTotal", { gb: gb1(r.usedMb), total }),
      title: t("kit.aiArea.mem.usedTitle") });
    cells.push({ key: "free", label: t("kit.aiArea.mem.free"), value: t("kit.aiArea.mem.gb", { gb: gb1(Math.max(0, r.vramTotalMb - r.usedMb)) }) });
  }
  // The LLM cell: loaded model name + the runner's booked take. Summed from
  // the per-model reservations, NOT committedMb — the arbiter ledger is
  // shared with the host's speech engines (JV), so committedMb counts a
  // loaded TTS model too and would mislabel it "LLM" (2026-08-15 review).
  // Nothing resident → the host's idle words (JV's on-demand claim) or "—".
  // A SLEEPING model is resident in the router's list but its weights are
  // unloaded — it holds no memory (2026-08-15). Counting its booking here read
  // "LLM 6.3 GB" beside a measured "0.7 of 8.0 GB used": two truths on one
  // strip, the defect this row exists to prevent. Only awake takes are summed.
  const models = (r.models || []).filter((m) => m.status === "loaded" || m.status === "sleeping");
  if (models.length) {
    const awake = models.filter((m) => m.status !== "sleeping");
    const take = awake.reduce((n, m) => n + (m.vramMb || 0), 0);
    cells.push({ key: "llm", label: t("kit.aiArea.mem.llm"),
      value: take ? t("kit.aiArea.mem.gb", { gb: gb1(take) }) : (awake.length ? t("kit.aiArea.mem.loaded") : t("kit.aiArea.mem.asleep")),
      sub: models.map((m) => m.id).join(" · "),
      title: awake.length ? t("kit.aiArea.mem.llmTitle") : t("kit.aiArea.mem.asleepTitle") });
  } else if (props.llmClaim?.text) {
    cells.push({ key: "llm", label: t("kit.aiArea.mem.llm"), value: props.llmClaim.text, title: props.llmClaim.title || "" });
  } else {
    cells.push({ key: "llm", label: t("kit.aiArea.mem.llm"), value: "—" });
  }
  // "Other apps" — measured occupancy minus what the arbiter has booked, i.e.
  // the slice of the card our ledger cannot account for. KIT-side since
  // 2026-08-15: it began as a JustVoice host cell, but the inputs (usedMb,
  // committedMb) were already here, so every app was one duplicated computed
  // away from having it. Its "show apps" action is the only reason the
  // number stops being a dead end.
  // 256 MB floor: below that it is driver/desktop noise, and a cell that
  // flickers in and out at 30 MB is worse than no cell.
  const otherMb = r.usedMb == null ? 0 : Math.max(0, r.usedMb - (r.committedMb || 0));
  if (otherMb > 256) {
    cells.push({
      key: "other", label: t("kit.aiArea.mem.otherApps"), value: mem1(otherMb),
      title: t("kit.aiArea.mem.otherAppsTitle"),
      action: { label: gpuAppsOpen.value ? t("kit.aiArea.mem.hide") : t("kit.aiArea.mem.showApps"), on: toggleGpuApps },
    });
  }
  return cells;
});
const stripCells = computed(() => [...memCells.value, ...props.hwCells]);

// "Copy debug info" — the whole box picture as ONE pasteable text block (hardware +
// tuning keys + engine build + the live resident set). Beats more UI: a bug report
// or a support chat gets the machine's true state in one paste. The block is diagnostic
// data for whoever reads the report, like the logs, so it stays English in every language.
const debugCopied = ref(false);
/* eslint-disable i18next/no-literal-string -- the debug report stays English, like the logs (above) */
function debugInfoText() {
  const h = hardware.value || {};
  const gpu = h.gpus?.[0];
  const st = engState.value || {};
  const r = resident.value;
  const lines = [
    `OS: ${h.os || "?"} (${h.platform || "?"}) · CPU ${h.cpuCores ?? "?"} threads · RAM ${h.ramMb ? gbEn(h.ramMb) : "?"} GB`,
    `GPU: ${gpu ? `${gpu.name} · ${gpu.vramMb ? gbEn(gpu.vramMb) : "?"} GB VRAM · driver ${gpu.driver || "?"}` : "none detected"}`,
    `Acceleration: ${hwLabel.value?.accel || "—"}`,
    `Engine: ${st.installed ? `installed · ${st.build || "?"} · ${st.gpu || "?"}` : "not installed"}`,
    `Tuning keys: machine ${h.machineKey || "?"} · class ${h.classKey || "?"}`,
    // The measured number is the one a bug report needs most — a load that failed
    // "with 6 GB free" reads very differently once you can see 2 GB was foreign.
    r?.vramTotalMb
      ? `VRAM: ${r.usedMb == null ? "?" : r.usedMb} / ${r.vramTotalMb} MB used`
        + ` · ${r.committedMb || 0} MB committed by AI models · ${r.remainingMb || 0} MB unbooked`
      : "VRAM: n/a",
    `Loaded models: ${
      r?.models?.length
        ? r.models.map((m) => `${m.id} (${m.status}${m.vramMb ? ` · ${m.vramMb} MB` : ""}${m.nCtx ? ` · ctx ${m.nCtx}` : ""})`).join(", ")
        : "none"
    }`,
  ];
  return lines.join("\n");
}
/* eslint-enable i18next/no-literal-string */
async function copyDebugInfo() {
  try {
    await copyToClipboard(debugInfoText());
    debugCopied.value = true;
    setTimeout(() => { debugCopied.value = false; }, 1500);
  } catch {
    pushToast({ message: t("kit.aiArea.clipboardFailed"), kind: "error" });
  }
}

const fmtUsd = (v) => fmtNum(Number(v) || 0, { style: "currency", currency: "USD", minimumFractionDigits: !v ? 0 : v < 1 ? 4 : 2, maximumFractionDigits: !v ? 0 : v < 1 ? 4 : 2 });
// The usage breakdowns (by feature, by provider) are the same five columns with a different
// first-column label — one config, used twice, instead of the same <table> written out twice.
// Every column sorts: the panel exists to answer "what is costing me the most".
const usageColumns = (firstLabel) => [
  { id: "key", accessorKey: "key", header: firstLabel, sortable: true },
  { id: "calls", accessorKey: "calls", header: t("kit.aiArea.usage.colCalls"), sortable: true },
  { id: "prompt", accessorKey: "prompt", header: t("kit.aiArea.usage.colPrompt"), sortable: true },
  { id: "completion", accessorKey: "completion", header: t("kit.aiArea.usage.colCompletion"), sortable: true },
  { id: "cost", accessorKey: "cost", header: t("kit.aiArea.usage.colCost"), sortable: true },
];
// The full ledger view (rollup + by-feature + by-provider) from /v1/ai-usage —
// cost is server-computed (the host sink prices each row), so this renders
// identically in any app that mounts the area. Null until something's recorded.
const usageView = computed(() => {
  const s = usage.value;
  if (!s || !s.total_calls) return null;
  const shape = (obj) => Object.entries(obj || {}).map(([key, v]) => ({
    key, calls: v.calls || 0, prompt: v.prompt_tokens || 0,
    completion: v.completion_tokens || 0, cost: v.cost || 0,
  })).sort((a, b) => b.calls - a.calls);
  const prompt = s.total_prompt_tokens || 0;
  const completion = s.total_completion_tokens || 0;
  return {
    calls: s.total_calls || 0, prompt, completion, tokens: prompt + completion,
    cost: s.total_cost || 0, feat: shape(s.by_feature), prov: shape(s.by_provider),
  };
});
async function clearUsage() {
  try { await request("/v1/ai-usage", { method: "DELETE" }); } catch { /* ignore */ }
  await loadUsage();
}

async function loadProviders() {
  const r = await request("/v1/llm-providers");
  providers.value = r.providers || [];
}
async function loadHardware() {
  await refreshHardware(); // self-swallowing → null, which the strip already renders as blanks
}
async function loadUsage() {
  try { usage.value = await request("/v1/ai-usage"); } catch { usage.value = null; }
}
async function loadAll() {
  loading.value = true; error.value = "";
  try {
    await loadProviders();
    await Promise.all([localOn ? loadHardware() : null, loadUsage()]);
  } catch (e) {
    error.value = t("kit.common.loadFailed", { error: e.message });
  } finally {
    loading.value = false;
  }
}

function capList(p) {
  return p.embeddingModel ? [t("kit.aiArea.cap.llm"), t("kit.aiArea.cap.embed")] : [t("kit.aiArea.cap.llm")];
}
async function testProvider(p) {
  status.value = { ...status.value, [p.id]: "checking" };
  try {
    const r = await request(`/v1/llm-providers/${encodeURIComponent(p.id)}/ping`, { method: "POST" });
    status.value = { ...status.value, [p.id]: r.ok ? "ok" : "fail" };
  } catch {
    status.value = { ...status.value, [p.id]: "fail" };
  }
}
const STATUS_KEYS = new Set(["checking", "ok", "fail"]);
const STATUS_COLOR = { checking: "var(--gold, #b08a3e)", ok: "var(--success, #3a7d63)", fail: "var(--danger)" };
const statusLabel = (id) => t(STATUS_KEYS.has(status.value[id]) ? `kit.aiArea.status.${status.value[id]}` : "kit.aiArea.status.unchecked");
const statusColor = (id) => STATUS_COLOR[status.value[id]] || "var(--border-strong)";

function onSaved() { editingId.value = null; loadProviders(); }

// Only a DEEP-LINKED run (the first-run AI setup dialog) hands control back to
// the host; a wizard the user opened by clicking the button leaves them here.
function onQuickSetupClosed() {
  if (props.autoOpenQuickSetup) emit("quick-setup-closed");
}

// ── Task E — the hardware-change notification (user, 2026-07-06/07 dispositions:
// "counts as changed just gpu vram" · "appears dismissinle toast" · fires ONCE per
// change via a persisted acknowledged fingerprint; the enable/disable toggle is a
// deferred App-Settings todo). The fingerprint is gpu-name|vramMb — cores/RAM
// deliberately excluded. First sight of a box seeds the baseline SILENTLY (a fresh
// install is not a change). The acknowledgment is written BEFORE the toast shows so
// the notice fires once even across restarts/dismissals. The toast's button opens
// Quick Setup (a better model may now fit); re-tuning the current model stays a
// pointer in the message (the Tune dialog lives inside the Built-in provider's Edit
// view — a direct-open handoff is a possible follow-up).
const qsRef = ref(null); // the inline QuickSetup mount (exposes openWizard)

// ── B2-9 (§7.2): "Set as default" on every provider row. ONE flow local/online:
// chat/tasks repoint always; the embedding default too WHEN the row has an
// embedding model (else the dialog says it stays, in one line); the overwrite
// choice at apply — every task vs keep-my-customized (a task whose preset
// provider/model differs from the current default keeps its own routing).
const { currentDefaultId, currentDefaultProviderId, currentEmbeddingId, refreshApplied, setAsDefault, setAsEmbedding, LOCAL_RUNNER_ID } = useModelApply();
const setDefaultFor = ref(null);   // the provider being confirmed (null = closed)
const overwriteTasks = ref(false); // §7.2's choice; off = keep-my-customized
const settingDefault = ref(false);

// QC-20 ("the default provider is not set for llama after running quicksetup"):
// the provider LIST shows which row IS the current default — derived from the
// same dominant pair the dialog uses (one source), tagged like the catalog's
// Default badge; that row's Set-as-default reads "Default ✓" (the catalog's
// already-set affordance, LuModelCatalog:806-811). The built-in row matches on
// the runner id (presets carry LOCAL_RUNNER_ID, not the provider row's own id).
const isDefaultProvider = (p) => (p.providerType === "local-llamacpp"
  ? currentDefaultProviderId.value === LOCAL_RUNNER_ID
  : !!p.id && currentDefaultProviderId.value === p.id);

const sdIsBuiltin = computed(() => setDefaultFor.value?.providerType === "local-llamacpp");
// The chat model the default would run on: the built-in's is its assigned local
// pick (the dominant across the task presets); an online/local-URL row's is its
// "Default model" field. Empty → the guard branch renders instead of Apply.
const sdModel = computed(() =>
  sdIsBuiltin.value ? currentDefaultId.value : (setDefaultFor.value?.defaultModel || ""));
// QC-21 ("falsely reports no embinding model is set even thghout quick setp set
// one as default"): the provider ROW's embeddingModel field is only how ONLINE
// rows carry an embedding — the built-in's lives in the ROUTING default
// (QuickSetup writes it there via setAsEmbedding), so the built-in reads the
// current LOCAL embedding instead and the dialog line tells the truth.
const sdEmbedModel = computed(() =>
  sdIsBuiltin.value ? currentEmbeddingId.value : (setDefaultFor.value?.embeddingModel || ""));

async function openSetDefault(p) {
  overwriteTasks.value = false;
  // The built-in's pick can be stale (another surface may have re-pointed the
  // presets) — refresh BEFORE the dialog decides between Apply and the guard.
  if (p.providerType === "local-llamacpp") await refreshApplied();
  setDefaultFor.value = p;
}

async function applySetDefault() {
  const p = setDefaultFor.value;
  if (!p || !sdModel.value) return;
  settingDefault.value = true;
  try {
    const pid = sdIsBuiltin.value ? LOCAL_RUNNER_ID : p.id;
    await setAsDefault(pid, sdModel.value, { overwrite: overwriteTasks.value });
    // QC-21: the built-in's sdEmbedModel IS the current routing embedding — the
    // write would rewrite the identical value, so it is skipped (the dialog line
    // says "already runs here — unchanged"). Online rows still repoint it.
    if (sdEmbedModel.value && !sdIsBuiltin.value) await setAsEmbedding(pid, sdEmbedModel.value);
    pushToast({ message: t("kit.aiArea.setDefault.done", { name: providerDisplayName(p), model: sdModel.value }) });
    setDefaultFor.value = null;
  } catch (e) {
    pushToast({ message: t("kit.aiArea.setDefault.failed", { error: e?.message || e }) });
  } finally {
    settingDefault.value = false;
  }
}

function sdRunQuickSetup() {
  setDefaultFor.value = null;
  qsRef.value?.openWizard?.();
}

function sdEditProvider() {
  editingId.value = setDefaultFor.value?.id || null;
  setDefaultFor.value = null;
}
async function checkHardwareChange() {
  try {
    // A FRESH read on purpose: this compares against the stored fingerprint, so reading a
    // cached value could miss the very change it exists to notice.
    const h = await refreshHardware();
    // The LARGEST GPU, matching the strip and the server's own `max_vram_mb` rule. Read
    // through the shared pure helper rather than the reactive accessor, so the fingerprint
    // is built from THIS response and cannot depend on when the ref was last read.
    // Changing this rule (2026-07-27, the user's go — "but it is ok, continue") makes the
    // fingerprint DIFFER on any box whose first-listed GPU is not its largest, so one
    // stale `ackHwFingerprint` fires a single "your graphics hardware changed" toast that
    // no hardware change caused. Accepted knowingly: it is one notice, once, on multi-GPU
    // machines only, against a strip and a fit calculation that were naming the wrong card
    // permanently.
    const g = largestGpu(h?.gpus);
    const fp = g ? `${g.name}|${g.vramMb || 0}` : "cpu|0";
    const cfg = await request("/v1/ai/engine-config");
    const stored = (cfg?.ackHwFingerprint || "").trim();
    if (stored === fp) return;
    await request("/v1/ai/engine-config", { method: "PUT", body: { ackHwFingerprint: fp } });
    if (!stored) return; // baseline seeded — never toast a first sight
    pushToast({
      title: t("kit.aiArea.hwChanged.title"),
      description: t("kit.aiArea.hwChanged.body"),
      kind: "info",
      duration: 30000,
      action: { label: t("kit.quickSetup.runButton"), fn: () => qsRef.value?.openWizard?.() },
    });
  } catch { /* detection is best-effort — never block the page */ }
}

onMounted(() => {
  // autoOpenQuickSetup (QC-46): open the wizard ONCE after the FIRST loadAll()
  // resolves, so it has the provider list + hardware it needs before showing.
  // nextTick first: the QuickSetup mount (qsRef) sits inside
  // the providers tab's template, so the ref is only populated on the render
  // that follows the resolve — it is still null on the resolve tick itself.
  loadAll().then(async () => {
    if (!props.autoOpenQuickSetup || !localOn) return;
    await nextTick();
    qsRef.value?.openWizard?.();
  });
  if (localOn) {
    startResPoll(); // the strip's live VRAM stat + the debug snapshot's resident set
    refreshEngine(); // the Built-in row's Install/Update/Uninstall state
    checkForUpdate(); // A5 — policy-gated (Off = silent); notify surfaces a line, never auto-applies
    checkHardwareChange(); // Task E — gpu/vram change → one dismissible toast
  }
  refreshApplied(); // QC-20 — the provider rows' Default tag needs the dominant pair at open
});
</script>

<template>
  <div ref="areaEl" class="lu-area" :class="{ 'lu-area--fill': FILL_TABS.has(tab) }">
    <p class="lu-muted lu-lede">{{ t('kit.aiArea.lede') }}</p>

    <!-- The machine strip (OS · CPU · Memory · GPU · Acceleration, then the live
         memory cells). A COLUMN GRID, not a greedy flex row (2026-08-15): with
         ten cells it used to pack edge-to-edge and, one browser-width narrower,
         wrap into a ragged second row whose cells lined up under nothing. The
         grid gives every cell the same track width, so a wrapped row is a tidy
         second row of the same columns at any window size. -->
    <div v-if="localOn && hwLabel" class="lu-hwstrip">
      <div class="lu-hwstats">
        <div class="lu-hwstat"><span class="lu-hwstat-k">{{ t('kit.aiArea.hw.os') }}</span><span class="lu-hwstat-v">{{ hwLabel.os }}</span></div>
        <div class="lu-hwstat"><span class="lu-hwstat-k">{{ t('kit.aiArea.hw.cpu') }}</span><span class="lu-hwstat-v">{{ hwLabel.cpu }}</span></div>
        <div class="lu-hwstat"><span class="lu-hwstat-k">{{ t('kit.aiArea.hw.memory') }}</span><span class="lu-hwstat-v">{{ hwLabel.ram }}</span></div>
        <!-- The sub is its OWN line, never a "· tail" on the value: the tail is
             what made the GPU / LLM / TTS cells three times the width of the
             rest and drove the ugly wrap. Label · number · quiet detail. -->
        <div class="lu-hwstat">
          <span class="lu-hwstat-k">{{ t('kit.aiArea.hw.gpu') }}</span>
          <span class="lu-hwstat-v">{{ hwLabel.gpu }}</span>
          <span v-if="hwLabel.vram" class="lu-hwstat-sub">{{ t('kit.aiArea.hw.vram', { size: hwLabel.vram }) }}</span>
        </div>
        <div class="lu-hwstat"><span class="lu-hwstat-k">{{ t('kit.aiArea.hw.acceleration') }}</span><span class="lu-hwstat-v">{{ hwLabel.accel }}</span></div>
        <!-- Live measured memory as CELLS (the one-strip consolidation, 2026-08-15):
             kit cells (used · free · LLM) then the host's own (JV: TTS · STT ·
             Other apps · Busy). Hidden on a no-GPU box. The Copy button snapshots
             the whole picture (hardware · tuning keys · engine build · loaded
             models) as one pasteable debug block. -->
        <div v-for="c in stripCells" :key="c.key" class="lu-hwstat" :title="c.title || undefined">
          <span class="lu-hwstat-k">{{ c.label }}</span>
          <span class="lu-hwstat-v">{{ c.value }}</span>
          <span v-if="c.sub" class="lu-hwstat-sub">{{ c.sub }}</span>
          <!-- A cell may carry ONE action (today: "Other apps" → show apps). Kept
               on the generic cell so a host cell can offer one without a second
               strip template. -->
          <a v-if="c.action" class="lu-hwstat-act" role="button" tabindex="0"
            @click="c.action.on()" @keydown.enter.prevent="c.action.on()"
            @keydown.space.prevent="c.action.on()">{{ c.action.label }}</a>
        </div>
      </div>
      <UiButton intent="ghost" size="small" class="lu-hwcopy"
        :title="t('kit.aiArea.debug.title')"
        @click="copyDebugInfo">{{ debugCopied ? t('kit.common.copied') : t('kit.aiArea.debug.copy') }}</UiButton>
    </div>

    <!-- Which processes hold GPU memory. Opened from the "Other apps" cell,
         fetched only while open. Deliberately a panel under the strip rather
         than a floating popover: the list can run to 25 rows on a normal
         desktop, and it reads next to the number it explains. -->
    <div v-if="gpuAppsOpen" class="lu-gpuapps">
      <div class="lu-gpuapps-head">
        <b>{{ t('kit.aiArea.gpuApps.title') }}</b>
        <UiButton intent="ghost" size="small" :loading="gpuAppsBusy" @click="loadGpuApps(true)">{{ t('kit.common.refresh') }}</UiButton>
        <UiButton intent="ghost" size="small" @click="toggleGpuApps">{{ t('kit.common.close') }}</UiButton>
      </div>
      <div v-if="gpuAppsBusy && !gpuApps" class="lu-muted">{{ t('kit.aiArea.gpuApps.reading') }}</div>
      <!-- Unavailable is its OWN state. Rendering an empty table here would
           claim the GPU is idle, which is a different (and wrong) sentence. -->
      <div v-else-if="gpuApps && !gpuApps.available" class="lu-muted">{{ gpuApps.reason }}</div>
      <div v-else-if="gpuApps && !gpuApps.processes.length" class="lu-muted">{{ t('kit.aiArea.gpuApps.none') }}</div>
      <template v-else-if="gpuApps">
        <div class="lu-gpuapps-rows">
          <div v-for="p in gpuApps.processes" :key="p.pid" class="lu-gpuapp" :class="{ 'is-own': p.own }">
            <span class="lu-gpuapp-n">{{ p.name || t('kit.aiArea.gpuApps.pid', { pid: p.pid }) }}<span v-if="p.own" class="lu-gpuapp-tag">{{ t('kit.aiArea.gpuApps.thisApp') }}</span></span>
            <span class="lu-gpuapp-p">{{ t('kit.aiArea.gpuApps.pid', { pid: p.pid }) }}</span>
            <span class="lu-gpuapp-m">{{ mem1(p.memMb) }}</span>
          </div>
        </div>
        <!-- The honesty line, keyed to the arm that answered. Neither list is a
             complete partition of the card, and the two differ in COVERAGE: the
             Windows counters see graphics work, nvidia-smi sees only compute. -->
        <p v-if="gpuApps.source === 'nvidia-smi'" class="lu-gpuapps-note">{{ t('kit.aiArea.gpuApps.nvidiaNote') }}</p>
        <p v-else class="lu-gpuapps-note">{{ t('kit.aiArea.gpuApps.sumNote') }}</p>
      </template>
    </div>

    <!-- ONE strip from tabDefs: kit tab words are the kit's keys (kit.aiTabs.*, one word every
         app — an app rewords one by setting the key in its own catalog); host tabs carry the
         app's own words. The kit's tab strip: one row, QTabs' own arrows when it's too narrow. -->
    <UiTabStrip v-model="tab" :tabs="tabDefs" class="lu-subnav" :aria-label="t('kit.aiArea.tabsLabel')" :id-prefix="tabPrefix" :panels="panelsInPage" />

    <div v-if="error" class="lu-error" style="margin-top:14px">{{ error }}</div>

    <!-- ── Providers & models ── -->
    <section v-show="tab === 'providers'" class="lu-tab" v-bind="tabPanelAttrs(tabPrefix, 'providers')">
      <!-- 2026-07-19 (user ruling): the QC-39 (b) PROMOTION is reversed — the
           built-in provider is now a NORMAL first row in the Local list with the
           same inline Edit as every other provider (the Local tab gives the
           findability the promotion existed to give). What stays lifted out is
           the Quick-Setup band: it sits at the TOP of the Local scope in its own
           right, because it is the first-run path and no longer has a card to
           live in. -->
      <!-- The scope term is v-SHOW, not v-if, and deliberately so: this QuickSetup
           mount carries `qsRef`, and TWO openers outside this block reach it (the
           hardware-change toast's action, and the auto-open deep link). A v-if here
           would unmount the wizard on the Online tab and turn both into silent
           optional-chain no-ops. -->
      <div v-if="localOn" v-show="providerScope === 'local'" class="lu-qs-band">
        <component :is="props.wizard || QuickSetup" ref="qsRef" inline @changed="loadProviders" @closed="onQuickSetupClosed" />
      </div>

      <div class="lu-providers">
        <div class="lu-pcard-head">
          <span class="lu-pcard-title">{{ t('kit.aiArea.providers.title') }}</span>
          <span class="lu-muted lu-pcard-count">{{ t('kit.aiArea.providers.configured', { n: providers.length }) }}</span>
          <UiButton intent="primary" size="small" @click="editingId = editingId === 'new' ? null : 'new'">
            <template #icon><span class="lu-plus">＋</span></template>{{ t('kit.aiArea.providers.add') }}
          </UiButton>
        </div>

        <ProviderForm v-if="editingId === 'new'" class="lu-newform" :initial-local="providerScope === 'local'" @saved="onSaved" @cancel="editingId = null" />

        <!-- Local vs Online are TABS (user, 2026-07-19), not two stacked eyebrow
             groups — ONE row template renders the scope you're standing on, so the
             two near-duplicate lists that used to drift are gone. -->
        <UiSegmented v-if="localOn" v-model="providerScope" variant="connected" class="lu-scope"
          :aria-label="t('kit.aiArea.scope.label')"
          :options="[
            { value: 'local', label: t('kit.aiArea.scope.local'), sublabel: t('kit.aiArea.scope.localSub') },
            { value: 'online', label: t('kit.aiArea.scope.online'), sublabel: t('kit.aiArea.scope.onlineSub') },
          ]" />
        <template v-for="p in shownProviders" :key="p.id">
          <ProviderForm v-if="editingId === p.id" :provider="p" @saved="onSaved" @deleted="onSaved" @cancel="editingId = null" />
          <div v-else class="lu-prow">
            <span class="lu-prow-ic">
              <!-- The ONLY difference the two old row templates had: the chip glyph on
                   local, the sparkle on online. -->
              <svg v-if="providerScope === 'local'" role="img" :aria-label="t('kit.aiArea.scope.localShort')" focusable="false" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4"><rect x="4.2" y="4.2" width="7.6" height="7.6" rx="1.2" /><path d="M6.2 1.5v2.7M9.8 1.5v2.7M6.2 11.8v2.7M9.8 11.8v2.7M1.5 6.2h2.7M1.5 9.8h2.7M11.8 6.2h2.7M11.8 9.8h2.7" stroke-linecap="round" /></svg>
              <svg v-else role="img" :aria-label="t('kit.aiArea.scope.onlineShort')" focusable="false" viewBox="0 0 16 16" fill="currentColor"><path d="M8 1.4l1.4 4.1 4.2 1.5-4.2 1.5L8 12.6 6.6 8.5 2.4 7l4.2-1.5z" /></svg>
            </span>
            <div class="lu-prow-info">
              <div class="lu-prow-name">
                <b>{{ providerDisplayName(p) }}</b><span v-for="c in capList(p)" :key="c" class="lu-cap">{{ c }}</span>
                <!-- 2026-07-19: the built-in is a normal row now, so the ONE thing that
                     still marks it out is this tag (same .lu-cap badge, no new style). -->
                <span v-if="isBuiltin(p)" class="lu-cap">{{ t('kit.aiArea.providers.builtin') }}</span>
                <!-- 2026-07-21 (user): the built-in provider is collapsed to a row, so an
                     available engine update was only visible after Edit. Surface it here too,
                     next to the tag — the SAME control the panel uses (LuEngineUpdateButton,
                     bound to the useEngine singleton), so the two can never disagree in look
                     OR wording. Intentional redundancy (row + panel), okayed by the user. -->
                <!-- `installed` is part of the gate, exactly as the panel has it
                     (LuRunnerEngine.vue:227). update_check answers updateAvailable even
                     with NOTHING installed — by design, `current` then falls back to the
                     pinned build, i.e. "an install would fetch something newer"
                     (lifecycle.py:893). Without the installed clause this row offered
                     "Update to b10246" beside "Install engine": update what? -->
                <LuEngineUpdateButton
                  v-if="isBuiltin(p) && engineInstalled && !engineInstalling && engineUpdateInfo?.updateAvailable"
                />
                <!-- 2026-07-21 (user): "we moved the update button but not the install
                     button move it now" — the engine isn't installed until the user acts,
                     and that was only reachable via Edit. Surface Install on the row too,
                     the SAME shared control the panel uses (LuEngineInstallButton, bound to
                     the useEngine singleton). Same gate as the panel's inline button. -->
                <LuEngineInstallButton v-if="isBuiltin(p) && engineStatusKnown && !engineInstalled && !engineInstalling" />
                <!-- The default indicator is the right-aligned green "Default ✓" button
                     in the actions cell (2026-07-17); the left "Default" tag was removed
                     so it lives in one place, consistent with the model catalog. -->
              </div>
              <div class="lu-prow-url">{{ p.baseUrl }}</div>
              <!-- Warm-on-startup (2026-07-21, user "in the card below http"): the
                   load-default-model-into-VRAM knob lives INSIDE the built-in provider's
                   card, right under its URL — not in Edit, not above the card. Built-in
                   only (it's the local engine's knob). Shared control bound to useEngine. -->
              <LuWarmStartupToggle v-if="isBuiltin(p)" class="lu-warmbar" />
              <!-- ONE meta line for every row. The built-in needs no API key, so the key
                   clause is the ONE part it drops — "no key" on a provider that requires
                   none reads as a missing setting rather than a fact. Separators LEAD each
                   clause (not trail), so dropping any one clause can't strand a dangling
                   "·" and a new clause is added in exactly one place. -->
              <div class="lu-prow-meta">
                <template v-if="p.defaultModel">{{ t('kit.aiArea.providers.chat') }} <b>{{ p.defaultModel }}</b></template>
                <template v-if="p.embeddingModel"><template v-if="p.defaultModel"> · </template>{{ t('kit.aiArea.providers.embed') }} <b>{{ p.embeddingModel }}</b></template>
                <template v-if="!isBuiltin(p)"><template v-if="p.defaultModel || p.embeddingModel"> · </template>{{ p.hasApiKey ? t('kit.aiArea.providers.keySet') : t('kit.aiArea.providers.noKey') }}</template>
              </div>
            </div>
            <span class="lu-prow-status"><span class="lu-sdot" :style="{ background: statusColor(p.id) }" />{{ statusLabel(p.id) }}</span>
            <!-- ONE actions cell (the row is a grid — loose buttons would wrap to a new
                 grid row, which is exactly the misplacement the user screenshotted). -->
            <div class="lu-prow-actions">
              <UiButton intent="secondary" size="small" @click="testProvider(p)">{{ t('kit.aiArea.providers.test') }}</UiButton>
              <UiButton intent="primary" size="small" @click="editingId = p.id">{{ t('kit.common.edit') }}</UiButton>
              <!-- Default/Set-as-default is the RIGHTMOST action (2026-07-17) — matches the
                   model catalog's "Default ✓" position + the built-in header, so the default
                   indicator is far-right on every surface. -->
              <UiButton :intent="isDefaultProvider(p) ? 'success' : 'secondary'" size="small"
                @click="openSetDefault(p)">{{ isDefaultProvider(p) ? t('kit.aiArea.providers.isDefault') : t('kit.aiArea.providers.setDefault') }}</UiButton>
            </div>
          </div>
        </template>
        <div v-if="!loading && !shownProviders.length" class="lu-pempty">
          <i18n-t v-if="providerScope === 'local'" keypath="kit.aiArea.providers.noLocal" scope="global"><template #add>{{ t('kit.aiArea.providers.add') }}</template><template #url><span class="lu-mono">{{ LOCAL_URL_EXAMPLE }}</span></template></i18n-t>
          <template v-else>{{ t('kit.aiArea.providers.noCloud', { add: t('kit.aiArea.providers.add') }) }}</template>
        </div>

        <!-- B2-9 (§7.2): the set-as-default confirm — ONE flow for every provider.
             Apply branch when the row has a chat model; else the guard branch
             (built-in: "pick manually or run Quick Setup" — the user's recorded
             offer; other rows: set the Default model in Edit first). -->
        <AppModal v-if="setDefaultFor" :title="t('kit.aiArea.setDefault.title')" :max-width="'480px'" @close="setDefaultFor = null">
          <template v-if="sdModel">
            <i18n-t keypath="kit.aiArea.setDefault.becomes" tag="p" class="lu-sd-line" scope="global"><template #name><b>{{ providerDisplayName(setDefaultFor) }}</b></template><template #model><b>{{ sdModel }}</b></template></i18n-t>
            <!-- QC-21: the built-in's embedding lives in the routing default already —
                 say so instead of the false "no embedding model set". The WHOLE embed
                 block hides in a no-embeddings host (llmUiCapabilities — the docgen
                 "we dont use embedding" report, gated 2026-08-04). -->
            <template v-if="embedsOn">
              <i18n-t v-if="sdEmbedModel && sdIsBuiltin" keypath="kit.aiArea.setDefault.embedUnchanged" tag="p" class="lu-sd-line lu-muted" scope="global"><template #model><b>{{ sdEmbedModel }}</b></template></i18n-t>
              <i18n-t v-else-if="sdEmbedModel" keypath="kit.aiArea.setDefault.embedAlso" tag="p" class="lu-sd-line lu-muted" scope="global"><template #model><b>{{ sdEmbedModel }}</b></template></i18n-t>
              <!-- ONLINE row with no embedding of its own → the Book-search section
                   (2026-07-18): truthful "unchanged" line when an embedding already
                   routes; otherwise recommend the local setup (engine + embed model,
                   shared DownloadBars, cancel free) / a configured Ollama / skip —
                   skipping is passive, Apply never blocks, chat runs bible-only. -->
              <LuBookSearchSetup v-else-if="!sdIsBuiltin" :providers="providers" />
              <p v-else class="lu-sd-line lu-muted">{{ t('kit.aiArea.setDefault.embedKept') }}</p>
            </template>
            <UiCheckbox v-model="overwriteTasks">{{ t('kit.aiArea.setDefault.overwrite') }}</UiCheckbox>
          </template>
          <template v-else-if="sdIsBuiltin">
            <p class="lu-sd-line">{{ t('kit.aiArea.setDefault.assignFirst') }}</p>
          </template>
          <template v-else>
            <i18n-t keypath="kit.aiArea.setDefault.fillFirst" tag="p" class="lu-sd-line" scope="global"><template #field><b>{{ t('kit.aiArea.setDefault.defaultModelField') }}</b></template></i18n-t>
          </template>
          <template #footer>
            <template v-if="sdModel">
              <UiButton intent="secondary" @click="setDefaultFor = null">{{ t('kit.common.cancel') }}</UiButton>
              <UiButton intent="primary" :loading="settingDefault" @click="applySetDefault">{{ t('kit.aiArea.providers.setDefault') }}</UiButton>
            </template>
            <template v-else-if="sdIsBuiltin">
              <UiButton intent="secondary" @click="setDefaultFor = null">{{ t('kit.common.close') }}</UiButton>
              <UiButton intent="primary" @click="sdRunQuickSetup">{{ t('kit.quickSetup.runButton') }}</UiButton>
            </template>
            <template v-else>
              <UiButton intent="secondary" @click="setDefaultFor = null">{{ t('kit.common.close') }}</UiButton>
              <UiButton intent="primary" @click="sdEditProvider">{{ t('kit.aiArea.setDefault.editProvider') }}</UiButton>
            </template>
          </template>
        </AppModal>
      </div>
    </section>

    <!-- ── Models (opt-in split, `modelsTab`) — the SAME shared catalog surface the
         built-in provider's Edit mounts; lazy (first visit), then kept mounted so a
         running download's progress survives a tab switch. ── -->
    <section v-if="props.modelsTab && visitedTabs.has('models')" v-show="tab === 'models'" class="lu-tab" v-bind="tabPanelAttrs(tabPrefix, 'models')">
      <LuModelCatalog />
    </section>

    <!-- ── Routing by feature — the Feature Workbench: per-feature preset (model +
         ask-params/samplers live in the preset; launch switches live on the MODEL —
         Tune & measure, §7.1). ── -->
    <section v-show="tab === 'features'" class="lu-tab lu-tab-fill" v-bind="tabPanelAttrs(tabPrefix, 'features')">
      <FeatureWorkbench v-if="tab === 'features'" :run-stream="props.runStream"
        :data-links="props.dataLinks" :initial-action="props.initialFeatureAction" />
    </section>

    <!-- ── Usage — full ledger: rollup + by-feature + by-provider + reset ── -->
    <section v-show="tab === 'usage'" class="lu-tab" v-bind="tabPanelAttrs(tabPrefix, 'usage')">
      <template v-if="usageView">
        <div class="lu-usagehead">
          <span class="lu-pcard-title">{{ t('kit.aiTabs.usage') }}</span>
          <span class="lu-muted lu-usagesub">{{ t('kit.aiArea.usage.sub') }}</span>
          <UiButton intent="ghost" size="small" @click="clearUsage">{{ t('kit.aiArea.usage.reset') }}</UiButton>
        </div>
        <div class="lu-usage">
          <div class="lu-card lu-ucard"><div class="lu-uval">{{ fmtNum(usageView.calls) }}</div><div class="lu-ulabel">{{ t('kit.aiArea.usage.calls') }}</div></div>
          <div class="lu-card lu-ucard"><div class="lu-uval">{{ fmtNum(usageView.tokens) }}</div><div class="lu-ulabel">{{ t('kit.aiArea.usage.tokens') }}</div></div>
          <div class="lu-card lu-ucard"><div class="lu-uval">{{ fmtNum(usageView.prompt) }}</div><div class="lu-ulabel">{{ t('kit.aiArea.usage.prompt') }}</div></div>
          <div class="lu-card lu-ucard"><div class="lu-uval">{{ fmtNum(usageView.completion) }}</div><div class="lu-ulabel">{{ t('kit.aiArea.usage.completion') }}</div></div>
          <div class="lu-card lu-ucard"><div class="lu-uval">{{ fmtUsd(usageView.cost) }}</div><div class="lu-ulabel">{{ t('kit.aiArea.usage.cost') }}</div></div>
        </div>
        <!-- Both breakdowns are the SAME table with a different first-column label, so they
             share one column config (usageColumns) on the shared UiTable rather than being
             two hand-rolled copies. Sorting comes with it — "which feature costs the most"
             is the question this panel exists to answer, and it used to need a spreadsheet. -->
        <div class="lu-usage-section">
          <div class="lu-usage-h">{{ t('kit.aiArea.usage.byFeature') }}</div>
          <UiTable class="lu-utable" :data="usageView.feat" :columns="usageColumns(t('kit.aiArea.usage.colFeature'))"
            data-key="key" :default-sort="{ id: 'calls', desc: true }">
            <template #calls="{ row }">{{ fmtNum(row.calls) }}</template>
            <template #prompt="{ row }">{{ fmtNum(row.prompt) }}</template>
            <template #completion="{ row }">{{ fmtNum(row.completion) }}</template>
            <template #cost="{ row }">{{ fmtUsd(row.cost) }}</template>
          </UiTable>
        </div>
        <div class="lu-usage-section">
          <div class="lu-usage-h">{{ t('kit.aiArea.usage.byProvider') }}</div>
          <UiTable class="lu-utable" :data="usageView.prov" :columns="usageColumns(t('kit.aiArea.usage.colProvider'))"
            data-key="key" :default-sort="{ id: 'calls', desc: true }">
            <template #calls="{ row }">{{ fmtNum(row.calls) }}</template>
            <template #prompt="{ row }">{{ fmtNum(row.prompt) }}</template>
            <template #completion="{ row }">{{ fmtNum(row.completion) }}</template>
            <template #cost="{ row }">{{ fmtUsd(row.cost) }}</template>
          </UiTable>
        </div>
      </template>
      <div v-else class="lu-card lu-usage-empty lu-muted">{{ t('kit.aiArea.usage.none') }}</div>
      <PricingEditor v-if="tab === 'usage'" />
    </section>

    <!-- ── AI engine console — live follow of the server log ring + the engine
         child's output (QC-43c). Mounted only while active (v-if) so its poll
         stops when the reader leaves the tab. Fills its height (one scroller). ── -->
    <section v-show="tab === 'console'" class="lu-tab lu-tab-fill" v-bind="tabPanelAttrs(tabPrefix, 'console')">
      <ConsolePanel v-if="tab === 'console'" />
    </section>

    <!-- ── App-contributed tabs (host fills #app-tab / #app-tab-<id>; e.g. JW
         "Writing AI", JV "Speech engines"). Lazy: mounted on first visit, kept
         mounted after so tab state (an in-flight install, a scroll) survives. ── -->
    <section v-for="tb in appTabDefs" :key="tb.id" v-show="tab === tb.id" class="lu-tab" v-bind="tabPanelAttrs(tabPrefix, tb.id)">
      <slot v-if="visitedTabs.has(tb.id)" :name="tb.slot" />
    </section>
  </div>
</template>

<style scoped>
/* Full width — the host card frames it; no inner cap (matches JV's settings). In a host that gives
   it a height (the app's page column), the area is the ONE scroller — the hardware card, the sticky
   tab strip and the tab together; a fill tab (Routing, the console) fills what is left and scrolls
   in its own panes instead. In a host that scrolls itself, the area grows and the host scrolls. */
.lu-area { width: 100%; flex: 1; display: flex; flex-direction: column; min-height: 0; overflow-y: auto; }
.lu-area.lu-area--fill { overflow: hidden; }
.lu-h1 { font-size: 22px; font-weight: 600; margin: 0; color: var(--ink); }
.lu-lede { font-size: 13px; margin: 4px 0 0; }
/* The machine strip — labelled stat blocks (OS · CPU · Memory · GPU · Accel ·
   the live memory cells), stacked label-over-value-over-detail.
   The cells live in an auto-fit COLUMN GRID: every track is the same width, so
   the cells align vertically as well as horizontally and a wrap produces a
   second tidy row of the same columns instead of a ragged flex remainder. The
   Copy button is the strip's own trailing ROW, not a trailing column: riding
   beside the cells it ate a whole track's worth of width and orphaned the last
   cell onto a line of its own (the same reason a cell's action sits under its
   value rather than beside it). */
.lu-hwstrip { display: grid; row-gap: 8px; background: var(--surface); border: 1px solid var(--border); border-radius: 10px; padding: 12px 18px; margin-top: 12px; }
.lu-hwstats { display: grid; grid-template-columns: repeat(auto-fit, minmax(148px, 1fr)); gap: 14px 22px; min-width: 0; }
.lu-hwcopy { margin: 0; justify-self: end; white-space: nowrap; }
.lu-hwstat { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
.lu-hwstat-k { font-size: 10px; text-transform: uppercase; letter-spacing: .05em; color: var(--muted); font-weight: 700; }
/* Long values (a full GPU name, "CUDA (in use) · VULKAN (supported)") wrap
   INSIDE their track rather than stretching it — `anywhere` so a model id with
   no spaces breaks instead of overflowing the cell. */
.lu-hwstat-v { font-size: 13.5px; font-weight: 600; color: var(--ink); overflow-wrap: anywhere; }
.lu-hwstat-sub { font-size: 11.5px; line-height: 1.35; color: var(--muted); font-weight: 500; overflow-wrap: anywhere; }
/* A cell's one action. Sits under the value so it can't widen the cell and
   push the strip's wrap point around as the number changes. */
.lu-hwstat-act { font-size: 11px; font-weight: 600; color: var(--accent, #3b82f6); cursor: pointer; user-select: none; }
.lu-hwstat-act:hover, .lu-hwstat-act:focus-visible { text-decoration: underline; }

/* The "who is using the GPU" panel — same card surface as the strip it hangs
   under, so the pair reads as one block rather than a floating overlay. */
.lu-gpuapps { background: var(--surface); border: 1px solid var(--border); border-radius: 10px; padding: 12px 18px; margin-top: 8px; }
.lu-gpuapps-head { display: flex; align-items: center; gap: 10px; margin-bottom: 8px; }
.lu-gpuapps-head b { font-size: 13px; margin-right: auto; }
/* One scroller, capped: 25 rows is a normal desktop, and the panel must not
   push the tabs off-screen. */
.lu-gpuapps-rows { display: flex; flex-direction: column; max-height: 260px; overflow-y: auto; }
.lu-gpuapp { display: flex; align-items: baseline; gap: 10px; padding: 3px 0; font-size: 12.5px; border-bottom: 1px solid var(--border); }
.lu-gpuapp:last-child { border-bottom: 0; }
.lu-gpuapp-n { flex: 1 1 auto; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: var(--ink); }
.lu-gpuapp-p { flex: 0 0 auto; color: var(--muted); font-size: 11px; }
/* Tabular figures so the memory column lines up as a column. */
.lu-gpuapp-m { flex: 0 0 auto; min-width: 72px; text-align: right; font-weight: 700; font-variant-numeric: tabular-nums; }
.lu-gpuapp.is-own .lu-gpuapp-n { font-weight: 700; }
.lu-gpuapp-tag { margin-left: 6px; font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: .04em; color: var(--accent, #3b82f6); }
.lu-gpuapps-note { margin: 8px 0 0; font-size: 11.5px; line-height: 1.45; color: var(--muted); }

/* Sticky tab strip — stays put while a long providers/features list scrolls
   under it. var(--surface) backing matches the host card so rows pass cleanly
   beneath; the pseudo-element bleeds the bg over the host's scroll padding so
   nothing peeks above the bar. */
/* The strip is UiTabStrip (its look and one-row fit are the kit theme's "Tab strip"); here only
   where it sits. */
.lu-subnav { margin-top: 22px; position: sticky; top: 0; z-index: 5; background: var(--surface); }
/* Cover the host card's scroll padding above the stuck bar so rows don't peek
   through. Height == the subnav's top margin so it fills that gap exactly when
   unstuck (over the same surface bg → invisible) and the padding band when stuck. */
.lu-subnav::before { content: ""; position: absolute; left: 0; right: 0; top: -22px; height: 22px; background: var(--surface); }
/* A tab's content is as tall as it is — the area scrolls, never the tab. */
.lu-tab { padding-top: 14px; flex: none; }
/* Routing-by-feature fills its height (its own nav + content panes scroll); it
   does not scroll as a whole. */
.lu-tab.lu-tab-fill { flex: 1; min-height: 0; overflow: hidden; display: flex; flex-direction: column; }

/* naked control — the host wraps it in its own page card (.pane-card in JW) */
.lu-pcard-head { display: flex; align-items: center; gap: 10px; margin-bottom: 12px; }
.lu-pcard-title { font-weight: 700; font-size: 14px; color: var(--ink); }
.lu-pcard-count { font-size: 12px; }
.lu-pcard-head .lu-btn { margin-left: auto; }
.lu-plus { font-weight: 700; }

/* The Local/Online tab strip. The kit's connected UiSegmented flexes its buttons,
   so the caller owns the row width (a full-width strip over a wide provider list
   reads as a banner, not a control). */
.lu-scope { display: flex; margin: 10px 0 4px; max-width: 520px; }
.lu-warmbar { margin: 6px 0 0; }

.lu-prow {
  /* 4 columns: icon · info · status · the ONE actions cell (Test/Edit + the Built-in
     row's engine buttons live INSIDE it — loose grid children wrapped to a new row). */
  display: grid; grid-template-columns: auto minmax(0,1fr) auto auto; gap: 14px; align-items: center;
  padding: 12px 14px; border: 1px solid var(--border); border-radius: 10px; background: var(--surface); margin-top: 8px;
}
.lu-prow-actions { display: flex; align-items: center; gap: 10px; flex-shrink: 0; }
/* At phone width (Quasar's xs) the row is two columns: the icon, then the name and details,
   the status and the actions stacked under each other, the actions wrapping. */
@media (max-width: 599.98px) {
  .lu-prow { grid-template-columns: auto minmax(0, 1fr); row-gap: 8px; align-items: start; }
  .lu-prow-status, .lu-prow-actions { grid-column: 2; }
  .lu-prow-actions { flex-wrap: wrap; gap: 8px; }
}
/* B2-9 set-as-default confirm — body lines above the overwrite choice. */
.lu-sd-line { margin: 0 0 10px; }
/* The Quick-Setup band, lifted out of the (now deleted) promoted built-in card
   2026-07-19 — it keeps the same seating that card gave it: its own row
   at the top of the Local scope, closed by a rule — left-aligned with everything under it (it sat
   centred over a left-aligned list — the visual review, 2026-10-20), and as wide as the list. */
.lu-qs-band { padding-bottom: 14px; border-bottom: 1px solid var(--border); margin-bottom: 14px; max-width: var(--w-edit, 880px); }
/* A readable width: at 1920px a provider row was ~1650px, its buttons a long way right of its name
   (the visual review, 2026-10-20). The rows, the scope strip and the add form take the list's. */
.lu-providers { max-width: var(--w-edit, 880px); }
.lu-prow-ic { width: 36px; height: 36px; border-radius: 8px; background: var(--surface-3); color: var(--ink-2); display: grid; place-items: center; }
.lu-prow-ic svg { width: 17px; height: 17px; }
.lu-prow-info { min-width: 0; }
.lu-prow-name { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; }
.lu-prow-name b { font-size: 13.5px; color: var(--ink); }
.lu-cap { font-size: 9px; font-weight: 700; letter-spacing: .05em; padding: 2px 7px; border-radius: 999px; border: 1px solid var(--border-strong); color: var(--ink-2); background: var(--surface); }
.lu-prow-url { font-family: var(--font-mono, monospace); font-size: 11px; color: var(--muted); margin-top: 2px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.lu-prow-meta { font-size: 11px; color: var(--muted); margin-top: 2px; }
.lu-prow-meta b { color: var(--ink-2); }
.lu-prow-status { display: inline-flex; align-items: center; gap: 6px; font-size: 11.5px; color: var(--ink-2); white-space: nowrap; }
.lu-sdot { width: 8px; height: 8px; border-radius: 50%; flex: none; }
.lu-pempty { font-size: 12px; text-align: center; padding: 14px; background: var(--surface-2); border-radius: 8px; font-style: italic; color: var(--muted); margin-top: 8px; }
/* The add-provider form carries the card chrome itself (QC-39 neutral .lu-pform);
   "new" keeps only the accent border-color as its affordance (chip-scale accent). */
.lu-newform { border-color: var(--accent); }
.lu-mono { font-family: var(--font-mono, monospace); }

/* Usage — header + rollup metric cards + per-feature/provider tables. */
.lu-usagehead { display: flex; align-items: baseline; gap: 12px; margin-bottom: 12px; }
.lu-usagesub { font-size: 11.5px; flex: 1; }
.lu-usage { display: grid; grid-template-columns: repeat(auto-fit, minmax(120px, 1fr)); gap: 12px; max-width: 760px; }
.lu-ucard { display: flex; flex-direction: column; gap: 4px; }
.lu-uval { font-size: 23px; font-weight: 700; color: var(--ink); line-height: 1.1; }
.lu-ulabel { font-size: 12px; color: var(--muted); }
.lu-usage-empty { text-align: center; font-size: 12.5px; }
.lu-usage-section { margin-top: 20px; }
.lu-usage-h { font-size: 11px; font-weight: 800; letter-spacing: .06em; text-transform: uppercase; color: var(--muted); margin-bottom: 8px; }
/* These two breakdowns are the shared UiTable now, so the table mechanics (layout, header
   chrome, sort caret) come from common/styles.css. What is left here is what is specific to a
   usage ledger: figures right-aligned and tabular so digits line up down the column, with the
   name column left and emphasised. `:deep` because the table markup belongs to UiTable. */
.lu-utable :deep(.ui-table) { font-size: 12.5px; }
.lu-utable :deep(th) { text-align: right; }
.lu-utable :deep(th:first-child), .lu-utable :deep(td:first-child) { text-align: left; }
.lu-utable :deep(tbody td) { text-align: right; padding: 7px 10px; border-bottom: 1px solid var(--border); color: var(--ink-2); font-variant-numeric: tabular-nums; }
.lu-utable :deep(tbody td:first-child) { color: var(--ink); font-weight: 600; }
.lu-utable :deep(tbody tr:last-child td) { border-bottom: 0; }
</style>
