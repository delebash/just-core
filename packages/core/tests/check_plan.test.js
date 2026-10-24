// SPDX-License-Identifier: MIT
// The plan check (scripts/check-plan.js): a plan's "standard" claim names kit code that exists. The AI photo was
// planned as "the family's engine pattern" — a resemblance with no kit file — and built inside the app
// (2026-10-24); that row now fails.
import { expect, test } from "vitest";
import { checkPlanText, kitExports } from "../../../scripts/check-plan.js";

const PLAN = `
| Piece | Standard (doc link) | Kit code |
|---|---|---|
| Engine install | the kit's runtime install | \`acquireRuntime\` \`packages/core/src/runner/binary.js\` |
| The AI photo engine | the family's engine pattern | follows the family's engine pattern |
| A made-up helper | — | \`doesNotExist\` |
| The painter | house-painting logic | app — the tint and paste-back are this app's work |
| A canvas | Konva | NOT STANDARD — the kit has no canvas: Konva (konvajs.org) vs a raw canvas |
`;

test("each standards row: kit code that exists, the app's own, NOT STANDARD — anything else fails", () => {
  const rows = checkPlanText(PLAN, kitExports());
  expect(rows.map((r) => [r.piece, r.verdict])).toEqual([
    ["Engine install", "ok"],
    ["The AI photo engine", "fail"],
    ["A made-up helper", "fail"],
    ["The painter", "app"],
    ["A canvas", "not-standard"],
  ]);
  expect(rows[2].why).toContain("doesNotExist");
});

test("a plan without a Kit code column has no standards rows (the guard fails a new plan like that)", () => {
  expect(checkPlanText("| Piece | Standard |\n|---|---|\n| x | y |\n", new Set())).toEqual([]);
});
