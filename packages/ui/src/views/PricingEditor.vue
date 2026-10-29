<script setup>
// SPDX-License-Identifier: MIT
// Editor for cloud model pricing (the usage-ledger cost source). Backed by the
// shared /v1/ai/pricing CRUD (llm_runner/llm/pricing_api.py), persisted in the
// host DB's model_pricing table (seeded from pricing.DEFAULT_PRICING). Prices
// change, so they're editable here rather than hardcoded in pricing.py. Local
// models have no row → cost 0. Values are USD per 1,000,000 tokens.
import { onMounted, ref } from "vue";
import { useI18n } from "vue-i18n";

import UiButton from "../common/components/UiButton.vue";
import UiInput from "../common/components/UiInput.vue";
import { confirmDialog } from "../common/services/dialog.js";
import { request } from "../client.js";

const { t } = useI18n();
const MODEL_ID_EXAMPLE = "gpt-5-mini";
const rows = ref([]);
const loading = ref(true);
const error = ref("");
// a row's prices: input, output, and a prompt cache's writes and reads (Claude's — 0: priced as input; 2026-10-29)
const PRICE_FIELDS = ["inputPerM", "outputPerM", "cacheWritePerM", "cacheReadPerM"];
const emptyDraft = () => ({ modelId: "", inputPerM: "", outputPerM: "", cacheWritePerM: "", cacheReadPerM: "" });
const draft = ref(emptyDraft());
const busy = ref(""); // the modelId (or "__add") currently saving/deleting

// Each row keeps the prices the server has (`base`), so Save shows only on a row edited here — one primary
// button per change, not one on every row. A save or a remove answers the whole list: a row edited here and
// not yet saved keeps its edits (it used to lose them to another row's save).
const pricesOf = (r) => Object.fromEntries(PRICE_FIELDS.map((k) => [k, String(r[k] ?? 0)]));
const isEdited = (r) => !!r.base && PRICE_FIELDS.some((k) => String(r[k] ?? 0) !== r.base[k]);
const numbers = (r) => Object.fromEntries(PRICE_FIELDS.map((k) => [k, Number(r[k]) || 0]));
function _apply(d, savedId = null) {
  const edited = new Map(rows.value.filter((r) => r.modelId !== savedId && isEdited(r)).map((r) => [r.modelId, r]));
  rows.value = (d.rows || []).map((r) => {
    const mine = edited.get(r.modelId);
    return { ...r, ...(mine ? Object.fromEntries(PRICE_FIELDS.map((k) => [k, mine[k]])) : {}), base: pricesOf(r) };
  });
}

async function load() {
  loading.value = true; error.value = "";
  try { _apply(await request("/v1/ai/pricing")); }
  catch (e) { error.value = e.message || t("kit.pricing.err.load"); }
  finally { loading.value = false; }
}

async function put(body, key) {
  busy.value = key; error.value = "";
  try { _apply(await request("/v1/ai/pricing", { method: "PUT", body }), body.modelId); return true; }
  catch (e) { error.value = e.message || t("kit.pricing.err.save"); return false; }
  finally { busy.value = ""; }
}

function saveRow(r) {
  put({ modelId: r.modelId, ...numbers(r) }, r.modelId);
}

async function addRow() {
  const id = (draft.value.modelId || "").trim();
  if (!id) { error.value = t("kit.pricing.err.idRequired"); return; }
  const ok = await put({ modelId: id, ...numbers(draft.value) }, "__add");
  if (ok) draft.value = emptyDraft();
}

async function delRow(r) {
  if (!(await confirmDialog(t("kit.pricing.removeConfirm", { id: r.modelId })))) return;
  busy.value = r.modelId; error.value = "";
  try { _apply(await request(`/v1/ai/pricing?modelId=${encodeURIComponent(r.modelId)}`, { method: "DELETE" })); }
  catch (e) { error.value = e.message || t("kit.pricing.err.delete"); }
  finally { busy.value = ""; }
}

onMounted(load);
</script>

<template>
  <div class="lu-pricing">
    <div class="lu-pricing-head">
      <span class="lu-pcard-title">{{ t('kit.pricing.title') }}</span>
      <span class="lu-muted">{{ t('kit.pricing.hint') }}</span>
    </div>
    <div v-if="error" class="lu-error">{{ error }}</div>
    <div v-if="loading" class="lu-muted">{{ t('kit.common.loading') }}</div>
    <table v-else class="ui-formgrid lu-price-tbl">
      <thead>
        <tr>
          <th>{{ t('kit.pricing.col.id') }}</th><th>{{ t('kit.pricing.col.input') }}</th><th>{{ t('kit.pricing.col.output') }}</th>
          <th :title="t('kit.pricing.col.cacheTitle')">{{ t('kit.pricing.col.cacheWrite') }}</th><th :title="t('kit.pricing.col.cacheTitle')">{{ t('kit.pricing.col.cacheRead') }}</th><th />
        </tr>
      </thead>
      <tbody>
        <tr v-for="r in rows" :key="r.modelId">
          <td class="lu-price-id">{{ r.modelId }}</td>
          <td><UiInput v-model="r.inputPerM" type="number" width="token" /></td>
          <td><UiInput v-model="r.outputPerM" type="number" width="token" /></td>
          <td><UiInput v-model="r.cacheWritePerM" type="number" width="token" /></td>
          <td><UiInput v-model="r.cacheReadPerM" type="number" width="token" /></td>
          <td>
            <div class="lu-price-act">
              <UiButton v-if="isEdited(r)" intent="primary" size="small" :loading="busy === r.modelId" @click="saveRow(r)">{{ t('kit.common.save') }}</UiButton>
              <UiButton intent="ghost" size="small" :title="t('kit.common.remove')" :aria-label="t('kit.common.remove')" @click="delRow(r)">✕</UiButton>
            </div>
          </td>
        </tr>
        <tr class="ui-formgrid-add lu-price-add">
          <td><UiInput v-model="draft.modelId" :placeholder="t('kit.pricing.idExample', { id: MODEL_ID_EXAMPLE })" /></td>
          <td><UiInput v-model="draft.inputPerM" type="number" placeholder="0" width="token" /></td>
          <td><UiInput v-model="draft.outputPerM" type="number" placeholder="0" width="token" /></td>
          <td><UiInput v-model="draft.cacheWritePerM" type="number" placeholder="0" width="token" /></td>
          <td><UiInput v-model="draft.cacheReadPerM" type="number" placeholder="0" width="token" /></td>
          <td><div class="lu-price-act"><UiButton intent="secondary" size="small" :loading="busy === '__add'" @click="addRow">{{ t('kit.pricing.add') }}</UiButton></div></td>
        </tr>
      </tbody>
    </table>
  </div>
</template>

<style scoped>
.lu-pricing { margin-top: 18px; }
.lu-pricing-head { display: flex; flex-direction: column; gap: 2px; margin-bottom: 10px; }
/* Table mechanics come from the shared .ui-formgrid; only the width cap is this editor's. */
.lu-price-tbl { max-width: 620px; }
.lu-price-id { font-family: var(--font-mono, monospace); color: var(--ink); }
/* The buttons' row is a div INSIDE the cell: a <td> set to flex stops being a table cell and no longer
   takes its row's height (its rule sat 14 px above the row's — JustWrite, 2026-10-24). */
.lu-price-act { display: flex; gap: 6px; justify-content: flex-end; align-items: center; }
</style>
