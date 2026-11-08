<script setup>
// SPDX-License-Identifier: MIT
// A take's motion in 3D (the Motion capture screen's "skeleton overlay plus a 3D view", just-mocap's feature list of
// 2026-11-07): the take's GLB (its skeleton as glTF nodes with their animation — just-mocap bench/formats.py write_glb,
// metres, Y up) loaded by three.js's own GLTFLoader (three.js, MIT, an optional peer the app installs), each bone drawn as
// a line from its parent's joint, on a floor grid, played by three's AnimationMixer, turned with OrbitControls. The
// skeleton's own colours are the app's tokens, read when it mounts.
import { onBeforeUnmount, onMounted, ref, shallowRef } from "vue";
import { useI18n } from "vue-i18n";
import Icon from "../common/components/Icon.vue";
import UiButton from "../common/components/UiButton.vue";

const props = defineProps({ src: { type: String, required: true } });
const { t } = useI18n();
const box = ref(null);
const playing = ref(true);
const state = ref("loading"); // loading | ready | failed
const reason = ref("");
const three = shallowRef(null); // {renderer, mixer, ...} once loaded

let frame = 0;
let stop = () => {};

onMounted(async () => {
  try {
    const THREE = await import("three");
    const { GLTFLoader } = await import("three/examples/jsm/loaders/GLTFLoader.js");
    const { OrbitControls } = await import("three/examples/jsm/controls/OrbitControls.js");
    const el = box.value;
    if (!el) return;
    const css = getComputedStyle(el);
    const colour = (name, fallback) => css.getPropertyValue(name).trim() || fallback;
    const width = el.clientWidth || 480;
    const height = el.clientHeight || 360;
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(window.devicePixelRatio || 1);
    renderer.setSize(width, height);
    el.appendChild(renderer.domElement);
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(40, width / height, 0.01, 100);
    const controls = new OrbitControls(camera, renderer.domElement);
    scene.add(new THREE.GridHelper(10, 20, colour("--border-strong", "#888"), colour("--border", "#ccc")));

    const gltf = await new GLTFLoader().loadAsync(props.src);
    const root = gltf.scene;
    root.visible = false; // its nodes carry no mesh: the lines below draw it
    scene.add(root);
    // every node that has a node parent is a bone: a line from the parent's joint to its own
    const bones = [];
    root.traverse((n) => {
      if (n !== root && n.parent && n.parent !== root) bones.push(n);
    });
    const positions = new Float32Array(bones.length * 6);
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    const lines = new THREE.LineSegments(geometry, new THREE.LineBasicMaterial({ color: colour("--accent", "#3b82f6") }));
    scene.add(lines);
    const a = new THREE.Vector3();
    const b = new THREE.Vector3();
    const draw = () => {
      root.updateMatrixWorld(true);
      bones.forEach((n, i) => {
        n.parent.getWorldPosition(a);
        n.getWorldPosition(b);
        positions.set([a.x, a.y, a.z, b.x, b.y, b.z], i * 6);
      });
      geometry.attributes.position.needsUpdate = true;
      geometry.computeBoundingSphere();
    };
    const mixer = new THREE.AnimationMixer(root);
    for (const clip of gltf.animations) mixer.clipAction(clip).play();
    mixer.update(0);
    draw();
    // the camera on the person at the first frame
    const centre = geometry.boundingSphere?.center ?? new THREE.Vector3(0, 1, 0);
    const radius = Math.max(0.8, geometry.boundingSphere?.radius ?? 1);
    camera.position.set(centre.x, centre.y + radius * 0.3, centre.z + radius * 3.2);
    controls.target.copy(centre);
    controls.update();
    const clock = new THREE.Clock();
    const tick = () => {
      frame = requestAnimationFrame(tick);
      const dt = clock.getDelta();
      if (playing.value) mixer.update(dt);
      draw();
      controls.update();
      renderer.render(scene, camera);
    };
    tick();
    // the drawing follows the box's size (a window resized, a panel opened beside it)
    const resize = new ResizeObserver(() => {
      const w = el.clientWidth;
      const h = el.clientHeight;
      if (!w || !h) return;
      renderer.setSize(w, h);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
    });
    resize.observe(el);
    three.value = { renderer, mixer };
    state.value = "ready";
    stop = () => {
      resize.disconnect();
      cancelAnimationFrame(frame);
      controls.dispose();
      geometry.dispose();
      lines.material.dispose();
      renderer.dispose();
      renderer.domElement.remove();
    };
  } catch (e) {
    reason.value = String(e?.message || e);
    state.value = "failed";
  }
});
onBeforeUnmount(() => stop());
</script>

<template>
  <figure class="view3d">
    <div ref="box" class="view3d__box" role="img" :aria-label="t('kit.mocap.view.label')">
      <span v-if="state === 'loading'" class="view3d__note muted">{{ t("kit.mocap.view.loading") }}</span>
      <span v-else-if="state === 'failed'" class="view3d__note">{{ t("kit.mocap.view.failed", { reason }) }}</span>
    </div>
    <figcaption class="view3d__bar">
      <span class="muted">{{ t("kit.mocap.results.view3d") }}</span>
      <UiButton v-if="state === 'ready'" intent="secondary" size="small" :label="playing ? t('kit.mocap.view.pause') : t('kit.mocap.view.play')" @click="playing = !playing">
        <template #icon><Icon :name="playing ? 'Pause' : 'Play'" :size="14" /></template>
      </UiButton>
    </figcaption>
  </figure>
</template>

<style scoped>
/* the figure has its own width: as a wrapping flex item without one, the box's percentage resolved against the
   figure's min-content width (its bar's, ~138 px) and the 3D view drew in a strip (2026-11-08) */
.view3d { margin: 0; display: flex; flex-direction: column; gap: 4px; width: min(480px, 100%); }
.view3d__box { position: relative; width: 100%; height: 360px; background: var(--surface-2); border: 1px solid var(--border); border-radius: var(--r-sm); overflow: hidden; }
.view3d__note { position: absolute; inset: 0; display: grid; place-items: center; padding: 12px; text-align: center; }
.view3d__bar { display: flex; align-items: center; justify-content: space-between; gap: 8px; width: 100%; }
</style>
