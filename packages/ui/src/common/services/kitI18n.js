// SPDX-License-Identifier: MIT
// The kit's words for its code that runs outside a component — a service's toast, a helper's label
// (friendlyAiError, classKeyLabel, the fit and phase words). Components call useI18n() instead.
// installLlmUi({ i18n }) hands the app's vue-i18n instance over (vue-i18n's documented way to
// translate outside components: `i18n.global.t`), so these follow the app's language and an app's
// own `kit.*` key rewords them. Until then the kit's own English catalog answers, through a
// vue-i18n instance of its own — and the console says so once: kit text read before the handover is
// the timing bug that kept docgen's and JustVoice's catalog words from ever showing.
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
let _warned = false;

export function setKitI18n(i18n) {
  _i18n = i18n || ownEnglish;
  _warned = false;
}

function current() {
  if (_i18n === ownEnglish && !_warned) {
    _warned = true;
    console.warn("[llm-ui] kit text was read before installLlmUi(app, { i18n }) handed over the app's vue-i18n instance — it shows in English, not the app's language.");
  }
  return _i18n;
}

/** A kit word in the app's language — `kitT(key)`, `kitT(key, { name })`, `kitT(key, { n }, n)`. */
export function kitT(key, ...args) {
  return current().global.t(key, ...args);
}

/** Whether a catalog defines `key` (in the app's language or English) — for an app-voiced line. */
export function kitTe(key) {
  const i18n = current();
  return i18n.global.te(key) || i18n.global.te(key, "en");
}

/** The app's language code (reactive inside a computed or a render). */
export function kitLocale() {
  return current().global.locale.value;
}

/** A number in the app's language — vue-i18n's n(), Intl options allowed (`{ maximumFractionDigits: 1 }`,
 *  `{ style: "currency", currency: "USD" }`). For kit code outside a component; components use useI18n().n. */
export function kitN(value, options) {
  return current().global.n(value, options);
}
