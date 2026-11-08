// SPDX-License-Identifier: MIT
// Live motion out, shaped in the window (the Motion capture screen's Live tab — just-mocap's plan of 2026-11-07, item
// 11: "whatever other live data output that is industry standard"): each frame of liveSolver.js as OSC messages, which
// the server relays over UDP (POST /v1/mocap/live/send — a page can't open UDP; just-core runner/mocap_live.js), in one
// of two shapes:
//  - VMC (the Virtual Motion Capture protocol, protocol.vmc.info — VSeeFace, VNyan, Warudo, Unity's EVMC4U): Unity's
//    humanoid bone names, each bone's rotation against its humanoid parent, in Unity's left-handed axes, with the
//    face's ARKit curves as blend shapes under their Perfect Sync names (BrowDownLeft …). SOMA's rest pose is a T-pose
//    with every rest rotation zero (somaRest.json: the arms along ±X), as a normalized VRM humanoid's is, so the
//    rotations go over as they are;
//  - plain OSC: every SOMA joint's rotation against the rest pose, in SOMA's own axes (/mocap/joint/<name> x y z w), and
//    each ARKit curve (/mocap/blend/<name> value), for a receiver of one's own.
// Checked 2026-11-08 from JustDirect's window by an independent decoder (python-osc) against the VMC spec's types and
// Unity's HumanBodyBones names (just-mocap RESEARCH.md); not yet seen moving an avatar in a receiving app.

// SOMA's joints → Unity's humanoid bones (HumanBodyBones). SOMA joints not named here (Neck2, the metacarpals, the end
// joints, the eyes and jaw) are left out: a named bone's rotation is taken against its nearest named ancestor.
const SIDE = (side) => {
  const s = side;
  const fingers = [];
  for (const [soma, unity] of [["Thumb", "Thumb"], ["Index", "Index"], ["Middle", "Middle"], ["Ring", "Ring"], ["Pinky", "Little"]]) {
    const first = soma === "Thumb" ? 1 : 2;
    ["Proximal", "Intermediate", "Distal"].forEach((part, k) => fingers.push([`${s}Hand${soma}${first + k}`, `${s}${unity}${part}`]));
  }
  return [
    [`${s}Shoulder`, `${s}Shoulder`],
    [`${s}Arm`, `${s}UpperArm`],
    [`${s}ForeArm`, `${s}LowerArm`],
    [`${s}Hand`, `${s}Hand`],
    [`${s}Leg`, `${s}UpperLeg`],
    [`${s}Shin`, `${s}LowerLeg`],
    [`${s}Foot`, `${s}Foot`],
    [`${s}ToeBase`, `${s}Toes`],
    ...fingers,
  ];
};
export const VMC_BONES = Object.freeze(
  Object.fromEntries([["Hips", "Hips"], ["Spine1", "Spine"], ["Spine2", "Chest"], ["Chest", "UpperChest"], ["Neck1", "Neck"], ["Head", "Head"], ...SIDE("Left"), ...SIDE("Right")]),
);

const qConj = (q) => [-q[0], -q[1], -q[2], q[3]];
const qMul = (a, b) => [
  a[3] * b[0] + a[0] * b[3] + a[1] * b[2] - a[2] * b[1],
  a[3] * b[1] - a[0] * b[2] + a[1] * b[3] + a[2] * b[0],
  a[3] * b[2] + a[0] * b[1] - a[1] * b[0] + a[2] * b[3],
  a[3] * b[3] - a[0] * b[0] - a[1] * b[1] - a[2] * b[2],
];
// SOMA (right-handed, Y up, facing +Z, its left at +X) → Unity (left-handed, Y up, facing +Z, its left at -X): the X
// axis mirrored — a position (-x, y, z), a rotation (x, -y, -z, w)
const toUnityQ = (q) => [q[0], -q[1], -q[2], q[3]];
const toUnityP = (p) => [-p[0], p[1], p[2]];
// a number goes out as an OSC float; an integer the protocol wants as one is {i: n} (the relay: runner/mocap_live.js)
const f = (value) => Number(value) || 0;
const pascal = (name) => `${name[0].toUpperCase()}${name.slice(1)}`;

/**
 * One frame as VMC's messages: `skeleton` {names, parents, rest} (somaRest.json), `world` each joint's rotation against
 * the rest pose ([x, y, z, w], liveSolver's `world`), `blend` {arkitName: value} (MediaPipe's face curves), `time` s.
 * → [[address, ...args]] for a Bundle.
 */
export function vmcMessages(skeleton, world, blend = {}, time = 0) {
  const index = Object.fromEntries(skeleton.names.map((n, i) => [n, i]));
  const named = new Set(Object.keys(VMC_BONES));
  const ancestor = (j) => {
    let p = skeleton.parents[j];
    while (p >= 0 && !named.has(skeleton.names[p])) p = skeleton.parents[p];
    return p;
  };
  const out = [["/VMC/Ext/OK", { i: 1 }], ["/VMC/Ext/T", f(time)], ["/VMC/Ext/Root/Pos", "root", f(0), f(0), f(0), f(0), f(0), f(0), f(1)]];
  for (const [soma, unity] of Object.entries(VMC_BONES)) {
    const j = index[soma];
    if (j === undefined || !world[j]) continue;
    const a = ancestor(j);
    const local = a < 0 ? world[j] : qMul(qConj(world[a]), world[j]);
    // the Hips stand over the avatar's root at the rest height above its floor (a receiver such as EVMC4U sets each
    // bone's local position from these: hips at 0 would sink the avatar to its waist)
    const offset = a < 0 ? skeleton.rest[j].map((v, k) => v + (k === 1 ? skeleton.hipsHeight : 0)) : skeleton.rest[j].map((v, k) => v - skeleton.rest[a][k]);
    const p = toUnityP(offset);
    const q = toUnityQ(local);
    out.push(["/VMC/Ext/Bone/Pos", unity, f(p[0]), f(p[1]), f(p[2]), f(q[0]), f(q[1]), f(q[2]), f(q[3])]);
  }
  const curves = Object.entries(blend);
  for (const [name, value] of curves) out.push(["/VMC/Ext/Blend/Val", pascal(name), f(value)]);
  if (curves.length) out.push(["/VMC/Ext/Blend/Apply"]);
  return out;
}

/** One frame as plain OSC: each SOMA joint's rotation against the rest pose, in SOMA's axes, and each face curve. */
export function oscMessages(skeleton, world, blend = {}) {
  const out = skeleton.names.flatMap((n, j) => (world[j] ? [[`/mocap/joint/${n}`, ...world[j].map(f)]] : []));
  for (const [name, value] of Object.entries(blend)) out.push([`/mocap/blend/${name}`, f(value)]);
  return out;
}

