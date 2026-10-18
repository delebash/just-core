// SPDX-License-Identifier: MIT
// Quasar's own words (the table pager, the editor toolbar, the date picker) in the app's language:
// Quasar's language packs, loaded as quasar.dev/options/quasar-language-packs ("Dynamical") shows,
// and set again whenever the app's vue-i18n language changes. `packs` is the app's own
// import.meta.glob of quasar/lang/*.js — its path is relative to the app, as the doc's boot file is:
//
//   followQuasarLang(i18n, import.meta.glob("../../node_modules/quasar/lang/*.js"));
import { Lang } from "quasar";
import { watch } from "vue";

export function followQuasarLang(i18n, packs) {
  const pathByIso = Object.fromEntries(Object.keys(packs).map((p) => [p.match(/([^/]+)\.js$/)[1], p]));
  const apply = async (code) => {
    const iso = Lang.getClosestIsoName(code, Object.keys(pathByIso));
    if (iso === undefined) return; // no pack shares the language (the pseudo-locale): keep the current one
    const pack = await packs[pathByIso[iso]]();
    Lang.set(pack.default);
  };
  watch(i18n.global.locale, apply, { immediate: true });
}
