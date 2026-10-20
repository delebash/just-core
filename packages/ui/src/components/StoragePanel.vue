<script setup>
// SPDX-License-Identifier: MIT
// Settings → Storage — the family's section (app-structure §11; JustWrite's Data location and Disk
// usage cards are the donor, through docgen's copy). The kit's since 2026-10-19 (the template
// audit: the template's and just-house-paint's copies were one file but for the app's own rows):
// where the data folder is and the desktop shell's "Change folder…" (it copies everything and
// restarts the app), then where the folder's space goes (the kit's /v1/disk/usage) with the two
// things that can be reclaimed — the downloaded models and the engine's logs.
//   - `shell`: the desktop shell's folder calls, from the app's native.js — { getRoot, pickDirectory,
//     relocate, oldCopies?, removeOldCopy?, forgetOldCopy?, useDefault? } — or null in a browser, where Change folder
//     isn't offered; a call the app doesn't pass leaves its part out;
//   - `saves`: what the app keeps, in its own words ("your notes"), inside the kit's sentences;
//   - the `extra` slot: the app's own rows in the disk grid (just-house-paint's houses, part finder
//     and AI photo), with { usage, size, busy, run } — `run(kind, fn)` marks the panel busy while
//     `fn` runs, then reads the sizes again.
// Since 2026-10-20 (just-house-paint's fifteenth review — Change folder's third round) a move never
// removes the old folder: the copy it left is shown here with its size and **Remove the old copy**
// (only what the move copied); **Move back to the default folder** while the data is elsewhere; and
// **Use the default folder from now on** while this start uses the default folder because the one
// the data was moved to can't be used. The move's question names the folder it makes and the apps
// sharing this app's AI models, and the window's access token goes with the data. While the app's
// data-dir variable names the folder (`setBy`), the moves are off and the panel says where the folder
// is set; an old copy used after its move says so before it is removed; a start running on an old copy
// (`oldCopyOf`) says the data is elsewhere.
// Since the eighteenth review an old copy is known by its move's id: one whose folder doesn't answer to it (a drive
// out, another stick in its place, deleted by hand) reads **Not found** — never removed, never dropped by the app —
// with **Forget…** to drop the record (nothing on any drive is touched); a folder the data is in that the start's
// check refuses is said in the shell's words (`problem`), and "restart the app to use it" only when it passes.
// Since the nineteenth review: a copy not found says why (`cause` — it didn't answer just now, with **Try again**; its
// folder isn't there; the folder there isn't this copy), the banner is one sentence naming the folder once, with the
// reason when there is one, and after Forget (or Remove) the focus goes to the next copy's button, else Change
// folder…, else the section's heading — Forget said through the kit's announcer (WAI-ARIA APG: the opener gone, a
// logical control takes the focus).
// Failures go through `reportError` (§15). The card frame is the host's (`card`, `hint`).
import { nextTick, onMounted, ref } from "vue";
import { useI18n } from "vue-i18n";
import UiBanner from "../common/components/UiBanner.vue";
import UiButton from "../common/components/UiButton.vue";
import { announce } from "../common/services/announce.js";
import { confirmDialog } from "../common/services/dialog.js";
import { fmtBytes } from "../common/services/downloadRate.js";
import { reportError } from "../common/services/reportError.js";
import { post, safeRequest } from "../common/services/serverApi.js";
import { pushToast } from "../common/services/toastBridge.js";
import { refresh as refreshRunnerModels } from "../composables/useRunnerModels.js";

const props = defineProps({
  // the server's own data folder (GET /v1/health's `dataDir`) — what a headless run shows
  dataDir: { type: String, default: "" },
  shell: { type: Object, default: null },
  saves: { type: String, default: "" },
});

const { t, locale } = useI18n();
const saves = () => props.saves || t("kit.storagePanel.savesDefault");

