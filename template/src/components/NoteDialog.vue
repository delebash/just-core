<script setup>
// SPDX-License-Identifier: MIT
// The note editor — the reference form of app-structure §15 and §17:
//   - the kit's AppModal (Quasar's QDialog) around Quasar's QForm with the kit's inputs;
//   - the rules are the ROUTE'S OWN SCHEMA: `schemaRules(NoteIn)`, NoteIn imported from the server
//     package (`family-template-server/schemas/notes.js`) — the limits live in one place, worded
//     from the kit's catalog in the app's language, checked on blur (lazy-rules) and on submit;
//   - what only the server can know comes back as a 422: `fieldErrors(err)` puts each message
//     under its field; any other failure goes through `reportError` — one way to show a failure;
//   - Save is the one primary button, on the right, Cancel beside it; Save is disabled while the
//     save runs; the form never rewrites what the user typed;
//   - "Suggest a title" runs the app's AI feature through the kit's runner (runAiFeature — app code
//     never owns a task's lifecycle, §8): the task strip shows it, the button is disabled while it
//     runs.
import { AppModal, fieldErrors, Icon, reportError, runAiFeature, schemaRules, UiButton, UiField, UiInput, UiTextarea, UiToggle } from "@delebash/ui";
import { NoteIn } from "family-template-server/schemas/notes.js";
import { computed, reactive, ref } from "vue";
import { useI18n } from "vue-i18n";
import { useNotesStore } from "../stores/notes.js";

const props = defineProps({
  // the note to edit; null for a new one
  note: { type: Object, default: null },
});
const emit = defineEmits(["close", "saved"]);

const { t } = useI18n();
const notes = useNotesStore();

const FIELDS = ["title", "body", "pinned"];
const rules = schemaRules(NoteIn);
const draft = reactive({
  title: props.note?.title ?? "",
  body: props.note?.body ?? "",
  pinned: props.note?.pinned ?? false,
});
const serverErrors = ref({});
const saving = ref(false);
const suggesting = ref(false);
const modal = ref(null);

const isNew = computed(() => !props.note);

/** A field's message from the server's 422, until the user changes the field. */
function edited(field) {
  if (serverErrors.value[field]) serverErrors.value = { ...serverErrors.value, [field]: undefined };
}

async function save() {
  saving.value = true;
  serverErrors.value = {};
  try {
    const input = { title: draft.title, body: draft.body, pinned: draft.pinned };
    const saved = isNew.value ? await notes.create(input) : await notes.update(props.note.id, input);
    emit("saved", saved, { created: isNew.value });
    modal.value?.close();
  } catch (e) {
    const fields = fieldErrors(e);
    const mine = Object.fromEntries(Object.entries(fields).filter(([k]) => FIELDS.includes(k)));
    serverErrors.value = mine;
    // a failure no field of this form can show — a refusal, a server fault, no connection
    if (!Object.keys(mine).length || Object.keys(fields).length > Object.keys(mine).length) reportError(e);
  } finally {
    saving.value = false;
  }
}

/** The model's answer as a title: its first line, without the quotes or the final full stop a
 *  model adds. The user sees it in the field and can change it before saving. */
function asTitle(content) {
  const line = String(content || "")
    .split(/\r?\n/)
    .map((s) => s.trim())
    .find(Boolean);
  return (line || "").replace(/^["'“”‘’«»]+|["'“”‘’«»]+$/g, "").replace(/[.。]+$/, "").trim();
}

async function suggestTitle() {
  suggesting.value = true;
  try {
    const { content } = await runAiFeature({
      action: "notes.suggestTitle",
      variables: { body: draft.body },
      task: { label: t("notes.suggest.task") },
    });
    const title = asTitle(content);
    if (title) {
      draft.title = title;
      edited("title");
    }
  } catch (e) {
    // the AI tasks panel keeps the failed run with its Retry; this dialog is modal, so say it here too
    reportError(e);
  } finally {
    suggesting.value = false;
  }
}
</script>

<template>
  <AppModal
    ref="modal"
    :title="isNew ? t('notes.form.newTitle') : t('notes.form.editTitle')"
    max-width="720px"
    @close="emit('close')"
  >
    <q-form class="form" greedy @submit="save">
      <UiField :label="t('notes.form.title')" layout="block" for="note-title">
        <div class="form__inline">
          <UiInput
            id="note-title" v-model="draft.title" width="prose" autofocus lazy-rules
            :rules="rules.title" :error="!!serverErrors.title" :error-message="serverErrors.title"
            @update:model-value="edited('title')"
          />
          <UiButton
            intent="secondary" :disabled="suggesting || !draft.body.trim()"
            :title="draft.body.trim() ? t('notes.suggest.hint') : t('notes.suggest.needsBody')"
            @click="suggestTitle"
          >
            <template #icon><Icon name="Sparkle" :size="14" /></template>
            {{ t("notes.suggest.button") }}
          </UiButton>
        </div>
      </UiField>
      <UiField :label="t('notes.form.body')" layout="block" for="note-body">
        <UiTextarea
          id="note-body" v-model="draft.body" width="prose" :rows="8" lazy-rules
          :rules="rules.body" :error="!!serverErrors.body" :error-message="serverErrors.body"
          @update:model-value="edited('body')"
        />
      </UiField>
      <label class="toggle-row">
        <UiToggle v-model="draft.pinned" :aria-label="t('notes.form.pinned')" @update:model-value="edited('pinned')" />
        <span>{{ t("notes.form.pinned") }}</span>
      </label>
      <div class="form__actions">
        <UiButton intent="ghost" :label="t('kit.common.cancel')" @click="modal?.close()" />
        <UiButton type="submit" intent="primary" :disabled="saving" :label="saving ? t('kit.common.saving') : t('kit.common.save')" />
      </div>
    </q-form>
  </AppModal>
</template>
