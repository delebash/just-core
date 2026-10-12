<script setup>
// SPDX-License-Identifier: MIT
// Shared server-logs viewer (Logs phase, 2026-07-05 — "easier to read + clear/
// delete + per-day + delete-all"). Live mode tails the in-memory ring
// (/v1/logs/tail); the day picker reads a stored day's FILE (/v1/logs/day,
// fuller than the ring). Lines are level-COLORED and filterable (group-aware:
// a traceback's continuation lines stay with the error line that started them).
// Clear empties the on-screen tail (the ring); Delete day / Delete all logs
// remove stored files (kit confirmDialog — never native). Same panel in every
// same-stack app; the host mounts make_logs_router + installs ring + file log.
import { computed, onMounted, ref } from "vue";
import { useI18n } from "vue-i18n";
import { request, llmUiUrl } from "../client.js";
import UiButton from "../common/components/UiButton.vue";
import UiSelect from "../common/components/UiSelect.vue";
import { confirmDialog } from "../common/services/dialog.js";
import { formatLogDay, logLineClass, parseLogRows } from "../services/logLines.js";

const LIVE = "__live";
const text = ref("");
const loading = ref(false);
const copied = ref(false);
const busy = ref(""); // "" | clear | delete | deleteAll
const err = ref("");
const days = ref([]); // [{day, sizeKb, live}]
const selected = ref(LIVE);
const level = ref("all"); // all | warn | error
const { t } = useI18n();

const dayOptions = computed(() => [
  { value: LIVE, label: t("kit.logs.live") },
  ...days.value.map((d) => ({
    value: d.day,
    // LABEL is localised (the reader's date format); `value` above stays the ISO
    // id — it is the `/v1/logs/day?date=` wire key. Ordering does not depend on
    // the label text: the server returns days newest-first (_day_files sorts).
    label: `${formatLogDay(d.day)}${d.live ? " (today)" : ""} · ${d.sizeKb} KB`,
  })),
]);
const LEVEL_OPTIONS = computed(() => [
  { value: "all", label: t("kit.logs.level.all") },
  { value: "warn", label: t("kit.logs.level.warn") },
  { value: "error", label: t("kit.logs.level.error") },
]);

// Group-aware rows come from the shared parser (a line WITH a level token starts
// a group; continuation lines inherit it — so "Errors only" keeps the whole
// traceback, not just its first line); the level dropdown then filters.
const rows = computed(() => {
  const out = parseLogRows(text.value);
  const min = level.value;
  if (min === "all") return out;
  const keep = min === "error" ? new Set(["ERROR", "CRITICAL"]) : new Set(["WARNING", "ERROR", "CRITICAL"]);
  return out.filter((r) => keep.has(r.level));
});

async function loadDays() {
  try {
    days.value = (await request("/v1/logs/days")).days || [];
  } catch {
    days.value = []; // day storage unavailable (ring-only host) — live tail still works
  }
}
async function refresh() {
  loading.value = true;
  err.value = "";
  try {
    if (selected.value === LIVE) {
      const r = await request("/v1/logs/tail?lines=200");
      text.value = r.text || "";
    } else {
      const r = await request(`/v1/logs/day?date=${encodeURIComponent(selected.value)}&lines=2000`);
      text.value = r.text || "";
    }
  } catch (e) {
    text.value = "";
    err.value = t("kit.logs.err.load", { error: e.message });
  } finally {
    loading.value = false;
  }
}
function onPickDay(v) {
  selected.value = v;
  refresh();
}
async function copyLogs() {
  try {
    // `raw`, not `line`: a copied log is an ARTIFACT, like Download beside it —
    // it gets pasted into a bug report or a file, where ISO + milliseconds are
    // what's wanted. The rows are still the LEVEL-FILTERED ones, so "Errors only"
    // copies only errors (copying the unparsed blob would silently lose that).
    await navigator.clipboard.writeText(rows.value.map((r) => r.raw).join("\n"));
    copied.value = true;
    setTimeout(() => { copied.value = false; }, 1500);
  } catch { /* clipboard blocked — ignore */ }
}
async function clearTail() {
  busy.value = "clear";
  try {
    await request("/v1/logs/clear", { method: "POST" });
    await refresh();
  } catch (e) { err.value = e.message || "Couldn't clear."; }
  finally { busy.value = ""; }
}
async function deleteDay() {
  const day = selected.value === LIVE ? days.value.find((d) => d.live)?.day : selected.value;
  if (!day) return;
  const ok = await confirmDialog({
    title: t("kit.logs.delDay.title"),
    // reader-facing prose → localised, matching the picker label it was chosen
    // from; the raw ISO `day` still goes on the wire at the DELETE below.
    message: t("kit.logs.delDay.body", { day: formatLogDay(day) }),
    confirmLabel: t("kit.logs.delDay.confirm"),
    danger: true,
  });
  if (!ok) return;
  busy.value = "delete";
  try {
    const r = await request(`/v1/logs/day?date=${encodeURIComponent(day)}`, { method: "DELETE" });
    days.value = r.days || [];
    if (selected.value !== LIVE && !days.value.some((d) => d.day === selected.value)) selected.value = LIVE;
    await refresh();
  } catch (e) { err.value = e.message || t("kit.logs.err.deleteDay"); }
  finally { busy.value = ""; }
}
async function deleteAll() {
  const ok = await confirmDialog({
    title: t("kit.logs.delAll.title"),
    message: t("kit.logs.delAll.body"),
    confirmLabel: t("kit.logs.delAll.confirm"),
    danger: true,
  });
  if (!ok) return;
  busy.value = "deleteAll";
  try {
    const r = await request("/v1/logs/all", { method: "DELETE" });
    days.value = r.days || [];
    selected.value = LIVE;
    await refresh();
  } catch (e) { err.value = e.message || t("kit.logs.err.deleteAll"); }
  finally { busy.value = ""; }
}

