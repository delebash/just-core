// SPDX-License-Identifier: MIT
/* eslint-disable i18next/no-literal-string -- BVH's and Live Link Face's own keywords and SOMA's joint names: file contents, never shown words */
// The Live tab's recordings, written in the window in the same layouts the offline takes use (just-mocap
// bench/export_mocap.py), so a live recording and a captured take open the same way:
//  - BVH: SOMA's 77 joints (somaRest.json), Hips the root, centimetres, Y up, ZXY rotation channels, each joint's
//    rotation against its parent with the rest pose world-aligned (zero rotations: a T-pose); a joint with no children
//    gets an End Site. The live solver keeps the hips in one place, so the root stays over the origin at its rest height
//    above the floor (somaRest.json's hipsHeight: the rest mesh's sole at y = 0, as a captured take's floor is) — live
//    has no path across the floor, the offline take does;
//  - Live Link Face's CSV: "Timecode,BlendShapeCount," then ARKit's 52 curves and 9 angles (left at 0), the header a real
//    recording has (just-mocap bench/arkit_csv.py checked it line for line).

const CM = 100;
const ORDER = "ZXY";

/** A unit quaternion [x, y, z, w] as a 3x3 rotation matrix (rows). */
function matrix([x, y, z, w]) {
  return [
    [1 - 2 * (y * y + z * z), 2 * (x * y - z * w), 2 * (x * z + y * w)],
    [2 * (x * y + z * w), 1 - 2 * (x * x + z * z), 2 * (y * z - x * w)],
    [2 * (x * z - y * w), 2 * (y * z + x * w), 1 - 2 * (x * x + y * y)],
  ];
}

/** Euler angles in degrees, [z, x, y], for R = Rz · Rx · Ry (BVH's "Zrotation Xrotation Yrotation", as scipy's "ZXY"). */
export function eulerZXY(q) {
  const r = matrix(q);
  const x = Math.asin(Math.max(-1, Math.min(1, r[2][1])));
  let y;
  let z;
  if (Math.abs(r[2][1]) < 0.999999) {
    y = Math.atan2(-r[2][0], r[2][2]);
    z = Math.atan2(-r[0][1], r[1][1]);
  } else {
    // gimbal lock: the Y turn folded into Z
    y = 0;
    z = Math.atan2(r[1][0], r[0][0]);
  }
  const deg = 180 / Math.PI;
  return [z * deg, x * deg, y * deg];
}

const qConj = (q) => [-q[0], -q[1], -q[2], q[3]];
const qMul = (a, b) => [
  a[3] * b[0] + a[0] * b[3] + a[1] * b[2] - a[2] * b[1],
  a[3] * b[1] - a[0] * b[2] + a[1] * b[3] + a[2] * b[0],
  a[3] * b[2] + a[0] * b[1] - a[1] * b[0] + a[2] * b[3],
  a[3] * b[3] - a[0] * b[0] - a[1] * b[1] - a[2] * b[2],
];
/** An angle moved by whole turns to stay next to the one before it (numpy's unwrap, one frame at a time). */
const near = (angle, before) => (before === undefined ? angle : angle - 360 * Math.round((angle - before) / 360));
const fixed = (v) => v.toFixed(6);

