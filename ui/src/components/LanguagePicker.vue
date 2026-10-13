<script setup>
// SPDX-License-Identifier: MIT
// The language picker every app shows in Settings → Appearance (D5 of the i18n plan,
// docs/plans/2026-10-12-i18n-standard.md): the switcher Quasar's i18n page shows
// (quasar.dev/options/app-internationalization#create-language-switcher) — a select over
// vue-i18n's global `locale` — on the kit's UiSelect, each language named in itself
// (languageName). The app passes its languages (the codes of its catalogs) and keeps the choice
// where it keeps settings, from `change` (JustWrite: ui.setLocale). Quasar's own words follow the
// locale by themselves (followQuasarLang), and so do dates and numbers (d() / n()).
import { computed } from "vue";
import { useI18n } from "vue-i18n";
import UiSelect from "../common/components/UiSelect.vue";
import { languageName } from "../i18n/index.js";

const props = defineProps({
  // the app's languages, by code ("en", "es", "pt-BR")
  locales: { type: Array, required: true },
});
const emit = defineEmits(["change"]);

const { locale, t } = useI18n({ useScope: "global" });
const options = computed(() => props.locales.map((code) => ({ label: languageName(code), value: code })));

function pick(code) {
  locale.value = code;
  emit("change", code);
}
</script>

<template>
  <UiSelect
    :model-value="locale"
    :options="options"
    width="fit"
    :aria-label="t('kit.settings.language.label')"
    @update:model-value="pick"
  />
</template>