// { root, default, portable, atDefault?, folderName?, defaultThisStart?, setBy?, oldCopyOf? } — the desktop shell's
// answer
const storageRoot = ref(null);
const oldCopies = ref([]); // [{ root, bytes, movedAt?, changedAt?, connected? }] — the copies earlier moves left
const relocating = ref(false);
const removing = ref(""); // the old copy being removed
const diskUsage = ref(null);
const diskBusy = ref(""); // "models" | "spawn" | an extra row's kind | ""
const locationCard = ref(null); // the Data location section: where the focus goes after a row leaves

async function loadStorageRoot() {
  storageRoot.value = props.shell ? await props.shell.getRoot() : null;
}
async function loadOldCopies() {
  oldCopies.value = (props.shell?.oldCopies && (await props.shell.oldCopies().catch(() => null))) || [];
}

/** After the old copy at `index` left the list (Forget, Remove): the focus on the next copy's first button (the one in
 *  its place, else the last), else Change folder…, else the section's heading — never dropped on the page. */
async function focusAfterRow(index) {
  await nextTick();
  const card = locationCard.value;
  if (!card) return;
  const rows = [...card.querySelectorAll("[data-old-copy-row]")];
  const row = rows[Math.min(index, rows.length - 1)];
  const target = row?.querySelector("button:not([disabled])") || card.querySelector("[data-change-folder]:not([disabled])") || card.querySelector("h2");
  target?.focus();
}

/** Try again (a copy that didn't answer just now): looked at now, not after the minute. */
const trying = ref(false);
async function tryAgain() {
  trying.value = true;
  try {
    oldCopies.value = (await props.shell.oldCopies({ again: true })) || [];
  } catch (e) {
    reportError(e);
  } finally {
    trying.value = false;
  }
}
async function loadDiskUsage() {
  diskUsage.value = await safeRequest("/v1/disk/usage", null);
}
onMounted(() => Promise.all([loadStorageRoot(), loadOldCopies(), loadDiskUsage()]));

// While loading, an em-dash; a real 0 reads "0 MB" (fmtBytes gives "" for 0).
function diskSize(n) {
  if (diskUsage.value == null) return "—";
  return fmtBytes(n) || "0 MB";
}

/** An app's own row's action (the `extra` slot): busy while it runs, the sizes read again after. */
async function run(kind, fn) {
  diskBusy.value = kind;
  try {
    await fn();
  } catch (e) {
    reportError(e);
  } finally {
    diskBusy.value = "";
    await loadDiskUsage();
  }
}

// Path equality as the shell has it (case-insensitive on Windows, where a path has backslashes).
const pathKey = (p) => {
  const s = String(p || "").replace(/[\\/]+$/, "");
  return s.includes("\\") ? s.toLowerCase() : s;
};

/** Where a move to `picked` puts the data: the default folder itself, or the app's folder inside the one picked. */
function moveTarget(picked) {
  const info = storageRoot.value || {};
  if (info.default && pathKey(picked) === pathKey(info.default)) return info.default;
  if (!info.folderName) return picked; // an older shell: it names its own folder in its answer
  const sep = String(picked).includes("\\") ? "\\" : "/";
  return `${String(picked).replace(/[\\/]+$/, "")}${sep}${info.folderName}`;
}

/** The apps that use this app's AI models (the kit's registry: `sharedWith`): they keep using the old copy. */
function moveSharedNote() {
  const apps = diskUsage.value?.sharedWith || [];
  return apps.length ? t("kit.storagePanel.moveSharedWith", { apps: new Intl.ListFormat(locale.value, { type: "conjunction" }).format(apps) }) : "";
}

/** The move itself, once the folder is known: asked first, then the shell copies and restarts the app. */
async function moveTo(picked) {
  const yes = await confirmDialog({
    title: t("kit.storagePanel.moveTitle"),
    message: [t("kit.storagePanel.moveMessage", { saves: saves(), folder: moveTarget(picked) }), moveSharedNote()].filter(Boolean).join(" "),
    confirmLabel: t("kit.storagePanel.moveConfirm"),
  });
  if (!yes) return;
  relocating.value = true;
  try {
    // (the shell carries the window's access token itself — this folder's browser profile keeps it)
    await props.shell.relocate(picked);
    window.location.reload();
  } catch (e) {
    reportError(e);
    relocating.value = false;
  }
}

