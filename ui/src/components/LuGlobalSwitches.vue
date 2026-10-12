<script setup>
// SPDX-License-Identifier: MIT
// "Global launch defaults" — the switch BUNDLES the resolver applies underneath
// every class/machine tune (the user's 2026-07-07 switch-provenance ask: "we dont
// have the global switches … how does the user know"). One collapsed drawer (the
// LuRunnerBinaries/LuClassTunes pattern) over the EXISTING /v1/ai/switch-presets
// CRUD: each bundle (all models · MoE models · dense models · speculative decode)
// edits in a KnobGrid and saves wholesale; Reset restores the shipped defaults —
// editable-with-reset from day one, like every sibling config table. Values here
// sit BELOW class tunes and saved machine tunes in the resolution (the Tune grid's
// per-row origin tags show exactly which layer won).
import { computed, ref } from "vue";
import { useI18n } from "vue-i18n";

import KnobGrid from "./KnobGrid.vue";
import UiButton from "../common/components/UiButton.vue";
import { confirmDialog } from "../common/services/dialog.js";
import { request } from "../client.js";
import { fetchKnobCatalog, plane1SwitchCatalog } from "../knobCatalog.js";

const props = defineProps({
  // true = render the body directly (no collapsed <details>/summary) and load on
  // mount — the POPUP mount (#6: the Edit view opens this in an AppModal, whose
  // title already is the header). Default false = the classic drawer.
  expanded: { type: Boolean, default: false },
});

const { t, te } = useI18n();
// A bundle's name: the kit's word for what it applies to, else the server's label.
function bundleLabel(p) {
  const key = `kit.globalSwitches.applies.${p.appliesTo}`;
  return te(key) ? t(key) : p.label || p.id;
}

const loaded = ref(false);
const loading = ref(false);
const error = ref("");
const busy = ref(""); // preset id being saved | "__reset"
const presets = ref([]); // [{ id, label, appliesTo, rows: [{name, value}] }]
const catalogMap = ref({});

function _apply(res) {
  presets.value = (res.rows || []).map((p) => ({
    id: p.id,
    label: p.label,
    appliesTo: p.appliesTo,
    position: p.position,
    rows: (p.switches || []).map((s) => ({ name: s.flagName, value: s.flagValue })),
  }));
}

async function reload() {
  loading.value = true;
  error.value = "";
  try {
    _apply(await request("/v1/ai/switch-presets"));
    if (!Object.keys(catalogMap.value).length) {
      catalogMap.value = plane1SwitchCatalog(await fetchKnobCatalog());
    }
    loaded.value = true;
  } catch (e) {
    error.value = e.message || t("kit.globalSwitches.err.load");
  } finally {
    loading.value = false;
  }
}
function onToggle(e) {
  if (e.target.open && !loaded.value) reload();
}
if (props.expanded) reload(); // the popup mount has no summary click to trigger it

async function savePreset(p) {
  busy.value = p.id;
  error.value = "";
  try {
    _apply(await request("/v1/ai/switch-presets", {
      method: "PUT",
      body: {
        id: p.id, appliesTo: p.appliesTo, position: p.position,
        switches: p.rows
          .filter((r) => (r.name || "").trim())
          .map((r) => ({ flagName: r.name.trim(), flagValue: r.value ?? "" })),
      },
    }));
  } catch (e) {
    error.value = e.message || t("kit.globalSwitches.err.save");
  } finally {
    busy.value = "";
  }
}

async function reset() {
  const ok = await confirmDialog({
    title: t("kit.globalSwitches.reset.title"),
    message: t("kit.globalSwitches.reset.body"),
    confirmLabel: t("kit.common.reset"),
  });
  if (!ok) return;
  busy.value = "__reset";
  error.value = "";
  try {
    _apply(await request("/v1/ai/switch-presets/reset", { method: "POST" }));
  } catch (e) {
    error.value = e.message || t("kit.globalSwitches.err.reset");
  } finally {
    busy.value = "";
  }
}

const ordered = computed(() =>
  [...presets.value].sort((a, b) => (a.position - b.position) || a.id.localeCompare(b.id)),
);
</script>

<template>
  <component :is="expanded ? 'div' : 'details'" class="lu-gsw" :class="{ 'lu-gsw--expanded': expanded }" @toggle="onToggle">
    <summary v-if="!expanded" class="lu-gsw-summary">
      <span class="lu-gsw-title">{{ t('kit.globalSwitches.title') }}</span>
      <span class="lu-muted">{{ t('kit.globalSwitches.summary') }}</span>
    </summary>

    <div class="lu-gsw-body">
      <!-- QC-6 (2026-07-08): one definition sentence + the user-decided standing
           caption; the layer-mechanics explainer lives in docs/models.md and on
           the Tune grid's own origin tags. -->
      <p class="lu-muted lu-gsw-help">
        {{ t('kit.globalSwitches.help') }}
        <i18n-t keypath="kit.globalSwitches.helpKept" scope="global"><template #kept><b>{{ t('kit.globalSwitches.helpBold') }}</b></template></i18n-t>
      </p>

      <div v-if="error" class="lu-error">{{ error }}</div>
      <div v-if="loading" class="lu-muted">{{ t('kit.common.loading') }}</div>

      <template v-else-if="loaded">
        <div v-for="p in ordered" :key="p.id" class="lu-gsw-preset">
          <div class="lu-gsw-phead">
            <span class="lu-gsw-plabel">{{ bundleLabel(p) }}</span>
            <UiButton intent="primary" size="small" :loading="busy === p.id" @click="savePreset(p)">{{ t('kit.common.save') }}</UiButton>
          </div>
          <KnobGrid v-model="p.rows" :catalog="catalogMap" />
        </div>

        <div class="lu-gsw-foot">
          <UiButton intent="secondary" size="small" :loading="busy === '__reset'" @click="reset">{{ t('kit.common.resetDefaults') }}</UiButton>
        </div>
      </template>
    </div>
  </component>
</template>

<style scoped>
.lu-gsw { border-top: 1px solid var(--border); padding-top: 10px; }
/* Popup mount (#6): the AppModal title is the header — no drawer chrome. */
.lu-gsw--expanded { border-top: none; padding-top: 0; }
.lu-gsw--expanded .lu-gsw-body { margin-top: 0; }
.lu-gsw-summary { cursor: pointer; display: flex; flex-direction: column; gap: 2px; user-select: none; }
.lu-gsw-title { font-weight: 700; font-size: 12.5px; color: var(--ink); }
.lu-gsw-body { margin-top: 10px; display: flex; flex-direction: column; gap: 14px; }
.lu-gsw-help { font-size: 11.5px; line-height: 1.5; margin: 0; }
.lu-gsw-preset { display: flex; flex-direction: column; gap: 6px; padding: 10px; border: 1px solid var(--border); border-radius: var(--r-sm, 8px); background: var(--surface-2); }
.lu-gsw-phead { display: flex; align-items: center; justify-content: space-between; gap: 10px; }
.lu-gsw-plabel { font-weight: 600; font-size: 12px; color: var(--ink); }
.lu-gsw-foot { display: flex; }
</style>
