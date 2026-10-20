// SPDX-License-Identifier: MIT
// This app's auth seam — the settings read behind the family's bearer guard (the kit's
// `bearerAuth`, wired in app.js). The policy (the token check, loopback open unless required, the
// lockout escape for /v1/health and /v1/server-auth) lives once in the kit; what is per app is
// where the access tokens are kept: the `auth` row of the settings table
// (`{tokens: [...], requireForLoopback: bool}`), read on every /v1 request so a change applies at
// once.

import { getLogger } from "@delebash/core/platform/log";
import { getDb } from "./app_state.js";
import { getSetting } from "./database/settings.js";

const log = getLogger("family_template.auth");

/** [tokens, requireForLoopback]. No tokens = auth off; a read that fails is auth off too, so a
 * settings glitch can never lock the user out. */
export function readAuth() {
  try {
    const cfg = getSetting(getDb(), "auth");
    if (!cfg || typeof cfg !== "object" || Array.isArray(cfg)) return [[], false];
    // trimmed as the guard trims what it is sent: one stored padded (before the nineteenth review) matches again
    const tokens = Array.isArray(cfg.tokens) ? cfg.tokens.filter((t) => typeof t === "string").map((t) => t.trim()).filter(Boolean) : [];
    return [tokens, cfg.requireForLoopback === true];
  } catch (e) {
    log.warning(`the access tokens couldn't be read (treated as none): ${e?.message ?? e}`);
    return [[], false];
  }
}
