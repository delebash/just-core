// SPDX-License-Identifier: MIT
// The desktop window's Content-Security-Policy for app:// pages (shell/csp.js, used by shell/main.js): the default,
// an app's added sources, and — docgen's frame (2026-10-29) — a directive the default doesn't list.
import { expect, test } from "vitest";
import { buildCsp, CSP_DEFAULT } from "../src/shell/csp.js";

const directives = (csp) => Object.fromEntries(csp.split("; ").map((d) => [d.split(" ")[0], d.split(" ").slice(1)]));

test("with nothing added: exactly the default, no frame-src (frames fall back to default-src 'self')", () => {
  const d = directives(buildCsp({}));
  expect(Object.keys(d)).toEqual(CSP_DEFAULT.map(([name]) => name));
  expect(d["frame-src"]).toBeUndefined();
  expect(d["object-src"]).toEqual(["'none'"]);
});

test("cspAdd extends a default directive, and adds one the default doesn't list", () => {
  const d = directives(buildCsp({ cspAdd: { "img-src": ["https:"], "frame-src": ["http://127.0.0.1:*", "http://localhost:*"] } }));
  expect(d["img-src"]).toContain("https:");
  expect(d["img-src"]).toContain("'self'");
  // a new directive carries exactly the app's sources — nothing else is loosened
  expect(d["frame-src"]).toEqual(["http://127.0.0.1:*", "http://localhost:*"]);
  expect(d["default-src"]).toEqual(["'self'"]);
});

test("a whole csp replaces the default; text that would smuggle another directive in is refused", () => {
  expect(buildCsp({ csp: "default-src 'none'" })).toBe("default-src 'none'");
  expect(() => buildCsp({ cspAdd: { "frame-src": ["https://a; script-src *"] } })).toThrow(/cspAdd/);
  expect(() => buildCsp({ cspAdd: { "frame-src; script-src": ["https:"] } })).toThrow(/cspAdd/);
  expect(() => buildCsp({ cspAdd: { "frame-src": "https:" } })).toThrow(/cspAdd/); // a list, not a string
});
