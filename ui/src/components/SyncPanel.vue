<script setup>
// SPDX-License-Identifier: MIT
// Settings → Sync — the family's sync screen over an app server's /v1/sync/* routes (the sync
// product `@delebash/sqlite-sync`; JustWrite's server/src/sync.js is the first host). One screen
// for every same-stack app: the app passes its words for what a "unit" is (a book), the units
// themselves, its file extension and — on the desktop — a folder picker.
//
// What it does (the design: the kit's docs/plans/2026-10-08-sync-product-design.md §2, §5):
//   - the status — when this device last synced, and with which device; Sync now;
//   - this device's name and how often it syncs on its own;
//   - "Let my other devices connect" and the pairing code (a QR code plus copyable text: the
//     library, its key, a token, this server's addresses), and pairing with another device's code;
//   - the cloud folder (Dropbox, OneDrive, …) the desktop's sync client keeps in step;
//   - by hand: export the units changed since the last export, import a file (merges);
//   - the devices this one has synced with.
//
// NOT in the package barrel (index.js): it needs `qrcode` (an optional peer, MIT), which only
// apps with sync install — the barrel is loaded by every app, and a bare import its build can't
// resolve breaks it. An app with sync imports it by path:
//   import SyncPanel from "@delebash/llm-ui/components/SyncPanel.vue";
import { computed, onBeforeUnmount, onMounted, reactive, ref } from "vue";
import { useI18n } from "vue-i18n";
import QRCode from "qrcode";
import { llmUiUrl, request } from "../client.js";
import UiButton from "../common/components/UiButton.vue";
import UiCheckbox from "../common/components/UiCheckbox.vue";
import UiInput from "../common/components/UiInput.vue";
import UiNumber from "../common/components/UiNumber.vue";
import UiTextarea from "../common/components/UiTextarea.vue";
import UiToggle from "../common/components/UiToggle.vue";
import { confirmDialog } from "../common/services/dialog.js";
import { saveBlob } from "../common/services/fileSave.js";
import { pushToast } from "../common/services/toastBridge.js";
import { serverFetch } from "../common/services/transport.js";

const props = defineProps({
  // The app's name and its unit nouns, in the app's language (JustWrite: "book" / "books");
  // the kit's own words stand in when an app passes none.
  appName: { type: String, default: "" },
  // What one unit of sync is called, and its plural ("book" / "books").
  unitNoun: { type: Object, default: null },
  // The app's units, for the export picker: [{ id, title, updatedAt }] — updatedAt (ISO) ticks
  // the ones changed since the last export.
  units: { type: Array, default: () => [] },
  // The by-hand file's extension, without the dot.
  fileExtension: { type: String, default: "sync" },
  // The desktop's folder picker: () => Promise<string|null>. Without one (a browser), the folder
  // is typed.
  pickFolder: { type: Function, default: null },
  // The phone's camera: () => Promise<string|null> — a pairing code read from a QR code. Without
  // one, the code is pasted.
  scanCode: { type: Function, default: null },
  // Can other devices reach this one? A computer can (it runs a server); the phone can't (it
  // connects to a computer), so it has no "Let my other devices connect" and no code of its own.
  reachable: { type: Boolean, default: true },
  // Is there a cloud folder here? On a computer, a folder the desktop's sync app keeps in step; the
  // phone has none until it can sign in to OneDrive or Dropbox.
  cloudFolder: { type: Boolean, default: true },
});

const status = ref(null);
const loadError = ref("");
const busy = ref("");
const nameDraft = ref("");
const minutesDraft = ref(5);
const folderDraft = ref("");
const folderNote = ref("");
const pairing = ref(null); // { text, qr }
const joinCode = ref("");
const encrypt = ref(false);
const picked = reactive({});

const settings = computed(() => status.value?.settings ?? {});
const latest = computed(() => (status.value?.peers ?? []).find((p) => p.lastSync) ?? null);
const canSyncNow = computed(() => !!settings.value.folder || (settings.value.peers ?? []).length > 0);
const pickedIds = computed(() => props.units.filter((u) => picked[u.id]).map((u) => u.id));

const { t, d } = useI18n();
const app = computed(() => props.appName || t("kit.sync.theApp"));
const noun = computed(() => props.unitNoun || { one: t("kit.sync.item"), many: t("kit.sync.items") });

