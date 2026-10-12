// SPDX-License-Identifier: MIT
// THE one phase vocabulary for MODEL load / download / unload progress (T3,
// 2026-07-17 approved plan — the user: the integrated UI speaks "terms with
// quicksetup"). MOVED VERBATIM from QuickSetup.vue's local block (the 2026-07-15
// "make the words more userfriendly" ruling) — QuickSetup now imports from here and a
// JW source test pins that no local copy regrows. Every model surface (QuickSetup's
// bars, the catalog slot cards, the catalog rows) renders through friendlyPhase.
// Scope honesty: the ENGINE install keeps its own friendlyEnginePhase (useEngine.js)
// — a pre-existing, separate vocabulary, deliberately not folded in.
// The words are the kit catalog's (kit.phase.*); each phase the server reports names its key.
import { kitT } from "./kitI18n.js";

const PHASE_KEYS = {
  queued: "gettingReady",
  // T1 (2026-07-17): the neutral phase before any real download chunk lands — the
  // download itself sets "model weights"; a cached file never announces one.
  preparing: "gettingReady",
  "model weights": "downloadingModel",
  "MTP draft model": "downloadingHelper",
  "loading into VRAM": "loadingVram",
  // T2/T2b (2026-07-17): the transient teardown statuses arrive with EMPTY detail —
  // friendlyPhase falls through to the STATUS for these.
  stopping: "unloading",
  cancelling: "cancelling",
};

// phase → its words in the current language (a getter per phase, read when shown).
export const PHASE_WORDS = Object.defineProperties({}, Object.fromEntries(
  Object.entries(PHASE_KEYS).map(([phase, key]) => [phase, { get: () => kitT(`kit.phase.${key}`), enumerable: true }]),
));

export function friendlyPhase(detail, status) {
  const d = String(detail || "").trim();
  if (Object.hasOwn(PHASE_KEYS, d)) return PHASE_WORDS[d];
  if (d) return d; // already a sentence (the MTP notes)
  if (Object.hasOwn(PHASE_KEYS, status || "")) return PHASE_WORDS[status];
  if (status === "downloading") return kitT("kit.phase.downloading");
  if (status === "starting") return kitT("kit.phase.startingEngine");
  return kitT("kit.phase.working");
}
