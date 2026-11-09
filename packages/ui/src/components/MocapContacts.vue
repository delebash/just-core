<script setup>
// SPDX-License-Identifier: MIT
// A take's foot contacts (just-mocap's foot correction — RGB MoCap's contact timeline, MIT: "Apply Correction ... does
// not require fresh AI inference"): for each foot, the frames it is planted, drawn on a strip over the take's length
// and listed as From / To frames to edit, add or remove. Apply runs the foot correction with them and every step after
// it as a server job (POST /v1/mocap/takes/:id/contacts), without the models; Back to the found contacts puts the ones
// the correction found back in the list. Frames are the take's 30 fps copy's; an end frame is the first one after the
// contact (the engine's own ranges).
import { computed, onMounted, ref } from "vue";
import { useI18n } from "vue-i18n";
import Icon from "../common/components/Icon.vue";
import UiButton from "../common/components/UiButton.vue";
import UiNumber from "../common/components/UiNumber.vue";
import { reportError } from "../common/services/reportError.js";
import { get, post } from "../common/services/serverApi.js";
import { pushToast } from "../common/services/toastBridge.js";
import { useSurfaceTask } from "../composables/useSurfaceTask.js";
import { runServerJob } from "../services/serverJob.js";
import AiTaskStrip from "./AiTaskStrip.vue";

const props = defineProps({ take: { type: Object, required: true } });
const emit = defineEmits(["applied"]);
const { t } = useI18n();
const url = () => `/v1/mocap/takes/${encodeURIComponent(props.take.id)}/contacts`;

const found = ref(null); // contacts.json: {fps, frames, mode, edited, automatic, applied}
const feet = ref([[], []]); // the list being edited: per foot, [{from, to}]
const FEET = computed(() => [t("kit.mocap.contacts.left"), t("kit.mocap.contacts.right")]);
const toRows = (ranges) => ranges.map((foot) => foot.map(([from, to]) => ({ from, to })));
async function load() {
  try {
    found.value = await get(url());
    feet.value = toRows(found.value.applied);
  } catch (e) {
    reportError(e);
  }
}
onMounted(load);

const frames = computed(() => Number(found.value?.frames || 0));
const pct = (n) => `${frames.value ? (100 * n) / frames.value : 0}%`;
const seconds = (n) => Math.round((10 * n) / Number(found.value?.fps || 30)) / 10;
const add = (f) => {
  const last = feet.value[f].at(-1);
  const from = Math.min(frames.value - 1, last ? last.to + 5 : 0);
  feet.value[f].push({ from, to: Math.min(frames.value, from + 15) });
};
const removeRow = (f, i) => feet.value[f].splice(i, 1);
const reset = () => (feet.value = toRows(found.value.automatic));
// "edited" only while the take's contacts differ from the found ones: the engine marks any applied list as edited,
// the found ones applied again too (2026-11-08, JustDirect's window read "Edited contacts are in use" after Back + Apply)
const editedInUse = computed(() => !!found.value?.edited && JSON.stringify(found.value.applied) !== JSON.stringify(found.value.automatic));
// each contact inside the take and ending after it starts; overlaps within one foot are joined by the engine's own rules
const valid = computed(() => feet.value.every((foot) => foot.every((r) => Number.isInteger(r.from) && Number.isInteger(r.to) && r.from >= 0 && r.to > r.from && r.to <= frames.value)));
const ranges = () => feet.value.map((foot) => [...foot].sort((a, b) => a.from - b.from).map((r) => [r.from, r.to]));

const task = useSurfaceTask("mocap.contacts", () => ({ take: props.take.id }));
async function apply() {
  try {
    await runServerJob({
      start: () => post(url(), { ranges: ranges() }),
      feature: "mocap.contacts",
      label: t("kit.mocap.contacts.task", { name: props.take.name }),
      meta: { take: props.take.id },
      describe: (job, pct) => (job.message ? t("kit.mocap.take.progress", { step: job.message, n: pct }) : ""),
    });
    pushToast({ kind: "success", title: t("kit.mocap.contacts.applied", { name: props.take.name }) });
    await load();
    emit("applied");
  } catch (e) {
    if (e?.name !== "AbortError") reportError(e);
  }
}
</script>