function ago(iso) {
  const ts = Date.parse(iso);
  if (!Number.isFinite(ts)) return "";
  const s = Math.max(0, Math.round((Date.now() - ts) / 1000));
  if (s < 60) return t("kit.sync.ago.justNow");
  const m = Math.round(s / 60);
  if (m < 60) return t("kit.sync.ago.min", { n: m });
  const h = Math.round(m / 60);
  if (h < 24) return t("kit.sync.ago.h", { n: h });
  return d(new Date(ts));
}

const KINDS = new Set(["file", "folder", "http"]);
const kindLabel = (kind) => (KINDS.has(kind) ? t(`kit.sync.kind.${kind}`) : kind || "");

async function load() {
  try {
    status.value = await request("/v1/sync/status");
    loadError.value = "";
    const s = status.value.settings;
    if (!nameDraft.value) nameDraft.value = s.deviceName || status.value.deviceName || "";
    minutesDraft.value = s.autoMinutes;
    folderDraft.value = s.folder || "";
    // the export picker: the units changed since the last export, or all of them before the first
    const since = Date.parse(s.lastExport ?? "");
    for (const u of props.units) {
      if (!(u.id in picked)) picked[u.id] = !Number.isFinite(since) || !u.updatedAt || Date.parse(u.updatedAt) > since;
    }
  } catch (e) {
    loadError.value = e.message;
  }
}

async function run(what, fn) {
  busy.value = what;
  try {
    return await fn();
  } catch (e) {
    pushToast({ message: e.message, kind: "error" });
    return undefined;
  } finally {
    busy.value = "";
    await load();
  }
}

const saveSettings = (body) => request("/v1/sync/settings", { method: "PUT", body });

async function saveName() {
  const name = nameDraft.value.trim();
  if (name === (settings.value.deviceName || status.value?.deviceName || "")) return;
  await run("name", () => saveSettings({ deviceName: name || null }));
}

async function saveMinutes() {
  const m = Math.max(0, Number(minutesDraft.value) || 0);
  if (m === settings.value.autoMinutes) return;
  await run("minutes", () => saveSettings({ autoMinutes: m }));
}

async function syncNow() {
  await run("sync", async () => {
    const r = await request("/v1/sync/run", { method: "POST", body: {} });
    const failed = [r.folder, ...(r.peers ?? [])].filter((x) => x && !x.ok);
    if (failed.length) pushToast({ message: t("kit.sync.toast.unfinished", { errors: failed.map((f) => f.error).join("; ") }), kind: "error" });
    else pushToast({ message: t("kit.sync.toast.synced"), kind: "success" });
  });
}

async function setListening(on) {
  await run("listen", async () => {
    const r = await saveSettings({ listenOnNetwork: on });
    if (r?.restartRequired) pushToast({ message: t("kit.sync.toast.restart", { app: app.value }), kind: "info" });
  });
}

async function showPairingCode() {
  await run("pair", async () => {
    const r = await request("/v1/sync/pair", { method: "POST", body: {} });
    const text = JSON.stringify(r.code);
    pairing.value = { text, qr: await QRCode.toDataURL(text, { margin: 1, width: 220 }) };
    if (r.restartRequired) pushToast({ message: t("kit.sync.toast.restartReach", { app: app.value }), kind: "info" });
  });
}

async function copyPairingCode() {
  try {
    await navigator.clipboard.writeText(pairing.value.text);
    pushToast({ message: t("kit.sync.toast.codeCopied"), kind: "success" });
  } catch {
    pushToast({ message: t("kit.sync.toast.copyFailed"), kind: "error" });
  }
}

async function scanAndPair() {
  const text = await props.scanCode();
  if (!text) return;
  joinCode.value = text;
  await pairWithCode();
}

async function pairWithCode() {
  await run("join", async () => {
    const r = await request("/v1/sync/pair/join", { method: "POST", body: { code: joinCode.value.trim() } });
    joinCode.value = "";
    const who = r.peer?.name || t("kit.sync.otherDevice");
    pushToast({
      message: r.url ? t("kit.sync.toast.paired", { who }) : t("kit.sync.toast.joined", { who }),
      kind: "success",
    });
  });
}

