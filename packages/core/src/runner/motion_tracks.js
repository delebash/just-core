// SPDX-License-Identifier: MIT
// The motion-track guide frames for LTX-2.3's Motion Track Control IC-LoRA: the pictures sd.cpp's video job takes as
// `control_frames` to say where points should move. Written from the kit's clean-room spec alone
// (docs/plans/2026-11-06-motion-tracks-spec.md). The only reference renderer is under a licence that isn't open, so the
// spec describes the format in words and this file draws it from that page. Each frame is drawn at a reference size
// whose short side is 1080: every track's last 51 points as filled circles, the newest largest and red, the oldest
// smallest and blue, the newest on top. It is then scaled down bilinearly (PyTorch's align_corners=False rule) and
// returned as 8-bit pixels with the channels reversed, which is how the LoRA's training data was stored.

const REF_SHORT_SIDE = 1080;
const MIN_RADIUS = 2;
const MAX_RADIUS = 8;
const TRAIL = 50; // frames; a frame shows points aged 0 (newest) to 50 (oldest)
const REACH = 9; // no circle reaches further than this many pixels from its centre

/** Round to a whole number, a half going to the even neighbour (Python's `round`). `+ 0` turns -0 into 0. */
function roundHalfEven(v) {
  const f = Math.floor(v);
  const d = v - f;
  return (d > 0.5 || (d === 0.5 && f % 2 !== 0) ? f + 1 : f) + 0;
}

function checkPoint(p) {
  if (!p || !Number.isFinite(p.x) || !Number.isFinite(p.y)) {
    throw new TypeError(`a track point needs a finite x and y, got ${JSON.stringify(p)}`);
  }
  return p;
}

/** The uniform Catmull-Rom spline (tension ½) between p1 and p2 at t, on one axis — the spec's formula as written. */
function catmullRom(p0, p1, p2, p3, t) {
  const t2 = t * t;
  const t3 = t2 * t;
  return 0.5 * (2 * p1 + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 + (-p0 + 3 * p1 - 3 * p2 + p3) * t3);
}

/**
 * One point per frame from a few control points (the spec's "editor's sampling"): none → none, one → that point n times,
 * two → n points evenly along the line, three or more → a Catmull-Rom spline through them all with the end points
 * repeated as phantom neighbours. Every x and y is rounded half-to-even. `n` is the frame count, 2 or more.
 */
export function sampleTrack(controlPoints, n) {
  if (!Number.isInteger(n) || n < 2) throw new RangeError(`sampleTrack needs a frame count of 2 or more, got ${n}`);
  if (!Array.isArray(controlPoints)) throw new TypeError("sampleTrack needs an array of control points");
  const pts = controlPoints.map(checkPoint);
  const k = pts.length;
  if (k === 0) return [];
  const out = new Array(n);
  for (let i = 0; i < n; i++) {
    const f = i / (n - 1);
    let x;
    let y;
    if (k === 1) {
      x = pts[0].x;
      y = pts[0].y;
    } else if (k === 2) {
      // a + ((b − a) × i) ÷ (n − 1), in that order: the order decides an exact .5 before the rounding.
      x = pts[0].x + ((pts[1].x - pts[0].x) * i) / (n - 1);
      y = pts[0].y + ((pts[1].y - pts[0].y) * i) / (n - 1);
    } else {
      const g = f * (k - 1);
      const s = Math.min(Math.floor(g), k - 2);
      const t = g - s;
      // The padded list repeats the first and last control point once; its neighbours of segment s are these.
      const p0 = pts[Math.max(s - 1, 0)];
      const p1 = pts[s];
      const p2 = pts[s + 1];
      const p3 = pts[Math.min(s + 2, k - 1)];
      x = catmullRom(p0.x, p1.x, p2.x, p3.x, t);
      y = catmullRom(p0.y, p1.y, p2.y, p3.y, t);
    }
    out[i] = { x: roundHalfEven(x), y: roundHalfEven(y) };
  }
  return out;
}

/**
 * The reference size a frame is drawn at — short side 1080, aspect kept — and the scale from output pixels to it, in
 * ordinary 64-bit arithmetic (only a point's scaled position is then stored as a 32-bit float; see drawMotionTracks).
 */