async function changeFolder() {
  const picked = await props.shell.pickDirectory({ title: t("kit.storagePanel.chooseFolder"), defaultPath: storageRoot.value?.root || "" });
  if (!picked) return;
  await moveTo(picked);
}

function moveBack() {
  return moveTo(storageRoot.value.default);
}

/** A time in the app's language (Intl given the i18n locale — app-structure §Q.11). */
const when = (ms) => new Intl.DateTimeFormat(locale.value, { dateStyle: "medium", timeStyle: "short" }).format(ms);

/** An old copy the app ran on after its move (its work would go with it): said beside its button and in the question. */
const usedNote = (copy) => (copy.changedAt ? t("kit.storagePanel.oldCopyUsed", { date: when(copy.changedAt) }) : "");

/** The apps that use this app's AI models (`sharedWith`): an old copy's models may be theirs still. */
function removeSharedNote() {
  const apps = diskUsage.value?.sharedWith || [];
  return apps.length ? t("kit.storagePanel.removeOldSharedWith", { apps: new Intl.ListFormat(locale.value, { type: "conjunction" }).format(apps) }) : "";
}

async function removeOldCopy(copy) {
  const yes = await confirmDialog({
    title: t("kit.storagePanel.removeOldTitle"),
    message: [t("kit.storagePanel.removeOldMessage", { folder: copy.root, size: fmtBytes(copy.bytes) || "0 MB", current: storageRoot.value?.root || "" }), usedNote(copy), removeSharedNote()]
      .filter(Boolean)
      .join(" "),
    confirmLabel: t("kit.storagePanel.removeOldConfirm"),
    danger: true,
  });
  if (!yes) return;
  const index = oldCopies.value.indexOf(copy);
  removing.value = copy.root;
  try {
    oldCopies.value = (await props.shell.removeOldCopy(copy.root)) || [];
  } catch (e) {
    reportError(e);
    await loadOldCopies();
  } finally {
    removing.value = "";
  }
  if (!oldCopies.value.some((c) => c.root === copy.root)) await focusAfterRow(index);
}

/** An old copy whose folder doesn't answer to its move (`connected: false`): Not found, and Forget offered. */
async function forgetOldCopy(copy) {
  const yes = await confirmDialog({
    title: t("kit.storagePanel.forgetOldTitle"),
    message: t("kit.storagePanel.forgetOldMessage", { folder: copy.root }),
    confirmLabel: t("kit.storagePanel.forgetOldConfirm"),
  });
  if (!yes) return;
  const index = oldCopies.value.indexOf(copy);
  removing.value = copy.root;
  try {
    oldCopies.value = (await props.shell.forgetOldCopy(copy.root)) || [];
  } catch (e) {
    reportError(e);
    await loadOldCopies();
    return;
  } finally {
    removing.value = "";
  }
  await focusAfterRow(index);
  announce(t("kit.storagePanel.forgotten"));
}

/** A copy not found: what it shows (`cause` from the shell — an older shell gives none) and what it says. */
const notFoundLabel = (copy) => (copy.cause === "slow" ? t("kit.storagePanel.noAnswerNow") : t("kit.storagePanel.notFound"));
function notFoundNote(copy) {
  if (copy.cause === "slow") return t("kit.storagePanel.noAnswerNote");
  if (copy.cause === "absent") return t("kit.storagePanel.notThereNote");
  if (copy.cause === "other") return t("kit.storagePanel.notThisCopyNote");
  return t("kit.storagePanel.notFoundNote");
}

