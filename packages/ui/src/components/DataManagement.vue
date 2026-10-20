<script setup>
// SPDX-License-Identifier: MIT
// Shared Data & Storage controls — backup / restore / reset over the host's
// SQLite DB via the shared /v1/data/* router (llm_runner.platform.make_data_router).
// Identical in every same-stack app; the host only passes its appName for the
// download filename + copy.
import { computed, onMounted, reactive, ref } from "vue";
import { useI18n } from "vue-i18n";
import { request, postForm } from "../client.js";
import UiButton from "../common/components/UiButton.vue";
import UiCheckbox from "../common/components/UiCheckbox.vue";
import { confirmDialog, promptDialog } from "../common/services/dialog.js";
import { saveUrlAs } from "../common/services/fileSave.js";
import { pushToast } from "../common/services/toastBridge.js";

const { t, locale } = useI18n();
// A restore's message for after the reload it starts (a toast now would go with the page): kept in this tab's
// sessionStorage, shown when the panel mounts again — a per-tab convenience; without storage it shows at once.
const PENDING = "kit.dataManagement.afterRestore";
onMounted(() => {
  let pending = null;
  try {
    pending = JSON.parse(sessionStorage.getItem(PENDING) || "null");
    sessionStorage.removeItem(PENDING);
  } catch {
    pending = null;
  }
  if (pending?.message) pushToast({ message: String(pending.message), kind: "warning", duration: 15000 });
});
// The word the reset prompt asks for — the same in every language, since the code compares it.
const RESET_WORD = "RESET";

const props = defineProps({
  appName: { type: String, default: "" },
  // a setting's key → its name on the screen (the restore names the settings it set back to their defaults; an app
  // without one shows the keys)
  settingLabel: { type: Function, default: null },
  // NOTE: the old `save-file` prop was REMOVED 2026-08-15. Where a backup lands
  // is decided by `common/services/fileSave.js` — the host wires its native
  // saver once with configureFileSave() and every export inherits it. Passing it
  // per-surface is what let JustWrite have a Save-As dialog here while
  // JustVoice and docgen silently dropped the file into Downloads.
  // Per-app backup OPTIONS (family parity batch 2026-08-05 — decision ①: the
  // mechanism is shared, the option is the app's). Each entry renders a checkbox
  // on the backup row: { id, label, sub?, excludes: [asset-dir arcnames],
  // default?: true }. Unchecked → its `excludes` ride the backup request as
  // ?exclude=<arcnames>, and the shared /v1/data/backup skips those dirs (JV's
  // "include generated audio" — 50 GB of takes is a real reason to leave it
  // out). Apps that pass nothing look exactly as before.
  options: { type: Array, default: () => [] },
});
const app = computed(() => props.appName || t("kit.dataManagement.defaultApp"));
// "Reset Just House Paint": an app's name as it is written; only the generic word is lowercased
// mid-heading ("Reset workspace") — the name was lowercased too (the visual review, 2026-10-20)
const resetName = computed(() => props.appName || t("kit.dataManagement.defaultApp").toLowerCase());
const busy = ref("");
// The options' live checked-state, seeded from each entry's default (on unless
// the app says otherwise).
const optState = reactive(Object.fromEntries(
  (props.options || []).map((o) => [o.id, o.default !== false]),
));
function backupQuery() {
  const skip = (props.options || [])
    .filter((o) => !optState[o.id])
    .flatMap((o) => o.excludes || []);
  return skip.length ? `?exclude=${encodeURIComponent([...new Set(skip)].join(","))}` : "";
}

function stamp() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

async function exportBackup() {
  busy.value = "backup";
  try {
    const filename = `${app.value.toLowerCase().replace(/\s+/g, "-")}-backup-${stamp()}.zip`;
    // THE one save door (2026-08-15) — native dialog where the host wired one,
    // Downloads otherwise. The `save-file` PROP is gone: a host wires its saver
    // ONCE via configureFileSave and every export in the app inherits it, rather
    // than each surface remembering to pass a prop. JustWrite passed it here and
    // JustVoice + docgen did not, which is exactly how one act ended up with two
    // behaviours across the family.
    // streamed by the shell straight to the chosen file where it can (gigabytes of photos the window
    // never holds — 2026-10-20), fetched and downloaded otherwise
    const res = await saveUrlAs(`/v1/data/backup${backupQuery()}`, filename, {
      title: t("kit.dataManagement.saveTitle", { app: app.value }),
      filterName: t("kit.dataManagement.filterName", { app: app.value }),
      filterExt: "zip",
    });
    if (res.cancelled) return;
    pushToast({
      message: res.downloaded ? t("kit.dataManagement.downloaded") : t("kit.dataManagement.saved"),
      kind: "success",
    });
  } catch (e) {
    pushToast({ message: t("kit.dataManagement.err.backup", { error: e.message }), kind: "error" });
  } finally {
    busy.value = "";
  }
}

