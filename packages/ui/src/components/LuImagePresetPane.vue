<script setup>
// SPDX-License-Identifier: MIT
// An image feature on the AI page's Routing tab (the engines plan, K8b + K10): which image preset it runs — the
// image presets only (GET /v1/ai/engine-presets?kind=image), never the chat default — and that preset's own
// settings, built from the server's rules for its kind (`paramRules`: steps, guidance, strength, sampler, seed — each
// bounded there, a 422 said under its field), Save, and Reset to the app's own; above them, what the feature still
// needs on this computer (LuEngineNeeded). `feature` is its key, `label` its name in the app's words.
import { computed, onMounted, reactive, ref, watch } from "vue";
import { useI18n } from "vue-i18n";
import { request } from "../client.js";
import UiButton from "../common/components/UiButton.vue";
import UiField from "../common/components/UiField.vue";
import UiNumber from "../common/components/UiNumber.vue";
import UiSelect from "../common/components/UiSelect.vue";
import { fieldErrors } from "../common/services/forms.js";
import { reportError } from "../common/services/reportError.js";
import LuEngineNeeded from "./LuEngineNeeded.vue";

const props = defineProps({
  feature: { type: String, required: true },
  label: { type: String, default: "" },
});
const { t, te } = useI18n();

const presets = ref([]);
const rules = ref({});
const assigned = ref("");
const draft = reactive({});
const errors = ref({});
const saving = ref(false);
const needed = ref(null);

async function load() {
  try {
    const [p, a] = await Promise.all([request("/v1/ai/engine-presets?kind=image"), request("/v1/ai/preset-assignments")]);
    presets.value = p.presets || [];
    rules.value = p.paramRules || {};
    assigned.value = a.features?.[props.feature] || "";
  } catch (e) {
    reportError(e);
  }
}
onMounted(load);

const preset = computed(() => presets.value.find((p) => p.id === assigned.value) || null);
const options = computed(() => presets.value.map((p) => ({ value: p.id, label: p.model ? `${p.name} — ${p.model}` : p.name })));
// the draft follows the preset shown (its saved settings)
watch(preset, (p) => {
  for (const k of Object.keys(draft)) delete draft[k];
  Object.assign(draft, p?.params || {});
  errors.value = {};
}, { immediate: true });
const changed = computed(() => !!preset.value && Object.keys(rules.value).some((k) => draft[k] !== preset.value.params?.[k]));
const fieldLabel = (name) => (te(`kit.runtimes.preset.fields.${name}`) ? t(`kit.runtimes.preset.fields.${name}`) : name);
const stepOf = (rule) => (rule.type === "int" ? 1 : rule.max <= 1 ? 0.05 : 0.5);

async function assign(presetId) {
  try {
    await request("/v1/ai/preset-assignments/feature", { method: "PUT", body: { featureKey: props.feature, presetId } });
    assigned.value = presetId;
    needed.value?.refresh();
  } catch (e) {
    reportError(e);
  }
}

async function save() {
  saving.value = true;
  errors.value = {};
  try {
    const r = await request(`/v1/ai/engine-presets/${encodeURIComponent(preset.value.id)}`, { method: "PUT", body: { ...preset.value, params: { ...draft } } });
    presets.value = r.presets || presets.value;
  } catch (e) {
    const f = fieldErrors(e);
    const mine = Object.fromEntries(Object.entries(f).filter(([k]) => k.startsWith("params.")).map(([k, v]) => [k.slice("params.".length), v]));
    if (Object.keys(mine).length) errors.value = mine;
    else reportError(e);
  } finally {
    saving.value = false;
  }
}

async function reset() {
  try {
    const r = await request(`/v1/ai/engine-presets/${encodeURIComponent(preset.value.id)}/reset`, { method: "POST" });
    presets.value = r.presets || presets.value;
  } catch (e) {
    reportError(e);
  }
}
</script>

<template>
  <div class="lu-imgpane">
    <LuEngineNeeded ref="needed" :feature="feature" :label="label" />
    <p v-if="!presets.length" class="lu-imgpane-line">{{ t("kit.runtimes.preset.none") }}</p>
    <template v-else>
      <UiField :label="t('kit.runtimes.preset.model')" layout="block" :for="`lu-imgpane-${feature}`">
        <UiSelect :id="`lu-imgpane-${feature}`" :model-value="assigned" :options="options" width="name" :placeholder="t('kit.runtimes.preset.choose')" @update:model-value="assign" />
      </UiField>
      <form v-if="preset" class="lu-imgpane-form" @submit.prevent="save">
        <div class="lu-imgpane-row">
          <UiField v-for="(rule, name) in rules" :key="name" :label="fieldLabel(name)" layout="block" :for="`lu-imgpane-${feature}-${name}`">
            <UiSelect v-if="rule.values" :id="`lu-imgpane-${feature}-${name}`" v-model="draft[name]" :options="rule.values" width="fit" />
            <UiNumber
              v-else :id="`lu-imgpane-${feature}-${name}`" v-model="draft[name]" :min="rule.min" :max="rule.max" :step="stepOf(rule)"
              :use-grouping="false" :error="!!errors[name]" :error-message="errors[name]" @update:model-value="errors = {}"
            />
          </UiField>
        </div>
        <p class="lu-imgpane-line">{{ t("kit.runtimes.preset.seedHint") }}</p>
        <div class="lu-imgpane-actions">
          <UiButton type="submit" intent="primary" size="small" focusable-when-disabled :disabled="saving || !changed" :label="saving ? t('kit.common.saving') : t('kit.common.save')" />
          <UiButton v-if="preset.builtIn" intent="ghost" size="small" :label="t('kit.runtimes.preset.reset')" @click="reset" />
        </div>
      </form>
    </template>
  </div>
</template>

<style scoped>
.lu-imgpane { display: flex; flex-direction: column; gap: 12px; max-width: 720px; }
.lu-imgpane-form { display: flex; flex-direction: column; gap: 8px; }
.lu-imgpane-row { display: flex; flex-wrap: wrap; align-items: flex-end; gap: 12px; }
.lu-imgpane-line { margin: 0; font-size: 12.5px; color: var(--muted); }
.lu-imgpane-actions { display: flex; gap: 8px; }
</style>
