// SPDX-License-Identifier: MIT
// The default prompt of each AI action (app-structure §8, §11: a "prompt-row-owned" feature) —
// seeded into the shared `feature_prompts` table insert-if-missing, then read from the database
// on every run, so the AI Lab can edit and save it. Keyed by the ACTION id; each row names its
// routing `feature`, the `system` prompt, the `user_template` ({{var}} placeholders the caller
// fills — runAiFeature's `variables`) and its JSON contract (`json_mode`). Every tunable is the
// engine preset's (seed_presets.js), never the prompt's.
//
// The prompt text is what the model reads, so it stays English on purpose (§Q.11).

const SUGGEST_TITLE_SYSTEM = `You suggest a title for a note.
Reply with the title only: at most eight words, no quotation marks, no ending punctuation.
Write it in the language the note is written in.`;

export const DEFAULT_FEATURE_PROMPTS = {
  "notes.suggestTitle": {
    feature: "notes.suggestTitle",
    system: SUGGEST_TITLE_SYSTEM,
    user_template: "{{body}}",
    json_mode: false,
  },
};
