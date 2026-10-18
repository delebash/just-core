<script setup>
// SPDX-License-Identifier: MIT
// A date field: the date shown in the app's language, picked from Quasar's calendar — QDate in a
// QPopupProxy on the field, Quasar's documented pattern (quasar.dev/vue-components/date, "With
// QInput"; quasar.dev/vue-components/popup-proxy). The calendar's own words follow the app's
// language through Quasar's language pack, as does Clear (`$q.lang.label.clear`, the word QInput's
// own clear button carries). The field itself is read-only: a click opens the calendar, a pick
// closes it.
//
// v-model is an ISO date ("2027-03-01"), "" when empty. A value that isn't an ISO date — words
// typed while the field was free text (JustWrite's Started and Deadline until 2026-10-15) — shows
// as it is until a date is picked.
import { QDate, QPopupProxy, useQuasar } from "quasar";
import { computed, ref } from "vue";
import { dateLabel, isIsoDate } from "../services/isoDate.js";
import UiButton from "./UiButton.vue";
import UiInput from "./UiInput.vue";

const props = defineProps({
  modelValue: { type: String, default: "" },
  placeholder: { type: String, default: "" },
  disabled: { type: Boolean, default: false },
});
const emit = defineEmits(["update:modelValue"]);
const $q = useQuasar();
const proxy = ref(null);

const shown = computed(() => dateLabel(props.modelValue));
// The calendar marks the stored date; free text marks nothing.
const picked = computed(() => (isIsoDate(props.modelValue) ? props.modelValue : null));

function set(value) {
  emit("update:modelValue", value || "");
  proxy.value?.hide();
}
</script>

<template>
  <div class="ui-date" :class="{ 'is-disabled': disabled }">
    <UiInput readonly :model-value="shown" :placeholder="placeholder" :disabled="disabled" />
    <QPopupProxy v-if="!disabled" ref="proxy" transition-show="scale" transition-hide="scale">
      <QDate :model-value="picked" mask="YYYY-MM-DD" minimal @update:model-value="set">
        <div v-if="modelValue" class="ui-date__actions">
          <UiButton intent="secondary" size="small" @click="set('')">{{ $q.lang.label.clear }}</UiButton>
        </div>
      </QDate>
    </QPopupProxy>
  </div>
</template>

<style scoped>
/* Sized to what it shows — the date, or the placeholder while empty (`field-sizing: content`, as
   PaneHeader's name box) — never wider than its row. */
.ui-date { display: inline-flex; width: fit-content; max-width: 100%; }
.ui-date :deep(.q-field__native) { field-sizing: content; width: auto; min-width: 8ch; }
.ui-date:not(.is-disabled) :deep(.q-field__native) { cursor: pointer; }
.ui-date__actions { display: flex; justify-content: flex-end; }
</style>
