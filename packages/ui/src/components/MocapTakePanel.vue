<script setup>
// SPDX-License-Identifier: MIT
// One take on the Motion capture screen (views/MocapArea.vue): its name and choices (the camera's lens, uneven ground,
// the arm fit, the finger smoothing — saved as they change), Capture as a server job with its progress where it was
// started (the kit's AiTaskStrip, Cancel stopping it on the server; a page opened while it runs rejoins it), why it
// failed, and once captured: the preview video, the 3D view, every file to save, and the foot contacts to edit and
// apply. A new take Captures; a stopped or failed one Continues where it stopped; any can be captured again from the
// start (a new lens, ground, arm-fit or smoothing choice needs that: the engine keeps what it made with the old ones).
import { computed, onBeforeUnmount, onMounted, reactive, ref, watch } from "vue";
import { useI18n } from "vue-i18n";
import Icon from "../common/components/Icon.vue";
import UiBanner from "../common/components/UiBanner.vue";
import UiButton from "../common/components/UiButton.vue";
import UiField from "../common/components/UiField.vue";
import UiInput from "../common/components/UiInput.vue";
import UiNumber from "../common/components/UiNumber.vue";
import UiSegmented from "../common/components/UiSegmented.vue";
import UiSelect from "../common/components/UiSelect.vue";
import UiToggle from "../common/components/UiToggle.vue";
import { confirmDialog } from "../common/services/dialog.js";
import { canSaveNatively, saveUrlAs } from "../common/services/fileSave.js";
import { reportError } from "../common/services/reportError.js";
import { del, patch, post, serverUrl } from "../common/services/serverApi.js";
import { pushToast } from "../common/services/toastBridge.js";
import { useSurfaceTask } from "../composables/useSurfaceTask.js";
import { runServerJob } from "../services/serverJob.js";
import AiTaskStrip from "./AiTaskStrip.vue";
import Mocap3DView from "./Mocap3DView.vue";
import MocapContacts from "./MocapContacts.vue";

const props = defineProps({ take: { type: Object, required: true } });
const emit = defineEmits(["changed", "deleted"]);
const { t } = useI18n();
const enc = encodeURIComponent;
const base = computed(() => `/v1/mocap/takes/${enc(props.take.id)}`);

// ── its name and choices, saved as they change ──
const name = ref(props.take.name);
const o = reactive({ ...props.take.options });
const lens = ref(o.focal35 != null ? "phone" : o.fov != null ? "webcam" : "auto");
const LENSES = computed(() => ["auto", "phone", "webcam"].map((v) => ({ value: v, label: t(`kit.mocap.take.lens.${v}`) })));
const SMOOTHING = computed(() => ["none", "default", "strong"].map((v) => ({ value: v, label: t(`kit.mocap.take.smoothing.${v}`) })));
let timer = null;
function saveSoon(fields) {
  clearTimeout(timer);
  timer = setTimeout(async () => {
    try {
      await patch(base.value, fields);
      emit("changed");
    } catch (e) {
      reportError(e);
    }
  }, 400);
}
onBeforeUnmount(() => clearTimeout(timer));
const saveName = () => name.value.trim() && name.value !== props.take.name && saveSoon({ name: name.value.trim() });
const CAMERAS = computed(() => [
  { value: false, label: t("kit.mocap.take.camera.still") },
  { value: true, label: t("kit.mocap.take.camera.turning") },
]);
const pickMode = ref(o.person ? "pick" : "auto");
const PEOPLE = computed(() => ["auto", "pick"].map((v) => ({ value: v, label: t(`kit.mocap.take.person.${v}`) })));
const RESTS = computed(() => [
  { value: "t", label: t("kit.mocap.take.files.restT") },
  { value: "a", label: t("kit.mocap.take.files.restA") },
]);
const options = () => ({
  smoothing: o.smoothing,
  unevenGround: !!o.unevenGround,
  armFit: !!o.armFit,
  focal35: lens.value === "phone" ? (o.focal35 ?? 26) : null,
  fov: lens.value === "webcam" ? (o.fov ?? 78) : null,
  start: Math.max(0, Number(o.start) || 0),
  duration: o.duration ? Math.min(60, Number(o.duration)) : null,
  turningCamera: !!o.turningCamera,
  person: pickMode.value === "pick" && o.person ? o.person : null,
  inPlace: !!o.inPlace,
  rest: o.rest === "a" ? "a" : "t",
});
watch(
  [lens, pickMode, () => o.smoothing, () => o.unevenGround, () => o.armFit, () => o.focal35, () => o.fov, () => o.start, () => o.duration, () => o.turningCamera, () => o.person, () => o.inPlace, () => o.rest],
  () => saveSoon({ options: options() }),
);
// the person: a click on the take's first frame, as fractions of the picture
const frameVideo = ref(null);
function atFrame() {
  if (frameVideo.value) frameVideo.value.currentTime = Math.max(0, Number(o.start) || 0);
}
function pickPerson(event) {
  const box = event.currentTarget.getBoundingClientRect();
  o.person = [Math.min(1, Math.max(0, (event.clientX - box.left) / box.width)), Math.min(1, Math.max(0, (event.clientY - box.top) / box.height))];
}

