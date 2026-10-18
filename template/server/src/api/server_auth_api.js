// SPDX-License-Identifier: MIT
// GET/PUT /v1/server-auth — the access tokens (Settings → Server), the family's door (docgen built
// it first, 2026-08-05): bearer tokens gating /v1/* when the server runs exposed. Off (no tokens)
// by default. The kit's bearer guard leaves this route and /v1/health open from this machine unless
// tokens are required there too, so the local user can never lock themselves out.

import { Hono, input } from "@delebash/core/platform";
import { getLogger } from "@delebash/core/platform/log";
import { opt, strictObject, T } from "@delebash/core/platform/schema";
import { getDb } from "../app_state.js";
import { readAuth } from "../auth.js";
import { setSetting } from "../database/settings.js";

const log = getLogger("family_template.server_auth");

export const AuthIn = strictObject({
  tokens: T.Array(T.String({ maxLength: 200 }), { maxItems: 50 }),
  requireForLoopback: opt(T.Boolean(), false),
});

export function router() {
  const app = new Hono();

  app.get("/v1/server-auth", (c) => {
    const [tokens, requireForLoopback] = readAuth();
    return c.json({ tokens, requireForLoopback });
  });

  app.put("/v1/server-auth", input({ body: AuthIn }), (c) => {
    const body = c.req.valid("json");
    const cfg = { tokens: body.tokens.filter((t) => t.trim()), requireForLoopback: body.requireForLoopback };
    setSetting(getDb(), "auth", cfg);
    // how many, never which — a token is a secret (app-structure §15)
    log.info(`access tokens changed: ${cfg.tokens.length} set${cfg.requireForLoopback ? ", required on this machine too" : ""}`);
    return c.json(cfg);
  });

  return app;
}
