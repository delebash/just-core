// SPDX-License-Identifier: MIT
// UiSlider's number box (src/common/components/numberBox.js): leaving it commits only a number that
// was typed. Passed through by Tab, emptied or half-typed, it commits nothing and shows the value
// again — Number(null) is 0, and every slider left by Tab used to go to its minimum. And how it and
// UiNumber read a decimal comma.
import { expect, test } from "vitest";
import { committedNumber, decimalComma, isPartialNumber, parseLocaleNumber, separators } from "../src/common/components/numberBox.js";

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

// The fifteenth review (2026-10-20): UiNumber reads with @internationalized/number's NumberParser — a number
// with digits on one side of its decimal only, a leading + or the language's minus, a space between groups
// (any language), and a half-typed number while it is typed (isValidPartialNumber).
test("NumberParser reads what people type: '.7', '5.', '15.', '+15', '1 500', es ',5', the minus signs", () => {
  expect(parseLocaleNumber(".7", { locale: "en", step: 0.1 })).toBe(0.7);
  expect(parseLocaleNumber("5.", { locale: "en", step: 0.1 })).toBe(5);
  expect(parseLocaleNumber("15.", { locale: "en" })).toBe(15);
  expect(parseLocaleNumber("+15", { locale: "en" })).toBe(15);
  expect(parseLocaleNumber("1 500", { locale: "en" })).toBe(1500);
  expect(parseLocaleNumber("1\u00a0500", { locale: "en" })).toBe(1500);
  expect(parseLocaleNumber("1 500", { locale: "es" })).toBe(1500);
  expect(parseLocaleNumber(",5", { locale: "es", step: 0.1 })).toBe(0.5);
  expect(parseLocaleNumber("1.500", { locale: "es" })).toBe(1500);
  expect(parseLocaleNumber("-2,5", { locale: "es", step: 0.5 })).toBe(-2.5);
  expect(parseLocaleNumber("\u22123", { locale: "en" })).toBe(-3); // U+2212, as Swedish writes it, in English too
  expect(parseLocaleNumber("\u22123,5", { locale: "sv", step: 0.5 })).toBe(-3.5);
  expect(parseLocaleNumber("١٢٣", { locale: "ar-EG" })).toBe(123); // the language's own digits
  // still strict: a space or a separator where no group can stand, a sign alone, two decimals
  expect(parseLocaleNumber("1 5", { locale: "en" })).toBeNull();
  expect(parseLocaleNumber("+", { locale: "en" })).toBeNull();
  expect(parseLocaleNumber("\u2212", { locale: "en" })).toBeNull();
  expect(parseLocaleNumber(".", { locale: "en", step: 0.1 })).toBeNull();
  expect(parseLocaleNumber("1.2.3", { locale: "en", step: 0.1 })).toBeNull();
  expect(parseLocaleNumber("1,5", { locale: "en" })).toBeNull(); // the fourteenth review's: never 15
});

test("'-0' reads as 0, never -0 (the sixteenth review: the box kept '-0')", () => {
  expect(Object.is(parseLocaleNumber("-0", { locale: "en" }), 0)).toBe(true);
  expect(Object.is(parseLocaleNumber("-0.0", { locale: "en", step: 0.1 }), 0)).toBe(true);
  // what NumberParser refuses stays refused — "1e3", "0x200" are no numbers here
  for (const s of ["1e3", "0x200", "0b1000000000", "2e3 ", "Infinity", "1_000"]) expect(parseLocaleNumber(s, { locale: "en" }), s).toBeNull();
});

test("a number on its way is a partial number; text that can't become one isn't", () => {
  for (const s of ["", "-", "+", "\u2212", "5.", "1,", "1 5", ".", "0,0"]) expect(isPartialNumber(s, { locale: "en" }), s).toBe(true);
  for (const s of [",", "-,"]) expect(isPartialNumber(s, { locale: "es" }), s).toBe(true);
  for (const s of ["abc", "1a", "1-", "--1", "1e3"]) expect(isPartialNumber(s, { locale: "en" }), s).toBe(false);
});

test("a language's separators come from Intl.NumberFormat", () => {
  expect(separators("en")).toEqual({ decimal: ".", group: "," });
  expect(separators("de")).toEqual({ decimal: ",", group: "." });
  expect(decimalComma("0,5", { step: 0.1 })).toBe("0.5");
  expect(decimalComma("1,200", { step: 0.1, groupSeparator: "," })).toBe("1,200");
  // Swiss German writes thousands with an apostrophe: there a comma can only be the decimal point
  expect(decimalComma("1,200", { step: 0.1, groupSeparator: "’" })).toBe("1.200");
});
