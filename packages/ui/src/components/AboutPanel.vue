<script setup>
// SPDX-License-Identifier: MIT
// Settings → About — the family's section (app-structure §11: version, repo). The kit's since
// 2026-10-19 (the template audit: the template's and just-house-paint's copies were one file but
// for the app's words): the app's name and what it is (the app's own words), its version (the
// server's, from /v1/health — one number, set in package.json), the desktop runtime, where its
// data is, and its source. The card frame is the host's (`card`, `hint`), like its other sections.
import { useI18n } from "vue-i18n";
import { openExternal } from "../common/services/external.js";

defineProps({
  appName: { type: String, required: true },
  // what the app is, in the app's words
  blurb: { type: String, default: "" },
  version: { type: String, default: "" },
  // the desktop runtime's version (Electron's); "" outside the desktop app
  runtime: { type: String, default: "" },
  dataDir: { type: String, default: "" },
  // the app's source repository
  sourceUrl: { type: String, default: "" },
});
const { t } = useI18n();
</script>

<template>
  <section class="card">
    <h2>{{ appName }}</h2>
    <p v-if="blurb" class="hint">{{ blurb }}</p>
    <table class="ui-formgrid">
      <tbody>
        <tr>
          <th>{{ t("kit.aboutPanel.version") }}</th>
          <td class="lu-about__mono">{{ version || "—" }}</td>
        </tr>
        <tr v-if="runtime">
          <th>{{ t("kit.aboutPanel.runtime") }}</th>
          <td class="lu-about__mono">{{ t("kit.aboutPanel.electron", { version: runtime }) }}</td>
        </tr>
        <tr v-if="dataDir">
          <th>{{ t("kit.aboutPanel.data") }}</th>
          <td class="lu-about__mono">{{ dataDir }}</td>
        </tr>
        <tr v-if="sourceUrl">
          <th>{{ t("kit.aboutPanel.source") }}</th>
          <td><a class="lu-about__link" :href="sourceUrl" @click.prevent="openExternal(sourceUrl)">{{ sourceUrl.replace("https://", "") }}</a></td>
        </tr>
      </tbody>
    </table>
  </section>
</template>

<style scoped>
.lu-about__mono { font-family: var(--font-mono, ui-monospace, monospace); font-size: var(--fs-small, 12.5px); }
/* the theme's link colour (the kit's other links: LogsPanel's Download, the hardware strip's
   actions), not the browser's blue and visited purple */
.lu-about__link, .lu-about__link:visited { color: var(--accent-ink, var(--accent)); }
</style>
