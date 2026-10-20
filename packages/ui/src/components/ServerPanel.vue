<script setup>
// SPDX-License-Identifier: MIT
// Settings → Server — the family's section (app-structure §11; JustWrite's Server cards are the
// donor). The kit's since 2026-10-19 (the template audit: the template's and just-house-paint's
// copies were one file): the headless address with Copy, "Keep server running after the app
// closes" (the host keeps the preference and tells its shell — `v-model:keep-running`), then the
// access tokens over /v1/server-auth: require one even on this machine, the list with Remove and
// "Copy the address with this token" (a browser on another computer opens it and is signed in —
// serverToken.js), and a field to paste or generate one. The door stays open from this machine, so
// this section can always fix a lost token. Failures go through `reportError` (§15). The card
// frame is the host's (`card`, `hint`), like its other sections.
import { copyToClipboard } from "quasar";
import { computed, onMounted, ref } from "vue";
import { useI18n } from "vue-i18n";
import Icon from "../common/components/Icon.vue";
import UiButton from "../common/components/UiButton.vue";
import UiInput from "../common/components/UiInput.vue";
import UiToggle from "../common/components/UiToggle.vue";
import { reportError } from "../common/services/reportError.js";
import { get, put, serverUrl } from "../common/services/serverApi.js";
import { pushToast } from "../common/services/toastBridge.js";

defineProps({
  // the command that starts the server alone ("just-house-paint-server serve")
  serverCommand: { type: String, required: true },
  keepRunning: { type: Boolean, default: false },
});
const emit = defineEmits(["update:keepRunning"]);
const { t } = useI18n();

// The server hosts the UI itself, so the command and a browser at this address are the whole app
// with no desktop install.
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
async function copy(text, title) {
  try {
    await copyToClipboard(text);
    pushToast({ kind: "success", title });
  } catch (e) {
    reportError(e);
  }
}
// the address a browser elsewhere opens to be signed in (the kit takes `?token=` once, then drops it)
const addressWith = (token) => `${headlessUrl.value.replace(/\/$/, "")}/?token=${encodeURIComponent(token)}`;
</script>

<template>
  <section class="card">
    <h2>{{ t("kit.serverPanel.headlessTitle") }}</h2>
    <i18n-t keypath="kit.serverPanel.headlessHint" tag="p" class="hint" scope="global">
      <template #command><code class="lu-server__mono">{{ serverCommand }}</code></template>
    </i18n-t>
    <div class="lu-server__row">
      <code class="lu-server__mono lu-server__box">{{ headlessUrl }}</code>
      <UiButton intent="secondary" size="small" :label="t('kit.serverPanel.copy')" @click="copy(headlessUrl, t('kit.serverPanel.copied'))" />
    </div>
    <label class="lu-server__toggle">
      <UiToggle :model-value="keepRunning" :aria-label="t('kit.serverPanel.keepRunning')" @update:model-value="(v) => emit('update:keepRunning', !!v)" />
      <span>{{ t("kit.serverPanel.keepRunning") }}</span>
    </label>
    <p class="hint card__note">{{ t("kit.serverPanel.keepRunningHint") }}</p>
  </section>

  <section class="card">
    <h2>{{ t("kit.serverPanel.tokensTitle") }}</h2>
    <i18n-t keypath="kit.serverPanel.tokensHint" tag="p" class="hint" scope="global">
      <template #header><code class="lu-server__mono">Authorization: Bearer</code></template>
      <template #api><code class="lu-server__mono">/v1</code></template>
    </i18n-t>
    <label class="lu-server__toggle">
      <UiToggle :model-value="requireForLoopback" :aria-label="t('kit.serverPanel.requireOnLocalhost')" @update:model-value="setRequireForLoopback" />
      <span>{{ t("kit.serverPanel.requireOnLocalhost") }}</span>
    </label>
    <ul v-if="tokens.length" class="lu-server__tokens">
      <li v-for="token in tokens" :key="token" class="lu-server__row">
        <code class="lu-server__mono lu-server__box">{{ token }}</code>
        <UiButton
          intent="ghost" size="small" :label="t('kit.serverPanel.copyWithToken')"
          @click="copy(addressWith(token), t('kit.serverPanel.copiedWithToken'))"
        />
        <UiButton intent="ghost" size="icon" :title="t('kit.serverPanel.removeToken')" :aria-label="t('kit.serverPanel.removeToken')" @click="removeToken(token)">
          <template #icon><Icon name="Close" :size="12" /></template>
        </UiButton>
      </li>
    </ul>
    <p v-else class="hint"><em>{{ t("kit.serverPanel.noTokens") }}</em></p>
    <div class="lu-server__row">
      <UiInput v-model="newToken" width="url" :placeholder="t('kit.serverPanel.tokenPlaceholder')" :aria-label="t('kit.serverPanel.tokenPlaceholder')" @keydown.enter="addToken" />
      <UiButton intent="secondary" :label="t('kit.serverPanel.generate')" @click="generateToken" />
      <UiButton intent="primary" :disabled="!newToken.trim()" :label="t('kit.serverPanel.addToken')" @click="addToken" />
    </div>
  </section>
</template>

<style scoped>
.lu-server__row { display: flex; align-items: center; gap: var(--sp-2, 8px); flex-wrap: wrap; }
.lu-server__mono { font-family: var(--font-mono, ui-monospace, monospace); font-size: var(--fs-small, 12.5px); }
.lu-server__box {
  max-width: var(--w-url, 48ch); overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
  padding: 6px 10px; background: var(--surface-2); border: 1px solid var(--border); border-radius: var(--r-sm, 6px);
}
.lu-server__toggle { display: flex; align-items: center; gap: 10px; margin-top: var(--sp-3, 12px); cursor: pointer; }
.lu-server__tokens { list-style: none; margin: 0 0 var(--sp-3, 12px); padding: 0; display: flex; flex-direction: column; gap: 6px; }
</style>
