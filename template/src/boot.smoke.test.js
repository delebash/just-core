// SPDX-License-Identifier: MIT
// @vitest-environment jsdom
//
// THE BOOT SMOKE (app-structure §14, §18) — the kit's registerBootSmoke runs the app's real start-up
// against a stand-in transport and fails on an import-time throw, a boot that throws, or a mount
// that renders nothing (the TDZ-crash class a build and a lint can't see). docgen's
// boot.smoke.test.js is the donor. The start-up is Quasar's: the root App.vue, Pinia from
// stores/index.js, the router from router/index.js, the boot files in quasar.config.js's order,
// then the router installed and the app mounted — the steps Quasar's generated entry takes, run by
// hand, because that entry exists only inside a Quasar build.
import { QUASAR_TEST_OPTIONS } from "@delebash/ui/quasar/install.js";
import { registerBootSmoke } from "@delebash/ui/test/bootSmoke.js";
import * as quasar from "quasar";
import { createApp } from "vue";

// Quasar's CLI makes every q-* tag available (its build-time auto-import); here they're registered.
const QUASAR_COMPONENTS = Object.fromEntries(Object.entries(quasar).filter(([k, v]) => /^Q[A-Z]/.test(k) && v?.name));

registerBootSmoke({
  boot: async () => {
    const { default: App } = await import("./App.vue");
    const { default: createStore } = await import("./stores/index.js");
    const { default: createRouter } = await import("./router/index.js");
    const { default: i18nBoot } = await import("./boot/i18n.js");
    const { default: appBoot } = await import("./boot/familytemplate.js");
    const app = createApp(App).use(quasar.Quasar, { ...QUASAR_TEST_OPTIONS, components: QUASAR_COMPONENTS });
    const store = await createStore({});
    app.use(store);
    const router = await createRouter({ store });
    // the boot files in quasar.config.js's order: vue-i18n, then the start-up (a throw fails here)
    await i18nBoot({ app, router, store });
    await appBoot({ app, router, store });
    app.use(router);
    app.mount("#app");
  },
  routes: {
    // the family's base wire — the boot's server check reads only the status
    "/v1/health": { status: "ok", product: "Family Template", version: "0.0.1", apiVersion: "v1" },
    // the preferences DOCUMENT is the top-level object (empty = the defaults)
    "/v1/prefs": {},
  },
});
