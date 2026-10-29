// SPDX-License-Identifier: MIT
// A resource's version for HTTP conditional requests (RFC 9110 §13.1.1 — the finish list's C24, 2026-10-29): the kit's
// one way, moved here from just-house-paint's outlines.js. A strong ETag made from the rows the resource's version is
// (stable across a restart, the same for the same data); a write sends the version it was made on (If-Match) and one
// made on another is refused 412, in the app's own words.
import { expect, test } from "vitest";
import { ApiError } from "../src/platform/errors.js";
import { checkIfMatch, etagOf } from "../src/platform/versions.js";

test("etagOf: a strong, quoted tag — the same for the same state, another for another", () => {
  const a = etagOf({ id: "n1", title: "a", updatedAt: "2026-10-29T10:00:00Z" });
  expect(a).toMatch(/^"[A-Za-z0-9_-]{22}"$/);
  expect(etagOf({ id: "n1", title: "a", updatedAt: "2026-10-29T10:00:00Z" })).toBe(a);
  expect(etagOf({ id: "n1", title: "b", updatedAt: "2026-10-29T10:00:00Z" })).not.toBe(a);
});

test("checkIfMatch: no If-Match or * passes; the current version passes; another version is a 412 in the given words", () => {
  const now = etagOf({ v: 2 });
  const words = { type: "note-changed", title: "This note was changed in another window", detail: "Your change wasn't saved — the note is shown as it is now" };
  expect(() => checkIfMatch(undefined, now, words)).not.toThrow();
  expect(() => checkIfMatch("*", now, words)).not.toThrow();
  expect(() => checkIfMatch(`"x", ${now}`, now, words)).not.toThrow(); // one of a list
  let err;
  try {
    checkIfMatch(etagOf({ v: 1 }), now, words);
  } catch (e) {
    err = e;
  }
  expect(err).toBeInstanceOf(ApiError);
  expect(err).toMatchObject({ statusCode: 412, slug: "note-changed", title: words.title, detail: words.detail });
  // a weak tag never matches (If-Match compares strongly)
  expect(() => checkIfMatch(`W/${now}`, now, words)).toThrow();
});
