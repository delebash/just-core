// SPDX-License-Identifier: MIT
/* eslint-disable i18next/no-literal-string -- SOMA's joint names and MediaPipe's landmark names: ids, never shown words */
// Moved here 2026-11-08 from just-mocap's bench/live/solver.js (where it was written and scored — just-mocap RESEARCH.md,
// "the live solver on recorded MediaPipe landmarks"), so the Motion capture screen's Live tab and the bench run one
// implementation; the bench's score_live.js imports it from here. Its rest skeleton is somaRest.json beside it.
//
// Live solver: MediaPipe's world landmarks (Pose Landmarker's 33, Hand Landmarker's 21 per hand) onto the SAME SOMA
// skeleton the offline files use (somaRest.json beside this file, written by just-mocap bench/live/soma_rest.py), frame by frame, causally, so it can run on a
// webcam. Plain ES module, no dependencies: it runs in the window (with MediaPipe's JS Tasks) and in Node (for scoring
// on recorded landmarks, just-mocap bench/live/score_live.js).
//
// How (the research's live recipe, just-core docs/plans/2026-10-31-just-direct-research-mocap-notes/live-and-apps.md,
// "How do methods get from keypoints to bone rotations"): bone lengths stay the rest skeleton's; each bone is turned,
// parent first, by the smallest rotation that points it where MediaPipe sees it (swing, as HybrIK's analytic part and
// BlendArMocap do); the hips and chest take their frames from the hip and shoulder lines, the spine and neck share the
// turn between them; each hand takes its frame from the palm (wrist, index and pinky knuckles) and each finger bone its
// direction from the hand landmarks; then a causal One Euro filter on each joint's rotation (XR Animator's quaternion
// mode). Rotations are world rotations relative to the rest pose, W, as the offline export's are: a joint sits at
// p_parent + W_parent (rest_joint - rest_parent).
//
// Axes: MediaPipe's world landmarks are x right, y down, z away from the camera, metres, origin between the hips; SOMA is
// Y up and faces +Z with its left side at +X. For a person facing the camera that is (x, -y, -z).

const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const scale = (a, s) => [a[0] * s, a[1] * s, a[2] * s];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const norm = (a) => Math.hypot(a[0], a[1], a[2]);
const unit = (a) => {
  const n = norm(a);
  return n > 1e-9 ? scale(a, 1 / n) : [0, 0, 0];
};
const mid = (a, b) => scale(add(a, b), 0.5);

