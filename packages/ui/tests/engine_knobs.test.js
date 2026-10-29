// SPDX-License-Identifier: MIT
// The engine panel's Save (LuRunnerEngine): only the knobs the user filled are sent. QInput gives a cleared box as ""
// and `Number("")` is 0 — a cleared idle box turned idle-unload off ("never sleep"), a cleared context cap uncapped the
// context, a cleared margin made it 0 (the finish list's A6, 2026-10-29). Each box is read the kit's one way
// (numberBox.js committedNumber): nothing typed — or half-typed — is left out, and the server keeps its value.
import { expect, test } from "vitest";
import { engineKnobsBody } from "../src/engineKnobs.js";

test("a cleared or half-typed box is left out of the save; a typed one — 0 included — is sent as a number", () => {
  const body = engineKnobsBody({
    modelsMax: "2",
    sleepIdleSeconds: "",
    safetyMarginMb: null,
    ctxCapTokens: "0",
    bandFastToks: 20,
    bandFineToks: "-",
    bandSlowToks: "7.5",
    bandDeadzonePct: "10",
    speedFloorGracePct: "",
    ramHeadroomMb: " 2048 ",
  });
  expect(body).toEqual({ modelsMax: 2, ctxCapTokens: 0, bandFastToks: 20, bandSlowToks: 7.5, bandDeadzoneFrac: 0.1, ramHeadroomMb: 2048 });
});

test("a decimal comma reads where a knob takes fractions", () => {
  expect(engineKnobsBody({ bandSlowToks: "7,5", speedFloorGracePct: "12,5" })).toEqual({ bandSlowToks: 7.5, speedFloorGrace: 0.125 });
});

test("the update check's keep time is sent as typed — 0 (every time) included — and left out when cleared", () => {
  expect(engineKnobsBody({ updateCheckMinutes: "0" })).toEqual({ updateCheckMinutes: 0 });
  expect(engineKnobsBody({ updateCheckMinutes: "" })).toEqual({});
});
