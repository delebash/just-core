<script setup>
// SPDX-License-Identifier: MIT
// AI Settings — the kit's whole AI area (app-structure §11, the AI-console canon): providers, the
// model catalog and its downloads, routing by feature (this app's feature and its engine preset —
// the Lab edits both), usage, the console. One route, one component; docgen's AiPage.vue is the
// donor. The ?quicksetup=1 and ?providers=online deep links (the once-ever AI offer's two buttons)
// are one-shot instructions: read once, then taken off the URL, so Back or a remount never reopens
// the wizard.
import { AiModelsArea, PaneHeader, pageFlow, useModelApply } from "@delebash/ui";
import { onMounted, ref } from "vue";
import { useRoute, useRouter } from "vue-router";

const route = useRoute();
const router = useRouter();

const openWizardOnce = ref(route.query.quicksetup === "1");
const providerScope = route.query.providers === "online" ? "online" : "";

onMounted(async () => {
  if (!openWizardOnce.value && !providerScope) return;
  if (openWizardOnce.value) {
    // never offer to set up a machine that is set up
    try {
      const { refreshApplied, currentDefaultProviderId } = useModelApply();
      await refreshApplied();
      if (currentDefaultProviderId.value) openWizardOnce.value = false;
    } catch {
      // unknown → let it open; the machine with no AI is the one it serves
    }
  }
  router.replace({ path: "/ai" }); // consumed either way
});
</script>

<template>
  <q-page :style-fn="pageFlow" class="page ai-page">
    <PaneHeader :eyebrow="$t('ai.eyebrow')" :title="$t('ai.title')" help-key="ai-providers" />
    <div class="ai-area">
      <AiModelsArea :auto-open-quick-setup="openWizardOnce" :initial-provider-scope="providerScope" />
    </div>
  </q-page>
</template>