/** A BVH of `frames` (each the solver's `world`: one rotation per joint against the rest pose) at `fps`. */
export function bvhText(skeleton, frames, fps) {
  const { names, parents, rest } = skeleton;
  const children = names.map((_, j) => parents.flatMap((p, c) => (p === j ? [c] : [])));
  const root = parents.indexOf(-1);
  const order = [];
  const lines = ["HIERARCHY"];
  const channels = ORDER.split("").map((a) => `${a}rotation`).join(" ");
  const emit = (j, depth) => {
    order.push(j);
    const pad = "  ".repeat(depth);
    const offset = parents[j] < 0 ? [0, 0, 0] : rest[j].map((v, k) => (v - rest[parents[j]][k]) * CM);
    lines.push(`${pad}${parents[j] < 0 ? "ROOT" : "JOINT"} ${names[j]}`, `${pad}{`, `${pad}  OFFSET ${offset.map(fixed).join(" ")}`);
    lines.push(`${pad}  CHANNELS ${parents[j] < 0 ? "6 Xposition Yposition Zposition " : "3 "}${channels}`);
    for (const c of children[j]) emit(c, depth + 1);
    if (!children[j].length) lines.push(`${pad}  End Site`, `${pad}  {`, `${pad}    OFFSET 0.000000 0.000000 0.000000`, `${pad}  }`);
    lines.push(`${pad}}`);
  };
  emit(root, 0);
  lines.push("MOTION", `Frames: ${frames.length}`, `Frame Time: ${(1 / fps).toFixed(8)}`);
  const hips = rest[root].map((v, k) => (v + (k === 1 ? skeleton.hipsHeight : 0)) * CM);
  const last = new Map();
  for (const world of frames) {
    const values = [...hips];
    for (const j of order) {
      const local = parents[j] < 0 ? world[j] : qMul(qConj(world[parents[j]]), world[j]);
      const before = last.get(j);
      const angles = eulerZXY(local).map((a, k) => near(a, before?.[k]));
      last.set(j, angles);
      values.push(...angles);
    }
    lines.push(values.map(fixed).join(" "));
  }
  return `${lines.join("\n")}\n`;
}

// Live Link Face's columns, as just-mocap bench/export_mocap.py writes them
export const LIVE_LINK_FACE = (
  "Timecode,BlendShapeCount,EyeBlinkLeft,EyeLookDownLeft,EyeLookInLeft,EyeLookOutLeft,EyeLookUpLeft,EyeSquintLeft,EyeWideLeft," +
  "EyeBlinkRight,EyeLookDownRight,EyeLookInRight,EyeLookOutRight,EyeLookUpRight,EyeSquintRight,EyeWideRight,JawForward,JawRight," +
  "JawLeft,JawOpen,MouthClose,MouthFunnel,MouthPucker,MouthRight,MouthLeft,MouthSmileLeft,MouthSmileRight,MouthFrownLeft," +
  "MouthFrownRight,MouthDimpleLeft,MouthDimpleRight,MouthStretchLeft,MouthStretchRight,MouthRollLower,MouthRollUpper," +
  "MouthShrugLower,MouthShrugUpper,MouthPressLeft,MouthPressRight,MouthLowerDownLeft,MouthLowerDownRight,MouthUpperUpLeft," +
  "MouthUpperUpRight,BrowDownLeft,BrowDownRight,BrowInnerUp,BrowOuterUpLeft,BrowOuterUpRight,CheekPuff,CheekSquintLeft," +
  "CheekSquintRight,NoseSneerLeft,NoseSneerRight,TongueOut,HeadYaw,HeadPitch,HeadRoll,LeftEyeYaw,LeftEyePitch,LeftEyeRoll," +
  "RightEyeYaw,RightEyePitch,RightEyeRoll"
).split(",");

/** A Live Link Face CSV of `frames` (each MediaPipe's curves `{browDownLeft: 0.2, …}`, or null: no face seen) at `fps`. */
export function faceCsvText(frames, fps) {
  const shapes = LIVE_LINK_FACE.slice(2, -9);
  const whole = Math.round(fps);
  const pad = (n) => String(n).padStart(2, "0");
  const rows = [LIVE_LINK_FACE.join(",")];
  frames.forEach((curves, t) => {
    const seconds = Math.floor(t / whole);
    const code = `${pad(Math.floor(seconds / 3600))}:${pad(Math.floor(seconds / 60) % 60)}:${pad(seconds % 60)}:${pad(t % whole)}.000`;
    const lookup = Object.fromEntries(Object.entries(curves ?? {}).map(([k, v]) => [`${k[0].toUpperCase()}${k.slice(1)}`, v]));
    const values = shapes.map((name) => Math.min(1, Math.max(0, Number(lookup[name] ?? 0))).toFixed(6));
    rows.push([code, "61", ...values, ...Array(9).fill("0")].join(","));
  });
  return `${rows.join("\n")}\n`;
}
