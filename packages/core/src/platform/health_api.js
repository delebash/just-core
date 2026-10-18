// SPDX-License-Identifier: MIT
// The shared GET /v1/health — one router for every family app (app-structure §14, §15).
//
// The base wire is the family's boot-gate contract, read by the kit's checkServer() and by the
// desktop shell (which stops a listener on the app's port only when it answers with the app's
// own `product`): {status: "ok", product, version, apiVersion}. An app's own numbers ride
// `extras` — JustWrite's dataDir/dbReady, JustVoice's engines — merged after the base fields.
// Before 2026-10-18 each app wrote its own copy of this route.

import { Hono } from "hono";

/**
 * Build the /v1/health router.
 *   - `product`  — the app's product name (the shell matches it).
 *   - `version`  — the app's version (its server/src/version.js: a JSON import of package.json).
 *   - `extras(c)` — optional, sync or async: the app's extra fields.
 */
export function makeHealthRouter({ product, version, apiVersion = "v1", extras = null, path = "/v1/health" }) {
  const app = new Hono();
  app.get(path, async (c) => {
    const more = extras ? await extras(c) : null;
    return c.json({ status: "ok", product, version, apiVersion, ...(more || {}) });
  });
  return app;
}
