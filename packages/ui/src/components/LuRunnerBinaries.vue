<script setup>
// SPDX-License-Identifier: MIT
// Editable llama.cpp engine config — the binary download URL per (platform, gpu)
// and the pinned build. Backed by the shared
// /v1/ai/engine-config CRUD (llm_runner/llm/runner_config_api.py), persisted in the
// host DB (runner_binary + runner_setting, seeded from the module defaults). The
// app auto-detects the system and downloads the matching build; this panel lets the
// user paste a corrected URL from the llama.cpp releases page if an asset ever moves
// or is renamed — config is data, nothing is hardcoded. Collapsed by default;
// lazy-loads on first open.
import { ref, watch } from "vue";
import { useI18n } from "vue-i18n";

import UiButton from "../common/components/UiButton.vue";
import UiInput from "../common/components/UiInput.vue";
import { confirmDialog } from "../common/services/dialog.js";
import { applyBuildToUrl } from "../common/services/engineUrl.js";
import { openExternal } from "../common/services/external.js";
import { request } from "../client.js";

const { t } = useI18n();
// Examples in the placeholders are values, not words — never translated.
const EXAMPLE = { asset: "https://…/llama-….zip", platform: "linux", gpu: "vulkan", url: "https://…" };

const rows = ref([]);
const pinnedBuild = ref("");
// The one-minute speed check's test model (speed-truth plan 2026-09-19 §6) — the
// same "config is data" rule as the binaries: a moved release asset is a pasted
// URL, never a code change. The two MB facts belong to THAT file (read from its
// tensor table), so a different file needs its own numbers.
const calib = ref({ url: "", sha: "", size: 0, activeMb: 0, nonexpertMb: 0 });
// The VRAM margin + ctx cap fields MOVED to LuRunnerEngine's Loaded-models knobs
// (fit-redesign §13.17 as amended at the Phase 3 go — the user's placement
// ruling); this panel keeps only the pinned build + the per-(platform,gpu) URLs.
const loading = ref(false);
const loaded = ref(false);
const error = ref("");
const busy = ref(""); // the row key (or "__settings"/"__add"/"__reset") saving
const draft = ref({ platform: "", gpu: "", assetUrl: "", serverExe: "llama-server" });

// Reactivity: the pinned build is the source; every row's download URL derives from
// it. When the pin changes (even mid-typing), each URL re-points to the REAL path for
// that build, so the fields always show the actual URL — never a placeholder. Editing
// a URL by hand (a moved asset) still works; the next pin change re-derives from
// whatever tag it carries. This and the update-to-latest flow share the SAME
// applyBuildToUrl helper, so the panel and the auto-update can't drift.
function _resolveRowsToPin() {
  const b = (pinnedBuild.value || "").trim();
  for (const r of rows.value) {
    r.assetUrl = applyBuildToUrl(r.assetUrl, b);
    r.runtimeUrl = applyBuildToUrl(r.runtimeUrl, b);
  }
}
watch(pinnedBuild, _resolveRowsToPin);

function _apply(d) {
  rows.value = (d.binaries || []).map((r) => ({ ...r }));
  pinnedBuild.value = d.pinnedBuild || "";
  calib.value = {
    url: d.calibModelUrl || "", sha: d.calibModelSha256 || "", size: d.calibModelSizeBytes || 0,
    activeMb: d.calibActiveExpertMb || 0, nonexpertMb: d.calibNonexpertMb || 0,
  };
  _resolveRowsToPin(); // show real paths for the current pin on load (never a placeholder)
}

async function load() {
  loading.value = true;
  error.value = "";
  try {
    _apply(await request("/v1/ai/engine-config"));
    loaded.value = true;
  } catch (e) {
    error.value = e.message || t("kit.binaries.err.load");
  } finally {
    loading.value = false;
  }
}

function onToggle(e) {
  if (e.target.open && !loaded.value) load();
}

async function put(body, key) {
  busy.value = key;
  error.value = "";
  try {
    _apply(await request("/v1/ai/engine-config", { method: "PUT", body }));
    return true;
  } catch (e) {
    error.value = e.message || t("kit.binaries.err.save");
    return false;
  } finally {
    busy.value = "";
  }
}

const rowKey = (r) => `${r.platform}/${r.gpu}`;

