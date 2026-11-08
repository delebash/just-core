<script setup>
// SPDX-License-Identifier: MIT
// The Motion capture screen's Live tab (just-mocap's plan of 2026-11-07: "the app needs to do live stream from webcam as
// well"): the webcam tracked in this window by MediaPipe Tasks for the web (Pose, Hand and Face Landmarker — Apache-2.0,
// an optional peer the app installs; their models from Motion capture's install, /v1/mocap/live/models), each frame
// solved onto the offline takes' SOMA skeleton (src/mocap/liveSolver.js), drawn over the video (MediaPipe's own
// DrawingUtils), recorded as BVH and Live Link Face CSV (src/mocap/liveRecord.js — the offline takes' layouts), and sent
// on as VMC or OSC while it runs (src/mocap/liveOut.js shapes it, the server sends it over UDP). The hips stay at the
// origin: live has no path across the floor (a captured take does).
import { computed, onBeforeUnmount, onMounted, reactive, ref } from "vue";
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
import { saveBlob } from "../common/services/fileSave.js";
import { reportError } from "../common/services/reportError.js";
import { get, post, serverUrl } from "../common/services/serverApi.js";
import { pushToast } from "../common/services/toastBridge.js";
import { oscMessages, vmcMessages } from "../mocap/liveOut.js";
import { bvhText, faceCsvText } from "../mocap/liveRecord.js";
import { LiveSolver, POSE } from "../mocap/liveSolver.js";
import skeleton from "../mocap/somaRest.json";

const { t } = useI18n();
const RECORD_FPS = 30;
const video = ref(null);
const canvas = ref(null);
const cameras = ref([]);
const camera = ref("");
const state = ref(""); // "" | starting | running
const problem = ref("");
const installed = ref(true);
const seen = reactive({ fps: 0, person: false, hands: 0 });
const send = reactive({ on: false, protocol: "vmc", host: "127.0.0.1", port: 39539, error: "" });
const PROTOCOLS = computed(() => [
  { value: "vmc", label: t("kit.mocap.live.send.vmc") },
  { value: "osc", label: t("kit.mocap.live.send.osc") },
]);
const recording = ref(false);
const recordedSeconds = ref(0);
let take = null; // {started, frames: [{t, world, face}]}
let last = null; // the last recording, for Save
const hasRecording = ref(false);

let stream = null;
let tasks = null; // {pose, hand, face, draw, PoseLandmarker, HandLandmarker}
let loop = 0;
let solver = null;
let previous = 0;
let counted = { n: 0, since: 0 };
let inFlight = false;

async function listCameras() {
  try {
    const all = await navigator.mediaDevices.enumerateDevices();
    cameras.value = all.filter((d) => d.kind === "videoinput").map((d, i) => ({ value: d.deviceId, label: d.label || `${t("kit.mocap.live.camera")} ${i + 1}` }));
    if (!camera.value && cameras.value.length) camera.value = cameras.value[0].value;
  } catch {
    cameras.value = [];
  }
}
onMounted(async () => {
  await listCameras();
  try {
    const r = await get("/v1/mocap/readiness");
    installed.value = !!r.engine?.installed;
  } catch {
    installed.value = false;
  }
});

/** MediaPipe's three landmarkers, in VIDEO mode on the graphics card, their models from the install. */
async function loadTasks() {
  const vision = await import("@mediapipe/tasks-vision");
  const { default: wasmLoaderPath } = await import("@mediapipe/tasks-vision/vision_wasm_internal.js?url");
  const { default: wasmBinaryPath } = await import("@mediapipe/tasks-vision/vision_wasm_internal.wasm?url");
  const fileset = { wasmLoaderPath, wasmBinaryPath };
  const model = (name) => ({ modelAssetPath: serverUrl(`/v1/mocap/live/models/${name}`), delegate: "GPU" });
  const [pose, hand, face] = await Promise.all([
    vision.PoseLandmarker.createFromOptions(fileset, { baseOptions: model("pose"), runningMode: "VIDEO", numPoses: 1 }),
    vision.HandLandmarker.createFromOptions(fileset, { baseOptions: model("hand"), runningMode: "VIDEO", numHands: 2 }),
    vision.FaceLandmarker.createFromOptions(fileset, { baseOptions: model("face"), runningMode: "VIDEO", numFaces: 1, outputFaceBlendshapes: true }),
  ]);
  return { pose, hand, face, vision };
}

async function start() {
  problem.value = "";
  state.value = "starting";
  try {
    stream = await navigator.mediaDevices.getUserMedia({ video: { deviceId: camera.value ? { exact: camera.value } : undefined, width: { ideal: 1280 }, height: { ideal: 720 } }, audio: false });
    await listCameras(); // the cameras' names, now that the camera is allowed
    video.value.srcObject = stream;
    await video.value.play();
    tasks ??= await loadTasks();
    solver = new LiveSolver(skeleton);
    previous = 0;
    counted = { n: 0, since: performance.now() };
    state.value = "running";
    loop = requestAnimationFrame(frame);
  } catch (e) {
    stop();
    problem.value = e?.name === "NotAllowedError" || e?.name === "NotFoundError" || e?.name === "OverconstrainedError" ? t("kit.mocap.live.noCamera") : String(e?.message || e);
  }
}

