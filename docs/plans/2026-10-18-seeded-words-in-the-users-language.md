# Seeded words in the user's language — plan (2026-10-18)

**Status: PLAN — waits for the user's go.** The i18n standard left this for its own go: "Not in
this plan (next, each its own go): … database-seeded words (July decision 4: English for now)"
(`2026-10-12-i18n-standard.md`), and the 2026-10-13 ruling kept "a new project's starter content
('Part One', the starting statuses, the worldbuilding categories)" English (TASKS, "Every app and
the kit on vue-i18n"). Asked for now because the Spanish catalogs are complete (2026-10-17) and
what a Spanish screen still shows in English is these words. Found 2026-10-18 by a read-only sweep
of the four repos; the full inventory with file:line is in §2.

## 1. The rec

**A seeded row the user hasn't renamed is shown by a catalog key; a rename stores the user's
words.** The stored value stays the seed's English, so nothing changes in the database or in what
syncs, and each device shows its own language.

- *How "not renamed" is known:* the stored name still equals the seed's English — the test the kit
  already makes (`seed.js` `RENAMED_PROVIDER_NAMES`, engine presets' `name_was`). Renaming a row to
  exactly the seed's English word shows it translated, which is harmless.
- *Where it lives:* one kit helper, `seededLabel(stored, seedEnglish, key)` — the key's text while
  `stored === seedEnglish`, else `stored` — used wherever a seeded name renders. A code table that
  is never stored names its `labelKey` (the kit's `PROVIDER_PRESETS`, JustWrite's `POV_OPTIONS`).
- *Precedents in the family:* hardware classes (`name: ""` seeded, `classKeyLabel()` shows a key
  until the user names one — `packages/ui/src/classTunes.js:71-80`); the global launch bundles
  (`LuGlobalSwitches.vue:30-33`, a key by `appliesTo`, the stored label as fallback); JustWrite's
  Architecture documents (a key by id — the page, and the sidebar since 2026-10-18).

**The attack, and what it changed:**
- *Translate when created* (what the 2026-10-13 ruling does for new-thing names) would write a
  Spanish book's statuses in Spanish into synced data, and an English device would show them in
  Spanish; seeded rows exist before anyone picks a language. Kept for new-thing names only.
- *Store "" for seeded names* (the hardware-class shape) is the cleanest meaning, but every
  existing database holds the English, so it needs a data step per table and app; the
  equality test needs none. Rejected for now; the helper can switch to it later without
  touching a screen.
- *Translate a part titled "Part One"* — a part title is the writer's text, typed or not; left
  English (the one starter word kept as data).

## 2. What it covers (the sweep, 2026-10-18)

| Repo | Seeded words | Seeded at | Shown at |
|---|---|---|---|
| JustWrite | statuses To do, Draft, Revise, Done, Open, Resolved, Abandoned | `src/stores/project.js:501-510` `DEFAULT_STATUSES`; the demo book | `StatusSelect.vue:43`, `Sidebar.vue:159-161`, the pages' status filters, `HomeShelfPage.vue:118-119` |
| JustWrite | worldbuilding categories Geography … Lore & myth | `project.js:547-554` `DEFAULT_WB_CATEGORIES` | `Sidebar.vue:196-198`, Worldbuilding, Settings |
| JustWrite | a note's empty tag filled with "note" on save | `server/src/book_io.js:370`; `models_schema.js` DEFAULT 'note' | Notes, the sidebar, search — store "" instead |
| JustWrite | AI engine preset names (Generate prose, Edit prose, …), AI feature and action labels on the AI page | `server/src/seed_presets.js:48-89`; `feature_catalog.js`; `seed_feature_prompts.js` `ACTION_META`/`ACTION_LABELS` | the kit's AI page (Workbench, Lab, Quick Setup) — keys mostly exist (`richEditor.actionName.*`, `*.chipLabel`) |
| the kit | provider names ("Built-in provider — llama.cpp", …) | `packages/core/src/llm/seed.js:157-176` | `AiModelsArea.vue:745`, `LuModelPicker.vue:100`, `useRouting.js:22` |
| the kit | knob help; measurement-run labels | `seed.js:466-570` (rewritten every boot); `runner/lifecycle.js:3372,3389,3564` | `KnobGrid.vue`, `LuMeasureHistory.vue:117` |
| docgen | feature labels (Translate, Review, Confirm), preset names | `server/src/app.js:71-108` | the kit's AI page |
| JustVoice | effect presets (Robotic, Radio, …) — **matched by name in its seeder**, so they need a key before any rename-free display; "Narrator"; feature and preset names | `server/src/database/seed.js:23-74`; `api/speakers_api.js:114-118`; `feature_catalog.js`, `seed_presets.js` | `EffectsPage.vue:191`, the Studio cast |

JustVoice's own screens aren't translated yet (an en.json of about 3 KB, no es.json), so its rows wait
for that. Model-catalog descriptions stay English (ruled: `LuModelCatalog.vue:845-846`).

**Already fixed 2026-10-18, as the existing rulings say** (JustWrite `52b6cf1` and after): the
marker categories (a code table — it names its keys now); the Architecture documents in the
sidebar and search (a fixed set, shown by key as the page does); a new tag-vocabulary entry
("New tag") and a new note's tag — new-thing names, written in the app's language when created.

## 3. Tasks (once there's a go)

1. The kit: `seededLabel()` and its test; provider names, knob help and measurement labels through
   it or through keys (knob help is rewritten every boot — keys by `flag_name` lose nothing).
2. JustWrite: statuses and worldbuilding categories through `seededLabel()` everywhere they render
   (one helper in the store's getters, so every screen agrees — the Analysis donut and Home today
   show keys by id even after a rename, and disagree with the sidebar); the AI page's preset,
   feature and action names through the keys that exist; the empty note tag stays "" on save.
3. docgen: its feature and preset names, the same way.
4. JustVoice: after its screens are translated — effect presets keyed (the seeder stops matching by
   name), "Narrator" by `role_label`.
5. Spanish for the new keys through the agentic review; each app's smoke and flows in Spanish.

## 4. Standards each piece follows

| Piece | Follows |
|---|---|
| A seeded row shown by key until renamed | ours: the kit's hardware classes (`classKeyLabel`) and its rename test (`RENAMED_PROVIDER_NAMES`) |
| A code table's words | ours: a `labelKey` per row (the family rule, JustWrite `docs/dev/architecture-notes.md` "A table of shown words names its keys") |
| The keys and their Spanish | vue-i18n (https://vue-i18n.intlify.dev/); docgen and the agentic review |

Nothing is NOT STANDARD.
