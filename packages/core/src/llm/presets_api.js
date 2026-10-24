// SPDX-License-Identifier: MIT
// The shared engine-preset router — the port of llm/presets_api.py (the 2026-06-29 lab +
// preset model, narrowed by the §7.1 switches⇄params lock, 2026-07-08).
//
// An ENGINE PRESET = a reusable ask-config (model + per-request params + long-tail
// samplers) built and saved in the Lab. It is the source of truth for everything a task can
// own. It holds NO launch switches: launch config belongs to the MODEL × machine tune stack
// (`switch_resolve` — global bundles → class_tunes → model_tunes), edited in Tune & measure,
// because a loaded model is one process with one set of launch flags shared by every task
// that points at it.
//
// An ACTION resolves its preset via a two-tier lookup (2026-07-15, one source — the task tier
// is gone): its own ref (FeaturePresetRef) → the global default preset (the
// `default_preset_id` RunnerSetting).
//
// The PROMPT is NOT here — it lives on the feature (FeaturePrompt). Long-tail samplers are a
// variable-cardinality child.

import { randomUUID } from "node:crypto";
import { Hono } from "hono";
import { HttpError, RequestValidationError } from "../platform/errors.js";
import { model, nullable, opt, T } from "../platform/models.js";
import { pyOr, strip, strRepr, truthy, ValueError } from "../platform/py.js";
import { pyStrScalar } from "../platform/pyjson.js";
import { input } from "../platform/server.js";
import * as seed from "./seed.js";
import * as stores from "./stores.js";

/** One long-tail sampler key-value in a preset. `flagName` rides the per-call `extra`. */
export const PresetFlagRow = T.Object({
  flagName: T.String(),
  flagValue: opt(T.String(), ""),
});

/** A reusable ask-config shared by the actions that point at it: model + request params +
 * sampler tail. The Lab builds these; features point at them. No launch switches (§7.1). */
export const EnginePresetRow = T.Object({
  id: opt(T.String(), ""),
  name: opt(T.String(), ""),
  providerId: opt(T.String(), ""),
  model: opt(T.String(), ""),
  // Plane-2 per-request params:
  temperature: opt(nullable(T.Number()), null),
  topP: opt(nullable(T.Number()), null),
  maxTokens: opt(T.Integer(), 0), // 0 → no cap
  reasoningEffort: opt(T.String(), ""), // "" | low | medium | high | xhigh | max
  think: opt(T.Boolean(), false), // STORED (U2-T3): thinking on/off, no longer derived from the level
  // How an app's AI steps treat this model (decided 2026-10-10, JustVoice's one-click plan §3):
  // "" follows the provider — a provider on this machine is "local", a metered cloud one
  // "frontier" (preset_resolve.presetRecipe) — or "local" / "frontier" as the user sets it.
  recipe: opt(T.String(), ""),
  samplers: opt(T.Array(PresetFlagRow), []), // long-tail Plane-2 samplers
  // The model's kind (llm · image · vision — runner/runtimes.js) and its kind's own settings: for an image model
  // `{steps, cfg, strength, sampler, seed}` (preset_params.js). A chat preset's are its fields above.
  kind: opt(T.String(), "llm"),
  params: opt(T.Record(T.String(), T.Any()), {}),
  builtIn: opt(T.Boolean(), false),
  position: opt(T.Integer(), 0),
  // READ-ONLY, filled at list time (D4-1 leg 3): the model this preset's FACTORY seed points
  // at (the app's registered library, by id; "" for user-created presets). Clients use it to
  // tell "differs from factory" honestly — writes ignore it.
  factoryModel: opt(T.String(), ""),
  // The host's catalog key for a seeded preset still under its seeded name — a screen shows the
  // name in the app's language; "" once renamed (the seeded-words plan, 2026-10-18).
  nameKey: opt(T.String(), ""),
});

// An action's key and a preset's id are short names (the twentieth review: a 1,000,000-character id was stored).
const KEY_MAX = 200;
const ID_MAX = 100;

export const FeatureAssignment = T.Object({
  featureKey: T.String({ maxLength: KEY_MAX }), // the ACTION id
  presetId: opt(T.String({ maxLength: ID_MAX }), ""), // "" → clear the ref (the feature falls to the default preset)
});

/** Bulk-clear the per-feature overrides for a set of features so each falls back to the
 * default preset (used by the per-feature Reset). */
