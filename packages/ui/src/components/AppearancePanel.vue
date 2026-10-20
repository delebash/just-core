<script setup>
// SPDX-License-Identifier: MIT
// Shared Settings → Appearance rows — JV's donor rows lifted into the ONE kit
// surface both consumers (JustVoice, just_ai_i18n_docgen) mount (the
// 2026-08-04 shared-surface ruling). The host keeps its own card/section
// chrome. The rows' look is the kit's (`:where(.setting-row…)` in
// common/styles.css — zero specificity, so JustVoice's and docgen's own
// `.setting-row*` / `.accent-preview` rules still win) — an app that styles
// nothing gets laid-out rows and a hue slider in the accent colour, live as
// it moves (2026-10-18: the template had no copy of those rules, so its
// slider stayed the system blue). The hue is the kit's UiSlider (long, 320 px
// — "a slider is a control, not a layout filler"), never a hand-rolled range;
// its fill is the accent, so it recolours as the hue moves (JustVoice's
// proposal, 2026-10-18).
//
// Rows: Theme · Interface size · UI font · Accent hue (swatch + slider) ·
// Language. The Language row renders only when the host passes `locales` —
// content, not surface: an app without i18n shows no dead picker.
//
// The host binds `:appearance` (its ui store's appearance object) and applies
// the emitted `patch` partials via its store's `setAppearance`.
// Each select is named by its row's title (aria-labelledby — they were named only by their value: the
// sixteenth review, 2026-10-20).
import { computed, useId } from "vue";
import { useI18n } from "vue-i18n";
import UiSelect from "../common/components/UiSelect.vue";
import UiSlider from "../common/components/UiSlider.vue";
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
const uid = useId();
const titleId = (row) => `appearance-${row}-${uid}`;
</script>

<template>
  <div class="setting-row">
    <div class="setting-row__head">
      <div>
        <div :id="titleId('theme')" class="setting-row__title">{{ t('kit.appearance.panel.theme') }}</div>
        <div class="setting-row__desc">{{ t('kit.appearance.panel.themeDesc') }}</div>
      </div>
      <UiSelect
        :aria-labelledby="titleId('theme')"
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
        <div :id="titleId('size')" class="setting-row__title">{{ t('kit.appearance.panel.size') }}</div>
        <div class="setting-row__desc">{{ t('kit.appearance.panel.sizeDesc') }}</div>
      </div>
      <UiSelect
        :aria-labelledby="titleId('size')"
        :model-value="appearance.uiScale"
        width="name"
        :options="UI_SCALES.map((s) => ({ label: t(s.labelKey), value: s.value }))"
        @update:model-value="(v) => emit('patch', { uiScale: Number(v) })"
      />
    </div>
  </div>

  <div class="setting-row">
    <div class="setting-row__head">
      <div>
        <div :id="titleId('font')" class="setting-row__title">{{ t('kit.appearance.panel.font') }}</div>
        <div class="setting-row__desc">{{ t('kit.appearance.panel.fontDesc') }}</div>
      </div>
      <UiSelect
        :aria-labelledby="titleId('font')"
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
    <UiSlider
      class="setting-row__slider"
      :model-value="appearance.accentHue"
      :min="0" :max="360" :step="1" width="long" :show-number="false"
      :aria-label="t('kit.appearance.panel.accent', { hue: appearance.accentHue })"
      @update:model-value="(v) => emit('patch', { accentHue: Number(v) })"
    />
  </div>

  <div v-if="locales.length" class="setting-row">
    <div class="setting-row__head">
      <div>
        <div :id="titleId('locale')" class="setting-row__title">{{ t('kit.settings.language.label') }}</div>
        <div class="setting-row__desc">{{ localeHint }}</div>
      </div>
      <UiSelect
        :aria-labelledby="titleId('locale')"
        :model-value="appearance.locale"
        width="name"
        :options="locales"
        @update:model-value="(v) => emit('patch', { locale: v })"
      />
    </div>
  </div>
</template>
