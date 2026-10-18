// SPDX-License-Identifier: MIT
// The renderer's unit tests (`npm run test:unit`; the server's have their own config,
// server/vitest.config.js) — JustVoice's vitest.config.js is the donor. The default environment is
// Node; a component or boot test opts into a DOM with a `@vitest-environment jsdom` docblock, and
// mounts with @vue/test-utils and Quasar (vuejs.org/guide/scaling-up/testing). Why it exists: the
// build compiles SFCs without running them and Biome doesn't see a .vue file's identifiers — a
// mount is the only gate that executes that code.
import { resolve } from "node:path";
import vue from "@vitejs/plugin-vue";
import { defineConfig } from "vitest/config";

const root = import.meta.dirname;

// Quasar's browser build for a test with a DOM (jsdom — Vite's client environment), its server
// build for the rest: a bare `quasar` resolves by the "node" export condition to the SSR build,
// which refuses to install outside an SSR app, while the browser build reads `window` as it loads.
const quasarBuildPerEnvironment = {
  name: "quasar-build-per-environment",
  enforce: "pre",
  resolveId(id, importer, options) {
    if (id !== "quasar" || this.environment?.config?.consumer !== "client") return null;
    return this.resolve("quasar/dist/quasar.client.js", importer, { ...options, skipSelf: true });
  },
};

export default defineConfig({
  // transformAssetUrls off in tests only: a template's asset src stays a URL string instead of
  // becoming a file import Node can't load.
  plugins: [quasarBuildPerEnvironment, vue({ template: { transformAssetUrls: false } })],
  resolve: {
    alias: {
      "@renderer": resolve(root, "src"),
      "@delebash/ui": resolve(root, "../packages/ui/src"),
      // Quasar's wrappers (defineBoot / defineRouter / defineStore) — the alias Quasar's own build
      // makes for #q-app
      "#q-app": "@quasar/app-vite",
    },
    // The same list as quasar.config.js (extendViteConf), for the same reason — keep them in step.
    dedupe: ["vue", "quasar", "@floating-ui/dom", "pinia", "vue-router", "vue-i18n", "marked", "@vueuse/core"],
  },
  test: {
    environment: "node",
    include: ["src/**/*.test.js"],
    // `npm run test:coverage` (Vitest's v8 — no gate): every renderer file counts, tested or not
    coverage: { provider: "v8", include: ["src/**/*.{js,vue}"], reportsDirectory: "coverage/renderer" },
  },
});
