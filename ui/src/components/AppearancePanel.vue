<script setup>
// SPDX-License-Identifier: MIT
// Shared Settings → Appearance rows — JV's donor rows lifted into the ONE kit
// surface both consumers (JustVoice, just_ai_i18n_docgen) mount (the
// 2026-08-04 shared-surface ruling). The host keeps its own card/section
// chrome and its `.setting-row*` / `.accent-preview` styles — this panel
// ships no CSS so each app's existing look applies unchanged.
//
// Rows: Theme · Interface size · UI font · Accent hue (swatch + slider) ·
// Language. The Language row renders only when the host passes `locales` —
// content, not surface: an app without i18n shows no dead picker.
//
// The host binds `:appearance` (its ui store's appearance object) and applies
// the emitted `patch` partials via its store's `setAppearance`.
import { computed } from "vue";
import { useI18n } from "vue-i18n";
import UiSelect from "../common/components/UiSelect.vue";
import { UI_FONTS, UI_SCALES } from "../common/services/appearance.js";

const props = defineProps({
  appearance: { type: Object, required: true },
  // oklch chroma for the accent swatch — the app's real palette punch.
  accentChroma: { type: Number, default: 0.1 },
  // App-true tail for the accent desc (e.g. "Default 166° = forest green.").
  accentNote: { type: String, default: "" },
  // Locale options ({ label, value }); empty = no Language row.
  locales: { type: Array, default: () => [] },
  localeDesc: { type: String, default: "" },
});
const emit = defineEmits(["patch"]);

const { t } = useI18n();
const localeHint = computed(() => props.localeDesc || t("kit.appearance.panel.localeDesc"));
const MODES = computed(() => [
  { label: t("kit.appearance.panel.mode.system"), value: "system" },
  { label: t("kit.appearance.panel.mode.light"), value: "light" },
  { label: t("kit.appearance.panel.mode.dark"), value: "dark" },
]);
const fontOptions = UI_FONTS.map((f) => f.label);
</script>

<template>
  <div class="setting-row">
    <div class="setting-row__head">
      <div>
        <div class="setting-row__title">{{ t('kit.appearance.panel.theme') }}</div>
        <div class="setting-row__desc">{{ t('kit.appearance.panel.themeDesc') }}</div>
      </div>
      <UiSelect
        :model-value="appearance.mode"
        width="name"
        :options="MODES"
        @update:model-value="(v) => emit('patch', { mode: v })"
      />
    </div>
  </div>

  <div class="setting-row">
    <div class="setting-row__head">
      <div>
        <div class="setting-row__title">{{ t('kit.appearance.panel.size') }}</div>
        <div class="setting-row__desc">{{ t('kit.appearance.panel.sizeDesc') }}</div>
      </div>
      <UiSelect
        :model-value="appearance.uiScale"
        width="name"
        :options="UI_SCALES.map((s) => ({ label: s.label, value: s.value }))"
        @update:model-value="(v) => emit('patch', { uiScale: Number(v) })"
      />
    </div>
  </div>

  <div class="setting-row">
    <div class="setting-row__head">
      <div>
        <div class="setting-row__title">{{ t('kit.appearance.panel.font') }}</div>
        <div class="setting-row__desc">{{ t('kit.appearance.panel.fontDesc') }}</div>
      </div>
      <UiSelect
        :model-value="appearance.uiFont"
        width="name"
        :options="fontOptions"
        @update:model-value="(v) => emit('patch', { uiFont: v })"
      />
    </div>
  </div>

  <div class="setting-row">
    <div class="setting-row__head">
      <div>
        <div class="setting-row__title">{{ t('kit.appearance.panel.accent', { hue: appearance.accentHue }) }}</div>
        <div class="setting-row__desc">
          {{ t('kit.appearance.panel.accentDesc') }}{{ accentNote ? ` ${accentNote}` : "" }}
        </div>
      </div>
      <span class="setting-row__value">
        <span class="accent-preview" :style="{ background: `oklch(0.538 ${accentChroma} ${appearance.accentHue})` }" />
      </span>
    </div>
    <input
      type="range"
      :value="appearance.accentHue"
      min="0" max="360" step="1"
      class="setting-row__slider"
      @input="(e) => emit('patch', { accentHue: Number(e.target.value) })"
    />
  </div>

  <div v-if="locales.length" class="setting-row">
    <div class="setting-row__head">
      <div>
        <div class="setting-row__title">{{ t('kit.settings.language.label') }}</div>
        <div class="setting-row__desc">{{ localeHint }}</div>
      </div>
      <UiSelect
        :model-value="appearance.locale"
        width="name"
        :options="locales"
        @update:model-value="(v) => emit('patch', { locale: v })"
      />
    </div>
  </div>
</template>
