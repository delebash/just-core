# Feature ↔ Model system — current state (source of truth)

**Purpose:** ONE grounded reference for how features pick their model and settings, so we stop re-deciding it
and stop working from stale memory. Every claim cites the JavaScript as of 2026-10-29 (rewritten that day from
the Python-era version — the kit's finish list, D38). Paths are under `packages/core/src/` unless they say `ui/`
(`packages/ui/src/`). When something changes, update THIS doc in the same change. Origin of the model:
`plans/archive/2026-07-15-preset-one-source-rewrite.md`, distilled into §0.

## 0. Why one source (the rationale, distilled from the rewrite plan)

- **The pre-rewrite routing was FOUR sources deep and lied to the user**: the feature → task → preset chain, an
  override tier, hidden per-action params on the prompt rows blended in with per-field-inconsistent rules, a
  dormant per-action sampler layer, and a pins tier. Demonstrated failure: change only Reasoning on one action,
  Update preset, and six of eight judgment actions silently re-tuned.
- **The task tier was pure indirection** — deleted with no legacy fallback on the user's word: "the main source
  is that a feature is the base, it has a preset, that is the truth." `default_preset_id` is a `runner_setting`
  row (`llm/stores.js` `getDefaultPresetId`, ~1667; seeded at `llm/seed.js` ~1021).
- **No preset is DEFINED, not invented**: an action with no ref and an empty default runs on the provider-default
  route with no tunables sent and think off — params are never invented on either side.
- **Effective think = the request's `think` (else the preset's) AND NOT `jsonMode`** (`llm/prompts.js`
  `_effectiveThink`, ~525-529): llama.cpp drops JSON-schema enforcement when thinking is on.
- **The feature-pin layer is retired** (2026-08-08). What remains is `resolveFeature` (`llm/dispatch.js` ~161-195):
  the action's production config → the feature's → prefer-local → the first adapter.
- **One routing surface**: "Routing by feature" and the Lab's preset bar are the only preset controls; the
  production verb is "Use in production" / "● in production".
