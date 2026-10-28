// SPDX-License-Identifier: MIT
// A better default reaches an install made before it (docs/plans/2026-10-24-engines-the-llama-way.md F2 — moved here
// from just-house-paint's database/previous_defaults.js and upgradeSettings). Seeding is insert-if-missing, so a
// setting keeps the value it was first given; when a default changes, the app keeps the OUTGOING default's
// fingerprint, and a setting still holding one — its owner never edited it — takes today's default. A value the owner
// changed is never touched. The app's test holds today's fingerprint of every default (`defaultsFingerprints`), so a
// default can't change without its old fingerprint being kept. A setting the app no longer has, whose value now lives
// elsewhere (a kit preset's param, a kit runner setting), is carried there once and its row goes (`retireSettings`).
import { createHash } from "node:crypto";

/** JSON with every object's keys sorted, so two equal values always print the same. */
export function canonicalJson(value) {
  return JSON.stringify(value, (_k, v) =>
    v && typeof v === "object" && !Array.isArray(v) ? Object.fromEntries(Object.keys(v).sort().map((k) => [k, v[k]])) : v,
  );
}

/** A value's fingerprint: the first 16 hex digits of the SHA-256 of its canonical JSON. */
export const fingerprint = (value) => createHash("sha256").update(canonicalJson(value)).digest("hex").slice(0, 16);

/** Every default's fingerprint, `{key: fingerprint}` — what an app's test holds as today's. */
export const defaultsFingerprints = (defaults) => Object.fromEntries(Object.entries(defaults).map(([k, v]) => [k, fingerprint(v)]));

/**
 * A setting still holding an earlier default takes today's. `defaults`: `{key: today's value}`; `previous`: `{key:
 * [earlier defaults' fingerprints]}`; `getSetting(h, key)` / `setSetting(h, key, value)`: the app's settings store.
 * Runs in one transaction on `h` (the kit's database handle). Returns the keys it upgraded.
 */
export function upgradeSettings(h, { defaults, previous, getSetting, setSetting }) {
  const upgraded = [];
  h.tx(() => {
    for (const [key, earlier] of Object.entries(previous)) {
      if (!(key in defaults)) continue;
      const stored = getSetting(h, key);
      if (stored === undefined || !earlier.includes(fingerprint(stored))) continue;
      setSetting(h, key, defaults[key]);
      upgraded.push(key);
    }
  });
  return upgraded;
}

/**
 * Settings an app no longer has, whose values moved elsewhere — a kit preset's param, a kit runner setting (the engines
 * plan, round C). `moves`: `{key: (value) => void}`, each run for a setting that still has a row, which then goes; a
 * move that throws keeps its row (tried again at the next seed) and the others still run. Run at every seed, after the
 * kit's rows are seeded: an older backup restored carries its values over too. `getSetting(h, key)` /
 * `deleteSetting(h, key)`: the app's settings store. Returns `{ moved: [key], kept: [{ key, error }] }`.
 */
export function retireSettings(h, moves, { getSetting, deleteSetting }) {
  const moved = [];
  const kept = [];
  for (const [key, move] of Object.entries(moves)) {
    const value = getSetting(h, key);
    if (value === undefined) continue;
    try {
      move(value);
    } catch (error) {
      kept.push({ key, error });
      continue;
    }
    deleteSetting(h, key);
    moved.push(key);
  }
  return { moved, kept };
}
