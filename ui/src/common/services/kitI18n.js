// SPDX-License-Identifier: MIT
// The kit's words for its code that runs outside a component — a service's toast, a helper's label
// (friendlyAiError, classKeyLabel, the fit and phase words). Components call useI18n() instead.
// installLlmUi({ i18n }) hands the app's vue-i18n instance over (vue-i18n's documented way to
// translate outside components: `i18n.global.t`), so these follow the app's language and an app's
// own `kit.*` key rewords them. Until then — unit tests, anything before boot — the kit's own
// English catalog answers, through a vue-i18n instance of its own.
import { createI18n } from "vue-i18n";

import { kitMessages } from "../../i18n/index.js";

const ownEnglish = createI18n({
  legacy: false,
  locale: "en",
  fallbackLocale: "en",
  messages: kitMessages(),
  missingWarn: false,
  fallbackWarn: false,
});

let _i18n = ownEnglish;

export function setKitI18n(i18n) {
  _i18n = i18n || ownEnglish;
}

/** A kit word in the app's language — `kitT(key)`, `kitT(key, { name })`, `kitT(key, { n }, n)`. */
export function kitT(key, ...args) {
  return _i18n.global.t(key, ...args);
}

/** Whether a catalog defines `key` (in the app's language or English) — for an app-voiced line. */
export function kitTe(key) {
  return _i18n.global.te(key) || _i18n.global.te(key, "en");
}

/** The app's language code (reactive inside a computed or a render). */
export function kitLocale() {
  return _i18n.global.locale.value;
}
