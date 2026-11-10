// SPDX-License-Identifier: MIT
// The default prompt of each AI action (app-structure §8, §11: a "prompt-row-owned" feature) —
// seeded into the shared `feature_prompts` table insert-if-missing, then read from the database
// on every run, so the AI Lab can edit and save it. Keyed by the ACTION id; each row names its
// routing `feature`, the `system` prompt, the `user_template` ({{var}} placeholders the caller
// fills — runAiFeature's `variables`) and its JSON contract (`json_mode`). Every tunable is the
// engine preset's (seed_presets.js), never the prompt's.
//
// The prompt text is what the model reads, so it stays English on purpose (§Q.11).
//
// A revised prompt reaches a database seeded before it through FEATURE_PROMPT_HEALS (the kit's featurePromptHeals,
// seed.js configureAppSeed): seeding is insert-if-missing, so each key lists the system texts it had, byte for byte, and
// a row still holding one of them — never edited — takes today's; an edited prompt is never touched. A system text can't
// change without its old text added there: tests/prompts.test.js holds today's fingerprints (JustDirect's shape — its
// dev database planned all day with its first prompts, 2026-11-08).

const SUGGEST_TITLE_SYSTEM = `You suggest a title for a note.
Reply with the title only: at most eight words, no quotation marks, no ending punctuation.
Write it in the language the note is written in.`;

/** {action id: [earlier system texts, byte for byte]} — empty until a prompt above is revised. */
export const FEATURE_PROMPT_HEALS = {};

export const DEFAULT_FEATURE_PROMPTS = {
  "notes.suggestTitle": {
    feature: "notes.suggestTitle",
    system: SUGGEST_TITLE_SYSTEM,
    user_template: "{{body}}",
    json_mode: false,
  },
};
