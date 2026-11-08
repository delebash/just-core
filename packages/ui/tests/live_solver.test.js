// SPDX-License-Identifier: MIT
// The live solver's own checks (moved with it from just-mocap's bench/live/solver.test.js, 2026-11-08): MediaPipe
// landmarks placed at the rest skeleton's joints give back the rest pose, a raised arm is followed with its bone's
// length kept, and the filter settles on a held pose.
import { expect, test } from "vitest";
import { LiveSolver, POSE, qAngle, qBetween, qRotate } from "../src/mocap/liveSolver.js";
import skeleton from "../src/mocap/somaRest.json";

const at = Object.fromEntries(skeleton.names.map((n, i) => [n, i]));
const close = (a, b, tolerance) => a.every((v, i) => Math.abs(v - b[i]) < tolerance);

test("the smallest rotation takes one direction onto another", () => {
  const q = qBetween([1, 0, 0], [0, 0, 1]);
  expect(close(qRotate(q, [1, 0, 0]), [0, 0, 1], 1e-9)).toBe(true);
  expect(close(qRotate(qBetween([0, 1, 0], [0, -1, 0]), [0, 1, 0]), [0, -1, 0], 1e-9)).toBe(true);
});
/** MediaPipe landmarks placed at the rest skeleton's own joints (SOMA axes back to MediaPipe's: x, -y, -z). */
function restLandmarks() {
  const mp = (name) => {
    const p = skeleton.rest[at[name]];
    return [p[0], -p[1], -p[2], 1];
  };
  const pose = Array.from({ length: 33 }, () => [0, 0, 0, 1]);
  const put = (key, name) => (pose[POSE[key]] = mp(name));
  for (const [side, s] of [["Left", "left"], ["Right", "right"]]) {
    put(`${s}Shoulder`, `${side}Arm`);
    put(`${s}Elbow`, `${side}ForeArm`);
    put(`${s}Wrist`, `${side}Hand`);
    put(`${s}Hip`, `${side}Leg`);
    put(`${s}Knee`, `${side}Shin`);
    put(`${s}Ankle`, `${side}Foot`);
    put(`${s}Toe`, `${side}ToeEnd`);
    put(`${s}Ear`, `${side}Eye`);
  }
  return pose;
}

test("landmarks at the rest pose give back the rest pose's limbs", () => {
  const solver = new LiveSolver(skeleton, { filter: false });
  const { positions } = solver.solve(restLandmarks());
  for (const name of ["LeftForeArm", "LeftHand", "RightHand", "LeftShin", "LeftFoot", "RightFoot"]) {
    const restRelative = skeleton.rest[at[name]].map((v, i) => v - skeleton.rest[0][i]);
    expect(close(positions[at[name]], restRelative, 0.03), `${name}: ${positions[at[name]]} against ${restRelative}`).toBe(true);
  }
});

test("a raised arm is followed and its bone keeps its length", () => {
  const solver = new LiveSolver(skeleton, { filter: false });
  const pose = restLandmarks();
  const shoulder = pose[POSE.leftShoulder];
  pose[POSE.leftElbow] = [shoulder[0] + 0.3, shoulder[1], shoulder[2]]; // straight out to the side
  pose[POSE.leftWrist] = [shoulder[0] + 0.55, shoulder[1], shoulder[2]];
  const { positions } = solver.solve(pose);
  const arm = positions[at.LeftArm];
  const elbow = positions[at.LeftForeArm];
  const direction = elbow.map((v, i) => v - arm[i]);
  const length = Math.hypot(...direction);
  const restLength = Math.hypot(...skeleton.rest[at.LeftForeArm].map((v, i) => v - skeleton.rest[at.LeftArm][i]));
  expect(Math.abs(length - restLength)).toBeLessThan(1e-9);
  expect(close(direction.map((v) => v / length), [1, 0, 0], 1e-6)).toBe(true);
});

test("the filter settles on a held pose and keeps unit rotations", () => {
  const solver = new LiveSolver(skeleton);
  const pose = restLandmarks();
  let result;
  for (let t = 0; t < 60; t++) result = solver.solve(pose, {}, 1 / 30);
  const unfiltered = new LiveSolver(skeleton, { filter: false }).solve(pose);
  result.world.forEach((q, j) => {
    expect(Math.abs(Math.hypot(...q) - 1)).toBeLessThan(1e-9);
    expect(qAngle(q, unfiltered.world[j])).toBeLessThan(1e-3);
  });
});
