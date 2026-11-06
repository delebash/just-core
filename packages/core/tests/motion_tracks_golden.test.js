// SPDX-License-Identifier: MIT
// The kit's motion-track drawer (runner/motion_tracks.js, written clean-room from docs/plans/2026-11-06-motion-tracks-
// spec.md) against Lightricks' own renderer: frames LTXVDrawTracks drew for the same tracks (ComfyUI-LTXVideo's
// sparse_tracks.py at 220e1d4, run by E:\Dev\Web\test-just-direct\tracks-golden.py — its output, 8-bit, deflated, in
// fixtures/motion_tracks/). The LoRA reads what that renderer draws, so ours must match it: every byte within one step
// (their frames are 16-bit floats rounded here, ours are 8-bit), and the editor's sampling exactly.
import { readFileSync } from "node:fs";
import { inflateSync } from "node:zlib";
import { expect, test } from "vitest";
import { drawMotionTracks, sampleTrack } from "../src/runner/motion_tracks.js";

const fixture = (name) => JSON.parse(readFileSync(new URL(`./fixtures/motion_tracks/${name}.json`, import.meta.url), "utf8"));

for (const name of ["landscape", "wide", "portrait"]) {
  test(`${name}: the editor's sampling and every kept frame match Lightricks' renderer within one step`, () => {
    const f = fixture(name);
    // the editor's Catmull-Rom sampling, point for point
    const sampled = f.controlPoints.map((cp) => sampleTrack(cp, f.sampledTo));
    expect(sampled).toEqual(f.sampled);
    const { frames, width, height } = drawMotionTracks({ tracks: [...sampled, ...f.tracks], width: f.width, height: f.height });
    expect([width, height, frames.length]).toEqual([f.width, f.height, f.frameCount]);
    for (const [i, b64] of Object.entries(f.frames)) {
      const want = inflateSync(Buffer.from(b64, "base64"));
      const got = frames[Number(i)];
      expect(got.length, `frame ${i}`).toBe(want.length);
      let worst = 0;
      let off = 0;
      let lit = 0;
      for (let k = 0; k < want.length; k++) {
        const d = Math.abs(got[k] - want[k]);
        if (d > worst) worst = d;
        if (d > 0) off += 1;
        if (want[k] > 0) lit += 1;
      }
      expect(lit, `frame ${i} draws something`).toBeGreaterThan(0);
      expect(worst, `frame ${i}: largest difference (${off} of ${want.length} bytes differ)`).toBeLessThanOrEqual(1);
    }
  });
}
