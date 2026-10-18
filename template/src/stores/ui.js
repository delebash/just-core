// SPDX-License-Identifier: MIT
// The chrome's state: appearance and the UI flags, kept by the server through the family /v1/prefs
// door (app-structure §14 — they survive a reinstall and ride the backups). `readPref` serves from
// the cache the boot file's `bootPrefs()` filled before this store first initialises. docgen's
// stores/ui.js is the donor.
import { readPref, useModelApply, writePref } from "@delebash/ui";
import { defineStore } from "pinia";
import { i18n, LOCALE_CODES } from "../i18n/index.js";
import { applyAppearance, migrateAppearance } from "../services/appearance.js";

export const useUiStore = defineStore("ui", {
  state: () => ({
    appearance: migrateAppearance(readPref("appearance", {})),
    // the once-ever AI offer's flag (ruling R3, 2026-08-04)
    aiOfferShown: readPref("aiOfferShown", false) === true,
    aiOfferOpen: false,
    // keep the server running when the window closes (the family headless ruling, 2026-08-04)
    keepServerRunning: readPref("keepServerRunning", false) === true,
    // the interface language the user picked (Settings → Appearance); null = English
    locale: readPref("locale", null),
  }),
  actions: {
    boot() {
      applyAppearance(this.appearance);
      if (this.locale && LOCALE_CODES.includes(this.locale)) i18n.global.locale.value = this.locale;
    },
    /** The once-ever AI offer, at this app's first-note moment (pages/NotesPage.vue, after a note is
     *  created — docgen's is Setup's first save, JustWrite's the first project): shown only when no
     *  AI provider is the default at all — an online default is AI too (§11). */
    async maybeOfferAiSetup() {
      if (this.aiOfferShown) return;
      try {
        const { refreshApplied, currentDefaultProviderId } = useModelApply();
        await refreshApplied();
        if (!currentDefaultProviderId.value) this.aiOfferOpen = true;
      } catch {
        // unknown → no offer; AI Settings still serves
      }
    },
    closeAiOffer() {
      this.aiOfferOpen = false;
      this.markAiOfferShown();
    },
    markAiOfferShown() {
      this.aiOfferShown = true;
      writePref("aiOfferShown", true);
    },
    setKeepServerRunning(v) {
      this.keepServerRunning = !!v;
      writePref("keepServerRunning", !!v);
    },
    /** The kit's LanguagePicker sets vue-i18n's locale; this keeps the choice. */
    setLocale(code) {
      this.locale = code || null;
      writePref("locale", this.locale);
    },
    setAppearance(patch) {
      this.appearance = { ...this.appearance, ...patch };
      // the wrapper document {appearance: {...}} — the kit's migrateAppearance reads
      // `persisted.appearance` (the flat object lost mode/font/scale on every restart, docgen 2026-08-05)
      writePref("appearance", { appearance: this.appearance });
      applyAppearance(this.appearance);
    },
    cycleMode() {
      const order = ["system", "light", "dark"];
      const next = order[(order.indexOf(this.appearance.mode || "system") + 1) % order.length];
      this.setAppearance({ mode: next });
    },
  },
});