- **The kit's tables migrate in place**: `llm/db.js` `ADDED_COLUMNS` adds a column an older database lacks (the
  presets' think, recipe, kind and params among them), applied by `createAll`; an app's own tables migrate by its
  `database/schema.js` `MIGRATIONS` (the template's).

## 1. How a feature gets its model and settings

- A **feature is an action** (`chat`, `critique`, `writerAI.tighten`, …), from the app's feature catalog
  (`installLlm({ featureCatalog })`, `llm/install.js` ~211-261). Each has a **kind** — `llm` · `image` · `vision`
  (`llm/routing_api.js` `FeatureCatalogEntry`, ~61-64); the kind decides which presets it may use.
- **Resolution** (`llm/preset_resolve.js` `resolveFeaturePresetWithSource`, ~47-54): the action's own ref
  (`feature_preset_refs`) → its parent feature's ref, when the action names one → the global `default_preset_id`.
  A ref to a deleted preset falls through to the next step (`resolveWithSource`). A single run may name its own
  preset (`body.presetId`, `llm/prompts.js` ~587-590).
- **The preset owns the model and every tunable** (`llm/presets_api.js` `EnginePresetRow`, ~38-67): `providerId`,
  `model`, temperature, topP, maxTokens, reasoningEffort, think, samplers, the **recipe**, and its **kind**
  (default `llm`) with that kind's **params**. A kind's params are `llm/preset_params.js` `PARAM_RULES`: `image` —
  steps, cfg, strength, sampler, seed; `vision` — the execution provider (GPU or CPU). A preset is assigned only to
  a feature of its kind (`presets_api.js` ~119-127). The app seeds its presets (`installLlm({ enginePresets,
  featurePresets, defaultPresetId })`); the template's chat presets seed `model: ""` (Quick Setup fills them).
- **The recipe**: `""` follows the provider — a `local` provider reads as `local`, a metered cloud one as
  `frontier` — or `local` / `frontier` as set on a feature's chip; an app reads it with `presetRecipe(preset)`
  (`preset_resolve.js` ~64-70) to choose how its steps ask the model (JustVoice's speaker attribution gives a
  frontier model its Direct route).
- **The prompt row owns only the prompt text and the JSON contract** (`llm/prompts.js` `FeaturePromptRow`, ~65-77:
  `json_mode`, `json_schema`).
- **At run time** `resolveAction` (`prompts.js` ~573-599) overlays the preset's provider, model and params;
  `dispatchArgs` (~606-625) adds think and the extras; `runAction` / `streamAction` send it; `dispatch.resolveRoute`
  applies the overrides. A local model is made ready first (`ensureLocalReady` → `runner/lifecycle.js`
  `ensureModelReady`): setting a default never loads anything.
- **An image or a vision feature** runs on its own preset of that kind only — never the chat default
  (`llm/image_dispatch.js` `resolveRuntimeFeature`: no preset assigned is a 409 naming the feature). Its routing is
  `ui/components/LuRuntimePresetPane.vue`, with the kind's params.

## 2. Per-feature model switching — supported

- Each preset carries its own `model`, so different features (through different presets) can run different
  models. You change a feature's model by editing its preset's model in the Lab (`ConfigColumn` →
  `LuModelPicker`) or by pointing the feature at another preset (Routing by feature).
- On a one-model or small-card computer every feature uses the one default; with cloud providers or a big card
  you set models per feature. The machinery doesn't force one model.

## 3. "The default model" (the Models tab)

- **Set as default** on a catalog row, Quick Setup, and a provider's Set as default call
  `modelApply.setAsDefault` (`ui/services/modelApply.js` ~132-152). It rewrites the `providerId` and `model` of
  every assigned preset that still uses the previous default — the most common model across the assigned presets
  (`dominantOf`, ~38-55) — and of every preset still blank from its seed; a preset the user pointed elsewhere is
  left alone unless the user chose to overwrite them all. Each preset keeps its own params.
- The Default badge reads that same common model (`refreshApplied`).
- The routing document's default (`llm/routing_api.js` `RoutingDefaults`, ~20-25: `llmId`, `model`, and the
  embedding's `embeddingId`, `embeddingModel`) is written for the embedding only (`setDefaultEmbedding`); nothing
  in the kit writes its chat `model` today — see §5 and the kit's TASKS, "two routing bugs".

## 4. The model picker (per provider)

- The picker lists a provider's models through `GET /v1/llm-providers/:id/models` (`llm/api.js` ~174-194), cached
  by `ui/composables/useProviderModels.js`. A cloud provider answers with its own model list; the built-in
  `local-llamacpp` answers with the **downloaded** catalog rows (`builtinProviderHealth`, ~68-104, each checked on
  disk) — not only the loaded one (#305, fixed).
- The cache fetches once (`ensureModels` skips a provider it already holds); `useRunnerModels.refresh` re-fetches
  the built-in provider's list when the set of catalog ids changes. A finished download changes a row's status,
  not that set, so an open picker misses the new model until a reload — the kit's TASKS, "two routing bugs" (2).

## 5. Reset

- **A feature's Reset** (`FeatureWorkbench.vue` → `POST /v1/ai/preset-assignments/feature/:key/reset`,
  `llm/presets_api.js` ~246-275): the feature's seeded ref back, that preset's params back to the seed
  (`seed.js` `resetPresetToFactory`), its prompt back to the seed, and its model set to the routing default's —
  only when that default has a model (~261-270). The user's decision (2026-07-16): a reset is full — preset,
  prompt, provider and model — and the model resets to the default set in the Models tab. Since §3's apply no
  longer writes the routing default's model, the reset leaves the seed's empty model today — the kit's TASKS,
  "two routing bugs" (1).
- **Reset all** (`FeatureWorkbench.vue` → `POST /v1/ai/engine-presets/reset`, ~190-193 → `seed.js`
  `resetRoutingToFactory`): every built-in preset, seeded ref and the default preset back to the seed; custom
  presets are kept; the models blank to the seed.

## 6. Reasoning

- A preset's reasoning level is sent as it is set — no hardware cap, no clamp (`llm/reasoning.js`: "never
  clamped"; the preset's own level wins). The Lab's reasoning list (`ConfigColumn` `REASONING_OPTIONS` →
  `ui/thinkingControl.js` `thinkingOptionsFor`) offers Off, each level the provider's map has with its token count
  ("Low (1024)"), and Custom. (#303, the hardware cap at the picker, is gone with the cap.)

## 7. Per-action JSON output (the "Output as JSON" checkbox)

- **It lives on the action's prompt row** (`FeaturePromptRow.json_mode`), never on a preset — a preset is shared
  across actions and must never flip one action's parser.
- **The Lab**: one savable "Output as JSON" checkbox in the config column (`ConfigColumn` `.cc-json`). Toggling it
  patches the column (the test run now), then `save-json` goes up through `CompareStrip` (every column of the
  action — json is per action) to `FeatureLab.saveJson`, which PUTs the full saved prompt with only `jsonMode`
  changed to `/v1/ai/prompts/:action` (system and userTemplate are overwritten on PUT, so the full body is
  needed); `FeatureWorkbench` updates its cached row in place.
- **At run time** the request's `jsonMode` overrides the stored contract for that call (`prompts.js` ~465, ~527);
  the saved value is what every production run uses.

## Known gaps (open)

- The two routing bugs in §3–§5 — the kit's TASKS, "Found while finishing the kit: two routing bugs".
