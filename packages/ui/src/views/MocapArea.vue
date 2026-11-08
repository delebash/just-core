<script setup>
// SPDX-License-Identifier: MIT
// The Motion capture screen (just-mocap's plan of 2026-11-07, M4: "one screen inside JustDirect", the kit's so JustStage
// shares it): Takes — a video in, the person's body, fingers and face captured from it into animation files (the kit's
// mocap runtime, /v1/mocap) — and Live, the webcam tracked in this window. What the engine still needs (its install, its
// models, FFmpeg) is offered in place by the kit's engine banner, from the mocap readiness route. The server owns the
// takes; this screen asks it.
import { computed, onMounted, ref, watch } from "vue";
import { useI18n } from "vue-i18n";
import EmptyState from "../common/components/EmptyState.vue";
import Icon from "../common/components/Icon.vue";
import UiButton from "../common/components/UiButton.vue";
import UiTabStrip from "../common/components/UiTabStrip.vue";
import UiTag from "../common/components/UiTag.vue";
import { tabPanelAttrs } from "../common/components/tabPanels.js";
import { relativeTime } from "../common/services/relativeTime.js";
import { reportError } from "../common/services/reportError.js";
import { get, postForm } from "../common/services/serverApi.js";
import { pushToast } from "../common/services/toastBridge.js";
import LuEngineNeeded from "../components/LuEngineNeeded.vue";
import MocapLive from "../components/MocapLive.vue";
import MocapTakePanel from "../components/MocapTakePanel.vue";

const { t } = useI18n();
const tab = ref("takes");
const TABS = computed(() => [
  { id: "takes", label: t("kit.mocap.tabs.takes") },
  { id: "live", label: t("kit.mocap.tabs.live") },
]);

const takes = ref([]);
const loaded = ref(false);
const picked = ref("");
const adding = ref("");
const banner = ref(null);
const take = computed(() => takes.value.find((x) => x.id === picked.value) ?? null);

async function load() {
  try {
    takes.value = (await get("/v1/mocap/takes")).takes;
    if (!take.value && takes.value.length) picked.value = takes.value[0].id;
  } catch (e) {
    reportError(e);
  } finally {
    loaded.value = true;
  }
}
onMounted(load);

const fileInput = ref(null);
const pickVideo = () => fileInput.value?.click();
async function addVideo(event) {
  const file = event.target.files?.[0];
  event.target.value = "";
  if (!file) return;
  adding.value = file.name;
  try {
    const form = new FormData();
    form.append("file", file, file.name);
    const made = await postForm(`/v1/mocap/takes?name=${encodeURIComponent(file.name)}`, form);
    pushToast({ kind: "success", title: t("kit.mocap.takes.added", { name: made.name }) });
    await load();
    picked.value = made.id;
  } catch (e) {
    reportError(e);
  } finally {
    adding.value = "";
  }
}
const stateIntent = (s) => ({ done: "success", failed: "danger", running: "info", cancelled: "secondary" })[s] ?? "secondary";
// the banner says when the engine became ready: the panel's buttons follow
const ready = ref(false);
watch(banner, () => banner.value?.refresh?.());
</script>

<template>
  <section class="mocap" :aria-label="t('kit.mocap.title')">
    <LuEngineNeeded ref="banner" readiness-url="/v1/mocap/readiness" :label="t('kit.mocap.feature')" @ready="ready = true" />
    <UiTabStrip v-model="tab" :tabs="TABS" id-prefix="mocap" :aria-label="t('kit.mocap.tabs.label')" />

    <div v-if="tab === 'takes'" v-bind="tabPanelAttrs('mocap', 'takes')" class="mocap__takes">
      <aside class="mocap__list" :aria-label="t('kit.mocap.takes.label')">
        <input ref="fileInput" type="file" accept="video/*" class="mocap__file" @change="addVideo" />
        <UiButton intent="primary" :loading="!!adding" :label="adding ? t('kit.mocap.takes.adding', { name: adding }) : t('kit.mocap.takes.add')" @click="pickVideo">
          <template #icon><Icon name="Plus" :size="14" /></template>
        </UiButton>
        <ul v-if="takes.length" class="mocap__items">
          <li v-for="x in takes" :key="x.id">
            <button type="button" class="mocap__item" :class="{ 'mocap__item--on': x.id === picked }" :aria-current="x.id === picked ? 'true' : undefined" @click="picked = x.id">
              <span class="mocap__item-name">{{ x.name }}</span>
              <UiTag :intent="stateIntent(x.job ? 'running' : x.state)" :value="t(`kit.mocap.takes.state.${x.job ? 'running' : x.state}`)" />
              <span class="mocap__item-when muted">{{ t("kit.mocap.takes.made", { when: relativeTime(x.createdAt) }) }}</span>
            </button>
          </li>
        </ul>
      </aside>
      <div class="mocap__detail">
        <EmptyState
          v-if="loaded && !takes.length" icon="Camera" :title="t('kit.mocap.takes.empty.title')" :message="t('kit.mocap.takes.empty.message')"
          :action-label="t('kit.mocap.takes.add')" @action="pickVideo"
        />
        <MocapTakePanel v-else-if="take" :key="take.id" :take="take" @changed="load" @deleted="(picked = ''), load()" />
        <p v-else-if="loaded" class="muted">{{ t("kit.mocap.takes.pick") }}</p>
      </div>
    </div>
    <div v-else v-bind="tabPanelAttrs('mocap', 'live')" class="mocap__live">
      <MocapLive />
    </div>
  </section>
</template>

<style scoped>
.mocap { display: flex; flex-direction: column; gap: 12px; min-height: 0; }
.mocap__takes { display: grid; grid-template-columns: minmax(220px, 280px) minmax(0, 1fr); gap: 20px; align-items: start; }
.mocap__list { display: flex; flex-direction: column; gap: 10px; align-items: flex-start; }
.mocap__file { display: none; }
.mocap__items { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 4px; align-self: stretch; }
.mocap__item {
  display: grid; grid-template-columns: 1fr auto; gap: 2px 8px; width: 100%; text-align: left; padding: 8px 10px;
  border: 1px solid var(--border); border-radius: var(--r-sm); background: var(--surface); color: var(--ink); cursor: pointer;
}
.mocap__item--on { border-color: var(--accent); background: var(--accent-soft); }
.mocap__item-name { font-weight: 600; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.mocap__item-when { grid-column: 1 / -1; font-size: max(var(--text-floor, 0px), 11.5px); }
.mocap__detail { min-width: 0; }
</style>
