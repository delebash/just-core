<script setup>
// SPDX-License-Identifier: MIT
// Settings → Server — the family's section (app-structure §11; JustWrite's SettingsPage Server
// cards are the donor): the headless address with Copy, "Keep server running after the app closes"
// (written to the shell at once and kept as a preference — the layout re-applies it every start),
// then the access tokens over /v1/server-auth: require one even on this machine, the list with
// Remove, and a field to paste or generate one. The door stays open from this machine, so this
// section can always fix a lost token. Failures go through `reportError` (§15).
import { get, Icon, pushToast, put, reportError, serverUrl, UiButton, UiInput, UiToggle } from "@delebash/ui";
import { computed, onMounted, ref } from "vue";
import { useI18n } from "vue-i18n";
import { setKeepRunning as shellKeepRunning } from "../../services/native.js";
import { useUiStore } from "../../stores/ui.js";

const { t } = useI18n();
const ui = useUiStore();

// The server hosts the UI itself, so `family-template-server serve` and a browser at this address
// are the whole app with no desktop install.
const headlessUrl = computed(() => serverUrl("") || (typeof window !== "undefined" ? window.location.origin : ""));

const tokens = ref([]);
const requireForLoopback = ref(false);
const newToken = ref("");

onMounted(async () => {
  try {
    const a = await get("/v1/server-auth");
    tokens.value = Array.isArray(a.tokens) ? a.tokens : [];
    requireForLoopback.value = !!a.requireForLoopback;
  } catch (e) {
    reportError(e);
  }
});

async function saveAuth() {
  try {
    const a = await put("/v1/server-auth", { tokens: tokens.value, requireForLoopback: requireForLoopback.value });
    tokens.value = a.tokens;
    requireForLoopback.value = !!a.requireForLoopback;
  } catch (e) {
    reportError(e);
  }
}
function addToken() {
  const token = newToken.value.trim();
  newToken.value = "";
  if (!token || tokens.value.includes(token)) return;
  tokens.value = [...tokens.value, token];
  saveAuth();
}
function removeToken(token) {
  tokens.value = tokens.value.filter((x) => x !== token);
  saveAuth();
}
function setRequireForLoopback(v) {
  requireForLoopback.value = !!v;
  saveAuth();
}
function generateToken() {
  const bytes = crypto.getRandomValues(new Uint8Array(18));
  newToken.value = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}
async function copyHeadlessUrl() {
  try {
    await navigator.clipboard.writeText(headlessUrl.value);
    pushToast({ kind: "success", title: t("settings.server.copied") });
  } catch (e) {
    reportError(e);
  }
}
// OFF ⇒ closing the window stops everything; ON ⇒ it hides to the tray and the server keeps serving.
async function setKeepRunning(v) {
  ui.setKeepServerRunning(!!v);
  await shellKeepRunning(v);
}
</script>

<template>
  <section class="card">
    <h2>{{ t("settings.server.headlessTitle") }}</h2>
    <i18n-t keypath="settings.server.headlessHint" tag="p" class="hint" scope="global">
      <template #command><code class="mono">family-template-server serve</code></template>
    </i18n-t>
    <div class="row">
      <code class="mono url-box">{{ headlessUrl }}</code>
      <UiButton intent="secondary" size="small" :label="t('settings.server.copy')" @click="copyHeadlessUrl" />
    </div>
    <label class="toggle-row">
      <UiToggle :model-value="ui.keepServerRunning" :aria-label="t('settings.server.keepRunning')" @update:model-value="setKeepRunning" />
      <span>{{ t("settings.server.keepRunning") }}</span>
    </label>
    <p class="hint card__note">{{ t("settings.server.keepRunningHint") }}</p>
  </section>

  <section class="card">
    <h2>{{ t("settings.server.tokensTitle") }}</h2>
    <i18n-t keypath="settings.server.tokensHint" tag="p" class="hint" scope="global">
      <template #header><code class="mono">Authorization: Bearer</code></template>
      <template #api><code class="mono">/v1</code></template>
    </i18n-t>
    <label class="toggle-row">
      <UiToggle :model-value="requireForLoopback" :aria-label="t('settings.server.requireOnLocalhost')" @update:model-value="setRequireForLoopback" />
      <span>{{ t("settings.server.requireOnLocalhost") }}</span>
    </label>
    <ul v-if="tokens.length" class="token-list">
      <li v-for="token in tokens" :key="token" class="row">
        <code class="mono url-box">{{ token }}</code>
        <UiButton intent="ghost" size="icon" :title="t('settings.server.removeToken')" :aria-label="t('settings.server.removeToken')" @click="removeToken(token)">
          <template #icon><Icon name="Close" :size="12" /></template>
        </UiButton>
      </li>
    </ul>
    <p v-else class="hint"><em>{{ t("settings.server.noTokens") }}</em></p>
    <div class="row">
      <UiInput v-model="newToken" width="url" :placeholder="t('settings.server.tokenPlaceholder')" :aria-label="t('settings.server.tokenPlaceholder')" @keydown.enter="addToken" />
      <UiButton intent="secondary" :label="t('settings.server.generate')" @click="generateToken" />
      <UiButton intent="primary" :disabled="!newToken.trim()" :label="t('settings.server.addToken')" @click="addToken" />
    </div>
  </section>
</template>
