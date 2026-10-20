// SPDX-License-Identifier: MIT
// The GUI half of the family's error and validation contract (app-structure §15): form rules
// read from the route's own schema, a 422's errors put under their fields in the app's
// language, failed answers parsed into their parts, one way to show a failure, and renderer
// errors posted to the server log without loops or floods.
import { afterEach, describe, expect, test, vi } from "vitest";

vi.mock("../src/common/services/toastBridge.js", () => ({ pushToast: vi.fn() }));
vi.mock("../src/common/services/serverApi.js", () => ({ post: vi.fn(() => Promise.resolve()) }));

const { pushToast } = await import("../src/common/services/toastBridge.js");
const { parseProblem, attachProblem } = await import("../src/common/services/apiError.js");
const { schemaRules, fieldErrors } = await import("../src/common/services/forms.js");
const { reportError, errorMessage } = await import("../src/common/services/reportError.js");
const { installErrorReporting } = await import("../src/common/services/errorReporting.js");

// A stand-in translator: the key and its values, so the tests read the wording choice.
const t = (key, vals) => (vals ? `${key} ${JSON.stringify(vals)}` : key);

// The JSON Schema TypeBox builds for T.Object({ title: T.String({minLength:3,maxLength:20}),
// stars: opt(T.Integer({minimum:1,maximum:5})), kind: literal("a","b"), note: opt(nullable(T.String())) })
const NoteIn = {
  type: "object",
  required: ["title", "kind"],
  properties: {
    title: { type: "string", minLength: 3, maxLength: 20 },
    stars: { type: "integer", minimum: 1, maximum: 5 },
    kind: { anyOf: [{ const: "a", type: "string" }, { const: "b", type: "string" }] },
    note: { anyOf: [{ type: "string" }, { type: "null" }] },
    email: { type: "string", format: "email" },
    code: { type: "string", pattern: "^[A-Z]{2}\\d+$" },
  },
};

const firstFailure = (rules, v) => {
  for (const r of rules) {
    const out = r(v);
    if (out !== true) return out;
  }
  return true;
};

describe("schemaRules", () => {
  const rules = schemaRules(NoteIn, { t });
  test("required, lengths counted in characters", () => {
    expect(firstFailure(rules.title, "")).toBe("kit.validation.required");
    expect(firstFailure(rules.title, "ab")).toBe('kit.validation.minLength {"min":3}');
    expect(firstFailure(rules.title, "abc")).toBe(true);
    expect(firstFailure(rules.title, "😀😀😀")).toBe(true); // 3 characters, 6 UTF-16 units
    expect(firstFailure(rules.title, "x".repeat(21))).toBe('kit.validation.maxLength {"max":20}');
  });
  test("an optional field passes empty; numbers are checked as numbers", () => {
    expect(firstFailure(rules.stars, "")).toBe(true);
    expect(firstFailure(rules.stars, "x")).toBe("kit.validation.number");
    expect(firstFailure(rules.stars, "2.5")).toBe("kit.validation.integer");
    expect(firstFailure(rules.stars, 9)).toBe('kit.validation.max {"max":5}');
    expect(firstFailure(rules.stars, "0")).toBe('kit.validation.min {"min":1}');
    expect(firstFailure(rules.stars, 3)).toBe(true);
  });
  test("a choice, a nullable field, formats and patterns", () => {
    expect(firstFailure(rules.kind, "c")).toBe("kit.validation.oneOf");
    expect(firstFailure(rules.kind, "a")).toBe(true);
    expect(firstFailure(rules.note, null)).toBe(true);
    expect(firstFailure(rules.email, "nope")).toBe("kit.validation.email");
    expect(firstFailure(rules.email, "a@b.co")).toBe(true);
    expect(firstFailure(rules.code, "ab1")).toBe("kit.validation.pattern");
    expect(firstFailure(rules.code, "AB12")).toBe(true);
  });
});