// Quaternions [x, y, z, w].
export const qIdentity = () => [0, 0, 0, 1];
export function qMul(a, b) {
  return [
    a[3] * b[0] + a[0] * b[3] + a[1] * b[2] - a[2] * b[1],
    a[3] * b[1] - a[0] * b[2] + a[1] * b[3] + a[2] * b[0],
    a[3] * b[2] + a[0] * b[1] - a[1] * b[0] + a[2] * b[3],
    a[3] * b[3] - a[0] * b[0] - a[1] * b[1] - a[2] * b[2],
  ];
}
export const qConj = (q) => [-q[0], -q[1], -q[2], q[3]];
export function qRotate(q, v) {
  const p = qMul(qMul(q, [v[0], v[1], v[2], 0]), qConj(q));
  return [p[0], p[1], p[2]];
}
function qNormalize(q) {
  const n = Math.hypot(q[0], q[1], q[2], q[3]) || 1;
  return q.map((v) => v / n);
}
/** The smallest rotation taking direction a onto direction b. */
export function qBetween(a, b) {
  const u = unit(a);
  const v = unit(b);
  const d = dot(u, v);
  if (d < -1 + 1e-9) {
    const axis = unit(Math.abs(u[0]) < 0.9 ? cross(u, [1, 0, 0]) : cross(u, [0, 1, 0]));
    return [axis[0], axis[1], axis[2], 0];
  }
  const c = cross(u, v);
  return qNormalize([c[0], c[1], c[2], 1 + d]);
}
/** Rotation whose columns are the orthonormal frame (x, y) completes: x kept, y made orthogonal. */
export function qFromFrame(x, y) {
  const ex = unit(x);
  const ey = unit(sub(y, scale(ex, dot(y, ex))));
  const ez = cross(ex, ey);
  const m = [ex, ey, ez]; // columns
  const [m00, m10, m20] = m[0];
  const [m01, m11, m21] = m[1];
  const [m02, m12, m22] = m[2];
  const trace = m00 + m11 + m22;
  let q;
  if (trace > 0) {
    const s = Math.sqrt(trace + 1) * 2;
    q = [(m21 - m12) / s, (m02 - m20) / s, (m10 - m01) / s, 0.25 * s];
  } else if (m00 > m11 && m00 > m22) {
    const s = Math.sqrt(1 + m00 - m11 - m22) * 2;
    q = [0.25 * s, (m01 + m10) / s, (m02 + m20) / s, (m21 - m12) / s];
  } else if (m11 > m22) {
    const s = Math.sqrt(1 + m11 - m00 - m22) * 2;
    q = [(m01 + m10) / s, 0.25 * s, (m12 + m21) / s, (m02 - m20) / s];
  } else {
    const s = Math.sqrt(1 + m22 - m00 - m11) * 2;
    q = [(m02 + m20) / s, (m12 + m21) / s, 0.25 * s, (m10 - m01) / s];
  }
  return qNormalize(q);
}
export function qSlerp(a, b, t) {
  let d = a[0] * b[0] + a[1] * b[1] + a[2] * b[2] + a[3] * b[3];
  const bb = d < 0 ? b.map((v) => -v) : b;
  d = Math.abs(d);
  if (d > 0.9995) return qNormalize(a.map((v, i) => v + (bb[i] - v) * t));
  const theta = Math.acos(d);
  const s = Math.sin(theta);
  const wa = Math.sin((1 - t) * theta) / s;
  const wb = Math.sin(t * theta) / s;
  return a.map((v, i) => v * wa + bb[i] * wb);
}
export const qAngle = (a, b) => 2 * Math.acos(Math.min(1, Math.abs(a[0] * b[0] + a[1] * b[1] + a[2] * b[2] + a[3] * b[3])));

/** MediaPipe's world axes (x right, y down, z away) into SOMA's (Y up, facing +Z). */
export const fromMediaPipe = (p) => [p[0], -p[1], -p[2]];

// MediaPipe Pose's 33 landmarks by name (the person's left and right).
export const POSE = { nose: 0, leftEar: 7, rightEar: 8, leftShoulder: 11, rightShoulder: 12, leftElbow: 13, rightElbow: 14, leftWrist: 15, rightWrist: 16, leftHip: 23, rightHip: 24, leftKnee: 25, rightKnee: 26, leftAnkle: 27, rightAnkle: 28, leftHeel: 29, rightHeel: 30, leftToe: 31, rightToe: 32 };
// SOMA's finger joints against MediaPipe Hand's 21 landmarks (0 wrist; thumb 1-4; index 5-8; middle 9-12; ring 13-16;
// pinky 17-20). SOMA's Index1 (and the other fingers' 1) is the metacarpal, inside the palm: the knuckle is its 2.
export const FINGERS = {
  Thumb: [["Thumb1", 1], ["Thumb2", 2], ["Thumb3", 3], ["ThumbEnd", 4]],
  Index: [["Index2", 5], ["Index3", 6], ["Index4", 7], ["IndexEnd", 8]],
  Middle: [["Middle2", 9], ["Middle3", 10], ["Middle4", 11], ["MiddleEnd", 12]],
  Ring: [["Ring2", 13], ["Ring3", 14], ["Ring4", 15], ["RingEnd", 16]],
  Pinky: [["Pinky2", 17], ["Pinky3", 18], ["Pinky4", 19], ["PinkyEnd", 20]],
};

