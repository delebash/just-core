# The motion-track guide format (a clean-room spec)

**What this is.** The picture format LTX-2.3's Motion Track Control IC-LoRA was trained on: the guide frames that tell the
video model where points should move. The kit draws these frames (`packages/core/src/runner/motion_tracks.js`), and
sd.cpp's video job takes them as guide frames (`control_frames`).

**Why a spec.** The only reference renderer is Lightricks' `LTXVDrawTracks` node (github.com/Lightricks/ComfyUI-LTXVideo,
`sparse_tracks.py`), under the LTX-2 Community License, which is not an open licence. The kit is MIT. So this page
describes the format in words: its constants, its geometry and its colours, as facts needed to make frames the LoRA
recognises. The kit's code is written from this page alone, by someone who has not read Lightricks' code. A test
then compares our frames with frames from their renderer (their licence claims no rights in output). This follows the
user's decision of 2026-11-06 (the kit's TASKS, "JustDirect's six decisions", item 3) and the user's rule: "a tool with a bad
licence is not a dead end — its published method can be written in our own code".

Written 2026-11-06 by the web-4c session from reading `sparse_tracks.py` at ComfyUI-LTXVideo commit `220e1d4`. This
page contains no code from it.

## Inputs

- **Tracks**: a list of tracks. A track is a list of points, one per frame; the point at index `i` is where the tracked
  thing is in frame `i`. A point has an `x` and a `y` in **output pixels**, measured from the top-left corner. They may
  be fractional.
- **Width and height**: the output frame size in pixels.
- **The number of frames** is the length of the longest track. A track shorter than that has no point in the frames
  after its last one. Nothing is drawn for it there, but its last points still leave a trail; see "Trail".
- **No tracks**: a single all-black frame of the output size.

## Making per-frame points from a few control points (the editor's sampling)

Lightricks' track editor turns a handful of control points into one point per frame. The kit offers the same sampling
for a track given by control points and a frame count `n` (n ≥ 2):

- **No control points**: no points.
- **One control point**: that point, `n` times.
- **Two control points**: `n` points evenly spaced on the straight line from the first to the second. Point `i` lies at
  fraction `i / (n − 1)` along the line, so the first and last points are the control points.
- **Three or more**: a uniform Catmull-Rom spline through all the control points, with the first and the last control
  point each repeated once at its end as a phantom neighbour. With `k` control points there are `k − 1` segments.
  - Point `i` sits at global parameter `g = (i / (n − 1)) × (k − 1)`. Its segment is `floor(g)`, capped at `k − 2`, and
    its local parameter `t` is `g` minus that segment number.
  - Segment `s` runs from control point `s` to control point `s + 1`. Its four spline points are the neighbours in the
    padded list.
  - The spline is the standard uniform Catmull-Rom with tension ½. Between P1 and P2, with neighbours P0 and P3:
    `½ × (2·P1 + (−P0 + P2)·t + (2·P0 − 5·P1 + 4·P2 − P3)·t² + (−P0 + 3·P1 − 3·P2 + P3)·t³)`, applied to x and y
    separately.
- **Rounding**: every sampled x and y is rounded to a whole pixel with round-half-to-even, the rounding Python's
  `round` does.

## Rendering one frame

The frame is drawn at a larger **reference size**, then scaled down to the output size.

1. **Reference size.** The short side is 1080 pixels and the aspect ratio is kept.
   - If height ≤ width: reference height = 1080 and reference width = floor(width × 1080 ÷ height).
   - Otherwise: reference width = 1080 and reference height = floor(height × 1080 ÷ width).
   - The scale factors are `sx = reference width ÷ width` and `sy = reference height ÷ height`.
   - A point's reference position is `(x × sx, y × sy)`.
   - The reference renderer does this arithmetic in 32-bit floating point.
2. **Constants.** Smallest radius **2**, largest radius **8** (reference pixels), trail length **50** frames.
3. **Trail.** For output frame `t`, every track contributes its points from frames `max(0, t − 50)` through `t`, at most
   51 points, wherever the track has a point at that frame.
   - A point from frame τ has **age** `a = t − τ`: 0 is the newest, 50 the oldest.
   - Its **ratio** is `r = 1 − a ÷ 50`: 1 for the newest, 0 for the oldest.
4. **Size.** A point's circle has radius `2 + 6 × r` reference pixels: 8 for the newest point, shrinking to 2 for the
   oldest.
5. **Colour**, from the ratio, each channel between 0 and 1:
   - r ≤ ⅓: red 0, green 3r, blue 1 − 3r (blue turning to green);
   - ⅓ < r ≤ ⅔: red 3(r − ⅓), green 1, blue 0 (green turning to yellow);
   - r > ⅔: red 1, green 1 − 3(r − ⅔), blue 0 (yellow turning to red).
   - So the newest point is pure red and the oldest pure blue. With integer ages the ratio never lands exactly on ⅓ or ⅔.
6. **A circle's pixels.**
   - The centre pixel is the reference position with x and y each rounded to a whole pixel, round-half-to-even.
   - A pixel at integer offset (dx, dy) from the centre belongs to the circle when dx² + dy² ≤ radius², with |dx| and |dy|
     both at most 9 (no circle reaches further).
   - Pixels outside the reference frame are dropped.
   - A circle is filled with its one colour. There is no anti-aliasing at this size.
7. **Overlaps.** All of the frame's circles, from every track, are painted oldest first. Where circles overlap, a pixel
   takes the colour of the newest circle covering it. Circles of equal age have equal colour and size, so their order
   among themselves doesn't matter. A pixel no circle covers is black (0, 0, 0).
8. **Scaling down.** The reference frame, with each channel a value between 0 and 1, is resized to the output size by
   bilinear interpolation with PyTorch's `align_corners=False` rule and no antialiasing. Along each axis, separately:
   - output pixel `d` reads the source coordinate `src = (d + 0.5) × (input size ÷ output size) − 0.5`, raised to 0 when
     negative;
   - its two neighbours are `i0 = floor(src)` and `i1 = min(i0 + 1, input size − 1)`;
   - the weight is `w = src − i0`, and the value is `(1 − w) × v[i0] + w × v[i1]`;
   - in 2D, the horizontal and vertical weights multiply.
9. **Channel order.** The scaled frame's channels are reversed before use. The image's first channel carries the blue
   component, the second green, and the third red: BGR in an RGB image, as the LoRA's training data was stored.
   - So in the final picture the newest point looks blue and the oldest red.

## Output for sd.cpp

- sd.cpp reads guide frames as 8-bit images, so each channel value v (0 to 1) becomes `round(v × 255)`, held to 0–255.
- The reference renderer hands the video model 16-bit floats, so 8-bit frames can differ from it by about one step. The
  comparison test allows 1.
- The kit returns raw 8-bit RGB frames (three bytes a pixel, row by row from the top), and the app encodes them as PNG
  for `control_frames`.