function saveRow(r) {
  put({ binaries: [{
    platform: r.platform, gpu: r.gpu, source: r.source,
    assetUrl: r.assetUrl || null, runtimeUrl: r.runtimeUrl || null,
    image: r.image || null, serverExe: r.serverExe || "llama-server",
    // the checksums ride along (the server drops one whose URL was changed here — it's the old file's)
    sha256: r.sha256 ?? null, runtimeSha256: r.runtimeSha256 ?? null,
  }] }, rowKey(r));
}

function saveSettings() {
  put({ pinnedBuild: (pinnedBuild.value || "").trim() }, "__settings");
}

function saveCalib() {
  const c = calib.value;
  put({
    calibModelUrl: (c.url || "").trim(), calibModelSha256: (c.sha || "").trim(),
    calibModelSizeBytes: Number(c.size) || 0, calibActiveExpertMb: Number(c.activeMb) || 0,
    calibNonexpertMb: Number(c.nonexpertMb) || 0,
  }, "__calib");
}

async function addRow() {
  const platform = (draft.value.platform || "").trim();
  const gpu = (draft.value.gpu || "").trim();
  if (!platform || !gpu) {
    error.value = t("kit.binaries.err.required");
    return;
  }
  const ok = await put({ binaries: [{
    platform, gpu, source: "github",
    assetUrl: draft.value.assetUrl || null, serverExe: draft.value.serverExe || "llama-server",
  }] }, "__add");
  if (ok) draft.value = { platform: "", gpu: "", assetUrl: "", serverExe: "llama-server" };
}

async function reset() {
  if (!(await confirmDialog(t("kit.binaries.resetConfirm")))) return;
  busy.value = "__reset";
  error.value = "";
  try {
    _apply(await request("/v1/ai/engine-config/reset", { method: "POST" }));
  } catch (e) {
    error.value = e.message || t("kit.binaries.err.reset");
  } finally {
    busy.value = "";
  }
}
</script>