/** One Euro filter for a rotation (Casiez et al. 2012), its speed the angle per second between filtered frames. */
class RotationEuro {
  constructor({ minCutoff = 1.5, beta = 0.3, dCutoff = 1.0 } = {}) {
    Object.assign(this, { minCutoff, beta, dCutoff, last: null, speed: 0 });
  }
  static alpha(cutoff, dt) {
    const tau = 1 / (2 * Math.PI * cutoff);
    return 1 / (1 + tau / dt);
  }
  step(q, dt) {
    if (!this.last) {
      this.last = q;
      return q;
    }
    const raw = qAngle(this.last, q) / dt;
    this.speed += RotationEuro.alpha(this.dCutoff, dt) * (raw - this.speed);
    const cutoff = this.minCutoff + this.beta * this.speed;
    this.last = qSlerp(this.last, q, RotationEuro.alpha(cutoff, dt));
    return this.last;
  }
}

export class LiveSolver {
  /** skeleton: soma_rest.json ({names, parents, rest}); filter: One Euro settings, or false for none. */
  constructor(skeleton, { filter = {} } = {}) {
    this.names = skeleton.names;
    this.parents = skeleton.parents;
    this.rest = skeleton.rest;
    this.index = Object.fromEntries(this.names.map((n, i) => [n, i]));
    this.children = this.names.map((_, j) => this.parents.flatMap((p, c) => (p === j ? [c] : [])));
    this.filters = filter === false ? null : this.names.map(() => new RotationEuro(filter));
  }

  restVector(from, to) {
    return sub(this.rest[this.index[to]], this.rest[this.index[from]]);
  }

  /** Turn joint `name` (its parent already solved) so its bone to `child` points along `direction` (world). */
  swing(world, name, child, direction) {
    const j = this.index[name];
    const parent = world[this.parents[j]];
    const carried = qRotate(parent, this.restVector(name, child));
    world[j] = qNormalize(qMul(qBetween(carried, direction), parent));
  }

  /** Share the turn from `from` (solved) to the target world rotation over the chain `joints`, each its equal part. */
  share(world, joints, target) {
    const start = world[this.parents[this.index[joints[0]]]];
    joints.forEach((name, k) => {
      world[this.index[name]] = qSlerp(start, target, (k + 1) / joints.length);
    });
  }

  /**
   * One frame. pose: Pose Landmarker's 33 world landmarks ([x, y, z(, visibility)], MediaPipe axes); hands: {left,
   * right} each 21 world landmarks or null. dt: seconds since the last frame (for the filter). Returns {world, positions}:
   * world rotations relative to rest (quaternions, one per joint) and joint positions in metres (Hips at the origin).
   */
  solve(pose, hands = {}, dt = 1 / 30) {
    const P = (name) => fromMediaPipe(pose[POSE[name]]);
    const world = this.names.map(() => qIdentity());
    const hips = mid(P("leftHip"), P("rightHip"));
    const shoulders = mid(P("leftShoulder"), P("rightShoulder"));
    // Hips and chest: lateral axis from the person's right to left (+X at rest), up from hips to shoulders (+Y).
    world[this.index.Hips] = qFromFrame(sub(P("leftHip"), P("rightHip")), sub(shoulders, hips));
    const chest = qFromFrame(sub(P("leftShoulder"), P("rightShoulder")), sub(shoulders, hips));
    this.share(world, ["Spine1", "Spine2", "Chest"], chest);
    // Head: lateral from the ears, up from the shoulders to the ears.
    const ears = mid(P("leftEar"), P("rightEar"));
    const head = qFromFrame(sub(P("leftEar"), P("rightEar")), sub(ears, shoulders));
    this.share(world, ["Neck1", "Neck2", "Head"], head);
    for (const n of ["HeadEnd", "Jaw", "LeftEye", "RightEye"]) world[this.index[n]] = world[this.index.Head];
    for (const side of ["Left", "Right"]) {
      const s = side.toLowerCase();
      world[this.index[`${side}Shoulder`]] = world[this.index.Chest]; // the collarbone stays at rest on the chest
      this.swing(world, `${side}Arm`, `${side}ForeArm`, sub(P(`${s}Elbow`), P(`${s}Shoulder`)));
      this.swing(world, `${side}ForeArm`, `${side}Hand`, sub(P(`${s}Wrist`), P(`${s}Elbow`)));
      this.solveHand(world, side, hands[s]);
      this.swing(world, `${side}Leg`, `${side}Shin`, sub(P(`${s}Knee`), P(`${s}Hip`)));
      this.swing(world, `${side}Shin`, `${side}Foot`, sub(P(`${s}Ankle`), P(`${s}Knee`)));
      this.swing(world, `${side}Foot`, `${side}ToeEnd`, sub(P(`${s}Toe`), P(`${s}Ankle`)));
      world[this.index[`${side}ToeBase`]] = world[this.index[`${side}Foot`]];
      world[this.index[`${side}ToeEnd`]] = world[this.index[`${side}Foot`]];
    }
    if (this.filters) world.forEach((q, j) => (world[j] = this.filters[j].step(q, dt)));
    return { world, positions: this.positions(world) };
  }

