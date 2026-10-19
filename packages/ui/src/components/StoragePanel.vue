<script setup>
// SPDX-License-Identifier: MIT
// Settings → Storage — the family's section (app-structure §11; JustWrite's Data location and Disk
// usage cards are the donor, through docgen's copy). The kit's since 2026-10-19 (the template
// audit: the template's and just-house-paint's copies were one file but for the app's own rows):
// where the data folder is and the desktop shell's "Change folder…" (it moves everything and
// restarts the app), then where the folder's space goes (the kit's /v1/disk/usage) with the two
// things that can be reclaimed — the downloaded models and the engine's logs.
//   - `shell`: the desktop shell's folder calls, from the app's native.js — { getRoot, pickDirectory,
//     relocate } — or null in a browser, where Change folder isn't offered;
//   - `saves`: what the app keeps, in its own words ("your notes"), inside the kit's sentences;
//   - the `extra` slot: the app's own rows in the disk grid (just-house-paint's houses, part finder
//     and AI photo), with { usage, size, busy, run } — `run(kind, fn)` marks the panel busy while
//     `fn` runs, then reads the sizes again.
// Failures go through `reportError` (§15). The card frame is the host's (`card`, `hint`).
import { onMounted, ref } from "vue";
import { useI18n } from "vue-i18n";
import UiButton from "../common/components/UiButton.vue";
import { confirmDialog } from "../common/services/dialog.js";
import { fmtBytes } from "../common/services/downloadRate.js";
import { reportError } from "../common/services/reportError.js";
import { post, safeRequest } from "../common/services/serverApi.js";
import { pushToast } from "../common/services/toastBridge.js";
import { refresh as refreshRunnerModels } from "../composables/useRunnerModels.js";

const props = defineProps({
  // the server's own data folder (GET /v1/health's `dataDir`) — what a headless run shows
  dataDir: { type: String, default: "" },
  shell: { type: Object, default: null },
  saves: { type: String, default: "" },
});

const { t, locale } = useI18n();
const saves = () => props.saves || t("kit.storagePanel.savesDefault");

const storageRoot = ref(null); // { root, default, portable } — the desktop shell's answer
const relocating = ref(false);
const diskUsage = ref(null);
const diskBusy = ref(""); // "models" | "spawn" | an extra row's kind | ""

async function loadStorageRoot() {
  storageRoot.value = props.shell ? await props.shell.getRoot() : null;
}
async function loadDiskUsage() {
  diskUsage.value = await safeRequest("/v1/disk/usage", null);
}
onMounted(() => Promise.all([loadStorageRoot(), loadDiskUsage()]));

// While loading, an em-dash; a real 0 reads "0 MB" (fmtBytes gives "" for 0).
function diskSize(n) {
  if (diskUsage.value == null) return "—";
  return fmtBytes(n) || "0 MB";
}

/** An app's own row's action (the `extra` slot): busy while it runs, the sizes read again after. */
async function run(kind, fn) {
  diskBusy.value = kind;
  try {
    await fn();
  } catch (e) {
    reportError(e);
  } finally {
    diskBusy.value = "";
    await loadDiskUsage();
  }
}

async function changeFolder() {
  const picked = await props.shell.pickDirectory({ title: t("kit.storagePanel.chooseFolder"), defaultPath: storageRoot.value?.root || "" });
  if (!picked) return;
  const yes = await confirmDialog({
    title: t("kit.storagePanel.moveTitle"),
    message: t("kit.storagePanel.moveMessage", { saves: saves(), folder: picked }),
    confirmLabel: t("kit.storagePanel.moveConfirm"),
  });
  if (!yes) return;
  relocating.value = true;
  try {
    await props.shell.relocate(picked);
    window.location.reload();
  } catch (e) {
    reportError(e);
    relocating.value = false;
  }
}

/** A cache shared with the family's other apps: clearing it clears theirs too — named when the kit's
 *  registry knows them (`sharedWith`; the cache's owner sees them too), else said plainly (`cacheShared`). */
function sharedNote() {
  const apps = diskUsage.value?.sharedWith || [];
  if (apps.length) return t("kit.storagePanel.clearModelsSharedWith", { apps: new Intl.ListFormat(locale.value, { type: "conjunction" }).format(apps) });
  return diskUsage.value?.cacheShared ? t("kit.storagePanel.clearModelsShared") : "";
}

