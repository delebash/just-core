<script setup>
// SPDX-License-Identifier: MIT
// Settings → Storage — the family's section (app-structure §11; JustWrite's Data location and Disk
// usage cards are the donor, through docgen's copy): where the data folder is and the desktop
// shell's "Change folder…" (it moves everything and restarts the app), then where the folder's
// space goes (the kit's /v1/disk/usage) with the two things that can be reclaimed — the downloaded
// models and the engine's logs. Failures go through `reportError` (§15).
import { confirmDialog, fmtBytes, post, pushToast, refreshRunnerModels, reportError, safeRequest, UiButton } from "@delebash/ui";
import { onMounted, ref } from "vue";
import { useI18n } from "vue-i18n";
import { pickDirectory, storageGetRoot, storageRelocate } from "../../services/native.js";

const props = defineProps({
  // the server's own data folder (GET /v1/health's `dataDir`) — what a headless run shows
  dataDir: { type: String, default: "" },
});

const { t } = useI18n();

const storageRoot = ref(null); // { root, default, portable } — the desktop shell's answer
const relocating = ref(false);
const diskUsage = ref(null);
const diskBusy = ref(""); // "models" | "spawn" | ""

async function loadStorageRoot() {
  storageRoot.value = await storageGetRoot();
}
async function loadDiskUsage() {
  diskUsage.value = await safeRequest("/v1/disk/usage", null);
}
onMounted(() => Promise.all([loadStorageRoot(), loadDiskUsage()]));

// While loading, an em-dash; a real 0 reads "0 MB" (the kit's fmtBytes gives "" for 0).
function diskSize(n) {
  if (diskUsage.value == null) return "—";
  return fmtBytes(n) || "0 MB";
}

async function changeFolder() {
  const picked = await pickDirectory({ title: t("settings.storage.chooseFolder"), defaultPath: storageRoot.value?.root || "" });
  if (!picked) return;
  const yes = await confirmDialog({
    title: t("settings.storage.moveTitle"),
    message: t("settings.storage.moveMessage", { folder: picked }),
    confirmLabel: t("settings.storage.moveConfirm"),
  });
  if (!yes) return;
  relocating.value = true;
  try {
    await storageRelocate(picked);
    window.location.reload();
  } catch (e) {
    reportError(e);
    relocating.value = false;
  }
}

async function clearModelsCache() {
  const size = fmtBytes(diskUsage.value?.modelsCache) || "0 MB";
  const yes = await confirmDialog({
    title: t("settings.storage.clearModelsTitle"),
    message: t("settings.storage.clearModelsMessage", { size }),
    confirmLabel: t("settings.storage.clearModelsConfirm"),
    danger: true,
  });
  if (!yes) return;
  diskBusy.value = "models";
  try {
    const res = await post("/v1/llm-runner/models-cache/clear");
    if (res?.ok === false) {
      const loaded = res.detail === "unload models first";
      pushToast({ kind: "error", title: loaded ? t("settings.storage.unloadFirst") : t("settings.storage.clearModelsFailed"), description: loaded ? undefined : res.detail });
    }
  } catch (e) {
    reportError(e);
  } finally {
    diskBusy.value = "";
    await loadDiskUsage();
    // the AI page's catalog re-reads which models are on disk (they now download again)
    refreshRunnerModels();
  }
}

async function clearSpawnLogs() {
  diskBusy.value = "spawn";
  try {
    await post("/v1/llm-runner/spawn-logs/clear");
  } catch (e) {
    reportError(e);
  } finally {
    diskBusy.value = "";
    await loadDiskUsage();
  }
}
</script>

<template>
  <section class="card">
    <h2>{{ t("settings.storage.locationTitle") }}</h2>
    <p class="hint">{{ t("settings.storage.locationHint") }}</p>
    <table class="ui-formgrid">
      <tbody>
        <tr>
          <th>{{ t("settings.storage.folder") }}</th>
          <td class="mono">{{ storageRoot?.root || props.dataDir || "—" }}</td>
        </tr>
        <tr v-if="storageRoot">
          <th>{{ t("settings.storage.type") }}</th>
          <td>{{ storageRoot.portable ? t("settings.storage.portable") : t("settings.storage.userFolder") }}</td>
        </tr>
      </tbody>
    </table>
    <div v-if="storageRoot" class="card__actions">
      <UiButton intent="secondary" :disabled="relocating" :label="relocating ? t('settings.storage.moving') : t('settings.storage.changeFolder')" @click="changeFolder" />
    </div>
    <p v-else class="hint card__note">{{ t("settings.storage.desktopOnly") }}</p>
  </section>

  <section class="card">
    <h2>{{ t("settings.storage.diskTitle") }}</h2>
    <p class="hint">{{ t("settings.storage.diskHint") }}</p>
    <div class="diskgrid">
      <span class="muted">{{ t("settings.storage.modelsCache") }}</span>
      <div class="row">
        <span>{{ diskSize(diskUsage?.modelsCache) }}</span>
        <UiButton intent="secondary" size="small" :disabled="!!diskBusy" :label="diskBusy === 'models' ? t('settings.storage.clearing') : t('kit.storage.clearShort')" @click="clearModelsCache" />
      </div>
      <span class="muted">{{ t("settings.storage.spawnLogs") }}</span>
      <div class="row">
        <span>{{ diskSize(diskUsage?.spawnLogs) }}</span>
        <UiButton intent="secondary" size="small" :disabled="!!diskBusy" :label="diskBusy === 'spawn' ? t('settings.storage.clearing') : t('kit.storage.clearShort')" @click="clearSpawnLogs" />
      </div>
      <span class="muted">{{ t("settings.storage.engineBuilds") }}</span><span>{{ diskSize(diskUsage?.engineBuilds) }}</span>
      <span class="muted">{{ t("settings.storage.database") }}</span><span>{{ diskSize(diskUsage?.database) }}</span>
      <span class="muted">{{ t("kit.storage.serverLogs") }}</span><span>{{ diskSize(diskUsage?.appLogs) }}</span>
      <span class="muted"><b>{{ t("kit.storage.total") }}</b></span><span><b>{{ diskSize(diskUsage?.total) }}</b></span>
      <span class="muted">{{ t("kit.storage.freeSpace") }}</span><span>{{ diskSize(diskUsage?.diskFree) }}</span>
    </div>
  </section>
</template>
