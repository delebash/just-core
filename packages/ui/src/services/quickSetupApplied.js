// SPDX-License-Identifier: MIT
// The app's follow-up for when Quick Setup finishes (installLlmUi's `onQuickSetupApplied`) —
// JustVoice tells its header to re-read the model list. Quick Setup calls it with `{ modelId }`.
let _onApplied = null;

export function setQuickSetupApplied(fn) {
  _onApplied = typeof fn === "function" ? fn : null;
}

export function quickSetupApplied(payload) {
  try {
    _onApplied?.(payload);
  } catch {
    // the app's follow-up failing is the app's problem, not the wizard's
  }
}
