// SPDX-License-Identifier: MIT
// runner/motion_tracks.js — the motion-track guide frames for LTX-2.3's Motion Track Control IC-LoRA, checked rule by
// rule against the clean-room spec (docs/plans/2026-11-06-motion-tracks-spec.md) with small cases worked by hand: the
// editor's sampling, the frame count and trail, the reference size, the circles' size, colour and overlap, the channel
// swap and the bilinear scaling. The comparison with the reference renderer's own frames is a separate test.
//
// Most frame tests use a 216 × 216 output: its reference is 1080 × 1080, five times larger, so output pixel X reads
// exactly reference pixel 5X + 2 (the bilinear source is (X + 0.5) × 5 − 0.5 = 5X + 2, weight 0), and a point at output
// X + 0.4 is centred there. The colours then come through unblended.
import { expect, test } from "vitest";
import { drawMotionTracks, referenceSize, sampleTrack } from "../src/runner/motion_tracks.js";

const RED = [0, 0, 255]; // the newest point: pure red, which the channel swap puts in the third byte
const BLUE = [255, 0, 0]; // the oldest point: pure blue, in the first byte
const BLACK = [0, 0, 0];

const px = (frame, width, x, y) => [...frame.subarray((y * width + x) * 3, (y * width + x) * 3 + 3)];
const at = (x, y) => ({ x, y });

test("sampling no control points gives no points", () => {
  expect(sampleTrack([], 5)).toEqual([]);
});

test("sampling one control point repeats it n times, rounded half to even", () => {
  expect(sampleTrack([at(3.5, 2.5)], 3)).toEqual([at(4, 2), at(4, 2), at(4, 2)]);
});

test("sampling two control points spaces n points evenly from the first to the second", () => {
  expect(sampleTrack([at(0, 0), at(4, 8)], 5)).toEqual([at(0, 0), at(1, 2), at(2, 4), at(3, 6), at(4, 8)]);
});

test("sampling rounds a half to the even pixel", () => {
  // The midpoint of (0, 0)–(1, 3) is (0.5, 1.5): 0.5 goes down to 0 and 1.5 up to 2.
  expect(sampleTrack([at(0, 0), at(1, 3)], 3)).toEqual([at(0, 0), at(0, 2), at(1, 3)]);
});

test("sampling two control points computes a + ((b − a) × i) ÷ (n − 1), so an exact half stays exact", () => {
  // 45 × i ÷ 10 is exact: 4.5 → 4, 13.5 → 14, 22.5 → 22, 31.5 → 32, 40.5 → 40. Multiplying by i ÷ 10 first would give
  // 31.499999999999996 for point 7, which rounds to 31.
  const xs = sampleTrack([at(0, 0), at(45, 0)], 11).map((p) => p.x);
  expect(xs).toEqual([0, 4, 9, 14, 18, 22, 27, 32, 36, 40, 45]);
});

test("sampling three control points follows the Catmull-Rom spline through them", () => {
  const cps = [at(0, 0), at(10, 0), at(10, 10)];
  // n = 3 lands exactly on the control points.
  expect(sampleTrack(cps, 3)).toEqual(cps);
  // n = 5: points 1 and 3 sit at t = ½ of segments 0 and 1. Segment 0's neighbours are (0,0) (the phantom), (0,0),
  // (10,0), (10,10): x = ½(0 + 10·½ + 30·¼ − 20·⅛) = 5, y = ½(0 + 0 − 10·¼ + 10·⅛) = −0.625 → −1. Segment 1's are (0,0),
  // (10,0), (10,10), (10,10) (the phantom): x = ½(20 + 10·½ − 20·¼ + 10·⅛) = 10.625 → 11, y = ½(10·½ + 30·¼ − 20·⅛) = 5.
  expect(sampleTrack(cps, 5)).toEqual([at(0, 0), at(5, -1), at(10, 0), at(11, 5), at(10, 10)]);
});

test("sampling needs a frame count of at least 2", () => {
  expect(() => sampleTrack([at(1, 1)], 1)).toThrow(RangeError);
});

test("the reference size keeps the aspect with the short side at 1080", () => {
  expect(referenceSize(1152, 640)).toEqual({ width: 1944, height: 1080, sx: 1.6875, sy: 1.6875 });
  expect(referenceSize(640, 1152)).toEqual({ width: 1080, height: 1944, sx: 1.6875, sy: 1.6875 });
  expect(referenceSize(1080, 1080)).toEqual({ width: 1080, height: 1080, sx: 1, sy: 1 });
  // 1000 × 1080 ÷ 700 = 1542.86, floored; the scales are ordinary 64-bit quotients.
  expect(referenceSize(1000, 700)).toEqual({ width: 1542, height: 1080, sx: 1.542, sy: 1080 / 700 });
  expect(referenceSize(700, 1000)).toEqual({ width: 1080, height: 1542, sx: 1080 / 700, sy: 1.542 });
});