async function setFolder(folder) {
  folderNote.value = "";
  await run("folder", async () => {
    if (folder) {
      const { libraries } = await request("/v1/sync/folder/libraries", { method: "POST", body: { folder } });
      const others = libraries.filter((l) => l.library !== status.value?.library);
      if (others.length && !libraries.some((l) => l.library === status.value?.library)) {
        const names = others.flatMap((l) => l.devices.map((d) => d.name || d.id)).join(", ");
        folderNote.value = t("kit.sync.folderOther", { names, units: noun.value.many });
      }
    }
    await saveSettings({ folder: folder || null });
  });
}

async function chooseFolder() {
  const folder = await props.pickFolder();
  if (folder) await setFolder(folder);
}

async function exportFile() {
  await run("export", async () => {
    const res = await serverFetch(llmUiUrl("/v1/sync/export"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ projectIds: pickedIds.value, encrypt: encrypt.value }),
    });
    if (!res.ok) throw new Error(t("kit.sync.err.export", { status: res.status }));
    const disposition = res.headers.get("content-disposition") || "";
    const named = /filename="([^"]+)"/.exec(disposition);
    const filename = named ? decodeURIComponent(named[1]) : `${app.value} ${new Date().toISOString().slice(0, 10)}.${props.fileExtension}`;
    const saved = await saveBlob(await res.blob(), filename, {
      title: t("kit.sync.save.title", { units: noun.value.many }),
      filterName: t("kit.sync.save.filterName", { app: app.value }),
      filterExt: props.fileExtension,
    });
    if (!saved.cancelled) pushToast({ message: saved.downloaded ? t("kit.sync.toast.downloaded") : t("kit.sync.toast.saved"), kind: "success" });
  });
}

async function postImport(bytes, join) {
  const res = await serverFetch(llmUiUrl(`/v1/sync/import${join ? "?join=1" : ""}`), {
    method: "POST",
    headers: { "Content-Type": "application/octet-stream" },
    body: bytes,
  });
  const body = await res.json().catch(() => ({}));
  return { status: res.status, body };
}

async function onImport(e) {
  const file = e.target.files?.[0];
  e.target.value = "";
  if (!file) return;
  await run("import", async () => {
    const bytes = new Uint8Array(await file.arrayBuffer());
    let r = await postImport(bytes, false);
    if (r.status === 409 && r.body?.error === "library-mismatch") {
      const ok = await confirmDialog({
        title: t("kit.sync.join.title"),
        message: r.body.fromName
          ? t("kit.sync.join.bodyFrom", { from: r.body.fromName, units: noun.value.many })
          : t("kit.sync.join.body", { units: noun.value.many }),
        confirmLabel: t("kit.sync.join.confirm"),
      });
      if (!ok) return;
      r = await postImport(bytes, true);
    }
    if (r.status !== 200) throw new Error(r.body?.detail || t("kit.sync.err.import", { status: r.status }));
    pushToast({ message: t("kit.sync.toast.imported", { from: r.body.from || t("kit.sync.theFile"), n: r.body.rows }, r.body.rows), kind: "success" });
  });
}

async function removePeer(url) {
  await run("remove", () => saveSettings({ removePeers: [url] }));
}

let timer = null;
onMounted(() => {
  load();
  timer = setInterval(load, 15000);
});
onBeforeUnmount(() => clearInterval(timer));
</script>