// ── Capture, as a server job ──
const task = useSurfaceTask("mocap.take", () => ({ take: props.take.id }));
const running = computed(() => !!task.value || !!props.take.job);
// the step, the percent, and once a tenth is done the time left at this pace (the run so far over its share done)
function describe(job, pct) {
  if (!job.message) return "";
  const f = job.progress || 0;
  const spent = (Date.now() - Date.parse(job.startedAt || "")) / 60_000;
  if (f < 0.1 || !Number.isFinite(spent)) return t("kit.mocap.take.progress", { step: job.message, n: pct });
  return t("kit.mocap.take.eta", { step: job.message, n: pct, min: Math.max(1, Math.round((spent * (1 - f)) / f)) });
}
async function follow(start) {
  try {
    await runServerJob({ start, feature: "mocap.take", label: t("kit.mocap.take.task", { name: props.take.name }), meta: { take: props.take.id }, describe });
    pushToast({ kind: "success", title: t("kit.mocap.take.done", { name: props.take.name }) });
  } catch (e) {
    if (e?.name !== "AbortError") reportError(e);
  } finally {
    emit("changed");
  }
}
const capture = (fresh = false) => {
  clearTimeout(timer);
  return follow(() => post(`${base.value}/run`, { options: options(), fresh }));
};
async function captureAgain() {
  await capture(true);
}
// a take running when the page opened (another window, a reload): its job followed here
onMounted(() => {
  if (props.take.job && !task.value) follow(async () => props.take.job);
});
const primary = computed(() => {
  if (props.take.state === "new") return { label: t("kit.mocap.take.run"), fresh: false };
  if (props.take.state === "failed" || props.take.state === "cancelled") return { label: t("kit.mocap.take.continue"), fresh: false };
  return null;
});

// ── its files ──
const has = (n) => props.take.files.includes(n);
const fileUrl = (n) => `${base.value}/files/${enc(n)}`;
const FILE_ORDER = ["fbx", "bvh", "glb", "usd", "c3d", "face", "motion", "preview", "pose", "sheet", "contacts"];
const files = computed(() => FILE_ORDER.filter(has));
const EXT = { fbx: "fbx", bvh: "bvh", glb: "glb", usd: "usd", c3d: "c3d", face: "csv", motion: "json", preview: "mp4", pose: "mp4", sheet: "png", contacts: "json" };
// a file's name as the engine writes it beside the take: the take's name, a suffix for all but the animation files
const SUFFIX = { face: "_face", motion: "_motion", preview: "_preview", pose: "_pose", sheet: "_sheet", contacts: "_contacts" };
const fileName = (n) => `${props.take.name}${SUFFIX[n] ?? ""}.${EXT[n]}`;
async function saveFile(n) {
  try {
    const r = await saveUrlAs(fileUrl(n), fileName(n), { filterExt: EXT[n] });
    if (r?.ok) pushToast({ kind: "success", title: r.path ? t("kit.mocap.results.saved", { path: r.path }) : t("kit.mocap.results.downloaded", { name: fileName(n) }) });
  } catch (e) {
    reportError(e);
  }
}
const saveLabel = computed(() => (canSaveNatively() ? t("kit.mocap.results.save") : t("kit.mocap.results.download")));

