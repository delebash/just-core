<script setup>
// SPDX-License-Identifier: MIT
// Settings — the family page (app-structure §11): the kit's PaneHeader and SettingsShell (tabs on
// top) over JustWrite's /settings/:section? route, the sections in services/settingsSections.js's
// order (the canon test asserts it). Each section names its donor:
//   General    — this app's own settings (components/settings/GeneralSection.vue);
//   Appearance — the kit's AppearancePanel + LanguagePicker (JustVoice's rows, one shared surface);
//   Backups    — the kit's DataManagement over the server's /v1/data;
//   Storage    — JustWrite's Data location + Disk usage (StorageSection.vue);
//   Server     — JustWrite's headless + access tokens + keep-running (ServerSection.vue);
//   Logs       — the kit's LogsPanel (the server's log and the renderer's errors);
//   Updates    — the kit's UpdatesPanel with docs/whats-new.md;
//   About      — AboutSection.vue.
// The section is the route's: a tab click replaces the URL, the tray's About opens /settings/about.
import {
  AppearancePanel,
  DataManagement,
  LanguagePicker,
  LogsPanel,
  PaneHeader,
  pageFlow,
  renderHelpMarkdown,
  SETTINGS_SECTION_ORDER,
  SettingsShell,
  safeRequest,
  UpdatesPanel,
} from "@delebash/ui";
import { computed, onMounted, ref, watch } from "vue";
import { useI18n } from "vue-i18n";
import { useRouter } from "vue-router";
import AboutSection from "../components/settings/AboutSection.vue";
import GeneralSection from "../components/settings/GeneralSection.vue";
import ServerSection from "../components/settings/ServerSection.vue";
import StorageSection from "../components/settings/StorageSection.vue";
import { LOCALE_CODES } from "../i18n/index.js";
import { loadDoc } from "../services/helpDocs.js";
import { desktopUpdater } from "../services/native.js";
import { SETTINGS_SECTION_IDS } from "../services/settingsSections.js";
import { useUiStore } from "../stores/ui.js";

const props = defineProps({ section: { type: String, default: "" } });
const router = useRouter();
const ui = useUiStore();
const { t } = useI18n();

// The family's sections take the kit's words (`kit.settingsSections.*`); the app's own its own,
// one t() per section so the i18n report sees each key.
const FAMILY = new Set(SETTINGS_SECTION_ORDER);
const OWN = computed(() => ({ general: t("settings.sections.general") }));
const SECTIONS = computed(() =>
  SETTINGS_SECTION_IDS.map((id) => ({ id, label: FAMILY.has(id) ? t(`kit.settingsSections.${id}`) : OWN.value[id] })),
);
const active = computed(() => (SETTINGS_SECTION_IDS.includes(props.section) ? props.section : SETTINGS_SECTION_IDS[0]));
function go(id) {
  router.replace(`/settings/${id}`);
}

// The app's version and data folder, from the server (/v1/health): one source, package.json.
const health = ref(null);
onMounted(async () => {
  health.value = await safeRequest("/v1/health", null);
});

// Updates — release notes from docs/whats-new.md, loaded when the section first opens; the
// desktop shell's updater (null in a browser; off in the shell until the app has releases).
const updater = desktopUpdater();
const changelogHtml = ref("");
watch(
  active,
  async (a) => {
    if (a === "updates" && !changelogHtml.value) changelogHtml.value = renderHelpMarkdown((await loadDoc("whats-new")) || "");
  },
  { immediate: true },
);
</script>

<template>
  <q-page :style-fn="pageFlow" class="page settings">
    <PaneHeader :eyebrow="t('app.name')" :title="t('settings.title')" help-key="getting-started" />
    <SettingsShell :sections="SECTIONS" :model-value="active" @update:model-value="go">
      <GeneralSection v-if="active === 'general'" />

      <template v-else-if="active === 'appearance'">
        <section class="card">
          <h2>{{ t("kit.settingsSections.appearance") }}</h2>
          <p class="hint">{{ t("settings.appearanceHint") }}</p>
          <AppearancePanel :appearance="ui.appearance" :accent-chroma="0.08" :accent-note="t('settings.accentNote')" @patch="(p) => ui.setAppearance(p)" />
        </section>
        <section class="card">
          <h2>{{ t("kit.settings.language.label") }}</h2>
          <LanguagePicker :locales="LOCALE_CODES" @change="(code) => ui.setLocale(code)" />
        </section>
      </template>

      <section v-else-if="active === 'backups'" class="card">
        <h2>{{ t("kit.settingsSections.backups") }}</h2>
        <p class="hint">{{ t("settings.backupsHint") }}</p>
        <DataManagement :app-name="t('app.name')" />
      </section>

      <StorageSection v-else-if="active === 'storage'" :data-dir="health?.dataDir || ''" />

      <ServerSection v-else-if="active === 'server'" />

      <section v-else-if="active === 'logs'" class="card settings__logs">
        <h2>{{ t("kit.storage.serverLogs") }}</h2>
        <p class="hint">{{ t("settings.logsHint") }}</p>
        <LogsPanel />
      </section>

      <section v-else-if="active === 'updates'" class="card">
        <UpdatesPanel :app-version="health?.version || ''" :changelog-html="changelogHtml" :updater="updater" />
      </section>

      <AboutSection v-else :version="health?.version || ''" :data-dir="health?.dataDir || ''" />
    </SettingsShell>
  </q-page>
</template>
