// SPDX-License-Identifier: MIT
// UiSlider's number box (src/common/components/numberBox.js): leaving it commits only a number that
// was typed. Passed through by Tab, emptied or half-typed, it commits nothing and shows the value
// again — Number(null) is 0, and every slider left by Tab used to go to its minimum. And how it and
// UiNumber read a decimal comma.
import { expect, test } from "vitest";
import { committedNumber, decimalComma, parseLocaleNumber, separators } from "../src/common/components/numberBox.js";

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

// A decimal comma where it can only be one (one comma, no dot, a field that takes fractions — its step
// isn't whole): "0,05" typed into an English UiNumber read 5, and the slider's box ignored "0,5".
test("the slider's box takes a decimal comma where it takes fractions — never in a whole-number one", () => {
  expect(committedNumber("0,5", { step: 0.01 })).toBe(0.5);
  expect(committedNumber("-1,25", { step: 0.05 })).toBe(-1.25);
  expect(committedNumber("1,250", { step: 0.01 })).toBe(1.25); // the slider writes no thousands separators
  // a whole-number slider (the brush's size): a comma is no number, as before
  expect(committedNumber("1,5", { step: 1 })).toBeNull();
  expect(committedNumber("1,5")).toBeNull();
  // two commas, or a comma and a dot: not one that can only be the decimal point
  expect(committedNumber("1,2,3", { step: 0.1 })).toBeNull();
  expect(committedNumber("1.000,5", { step: 0.1 })).toBeNull();
});

test("UiNumber reads a decimal comma where it can only be one; its own thousands stay thousands", () => {
  // English, a field that takes fractions
  expect(parseLocaleNumber("0,05", { locale: "en", step: 0.01 })).toBe(0.05);
  expect(parseLocaleNumber("12,5", { locale: "en", step: 0.5 })).toBe(12.5);
  expect(parseLocaleNumber("0,500", { locale: "en", step: 0.1 })).toBe(0.5);
  // "1,200" is how the field itself writes 1200 (grouping on): it reads back as 1200
  expect(parseLocaleNumber("1,200", { locale: "en", step: 0.5 })).toBe(1200);
  expect(parseLocaleNumber("1,200", { locale: "en", step: 0.5, grouping: false })).toBe(1.2);
  // a whole-number field: the comma is a thousands separator, as before
  expect(parseLocaleNumber("1,200", { locale: "en" })).toBe(1200);
  // a whole-number field: a comma where no group can stand is no number — never silently another one
  expect(parseLocaleNumber("0,05", { locale: "en", step: 1 })).toBeNull();
  expect(parseLocaleNumber("1,5", { locale: "en", step: 1 })).toBeNull();
  expect(parseLocaleNumber("1.5", { locale: "de", step: 1 })).toBeNull();
  expect(parseLocaleNumber("1,2,3", { locale: "en", step: 0.1 })).toBeNull();
  expect(parseLocaleNumber("12a", { locale: "en" })).toBeNull();
  expect(parseLocaleNumber("1,23", { locale: "en", step: 0.01 })).toBe(1.23); // can only be a decimal
  expect(parseLocaleNumber("0.05", { locale: "de", step: 0.01 })).toBe(0.05);
  expect(parseLocaleNumber("-1,234", { locale: "en" })).toBe(-1234);
  expect(parseLocaleNumber("1 234,5", { locale: "fr", step: 0.1 })).toBe(1234.5);
  // a language whose decimal separator is the comma, as before
  expect(parseLocaleNumber("0,05", { locale: "de", step: 0.01 })).toBe(0.05);
  expect(parseLocaleNumber("1.200", { locale: "de" })).toBe(1200);
  expect(parseLocaleNumber("1.200,5", { locale: "de", step: 0.1 })).toBe(1200.5);
  // the dot in English, and nothing to read
  expect(parseLocaleNumber("1,234.5", { locale: "en", step: 0.1 })).toBe(1234.5);
  expect(parseLocaleNumber("", { locale: "en" })).toBeNull();
  expect(parseLocaleNumber("-", { locale: "en" })).toBeNull();
});

test("a language's separators come from Intl.NumberFormat", () => {
  expect(separators("en")).toEqual({ decimal: ".", group: "," });
  expect(separators("de")).toEqual({ decimal: ",", group: "." });
  expect(decimalComma("0,5", { step: 0.1 })).toBe("0.5");
  expect(decimalComma("1,200", { step: 0.1, groupSeparator: "," })).toBe("1,200");
  // Swiss German writes thousands with an apostrophe: there a comma can only be the decimal point
  expect(decimalComma("1,200", { step: 0.1, groupSeparator: "’" })).toBe("1.200");
});
