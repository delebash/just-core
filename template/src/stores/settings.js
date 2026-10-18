// SPDX-License-Identifier: MIT
// The app's own settings (/v1/settings — a schema per key, server/src/schemas/settings.js; their
// first values are the server's seed, family rule 1). Settings → General edits them; the Notes page
// reads `notes.pageSize`. A failed save throws the kit's Error for the caller's form (§15).
import { get, patch as patchJson } from "@delebash/ui";
import { defineStore } from "pinia";

export const useSettingsStore = defineStore("settings", {
  state: () => ({
    values: {},
    loaded: false,
  }),
  actions: {
    async load() {
      this.values = await get("/v1/settings");
      this.loaded = true;
      return this.values;
    },
    async save(changes) {
      this.values = await patchJson("/v1/settings", changes);
      return this.values;
    },
  },
});