test("no tracks give one black frame of the output size", () => {
  for (const tracks of [[], [[]]]) {
    const { width, height, frames } = drawMotionTracks({ tracks, width: 8, height: 4 });
    expect([width, height, frames.length]).toEqual([8, 4, 1]);
    expect(frames[0].length).toBe(8 * 4 * 3);
    expect(frames[0].every((b) => b === 0)).toBe(true);
  }
});

test("the number of frames is the length of the longest track", () => {
  const p = at(50.4, 50.4);
  const { frames } = drawMotionTracks({ tracks: [[p, p, p], [p, p, p, p, p]], width: 216, height: 216 });
  expect(frames.length).toBe(5);
  for (const frame of frames) {
    expect(Buffer.isBuffer(frame)).toBe(true);
    expect(frame.length).toBe(216 * 216 * 3);
  }
});

test("the newest point is a radius-8 circle in pure red, which lands in the third byte", () => {
  const { frames } = drawMotionTracks({ tracks: [[at(100, 200)]], width: 1080, height: 1080 });
  const f = frames[0];
  let lit = 0;
  for (let i = 0; i < f.length; i += 3) {
    if (f[i] || f[i + 1] || f[i + 2]) {
      lit++;
      expect([f[i], f[i + 1], f[i + 2]]).toEqual(RED);
    }
  }
  expect(lit).toBe(197); // the integer points with dx² + dy² ≤ 64
  expect(px(f, 1080, 108, 200)).toEqual(RED);
  expect(px(f, 1080, 109, 200)).toEqual(BLACK);
  expect(px(f, 1080, 105, 206)).toEqual(RED); // 25 + 36 = 61
  expect(px(f, 1080, 106, 206)).toEqual(BLACK); // 36 + 36 = 72
  expect(px(f, 1080, 100, 192)).toEqual(RED);
  expect(px(f, 1080, 100, 191)).toEqual(BLACK);
});

test("a circle's centre pixel is rounded half to even", () => {
  // 100.5 → 100 and 200.5 → 200; 301.5 → 302 and 400.5 → 400.
  const { frames } = drawMotionTracks({ tracks: [[at(100.5, 200.5)], [at(301.5, 400.5)]], width: 1080, height: 1080 });
  const f = frames[0];
  expect(px(f, 1080, 92, 200)).toEqual(RED);
  expect(px(f, 1080, 108, 200)).toEqual(RED);
  expect(px(f, 1080, 109, 200)).toEqual(BLACK);
  expect(px(f, 1080, 100, 208)).toEqual(RED);
  expect(px(f, 1080, 100, 209)).toEqual(BLACK);
  expect(px(f, 1080, 293, 400)).toEqual(BLACK);
  expect(px(f, 1080, 294, 400)).toEqual(RED);
  expect(px(f, 1080, 310, 400)).toEqual(RED);
});

test("a circle's centre is rounded from the position stored as a 32-bit float", () => {
  // 100.500001 is 100.5 as a 32-bit float (a step there is 0.0000076), which rounds half to even to 100; the 64-bit
  // value would round up to 101.
  const f = drawMotionTracks({ tracks: [[at(100.500001, 200)]], width: 1080, height: 1080 }).frames[0];
  expect(px(f, 1080, 92, 200)).toEqual(RED);
  expect(px(f, 1080, 108, 200)).toEqual(RED);
  expect(px(f, 1080, 109, 200)).toEqual(BLACK);
});

test("the oldest point is a radius-2 circle in pure blue, and the colour runs blue, green, yellow, red", () => {
  // 51 points 20 reference pixels apart (no overlaps); in the last frame point i is 50 − i frames old.
  const track = Array.from({ length: 51 }, (_, i) => at(2 + 4 * i + 0.4, 10.4));
  const { frames } = drawMotionTracks({ tracks: [track], width: 216, height: 216 });
  expect(frames.length).toBe(51);
  const f = frames[50];
  const col = (i) => 2 + 4 * i;
  expect(px(f, 216, col(0), 10)).toEqual(BLUE); // age 50
  expect(px(f, 216, col(10), 10)).toEqual([102, 153, 0]); // age 40, ratio 0.2: red 0, green 0.6, blue 0.4
  expect(px(f, 216, col(40), 10)).toEqual([0, 153, 255]); // age 10, ratio 0.8: red 1, green 0.6, blue 0
  expect(px(f, 216, col(50), 10)).toEqual(RED); // age 0
  // One output pixel over is five reference pixels out: beyond the oldest's radius 2, inside the newest's radius 8.
  expect(px(f, 216, col(0) + 1, 10)).toEqual(BLACK);
  expect(px(f, 216, col(50) + 1, 10)).toEqual(RED);
});

