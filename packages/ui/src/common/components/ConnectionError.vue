<!-- SPDX-License-Identifier: MIT -->
<!--
  ConnectionError — shown in place of the whole app when the server can't be
  reached at boot. The renderer holds no data of its own, so rather than render
  empty stores (which look broken and silently fail to save) the host mounts
  this as the root. App-agnostic: the host passes its brand + server URL + copy
  as props — createApp(ConnectionError, { appName, serverUrl, need, devHint }).
  Supersedes the per-app ConnectionError.vue forks.
  While it shows, it asks the server again every 2 s and loads the app the
  moment it answers (2026-10-06): the boot check gives up after ~7.5 s, and a
  desktop app's own server can take longer than that to start, which left the
  window on this screen until Retry (seen in JustVoice under `npm run dev`).
  A server that answers but requires an access token (401/403 — Settings → Server's tokens, a
  browser on another computer) is not "can't be reached": the screen asks for the token, keeps it
  (serverToken.js) and loads the app once the server accepts it (2026-10-19). Plain <input> and
  <button>: the screen also mounts as its own root, where no component library is installed.
-->
<script setup>
import { computed, onBeforeUnmount, onMounted, ref } from "vue";
import { useI18n } from "vue-i18n";
import { checkServer, serverNeedsToken } from "../services/serverApi.js";
import { setServerToken } from "../services/serverToken.js";
import { onBack, pageShown } from "../services/visibility.js";

// The words are the kit's (kit.connectionError.*) in the app's language; the app passes its own
// translated name, need and dev hint.
const props = defineProps({
  appName: { type: String, default: "" },
  serverUrl: { type: String, default: "" },
  // The clause after "{appName} needs its server to ___".
  need: { type: String, default: "" },
  // Dev-only hint (shown only when import.meta.env.DEV); plain text.
  devHint: { type: String, default: "" },
  // Why the server isn't there, when the app knows (its desktop shell's `serverStatus`): one
  // sentence in the app's words, under the body. Plain text.
  detail: { type: String, default: "" },
});
const isDev = import.meta.env.DEV;
const { t } = useI18n();
const name = computed(() => props.appName || t("kit.connectionError.theApp"));
const title = computed(() => t("kit.connectionError.title", { appName: name.value }));
function retry() { location.reload(); }

// Keep asking (one probe each time) and boot when the server answers: every 2 s at first, then less often up to once
// a minute (a server gone for days isn't asked 43,200 times a day), not at all while the page is hidden, and at once
// when it shows again or the network comes back (visibility.js; the twelfth review, 2026-10-20).
const PROBE_FIRST_MS = 2000;
const PROBE_MOST_MS = 60_000;
let every = PROBE_FIRST_MS;
let timer = null;
let stopped = false;
let probing = false;
async function probe() {
  timer = null;
  if (stopped || probing || !pageShown()) return;
  probing = true;
  try {
    if (await checkServer({ tries: 1 })) return retry();
  } finally {
    probing = false;
  }
  // a server that wants a token answers the same until one is given: stop asking
  if (stopped || serverNeedsToken.value) return;
  timer = setTimeout(probe, every);
  every = Math.min(every * 1.5, PROBE_MOST_MS);
}
const offBack = onBack(() => {
  every = PROBE_FIRST_MS;
  clearTimeout(timer);
  void probe();
});

// The token form: kept, tried once, the app loads when the server takes it.
const token = ref("");
const connecting = ref(false);
const refused = ref(false);
async function connect() {
  connecting.value = true;
  refused.value = false;
  setServerToken(token.value);
  if (await checkServer({ tries: 1 })) retry();
  else {
    refused.value = serverNeedsToken.value;
    connecting.value = false;
  }
}
onMounted(() => { timer = setTimeout(probe, PROBE_FIRST_MS); });
onBeforeUnmount(() => { stopped = true; clearTimeout(timer); offBack(); });
</script>

<template>
  <div class="conn-err">
    <div class="conn-err__card">
      <div class="conn-err__icon">{{ serverNeedsToken ? "🔑" : "⚠️" }}</div>
      <template v-if="serverNeedsToken">
        <h1>{{ t("kit.connectionError.tokenTitle", { appName: name }) }}</h1>
        <p>{{ t("kit.connectionError.tokenBody") }}</p>
        <form class="conn-err__token" @submit.prevent="connect">
          <input
            v-model="token" class="conn-err__input" type="password" autocomplete="off"
            :aria-label="t('kit.connectionError.tokenLabel')" :placeholder="t('kit.connectionError.tokenLabel')"
          />
          <button class="conn-err__btn" type="submit" :disabled="!token.trim() || connecting">{{ t("kit.connectionError.connect") }}</button>
        </form>
        <p v-if="refused" class="conn-err__refused" role="alert">{{ t("kit.connectionError.tokenRefused") }}</p>
      </template>
      <template v-else>
        <h1>{{ title }}</h1>
        <i18n-t keypath="kit.connectionError.body" tag="p" scope="global">
          <template #appName>{{ name }}</template>
          <template #need>{{ need || t("kit.connectionError.need") }}</template>
          <template #url><code>{{ serverUrl }}</code></template>
        </i18n-t>
        <p v-if="detail">{{ detail }}</p>
        <p v-if="isDev && devHint" class="conn-err__hint">{{ devHint }}</p>
        <button class="conn-err__btn" type="button" @click="retry">{{ t("kit.common.retry") }}</button>
      </template>
    </div>
  </div>
</template>

<style scoped>
.conn-err { position: fixed; inset: 0; display: grid; place-items: center; background: var(--bg, var(--app-bg, #f7f5f0)); padding: 24px; }
.conn-err__card { max-width: 460px; text-align: center; background: var(--surface, #fff); border: 1px solid var(--border, #e6e1d8); border-radius: 14px; padding: 32px 28px; box-shadow: 0 8px 30px rgba(0,0,0,.06); }
.conn-err__icon { font-size: 34px; line-height: 1; }
.conn-err__card h1 { font-size: 18px; margin: 14px 0 8px; color: var(--ink, #2b2620); }
.conn-err__card p { color: var(--muted, #6b6357); font-size: 13.5px; line-height: 1.55; margin: 0 0 10px; }
.conn-err__hint { font-size: 12.5px; }
.conn-err code { background: var(--surface-2, #f0ece4); padding: 1px 6px; border-radius: 5px; font-size: 12px; }
.conn-err__btn { margin-top: 16px; padding: 9px 22px; border: 0; border-radius: 8px; background: var(--accent, #2f6e4f); color: var(--on-accent, #fff); font-size: 13px; font-weight: 600; cursor: pointer; }
.conn-err__btn:hover { filter: brightness(1.06); }
.conn-err__btn:disabled { opacity: .55; cursor: default; filter: none; }
.conn-err__token { display: flex; gap: 8px; justify-content: center; align-items: center; margin-top: 16px; }
.conn-err__token .conn-err__btn { margin-top: 0; }
.conn-err__input { width: 24ch; max-width: 100%; padding: 8px 10px; border: 1px solid var(--border, #e6e1d8); border-radius: 8px; font: inherit; font-size: 13px; background: var(--surface, #fff); color: var(--ink, #2b2620); }
.conn-err__refused { color: var(--danger, #b3261e) !important; margin-top: 10px !important; }
</style>
