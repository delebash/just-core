<script setup>
// SPDX-License-Identifier: MIT
// Settings → General — the app's own settings (/v1/settings, a schema per key; family rule 1: a
// value a user might change is a seeded row, never a constant). The §15 form: the rules are the
// route's own schema (`schemaRules(SettingsPatch)` from the server package), a 422 lands under its
// field (`fieldErrors`), any other failure goes through `reportError`, Save is disabled while it
// runs and sits on the row of the fields it saves.
import { fieldErrors, reportError, schemaRules, UiButton, UiField, UiNumber } from "@delebash/ui";
import { SettingsPatch } from "family-template-server/schemas/settings.js";
import { computed, nextTick, onMounted, reactive, ref } from "vue";
import { useI18n } from "vue-i18n";
import { useSettingsStore } from "../../stores/settings.js";

const { t } = useI18n();
const settings = useSettingsStore();

// the Notes card's settings: its list's page size, and the largest file Import a file takes
const FIELDS = [
  { key: "notes.pageSize", id: "setting-page-size", label: "settings.general.pageSize" },
  { key: "notes.maxImportKilobytes", id: "setting-max-import", label: "settings.general.maxImportKilobytes" },
];
const rules = schemaRules(SettingsPatch);
const draft = reactive(Object.fromEntries(FIELDS.map((f) => [f.key, null])));
const serverErrors = ref({});
const saving = ref(false);
const loaded = ref(false);

const changedKeys = computed(() => (loaded.value ? FIELDS.map((f) => f.key).filter((k) => draft[k] !== settings.values[k]) : []));

onMounted(async () => {
  try {
    await settings.load();
    for (const f of FIELDS) draft[f.key] = settings.values[f.key] ?? null;
    loaded.value = true;
  } catch (e) {
    reportError(e);
  }
});

async function save() {
  // where the keyboard was (a box Enter was pressed in, or Save): it stays there — Save turning off when nothing is
  // left to save dropped the focus on <body> (WCAG 2.4.3 — the seventeenth review)
  const back = document.activeElement;
  saving.value = true;
  serverErrors.value = {};
  try {
    await settings.save(Object.fromEntries(changedKeys.value.map((k) => [k, draft[k]])));
    for (const f of FIELDS) draft[f.key] = settings.values[f.key];
  } catch (e) {
    const fields = fieldErrors(e);
    if (FIELDS.some((f) => fields[f.key])) serverErrors.value = fields;
    else reportError(e);
  } finally {
    saving.value = false;
    await nextTick();
    if ((!document.activeElement || document.activeElement === document.body) && back?.isConnected) back.focus();
  }
}
</script>

<template>
  <section class="card">
    <h2>{{ t("settings.general.notesTitle") }}</h2>
    <p class="hint">{{ t("settings.general.notesHint") }}</p>
    <q-form class="form" greedy @submit="save">
      <div class="form__row">
        <UiField v-for="f in FIELDS" :key="f.key" :label="t(f.label)" layout="block" :for="f.id">
          <UiNumber
            :id="f.id" v-model="draft[f.key]" width="num" :disabled="!loaded" lazy-rules
            :rules="rules[f.key]" :error="!!serverErrors[f.key]" :error-message="serverErrors[f.key]"
            @update:model-value="serverErrors = {}"
          />
        </UiField>
        <UiButton type="submit" intent="primary" focusable-when-disabled :disabled="saving || !changedKeys.length" :label="saving ? t('kit.common.saving') : t('kit.common.save')" />
      </div>
    </q-form>
  </section>
</template>