/** Where the data is when this start runs elsewhere — the default folder this time, or an old copy — or "". */
const elsewhere = () => storageRoot.value?.defaultThisStart?.folder || storageRoot.value?.oldCopyOf?.root || "";
/** The banner, one sentence naming the folder once (the nineteenth review's screens: it named it three times, five
 *  lines at 960): this start's place — the default folder this time, or an old copy —, where the data is, and the
 *  reason when there is one with what to do (the seventeenth review: the variable names this old copy — change it; the
 *  data's folder passes the start's check now — restart; else why it can't be used — the shell's words, the
 *  eighteenth review — or that it isn't there; with no variable, forget it from now on). */
function elsewhereWords() {
  const info = storageRoot.value || {};
  const folder = elsewhere();
  const where = info.defaultThisStart || info.oldCopyOf;
  const problem = String(where?.problem || "").replace(/[.\s]+$/, "");
  const v = !!info.setBy;
  if (info.defaultThisStart) {
    if (where.connected) return t("kit.storagePanel.defaultReady", { folder });
    if (problem) return v ? t("kit.storagePanel.defaultProblemVariable", { folder, problem }) : t("kit.storagePanel.defaultProblem", { folder, problem });
    return v ? t("kit.storagePanel.defaultMissingVariable", { folder }) : t("kit.storagePanel.defaultMissing", { folder });
  }
  if (v) return t("kit.storagePanel.oldVariable", { name: info.setBy, folder });
  if (where?.connected) return t("kit.storagePanel.oldReady", { folder });
  if (problem) return t("kit.storagePanel.oldProblem", { folder, problem });
  return t("kit.storagePanel.oldMissing", { folder });
}
/** The default folder still holds an old copy: Move back is refused there until it is removed. */
const defaultHoldsOldCopy = () => oldCopies.value.some((c) => storageRoot.value?.default && pathKey(c.root) === pathKey(storageRoot.value.default));

async function useDefaultFromNowOn() {
  const info = storageRoot.value;
  const yes = await confirmDialog({
    title: t("kit.storagePanel.useDefaultTitle"),
    message: t("kit.storagePanel.useDefaultMessage", { folder: elsewhere(), default: info.root }),
    confirmLabel: t("kit.storagePanel.useDefaultConfirm"),
  });
  if (!yes) return;
  try {
    await props.shell.useDefault();
    await loadStorageRoot();
  } catch (e) {
    reportError(e);
  }
}

/** A cache shared with the family's other apps: clearing it clears theirs too — named when the kit's
 *  registry knows them (`sharedWith`; the cache's owner sees them too), else said plainly (`cacheShared`). */
function sharedNote() {
  const apps = diskUsage.value?.sharedWith || [];
  if (apps.length) return t("kit.storagePanel.clearModelsSharedWith", { apps: new Intl.ListFormat(locale.value, { type: "conjunction" }).format(apps) });
  return diskUsage.value?.cacheShared ? t("kit.storagePanel.clearModelsShared") : "";
}

async function clearModelsCache() {
  const size = fmtBytes(diskUsage.value?.modelsCache) || "0 MB";
  const yes = await confirmDialog({
    title: t("kit.storagePanel.clearModelsTitle"),
    message: [t("kit.storagePanel.clearModelsMessage", { size }), sharedNote()].filter(Boolean).join(" "),
    confirmLabel: t("kit.storagePanel.clearModelsConfirm"),
    danger: true,
  });
  if (!yes) return;
  await run("models", async () => {
    const res = await post("/v1/llm-runner/models-cache/clear");
    if (res?.ok === false) {
      const loaded = res.detail === "unload models first";
      pushToast({ kind: "error", title: loaded ? t("kit.storagePanel.unloadFirst") : t("kit.storagePanel.clearModelsFailed"), description: loaded ? undefined : res.detail });
    }
  });
  // the AI page's catalog re-reads which models are on disk (they now download again)
  refreshRunnerModels();
}

function clearSpawnLogs() {
  return run("spawn", () => post("/v1/llm-runner/spawn-logs/clear"));
}
</script>