describe("a failed answer", () => {
  const body = {
    type: "https://x/errors/validation-error",
    title: "Validation Error",
    status: 422,
    detail: "Request body failed validation.",
    errors: [
      { loc: ["body", "title"], msg: "String should have at least 3 characters", type: "string_too_short", ctx: { min_length: 3 } },
      { loc: ["body", "title"], msg: "second error on the same field", type: "x" },
      { loc: ["body", "meta", "tag"], msg: "Field required", type: "missing" },
      { loc: ["query", "page"], msg: "something only the server says", type: "value_error" },
    ],
    instance: "/v1/notes",
    requestId: "rid-1",
  };
  test("parseProblem reads the parts", () => {
    const p = parseProblem(JSON.stringify(body));
    expect(p.problem.title).toBe("Validation Error");
    expect(p.human).toBe("Request body failed validation.");
    expect(p.errors).toHaveLength(4);
    expect(p.requestId).toBe("rid-1");
    expect(parseProblem("plain text")).toEqual({ problem: null, human: "plain text", errors: [], requestId: null });
  });
  test("fieldErrors puts the first error per field in the app's words", () => {
    const err = attachProblem(new Error("422"), 422, parseProblem(JSON.stringify(body)));
    expect(fieldErrors(err, { t })).toEqual({
      title: 'kit.validation.minLength {"min":3}',
      "meta.tag": "kit.validation.required",
      page: "something only the server says",
    });
  });
  test("FastAPI's 422 detail array counts as field errors", () => {
    const p = parseProblem(JSON.stringify({ detail: [{ loc: ["body", "name"], msg: "Field required", type: "missing" }] }));
    expect(p.human).toBe("Field required");
    expect(fieldErrors({ errors: p.errors }, { t })).toEqual({ name: "kit.validation.required" });
  });
  test("the request id falls back to the response header", () => {
    const headers = new Headers({ "x-request-id": "hdr-9" });
    expect(attachProblem(new Error("x"), 500, parseProblem("oops"), headers).requestId).toBe("hdr-9");
  });
});

describe("reportError", () => {
  afterEach(() => pushToast.mockClear());
  test("a server fault shows its reference", () => {
    const err = attachProblem(new Error("500"), 500, parseProblem(JSON.stringify({ title: "Internal Server Error", detail: "disk on fire", requestId: "r-5" })));
    expect(reportError(err, { t })).toBe(true);
    expect(pushToast).toHaveBeenCalledWith({
      title: "kit.errors.server",
      description: 'disk on fire · kit.errors.reference {"id":"r-5"}',
      kind: "error",
      duration: 9000,
      announce: true,
    });
    expect(err.reported).toBe(true);
    // a failed AI task's error was said by the task store: the toast shows it, unsaid (the sixteenth review)
    const said = Object.assign(attachProblem(new Error("500"), 500, parseProblem(JSON.stringify({ title: "Internal Server Error", detail: "x" }))), { announced: true });
    reportError(said, { t });
    expect(pushToast).toHaveBeenLastCalledWith(expect.objectContaining({ kind: "error", announce: false }));
    // a title the server chose says what failed
    const job = attachProblem(new Error("500"), 500, parseProblem(JSON.stringify({ title: "The AI photo didn't finish", detail: "sd-cli failed (exit 3)" })));
    expect(errorMessage(job, { t })).toMatchObject({ title: "The AI photo didn't finish", detail: "sd-cli failed (exit 3)" });
    // HTTP's own phrases keep the kit's words
    for (const [status, title] of [[502, "Error"], [503, "Service Unavailable"], [501, "Not Implemented"]]) {
      const plain = attachProblem(new Error(String(status)), status, parseProblem(JSON.stringify({ title, detail: "x" })));
      expect(errorMessage(plain, { t }).title).toBe("kit.errors.server");
    }
  });
  test("a refusal shows the server's words; a lost connection says so; a cancel shows nothing", () => {
    const refused = attachProblem(new Error("409"), 409, parseProblem(JSON.stringify({ title: "Conflict", detail: "that name is taken" })));
    expect(errorMessage(refused, { t })).toEqual({ title: "Conflict", detail: "that name is taken", reference: "" });
    expect(errorMessage(new TypeError("Failed to fetch"), { t }).title).toBe("kit.errors.offline");
    const abort = Object.assign(new Error("aborted"), { name: "AbortError" });
    expect(reportError(abort, { t })).toBe(false);
    expect(pushToast).not.toHaveBeenCalled();
  });
});

