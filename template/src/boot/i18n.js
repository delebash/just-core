// SPDX-License-Identifier: MIT
// vue-i18n, installed as Quasar's CLI installs it (its i18n preset: a boot file that app.use()s the
// instance — quasar.dev/options/app-internationalization), first in quasar.config.js's boot list.
// The instance lives in i18n/index.js because code outside a component translates too. Quasar's
// own words (the table pager, the date picker) follow the same language through its language
// packs (the kit's followQuasarLang).
import { defineBoot } from "#q-app";
import { followQuasarLang } from "@delebash/ui";
import { i18n } from "../i18n/index.js";

export default defineBoot(({ app }) => {
  app.use(i18n);
  followQuasarLang(i18n, import.meta.glob("../../node_modules/quasar/lang/*.js"));
});
