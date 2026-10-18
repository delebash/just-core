<script setup>
// SPDX-License-Identifier: MIT
// Notes — the example domain's screen, the reference for app-structure §17: a q-page with the kit's
// PaneHeader; the list is the kit's UiTable (QTable), paged by the app's own setting
// (`notes.pageSize`, Settings → General — family rule 1); the states every loading screen has —
// loading (q-inner-loading, never "nothing here" while it loads), empty (the kit's EmptyState with
// the one action that fills it), failed (the kit's UiBanner with the reason and Retry); the editor
// is components/NoteDialog.vue (the §15 form); a delete asks first through the kit's
// confirmDialog, naming what is lost. The first note saved is this app's moment for the once-ever
// AI offer (§11).
import {
  confirmDialog,
  EmptyState,
  errorMessage,
  Icon,
  PaneHeader,
  pageFlow,
  relativeTime,
  reportError,
  UiBanner,
  UiButton,
  UiInput,
  UiTable,
} from "@delebash/ui";
import { computed, onMounted, ref } from "vue";
import { useI18n } from "vue-i18n";
import NoteDialog from "../components/NoteDialog.vue";
import { useNotesStore } from "../stores/notes.js";
import { useSettingsStore } from "../stores/settings.js";
import { useUiStore } from "../stores/ui.js";

const { t } = useI18n();
const notes = useNotesStore();
const settings = useSettingsStore();
const ui = useUiStore();

const filter = ref("");
const loadFailed = ref(null);
// The editor: closed (false), a new note (null) or the note being edited.
const editing = ref(false);

async function load() {
  loadFailed.value = null;
  try {
    await Promise.all([notes.load(), settings.load()]);
  } catch (e) {
    loadFailed.value = e;
  }
}
onMounted(load);

const firstLoad = computed(() => notes.loading && !notes.loaded);
const failedReason = computed(() => {
  if (!loadFailed.value) return "";
  const { title, detail } = errorMessage(loadFailed.value);
  return [title, detail].filter(Boolean).join(" — ");
});

const pageSize = computed(() => settings.values["notes.pageSize"]);
const pagination = computed(() =>
  pageSize.value ? { pageSize: pageSize.value, pageSizeOptions: [...new Set([10, 25, 50, pageSize.value])].sort((a, b) => a - b) } : false,
);

const columns = computed(() => [
  { id: "title", header: t("notes.columns.title"), accessorKey: "title", sortable: true },
  { id: "updatedAt", header: t("notes.columns.changed"), accessorKey: "updatedAt", sortable: true },
  { id: "actions", header: "" },
]);

function openNew() {
  editing.value = null;
}
function openEdit(note) {
  editing.value = note;
}
function onSaved(_note, { created }) {
  if (created) ui.maybeOfferAiSetup();
}

async function remove(note) {
  const yes = await confirmDialog({
    title: t("notes.delete.title"),
    message: t("notes.delete.message", { title: note.title }),
    confirmLabel: t("notes.delete.confirm"),
    danger: true,
  });
  if (!yes) return;
  try {
    await notes.remove(note.id);
  } catch (e) {
    reportError(e);
  }
}
</script>

<template>
  <q-page :style-fn="pageFlow" class="page page--content">
    <PaneHeader :eyebrow="t('app.name')" :title="t('notes.title')" help-key="notes">
      <UiButton intent="primary" :label="t('notes.new')" :disabled="!notes.loaded" @click="openNew" />
    </PaneHeader>

    <!-- failed: the reason and Retry -->
    <UiBanner v-if="loadFailed" class="page__banner">
      {{ t("notes.loadFailed", { reason: failedReason }) }}
      <template #action>
        <UiButton intent="secondary" size="small" :label="t('kit.common.retry')" @click="load" />
      </template>
    </UiBanner>

    <div v-else class="notes">
      <!-- empty: the one action that fills it -->
      <EmptyState
        v-if="notes.loaded && !notes.items.length"
        icon="Note" :title="t('notes.empty.title')" :message="t('notes.empty.message')"
        :action-label="t('notes.new')" @action="openNew"
      />
      <template v-else-if="notes.loaded">
        <div class="notes__tools">
          <UiInput v-model="filter" width="name" type="search" :placeholder="t('notes.filter')" :aria-label="t('notes.filter')" />
        </div>
        <UiTable
          :data="notes.items" :columns="columns" data-key="id"
          :global-filter="filter" :global-filter-fields="['title', 'body']"
          :pagination="pagination" row-hover
          @row-click="({ data }) => openEdit(data)"
        >
          <template #title="{ row }">
            <span class="notes__title">
              <Icon v-if="row.pinned" name="Pin" :size="13" class="notes__pin" :aria-label="t('notes.pinned')" />
              {{ row.title }}
            </span>
          </template>
          <template #updatedAt="{ row }">
            <span class="muted">{{ relativeTime(row.updatedAt) }}</span>
          </template>
          <template #actions="{ row }">
            <span class="notes__actions" @click.stop>
              <UiButton intent="ghost" size="icon" :title="t('notes.edit', { title: row.title })" :aria-label="t('notes.edit', { title: row.title })" @click="openEdit(row)">
                <template #icon><Icon name="Pencil" :size="14" /></template>
              </UiButton>
              <UiButton intent="ghost" size="icon" :title="t('notes.delete.action', { title: row.title })" :aria-label="t('notes.delete.action', { title: row.title })" @click="remove(row)">
                <template #icon><Icon name="Trash" :size="14" /></template>
              </UiButton>
            </span>
          </template>
          <template #empty>
            <span class="muted">{{ t("notes.noMatch") }}</span>
          </template>
        </UiTable>
      </template>
      <!-- loading: the first load only; never "nothing here" while it runs -->
      <q-inner-loading :showing="firstLoad" :label="t('kit.common.loading')" />
    </div>

    <NoteDialog v-if="editing !== false" :note="editing" @saved="onSaved" @close="editing = false" />
  </q-page>
</template>
