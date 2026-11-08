// SPDX-License-Identifier: MIT
// The Live tab's outputs (src/mocap/liveRecord.js, src/mocap/liveOut.js): a BVH whose angles turn back into the same
// rotations and whose hierarchy is SOMA's 77 joints; a Live Link Face CSV with the real header; VMC's messages with
// Unity's bone names, each rotation against its humanoid parent in Unity's axes, the face as Perfect Sync names.
import { expect, test } from "vitest";
import { oscMessages, VMC_BONES, vmcMessages } from "../src/mocap/liveOut.js";
import { bvhText, eulerZXY, faceCsvText, LIVE_LINK_FACE } from "../src/mocap/liveRecord.js";
import { qMul } from "../src/mocap/liveSolver.js";
import skeleton from "../src/mocap/somaRest.json";

const axis = (a, deg) => {
  const h = (deg * Math.PI) / 360;
  return [a[0] * Math.sin(h), a[1] * Math.sin(h), a[2] * Math.sin(h), Math.cos(h)];
};
const close = (a, b, tol) => a.every((v, i) => Math.abs(v - b[i]) < tol);
const sameRotation = (a, b) => Math.abs(a[0] * b[0] + a[1] * b[1] + a[2] * b[2] + a[3] * b[3]) > 1 - 1e-9;

test("ZXY angles turn back into the rotation they came from (R = Rz · Rx · Ry, BVH's channel order)", () => {
  const q = qMul(qMul(axis([0, 0, 1], 30), axis([1, 0, 0], -20)), axis([0, 1, 0], 50));
  const [z, x, y] = eulerZXY(q);
  expect(close([z, x, y], [30, -20, 50], 1e-6)).toBe(true);
  const back = qMul(qMul(axis([0, 0, 1], z), axis([1, 0, 0], x)), axis([0, 1, 0], y));
  expect(sameRotation(back, q)).toBe(true);
});

test("the live BVH: SOMA's 77 joints from Hips, centimetres, one line a frame, angles kept continuous", () => {
  const rest = skeleton.names.map(() => [0, 0, 0, 1]);
  const arm = skeleton.names.indexOf("LeftArm");
  // the arm turning past 180 degrees about Y over three frames: its angle goes on past 180, not back to -180
  const frames = [170, 179, 190].map((deg) => rest.map((q, j) => (j === arm ? axis([0, 1, 0], deg) : q)));
  const text = bvhText(skeleton, frames, 30);
  const lines = text.trim().split("\n");
  expect(lines[0]).toBe("HIERARCHY");
  expect(lines[1]).toBe("ROOT Hips");
  expect((text.match(/^\s*(ROOT|JOINT) /gm) || []).length).toBe(77);
  const motion = lines.indexOf("MOTION");
  expect(lines.slice(motion, motion + 3)).toEqual(["MOTION", "Frames: 3", "Frame Time: 0.03333333"]);
  const rows = lines.slice(motion + 3).map((l) => l.split(" ").map(Number));
  // the root's 3 positions, then 3 angles for each of the 77 joints
  expect(rows.every((r) => r.length === 3 + 77 * 3)).toBe(true);
  // the root stays at the rest hips' height, in centimetres
  expect(rows[0].slice(0, 3)).toEqual(skeleton.rest[0].map((v) => Number((v * 100).toFixed(6))));
  // the arm's Y turn (and its child's turn back) goes on past 180 degrees: no angle jumps by 360 between frames
  for (let c = 6; c < rows[0].length; c++) expect(Math.abs(rows[2][c] - rows[1][c])).toBeLessThan(90);
});

test("the live face CSV: Live Link Face's header, a timecode and 61 a row, curves held to 0–1", () => {
  const text = faceCsvText([{ eyeBlinkLeft: 0.4, jawOpen: 1.2 }, null], 30);
  const [header, first, second] = text.trim().split("\n");
  expect(header).toBe(LIVE_LINK_FACE.join(","));
  const cells = first.split(",");
  expect(cells.slice(0, 3)).toEqual(["00:00:00:00.000", "61", "0.400000"]);
  expect(cells[LIVE_LINK_FACE.indexOf("JawOpen")]).toBe("1.000000");
  expect(second.split(",")[0]).toBe("00:00:00:01.000");
});

test("VMC: Unity's humanoid names, each rotation against its humanoid parent in Unity's axes, the face as Perfect Sync", () => {
  const world = skeleton.names.map(() => [0, 0, 0, 1]);
  const at = (n) => skeleton.names.indexOf(n);
  // the chest turned 30 degrees about Y, the head (under Neck1 and Neck2, Neck2 not sent) 10 more
  for (const n of ["Chest", "Neck1", "Neck2"]) world[at(n)] = axis([0, 1, 0], 30);
  world[at("Head")] = axis([0, 1, 0], 40);
  const messages = vmcMessages(skeleton, world, { browDownLeft: 0.5 }, 1.5);
  expect(messages[0]).toEqual(["/VMC/Ext/OK", { i: 1 }]);
  expect(messages[1]).toEqual(["/VMC/Ext/T", 1.5]);
  const bones = Object.fromEntries(messages.filter((m) => m[0] === "/VMC/Ext/Bone/Pos").map((m) => [m[1], m.slice(2)]));
  expect(Object.keys(bones)).toHaveLength(Object.keys(VMC_BONES).length);
  expect(Object.keys(bones)).toEqual(expect.arrayContaining(["Hips", "UpperChest", "Neck", "Head", "LeftUpperArm", "RightLittleDistal", "LeftThumbProximal"]));
  // UpperChest (SOMA's Chest) against Chest (Spine2): the 30 degrees, its Y axis mirrored into Unity's
  expect(close(bones.UpperChest.slice(3), [0, -Math.sin(Math.PI / 12), 0, Math.cos(Math.PI / 12)], 1e-9)).toBe(true);
  // Head against Neck (Neck1, Neck2 skipped): 10 degrees
  expect(close(bones.Head.slice(3), [0, -Math.sin(Math.PI / 36), 0, Math.cos(Math.PI / 36)], 1e-9)).toBe(true);
  // a bone's position is its rest offset from its humanoid parent, X mirrored
  const arm = skeleton.rest[at("LeftArm")].map((v, k) => v - skeleton.rest[at("LeftShoulder")][k]);
  expect(close(bones.LeftUpperArm.slice(0, 3), [-arm[0], arm[1], arm[2]], 1e-9)).toBe(true);
  expect(messages.at(-2)).toEqual(["/VMC/Ext/Blend/Val", "BrowDownLeft", 0.5]);
  expect(messages.at(-1)).toEqual(["/VMC/Ext/Blend/Apply"]);
});

test("plain OSC: every SOMA joint's rotation in SOMA's own axes, each face curve by MediaPipe's name", () => {
  const world = skeleton.names.map(() => [0, 0, 0, 1]);
  const messages = oscMessages(skeleton, world, { jawOpen: 0.25 });
  expect(messages).toHaveLength(77 + 1);
  expect(messages[0]).toEqual(["/mocap/joint/Hips", 0, 0, 0, 1]);
  expect(messages.at(-1)).toEqual(["/mocap/blend/jawOpen", 0.25]);
});
