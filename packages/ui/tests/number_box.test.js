// SPDX-License-Identifier: MIT
// UiSlider's number box (src/common/components/numberBox.js): leaving it commits only a number that
// was typed. Passed through by Tab, emptied or half-typed, it commits nothing and shows the value
// again — Number(null) is 0, and every slider left by Tab used to go to its minimum.
import { expect, test } from "vitest";
import { committedNumber } from "../src/common/components/numberBox.js";

test("a typed number commits; nothing typed, an emptied box or a half-typed one commits nothing", () => {
  expect(committedNumber("0.75")).toBe(0.75);
  expect(committedNumber(" 2 ")).toBe(2);
  expect(committedNumber("0")).toBe(0);
  expect(committedNumber("-3")).toBe(-3);
  // left by Tab without typing: the box's text was never touched
  expect(committedNumber(null)).toBeNull();
  expect(committedNumber(undefined)).toBeNull();
  expect(committedNumber("")).toBeNull();
  expect(committedNumber("   ")).toBeNull();
  expect(committedNumber("-")).toBeNull();
  expect(committedNumber("abc")).toBeNull();
});
