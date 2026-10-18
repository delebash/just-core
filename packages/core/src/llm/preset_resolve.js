// SPDX-License-Identifier: MIT
// Resolve the ENGINE PRESET an action runs — the ONE-SOURCE model (2026-07-15: the task tier
// is gone; the preset is the truth). The port of llm/preset_resolve.py. Resolution is
//
//     this action's own ref (FeaturePresetRef[action]) → its FEATURE's ref (when named)
//     → the global default (`default_preset_id` RunnerSetting).
//
// Pure reads over the shared stores. Returns the EnginePresetRow (wire shape) or null. null
// means "no preset configured" → the caller dispatches on the provider-default route with NO
// tunables sent (the no-preset rule; only reachable for a custom action before assignment —
// every seeded action ships a ref).
//
// A tier whose stored preset_id is DANGLING (the preset was deleted while a ref row survived
// — reachable on the runner's own FK-off path) falls through to the next tier, so a stale
// ref never strands an action.

import * as stores from "./stores.js";

/** The engine preset with this id, or null (empty id, or a dangling id). */
function presetById(presetId) {
  if (!presetId) return null;
  for (const p of stores.getEnginePresetStore().list()) {
    if (p.id === presetId) return p;
  }
  return null;
}

/** First [presetId, source] whose preset EXISTS → [preset, source]; none → [null, ""]. */
function resolveWithSource(candidates) {
  for (const [presetId, source] of candidates) {
    const preset = presetById(presetId);
    if (preset !== null) return [preset, source];
  }
  return [null, ""];
}

/**
 * The preset an ACTION runs AND which tier won ("assigned" | "default" | "") —
 * `[preset, source]`. One implementation of the cascade, shared by the run path and the
 * resolved-route provenance endpoint.
 *
 * The FEATURE layer joined 2026-08-06 (the pieces rework): the action's own ref → the
 * action's FEATURE ref (when the caller names one — a pieces parent routes ALL its rows
 * through one assignment) → the global default.
 */
export function resolveFeaturePresetWithSource(featureKey, feature = null) {
  const refs = stores.getFeaturePresetRefStore().list(); // key → preset_id (the assignment)
  const ref = (k) => (Object.hasOwn(refs, k) ? refs[k] : "");
  const layers = [[ref(featureKey), "assigned"]];
  if (feature && feature !== featureKey) layers.push([ref(feature), "assigned"]);
  layers.push([stores.getDefaultPresetId(), "default"]);
  return resolveWithSource(layers);
}

/**
 * The recipe a preset runs with — "local" or "frontier" (decided 2026-10-10, JustVoice's
 * one-click plan §3: "Pick the recipe by kind of model, not size … frontier by default for cloud
 * providers, local for the built-in engine, and editable"). The preset's own setting wins; ""
 * follows its provider — a provider on this machine (`local`: the built-in engine, Ollama, LM
 * Studio) is local, a metered cloud one frontier. No preset, or a provider no longer
 * configured, reads as local, the recipe that asks least of a model.
 */
export function presetRecipe(preset) {
  if (!preset) return "local";
  if (preset.recipe === "local" || preset.recipe === "frontier") return preset.recipe;
  const provider = preset.providerId ? stores.getProviderStore().get(preset.providerId) : null;
  if (!provider) return "local";
  return provider.local === false ? "frontier" : "local";
}

/** The engine preset an ACTION runs — its ref → its feature's ref (when given) → the global
 * default. `featureKey` is the ACTION id, so writerAI.continue and writerAI.tighten point
 * independently. */
export function resolveFeaturePreset(featureKey, feature = null) {
  return resolveFeaturePresetWithSource(featureKey, feature)[0];
}
