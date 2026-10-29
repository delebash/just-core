// SPDX-License-Identifier: MIT
// The engine panel's Save (LuRunnerEngine): the body of its partial PUT /v1/ai/engine-config — only the knobs the user
// filled. Each box is read the kit's one way (common/components/numberBox.js `committedNumber`): a cleared or
// half-typed box is left out and the server keeps its value. QInput gives a cleared box as "", and `Number("")` is 0 —
// a cleared idle box turned idle-unload off, a cleared context cap uncapped the context (2026-10-29).
import { committedNumber } from "./common/components/numberBox.js";

// [the draft's name, the field sent, the step its box takes (a fraction reads a decimal comma), what it is divided by]
const KNOBS = [
  ["modelsMax", "modelsMax", 1, 1],
  ["sleepIdleSeconds", "sleepIdleSeconds", 1, 1],
  ["safetyMarginMb", "safetyMarginMb", 1, 1],
  ["ctxCapTokens", "ctxCapTokens", 1, 1],
  ["bandFastToks", "bandFastToks", 0.1, 1],
  ["bandFineToks", "bandFineToks", 0.1, 1],
  ["bandSlowToks", "bandSlowToks", 0.1, 1],
  ["bandDeadzonePct", "bandDeadzoneFrac", 0.1, 100], // a percent on screen, a fraction on the wire
  ["speedFloorGracePct", "speedFloorGrace", 0.1, 100],
  ["ramHeadroomMb", "ramHeadroomMb", 1, 1],
];

/** `drafts` → the PUT body: `{<field>: number}` for each box holding a number. */
export function engineKnobsBody(drafts) {
  const body = {};
  for (const [draft, field, step, per] of KNOBS) {
    const n = committedNumber(drafts[draft], { step });
    if (n !== null) body[field] = n / per;
  }
  return body;
}
