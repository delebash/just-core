// SPDX-License-Identifier: MIT
// A resource's version, for HTTP conditional requests (RFC 9110 §13.1.1 — www.rfc-editor.org/rfc/rfc9110#section-13.1.1):
// the server answers a resource with its version (an ETag — a strong one), a write sends the version it was made on
// (If-Match), and one made on another version is refused 412 Precondition Failed; the screen reads the resource again.
// Two windows on one server otherwise saved over each other's changes (just-house-paint's eleventh review; the
// template's notes — the finish list's C24, 2026-10-29). Moved here from just-house-paint's outlines.js, the kit's one
// way (app-structure §19, "Another window changed something").
//
// The version is made from the rows the resource is — never a counter in memory: it stays across a restart (a
// counter refused every window's next write after the tray's Restart — house-paint's twelfth review) and a restore of
// the same data gives the same one (RFC 9110 §8.8.3).

import { createHash } from "node:crypto";
import { ApiError } from "./errors.js";

/** A strong ETag for `state` — any JSON value (the rows a resource's version is made from): quoted, 22 characters of
 *  its SHA-256 in base64url. */
export function etagOf(state) {
  const hash = createHash("sha256").update(JSON.stringify(state ?? null)).digest("base64url");
  return `"${hash.slice(0, 22)}"`;
}

/**
 * Refused (412) when `ifMatch` — a request's If-Match header — names another version than `current`. No If-Match, or
 * `*`: the write is unconditional (a client that doesn't send one, a toggle that should always land). A weak tag never
 * matches (If-Match compares strongly). The refusal is the app's own words: `{type, title, detail, extra}`.
 */
export function checkIfMatch(ifMatch, current, { type = "changed-elsewhere", title = "Changed in another window", detail = "", extra = null } = {}) {
  if (!ifMatch || ifMatch.trim() === "*") return;
  const tags = ifMatch.split(",").map((s) => s.trim());
  if (!tags.includes(current)) throw new ApiError(412, type, title, detail, extra);
}
