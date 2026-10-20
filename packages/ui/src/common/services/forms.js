// SPDX-License-Identifier: MIT
// One validation contract from the server to the form (app-structure §15). A route checks its
// body against a TypeBox schema (the kit's `input()`); the form imports the SAME schema object
// from the app's server package and asks `schemaRules(schema)` for Quasar `rules` — required,
// lengths, patterns, number ranges, choices — worded from the kit's catalog
// (`kit.validation.*`) in the app's language. What only the server can know (a duplicate name)
// comes back as a 422 or a problem, and `fieldErrors(err)` puts each field's message under its
// field. Quasar's form validation: quasar.dev/vue-components/form,
// quasar.dev/vue-components/input (internal validation).

import { kitT } from "./kitI18n.js";

const FORMATS = {
  email: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
  uri: /^[a-z][a-z0-9+.-]*:\S+$/i,
};

const isEmpty = (v) => v === undefined || v === null || v === "" || (Array.isArray(v) && v.length === 0);
// ajv counts characters as code points, so a form does too (an emoji is one character).
const charCount = (v) => [...String(v)].length;

/** The non-null branch of a nullable union, and whether null is allowed. */
function unwrap(schema) {
  const branches = schema?.anyOf || schema?.oneOf;
  if (!Array.isArray(branches)) return { s: schema || {}, nullable: schema?.type === "null" };
  const rest = branches.filter((b) => b?.type !== "null");
  const nullable = rest.length < branches.length;
  // A union of constants is a choice (`literal(...)` in the kit's schema helpers).
  if (rest.length > 1 && rest.every((b) => b && Object.hasOwn(b, "const"))) {
    return { s: { enum: rest.map((b) => b.const) }, nullable };
  }
  return { s: rest[0] || {}, nullable };
}

function rulesFor(raw, required, t) {
  const { s, nullable } = unwrap(raw);
  const rules = [];
  if (required && !nullable) rules.push((v) => !isEmpty(v) || t("kit.validation.required"));
  const type = Array.isArray(s.type) ? s.type.find((x) => x !== "null") : s.type;

  if (type === "string") {
    if (s.minLength != null) rules.push((v) => isEmpty(v) || charCount(v) >= s.minLength || t("kit.validation.minLength", { min: s.minLength }, s.minLength));
    if (s.maxLength != null) rules.push((v) => isEmpty(v) || charCount(v) <= s.maxLength || t("kit.validation.maxLength", { max: s.maxLength }, s.maxLength));
    if (s.pattern) {
      const re = new RegExp(s.pattern, "u");
      rules.push((v) => isEmpty(v) || re.test(String(v)) || t("kit.validation.pattern"));
    }
    if (s.format && FORMATS[s.format]) rules.push((v) => isEmpty(v) || FORMATS[s.format].test(String(v)) || t(`kit.validation.${s.format}`));
  }
  if (type === "integer" || type === "number") {
    const num = (v) => (typeof v === "number" ? v : Number(String(v).trim()));
    rules.push((v) => isEmpty(v) || Number.isFinite(num(v)) || t("kit.validation.number"));
    if (type === "integer") rules.push((v) => isEmpty(v) || Number.isInteger(num(v)) || t("kit.validation.integer"));
    if (s.minimum != null) rules.push((v) => isEmpty(v) || num(v) >= s.minimum || t("kit.validation.min", { min: s.minimum }));
    if (s.maximum != null) rules.push((v) => isEmpty(v) || num(v) <= s.maximum || t("kit.validation.max", { max: s.maximum }));
    if (s.exclusiveMinimum != null) rules.push((v) => isEmpty(v) || num(v) > s.exclusiveMinimum || t("kit.validation.gt", { min: s.exclusiveMinimum }));
    if (s.exclusiveMaximum != null) rules.push((v) => isEmpty(v) || num(v) < s.exclusiveMaximum || t("kit.validation.lt", { max: s.exclusiveMaximum }));
  }
  if (type === "array") {
    if (s.minItems != null) rules.push((v) => isEmpty(v) && !required ? true : (v || []).length >= s.minItems || t("kit.validation.minItems", { min: s.minItems }, s.minItems));
    if (s.maxItems != null) rules.push((v) => (v || []).length <= s.maxItems || t("kit.validation.maxItems", { max: s.maxItems }, s.maxItems));
  }
  if (Array.isArray(s.enum)) rules.push((v) => isEmpty(v) || s.enum.includes(v) || t("kit.validation.oneOf"));
  if (Object.hasOwn(s, "const")) rules.push((v) => isEmpty(v) || v === s.const || t("kit.validation.oneOf"));
  // Whether the schema takes null, for a control whose empty value IS null and can't be left out
  // (UiNumber: an emptied box in a settings patch was sent as null and refused, 422 — the sixteenth
  // review, 2026-10-20). Not enumerable: the array stays Quasar's plain list of rules.
  Object.defineProperty(rules, "nullable", { value: nullable || (Array.isArray(raw?.type) && raw.type.includes("null")) });
  return rules;
}

/**
 * Quasar `rules` for every property of an object schema: `{ field: [rule, …] }`, each rule
 * `(value) => true | message`. Use with `lazy-rules` on the input and `QForm`'s submit.
 * `t` defaults to the kit's translator (the app's vue-i18n instance once installLlmUi ran).
 */
export function schemaRules(schema, { t = kitT } = {}) {
  const props = schema?.properties || {};
  const required = new Set(schema?.required || []);
  const out = {};
  for (const [name, raw] of Object.entries(props)) out[name] = rulesFor(raw, required.has(name), t);
  return out;
}

/** One server-side field error worded in the app's language (falls back to the server's text). */
export function fieldMessage(e, { t = kitT } = {}) {
  const ctx = e?.ctx || {};
  switch (e?.type) {
    case "missing":
      return t("kit.validation.required");
    case "string_too_short":
      return ctx.min_length != null ? t("kit.validation.minLength", { min: ctx.min_length }, ctx.min_length) : e.msg;
    case "string_too_long":
      return ctx.max_length != null ? t("kit.validation.maxLength", { max: ctx.max_length }, ctx.max_length) : e.msg;
    case "greater_than_equal":
      return ctx.ge != null ? t("kit.validation.min", { min: ctx.ge }) : e.msg;
    case "less_than_equal":
      return ctx.le != null ? t("kit.validation.max", { max: ctx.le }) : e.msg;
    case "greater_than":
      return ctx.gt != null ? t("kit.validation.gt", { min: ctx.gt }) : e.msg;
    case "less_than":
      return ctx.lt != null ? t("kit.validation.lt", { max: ctx.lt }) : e.msg;
    case "string_pattern_mismatch":
      return t("kit.validation.pattern");
    case "int_parsing":
    case "int_type":
    case "int_from_float":
      return t("kit.validation.integer");
    case "float_parsing":
    case "float_type":
      return t("kit.validation.number");
    case "literal_error":
      return t("kit.validation.oneOf");
    default:
      return e?.msg || "";
  }
}

/**
 * A failed request's field errors, keyed by field: `{ title: "At least 3 characters" }` — the
 * location after its part ("body", "query", "path"), nested fields joined with dots; the first
 * error per field wins. Bind each to its input's `:error` / `:error-message`.
 */
export function fieldErrors(err, { t = kitT } = {}) {
  const out = {};
  for (const e of err?.errors || []) {
    const loc = Array.isArray(e?.loc) ? e.loc : [];
    const field = (["body", "query", "path", "header"].includes(loc[0]) ? loc.slice(1) : loc).join(".");
    if (!field || field in out) continue;
    out[field] = fieldMessage(e, { t });
  }
  return out;
}