async function clearModelsCache() {
  const size = fmtBytes(diskUsage.value?.modelsCache) || "0 MB";
  const yes = await confirmDialog({
    title: t("kit.storagePanel.clearModelsTitle"),
    message: [t("kit.storagePanel.clearModelsMessage", { size }), sharedNote()].filter(Boolean).join(" "),
    confirmLabel: t("kit.storagePanel.clearModelsConfirm"),
    danger: true,
  });
  if (!yes) return;
  await run("models", async () => {
    const res = await post("/v1/llm-runner/models-cache/clear");
    if (res?.ok === false) {
      const loaded = res.detail === "unload models first";
      pushToast({ kind: "error", title: loaded ? t("kit.storagePanel.unloadFirst") : t("kit.storagePanel.clearModelsFailed"), description: loaded ? undefined : res.detail });
    }
  });
  // the AI page's catalog re-reads which models are on disk (they now download again)
  refreshRunnerModels();
}

function clearSpawnLogs() {
  return run("spawn", () => post("/v1/llm-runner/spawn-logs/clear"));
}
</script>

<template>
  <section class="card">
    <h2>{{ t("kit.storagePanel.locationTitle") }}</h2>
    <p class="hint">{{ t("kit.storagePanel.locationHint", { saves: saves() }) }}</p>
    <table class="ui-formgrid">
      <tbody>
        <tr>
          <th>{{ t("kit.storagePanel.folder") }}</th>
          <td class="lu-storage__mono">{{ storageRoot?.root || dataDir || "—" }}</td>
        </tr>
        <tr v-if="storageRoot">
          <th>{{ t("kit.storagePanel.type") }}</th>
          <td>{{ storageRoot.portable ? t("kit.storagePanel.portable") : t("kit.storagePanel.userFolder") }}</td>
        </tr>
      </tbody>
    </table>
    <div v-if="storageRoot" class="card__actions">
      <UiButton intent="secondary" :disabled="relocating" :label="relocating ? t('kit.storagePanel.moving') : t('kit.storagePanel.changeFolder')" @click="changeFolder" />
    </div>
    <p v-else class="hint card__note">{{ t("kit.storagePanel.desktopOnly") }}</p>
  </section>

  <section class="card">
    <h2>{{ t("kit.storagePanel.diskTitle") }}</h2>
    <p class="hint">{{ t("kit.storagePanel.diskHint", { saves: saves() }) }}</p>
    <div class="lu-storage__grid">
      <span class="lu-storage__label">{{ t("kit.storagePanel.modelsCache") }}</span>
      <div class="lu-storage__row">
        <span>{{ diskSize(diskUsage?.modelsCache) }}</span>
        <UiButton intent="secondary" size="small" :disabled="!!diskBusy" :label="diskBusy === 'models' ? t('kit.storagePanel.clearing') : t('kit.storage.clearShort')" @click="clearModelsCache" />
      </div>
      <span class="lu-storage__label">{{ t("kit.storagePanel.spawnLogs") }}</span>
      <div class="lu-storage__row">
        <span>{{ diskSize(diskUsage?.spawnLogs) }}</span>
        <UiButton intent="secondary" size="small" :disabled="!!diskBusy" :label="diskBusy === 'spawn' ? t('kit.storagePanel.clearing') : t('kit.storage.clearShort')" @click="clearSpawnLogs" />
      </div>
      <span class="lu-storage__label">{{ t("kit.storagePanel.engineBuilds") }}</span><span>{{ diskSize(diskUsage?.engineBuilds) }}</span>
      <!-- the app's own stores (the server's extra disk buckets) -->
      <slot name="extra" :usage="diskUsage" :size="diskSize" :busy="diskBusy" :run="run" />
      <span class="lu-storage__label">{{ t("kit.storagePanel.database") }}</span><span>{{ diskSize(diskUsage?.database) }}</span>
      <span class="lu-storage__label">{{ t("kit.storage.serverLogs") }}</span><span>{{ diskSize(diskUsage?.appLogs) }}</span>
      <span class="lu-storage__label"><b>{{ t("kit.storage.total") }}</b></span><span><b>{{ diskSize(diskUsage?.total) }}</b></span>
      <span class="lu-storage__label">{{ t("kit.storage.freeSpace") }}</span><span>{{ diskSize(diskUsage?.diskFree) }}</span>
    </div>
  </section>
</template>

<style scoped>
.lu-storage__mono { font-family: var(--font-mono, ui-monospace, monospace); font-size: var(--fs-small, 12.5px); }
/* the disk-usage grid: a label column and a value/action column (JustWrite's) */
.lu-storage__grid {
  display: grid; grid-template-columns: 150px auto; justify-content: start; align-items: center;
  gap: var(--sp-2, 8px) 14px; font-size: var(--fs-small, 12.5px);
}
.lu-storage__grid :slotted(.lu-storage__label), .lu-storage__label { color: var(--muted); }
.lu-storage__grid :slotted(.lu-storage__row), .lu-storage__row { display: flex; align-items: center; gap: var(--sp-2, 8px); flex-wrap: wrap; }
</style>
