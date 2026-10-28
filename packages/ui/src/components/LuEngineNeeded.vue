<script setup>
// SPDX-License-Identifier: MIT
// "This feature needs its engine" — the in-context banner where a feature is used (the engines plan, K10: built from
// just-house-paint's EngineInstallCard; JustVoice's capture readiness is its other user). It asks the server what the
// feature needs (GET /v1/ai/features/:key/readiness) and offers the next step in place: install the engine, then
// download the model — each with progress and Cancel (the kit's DownloadBar), picked up when the page opens while one
// runs. What this computer lacks is said before anything downloads; a feature with no model set is pointed to the AI
// page. Nothing shows once the feature can run; `ready` is emitted when it becomes so. `label` names the feature in
// the sentence (the app's own words); `feature` is its key.
import { computed, onBeforeUnmount, onMounted, ref } from "vue";
import { useI18n } from "vue-i18n";
import { request } from "../client.js";
import DownloadBar from "../common/components/DownloadBar.vue";
import UiBanner from "../common/components/UiBanner.vue";
import UiButton from "../common/components/UiButton.vue";
import { fmtBytes } from "../common/services/downloadRate.js";
import { kitT } from "../common/services/kitI18n.js";
import { createDownloadTask, readEngineStatus, readRuntimeModelStatus, runtimeEngineChannel, runtimeModelChannel } from "../composables/useDownloadTask.js";
import { engineNeedWords } from "../services/runtimeWords.js";

const props = defineProps({
  feature: { type: String, required: true },
  label: { type: String, default: "" },
});
const emit = defineEmits(["ready"]);
const { t } = useI18n();

const state = ref(null); // the server's readiness
const engineTask = ref(null);
const modelTask = ref(null);
const name = computed(() => props.label || t("kit.runtimes.ready.thisFeature"));
const size = (n) => fmtBytes(n || 0);

async function load() {
  try {
    const was = state.value?.ready;
    state.value = await request(`/v1/ai/features/${encodeURIComponent(props.feature)}/readiness`);
    if (state.value.ready && was === false) emit("ready");
  } catch {
    // the banner never fails a page: it shows nothing until the server answers
  }
}

const tasks = () => {
  const s = state.value;
  if (s?.runtime && !engineTask.value) engineTask.value = createDownloadTask(runtimeEngineChannel(s.runtime));
  if (s?.runtime && s.model && !modelTask.value) modelTask.value = createDownloadTask(runtimeModelChannel(s.runtime, () => s.model));
};
let timer = null;
let gone = false;
const running = () => engineTask.value?.state === "running" || modelTask.value?.state === "running";
function feed() {
  const s = state.value;
  if (!s?.runtime) return;
  tasks();
  if (s.engine?.status === "installing" && engineTask.value.state !== "running") engineTask.value.arm(kitT("kit.engine.phase.downloading"));
  if (engineTask.value.state === "running" && s.engine) engineTask.value.apply(readEngineStatus(s.engine));
  if (s.modelState?.status === "downloading" && modelTask.value.state !== "running") modelTask.value.arm(kitT("kit.phase.downloading"));
  if (modelTask.value.state === "running") modelTask.value.apply(readRuntimeModelStatus(s.modelState));
}
function schedule() {
  if (!timer && !gone) timer = setTimeout(tick, 1200);
}
async function tick() {
  timer = null;
  await load();
  feed();
  if (running()) schedule();
}
onMounted(tick);
onBeforeUnmount(() => {
  gone = true;
  clearTimeout(timer);
});

async function start(task, url) {
  task.arm(kitT("kit.phase.gettingReady"));
  try {
    await request(url, { method: "POST", body: {} });
  } catch (e) {
    task.fail(e?.message || kitT("kit.phase.couldntStart"));
    return;
  }
  schedule();
}
const base = () => `/v1/ai/runtimes/${encodeURIComponent(state.value.runtime)}`;
const installEngine = () => start(engineTask.value, `${base()}/engine/install`);
const downloadModel = () => start(modelTask.value, `${base()}/models/${encodeURIComponent(state.value.model)}/download`);

// the sentence and the one action for what is missing first
const words = computed(() => {
  const s = state.value;
  if (!s || s.ready) return null;
  const n = name.value;
  switch (s.need) {
    case "engine-cant-run-here": {
      const w = engineNeedWords(s.engine?.need);
      return { text: w ? t(w.key, w.values) : t("kit.runtimes.needs.noBuild"), link: w?.link || null, intent: "danger" };
    }
    case "engine-not-installed":
      return { text: t("kit.runtimes.ready.engineNotInstalled", { feature: n, engine: s.engine?.label || s.runtime }), action: "engine", intent: "warning" };
    case "model-not-downloaded":
      return { text: t("kit.runtimes.ready.modelNotDownloaded", { feature: n, model: s.modelState?.name || s.model }), action: "model", intent: "warning" };
    case "no-image-provider":
      return { text: t("kit.runtimes.ready.noProvider", { feature: n }), intent: "danger" };
    case "model-unknown":
      return { text: t("kit.runtimes.ready.modelUnknown", { feature: n }), intent: "danger" };
    case "engine-not-on":
      return { text: t("kit.runtimes.ready.engineNotOn", { feature: n }), intent: "danger" };
    default:
      return { text: t("kit.runtimes.ready.noModel", { feature: n }), intent: "danger" };
  }
});
defineExpose({ refresh: load });
</script>

<template>
  <div v-if="words" class="lu-needed">
    <UiBanner :intent="words.intent">
      {{ words.text }}
      <a v-if="words.link" :href="words.link" target="_blank" rel="noopener">{{ t("kit.runtimes.needs.vcRuntimeLink") }}</a>
      <template v-if="words.action === 'engine'" #action>
        <UiButton
          intent="primary" size="small" focusable-when-disabled :disabled="engineTask?.state === 'running'"
          :label="state.engine?.downloadBytes ? t('kit.runtimes.ready.installEngine', { size: size(state.engine.downloadBytes) }) : t('kit.runtimes.installPlain')"
          @click="installEngine"
        />
      </template>
      <template v-else-if="words.action === 'model'" #action>
        <UiButton
          intent="primary" size="small" focusable-when-disabled :disabled="modelTask?.state === 'running'"
          :label="t('kit.runtimes.ready.downloadModel', { size: size(state.modelState?.bytes) })" @click="downloadModel"
        />
      </template>
    </UiBanner>
    <DownloadBar v-if="words.action === 'engine' && engineTask?.state" :task="engineTask" :title="state.engine?.label || state.runtime" />
    <DownloadBar v-if="words.action === 'model' && modelTask?.state" :task="modelTask" :title="state.modelState?.name || state.model" />
  </div>
</template>

<style scoped>
.lu-needed { display: flex; flex-direction: column; gap: 8px; max-width: 720px; }
</style>