async function onImport(e) {
  const file = e.target.files?.[0];
  e.target.value = "";
  if (!file) return;
  const ok = await confirmDialog({
    title: t("kit.dataManagement.restore.title"),
    message: t("kit.dataManagement.restore.body"),
    confirmLabel: t("kit.dataManagement.restore.confirm"),
    danger: true,
  });
  if (!ok) return;
  busy.value = "restore";
  try {
    const fd = new FormData();
    fd.append("file", file);
    const answer = await postForm("/v1/data/restore", fd);
    pushToast({ message: t("kit.dataManagement.restore.done"), kind: "success" });
    // an older version's settings that don't fit this one were set back to their defaults (the server names them —
    // just-house-paint's `resetSettings`, the nineteenth review): said after the reload
    const reset = Array.isArray(answer?.resetSettings) ? answer.resetSettings.map((k) => props.settingLabel?.(String(k)) || String(k)) : [];
    if (reset.length) {
      const message = t("kit.dataManagement.restore.settingsReset", { keys: new Intl.ListFormat(locale.value, { type: "conjunction" }).format(reset) });
      try {
        sessionStorage.setItem(PENDING, JSON.stringify({ message }));
      } catch {
        pushToast({ message, kind: "warning", duration: 15000 });
      }
    }
    setTimeout(() => window.location.reload(), 700);
  } catch (err) {
    // A synced app refuses a backup from another sync library while it syncs (the sync package's
    // restore hooks: 409, `error: "restore-other-library"`) — its own words, not "Restore failed".
    const otherLibrary = err.problem?.error === "restore-other-library";
    const message = otherLibrary ? t("kit.dataManagement.err.otherLibrary") : t("kit.dataManagement.err.restore", { error: err.message });
    pushToast({ message, kind: "error" });
    busy.value = "";
  }
}

// What Reset wipes is the prompt's message; its field is labelled with the word to type, and Reset
// stays off until the word is typed (requireMatch) — the 35-word sentence was the field's label (the
// sixteenth review, 2026-10-20).
async function reset() {
  const typed = await promptDialog({
    title: t("kit.dataManagement.reset.title", { app: app.value }),
    message: t("kit.dataManagement.reset.message"),
    label: t("kit.dataManagement.reset.typeToConfirm", { word: RESET_WORD }),
    requireMatch: RESET_WORD, // in any case, spaces around it aside (AppDialog)
    width: "token", // five letters, not the dialog's width (the seventeenth review)
    confirmLabel: t("kit.common.reset"),
    danger: true,
  });
  if (String(typed ?? "").trim().toLocaleLowerCase() !== RESET_WORD.toLocaleLowerCase()) {
    if (typed != null) pushToast({ message: t("kit.dataManagement.reset.mismatch") });
    return;
  }
  busy.value = "reset";
  try {
    await request("/v1/data/reset", { method: "POST" });
    pushToast({ message: t("kit.dataManagement.reset.done"), kind: "success" });
    setTimeout(() => window.location.reload(), 700);
  } catch (e) {
    pushToast({ message: t("kit.dataManagement.err.reset", { error: e.message }), kind: "error" });
    busy.value = "";
  }
}
</script>

<template>
  <div class="lu-data">
    <div class="lu-data-row">
      <div class="lu-data-info">
        <b>{{ t('kit.dataManagement.title') }}</b>
        <span class="lu-muted">{{ t('kit.dataManagement.hint') }}</span>
        <!-- The app's per-backup choices (the options seam). A backup made with a
             box unchecked simply leaves that content out; restoring such a backup
             leaves the live copy of that content untouched. -->
        <label v-for="o in options" :key="o.id" class="lu-data-opt">
          <UiCheckbox v-model="optState[o.id]" /><span>{{ o.label }}<span v-if="o.sub" class="lu-muted"> — {{ o.sub }}</span></span>
        </label>
      </div>
      <div class="lu-data-actions">
        <UiButton intent="primary" size="small" :loading="busy === 'backup'" @click="exportBackup">{{ t('kit.dataManagement.export') }}</UiButton>
        <UiButton as="label" intent="secondary" size="small">
          {{ t('kit.dataManagement.import') }}
          <input type="file" accept=".zip,application/zip" style="display:none" @change="onImport" />
        </UiButton>
      </div>
    </div>
    <div class="lu-data-row lu-data-danger">
      <div class="lu-data-info">
        <b>{{ t('kit.dataManagement.reset.heading', { app: resetName }) }}</b>
        <span class="lu-muted">{{ t('kit.dataManagement.reset.hint') }}</span>
      </div>
      <div class="lu-data-actions">
        <UiButton intent="danger" size="small" :loading="busy === 'reset'" @click="reset">{{ t('kit.dataManagement.reset.button') }}</UiButton>
      </div>
    </div>
  </div>
</template>

<style scoped>
.lu-data { display: flex; flex-direction: column; gap: 12px; }
.lu-data-row { display: flex; align-items: flex-start; gap: 16px; border: 1px solid var(--border); border-radius: 10px; padding: 14px 16px; background: var(--surface); }
.lu-data-info { display: flex; flex-direction: column; gap: 4px; flex: 1; min-width: 0; }
.lu-data-opt { display: flex; align-items: center; gap: 7px; font-size: 12px; margin-top: 4px; }
.lu-data-info b { font-size: 13.5px; color: var(--ink); }
/* a hint's lines at most 30em (~70 characters at its size; they ran 106 and 133 — the seventeenth
   review, 2026-10-20) */
.lu-data-info .lu-muted { font-size: 12px; line-height: 1.5; max-width: 30em; }
.lu-data-actions { display: flex; gap: 8px; align-items: center; flex: none; }
.lu-data-danger { border-color: var(--danger-line, var(--danger)); }
</style>