test("a track that ends early leaves its trail for 50 more frames, then nothing", () => {
  const a = [at(10.4, 10.4), at(30.4, 10.4)];
  const b = Array.from({ length: 53 }, () => at(150.4, 150.4));
  const { frames } = drawMotionTracks({ tracks: [a, b], width: 216, height: 216 });
  expect(frames.length).toBe(53);
  // Frame 4: a's points are 4 and 3 frames old — ratios 0.92 and 0.94, green 0.24 and 0.18.
  expect(px(frames[4], 216, 10, 10)).toEqual([0, 61, 255]);
  expect(px(frames[4], 216, 30, 10)).toEqual([0, 46, 255]);
  // Frame 51: the second point is 50 old (the oldest drawn), the first 51 (gone).
  expect(px(frames[51], 216, 30, 10)).toEqual(BLUE);
  expect(px(frames[51], 216, 10, 10)).toEqual(BLACK);
  expect(px(frames[52], 216, 30, 10)).toEqual(BLACK);
  expect(px(frames[52], 216, 150, 150)).toEqual(RED);
});

test("where circles overlap the newest one wins, whatever track it is on", () => {
  // In frame 1 the first track's newest point is at (100, 100) and the second track's point from frame 0 (age 1,
  // radius 7.88, green 0.06) at (110, 100). Painting track by track would leave the older colour on top.
  const tracks = [
    [at(500, 500), at(100, 100)],
    [at(110, 100), at(700, 700)],
  ];
  const f = drawMotionTracks({ tracks, width: 1080, height: 1080 }).frames[1];
  expect(px(f, 1080, 105, 100)).toEqual(RED); // in both
  expect(px(f, 1080, 108, 100)).toEqual(RED); // in both
  expect(px(f, 1080, 117, 100)).toEqual([0, 15, 255]); // only the older one
  expect(px(f, 1080, 118, 100)).toEqual(BLACK); // 64 > 7.88²
});

test("scaling to half the reference size averages each 2 × 2 block", () => {
  // 540 × 540: output pixel X reads reference 2X and 2X + 1 at weight ½ each. The point lands on reference (100, 100).
  const f = drawMotionTracks({ tracks: [[at(50, 50)]], width: 540, height: 540 }).frames[0];
  expect(px(f, 540, 53, 50)).toEqual(RED); // (106–107, 100–101): all four inside
  expect(px(f, 540, 52, 53)).toEqual([0, 0, 128]); // (104–105, 106–107): two of four, 127.5 → 128
  expect(px(f, 540, 54, 50)).toEqual([0, 0, 64]); // (108–109, 100–101): one of four, 63.75 → 64
  expect(px(f, 540, 54, 54)).toEqual(BLACK);
});

test("scaling 1944 × 1080 to 1152 × 640 weighs the two taps by distance", () => {
  // The scale is 1.6875; the point (100, 100) lands on reference (168.75, 168.75) → centre (169, 169). Output row 100
  // reads reference rows 169 and 170 (weight 0.09375). Output column 105 reads columns 177 and 178 (weight 0.53125):
  // only (177, 169) is inside, so red = 0.90625 × 0.46875 = 0.4248 → 108.
  const f = drawMotionTracks({ tracks: [[at(100, 100)]], width: 1152, height: 640 }).frames[0];
  expect(px(f, 1152, 100, 100)).toEqual(RED);
  expect(px(f, 1152, 104, 100)).toEqual(RED); // columns 175–176: all four inside
  expect(px(f, 1152, 105, 100)).toEqual([0, 0, 108]);
});

test("scaling up clamps the taps at both edges and drops circle pixels outside the frame", () => {
  // 1081 × 1081 has a 1080 × 1080 reference. Output pixel 0 reads source −0.0005, raised to 0; output 1080 reads
  // 1079.0005, whose second tap is held at 1079. Points at the corners are centred on (0, 0) and (1079, 1079).
  const f = drawMotionTracks({ tracks: [[at(0, 0)], [at(1080, 1080)]], width: 1081, height: 1081 }).frames[0];
  expect(px(f, 1081, 0, 0)).toEqual(RED);
  expect(px(f, 1081, 1080, 1080)).toEqual(RED);
  expect(px(f, 1081, 540, 540)).toEqual(BLACK);
});