describe("installErrorReporting", () => {
  const fakeApp = () => ({ config: {} });
  test("a Vue error is posted once a minute per message, at most 20 a minute", async () => {
    const sent = [];
    const app = fakeApp();
    const off = installErrorReporting(app, { send: async (e) => sent.push(e), notify: false });
    app.config.errorHandler(new Error("render broke"), null, "render function");
    app.config.errorHandler(new Error("render broke"), null, "render function");
    for (let i = 0; i < 30; i++) app.config.errorHandler(new Error(`distinct ${i}`), null, "setup function");
    await new Promise((r) => setTimeout(r, 10));
    expect(sent[0]).toMatchObject({ level: "error", message: "render broke", context: "vue: render function" });
    expect(sent[0].stack).toContain("render broke");
    expect(sent.length).toBeLessThanOrEqual(20);
    expect(sent.filter((e) => e.message === "render broke")).toHaveLength(1);
    off();
  });
  test("an error the screen already reported, or a cancel, isn't sent again", async () => {
    const sent = [];
    const app = fakeApp();
    installErrorReporting(app, { send: async (e) => sent.push(e), notify: false });
    app.config.errorHandler(Object.assign(new Error("shown"), { reported: true }), null, "x");
    app.config.errorHandler(Object.assign(new Error("stop"), { name: "AbortError" }), null, "x");
    await new Promise((r) => setTimeout(r, 10));
    expect(sent).toEqual([]);
  });
  test("a failing send is dropped quietly", async () => {
    const app = fakeApp();
    installErrorReporting(app, { send: async () => Promise.reject(new Error("server down")), notify: false });
    expect(() => app.config.errorHandler(new Error("x"), null, "y")).not.toThrow();
    await new Promise((r) => setTimeout(r, 10));
  });
});

// The seventeenth review (2026-10-20): a pattern's words say the form when the schema shows one (JSON Schema's
// `examples` — WCAG 3.3.3), in the form's rules and in a 422's words; the "takes no null" mark survives a copied
// rules array.
describe("a pattern's words and the nullable mark", () => {
  const HEX = { type: "object", properties: { hex: { type: "string", pattern: "^#[0-9a-fA-F]{6}$", examples: ["#a1b2c3"] }, code: { type: "string", pattern: "^[A-Z]+$" } } };
  test("a refused pattern says the form its examples show; without examples, as before", () => {
    const rules = schemaRules(HEX, { t });
    expect(rules.hex.map((r) => r("blue")).find((x) => x !== true)).toBe('kit.validation.patternExample {"example":"#a1b2c3"}');
    expect(rules.code.map((r) => r("abc")).find((x) => x !== true)).toBe("kit.validation.pattern");
    const err = { errors: [{ loc: ["body", "hex"], msg: "x", type: "string_pattern_mismatch" }, { loc: ["body", "code"], msg: "x", type: "string_pattern_mismatch" }] };
    expect(fieldErrors(err, { t, schema: HEX })).toEqual({ hex: 'kit.validation.patternExample {"example":"#a1b2c3"}', code: "kit.validation.pattern" });
    expect(fieldErrors(err, { t })).toEqual({ hex: "kit.validation.pattern", code: "kit.validation.pattern" }); // no schema given
  });
  test("whether a field takes null is kept on each rule, so a copy of the rules keeps it", async () => {
    const { takesNull } = await import("../src/common/services/forms.js");
    const rules = schemaRules({ type: "object", properties: { n: { type: "integer" }, m: { anyOf: [{ type: "integer" }, { type: "null" }] } } }, { t });
    expect(takesNull(rules.n)).toBe(false);
    expect(takesNull([...rules.n, () => true])).toBe(false); // a copy, one rule more
    expect(takesNull(rules.m)).toBe(true);
    expect(takesNull([() => true])).toBe(true); // rules made by hand say nothing
  });
});
