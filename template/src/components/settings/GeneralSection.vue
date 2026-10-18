<script setup>
// SPDX-License-Identifier: MIT
// Settings → General — the app's own settings (/v1/settings, a schema per key; family rule 1: a
// value a user might change is a seeded row, never a constant). The §15 form: the rules are the
// route's own schema (`schemaRules(SettingsPatch)` from the server package), a 422 lands under its
// field (`fieldErrors`), any other failure goes through `reportError`, Save is disabled while it
// runs and sits on the row of the field it saves.
import { fieldErrors, reportError, schemaRules, UiButton, UiField, UiNumber } from "@delebash/ui";
import { SettingsPatch } from "family-template-server/schemas/settings.js";
import { computed, onMounted, reactive, ref } from "vue";
import { useI18n } from "vue-i18n";
import { useSettingsStore } from "../../stores/settings.js";

const { t } = useI18n();
const settings = useSettingsStore();

const KEY = "notes.pageSize";
const rules = schemaRules(SettingsPatch);
const draft = reactive({ [KEY]: null });
const serverErrors = ref({});
const saving = ref(false);
const loaded = ref(false);

const changed = computed(() => loaded.value && draft[KEY] !== settings.values[KEY]);

onMounted(async () => {
  try {
    await settings.load();
    draft[KEY] = settings.values[KEY] ?? null;
    loaded.value = true;
  } catch (e) {
    reportError(e);
  }
});

async function save() {
  saving.value = true;
  serverErrors.value = {};
  try {
    await settings.save({ [KEY]: draft[KEY] });
    draft[KEY] = settings.values[KEY];
  } catch (e) {
    const fields = fieldErrors(e);
    if (fields[KEY]) serverErrors.value = fields;
    else reportError(e);
  } finally {
    saving.value = false;
  }
}
</script>

<template>
  <section class="card">
    <h2>{{ t("settings.general.notesTitle") }}</h2>
    <p class="hint">{{ t("settings.general.notesHint") }}</p>
    <q-form class="form" greedy @submit="save">
      <div class="form__row">
        <UiField :label="t('settings.general.pageSize')" layout="block" for="setting-page-size">
          <UiNumber
            id="setting-page-size" v-model="draft[KEY]" width="num" :disabled="!loaded" lazy-rules
            :rules="rules[KEY]" :error="!!serverErrors[KEY]" :error-message="serverErrors[KEY]"
            @update:model-value="serverErrors = {}"
          />
        </UiField>
        <UiButton type="submit" intent="primary" :disabled="saving || !changed" :label="saving ? t('kit.common.saving') : t('kit.common.save')" />
      </div>
    </q-form>
  </section>
</template>