<template>
  <div class="lu-sync">
    <div v-if="loadError" class="lu-error">{{ loadError }}</div>

    <!-- the status -->
    <div class="lu-card lu-sync-row">
      <div class="lu-sync-info">
        <b v-if="latest">{{ t('kit.sync.status.synced', { ago: ago(latest.lastSync), from: latest.name || latest.id }) }}</b>
        <b v-else>{{ t('kit.sync.status.never') }}</b>
        <span class="lu-muted">{{ t('kit.sync.status.thisDevice', { name: status?.deviceName || "…" }) }}</span>
      </div>
      <div class="lu-sync-actions">
        <UiButton intent="primary" size="small" :loading="busy === 'sync'" :disabled="!canSyncNow" :title="canSyncNow ? '' : t('kit.sync.syncNowNeeds')" @click="syncNow">{{ t('kit.sync.syncNow') }}</UiButton>
      </div>
    </div>

    <!-- this device -->
    <div class="lu-card lu-sync-block">
      <b>{{ t('kit.sync.device.title') }}</b>
      <label class="lu-sync-field">
        <span>{{ t('kit.sync.device.name') }}</span>
        <UiInput v-model="nameDraft" size="small" width="name" @blur="saveName" @keydown.enter="saveName" />
      </label>
      <span class="lu-muted">{{ t('kit.sync.device.nameHint') }}</span>
      <label class="lu-sync-field">
        <span>{{ t('kit.sync.device.every') }}</span>
        <UiNumber v-model="minutesDraft" :min="0" size="small" width="token" @blur="saveMinutes" />
        <span>{{ t('kit.sync.device.minutes') }}</span>
      </label>
      <span class="lu-muted">{{ t('kit.sync.device.zero') }}</span>
    </div>

    <!-- other devices on the network: pairing -->
    <div class="lu-card lu-sync-block">
      <b>{{ t('kit.sync.others.title') }}</b>
      <template v-if="reachable">
      <label class="lu-sync-toggle">
        <UiToggle :model-value="!!settings.listenOnNetwork" :disabled="busy === 'listen'" @update:model-value="setListening" />
        <span>{{ t('kit.sync.others.allow') }}</span>
      </label>
      <span class="lu-muted">{{ t('kit.sync.others.allowHint', { app }) }}</span>
      <div class="lu-sync-actions">
        <UiButton intent="secondary" size="small" :loading="busy === 'pair'" @click="showPairingCode">{{ t('kit.sync.others.showCode') }}</UiButton>
      </div>
      <div v-if="pairing" class="lu-sync-pair">
        <img :src="pairing.qr" :alt="t('kit.sync.others.codeAlt')" width="220" height="220" />
        <div class="lu-sync-info">
          <span class="lu-muted">{{ t('kit.sync.others.codeHint') }}</span>
          <code class="lu-sync-code">{{ pairing.text }}</code>
          <div class="lu-sync-actions">
            <UiButton intent="secondary" size="small" @click="copyPairingCode">{{ t('kit.sync.others.copyCode') }}</UiButton>
            <UiButton intent="ghost" size="small" @click="pairing = null">{{ t('kit.sync.others.hide') }}</UiButton>
          </div>
        </div>
      </div>
      </template>
      <span v-else class="lu-muted">{{ t('kit.sync.others.phoneHint') }}</span>
      <b class="lu-sync-sub">{{ t('kit.sync.others.pairTitle') }}</b>
      <UiTextarea v-model="joinCode" :rows="3" size="small" width="prose" :placeholder="t('kit.sync.others.pastePh')" />
      <div class="lu-sync-actions">
        <UiButton intent="primary" size="small" :loading="busy === 'join'" :disabled="!joinCode.trim()" @click="pairWithCode">{{ t('kit.sync.others.pair') }}</UiButton>
        <UiButton v-if="scanCode" intent="secondary" size="small" :disabled="busy === 'join'" @click="scanAndPair">{{ t('kit.sync.others.scan') }}</UiButton>
      </div>
    </div>

    <!-- the cloud folder -->
    <div class="lu-card lu-sync-block">
      <b>{{ t('kit.sync.folder.title') }}</b>
      <span class="lu-muted">{{ t('kit.sync.folder.hint') }}</span>
      <span v-if="!cloudFolder" class="lu-muted"><em>{{ t('kit.sync.folder.notHere') }}</em></span>
      <template v-else>
      <code v-if="settings.folder" class="lu-sync-code">{{ settings.folder }}</code>
      <span v-else class="lu-muted"><em>{{ t('kit.sync.folder.none') }}</em></span>
      <div v-if="!pickFolder" class="lu-sync-actions">
        <UiInput v-model="folderDraft" size="small" width="path" :placeholder="t('kit.sync.folder.pathPh')" />
        <UiButton intent="secondary" size="small" :loading="busy === 'folder'" :disabled="!folderDraft.trim() || folderDraft.trim() === settings.folder" @click="setFolder(folderDraft.trim())">{{ t('kit.sync.folder.use') }}</UiButton>
      </div>
      <div class="lu-sync-actions">
        <UiButton v-if="pickFolder" intent="secondary" size="small" :loading="busy === 'folder'" @click="chooseFolder">{{ settings.folder ? t('kit.sync.folder.change') : t('kit.sync.folder.choose') }}</UiButton>
        <UiButton v-if="settings.folder" intent="ghost" size="small" @click="setFolder(null)">{{ t('kit.sync.folder.stop') }}</UiButton>
      </div>
      <div v-if="folderNote" class="lu-error">{{ folderNote }}</div>
      </template>
    </div>

    <!-- by hand -->
    <div class="lu-card lu-sync-block">
      <b>{{ t('kit.sync.hand.title') }}</b>
      <span class="lu-muted">{{ t('kit.sync.hand.hint') }}</span>
      <div v-if="units.length" class="lu-sync-units">
        <label v-for="u in units" :key="u.id" class="lu-sync-unit">
          <UiCheckbox v-model="picked[u.id]" /><span>{{ u.title || u.id }}</span>
        </label>
      </div>
      <span v-else class="lu-muted"><em>{{ t('kit.sync.hand.none', { units: noun.many }) }}</em></span>
      <span class="lu-muted">{{ t('kit.sync.hand.ticked', { units: noun.many }) }}</span>
      <label class="lu-sync-toggle">
        <UiCheckbox v-model="encrypt" /><span>{{ t('kit.sync.hand.encrypt') }}</span>
      </label>
      <div class="lu-sync-actions">
        <UiButton intent="primary" size="small" :loading="busy === 'export'" :disabled="!pickedIds.length" @click="exportFile">{{ t('kit.sync.hand.export') }}</UiButton>
        <UiButton as="label" intent="secondary" size="small" :loading="busy === 'import'">
          {{ t('kit.sync.hand.import') }}
          <input type="file" :accept="`.${fileExtension}`" style="display:none" @change="onImport" />
        </UiButton>
      </div>
    </div>

    <!-- the devices -->
    <div class="lu-card lu-sync-block">
      <b>{{ t('kit.sync.devices.title') }}</b>
      <span v-if="!(status?.peers ?? []).length" class="lu-muted"><em>{{ t('kit.sync.devices.none') }}</em></span>
      <div v-for="p in status?.peers ?? []" :key="p.id" class="lu-sync-device">
        <span><b>{{ p.name || p.id }}</b> <span class="lu-muted">· {{ kindLabel(p.kind) }} · {{ ago(p.lastSync) }}</span></span>
      </div>
      <template v-if="(settings.peers ?? []).length">
        <b class="lu-sync-sub">{{ t('kit.sync.devices.network') }}</b>
        <div v-for="p in settings.peers" :key="p.url" class="lu-sync-device">
          <span>{{ p.name || p.url }} <span class="lu-muted">· {{ p.url }}</span></span>
          <UiButton intent="ghost" size="small" :loading="busy === 'remove'" @click="removePeer(p.url)">{{ t('kit.common.remove') }}</UiButton>
        </div>
      </template>
    </div>
  </div>