<template>
  <section ref="locationCard" class="card">
    <h2 tabindex="-1">{{ t("kit.storagePanel.locationTitle") }}</h2>
    <p class="hint">{{ t("kit.storagePanel.locationHint", { saves: saves() }) }}</p>
    <!-- this start runs elsewhere than the data (the default folder this time, or an old copy): said, and no move from
         here — it would leave the data known nowhere (the sixteenth review) -->
    <UiBanner v-if="elsewhere()" intent="warning" class="lu-storage__banner">
      {{ elsewhereWords() }}
      <template v-if="shell?.useDefault && !storageRoot.setBy" #action>
        <UiButton intent="secondary" size="small" :label="t('kit.storagePanel.useDefault')" @click="useDefaultFromNowOn" />
      </template>
    </UiBanner>
    <table class="ui-formgrid">
      <tbody>
        <tr>
          <th>{{ t("kit.storagePanel.folder") }}</th>
          <td class="lu-storage__mono">{{ storageRoot?.root || dataDir || "—" }}</td>
        </tr>
        <tr v-if="storageRoot">
          <th>{{ t("kit.storagePanel.type") }}</th>
          <td>{{ storageRoot.portable ? t("kit.storagePanel.portable") : t("kit.storagePanel.userFolder") }}</td>
        </tr>
        <tr v-for="copy in oldCopies" :key="copy.root" data-old-copy-row>
          <th>{{ t("kit.storagePanel.oldCopy") }}</th>
          <td>
            <div class="lu-storage__row">
              <span class="lu-storage__mono">{{ copy.root }}</span>
              <span>{{ copy.connected === false ? notFoundLabel(copy) : fmtBytes(copy.bytes) || "0 MB" }}</span>
              <!-- it didn't answer just now: Try again before Forget (the nineteenth review) -->
              <UiButton
                v-if="copy.connected === false && copy.cause === 'slow' && shell?.oldCopies"
                intent="secondary"
                size="small"
                :disabled="!!removing || relocating || trying"
                :label="t('kit.storagePanel.tryAgain')"
                @click="tryAgain"
              />
              <UiButton
                v-if="copy.connected === false && shell?.forgetOldCopy"
                intent="secondary"
                size="small"
                :disabled="!!removing || relocating"
                :label="t('kit.storagePanel.forgetOld')"
                @click="forgetOldCopy(copy)"
              />
              <UiButton
                v-else
                intent="danger-outline"
                size="small"
                :disabled="!!removing || relocating || copy.connected === false"
                :label="removing === copy.root ? t('kit.storagePanel.removing') : t('kit.storagePanel.removeOld')"
                @click="removeOldCopy(copy)"
              />
            </div>
            <p v-if="copy.connected === false && shell?.forgetOldCopy" class="lu-storage__used">{{ notFoundNote(copy) }}</p>
            <p v-else-if="copy.changedAt" class="lu-storage__used">{{ usedNote(copy) }}</p>
          </td>
        </tr>
      </tbody>
    </table>
    <template v-if="storageRoot">
      <!-- no move while the data is elsewhere (said in the banner above), nor while the data-dir variable names the
           folder (a Change-folder pointer would be ignored at the next start) -->
      <p v-if="!elsewhere() && storageRoot.setBy" class="hint card__note">{{ t("kit.storagePanel.setByVariable", { name: storageRoot.setBy }) }}</p>
      <div v-else-if="!elsewhere()" class="card__actions">
        <UiButton
          intent="secondary"
          data-change-folder
          :disabled="relocating || !!removing"
          :label="relocating ? t('kit.storagePanel.moving') : t('kit.storagePanel.changeFolder')"
          @click="changeFolder"
        />
        <UiButton
          v-if="storageRoot.default && storageRoot.atDefault === false && !defaultHoldsOldCopy()"
          intent="secondary"
          :disabled="relocating || !!removing"
          :label="t('kit.storagePanel.moveBack')"
          @click="moveBack"
        />
      </div>
      <!-- Move back would be refused while the default folder holds the old copy: said instead of offered -->
      <p v-if="!elsewhere() && !storageRoot.setBy && storageRoot.atDefault === false && defaultHoldsOldCopy()" class="hint card__note">
        {{ t("kit.storagePanel.moveBackAfterRemove") }}
      </p>
    </template>
    <p v-else class="hint card__note">{{ t("kit.storagePanel.desktopOnly") }}</p>
  </section>

  <section class="card">
    <h2>{{ t("kit.storagePanel.diskTitle") }}</h2>
    <p class="hint">{{ t("kit.storagePanel.diskHint", { saves: saves() }) }}</p>
    <div class="lu-storage__grid">
      <span class="lu-storage__label">{{ t("kit.storagePanel.modelsCache") }}</span>
      <div class="lu-storage__row">
        <span>{{ diskSize(diskUsage?.modelsCache) }}</span>
        <UiButton intent="secondary" size="small" :disabled="!!diskBusy" :label="diskBusy === 'models' ? t('kit.storagePanel.clearing') : t('kit.storage.clearShort')" @click="clearModelsCache" />
      </div>
      <span class="lu-storage__label">{{ t("kit.storagePanel.spawnLogs") }}</span>
      <div class="lu-storage__row">
        <span>{{ diskSize(diskUsage?.spawnLogs) }}</span>
        <UiButton intent="secondary" size="small" :disabled="!!diskBusy" :label="diskBusy === 'spawn' ? t('kit.storagePanel.clearing') : t('kit.storage.clearShort')" @click="clearSpawnLogs" />
      </div>
      <span class="lu-storage__label">{{ t("kit.storagePanel.engineBuilds") }}</span><span>{{ diskSize(diskUsage?.engineBuilds) }}</span>
      <!-- the app's own stores (the server's extra disk buckets) -->
      <slot name="extra" :usage="diskUsage" :size="diskSize" :busy="diskBusy" :run="run" />
      <span class="lu-storage__label">{{ t("kit.storagePanel.database") }}</span><span>{{ diskSize(diskUsage?.database) }}</span>
      <span class="lu-storage__label">{{ t("kit.storage.serverLogs") }}</span><span>{{ diskSize(diskUsage?.appLogs) }}</span>
      <span class="lu-storage__label"><b>{{ t("kit.storage.total") }}</b></span><span><b>{{ diskSize(diskUsage?.total) }}</b></span>
      <span class="lu-storage__label">{{ t("kit.storage.freeSpace") }}</span><span>{{ diskSize(diskUsage?.diskFree) }}</span>
    </div>
  </section>
</template>

<style scoped>
.lu-storage__mono { font-family: var(--font-mono, ui-monospace, monospace); font-size: var(--fs-small, 12.5px); overflow-wrap: anywhere; }
.lu-storage__banner { margin-block-end: var(--sp-2, 8px); max-inline-size: var(--w-prose, 60ch); }
/* an old copy used after its move: said in the warning's ink, its lines at most 30em (~70 characters
   at the small size; it ran 104 — the seventeenth review, 2026-10-20) */
.lu-storage__used { margin: var(--sp-1, 4px) 0 0; max-inline-size: 30em; color: var(--warn-ink, var(--muted)); font-size: var(--fs-small, 12.5px); }
/* the disk-usage grid: a label column and a value/action column (JustWrite's) */
.lu-storage__grid {
  display: grid; grid-template-columns: 150px auto; justify-content: start; align-items: center;
  gap: var(--sp-2, 8px) 14px; font-size: var(--fs-small, 12.5px);
}
.lu-storage__grid :slotted(.lu-storage__label), .lu-storage__label { color: var(--muted); }
.lu-storage__grid :slotted(.lu-storage__row), .lu-storage__row { display: flex; align-items: center; gap: var(--sp-2, 8px); flex-wrap: wrap; }
</style>
