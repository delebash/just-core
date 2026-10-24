// SPDX-License-Identifier: MIT
// CommonJS on purpose — the family's named exception: Capacitor's .js config loader doesn't handle ES-module
// exports, so Quasar documents module.exports for JS projects (quasar.dev/quasar-cli-vite/developing-capacitor-apps/
// configuring-capacitor). Every other file is an ES module.
const { defineCapacitorConfig } = require('@quasar/app-vite/capacitor');

module.exports = defineCapacitorConfig({
  appId: 'com.familytemplate.app',
  appName: 'Family Template'
});