async function remove() {
  const yes = await confirmDialog({ title: t("kit.mocap.take.delete.title", { name: props.take.name }), message: t("kit.mocap.take.delete.message"), confirmLabel: t("kit.mocap.take.delete.confirm"), danger: true });
  if (!yes) return;
  try {
    await del(base.value);
    emit("deleted");
  } catch (e) {
    reportError(e);
  }
}
</script>

<template>
  <article class="take">
    <div class="take__head">
      <UiField :label="t('kit.mocap.take.name')" for="take-name">
        <UiInput id="take-name" v-model="name" width="name" @blur="saveName" @keyup.enter="saveName" />
      </UiField>
      <span class="muted">{{ t("kit.mocap.take.source", { name: take.sourceName }) }}</span>
    </div>

    <fieldset class="take__choices" :disabled="running">
      <UiField :label="t('kit.mocap.take.lens.label')" :hint="t('kit.mocap.take.lens.hint')" layout="block">
        <div class="take__lens">
          <UiSegmented v-model="lens" :options="LENSES" :aria-label="t('kit.mocap.take.lens.label')" />
          <UiNumber v-if="lens === 'phone'" v-model="o.focal35" :min="8" :max="300" :step="1" width="token" :aria-label="t('kit.mocap.take.lens.focal35')" :placeholder="'26'" />
          <span v-if="lens === 'phone'" class="muted">{{ t("kit.mocap.take.lens.focal35") }}</span>
          <UiNumber v-if="lens === 'webcam'" v-model="o.fov" :min="20" :max="175" :step="1" width="token" :aria-label="t('kit.mocap.take.lens.fov')" :placeholder="'78'" />
          <span v-if="lens === 'webcam'" class="muted">{{ t("kit.mocap.take.lens.fov") }}</span>
        </div>
      </UiField>
      <UiField :label="t('kit.mocap.take.trim.label')" :hint="t('kit.mocap.take.trim.hint')" layout="block">
        <div class="take__lens">
          <UiNumber v-model="o.start" :min="0" :step="0.5" width="token" :aria-label="t('kit.mocap.take.trim.from')" />
          <span class="muted">{{ t("kit.mocap.take.trim.from") }}</span>
          <UiNumber v-model="o.duration" :min="0.5" :max="60" :step="0.5" width="token" :aria-label="t('kit.mocap.take.trim.length')" :placeholder="'60'" />
          <span class="muted">{{ t("kit.mocap.take.trim.length") }}</span>
        </div>
      </UiField>
      <UiField :label="t('kit.mocap.take.camera.label')" :hint="t('kit.mocap.take.camera.hint')" layout="block">
        <UiSegmented v-model="o.turningCamera" :options="CAMERAS" :aria-label="t('kit.mocap.take.camera.label')" />
      </UiField>
      <UiField :label="t('kit.mocap.take.person.label')" :hint="t('kit.mocap.take.person.hint')" layout="block">
        <UiSegmented v-model="pickMode" :options="PEOPLE" :aria-label="t('kit.mocap.take.person.label')" />
        <div v-if="pickMode === 'pick'" class="take__frame" role="button" tabindex="0" :aria-label="t('kit.mocap.take.person.frame')" @click="pickPerson">
          <video ref="frameVideo" muted preload="metadata" crossorigin="anonymous" :src="serverUrl(fileUrl('source'))" @loadedmetadata="atFrame" />
          <span v-if="o.person" class="take__pin" :style="{ left: `${o.person[0] * 100}%`, top: `${o.person[1] * 100}%` }" aria-hidden="true" />
        </div>
      </UiField>
      <UiField :label="t('kit.mocap.take.ground.label')" :hint="t('kit.mocap.take.ground.hint')" for="take-ground">
        <UiToggle id="take-ground" v-model="o.unevenGround" :aria-label="t('kit.mocap.take.ground.label')" />
      </UiField>
      <UiField :label="t('kit.mocap.take.armFit.label')" :hint="t('kit.mocap.take.armFit.hint')" for="take-armfit">
        <UiToggle id="take-armfit" v-model="o.armFit" :aria-label="t('kit.mocap.take.armFit.label')" />
      </UiField>
      <UiField :label="t('kit.mocap.take.smoothing.label')" for="take-smoothing">
        <UiSelect id="take-smoothing" v-model="o.smoothing" :options="SMOOTHING" width="fit" />
      </UiField>
      <UiField :label="t('kit.mocap.take.files.inPlace')" :hint="t('kit.mocap.take.files.inPlaceHint')" for="take-inplace">
        <UiToggle id="take-inplace" v-model="o.inPlace" :aria-label="t('kit.mocap.take.files.inPlace')" />
      </UiField>
      <UiField :label="t('kit.mocap.take.files.rest')" layout="block">
        <UiSegmented v-model="o.rest" :options="RESTS" :aria-label="t('kit.mocap.take.files.rest')" />
      </UiField>
    </fieldset>

    <div class="take__actions">
      <UiButton v-if="primary" intent="primary" focusable-when-disabled :disabled="running" :label="running ? t('kit.mocap.take.running') : primary.label" @click="capture(primary.fresh)">
        <template #icon><Icon name="Play" :size="14" /></template>
      </UiButton>
      <UiButton
        v-if="take.state !== 'new'" :intent="primary ? 'secondary' : 'primary'" focusable-when-disabled :disabled="running"
        :label="running ? t('kit.mocap.take.running') : t('kit.mocap.take.again')" :title="t('kit.mocap.take.againHint')" @click="captureAgain"
      >
        <template #icon><Icon name="Refresh" :size="14" /></template>
      </UiButton>
      <UiButton intent="ghost" focusable-when-disabled :disabled="running" :label="t('kit.mocap.take.delete.button')" @click="remove">
        <template #icon><Icon name="Trash" :size="14" /></template>
      </UiButton>
    </div>
    <AiTaskStrip :task="task" />
    <UiBanner v-if="!running && take.state === 'failed'" intent="danger">{{ t("kit.mocap.take.failed", { reason: take.error }) }}</UiBanner>
    <UiBanner v-else-if="!running && take.state === 'cancelled'" intent="info">{{ t("kit.mocap.take.stopped") }}</UiBanner>

    <section v-if="files.length && !running" class="take__results" :aria-label="t('kit.mocap.results.label')">
      <div class="take__views">
        <figure v-if="has('preview')" class="take__preview">
          <video controls preload="metadata" crossorigin="anonymous" :src="serverUrl(fileUrl('preview'))" :aria-label="t('kit.mocap.results.preview')" />
          <figcaption class="muted">{{ t("kit.mocap.results.preview") }}</figcaption>
        </figure>
        <Mocap3DView v-if="has('glb')" :src="serverUrl(fileUrl('glb'))" />
      </div>
      <h3 class="take__h">{{ t("kit.mocap.results.files") }}</h3>
      <ul class="take__files">
        <li v-for="n in files" :key="n">
          <span>{{ t(`kit.mocap.results.kinds.${n}`) }}</span>
          <UiButton intent="secondary" size="small" :label="saveLabel" @click="saveFile(n)">
            <template #icon><Icon name="Download" :size="14" /></template>
          </UiButton>
        </li>
      </ul>
      <MocapContacts v-if="has('contacts')" :take="take" @applied="emit('changed')" />
    </section>
  </article>
