<script setup>
// SPDX-License-Identifier: MIT
// A path the app has no page for (Quasar's scaffold ships a catch-all, ErrorNotFound.vue; this is it
// inside the chrome, on the kit's EmptyState, so the nav still works).
import { EmptyState, pageFlow } from "@delebash/ui";
import { useI18n } from "vue-i18n";
import { useRouter } from "vue-router";

const { t } = useI18n();
const router = useRouter();
</script>

<template>
  <q-page :style-fn="pageFlow" class="page">
    <EmptyState
      icon="Alert" :title="t('notFound.title')" :message="t('notFound.message')"
      :action-label="t('notFound.home')" @action="router.push('/')"
    />
  </q-page>
</template>