<template>
  <section v-if="found" class="contacts" :aria-label="t('kit.mocap.contacts.label')">
    <h3 class="contacts__h">{{ t("kit.mocap.contacts.label") }}</h3>
    <p class="muted contacts__hint">{{ t("kit.mocap.contacts.hint") }} {{ t("kit.mocap.contacts.frames", { frames, fps: found.fps }) }}</p>
    <p v-if="editedInUse" class="muted">{{ t("kit.mocap.contacts.edited") }}</p>
    <div v-for="(foot, f) in feet" :key="f" class="contacts__foot">
      <div class="contacts__strip" role="img" :aria-label="`${FEET[f]}: ${foot.map((r) => `${r.from}–${r.to}`).join(', ') || t('kit.mocap.contacts.none')}`">
        <span class="contacts__name">{{ FEET[f] }}</span>
        <div class="contacts__track">
          <span v-for="(r, i) in foot" :key="i" class="contacts__bar" :style="{ left: pct(r.from), width: pct(Math.max(1, r.to - r.from)) }" :title="`${r.from}–${r.to} · ${t('kit.mocap.contacts.seconds', { s: seconds(r.to - r.from) })}`" />
        </div>
      </div>
      <ul class="contacts__rows">
        <li v-for="(r, i) in foot" :key="i">
          <UiNumber v-model="r.from" :min="0" :max="frames - 1" width="token" size="small" :aria-label="`${FEET[f]} ${t('kit.mocap.contacts.from')}`" />
          <span aria-hidden="true">–</span>
          <UiNumber v-model="r.to" :min="1" :max="frames" width="token" size="small" :aria-label="`${FEET[f]} ${t('kit.mocap.contacts.to')}`" />
          <span class="muted">{{ t("kit.mocap.contacts.seconds", { s: seconds(r.to - r.from) }) }}</span>
          <UiButton intent="ghost" size="small" :label="t('kit.mocap.contacts.remove')" @click="removeRow(f, i)">
            <template #icon><Icon name="Close" :size="12" /></template>
          </UiButton>
        </li>
      </ul>
      <UiButton intent="ghost" size="small" :label="t('kit.mocap.contacts.add')" @click="add(f)">
        <template #icon><Icon name="Plus" :size="12" /></template>
      </UiButton>
    </div>
    <div class="contacts__actions">
      <UiButton intent="primary" focusable-when-disabled :disabled="!!task || !valid" :label="task ? t('kit.mocap.contacts.applying') : t('kit.mocap.contacts.apply')" @click="apply" />
      <UiButton intent="secondary" focusable-when-disabled :disabled="!!task" :label="t('kit.mocap.contacts.reset')" @click="reset" />
    </div>
    <AiTaskStrip :task="task" />
  </section>
</template>

<style scoped>
.contacts { display: flex; flex-direction: column; gap: 8px; }
.contacts__h { margin: 0; font-size: max(var(--text-floor, 0px), 13px); }
.contacts__hint { margin: 0; max-width: 72ch; }
.contacts__foot { display: flex; flex-direction: column; gap: 4px; }
.contacts__strip { display: grid; grid-template-columns: 80px minmax(0, 1fr); align-items: center; gap: 8px; max-width: 720px; }
.contacts__name { font-weight: 600; }
.contacts__track { position: relative; height: 14px; background: var(--surface-2); border: 1px solid var(--border); border-radius: var(--r-sm); }
.contacts__bar { position: absolute; top: 1px; bottom: 1px; background: var(--accent); border-radius: 2px; }
.contacts__rows { list-style: none; margin: 0 0 0 88px; padding: 0; display: flex; flex-direction: column; gap: 4px; }
.contacts__rows li { display: flex; align-items: center; gap: 6px; }
.contacts__actions { display: flex; gap: 8px; }
</style>