export const FeatureClearRequest = T.Object({
  featureKeys: opt(T.Array(T.String({ maxLength: KEY_MAX }), { maxItems: 1000 }), []),
});

export const DefaultAssignment = T.Object({
  presetId: opt(T.String({ maxLength: ID_MAX }), ""),
});

export const PresetsResponse = T.Object({
  presets: T.Array(EnginePresetRow),
});

export const AssignmentsResponse = T.Object({
  defaultPresetId: opt(T.String(), ""),
  features: opt(T.Record(T.String(), T.String()), {}), // action → preset_id (the one-source per-action assignment)
});

// The two host boundaries (Python's Protocols), as the methods the router calls:
//   EnginePresetStore: list() → EnginePresetRow[], save(row) → row (upsert by id; assigns an
//     id when empty), delete(presetId)
//   FeaturePresetRefStore: list() → {action: presetId}, set(featureKey, presetId) ("" clears)

const PARAMS = T.Object({ preset_id: T.String() });
const KEY_PARAMS = T.Object({ key: T.String() });

/**
 * CRUD for engine presets + the two assignment layers (default · per-action ref) + the
 * factory resets. Mutating calls return the full list/assignments so the UI re-renders from
 * one response. `resetAllFn` restores all built-in presets + seeded refs + the default;
 * `resetOneFn(presetId)` resets ONE built-in preset (throws ValueError for a custom one).
 */