  /** The hand's frame from its palm, then each finger bone towards its next landmark; no hand seen: it follows the forearm. */
  solveHand(world, side, hand) {
    const handIndex = this.index[`${side}Hand`];
    const fingerJoints = this.names.filter((n) => n.startsWith(`${side}Hand`) && n !== `${side}Hand`);
    if (!hand) {
      world[handIndex] = world[this.index[`${side}ForeArm`]];
      for (const n of fingerJoints) world[this.index[n]] = world[handIndex];
      return;
    }
    const H = (i) => fromMediaPipe(hand[i]);
    // The palm frame at rest and seen: along the hand (wrist to middle knuckle) and across it (pinky to index knuckle).
    const prefix = `${side}Hand`;
    const restAlong = this.restVector(prefix, `${prefix}Middle2`);
    const restAcross = this.restVector(`${prefix}Pinky2`, `${prefix}Index2`);
    const seenAlong = sub(H(9), H(0));
    const seenAcross = sub(H(5), H(17));
    const rest = qFromFrame(restAlong, restAcross);
    const seen = qFromFrame(seenAlong, seenAcross);
    world[handIndex] = qNormalize(qMul(seen, qConj(rest)));
    for (const n of fingerJoints) world[this.index[n]] = world[handIndex]; // the metacarpals stay in the palm
    for (const chain of Object.values(FINGERS)) {
      for (let k = 0; k < chain.length - 1; k++) {
        const [joint, at] = chain[k];
        const [next, to] = chain[k + 1];
        this.swing(world, `${prefix}${joint}`, `${prefix}${next}`, sub(H(to), H(at)));
      }
      const [last] = chain[chain.length - 1];
      world[this.index[`${prefix}${last}`]] = world[this.index[`${prefix}${chain[chain.length - 2][0]}`]];
    }
  }

  /** Joint positions from world rotations: p = p_parent + W_parent (rest - rest_parent), Hips at the origin. */
  positions(world) {
    const out = this.names.map(() => [0, 0, 0]);
    this.parents.forEach((p, j) => {
      out[j] = p < 0 ? [0, 0, 0] : add(out[p], qRotate(world[p], sub(this.rest[j], this.rest[p])));
    });
    return out;
  }

  /** Local rotations (each joint's against its parent), as a BVH or VMC sender wants them. */
  local(world) {
    return world.map((q, j) => (this.parents[j] < 0 ? q : qMul(qConj(world[this.parents[j]]), q)));
  }
}