function stop() {
  cancelAnimationFrame(loop);
  if (recording.value) stopRecording();
  for (const track of stream?.getTracks() ?? []) track.stop();
  stream = null;
  if (video.value) video.value.srcObject = null;
  state.value = "";
  seen.person = false;
  seen.hands = 0;
}
onBeforeUnmount(() => {
  stop();
  for (const k of ["pose", "hand", "face"]) tasks?.[k]?.close?.();
});

/** Each seen hand goes to the body's wrist nearest it in the picture (just-mocap bench/live/score_live.js's rule). */
function sides(screen, hands) {
  const out = { left: null, right: null };
  if (!screen) return out;
  hands.landmarks.forEach((marks, i) => {
    const wrist = marks[0];
    const d = (k) => Math.hypot(screen[k].x - wrist.x, screen[k].y - wrist.y);
    const side = d(POSE.leftWrist) <= d(POSE.rightWrist) ? "left" : "right";
    if (!out[side]) out[side] = hands.worldLandmarks[i].map((p) => [p.x, p.y, p.z]);
  });
  return out;
}

function frame() {
  loop = requestAnimationFrame(frame);
  const v = video.value;
  if (!v || v.readyState < 2 || !tasks) return;
  const now = performance.now();
  const pose = tasks.pose.detectForVideo(v, now);
  const hands = tasks.hand.detectForVideo(v, now);
  const face = tasks.face.detectForVideo(v, now);
  // the overlay
  const c = canvas.value;
  if (c.width !== v.videoWidth) {
    c.width = v.videoWidth;
    c.height = v.videoHeight;
  }
  const ctx = c.getContext("2d");
  ctx.clearRect(0, 0, c.width, c.height);
  const draw = new tasks.vision.DrawingUtils(ctx);
  const accent = getComputedStyle(c).getPropertyValue("--accent").trim() || "#3b82f6";
  for (const marks of pose.landmarks) {
    draw.drawConnectors(marks, tasks.vision.PoseLandmarker.POSE_CONNECTIONS, { color: accent, lineWidth: 3 });
    draw.drawLandmarks(marks, { color: accent, radius: 2 });
  }
  for (const marks of hands.landmarks) draw.drawConnectors(marks, tasks.vision.HandLandmarker.HAND_CONNECTIONS, { color: accent, lineWidth: 2 });
  seen.person = pose.worldLandmarks.length > 0;
  seen.hands = hands.landmarks.length;
  counted.n += 1;
  if (now - counted.since > 1000) {
    seen.fps = Math.round((1000 * counted.n) / (now - counted.since));
    counted = { n: 0, since: now };
  }
  if (!seen.person) return;
  // the solve
  const world = pose.worldLandmarks[0].map((p) => [p.x, p.y, p.z, p.visibility ?? 1]);
  const dt = previous ? (now - previous) / 1000 : 1 / 30;
  previous = now;
  const solved = solver.solve(world, sides(pose.landmarks[0], hands), dt);
  const curves = face.faceBlendshapes?.[0]?.categories ? Object.fromEntries(face.faceBlendshapes[0].categories.filter((k) => k.categoryName !== "_neutral").map((k) => [k.categoryName, k.score])) : null;
  if (recording.value && take) {
    take.frames.push({ t: (now - take.started) / 1000, world: solved.world, face: curves });
    recordedSeconds.value = Math.round((now - take.started) / 100) / 10;
  }
  if (send.on && !inFlight) {
    const messages = send.protocol === "vmc" ? vmcMessages(skeleton, solved.world, curves ?? {}, now / 1000) : oscMessages(skeleton, solved.world, curves ?? {});
    inFlight = true;
    post("/v1/mocap/live/send", { host: send.host, port: Number(send.port), messages })
      .then(() => (send.error = ""))
      .catch((e) => (send.error = String(e?.message || e)))
      .finally(() => (inFlight = false));
  }
}
function startRecording() {
  take = { started: performance.now(), frames: [] };
  recordedSeconds.value = 0;
  recording.value = true;
}
/** The recording at a steady RECORD_FPS: each step takes the frame seen last before it. */
function stopRecording() {
  recording.value = false;
  const frames = take?.frames ?? [];
  take = null;
  if (!frames.length) return;
  const steps = Math.max(1, Math.floor(frames.at(-1).t * RECORD_FPS) + 1);
  const out = [];
  let k = 0;
  for (let i = 0; i < steps; i++) {
    while (k + 1 < frames.length && frames[k + 1].t <= i / RECORD_FPS) k++;
    out.push(frames[k]);
  }
  last = out;
  hasRecording.value = true;
}
const stamp = () => new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-");
async function save(kind) {
  if (!last) return;
  try {
    const text = kind === "bvh" ? bvhText(skeleton, last.map((f) => f.world), RECORD_FPS) : faceCsvText(last.map((f) => f.face), RECORD_FPS);
    const name = `live-${stamp()}${kind === "bvh" ? ".bvh" : "_face.csv"}`;
    const r = await saveBlob(new Blob([text], { type: "text/plain" }), name, { filterExt: kind === "bvh" ? "bvh" : "csv" });
    if (r?.ok) pushToast({ kind: "success", title: r.path ? t("kit.mocap.results.saved", { path: r.path }) : t("kit.mocap.results.downloaded", { name }) });
  } catch (e) {
    reportError(e);
  }
}
</script>