export function makePresetsRouter(getPresets, getDefault, setDefault, getRefs, resetAllFn = null, resetOneFn = null) {
  const app = new Hono();
  // An assignment names a preset that exists and an action the app has (the twentieth review: a feature assigned to a
  // missing preset answered 500 — FOREIGN KEY failed —, the default stored any id, any key was taken).
  const refuse = (field, msg) => new RequestValidationError([{ type: "value_error", loc: ["body", field], msg }]);
  const checkPreset = (presetId) => {
    if (presetId && !getPresets().list().some((p) => p.id === presetId)) throw refuse("presetId", `No preset with the id ${strRepr(presetId)}`);
  };
  // the app's actions: its feature catalog's keys, the actions its seed routes, its prompts' keys — and the ones already
  // assigned (a ref an earlier version made). An app that registered none takes any key, as before.
  const knownActions = () =>
    new Set([
      ...seed.appFeatureCatalog().map((e) => e.key),
      ...Object.keys(seed.appFeaturePresets() || {}),
      ...Object.keys(seed.appFeaturePrompts() || {}),
      ...Object.keys(getRefs().list() || {}),
    ]);
  const checkAction = (featureKey) => {
    const known = knownActions();
    if (known.size && !known.has(featureKey)) throw refuse("featureKey", `No AI feature with the key ${strRepr(featureKey)}`);
  };
  const presets = (kind = "llm") => {
    const rows = getPresets().list({ kind });
    // D4-1 leg 3: annotate each row with its factory model (the app's registered seed
    // library, joined by preset id) so the wizard can detect "differs from factory"
    // without a second endpoint.
    const factory = new Map(
      seed.appEnginePresets().map((p) => [pyStrScalar(pyOr(p.id, "")), pyStrScalar(pyOr(p.model, ""))]),
    );
    for (const r of rows) r.factoryModel = factory.get(r.id) ?? "";
    for (const r of rows) r.nameKey = seed.seededPresetNameKey(r);
    return model(PresetsResponse, { presets: rows });
  };

  const assignments = () => model(AssignmentsResponse, { defaultPresetId: getDefault(), features: getRefs().list() });

  // ── presets CRUD ──────────────────────────────────────────────────────────
  // ?kind=image lists the image presets; without it, the chat presets every screen has always listed
  app.get("/v1/ai/engine-presets", async (c) => c.json(presets(c.req.query("kind") || "llm")));

  app.post("/v1/ai/engine-presets", input({ body: EnginePresetRow }), async (c) => {
    const body = c.req.valid("json");
    if (!strip(body.name)) throw new HttpError(400, "name is required");
    body.id = randomUUID().replaceAll("-", "").slice(0, 12);
    getPresets().save(body);
    return c.json(presets());
  });

  app.put("/v1/ai/engine-presets/:preset_id", input({ params: PARAMS, body: EnginePresetRow }), async (c) => {
    const presetId = c.req.valid("param").preset_id;
    if (!getPresets().list().some((p) => p.id === presetId)) {
      throw new HttpError(404, `preset ${strRepr(presetId)} not found`);
    }
    const body = c.req.valid("json");
    body.id = presetId;
    getPresets().save(body);
    return c.json(presets());
  });

  app.delete("/v1/ai/engine-presets/:preset_id", input({ params: PARAMS }), async (c) => {
    getPresets().delete(c.req.valid("param").preset_id);
    return c.json(presets());
  });

  // ── factory resets (Presets page: Reset all · per-preset Reset) ────────────
  // Restore all built-in presets + the seeded per-action refs + the default preset to
  // factory (custom presets kept).
  app.post("/v1/ai/engine-presets/reset", async (c) => {
    if (resetAllFn !== null) await resetAllFn();
    return c.json(presets());
  });

  // Reset ONE built-in preset to factory (params + samplers). 400 on a custom preset
  // (nothing to reset to).
  app.post("/v1/ai/engine-presets/:preset_id/reset", input({ params: PARAMS }), async (c) => {
    if (resetOneFn !== null) {
      try {
        await resetOneFn(c.req.valid("param").preset_id);
      } catch (e) {
        if (e instanceof ValueError) throw new HttpError(400, e.message);
        throw e;
      }
    }
    return c.json(presets());
  });

  // ── assignments (default · per-action ref) ─────────────────────────────────
  app.get("/v1/ai/preset-assignments", async (c) => c.json(assignments()));

  app.put("/v1/ai/preset-assignments/default", input({ body: DefaultAssignment }), async (c) => {
    checkPreset(c.req.valid("json").presetId);
    setDefault(c.req.valid("json").presetId);
    return c.json(assignments());
  });

  // Set (or clear, presetId="") a feature's per-feature preset OVERRIDE — the top tier of
  // the cascade. Keyed by ACTION id.
  app.put("/v1/ai/preset-assignments/feature", input({ body: FeatureAssignment }), async (c) => {
    const body = c.req.valid("json");
    if (!strip(body.featureKey)) throw new HttpError(400, "featureKey is required");
    checkAction(body.featureKey);
    checkPreset(body.presetId);
    getRefs().set(body.featureKey, body.presetId);
    return c.json(assignments());
  });

  // Clear the per-feature override for each given feature so it re-inherits the default
  // preset (the per-feature Reset path).
  app.post("/v1/ai/preset-assignments/clear-features", input({ body: FeatureClearRequest }), async (c) => {
    const refs = getRefs();
    for (const key of c.req.valid("json").featureKeys) {
      if (strip(key)) refs.set(key, "");
    }
    return c.json(assignments());
  });

  // Restore ONE feature to its DEFAULTS — the per-feature 'Reset to default':
  // (1) its SEEDED per-action ref (the factory action→preset map — the feature's OWN
  // default preset, e.g. grounded-chat, NOT a clear to the global default), AND
  // (2) that built-in preset's PARAMS refreshed to the shipped seed, with provider+model
  // set to the GLOBAL routing default (the user's 2026-07-16 decision: a real reset is
  // FULL, not "keep"; a fresh box with no default set keeps the seed's empty model → needs
  // Quick Setup). A feature with no seeded ref falls to the global default (empty ref).
  app.post("/v1/ai/preset-assignments/feature/:key/reset", input({ params: KEY_PARAMS }), async (c) => {
    const key = c.req.valid("param").key;
    if (!strip(key)) throw new HttpError(400, "feature key is required");
    const fp = seed.appFeaturePresets();
    const seeded = Object.hasOwn(fp, key) ? fp[key] : "";
    getRefs().set(key, seeded);
    if (truthy(seeded) && resetOneFn !== null) {
      let reset = true;
      try {
        await resetOneFn(seeded); // factory params + samplers (blanks model to the seed "")
      } catch (e) {
        if (!(e instanceof ValueError)) throw e;
        reset = false; // a custom ref id has no factory — leave the ref only
      }
      if (reset) {
        const d = stores.getRoutingStore().getRouting().default;
        if (d.model) {
          const row = getPresets()
            .list()
            .find((p) => p.id === seeded);
          if (row !== undefined) {
            row.providerId = d.llmId || row.providerId;
            row.model = d.model;
            getPresets().save(row);
          }
        }
      }
    }
    return c.json(assignments());
  });
  return app;
}
