<!-- SPDX-License-Identifier: MIT -->
<!--
  LuEngineInstallButton — THE one "Install engine" control for the bundled
  llama.cpp engine. Bound to the shared useEngine() module singleton, so the
  label, :title, intent and action live in ONE place and can never drift between
  surfaces. Rendered in BOTH the Local-engine panel (LuRunnerEngine) and the
  built-in provider's collapsed list row (AiModelsArea) — the user wanted the
  install affordance surfaced on the row too, next to the update button ("we moved
  the update button but not the install button move it now", 2026-07-21). One
  shared component keeps it the SAME control (a copy would drift — T3 + the
  LuEngineUpdateButton precedent).

  The CALLER gates visibility on `statusKnown && !installed && !installing`
  (v-if) — matching the panel's original inline gate; this component is just the button.
-->
<script setup>
import { useI18n } from "vue-i18n";
import UiButton from "../common/components/UiButton.vue";
import { useEngine } from "../composables/useEngine.js";

const { install, busy } = useEngine();
const { t } = useI18n();
</script>

<template>
  <UiButton intent="primary" size="small" :loading="busy"
    :title="t('kit.engine.install.tip')"
    @click="install()">{{ t('kit.engine.install.button') }}</UiButton>
</template>