</template>

<style scoped>
.take { display: flex; flex-direction: column; gap: 14px; }
.take__head { display: flex; flex-wrap: wrap; align-items: flex-end; gap: 8px 16px; }
.take__choices { border: 0; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 10px; }
.take__lens { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; }
.take__actions { display: flex; flex-wrap: wrap; gap: 8px; }
.take__frame { position: relative; display: inline-block; margin-top: 6px; cursor: crosshair; line-height: 0; }
.take__frame video { width: min(480px, 100%); border-radius: var(--r-sm); background: var(--surface-3); }
.take__pin { position: absolute; width: 14px; height: 14px; margin: -7px 0 0 -7px; border-radius: 50%; border: 2px solid var(--on-accent); background: var(--accent); }
.take__results { display: flex; flex-direction: column; gap: 12px; }
.take__views { display: flex; flex-wrap: wrap; gap: 16px; align-items: flex-start; }
.take__preview { margin: 0; display: flex; flex-direction: column; gap: 4px; }
.take__preview video { width: min(560px, 100%); max-height: 360px; background: var(--surface-3); border-radius: var(--r-sm); }
.take__h { margin: 0; font-size: max(var(--text-floor, 0px), 13px); }
.take__files { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 6px; }
.take__files li { display: flex; align-items: center; justify-content: space-between; gap: 12px; max-width: 60ch; }
</style>
