// SPDX-License-Identifier: MIT
// The app's vue-i18n instance, for the kit's code that runs outside a component (a service's toast,
// the dialog's default verbs). Components call useI18n() instead. installLlmUi({ i18n }) stores it.
//
// fillKitWords is step A of the i18n plan (docs/plans/2026-10-12-i18n-standard.md, Task 1): until
// the kit's components read their words through vue-i18n (step C), it fills the label store, the
// Quick Setup copy and the number locale from the `kit.*` keys — in the app's language, an app's own
// `kit.*` key winning — and again on every language change. Step C deletes it with what it fills.
import { watch } from "vue";

import { FAMILY_LABELS } from "../familyContract.js";
import { configureFamilyLabels } from "./familyLabels.js";
import { setUiLocale } from "./locale.js";
import { configureQuickSetupCopy, quickSetupCopy } from "./quickSetupCopy.js";

let _i18n = null;

export function setKitI18n(i18n) {
  _i18n = i18n || null;
}

/** A kit word in the app's language; the bare key before an app has passed its instance. */
export function kitT(key, params) {
  return _i18n ? _i18n.global.t(key, params || {}) : key;
}

/** The app's language code, or undefined before an app has passed its instance. */
export function kitLocale() {
  return _i18n ? _i18n.global.locale.value : undefined;
}

// The placeholders the showing component fills ("Can't reach the {appName} server") pass through.
const PASS_THROUGH = { appName: "{appName}", model: "{model}", size: "{size}" };
const COPY_TEXT = Object.fromEntries(
  Object.entries(quickSetupCopy).filter(([, v]) => typeof v === "string").map(([k]) => [k, ""]),
);
const CATALOG_TEXT = { chatSectionLabel: "", chatSectionHint: "", generalUse: "", slotsFootnote: "" };

// The words for every leaf of `shape` that the catalogs define, under `prefix`.
function wordsFrom(i18n, prefix, shape) {
  const { t, te } = i18n.global;
  const out = {};
  for (const [k, v] of Object.entries(shape)) {
    const key = `${prefix}.${k}`;
    if (v && typeof v === "object") out[k] = wordsFrom(i18n, key, v);
    else if (te(key) || te(key, "en")) out[k] = t(key, PASS_THROUGH);
  }
  return out;
}

export function fillKitWords(i18n) {
  watch(i18n.global.locale, (code) => {
    configureFamilyLabels(wordsFrom(i18n, "kit", FAMILY_LABELS));
    configureQuickSetupCopy(wordsFrom(i18n, "kit.quickSetup", COPY_TEXT));
    setUiLocale(code);
  }, { immediate: true });
}

/** The model catalog's wording from the `kit.catalog.*` keys (it reads its copy once). */
export function catalogCopyFrom(i18n) {
  return wordsFrom(i18n, "kit.catalog", CATALOG_TEXT);
}
