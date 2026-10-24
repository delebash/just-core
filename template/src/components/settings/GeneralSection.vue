<script setup>
// SPDX-License-Identifier: MIT
// Settings → General — the app's own settings (/v1/settings, a schema per key; family rule 1: a
// value a user might change is a seeded row, never a constant). The §15 form: the rules are the
// route's own schema (`schemaRules(SettingsPatch)` from the server package), a 422 lands under its
// field (`fieldErrors`), any other failure goes through `reportError`, Save is disabled while it
// runs and sits on the row of the fields it saves — one card per group, each its own form.
import { fieldErrors, reportError, schemaRules, UiButton, UiField, UiNumber } from "@delebash/ui";
import { SettingsPatch } from "family-template-server/schemas/settings.js";
import { nextTick, onMounted, reactive, ref } from "vue";
import { useI18n } from "vue-i18n";
import { useSettingsStore } from "../../stores/settings.js";

const { t } = useI18n();
const settings = useSettingsStore();

const GROUPS = [
  // the Notes card's settings: its list's page size, and the largest file Import a file takes
  {
    id: "notes",
    title: "settings.general.notesTitle",
    hint: "settings.general.notesHint",
    fields: [
      { key: "notes.pageSize", id: "setting-page-size", label: "settings.general.pageSize" },
      { key: "notes.maxImportKilobytes", id: "setting-max-import", label: "settings.general.maxImportKilobytes" },
    ],
  },
  // how often a window looks for what other windows changed on the server (the kit's watchOtherWindows)
  {
    id: "windows",
    title: "settings.general.windowsTitle",
    hint: "settings.general.windowsHint",
    fields: [{ key: "windows.checkSeconds", id: "setting-check-seconds", label: "settings.general.checkSeconds" }],
  },
];
const FIELDS = GROUPS.flatMap((g) => g.fields);
const rules = schemaRules(SettingsPatch);
const draft = reactive(Object.fromEntries(FIELDS.map((f) => [f.key, null])));
const serverErrors = ref({});
const saving = ref(""); // the card being saved
const loaded = ref(false);

const changedKeys = (group) => (loaded.value ? group.fields.map((f) => f.key).filter((k) => draft[k] !== settings.values[k]) : []);

onMounted(async () => {
  try {
    await settings.load();
    for (const f of FIELDS) draft[f.key] = settings.values[f.key] ?? null;
    loaded.value = true;
  } catch (e) {
    reportError(e);
  }
});

// the field Enter was pressed in, for the focus to go back to after the save
let enterFrom = null;

async function save(group) {
  // where the keyboard was: the box Enter was pressed in (QBtn takes the focus to the submit button before this
  // runs — the box is remembered on its keydown), or Save (it stays focusable when off — aria-disabled)
  const back = enterFrom?.isConnected ? enterFrom : document.activeElement;
  enterFrom = null;
  saving.value = group.id;
  serverErrors.value = {};
  try {
    await settings.save(Object.fromEntries(changedKeys(group).map((k) => [k, draft[k]])));
    for (const f of group.fields) draft[f.key] = settings.values[f.key];
  } catch (e) {
    const fields = fieldErrors(e);
    if (group.fields.some((f) => fields[f.key])) serverErrors.value = fields;
    else reportError(e);
  } finally {
    saving.value = "";
    await nextTick();
    if (back?.isConnected && back !== document.activeElement && !back.closest?.("[aria-disabled='true']")) back.focus();
  }
}
</script>

<template>
  <section v-for="group in GROUPS" :key="group.id" class="card">
    <h2>{{ t(group.title) }}</h2>
    <p class="hint">{{ t(group.hint) }}</p>
    <q-form class="form" greedy @submit="save(group)" @keydown.enter.capture="(e) => (enterFrom = e.target)">
      <div class="form__row">
        <UiField v-for="f in group.fields" :key="f.key" :label="t(f.label)" layout="block" :for="f.id">
          <UiNumber
            :id="f.id" v-model="draft[f.key]" width="num" :disabled="!loaded" lazy-rules
            :rules="rules[f.key]" :error="!!serverErrors[f.key]" :error-message="serverErrors[f.key]"
            @update:model-value="serverErrors = {}"
          />
        </UiField>
        <UiButton
          type="submit" intent="primary" focusable-when-disabled :disabled="!!saving || !changedKeys(group).length"
          :label="saving === group.id ? t('kit.common.saving') : t('kit.common.save')"
        />
      </div>
    </q-form>
  </section>
</template>
