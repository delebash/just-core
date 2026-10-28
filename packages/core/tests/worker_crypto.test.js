// SPDX-License-Identifier: MIT
// The phone's in-app server swaps node:crypto for the worker's stand-in (platform/worker/esbuild.js STANDS_IN →
// shims/crypto.js). Its SHA-256 must be Node's own, byte for byte: the settings upgrade fingerprints a value on the
// phone's seed too (platform/settings_upgrade.js), and a fingerprint that differed there would upgrade nothing — or
// throw, as the stand-in did until 2026-10-24 (JustWrite's session found it).
import { createHash as nodeHash } from "node:crypto";
import { expect, test } from "vitest";
import { canonicalJson, fingerprint } from "../src/platform/settings_upgrade.js";
import { createHash } from "../src/platform/worker/shims/crypto.js";

test("the worker's SHA-256 is Node's: strings, bytes, several updates, hex and Buffer digests", () => {
  for (const text of ["", "abc", "Café 😀", "x".repeat(100_000)]) {
    expect(createHash("sha256").update(text).digest("hex")).toBe(nodeHash("sha256").update(text).digest("hex"));
  }
  const bytes = Buffer.from([0, 1, 2, 250, 255]);
  expect(createHash("sha256").update(bytes).digest().equals(nodeHash("sha256").update(bytes).digest())).toBe(true);
  expect(createHash("sha256").update("ab").update("c").digest("base64")).toBe(nodeHash("sha256").update("abc").digest("base64"));
  expect(() => createHash("md5")).toThrow(/only sha256/);
});

test("a setting's fingerprint on the phone is the one a computer keeps", () => {
  const value = { parts: [{ key: "wall", prompts: ["wall", "siding"] }], order: ["trim", "wall"] };
  const onPhone = createHash("sha256").update(canonicalJson(value)).digest("hex").slice(0, 16);
  expect(onPhone).toBe(fingerprint(value));
});