export function referenceSize(width, height) {
  let rw;
  let rh;
  if (height <= width) {
    rh = REF_SHORT_SIDE;
    rw = Math.floor((width * REF_SHORT_SIDE) / height);
  } else {
    rw = REF_SHORT_SIDE;
    rh = Math.floor((height * REF_SHORT_SIDE) / width);
  }
  return { width: rw, height: rh, sx: rw / width, sy: rh / height };
}

/**
 * Per age 0..50: the circle as a half-width per row offset (-9..9; -1 = no pixels on that row), and the colour.
 * Index 0 of PALETTE is black; index age + 1 is that age's colour, already in the output's channel order (blue, green,
 * red — the spec's channel reversal).
 */
const SPANS = [];
const PALETTE = new Float64Array((TRAIL + 2) * 3);
for (let a = 0; a <= TRAIL; a++) {
  const r = 1 - a / TRAIL;
  const radius = MIN_RADIUS + (MAX_RADIUS - MIN_RADIUS) * r;
  const spans = new Int8Array(2 * REACH + 1);
  for (let dy = -REACH; dy <= REACH; dy++) {
    let hw = -1;
    for (let dx = 0; dx <= REACH; dx++) if (dx * dx + dy * dy <= radius * radius) hw = dx;
    spans[dy + REACH] = hw;
  }
  SPANS.push(spans);
  let red;
  let green;
  let blue;
  if (r <= 1 / 3) {
    red = 0;
    green = 3 * r;
    blue = 1 - 3 * r;
  } else if (r <= 2 / 3) {
    red = 3 * (r - 1 / 3);
    green = 1;
    blue = 0;
  } else {
    red = 1;
    green = 1 - 3 * (r - 2 / 3);
    blue = 0;
  }
  PALETTE.set([blue, green, red], (a + 1) * 3);
}

/**
 * The two source pixels and the weight each output pixel reads along one axis (bilinear, align_corners=False, no
 * antialiasing), and for each source pixel the range of output pixels that read it: `firstOut[c]` the first output
 * pixel whose second tap is at or past c, `lastOut[c]` the last whose first tap is at or before c.
 */
function axisTaps(inSize, outSize) {
  const i0 = new Int32Array(outSize);
  const i1 = new Int32Array(outSize);
  const w = new Float64Array(outSize);
  const scale = inSize / outSize;
  for (let d = 0; d < outSize; d++) {
    let src = (d + 0.5) * scale - 0.5;
    if (src < 0) src = 0;
    const a = Math.floor(src);
    i0[d] = a;
    i1[d] = Math.min(a + 1, inSize - 1);
    w[d] = src - a;
  }
  const firstOut = new Int32Array(inSize).fill(outSize);
  const lastOut = new Int32Array(inSize).fill(-1);
  for (let d = 0, c = 0; d < outSize; d++) while (c <= i1[d]) firstOut[c++] = d;
  for (let d = outSize - 1, c = inSize - 1; d >= 0; d--) while (c >= i0[d]) lastOut[c--] = d;
  return { i0, i1, w, firstOut, lastOut };
}

/** A channel value 0..1 as a byte: round(v × 255), half to even, held to 0..255. */
function toByte(v) {
  const s = v * 255;
  let f = Math.floor(s);
  const d = s - f;
  if (d > 0.5 || (d === 0.5 && (f & 1) === 1)) f++;
  return f < 0 ? 0 : f > 255 ? 255 : f;
}

/**
 * The guide frames for `tracks` (each a list of `{x, y}` points in output pixels, one per frame from frame 0) at
 * `width` × `height`: `{width, height, frames}`, one frame per point of the longest track (no tracks or only empty ones:
 * one black frame), each a Buffer of width × height × 3 bytes, row by row from the top-left, first byte of a pixel
 * the blue component, then green, then red.
 */
