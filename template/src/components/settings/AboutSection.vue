<script setup>
// SPDX-License-Identifier: MIT
// Settings → About — the family's section (app-structure §11: version, repo): what the app is, its
// version (the server's, from /v1/health — one number, set in package.json), the desktop runtime,
// where its data is, and its source.
import { openExternal } from "@delebash/ui";
import { useI18n } from "vue-i18n";
import { shellVersion } from "../../services/native.js";

defineProps({
  version: { type: String, default: "" },
  dataDir: { type: String, default: "" },
});

const { t } = useI18n();
// The app's source repository — a new app names its own.
const SOURCE_URL = "https://github.com/delebash/just-core";
const electron = shellVersion();
</script>

<template>
  <section class="card">
    <h2>{{ t("app.name") }}</h2>
    <p class="hint">{{ t("settings.about.blurb") }}</p>
    <table class="ui-formgrid">
      <tbody>
        <tr>
          <th>{{ t("settings.about.version") }}</th>
          <td class="mono">{{ version || "—" }}</td>
        </tr>
        <tr v-if="electron">
          <th>{{ t("settings.about.runtime") }}</th>
          <td class="mono">{{ t("settings.about.electron", { version: electron }) }}</td>
        </tr>
        <tr v-if="dataDir">
          <th>{{ t("settings.about.data") }}</th>
          <td class="mono">{{ dataDir }}</td>
        </tr>
        <tr>
          <th>{{ t("settings.about.source") }}</th>
          <td><a :href="SOURCE_URL" @click.prevent="openExternal(SOURCE_URL)">{{ SOURCE_URL.replace("https://", "") }}</a></td>
        </tr>
      </tbody>
    </table>
  </section>
</template>
