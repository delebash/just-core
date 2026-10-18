<script setup>
// SPDX-License-Identifier: MIT
// Home — what the app is and the ways in. A new app makes this its own dashboard; the template's
// points at the example area (Notes), the AI setup and Help.
import { openHelp, PaneHeader, pageFlow, UiButton } from "@delebash/ui";
import { useI18n } from "vue-i18n";
import { useRouter } from "vue-router";

const { t } = useI18n();
const router = useRouter();
</script>

<template>
  <q-page :style-fn="pageFlow" class="page">
    <PaneHeader :eyebrow="t('app.name')" :title="t('home.title')" help-key="getting-started" />
    <p class="page__lede">{{ t("home.lede") }}</p>
    <div class="cards">
      <section class="card">
        <h2>{{ t("home.notes.title") }}</h2>
        <p class="hint">{{ t("home.notes.body") }}</p>
        <UiButton intent="primary" :label="t('home.notes.open')" @click="router.push('/notes')" />
      </section>
      <section class="card">
        <h2>{{ t("home.ai.title") }}</h2>
        <p class="hint">{{ t("home.ai.body") }}</p>
        <UiButton intent="secondary" :label="t('home.ai.open')" @click="router.push('/ai')" />
      </section>
      <section class="card">
        <h2>{{ t("home.help.title") }}</h2>
        <p class="hint">{{ t("home.help.body") }}</p>
        <UiButton intent="secondary" :label="t('home.help.open')" @click="openHelp('getting-started')" />
      </section>
    </div>
  </q-page>
</template>
