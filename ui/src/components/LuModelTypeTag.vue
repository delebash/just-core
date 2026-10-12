<script setup>
// SPDX-License-Identifier: MIT
// THE Dense/MoE tag (2026-07-26). Extracted, not copied: the words lived as an inline
// ternary in LuModelCatalog's row template and the PC-class library needed the same
// thing, so this owns the word (via `modelTypeLabel`), the intent, and the explanation.
//
// WHY IT EARNS A TAG AT ALL — the user's question that produced it: an integrated 32 GB
// class lists a dense 27B and a 26B MoE side by side, and nothing on screen says why the
// BIGGER model is the sane pick. A MoE runs a fraction of its parameters per token, so it
// wants far less VRAM than its size implies; that inversion is the single fact that makes
// every hardware number on these surfaces read as sense instead of nonsense.
//
// It deliberately does NOT say how FAST anything is. A dense 27B on shared memory is very
// likely slow, but nobody has measured one — and the seed principle is that the seed ships
// FACTS while the machine supplies MEASUREMENTS. Architecture is a fact; speed would be a
// guess printed as one.
import { useI18n } from "vue-i18n";
import UiTag from "../common/components/UiTag.vue";
import { modelTypeLabel } from "../composables/useCatalogMeta.js";

defineProps({
	// The catalog row's `type` ("moe" | "dense"); anything else reads as dense, matching
	// the catalog's own default (model_catalog_api.py:42).
	type: { type: String, default: "dense" },
});

const { t } = useI18n();
</script>

<template>
  <UiTag intent="secondary" :title="type === 'moe' ? t('kit.modelType.moeTip') : t('kit.modelType.denseTip')">{{ modelTypeLabel(type) }}</UiTag>
</template>