</template>

<style scoped>
.lu-sync { display: flex; flex-direction: column; gap: 12px; max-width: 640px; }
.lu-sync-row { display: flex; align-items: flex-start; gap: 16px; }
.lu-sync-block { display: flex; flex-direction: column; align-items: flex-start; gap: 8px; }
.lu-sync-info { display: flex; flex-direction: column; gap: 4px; flex: 1; min-width: 0; }
.lu-sync-block > b, .lu-sync-info > b { font-size: 13.5px; color: var(--ink); }
.lu-sync-sub { font-size: 12.5px; margin-top: 6px; }
.lu-sync .lu-muted { font-size: 12px; line-height: 1.5; max-width: 60ch; }
.lu-sync-actions { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; }
.lu-sync-field { display: flex; align-items: center; gap: 8px; font-size: 13px; }
.lu-sync-toggle { display: flex; align-items: center; gap: 8px; font-size: 13px; }
.lu-sync-pair { display: flex; gap: 14px; align-items: flex-start; }
.lu-sync-pair img { border-radius: 6px; background: #fff; flex: none; }
.lu-sync-code { display: block; max-width: 60ch; padding: 6px 10px; background: var(--surface-2); border: 1px solid var(--border); border-radius: 6px; font-size: 12px; overflow-wrap: anywhere; }
.lu-sync-units { display: flex; flex-direction: column; gap: 4px; }
.lu-sync-unit { display: flex; align-items: center; gap: 8px; font-size: 13px; }
.lu-sync-device { display: flex; align-items: center; gap: 10px; font-size: 13px; }
</style>