export function drawMotionTracks({ tracks = [], width, height } = {}) {
  if (!Number.isInteger(width) || width < 1 || !Number.isInteger(height) || height < 1) {
    throw new RangeError(`drawMotionTracks needs a whole-pixel width and height, got ${width} × ${height}`);
  }
  if (!Array.isArray(tracks) || !tracks.every(Array.isArray)) {
    throw new TypeError("drawMotionTracks needs tracks as an array of point arrays");
  }
  const frameBytes = width * height * 3;
  const frameCount = tracks.reduce((m, track) => Math.max(m, track.length), 0);
  if (frameCount === 0) return { width, height, frames: [Buffer.alloc(frameBytes)] };

  const ref = referenceSize(width, height);
  const rw = ref.width;
  const rh = ref.height;
  // Each point's centre pixel at the reference size, once: x × sx in 64-bit, stored as a 32-bit float (as the reference
  // renderer stores it), then rounded half-to-even from that 32-bit value.
  const centres = tracks.map((track) => {
    const c = new Float64Array(track.length * 2);
    track.forEach((p, i) => {
      checkPoint(p);
      c[2 * i] = roundHalfEven(Math.fround(p.x * ref.sx));
      c[2 * i + 1] = roundHalfEven(Math.fround(p.y * ref.sy));
    });
    return c;
  });

  // The reference frame, reused: 0 = black, else the age + 1 of the circle painted there last. Each row's painted
  // columns are kept as [rowLo, rowHi] so the scaling and the clearing skip the black rest.
  const refPx = new Uint8Array(rw * rh);
  const rowLo = new Int32Array(rh).fill(rw);
  const rowHi = new Int32Array(rh).fill(-1);
  const paint = (cx, cy, age) => {
    if (cx + REACH < 0 || cx - REACH >= rw || cy + REACH < 0 || cy - REACH >= rh) return;
    const spans = SPANS[age];
    const v = age + 1;
    for (let j = 0; j < spans.length; j++) {
      const hw = spans[j];
      const y = cy + j - REACH;
      if (hw < 0 || y < 0 || y >= rh) continue;
      const xa = Math.max(0, cx - hw);
      const xb = Math.min(rw - 1, cx + hw);
      if (xa > xb) continue;
      const base = y * rw;
      for (let x = xa; x <= xb; x++) refPx[base + x] = v;
      if (xa < rowLo[y]) rowLo[y] = xa;
      if (xb > rowHi[y]) rowHi[y] = xb;
    }
  };

  const tx = axisTaps(rw, width);
  const ty = axisTaps(rh, height);
  const frames = [];
  for (let t = 0; t < frameCount; t++) {
    // Oldest first, so a pixel ends with the newest circle covering it.
    for (let age = Math.min(TRAIL, t); age >= 0; age--) {
      const tau = t - age;
      for (let k = 0; k < tracks.length; k++) {
        if (tau < tracks[k].length) paint(centres[k][2 * tau], centres[k][2 * tau + 1], age);
      }
    }

    const frame = Buffer.alloc(frameBytes);
    for (let oy = 0; oy < height; oy++) {
      const y0 = ty.i0[oy];
      const y1 = ty.i1[oy];
      const hi = Math.max(rowHi[y0], rowHi[y1]);
      if (hi < 0) continue; // both source rows black
      const xa = tx.firstOut[Math.min(rowLo[y0], rowLo[y1])];
      const xb = tx.lastOut[hi];
      const wy = ty.w[oy];
      const wy0 = 1 - wy;
      const r0 = y0 * rw;
      const r1 = y1 * rw;
      for (let ox = xa, o = (oy * width + xa) * 3; ox <= xb; ox++, o += 3) {
        const x0 = tx.i0[ox];
        const x1 = tx.i1[ox];
        const p00 = refPx[r0 + x0] * 3;
        const p01 = refPx[r0 + x1] * 3;
        const p10 = refPx[r1 + x0] * 3;
        const p11 = refPx[r1 + x1] * 3;
        if ((p00 | p01 | p10 | p11) === 0) continue;
        const wx = tx.w[ox];
        const wx0 = 1 - wx;
        for (let ch = 0; ch < 3; ch++) {
          const top = wx0 * PALETTE[p00 + ch] + wx * PALETTE[p01 + ch];
          const bottom = wx0 * PALETTE[p10 + ch] + wx * PALETTE[p11 + ch];
          frame[o + ch] = toByte(wy0 * top + wy * bottom);
        }
      }
    }
    frames.push(frame);

    for (let y = 0; y < rh; y++) {
      if (rowHi[y] < 0) continue;
      refPx.fill(0, y * rw + rowLo[y], y * rw + rowHi[y] + 1);
      rowLo[y] = rw;
      rowHi[y] = -1;
    }
  }
  return { width, height, frames };
}