<template>
  <section class="live" :aria-label="t('kit.mocap.live.label')">
    <p class="muted live__intro">{{ t("kit.mocap.live.intro") }}</p>
    <UiBanner v-if="!installed" intent="info">{{ t("kit.mocap.live.needsInstall") }}</UiBanner>
    <div class="live__bar">
      <UiField :label="t('kit.mocap.live.camera')" for="live-camera">
        <UiSelect id="live-camera" v-model="camera" :options="cameras" width="name" :disabled="state !== ''" />
      </UiField>
      <UiButton
        v-if="state !== 'running'" intent="primary" focusable-when-disabled :disabled="!installed || state === 'starting'"
        :loading="state === 'starting'" :label="state === 'starting' ? t('kit.mocap.live.starting') : t('kit.mocap.live.start')" @click="start"
      >
        <template #icon><Icon name="Camera" :size="14" /></template>
      </UiButton>
      <UiButton v-else intent="secondary" :label="t('kit.mocap.live.stop')" @click="stop">
        <template #icon><Icon name="Stop" :size="14" /></template>
      </UiButton>
    </div>
    <UiBanner v-if="problem" intent="danger">{{ problem }}</UiBanner>

    <div class="live__stage">
      <video ref="video" class="live__video" muted playsinline />
      <canvas ref="canvas" class="live__overlay" aria-hidden="true" />
    </div>
    <p v-if="state === 'running'" class="muted live__facts">
      {{ t("kit.mocap.live.fps", { n: seen.fps }) }} · {{ seen.person ? t("kit.mocap.live.hands", { n: seen.hands }) : t("kit.mocap.live.noPerson") }}
    </p>

    <div class="live__bar">
      <UiButton v-if="!recording" intent="primary" focusable-when-disabled :disabled="state !== 'running'" :label="t('kit.mocap.live.record')" @click="startRecording">
        <template #icon><Icon name="Mic" :size="14" /></template>
      </UiButton>
      <UiButton v-else intent="danger" :label="`${t('kit.mocap.live.stopRecording')} · ${t('kit.mocap.live.recording', { s: recordedSeconds })}`" @click="stopRecording">
        <template #icon><Icon name="Stop" :size="14" /></template>
      </UiButton>
      <UiButton intent="secondary" focusable-when-disabled :disabled="!hasRecording" :label="t('kit.mocap.live.saveBvh')" @click="save('bvh')">
        <template #icon><Icon name="Download" :size="14" /></template>
      </UiButton>
      <UiButton intent="secondary" focusable-when-disabled :disabled="!hasRecording" :label="t('kit.mocap.live.saveFace')" @click="save('face')">
        <template #icon><Icon name="Download" :size="14" /></template>
      </UiButton>
    </div>

    <fieldset class="live__send">
      <legend>{{ t("kit.mocap.live.send.label") }}</legend>
      <p class="muted">{{ t("kit.mocap.live.send.hint") }}</p>
      <div class="live__bar">
        <UiSegmented v-model="send.protocol" :options="PROTOCOLS" :aria-label="t('kit.mocap.live.send.label')" />
        <UiField :label="t('kit.mocap.live.send.host')" for="live-host">
          <UiInput id="live-host" v-model="send.host" width="id" />
        </UiField>
        <UiField :label="t('kit.mocap.live.send.port')" for="live-port">
          <UiNumber id="live-port" v-model="send.port" :min="1" :max="65535" :use-grouping="false" width="token" />
        </UiField>
        <UiField :label="send.on ? t('kit.mocap.live.send.on') : t('kit.mocap.live.send.off')" for="live-send">
          <UiToggle id="live-send" v-model="send.on" />
        </UiField>
      </div>
      <UiBanner v-if="send.on && send.error" intent="warning">{{ t("kit.mocap.live.send.failed", { reason: send.error }) }}</UiBanner>
    </fieldset>
  </section>
</template>

<style scoped>
.live { display: flex; flex-direction: column; gap: 12px; }
.live__intro { margin: 0; max-width: 72ch; }
.live__bar { display: flex; flex-wrap: wrap; align-items: flex-end; gap: 10px 14px; }
.live__stage { position: relative; width: min(720px, 100%); aspect-ratio: 16 / 9; background: var(--surface-3); border-radius: var(--r-sm); overflow: hidden; }
.live__video, .live__overlay { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: contain; }
.live__facts { margin: 0; }
.live__send { border: 1px solid var(--border); border-radius: var(--r-sm); padding: 10px 12px; display: flex; flex-direction: column; gap: 8px; max-width: 720px; }
.live__send legend { padding: 0 4px; font-weight: 600; }
.live__send p { margin: 0; }
</style>
