// SPDX-License-Identifier: MIT
// Words that arrive as data, shown in the app's language (the seeded-words plan,
// docs/plans/2026-10-18-seeded-words-in-the-users-language.md): a row the server sends with a
// catalog key — a seeded provider or preset still under its seeded name, a host's feature, action
// or group — shows the key's text; anything else (a renamed row, a brand, a row the user made)
// shows as stored. Only what a screen DISPLAYS goes through here; what it saves stays the data.
import { kitT, kitTe } from "../common/services/kitI18n.js";

/** The key's text in the app's language when a catalog has it, else `fallback`. */
export function keyedText(key, fallback = "") {
  return key && kitTe(key) ? kitT(key) : fallback;
}

/** `p` — a provider row from /v1/llm-providers ({id, name, nameKey}). */
export function providerDisplayName(p) {
  if (!p) return "";
  return keyedText(p.nameKey, p.name || p.id || "");
}

/** `p` — an engine preset row from /v1/ai/engine-presets ({id, name, nameKey}). */
export function presetDisplayName(p) {
  if (!p) return "";
  return keyedText(p.nameKey, p.name || p.id || "");
}
