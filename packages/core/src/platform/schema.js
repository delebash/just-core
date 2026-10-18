// SPDX-License-Identifier: MIT
// The schema helpers a route and its form share (app-structure §15). A request schema lives in
// the app's server package (`server/src/schemas/<area>.js`); the route validates with the kit's
// `input()` (server.js) and the renderer builds its form rules from the same object with the
// kit UI's `schemaRules()`. This module imports nothing but TypeBox, so it loads in the browser
// as well as in Node — `models.js` (Node-only: ajv, the pydantic conversions) re-exports it.

import Type from "typebox";

export const T = Type;

/** A field with a default (pydantic `x: X = default`); no default → may be absent. */
export function opt(schema, dflt) {
  if (dflt === undefined) return Type.Optional(schema);
  // A copy that keeps TypeBox's hidden (non-enumerable) markers, so none of them leaks
  // into the JSON Schema ajv compiles.
  const copy = Object.defineProperties({}, Object.getOwnPropertyDescriptors(schema));
  copy.default = dflt;
  return Type.Optional(copy);
}

/** `X | None`. */
export const nullable = (schema) => Type.Union([schema, Type.Null()]);

/** `Literal["a", "b"]`. */
export const literal = (...values) => Type.Union(values.map((v) => Type.Literal(v)));

/** An object that refuses unknown fields (pydantic `extra="forbid"`). */
export const strictObject = (props, options = {}) => Type.Object(props, { additionalProperties: false, ...options });
