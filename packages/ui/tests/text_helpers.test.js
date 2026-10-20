// SPDX-License-Identifier: MIT
// A person's name inside a sentence keeps its own direction (isolate — FSI/PDI); a file named by its date takes the
// computer's own date (localDate), not Greenwich's.
import { expect, test } from "vitest";
import { localDate } from "../src/common/services/isoDate.js";
import { isolate } from "../src/common/services/isolate.js";

test("isolate wraps a name between FIRST STRONG ISOLATE and POP DIRECTIONAL ISOLATE", () => {
  expect(isolate("בית")).toBe("⁨בית⁩");
  expect(isolate(null)).toBe("⁨⁩");
});

test("localDate is the computer's own calendar date", () => {
  // 23:30 on the 1st, local time — the 2nd somewhere east of here
  expect(localDate(new Date(2027, 2, 1, 23, 30))).toBe("2027-03-01");
});
