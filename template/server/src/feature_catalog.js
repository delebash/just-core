// SPDX-License-Identifier: MIT
// The app's AI features — what AI Settings → "Routing by feature" lists (app-structure §8), handed
// to installLlm. Each feature's ACTION points at an engine preset (seed_presets.js
// DEFAULT_FEATURE_PRESETS) that owns the provider, the model and every tunable; its prompt row is
// seed_feature_prompts.js. A feature is registered the day it calls the engine — a routing row
// for a feature that can't route is a lie (§11).
//
// `label` and `hint` are the words the user meets (the copy law, §11): outcomes, never internal
// terms. They are database seed data, English for now (§11: vue-i18n can't reach seeded rows yet).

import { FeatureCatalogEntry } from "@delebash/core/llm";

export const FEATURE_CATALOG = [
  // The Notes page's "Suggest a title" (pages/NotesPage.vue through the kit's runAiFeature): the
  // action key is the feature key, so the Workbench shows this label for it.
  FeatureCatalogEntry({
    key: "notes.suggestTitle",
    label: "Suggest a note title",
    hint: "Suggests a short title for a note from what it says — the Suggest a title button in the note editor.",
    group: "Notes",
  }),
];
