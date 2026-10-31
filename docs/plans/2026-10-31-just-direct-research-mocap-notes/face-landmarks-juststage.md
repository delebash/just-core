# Face landmarks for JustStage: is MediaPipe the right tool for each job? (research, 2026-10-31)

Status: DONE. Read only: nothing installed, no weights downloaded, nothing run on the GPU, nothing changed under
E:\Dev\3D. **I measured nothing.** Every number is someone else's, labelled below.

**Evidence labels:** **code** (file and line), **card**, **paper**, **user**, **vendor** (the maker's own claim, including
an app author's wiki), **measured-there** (already recorded in JustStage's docs, or sent by its session today). Claims with
no label under "Inferences" are my reasoning, untested. Ranking is by quality and capability first. Licence, VRAM and
platform are labels only.

**Already settled in JustStage's docs, not repeated here:** why the landmark fit failed
(`docs/plans/2026-10-30-research-ai-photo-to-head.md` §1, §5); the ranking of FLAME fitters on NeRSemble (§0.1); the
apps' photo-to-head pipelines; ComfyUI nodes and FLAME alternatives (`2026-10-30-research-comfyui-flame.md`); Epic's 5.6-5.8
capture facts and "nothing new from Apple" (RESEARCH, *web 2026-10-31*); and the plan approved today in TASKS, "ALIGNMENT
AND THE AUDIT": optical flow on top of a coarse warp (OpenCV DIS first, RAFT if needed), MediaPipe vs RealDenseFace for the
coarse warp, and a leave-one-out judge with sharpness checked apart. This research adds to that plan and doesn't reopen it.

---

## 0. The answer in short

The "MediaPipe ranks lowest" answer is **partly right and mostly about a different job**. It holds for live webcam
expression quality against NVIDIA's tracker and an iPhone, and for raw 2D accuracy on WFLW (7.72 against ~4, on a
competitor's own card). It says nothing about offline alignment, where the real problems are sparse points, sliding
contour labels, a 256 px input, and the way our own code uses it.

| Job | Decides the result? | Is MediaPipe the limit? (layer) | Is sparse landmarking the right tool? | Verdict | Best method now |
|---|---|---|---|---|---|
| 1. Align paintings (`align_paintings.py`) | yes | **Partly.** Model: labels slide on contours, invents lips on closed mouths, no profiles. App: unweighted warp, clay points detected though the mesh knows them, judged by itself | **No.** Fine only as a coarse seed | **Add beside it, then likely replace.** Keep it as the baseline in the approved bake-off | Dense mesh-anchored coarse warp (RealDenseFace; add **Facepoints** as a third contender), then flow, with uncertainty rejection |
| 2. Iris and lid unwrap (`test_face_project.py` 744-790) | yes | **Yes for the iris centre.** Model: 5 iris points from a 256 px crop, ~4 px noise against a ~1 px need. **No for lids and shape** (measured fine) | **No.** An edge fit on the real pixels is | **Add a second method beside it** | MediaPipe as seed, limbus ellipse fit on the 1024 px picture (training-free) |
| 3. Landmark shape fit (`landmarks.py`, `test_face_fit.py`) | failed | Not the root limit (settled) | No (settled) | **Retire.** Keep `landmarks.py` only for measuring | If a fit returns: Facepoints on GNM, weighted by 1/std, instead of MediaPipe |
| 4a. Crop box (`flame_fit.py`) | ±10% is enough | Yes, it blocks profiles (no face found), and nothing else | **No model needed** | **Replace** | Project the mesh's face box through the known camera |
| 4b. Judge of drift | yes | Yes: a detector can't judge itself (app layer) | No | **Replace** (already approved) | Leave-one-out judge; add a known-truth test (Inferences, job 4) |
| 5. Live webcam (planned) | live | **Yes at the blendshape stage.** Model: 146 2D points in, no pixels | Yes, it is what runs on this PC | **Keep as the built-in default, add a take-based second tier** | Live: MediaPipe + per-user calibration. Recorded takes: RealDenseFace + our own solve onto our ARKit keys |