onMounted(() => {
  loadDays();
  refresh();
});
</script>

<template>
  <div class="lu-logs">
    <div class="lu-logs-head">
      <span class="lu-pcard-title">{{ t('kit.storage.serverLogs') }}</span>
      <span class="lu-muted lu-logs-sub">{{ t('kit.logs.sub') }}</span>
      <span class="lu-logs-spacer" />
      <UiSelect :model-value="selected" :options="dayOptions" @update:model-value="onPickDay" />
      <UiSelect v-model="level" :options="LEVEL_OPTIONS" />
      <UiButton intent="secondary" size="small" :loading="loading" @click="refresh">↻ {{ t('kit.common.refresh') }}</UiButton>
    </div>
    <div class="lu-logs-head lu-logs-actions">
      <i18n-t keypath="kit.logs.clearVsDelete" tag="span" class="lu-muted lu-logs-sub" scope="global"><template #clear><b>{{ t('kit.logs.clear') }}</b></template><template #delete><b>{{ t('kit.common.delete') }}</b></template></i18n-t>
      <span class="lu-logs-spacer" />
      <UiButton intent="ghost" size="small" @click="copyLogs">{{ copied ? t('kit.logs.copied') : t('kit.common.copy') }}</UiButton>
      <a v-if="selected === LIVE" class="lu-logs-dl" :href="llmUiUrl('/v1/logs/download')" download>{{ t('kit.common.download') }}</a>
      <UiButton v-if="selected === LIVE" intent="ghost" size="small" :loading="busy === 'clear'" @click="clearTail">{{ t('kit.logs.clear') }}</UiButton>
      <UiButton intent="danger" size="small" :loading="busy === 'delete'" :title="t('kit.logs.delDay.buttonTitle')" @click="deleteDay">{{ t('kit.logs.delDay.confirm') }}</UiButton>
      <UiButton intent="danger" size="small" :loading="busy === 'deleteAll'" :title="t('kit.logs.delAll.buttonTitle')" @click="deleteAll">{{ t('kit.logs.delAll.confirm') }}</UiButton>
    </div>
    <div v-if="err" class="lu-error">{{ err }}</div>
    <div class="lu-logs-pre lu-logbox" role="log">
      <template v-if="rows.length && text">
        <div v-for="(r, i) in rows" :key="i" class="lu-logline" :class="logLineClass(r.level)">{{ r.line }}</div>
      </template>
      <div v-else class="lu-muted">{{ text ? t('kit.logs.noMatch') : t('kit.logs.none') }}</div>
    </div>
  </div>
</template>

<style scoped>
.lu-logs { display: flex; flex-direction: column; gap: 10px; }
.lu-logs-head { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
.lu-logs-actions { margin-top: -4px; }
.lu-logs-sub { font-size: 11.5px; }
.lu-logs-spacer { flex: 1; }
.lu-logs-dl { font-size: 12px; font-weight: 600; color: var(--accent-ink, var(--accent)); text-decoration: none; padding: 4px 6px; }
.lu-logs-dl:hover { text-decoration: underline; }
/* Box chrome + the .lu-logline* level grammar are shared (.lu-logbox in
   common/styles.css); LogsPanel only caps the height of its instance. */
.lu-logs-pre { max-height: 460px; }
</style>
