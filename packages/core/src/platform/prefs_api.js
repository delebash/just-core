// SPDX-License-Identifier: MIT
// The shared /v1/prefs router — the renderer's preferences document, one wire for every
// same-stack app (the port of llm_runner/platform/prefs_api.py; the family settings/prefs
// split: `/v1/settings` is typed operator/server config, `/v1/prefs` is the renderer's own
// key/value document).
//
// The semantics are JustVoice's donor contract, verbatim:
//   - GET    returns the WHOLE document (`{key: value}`, values are real JSON).
//   - PATCH  is a **wholesale per-key** upsert, NOT a deep merge — a map/list entry is
//            removed by sending the smaller value (a deep merge cannot express a
//            deletion). Returns the merged document.
//   - DELETE clears the document (factory reset), 204.
//
// Storage is a host seam (the makeDataRouter pattern): the router speaks DECODED values;
// the host decides where and how they persist (JustVoice: its `prefs` table; JustWrite:
// its `settings` rows, its clear preserving the D3b folder-path keys; docgen: `pref.*`
// rows in `app_settings`, riding app.db so /v1/data covers them). Hooks may be sync or
// async.

import { Hono } from "hono";
import { RequestValidationError } from "./errors.js";
import { isJsonObject } from "./py.js";
import { readJson } from "./server.js";

// What a preference may be (the nineteenth review's fuzz, just-house-paint, 2026-10-20: a value nested 5,000 deep
// was stored, and from then every GET /v1/prefs answered 500 "Maximum call stack size exceeded" until a DELETE): a
// screen's remembered choice is small — at most this deep, this long as JSON, and this many keys in one patch.
// Since the twentieth review the document as a whole too — after the patch is merged, at most `keys` keys and `bytes`
// as JSON (three patches made GET /v1/prefs 36.9 MB) — and a key's name at most `keyChars` long (a 5,000,000-character
// one was taken).
export const PREF_LIMITS = Object.freeze({ depth: 32, bytes: 64 * 1024, keys: 200, keyChars: 200 });

/** How deep `v` nests (a scalar is 0), stopping once past `max` — never recursing on what it refuses. */
function depthOver(v, max) {
  const stack = [[v, 0]];
  while (stack.length) {
    const [x, d] = stack.pop();
    if (x === null || typeof x !== "object") continue;
    if (d + 1 > max) return true;
    for (const child of Array.isArray(x) ? x : Object.values(x)) stack.push([child, d + 1]);
  }
  return false;
}

/** The patch's keys a preference can't be: a name an object has built in, a value past the limits. */
function refusedPrefs(patch) {
  const errors = [];
  const keys = Object.keys(patch);
  if (keys.length > PREF_LIMITS.keys) errors.push({ loc: ["body"], msg: `At most ${PREF_LIMITS.keys} preferences at once`, type: "too_long" });
  for (const key of keys) {
    const value = patch[key];
    if (key === "__proto__" || key === "constructor" || key === "prototype") {
      errors.push({ loc: ["body", key], msg: "Not a name a preference can have", type: "value_error" });
    } else if (key.length > PREF_LIMITS.keyChars) {
      errors.push({ loc: ["body", key.slice(0, 40)], msg: `A preference's name is at most ${PREF_LIMITS.keyChars} characters`, type: "too_long" });
    } else if (typeof value === "number" && !Number.isFinite(value)) {
      errors.push({ loc: ["body", key], msg: "Input should be a finite number", type: "finite_number" });
    } else if (depthOver(value, PREF_LIMITS.depth)) {
      errors.push({ loc: ["body", key], msg: `Nested deeper than ${PREF_LIMITS.depth}`, type: "value_error" });
    } else if (JSON.stringify(value).length > PREF_LIMITS.bytes) {
      errors.push({ loc: ["body", key], msg: `Longer than ${PREF_LIMITS.bytes / 1024} KB`, type: "too_long" });
    }
  }
  return errors;
}

/**
 * Build the shared renderer-prefs router over host storage hooks.
 *   - `readAll()`        → the whole document as decoded values.
 *   - `writeMany(patch)` → upsert every given key wholesale.
 *   - `clear()`          → drop the document (the host may exempt keys it must keep).
 */
export function makePrefsRouter({ readAll, writeMany, clear, prefix = "/v1/prefs" }) {
  const app = new Hono();
  app.get(prefix, async (c) => c.json(await readAll()));

  // The body is FastAPI's `patch: dict[str, Any]`: checked here so the 422 reads as
  // pydantic's dict error (measured: dict_type), not a model's.
  app.patch(prefix, async (c) => {
    const patch = await readJson(c);
    if (patch === undefined || patch === null) {
      throw new RequestValidationError([{ loc: ["body"], msg: "Field required", type: "missing" }]);
    }
    if (!isJsonObject(patch)) {
      throw new RequestValidationError([{ loc: ["body"], msg: "Input should be a valid dictionary", type: "dict_type" }]);
    }
    const refused = refusedPrefs(patch);
    if (refused.length) throw new RequestValidationError(refused);
    // the document after the patch: within its caps — or no bigger than it is now (one already past them can shrink)
    const now = (await readAll()) || {};
    const after = { ...now, ...patch };
    const [keysNow, keysAfter] = [Object.keys(now).length, Object.keys(after).length];
    const [bytesNow, bytesAfter] = [JSON.stringify(now).length, JSON.stringify(after).length];
    const over = [];
    if (keysAfter > PREF_LIMITS.keys && keysAfter > keysNow) over.push({ loc: ["body"], msg: `The preferences would hold ${keysAfter} keys — at most ${PREF_LIMITS.keys}`, type: "too_long" });
    if (bytesAfter > PREF_LIMITS.bytes && bytesAfter > bytesNow) over.push({ loc: ["body"], msg: `The preferences would be ${Math.ceil(bytesAfter / 1024)} KB — at most ${PREF_LIMITS.bytes / 1024} KB in all`, type: "too_long" });
    if (over.length) throw new RequestValidationError(over);
    await writeMany(patch);
    return c.json(await readAll());
  });

  app.delete(prefix, async (c) => {
    await clear();
    return c.body(null, 204);
  });
  return app;
}
