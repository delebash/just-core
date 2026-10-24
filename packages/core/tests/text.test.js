// SPDX-License-Identifier: MIT
// Words as a person reads them (platform/text.js — moved from just-house-paint's shared/text.js, the engines plan's
// F3): a cut never splits a character a person sees (an emoji, a family emoji, a letter with its accents); a name is
// kept composed, without controls or bidi overrides; two names that look the same are one name.
import { expect, test } from "vitest";
import { cleanName, controlsAsSpaces, cutToLength, nameKey, nameProblem, visibleText } from "../src/platform/text.js";

test("cutToLength cuts between the characters a person sees, never inside one", () => {
  expect(cutToLength("Maple street", 80)).toBe("Maple street");
  expect(cutToLength("ab😀", 3)).toBe("ab"); // the emoji is two UTF-16 units: never half of it
  const family = "👨‍👩‍👧‍👦"; // one character a person sees, 11 units
  expect(cutToLength(`a${family}`, 6)).toBe("a"); // never the family without its last member
  expect(cutToLength(`a${family}`, 12)).toBe(`a${family}`);
  expect(cutToLength("éé", 3)).toBe("é"); // a letter with its accent stays whole
  // one character longer than the limit on its own (a run of combining marks): its code points, as many as fit
  const marks = `a${"́".repeat(10)}`;
  expect(cutToLength(marks, 4)).toBe(marks.slice(0, 4));
});

test("cleanName keeps a name composed, its controls spaces, no bidi override, its spaces collapsed", () => {
  expect(cleanName("Café")).toBe("Café"); // NFC: typed two ways, one name
  expect(cleanName("Shade\t12")).toBe("Shade 12");
  expect(cleanName("  Blue ‮eulb  ")).toBe("Blue eulb");
  expect(cleanName("‏Blue")).toBe("‏Blue"); // RLM stays: a right-to-left name may need it
  expect(cleanName(null)).toBe("");
});

test("visibleText and nameKey compare names as they show; controlsAsSpaces only spaces the controls", () => {
  expect(visibleText("Bl​ue­ ")).toBe("Blue");
  expect(nameKey("Blue")).toBe(nameKey("blue​"));
  expect(nameKey("⠀​")).toBe(""); // shows nothing
  expect(controlsAsSpaces("a\tb ")).toBe("a b ");
});

test("nameProblem says what is wrong in the kit's field words — or nothing", () => {
  expect(nameProblem("Blue", 60)).toBe(null);
  expect(nameProblem("​", 60)).toEqual({ msg: "Field required", type: "missing" });
  expect(nameProblem("x".repeat(61), 60)).toEqual({ msg: "String should have at most 60 characters", type: "string_too_long", ctx: { max_length: 60 } });
  expect(nameProblem("xx", 1)).toMatchObject({ msg: "String should have at most 1 character" });
});