**Biggest find:** [`myned-ai/facepoints`](https://huggingface.co/myned-ai/facepoints) (2026-10-24): 620 points that are fixed
locations **on the GNM Head mesh**, with an error estimate for each point. That is the detector JustStage's docs list as
unavailable. It is a third party's release, not Google's, and the weights are CC BY-NC.

**Corrections to what the JustStage docs say today** (each checked):
1. TASKS (approved plan): RealDenseFace "also reads the two profile views MediaPipe can't" is **unmeasured**. There are no
   `rdf_*left90` or `rdf_*right90` files in `.dev/facetest`, `flame_fit.py` line 43 leaves those views out, and the paper gives
   no numeric pose range.
2. RESEARCH: "no 2026 landmark model benchmarked against MediaPipe on 300W/WFLW" is now closed by Facepoints' table, with
   the caveats in Q6.
3. RESEARCH: "no 2025-2026 method found" for misaligned projection: one exists, see job 1.
4. photo-to-head §2.3: GNM dense landmarks "(c2) until released": Google's still isn't out (tree at 2026-10-29 holds only
   `head_sparse_68.txt`), but Facepoints fills the slot as bucket (b), non-commercial.
5. The lead "Sapiens 308 already on disk": the **code** is, the **pose weights are not**. Only
   `sapiens2_1b_normal.safetensors` is in `.dev/cache/sapiens2`.
6. RealDenseFace's own face detector: the code is on disk (`models/facebox/detector.py`), `weights/facebox/face_box.pth` is not.
7. The approved plan says "RAFT if needed": use SEA-RAFT there (Q1).

---

## Q1. Job 1: aligning the paintings

### Takeaway
MediaPipe is at its limit here, but a better sparse detector won't fix it. The best published methods reach about 0.8 mm on
most of the face and about 2 mm on lips, cheeks and chin, so no detector alone reaches the 1 mm need. The approved shape
(dense coarse warp, then flow) is right. Add Facepoints to the bake-off, swap RAFT for SEA-RAFT, and add uncertainty
rejection so the flow doesn't warp painted inventions into the texture.

### Cited Findings
- `align_paintings.py` detects the clay points (line 69) as well as the painting's, uses them unweighted, and solves one TPS
  with `smoothing=0.3` (line 56), minus 20 inner-lip points (line 30) — **code**.
- Need: ~1 mm, about 3 px on head views and 6 px close. Today: noise ~4 px; residual after the warp 3.7-6.0 / 7.5-10.1 px;
  against RealDenseFace 5-8 / 12-14 px. All judged by MediaPipe itself — **measured-there**.
- MediaPipe: FaceMesh-V2 input 256×256, blendshape input 1×146×2 — **vendor** ([docs](https://developers.google.com/edge/mediapipe/solutions/vision/face_landmarker)).
- Landmark model trained on 33,792 human-annotated images — **paper** ([Blendshapes GHUM](https://arxiv.org/html/2309.05782)).
- Why contours slide: contour points "do not have clear and accurate definition"; annotations are "all on the contour, but
  are ambiguous about the accurate positions on the contour" — **paper** ([Semantic Alignment, CVPR 2019](https://openaccess.thecvf.com/content_CVPR_2019/html/Liu_Semantic_Alignment_Finding_Semantically_Consistent_Ground-Truth_for_Facial_Landmark_Detection_CVPR_2019_paper.html)).
  The same weakness applies to every 300W/WFLW-trained model — that part is my inference.
- **Facepoints**: HRNet-W48, 256 px, direct regression with a local refine step (`model.py`), 620 points: 416 landmark, 150
  skin, 36 eyelid-edge, 16 teeth, 2 iris centres, each with a predicted std. Labels are projections of registered meshes,
  so points are anatomical by construction. Hidden points are "estimated, not seen". "the output moves with the box", so
  `detect()` re-frames on its own points for 3 passes. "Profile faces are the weak spot." — **card**, **code** ([card](https://huggingface.co/myned-ai/facepoints)).
- Median error against registered meshes, 9 unseen people, widest mouth shapes, **after removing each point's constant rest
  offset**, mm (lips / cheeks / chin / rest): Facepoints 1.78 / 2.00 / 2.12 / 0.81; Pixel3DMM 1.81 / 2.19 / 1.67 / 0.78;
  3DDFA-V3 2.40 / 2.61 / 2.84 / 1.41 — **card** (self-reported, report "in preparation").
- RealDenseFace: per-vertex log-variance, "Vertices with higher predicted uncertainty contribute less"; SVFR posed L1 1.610;
  no per-region results; hardware RTX 4090 — **paper** ([arXiv 2608.09238](https://arxiv.org/html/2608.09238)).
- Pixel3DMM on its sister method: landmark losses are "usually not as reliable", but "landmark losses in the eye region are
  important, since the uv_map predictor performs poorly in that region, due to bad training data quality" — **code**
  (README line 138, [pixel3dmm](https://github.com/SimonGiebenhain/pixel3dmm)).
- Sapiens2 pose: 1024×768, heatmap at 1/4, 308 keypoints: upper and lower lid lines, lash lines, **upper crease lines**, iris
  and pupil borders, nostrils, ears, teeth. No jaw or cheek contour points (only `tip_of_chin`) — **code**
  (`keypoints308.py`, config lines 43-47). Face AP/AR: 0.4B 86.2/89.5, 1B 88.3/90.9, 5B 89.7/91.8 — **paper** ([arXiv 2604.21681](https://arxiv.org/html/2604.21681)).
  The repo says 274 face keypoints, the paper 243 (unreconciled).
- Dense matching on paint: RoMa came first of 14 methods on RGB-Paint (pose AUC 41.30/58.36/72.70), ahead of the cross-modal
  trained MINIMA_RoMa (40.09/57.21/71.96), LoFTR (5.93/12.22/22.19) and LightGlue (13.93/27.99/46.16); "we achieve weak
  advantages for RGB-Sketch and RGB-Paint since these two artistic modalities are more similar to RGB" — **paper** ([MINIMA](https://arxiv.org/html/2412.19412)).
- RoMa v2 at 640²: EPE 1.47, 1 px 79.6% (RoMa 2.34 / 74.8%, UFM 3.15 / 55.3%); 4.8 GB at batch 8 on an H200 (RoMa 4.7, UFM
  16.2); frozen DINOv3 ViT-L — **paper** ([arXiv 2511.15706](https://arxiv.org/html/2511.15706v2)). RoMa-Ω preprint: beats it on
  5 of 6 datasets, ~40% slower — **paper** (search snippet only).
- Optical flow: SEA-RAFT beats RAFT by 19.9% on Sintel clean and 15.7% on KITTI Fl-all — **paper** ([arXiv 2405.14793](https://arxiv.org/pdf/2405.14793));
  WAFT (ICLR 2026) claims 1st on Spring, Sintel, KITTI; FlowIt (2026) claims best on Sintel — **paper**, self-reported, natural video.
- Generated views specifically: "Robust In-Engine Texture Optimization from Inconsistent Generative Targets" (Kim, Yoon et al.,
  ETRI, 2026): a per-view deformation grid plus a per-view uncertainty map, because without rejection the grids "would warp
  hallucinated artifacts directly into the texture" — **paper** ([ETRI](https://ksp.etri.re.kr/ksp/article/read?id=72986),
  **search snippet only**, the PDF refused connection). Also free-form deformation lattices per image, optimised jointly
  ([arXiv 2403.15559](https://arxiv.org/pdf/2403.15559)) — snippet only.
- Ready-made standard for "make the views agree on the surface": Open3D Color Map Optimization (Zhou & Koltun, SIGGRAPH
  2014), `option.non_rigid_camera_coordinate = True` adds local image warping by anchor points — **vendor** ([docs](https://www.open3d.org/docs/latest/tutorial/pipelines/color_map_optimization.html)).

### Inferences (each rec attacked)
- **Rec 1: add Facepoints as a third coarse-warp contender**, weighted by its std. It is the only detector found anchored on
  our head model, and its points are anatomical. Scipy's `RBFInterpolator` takes per-point smoothing, so std fits in directly.
  *Attack:* a week old, 0 downloads, no report, CC BY-NC, profiles weak, same Ava-256 data as RealDenseFace. The card's mm
  score removes each point's constant offset, so raw points carry bias. *What the attack changed:* I first wanted the clay
  points projected from the mesh with no detection. Run it on **both** clay and painting instead, so the offsets cancel, the
  same reason `flame_fit.py` reads both. Projected clay points stay a check only.
- **Rec 2: expect a mixed winner, not one detector.** Dense points for skin, a lid-capable detector for lids. *Attack:* the
  eye warning is Pixel3DMM's, not RealDenseFace's, and they differ. So measure the lids before splitting; if RealDenseFace's
  lids hold, use it alone.
- **Rec 3: score detectors on known truth.** Render our textured head from a known camera: every vertex's true place is known,
  on a photoreal picture, per region and per view. No detector judges itself. *Attack:* a render of our texture isn't a raw AI
  painting. It still beats self-judging, and the leave-one-out judge stays the final word.
- **Rec 4: use SEA-RAFT rather than RAFT in the plan's "if needed" slot**, and keep DIS first. *Attack:* self-reported, and
  neither was tested on our pictures. Same licence family, and the swap is cheap. RoMa v2 is the next fallback, for large
  misses only: its evidence on paint is for RoMa v1, not v2.
- **Rec 5: add rejection to the flow step.** DIS gives no confidence, so use a forward-backward consistency check. *Attack:*
  the ETRI source is snippet-only. The danger stands on its own logic: a painted detail with no twin in the other views
  would be warped toward noise.
- Lips: a parsing mask suits the lip edge better than MediaPipe's inner ring. Sapiens2 seg has `Upper_Lip` and `Lower_Lip`
  (29 classes, `seg_utils.py` lines 90-123) and SegFace targets small regions ([AAAI 2025](https://arxiv.org/html/2412.08647v1)). The clay side needs
  no detector: the mesh knows its lips. *Attack:* a mask edge doesn't say where along the lip each pixel sits, so it only
  fixes the boundary. It addresses the recorded "lips' lower edge misregistered", and nothing more.
- Sapiens2's crease points are the only points found on the hooded fold TASKS names as reading wrong. *Attack:* the model was
  trained on people framed far wider than a head-filling 1024 px, so the scale is unproven.

### Gaps
- No source tests any method on painting-to-render alignment (searches 12, 33, 39). A gap in the search.
- RealDenseFace has no regional error published. The ETRI paper was not read in full. RoMa v2 was not tested on paint.
- The "1.1 GB / 0.1 s" (TASKS line 412) and "1,394 MiB / 54 ms fp16" (session today) figures for ViT-B differ; the second is newer.

---

## Q2. Job 2: iris and lids

### Takeaway
For the iris centre, MediaPipe's ~4 px noise is about four times the ~1 px need, and no 256 px model is likely to close that. Keep
it as the seed and fit the limbus edge on the full-resolution painting. Lids and eye shape measure fine and stay.

### Cited Findings
- `test_face_project.py` lines 744-753: centre 468/473, ring 469-472/474-477, radius ×0.88; the painted band is ±30°
  between the lids — **code**.
- Need ~1 px centre; "the iris edge sits a little outside the real iris"; eye measures fine (0.340 vs 0.339); noise ~4 px — **measured-there**.
- Facepoints gives 36 eyelid-edge points and 2 iris centres, no ring; closed eyes "come out about 1 mm open" — **card**.
- Sapiens2 pose gives 8 iris-border and 8 pupil-border points plus centres per eye — **code** (`keypoints308.py`). Weights not on disk.
- Released Sapiens2 seg has no iris or eye class (29 classes). An internal 32-class list has `Left_Iris`, `Left_Sclera`, but no
  released checkpoint uses it — **code** (`seg_utils.py` lines 12-30, 90-123; config `num_classes = 29`; HF card).
- Sub-pixel edge refinement plus least-squares ellipse fit (Fitzgibbon) with RANSAC — **paper** ([arXiv 1605.05272](https://arxiv.org/pdf/1605.05272), snippet). Daugman's operator is restricted to
  frontal images where the limbus is circular, hence an active ellipse model for tilted irises — **paper** ([Eurographics VVG 2005](https://diglib7.eg.org/bitstream/handle/10.2312/vvg20051019/149-155.pdf), snippet).
- Open-source deep iris segmentation is "sparse" with limited reproducibility — **paper** ([review](https://pmc.ncbi.nlm.nih.gov/articles/11548766), snippet).
- Generated eyes are often asymmetric — **paper** ([arXiv 1904.00167](https://arxiv.org/pdf/1904.00167), snippet, GAN faces).

### Inferences
- **Rec: seed from MediaPipe, cast rays, take the strongest dark-to-light edge near the seed radius on the two side arcs the
  lids leave clear, fit an ellipse with RANSAC (OpenCV has `fitEllipse`), and fall back to the seed when support is low.**
  No weights, no training. *Attack:* painted limbus edges can be soft, catch-lights make false edges, lids cut the arcs, and AI
  irises may not be round. *What the attack changed:* side arcs only, plus the fallback. *Testable:* our own eye render has a
  known centre and radius, so the fit gets a real error number.
- Scale check: with a human iris ~11.7 mm (from memory, not re-read) and 1 mm ≈ 6 px close, the iris radius is ~35 px close and
  ~18 px on head views, so the edge has plenty of pixels. In a 256 px crop of a head-filling picture, 1 input px ≈ 4 picture px.
- Lids stay on MediaPipe. Add Facepoints' 36 or Sapiens2's lines only if a measuring job needs better than borderline.

### Gaps
- SAM-type point-prompted masks for the iris were not searched. No open Python limbus fitter was found (search 42), though
  the pieces are in OpenCV. Nothing tested on AI-painted irises.

---

## Q3. Job 3: the landmark-only fit

### Takeaway
Settled: it failed, and later work showed the broad shape already matches. Nothing new changes that. One note for later.

### Cited Findings
- 16.1 → 14.3 px while bending identity 19.5 sd; the later dense FLAME fit was also not applied — **measured-there** (TASKS lines 387-388, 564-575).
- Facepoints: "Fitting the GNM Head to a face = solving for the mesh whose projected `gnm_positions` match `out["points"]`,
  weighted by `1 / std`" — **card**.
- Google's detector: not in the [GNM tree](https://github.com/google/GNM) as of 2026-10-29 — **code** (API listing).

### Inferences
- **Rec: retire it.** Keep `landmarks.py` for measurement. If a whole-head fit returns, the docs' §5 recipe with Facepoints replaces
  MediaPipe. *Attack:* JustStage found a whole-head fit can't resolve this head's differences at all, so adding a detector
  would be solving the wrong problem. That is why this is a note and not a task.

### Gaps
- Whether Facepoints' `points_gnm.json` (GNM v3.0) matches JustStage's GNM version was not checked.

---

## Q4. Job 4: crop box and judge

### Takeaway
The box needs no model: the camera and mesh are known. MediaPipe's only real cost here is that it blocks the two profile
views. The judge is already replaced by the approved plan.

### Cited Findings
- `flame_fit.py` line 8: box from MediaPipe's points, enlarged 1.3×, squared, 512 px crop; line 43: 8 views, no profiles — **code**.
- No face on left90/right90; need ±10% — **measured-there**.
- AI drift: 5-15 px head views, ~40 px close, worst 182 — **measured-there** (TASKS lines 373-374).
- "the output moves with the box" — **card** (Facepoints). `box_of_points` re-frames on predicted points — **code** (`detect.py`).
- RealDenseFace uses FaceBoxes; its weights aren't in `.dev/cache/realdenseface` — **code** (listing).
- Facepoints' card suggests OpenCV's YuNet for boxes — **card**. VGGHeads detects heads and fits a mesh, trained on 1M+
  diffusion-generated images; MIT code, weights tagged cc-by-nc-4.0, ONNX m and l, not gated — **card**, **vendor** ([head_detector](https://github.com/KupynOrest/head_detector), [weights](https://huggingface.co/okupyn/vgg_heads)).

### Inferences
- **Rec: project the mesh's face box through each view's camera, same box for clay and painting.** Identical boxes also cancel
  box-driven shift in the difference, which a detector box can't. *Attack:* worst drift 182 px could leave the face off-centre.
  *What the attack changed:* add a second pass re-framed on the predicted vertices, as Facepoints does. This unblocks
  RealDenseFace on left90/right90 and gets the first profile measurement, which the approved plan assumes.
- **Rec: two extra checks beside the leave-one-out judge.** (a) Known warp: warp a painting by a known field, and each detector must
  recover it. (b) With three detectors, pairwise disagreements separate each one's own noise (the "three-cornered hat" from
  clock metrology, from memory). *Attack:* (b) assumes independent errors, and Facepoints and RealDenseFace share Ava-256,
  so treat it as a sanity check. The judge remains the decider.

### Gaps
- No detector's profile performance on AI paintings was found.

---

## Q5. Job 5: live webcam, and the FLAME-to-ARKit gap

### Takeaway
On the thin evidence found: iPhone, then NVIDIA's tracker, then MediaPipe. Epic's webcam solve is likely near the top, but no
comparison was found, so that placing is my guess. The better webcam options are locked to Unreal or proprietary SDKs, and Unreal is slow here. On this 8 GB card MediaPipe stays the live default. The real upgrade is
a second tier for **recorded takes**: RealDenseFace plus a solve onto our own ARKit keys, with no real-time budget.

### Cited Findings
**How MediaPipe works, and its limit**
- Blendshapes come from 146 points, X and Y only, no pixels, no Z — **code** (`face_blendshapes_graph.cc` lines 53, 142-143). Lightweight
  MLP-Mixer trained on ~2M synthetic pairs from 6,000 scanned identities; MNE real-time 3.88%, offline registration 3.67%, face
  mesh 2.41%, human annotators 2.33%; "multiple combinations of blendshapes can yield very similar expressions" — **paper** ([Blendshapes GHUM](https://arxiv.org/html/2309.05782)).
- Name list has `_neutral` and no tongueOut — **code** (line 65, grep).

**Independent reports (the honest strength of evidence is low: no controlled comparison found)**
- "None of the three are really good with default settings"; "The Dollars EGAO version ... looks the worst to me"; MediaPipe's
  lids "far too sleepy", motion "sedated"; AccuFACE lips "tied in knot" for one user; the iPhone can't raise one eyebrow — **user** ([Reallusion forum, ARKit vs Maxine vs MediaPipe](https://forum.reallusion.com/PrintTopic550409.aspx), ~2024, default settings).
- MediaPipe tracker "pretty good but not quite as good as the NVIDIA tracking", rotation range "a bit more restrictive" — **vendor** ([VTube Studio](https://github.com/DenchiSoft/VTubeStudio/wiki/Mediapipe-Webcam-Tracker)).
- NVIDIA tracker: any RTX 20-50 series, Windows, free ~2 GB Steam DLC; author calls quality "very similar" to iPhone, rotation very
  large; below 10% CPU and GPU on an RTX 3080; no cheek puff or tongue — **vendor** ([wiki](https://github.com/DenchiSoft/VTubeStudio/wiki/NVIDIA-Webcam-Tracker)). A Reddit user: mouth "isn't as responsive as an iPhone, but better than a regular webcam tracking" — **user** (snippet).
- Warudo "generally recommend using MediaPipe" over OpenSeeFace — **vendor** ([docs](https://docs.warudo.app/docs/mocap/openseeface)).
  OpenSeeFace's author: more stable than MediaPipe in hard conditions, wider mouth range, eye region "can be less accurate" — **vendor** ([README](https://github.com/emilianavt/OpenSeeFace)).
- No study validating MediaPipe blendshapes against ARKit or FACS was found (searches 17, 35). A webcam regression paper claims
  "similar to ARKit 6", no code stated, no MediaPipe comparison — **paper** ([arXiv 2601.08234](https://arxiv.org/abs/2601.08234v1)).

**The better-but-locked options**
- MetaHuman real-time: any mono camera incl. webcams, UE 5.6+; sources "can be computationally expensive and utilize the GPU";
  "A low processing rate due to resource contention will reduce the fidelity"; Epic suggests Live Link Hub on a separate machine — **vendor** ([docs](https://dev.epicgames.com/documentation/metahuman/realtime-animation-for-metahumans-in-unreal-engine?lang=en-US)).
  That explains the slowness here: it shares this one card with Unreal's render. Its solve method isn't documented in anything found.
- AccuFACE 2 (2026-07-31): new model tuned for CC5, curves replacing linear mapping, up to 128 lip morphs, min 120×120 px face, $299, needs iClone — **vendor** ([CG Channel](https://www.cgchannel.com/?p=177753)). AccuFACE 1 used Maxine — **vendor** ([NVIDIA](https://developer.nvidia.com/blog/reallusion-brings-digital-characters-to-life-with-nvidia-ai/)).
- Maxine AR SDK: expression coefficients "from the provided facial landmarks" (older README, snippet); core and features via NGC; EA listing by request, GA listing under NVIDIA AI Enterprise; Turing with Tensor Cores supported; samples repo [`NVIDIA-Maxine/AR-SDK-Samples`](https://github.com/NVIDIA-Maxine/AR-SDK-Samples) pushed 2026-09-10 — **vendor**. Current download terms not confirmed.

**Open options**
- RealDenseFace online: sequence CD 1.73 (offline 1.69), Pixel3DMM 1.76, SMIRK 2.05, VHAP 2.21; 83.96 FPS on an RTX 4090; "Speed and stability on lower-power devices ... untested" — **paper**.
- On this card, network only: ViT-S 600 MiB, 33 ms fp16; ViT-B 1,394 MiB, 54 ms fp16. Solver CUDA-only, not built or measured; FLAME 2023 Open on this PC — **measured-there**. Online default `--num_expressions` 100 — **code** (`track_video_online.py` line 71).
- SMIRK: MobileNetV3, 3.6M parameters (DECA 26.8M, EMOCAv2 51.4M), no FPS stated — **paper** ([arXiv 2404.04104](https://arxiv.org/pdf/2404.04104), snippet).
- OpenSeeFace: MobileNetV3, ONNX Runtime, 44-68 fps on one CPU core by model; "quasi-3D face contours instead of face contours that follow the visible outline"; landmarks, not ARKit — **vendor** (README).
- OpenFace 3.0 (FG 2025): landmarks, AUs, gaze, real time without special hardware; "free for research use" — **paper** ([arXiv 2506.02891](https://arxiv.org/abs/2506.02891v1), snippet).

**FLAME to ARKit (the gap the session asked about): five routes found**

| # | Route | What exists | Licence | Fit for us |
|---|---|---|---|---|
| A | **Solve onto our own keys in vertex space** (no download) | Least-squares solving against shapes is standard ([filmicworlds](https://filmicworlds.com/blog/solving-face-scans-for-arkit/)). Our 52 keys: MakeHuman CC0 "Faceunits 01" (`skeleton-and-face.md` lines 165-181). FLAME on our head: `flame_fit.py` (1.49 mm median, measured-there) | ours | **Best**: fits our rig, no dataset |
| B | [`mat_final.npy`](https://huggingface.co/datasets/H-Liu1997/BEAT2_Tools/blob/main/mat_final.npy) (EMAGE): matrix 51×103, ARKit 51 → FLAME 100 exp + 3 jaw axis-angle. FLAME→ARKit needs a bounded inverse | exists, not gated, 244 downloads; authors confirm the 3 dims ([#130](https://github.com/PantoMatrix/PantoMatrix/issues/130)); users ask for the reverse with no answer ([#170](https://github.com/PantoMatrix/PantoMatrix/issues/170)) | dataset tag apache-2.0 | Fastest first test |
| C | LAM: ARKit on FLAME topology, hand-made ("adapted ARKit blendshapes to align with FLAME's facial topology through manual customization") | `flame_arkit.py` lines 102-130 load it as `flame_arkit_bs_path`; the file should be in `LAM_assets.tar` ([3DAIGC/LAM-assets](https://huggingface.co/3DAIGC/LAM-assets), not gated, tar not opened) | code Apache-2.0; data sits on FLAME | Cleanest off-the-shelf basis, if the file is there |
| D | [PeizhiYan/mediapipe-blendshapes-to-flame](https://github.com/PeizhiYan/mediapipe-blendshapes-to-flame): MediaPipe 52 → FLAME 100 + jaw + eyes, linear `.npy` and an MLP | wrong direction, FLAME 2020 | no licence file; "research and educational purposes only" | Reference only |
| E | B2F: a network FLAME 103 → ARKit 51 — **paper** ([arXiv 2511.13988](https://arxiv.org/pdf/2511.13988), snippet) | code not checked | unknown | Only if A-C fail |

FLAME to MetaHuman: a Stanford student project maps FLAME 100 exp + 6 pose to MetaHuman raw controls by a basis transform, calibrated
on ROM frames of 20 primary controls — **paper** ([Thurman, CS191W 2025](https://cs191.stanford.edu/projects/Spring2025/Allise___Thurman_.pdf), snippet; the PDF wasn't readable here).
Omens et al. avoid cross-rig mapping, tuning the tracker's rig instead, with 19 "Simon-Says" calibration expressions — **paper** ([arXiv 2508.08429](https://arxiv.org/html/2508.08429v1)). JustStage doesn't need this
path: ARKit stays the interchange set and Unreal takes ARKit curves (`skeleton-and-face.md` lines 207-208, 220).

### Inferences
- **Rec: keep MediaPipe as the built-in live source, and add per-user calibration** (neutral capture, per-shape range curves). AccuFACE 2's
  curves and VTube Studio's range matching show that makers treat this as needed. *Attack:* it ranks last in user reports. True,
  but the report ran a third-party wrapper on defaults, and every better option here is proprietary or Unreal-only. *What
  changes the rec:* see the next item.
- **Rec: RealDenseFace as a recorded-take tier, not live.** I first wanted it as a live sidecar. *Attack:* 33 ms per frame at 30
  fps is the card's whole frame budget, before Blender draws anything. That is the same contention that makes Unreal slow
  here, and the solver doesn't exist on this PC. *What the attack changed:* record the webcam, solve afterwards. That
  removes the budget, uses offline mode's shared identity, and suits a low-spec PC. It comes in through the existing take
  import, so `register_capture_source` and Blender's Python are untouched.
- **Rec: skip the CUDA solver.** The network already predicts each FLAME vertex's place plus confidence. For a take: fix identity, then
  solve pose and 51 key weights directly on the CPU, which is a small bounded least-squares problem. *Attack:* the depth map's help is
  lost unless added, and this is unbuilt. Cost is small, and it replaces porting CUDA code. Its accuracy has to be measured against route A's FLAME-based path.
- **Route A details:** express our 51 key deltas on FLAME-covered vertices through the existing correspondence, then for each
  frame solve the bounded least squares `0 ≤ w ≤ 1` with a small ridge. *Attack:* shapes aren't orthogonal, so weights can flip between
  near-equal mixes and jitter (the GHUM quote). Add temporal smoothing and a sparsity penalty, and keep left-right pairs
  coupled at first. Test route B first, because it's a single matrix, to get a baseline in an hour.
- **FLAME version trap:** B and D were built on other FLAME files (D says 2020; B unstated) and the session has FLAME 2023 Open. Same topology
  doesn't prove the same expression basis. Route A avoids this because it uses the basis actually loaded.
- Low-spec live ranking on this PC (mine, unmeasured): MediaPipe on CPU; OpenSeeFace on CPU if a landmark-only tracker ever helps; NVIDIA's
  tracker on tensor cores is the one to try for quality, but whether VTube Studio can stream its output to another app is unconfirmed
  (its data-out page covers iPhone only, port 21412).
- Quality check the user can do with no code: the free VTube Studio + NVIDIA DLC on this card shows what a tensor-core tracker looks
  like against MediaPipe here.

### Gaps
- No controlled MediaPipe vs ARKit vs Maxine comparison found. MediaPipe's CPU latency: not on its page; not measured here.
- Epic's solver method and Maxine's model internals: not documented in anything read. TEASER: no repo found.
- Whether a usable webcam pipeline from OpenFace 3.0 to ARKit exists: not checked.
- Body pose landmarks for the same webcam job are left to the sibling notes (`live-and-apps.md`).

---

## Q6. Does anything beat MediaPipe on the hard cases? Is there published error data?

### Takeaway
Yes on most cases, with thin evidence. Published numbers for MediaPipe itself are scarce: one third-party table. WFLW leaders are
the wrong yardstick here, because they measure sparse hand-labelled points on contours JustStage can't use.

### Cited Findings
| Case | MediaPipe | Better found | Evidence strength |
|---|---|---|---|
| Overall 2D | 300W 3.87, 300VW 4.00, WFLW 7.72 (mapped by a competitor) | SPIGA 3.02/3.37/4.06, RwSA 2.96/3.38/4.23, STAR 3.06/3.45/4.47, Facepoints 3.33/3.52/4.66, FAN 3.69/4.11/7.27 | **card**, self-reported, MediaPipe mapped from 478 |
| Profiles | fails at 90° on clay (**measured-there**), "more restrictive" (**vendor**) | OpenSeeFace "very wide range" (**vendor**), NVIDIA "very large" (**vendor**), RealDenseFace "side or near-profile" figures, no numbers (**paper**). Facepoints: weak spot (**card**) | Weak: no yaw-binned benchmark found |
| Paintings | not tested on art in anything read | ArtFacePoints (68 points, global + region networks, MIT code; "natural-image detectors don't transfer directly") **paper** ([arXiv 2210.09204](https://arxiv.org/pdf/2210.09204)); The Face of Art ([SIGGRAPH 2019](https://faculty.runi.ac.il/arik/site/foa/The_Face_of_Art.pdf)); RoMa on paint pairs **paper** | Medium, for stylised art. Our paintings are photoreal, so this matters less |
| AI images | nothing found | VGGHeads is the only one found **trained** on diffusion images (**vendor**) | Weak: no failure-rate study found (search 32) |
| Lids | 16 points per eye; measures fine (**measured-there**) | Facepoints 36 in all; Sapiens2 lid, lash and crease lines (**code**) | Density only, no error comparison |
| Iris | 5 per eye, ~4 px noise (**measured-there**) | Sapiens2 18 per eye (**code**); classic edge fit (**paper**) | Untested on paintings |
| Lips | 3.76% MNE in blendshape eval (**paper**); invents inner lip on closed mouths (**measured-there**) | Facepoints 1.78 mm, Pixel3DMM 1.81, 3DDFA-V3 2.40 (**card**, no MediaPipe row). Pixel3DMM: `use_mouth_lmk=False` on good images (**code**) | Medium |
| View stability | jaw and outline slide (**measured-there**) | Mesh-anchored labels are stable by construction: Facepoints, RealDenseFace, studio-triangulated Sapiens (**paper**, **card**). OpenSeeFace "quasi-3D" contours (**vendor**) | Reasoned; no direct measure found |

- WFLW full / pose subset: ORFormer 3.86 / – ([WACV 2025](https://arxiv.org/html/2412.13174)); Proto-Former 4.23 / 7.09 ([arXiv 2510.15338](https://arxiv.org/html/2510.15338)); RTMPose-m 4.01, HRNetv2+DARK 3.98 ([mmpose](https://mmpose.readthedocs.io/en/latest/model_zoo/face_2d_keypoint.html)); FreqFLD 4.50 / 7.54, HRNet 4.60 / 7.86 ([arXiv 2609.10278](https://arxiv.org/html/2609.10278)) — **paper**. Every method roughly doubles its error on the pose subset. Self-reported, protocols differ.
- Region data on MediaPipe in mm: none found (search 28). A mirror lists 4.28 average MAE across 17 regions for the older 468-point mesh, units unclear ([Luxonis](https://models.luxonis.com/luxonis/mediapipe-face-landmarker/aim_AHWHb5AGeTeUve3J2gk4Sy?backTo=%2F), snippet) — geographic regions, not face parts.

### Inferences
- **WFLW winners have no job here.** 68 or 98 points are too few for the warp, and their contour points slide. *Attack:* SPIGA is free and
  better on WFLW, so why not use it? Because those points would still need a dense warp, and they sit on the same ambiguous labels.
- Facepoints' MediaPipe row may be harsh: the "mapped" step adds its own error on contour points. It's the only such number found, so treat it as direction, not size.

### Gaps
- RwSA (ICCV 2025) couldn't be found by search; its numbers are from Facepoints' card only. MediaPipe's own model cards weren't readable (PDF).

---

## Q7. Candidates, with labels

Ranked by fit to the jobs. "Run here?" is my judgment unless marked measured-there. Python is fine for tools.

| # | Candidate | Job | Output | Weights | Code / weights licence | VRAM, speed | Without Python | Gated |
|---|---|---|---|---|---|---|---|---|
| 1 | **RealDenseFace** | 1, 5 takes | every FLAME vertex + log-variance + depth | on disk | MIT / MIT card, Ava-256 CC BY-NC data | ViT-S 600 MiB 33 ms, ViT-B 1,394 MiB 54 ms **measured-there** | ONNX untested | no |
| 2 | **Facepoints** | 1 | 620 GNM points + std, 68, 98 | HF, 416 MB, not on disk | Apache-2.0 / CC BY-NC 4.0 (also `points_gnm.json`) | not stated; likely small, fp16, 3 passes | not stated | no |
| 3 | **MediaPipe Face Landmarker** | 2 seed, 5 live, measuring | 478, 52 scores | on disk | Apache-2.0 / Apache-2.0 | CPU; latency not on its page | yes (C++, JS) | no |
| 4 | **Limbus ellipse fit** | 2 | iris centre, radii | none needed | ours | CPU | yes | no |
| 5 | **Sapiens2 pose** 0.4B / 1B | lids, crease, iris, ears | 308 points | HF 1.7 / 6.1 GB, not on disk | Sapiens2 License (bars biometric processing, surveillance, deepfakes among others) | normal 1B 3,557 MiB fp16 **measured-there**; pose unmeasured | not stated | no |
| 6 | **Sapiens2 seg** | lip edge | 29 classes, lips, teeth, tongue | HF, not on disk | Sapiens2 License | unmeasured | not stated | no |
| 7 | **SEA-RAFT** | 1 flow fallback | dense flow | yes | BSD-3 | unmeasured | not stated | no |
| 8 | **RoMa v2** / RoMa | 1 large misses | dense warp + precision | yes | MIT, DINOv3 custom licence | 4.8 GB at batch 8 **paper** | no | check DINOv3 |
| 9 | **Open3D colour map optimisation** | 1, idea and tool | camera + anchor warp | none | MIT from memory (API says NOASSERTION) | CPU | C++ | no |
| 10 | **NVIDIA Maxine / VTS tracker** | 5 | coefficients | via NGC / Steam DLC | proprietary | RTX 20+ tensor cores | C API | NGC terms unconfirmed |
| 11 | **SMIRK** | 5 cheap FLAME | FLAME exp, jaw, lids | yes | MIT / weights unstated | 3.6M parameters **paper** | no | no |
| 12 | **OpenSeeFace** | 5 fallback | ~66 points, no ARKit | yes | BSD-2 | 44-68 fps one CPU core **vendor** | ONNX | no |
| 13 | **VGGHeads** | 4 | head box + mesh | yes | MIT / CC BY-NC tag | unmeasured | ONNX | no |
| 14 | Pixel3DMM | covered in docs | FLAME from UV + normals | yes | CC BY-NC | covered | no | no |
| 15 | MetaHuman real-time | 5, through Unreal | Live Link subject | proprietary | UE EULA | slow here **user** | n/a | no |

**Checked and no job here:** SPIGA (BSD-3, 2024), STAR (no licence file; VHAP's default detector), SLPT (GPL-2.0), PIPNet (MIT), HRNet (MIT), FaRL (MIT),
RTMPose-face (Apache-2.0), ORFormer, FreqFLD: sparse 68/98. DWPose (Apache-2.0) and RTMW: sparse face within 133 points. InsightFace 2d106 and 3d68: sparse; repo API shows
no licence, not read further. DAD-3DHeads (CC BY-NC-SA 4.0), 3DDFA-V3 (MIT): behind on the regional table. MICA, DECA, EMOCA: covered in the docs. VHAP (CC BY-NC-SA,
Toyota restrictions; CD 2.21): behind. LivePortrait: image reenactment with implicit keypoints, no rig output (not read beyond the repo API). FaceFormer-type and LAM-A2E:
audio input, not webcam. UniMatch (MIT), MFT: flow, nothing over SEA-RAFT for two frames (MFT is for long video). UFM: lower sub-pixel precision and 16.2 GB. DUSt3R/MASt3R: camera solvers; our cameras are known; RoMa v2 beats MASt3R on pose (62.8 vs 42.4).
Microsoft DenseLandmarks, Chandran's continuous landmarks: no code or weights found (search 30), a gap in the search.

---

## Query log (44 web searches)

| # | Query | Returned |
|---|---|---|
| 1 | best face landmark detection 2026 (extended) | Vendor roundups (Banuba, Eden AI), POPoS, KeyPosS, CascadedDualViT, a 2023 Mediapipe-vs-Dlib paper. No independent benchmark |
| 2 | most accurate facial landmark model | DEAD END. Old papers, a L'Oreal case study |
| 3 | better than mediapipe face mesh | MediaPipe issue #2526, Attention Mesh. No replacement named |
| 4 | best dense face alignment | DEAD END. Only DeFA 2017 |
| 5 | best webcam face capture blendshapes 2026 (extended) | Listicles: VSeeFace, Faceit, iFacialMocap, Faceware Studio, Animaze |
| 6 | best facial motion capture from webcam software | Listicles: iClone, Faceware, Character Animator, VSeeFace |
| 7 | facial landmark detection WFLW NME state of the art 2025 2026 transformer (extended) | ORFormer, Proto-Former, FreqFLD, RePFormer. No leaderboard |
| 8 | MediaPipe face landmarker accuracy compared WFLW 300W NME evaluation profile yaw | **Facepoints** (the key find), older surveys |
| 9 | facial landmark detection on paintings artworks portraits art faces | ArtFacePoints, The Face of Art |
| 10 | face alignment large pose profile landmarks 2025 AFLW2000-3D best | DEAD END for recent work: only 2015-2019 |
| 11 | RwSA ICCV 2025 face alignment WFLW 300W code | DEAD END. Nothing on RwSA |
| 12 | dense correspondence between painting and 3D render warp cross-modal image matching RoMa MatchAnything | MatchAnything, MINIMA, RoMa. Nothing on painting to render |
| 13 | best image matching model 2026 dense matcher RoMa v2 UFM MASt3R comparison (extended) | RoMa v2, RoMa-Ω, UFM, vismatch |
| 14 | MetaHuman Animator webcam real-time facial animation UE 5.6 5.7 monocular | Epic pages, already in JustStage's docs |
| 15 | iClone AccuFACE webcam facial mocap NVIDIA Maxine how it works review | AccuFACE 1 and 2, forum comparison thread |
| 16 | MetaHuman Animator Real-Time Best Practices webcam quality compared iPhone depth | Device docs. No quality comparison |
| 17 | mediapipe face blendshapes inaccurate compared ARKit mouth jawOpen issue | DEAD END. Reallusion rig threads |
| 18 | open source webcam ARKit 52 blendshapes regression model better than mediapipe github 2026 (extended) | Puppet (uses MediaPipe), AvatarWebKit, py-feat port, LAM A2E. None shown to beat it |
| 19 | OpenFace 3.0 lightweight multitask facial landmark action unit gaze | OpenFace 3.0 paper |
| 20 | FLAME expression to ARKit blendshapes conversion real-time webcam SMIRK tracking avatar | B2F, LAM A2E |
| 21 | RoMa v2 github weights license VRAM dense feature matching Parskatt | Paper, PyPI, licence line |
| 22 | Open3D color map optimization non-rigid image warping Zhou Koltun | Open3D docs, paper |
| 23 | NVIDIA Maxine AR SDK face expression estimation blendshape coefficients download Windows license | SDK forks, NGC listings; terms unclear |
| 24 | OpenSeeFace vs MediaPipe tracking quality VSeeFace webcam comparison | Author README, Warudo, VTube Studio. No benchmark |
| 25 | best iris segmentation model open source pupil limbus ellipse landmark deep learning 2025 | Clinical U-Net, recognition toolkit, a review. No ellipse-level benchmark |
| 26 | best face parsing model 2025 lips eyes segmentation SegFace FaRL | SegFace, FaRL |
| 27 | best optical flow model 2026 SEA-RAFT WAFT DPFlow comparison Sintel KITTI | SEA-RAFT, WAFT, FlowIt. Conflicting self-reports |
| 28 | MediaPipe face mesh accuracy validation anthropometric landmarks mm error by region compared to manual 3D scan | DEAD END for MediaPipe in mm |
| 29 | MetaHuman Animator 4D solver how it works webcam real-time vs Live Link Face ARKit quality reddit | Epic docs, blogs. No Reddit, no method |
| 30 | dense facial landmarks detector open weights continuous 3D queries Chandran Disney Wood Microsoft 703 landmarks code | DEAD END |
| 31 | Sapiens2 paper high resolution human vision pose estimation 308 keypoints face AP results arXiv 2026 | Paper |
| 32 | facial landmark detection on AI generated images stable diffusion faces accuracy synthetic face mesh fails | No failure study. Related work only |
| 33 | multi-view texture from generated images misalignment warp to mesh optical flow refine view alignment before baking | ETRI paper, Volino, Floating Textures, Ink3D |
| 34 | SMIRK TEASER real-time webcam face expression tracking FPS FLAME demo | SMIRK parameter count. No FPS |
| 35 | MediaPipe blendshapes validity comparison facial action units ARKit study 2025 | No direct study. arXiv 2601.08234, a Sensors paper |
| 36 | VTube Studio NVIDIA Broadcast tracking RTX webcam face tracking quality vs iPhone ARKit | VTS wiki, user quotes |
| 37 | FLAME expression parameters to ARKit 52 blendshapes mapping github (extended) | PeizhiYan repo, PantoMatrix #170, filmicworlds |
| 38 | ARKit to FLAME transformation matrix released BEAT dataset blendshape conversion | B2F, EmoTalk, BEAT |
| 39 | jointly optimize deformation grid and uncertainty map AI-generated views texture misalignment hallucinated content in-engine texture optimization | ETRI title, NI-Tex, FFD paper, MV2UV |
| 40 | FLAME head model to MetaHuman control rig retarget facial animation mapping | Omens 2025, Thurman, MetaEcho |
| 41 | real-time face tracking CPU low end PC best webcam facial mocap lightweight no GPU blendshapes MobileNet FLAME | FACE IT!, older CPU work. Weak |
| 42 | iris center localization subpixel limbus fit integro-differential ellipse fitting eye image open source python | Patents, arXiv 1605.05272. No open code |
| 43 | FaceMesh V2 model card fairness evaluation mean absolute distance eyes lips contours MediaPipe | Luxonis mirror. Official card not reached |
| 44 | "landmark marching" contour landmarks move along silhouette with pose 2D annotation jawline semantic inconsistency | Semantic Alignment CVPR 2019, a patent |

**Search note:** plain queries (1-6) mostly returned listicles and vendor pages. The real finds came from comparison and
benchmark wording (8, 13) and named candidates. Query 8 found Facepoints only because it named a benchmark.

**Other lookups.** Read on disk (read only): `align_paintings.py`, `test_face_project.py`, `landmarks.py`, `flame_fit.py`, Sapiens2 and RealDenseFace sources, the standards docs,
TASKS and RESEARCH with today's uncommitted edits. GitHub API: licence, stars and push date for ~35 repos; READMEs for RoMaV2, pixel3dmm, VHAP, head_detector, OpenSeeFace, LAM,
LAM_Audio2Expression, AR-SDK-Samples, PeizhiYan's repo; MediaPipe `face_blendshapes_graph.cc`; the GNM tree and commits; PantoMatrix #130, #170; MediaPipe #2526; Sapiens issue search. Hugging Face API:
facepoints, sapiens2-pose 0.4b and 1b, vgg_heads, LAM-assets, BEAT2_Tools.

**Fetch failures and dead lookups.** ETRI PDF (connection refused; snippet only). Thurman PDF, MediaPipe model card PDF and FreqFLD PDF (no PDF reader here, none installed; FreqFLD read as HTML). Epic's
MetaHuman Animator page came back empty; metahuman.com redirected to a login. Sapiens2 PDF too large (read as HTML). `gh search` for "gnm head landmarks", "TEASER expression reconstruction FLAME" and "flame arkit
blendshapes" returned nothing. Guessed repo paths 404: NVIDIA/MAXINE-AR-SDK (moved to NVIDIA-Maxine), Willow123/WAFT, cvlab-epfl/UFM, TRI-ML/UFM, CMU-MultiComp/OpenFace-3.0, TimoBolkart/TEASER, KupynOrest/DAD-3DHeads.
