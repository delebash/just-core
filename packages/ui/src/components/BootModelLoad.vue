<script setup>
// SPDX-License-Identifier: MIT
// THE boot-time loading-model control (2026-08-04 ruling: "the loading model ui
// control should be [in the kit] and the app mounts it on its own splash page").
// Renders the SAME shared DownloadBars every load surface uses — the engine-install
// bar while the gate runs, then the model's load bar TITLED WITH THE MODEL NAME
// (shared behavior: every consumer shows which model is warming) — plus the one
// universal escape. Auto-dismisses on resident (700 ms beat: taskFor emits only
// running/error/empty, never "done", so the bar simply stops). Cancel/error leave
// the bar showing its own Retry; Continue never traps anyone on a boot screen.
// The host owns the splash PAGE — plate, layout, z-index — and v-ifs it on
// `warmModelId` (exported beside startWarmOnBoot); this control owns everything
// inside the load group and renders nothing until a task actually exists.
// `#failed` slot (2026-09-29, additive): under a load that ended in error, the host
// adds its own help — JustVoice offers to stop speech engines left over from an
// earlier session, which were holding the GPU memory the model needed. Slot props:
// { task, modelId }; `task.retry()` is the bar's own Retry. A host that fills nothing gets the
// kit's default (the template audit, 2026-10-19): "What can I do?", which leaves the splash and
// opens the app's Troubleshooting help page — shown only when the app has that page.
import { computed, watch } from "vue";
import { useI18n } from "vue-i18n";
import DownloadBar from "../common/components/DownloadBar.vue";
import { helpConfig, openHelp } from "../common/services/help.js";
import { useRunnerModels } from "../composables/useRunnerModels.js";
import { warmModelId } from "../services/warmBoot.js";

const { t } = useI18n();
defineProps({
  engineTitle: { type: String, default: "" },   // "" → the kit's words
  continueLabel: { type: String, default: "" }, // "" → the kit's words
});

const rm = useRunnerModels();
const warmTask = computed(() => (warmModelId.value ? rm.taskFor(warmModelId.value) : null));
const engineTask = computed(() =>
  rm.engineGateTask?.value && rm.engineGateTask.value.state === "running" ? rm.engineGateTask.value : null);
const shownTask = computed(() => engineTask.value || warmTask.value);
const warmRow = computed(() => (warmModelId.value ? rm.models.value.find((m) => m.id === warmModelId.value) : null));
const warmRowStatus = computed(() => warmRow.value?.status || "");
// the bar's title is the model's NAME (the header's shared behavior); its id only while the list hasn't come
const warmTitle = computed(() => warmRow.value?.name || warmModelId.value);
// `immediate` (2026-10-05): when the list ALREADY says loaded as the splash
// mounts, nothing changes, so a plain watch never fired — and retryLoad of a
// resident model starts no task, so there was no Continue either. JustVoice's
// headless checks hung on "JustVoice" for minutes, three times running.
watch(warmRowStatus, (s) => {
  if (warmModelId.value && (s === "loaded" || s === "sleeping")) setTimeout(dismiss, 700);
}, { immediate: true });
function dismiss() {
  warmModelId.value = ""; // the ONE signal the host splash renders on
}
// the app's help page for a model that won't load (docs/troubleshooting.md in every family app)
const HELP_PAGE = "troubleshooting";
const hasHelp = computed(() => !!helpConfig.hasDoc(HELP_PAGE));
function openTroubleshooting() {
  dismiss(); // the splash covers the window: the help opens over the app
  openHelp(HELP_PAGE);
}
</script>

<template>
  <div v-if="engineTask || (warmTask && warmTask.state)" class="lu-bootload">
    <DownloadBar v-if="engineTask" class="lu-bootload__bar" :task="engineTask" :title="engineTitle || t('kit.bootLoad.engineTitle')" />
    <DownloadBar v-else class="lu-bootload__bar" :task="warmTask" :title="warmTitle" />
    <slot v-if="shownTask?.state === 'error'" name="failed" :task="shownTask" :model-id="warmModelId">
      <button v-if="hasHelp" type="button" class="lu-bootload__help" @click="openTroubleshooting">{{ t('kit.bootLoad.help') }}</button>
    </slot>
    <button type="button" class="lu-bootload__skip" @click="dismiss">{{ continueLabel || t('kit.bootLoad.continue') }}</button>
  </div>
</template>

<style scoped>
/* Neutral by design — the host splash positions and skins the group (JW parks it
   in the plate's parchment gap, i18n centres it in the art's bottom strip). */
.lu-bootload { display: flex; flex-direction: column; align-items: center; gap: 8px; width: 100%; }
.lu-bootload__bar { width: 100%; }
.lu-bootload__skip,
.lu-bootload__help {
  border: 0; background: none; padding: 0; cursor: pointer;
  font: inherit; color: inherit;
  text-decoration: underline; text-underline-offset: 2px;
}
</style>