<template>
  <details class="lu-engbin" @toggle="onToggle">
    <summary class="lu-engbin-summary">
      <span class="lu-engbin-title">{{ t('kit.binaries.title') }}</span>
      <span class="lu-muted">{{ t('kit.binaries.titleSub') }}</span>
    </summary>

    <div class="lu-engbin-body">
      <p class="lu-muted lu-engbin-help">
        <i18n-t keypath="kit.binaries.help" scope="global">
          <template #releases><a class="lu-mlink" href="https://github.com/ggml-org/llama.cpp/releases" target="_blank" rel="noopener"
            @click.prevent="openExternal('https://github.com/ggml-org/llama.cpp/releases')">{{ t('kit.binaries.releasesLink') }}</a></template>
          <template #build><code>llama-…-cuda-….zip</code></template>
          <template #runtime><code>cudart-…</code></template>
        </i18n-t>
      </p>

      <div v-if="error" class="lu-error">{{ error }}</div>
      <div v-if="loading" class="lu-muted">{{ t('kit.common.loading') }}</div>

      <template v-else-if="loaded">
        <div class="lu-engbin-settings">
          <label class="lu-engbin-field">{{ t('kit.binaries.pinned') }}
            <UiInput v-model="pinnedBuild" width="token" />
          </label>
          <UiButton intent="primary" size="small" :loading="busy === '__settings'" @click="saveSettings">{{ t('kit.common.save') }}</UiButton>
        </div>

        <div class="lu-engbin-scroll">
          <table class="ui-formgrid lu-engbin-tbl">
            <thead>
              <tr><th>{{ t('kit.binaries.col.platform') }}</th><th>{{ t('kit.binaries.col.gpu') }}</th><th>{{ t('kit.binaries.col.asset') }}</th><th>{{ t('kit.binaries.col.runtime') }}</th><th>{{ t('kit.binaries.col.exe') }}</th><th /></tr>
            </thead>
            <tbody>
              <tr v-for="r in rows" :key="rowKey(r)">
                <td class="lu-engbin-k">{{ r.platform }}</td>
                <td class="lu-engbin-k">{{ r.gpu }}<span v-if="r.source === 'docker'" class="lu-muted"> · {{ t('kit.binaries.docker') }}</span></td>
                <td><UiInput v-model="r.assetUrl" :placeholder="EXAMPLE.asset" /></td>
                <td><UiInput v-model="r.runtimeUrl" placeholder="—" /></td>
                <td><UiInput v-model="r.serverExe" width="name" /></td>
                <td><UiButton intent="primary" size="small" :loading="busy === rowKey(r)" @click="saveRow(r)">{{ t('kit.common.save') }}</UiButton></td>
              </tr>
              <tr class="ui-formgrid-add lu-engbin-addrow">
                <td><UiInput v-model="draft.platform" :placeholder="EXAMPLE.platform" width="name" /></td>
                <td><UiInput v-model="draft.gpu" :placeholder="EXAMPLE.gpu" width="name" /></td>
                <td><UiInput v-model="draft.assetUrl" :placeholder="EXAMPLE.url" /></td>
                <td class="lu-muted">—</td>
                <td><UiInput v-model="draft.serverExe" width="name" /></td>
                <td><UiButton intent="secondary" size="small" :loading="busy === '__add'" @click="addRow">＋ {{ t('kit.binaries.add') }}</UiButton></td>
              </tr>
            </tbody>
          </table>
        </div>

        <p class="lu-muted lu-engbin-help">
          <b>{{ t('kit.binaries.calib.title') }}</b> — {{ t('kit.binaries.calib.body') }}
        </p>
        <div class="lu-engbin-settings">
          <label class="lu-engbin-field lu-engbin-field--path">{{ t('kit.binaries.calib.url') }}
            <UiInput v-model="calib.url" width="path" />
          </label>
          <label class="lu-engbin-field lu-engbin-field--path">{{ t('kit.binaries.calib.sha') }}
            <UiInput v-model="calib.sha" width="path" />
          </label>
          <label class="lu-engbin-field">{{ t('kit.binaries.calib.size') }}
            <UiInput v-model="calib.size" type="number" width="id" />
          </label>
          <label class="lu-engbin-field">{{ t('kit.binaries.calib.expertMb') }}
            <UiInput v-model="calib.activeMb" type="number" width="token" />
          </label>
          <label class="lu-engbin-field">{{ t('kit.binaries.calib.otherMb') }}
            <UiInput v-model="calib.nonexpertMb" type="number" width="token" />
          </label>
          <UiButton intent="primary" size="small" :loading="busy === '__calib'" @click="saveCalib">{{ t('kit.common.save') }}</UiButton>
        </div>

        <div class="lu-engbin-foot">
          <UiButton intent="secondary" size="small" :loading="busy === '__reset'" @click="reset">{{ t('kit.common.resetDefaults') }}</UiButton>
        </div>
      </template>
    </div>
  </details>
</template>

<style scoped>
.lu-engbin { margin-top: 18px; border-top: 1px solid var(--border); padding-top: 12px; }
.lu-engbin-summary { cursor: pointer; display: flex; flex-direction: column; gap: 2px; user-select: none; }
.lu-engbin-title { font-weight: 700; color: var(--ink); }
.lu-engbin-body { margin-top: 12px; display: flex; flex-direction: column; gap: 12px; }
.lu-engbin-help { font-size: max(var(--text-floor, 0px), 12px); line-height: 1.5; max-width: 720px; }
.lu-engbin-help code { font-family: var(--font-mono, monospace); font-size: max(var(--text-floor, 0px), 11px); background: var(--surface-2, var(--surface)); padding: 0 3px; border-radius: 3px; }
.lu-engbin-settings { display: flex; flex-wrap: wrap; align-items: flex-end; gap: 12px; }
.lu-engbin-field { display: flex; flex-direction: column; gap: 3px; font-size: max(var(--text-floor, 0px), 12px); color: var(--muted); }
/* A URL / a 64-char hash: the label takes the kit's path width so the input can use its
   own ui-w-path cap (otherwise the column shrinks it to the input's default size). */
.lu-engbin-field--path { width: var(--w-path, 480px); max-width: 100%; }
.lu-engbin-scroll { overflow-x: auto; }
/* Mechanics come from the shared .ui-formgrid; the nowrap is this table's own —
   platform/GPU headers must not wrap inside a horizontally scrolling row. */
.lu-engbin-tbl th { white-space: nowrap; }
.lu-engbin-k { font-family: var(--font-mono, monospace); color: var(--ink); white-space: nowrap; }
.lu-engbin-foot { display: flex; justify-content: flex-start; }
</style>
