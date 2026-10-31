# One-camera mocap for JustDirect: results (2026-10-31)

The user, 2026-10-31: "another app i want to build is signle source mocap like from webcam or video full mocap including hands, i used mediapipe in the past but hands where jittery"; "this whould be part of just direct"; "we can take ideas and write our own code based on techniques from commercial apps".

**Nothing here was measured on this PC.** No weights were downloaded and nothing was run. No source reports any top model on an 8 GB card, so every 8 GB line is inference. Reddit could not be reached by any tool (a gap in the search). Evidence labels and full tables are in the notes.

Notes, each with its query log:
- [`body-world-models.md`](2026-10-31-just-direct-research-mocap-notes/body-world-models.md)
- [`hands.md`](2026-10-31-just-direct-research-mocap-notes/hands.md)
- [`live-and-apps.md`](2026-10-31-just-direct-research-mocap-notes/live-and-apps.md)
- [`cleanup-retarget.md`](2026-10-31-just-direct-research-mocap-notes/cleanup-retarget.md)
- [`face-landmarks-juststage.md`](2026-10-31-just-direct-research-mocap-notes/face-landmarks-juststage.md)

Checked directly by the coordinator, not only by the researchers: GitHub and Hugging Face API rows for the repos and weights below; the MIT licence of RGB MoCap; ExMR's and FlowHMR's licences; `gem/pose/smoothing.py`; `soma/fitting/rts_smoothing.py`; Kimodo's `MotionCorrection` folder; GEM-X issue #32; MediaPipe's graphs (0 smoothing hits in `hand_landmarker_graph.cc` and `hand_landmarks_detector_graph.cc`, 14 in `pose_landmarks_detector_graph.cc`); RGB MoCap's README, performance page, GVHMR and ExMR guides; ComfyUI's local SAM 3D Body nodes.

## 1. The answer

The field moved past the pasted pipeline in 2026. The recipe now: track the person, run a heavy frozen image encoder per frame (usually SAM 3D Body's), then a small temporal model that turns those features into world motion with hands.

| Job | Best found | Why | Labels |
|---|---|---|---|
| Video, body + hands | **ExMR** (code 2026-10-21) | Best hand numbers: hand jitter 5.2 against SAM 3D Body's 32.4 on ARCTIC (paper). An independent Windows app makes it the default (user) | SMPL-X + MANO by registration, SAM 3D Body gated at Meta. Code and weights research and non-profit only |
| Video, best overall motion | **FlowHMR** (code 2026-09-29) | Wins a blind comparison on 4,182 clips against GVHMR, PromptHMR, GENMO, DuoMo (paper). Physics is trained into the weights, no simulator at run time | SMPL-H. Code Apache-2.0, weights non-commercial. Heavy: 24-31 GB dense moving camera, 2.77 GiB Low Memory on 60 frames (user) |
| Video, 8 GB floor | **GVHMR + FootMR + HandFlow** | Peak 5.08 GiB allocated, 12.5 GiB RAM on a full clip (user, RTX 5090, Windows). Fallback: ExMR Low Memory | SMPL-X + MANO. GVHMR research and non-profit, HandFlow MIT |
| No registration | **GEM-X + EgoHand** | SOMA body, no account. Hand filter halves acceleration error (paper) | NVIDIA Open Model License, OpenMDW-1.1. The previous release lost to GVHMR by 22 mm MPJPE in the one same-protocol test; the 2026-10-20 release has no real-data benchmark |
| Live webcam | **RTMW + hand crops + our own IK**, through the kit's `onnx` runtime | Expected 30 fps on the floor (inference from a GTX 1660 Ti row). PEAR (Apache-2.0, claims 100 FPS, needs SMPL-X and FLAME) is the direct-rotation test | Apache-2.0. One user got only 7 fps with rtmlib on an RTX 3080 Ti, so measure the whole pipeline |
| Foot and contact fix | **Kimodo `MotionCorrection`** | C++17, CPU, rig-agnostic; root warp, IK, ADMM pop removal | Apache-2.0 |
| Rotation smoothing | **SOMA-X RTS smoother on SO(3)** | Looks both ways, no lag, separate gains for hands | Apache-2.0, offline |
| Self-collision | **Momentum capsule collision terms** | Training-free, no balance needed | MIT. Capsules reduce clipping, they can't promise none |

**Best existing code to learn from: [toyxyz RGB MoCap](https://github.com/toyxyz/toyxyz_RGBMocap)** (own code MIT, a native Windows app, created 2026-10-26). It already does video to ExMR, FlowHMR, GVHMR or PromptHMR, contact correction, retarget to Mixamo, VRM and PMX, contact re-solve on the character, and a no-SDK FBX writer. It is the whole pipeline in Python, on one author's PC. Use it as the test bed and the method source.

No-Python ports (`gem-x.cpp`, `sam3d.cpp`, `SAM3DBody-cpp`) are real but incomplete: `gem-x.cpp` ports the old GEM-X with a hard-coded static camera, 120 frames in the demo, Linux tested. `sam3d.cpp` is per frame with no hand refinement. `SAM3DBody-cpp` needs ONNX Runtime with CUDA for its backbone.

## 2. Why the hands jittered, and the fix

MediaPipe's hand graph has **no filter stage at all**, while its pose graph does. Each frame's crop is built from the previous frame's own predicted landmarks with no filter in that loop, on a 224 px crop, with positions only. Depth was learned only from synthetic images. A lost hand vanishes at once. Layers: pipeline first, then model and output format. Whether the crop loop amplifies noise is a hypothesis; no source measured it.

The recipe from the best results:
1. Crop from full-resolution frames, and stabilise the box before inference.
2. Use a rotation model (ExMR, HandFlow, WiLoR, EgoHand), not landmarks.
3. Join the wrist with forearm IK and gates. Add hysteresis, which SAM 3D Body lacks. Fall back to the body's wrist.
4. Lock one hand shape per clip.
5. Smooth rotations last, in SO(3), both directions.

Limit found by no one: **no source measures accuracy against hand size in pixels.** SAM 3D Body drops hand crops at 64 px or below. So small hands stay the weak spot, and film at 1080p or better. No live version of the two-sided filter was found; live needs a causal one.

## 3. The pasted research, checked

| Claim | Verdict |
|---|---|
| WHAM is the gold standard | **False today.** EMDB world error 135.6 against DuoMo 67.6 and TRAM 76.4 (paper tables). Last pushed 2024-04 |
| SAM 3D Body beats old models | **Partly.** True for hard poses. Small on standard benchmarks. Close-ups and hand-to-face not shown. It is single-image: Accel 14.0 against ExMR's 4.1, no world position. Its real role is the encoder inside the newest models |
| Swap EasyMocap's engine | **Meaningless.** Both are full estimators, and the swap removes what EasyMocap's video mode does |
| Butterworth, One Euro | **Hold, with limits.** Filter rotations, not positions. Even gentle One Euro cost 3-5% of punch extension (user) |
| ContactRefiner | **No mocap library found** by that name |
| FootMR predicts contact | **Wrong.** It refines ankle rotation only; RGB MoCap's guide says "This is not contact locking" |
| > 80% contact then clamp, erasing sliding | **Mostly wrong.** 0.8 is real, from GVHMR's static head, on the static path only. It moves the root, then IK. It clamps nothing and leaves sliding (GVHMR 3.64 mm on RICH) |
| PD ragdoll in MuJoCo or PyBullet | **Wrong as stated.** PD is only the actuator. Balance needs a trained policy (about a week on an A100 for PHC) or a pinned root. Physics now lives in the weights (FlowHMR) or a kinematic collision solve |
| Order: filter, lock, physics, retarget | **Wrong.** Open systems fix contacts, retarget, re-solve contacts on the character, then smooth lightly |
| Move.ai and QuickMagic excel by strict rules | **No evidence either way.** Core solvers are unpublished |

## 4. Techniques from commercial apps worth rewriting

Core solvers could not be read for Move, QuickMagic, Rokoko, DeepMotion, Uthana, Flow Studio, Plask or Kinephy. Their post-processing is visible. Offline is the common thread: Move's single-camera models are batch, Epic's plugin is offline, Rokoko removed webcam capture in Vision 3.0.

- User-editable contact timeline (QuickMagic red and green, Rokoko lock keys).
- Lock modes auto, always, never, grounding (DeepMotion).
- Lock rule: both feet average, one holds, none arcs (Rokoko Studio).
- Physics passes as a setting (QuickMagic `physicTimes` 1 to 6).
- Solved floor plus upright correction; separate occlusion repair pass (Mocai).
- True-speed multiplier for slowed footage (DeepMotion).
- Static-camera flag; in-place option; performer or drop-in root scale.
- Keep raw keypoints beside the smoothed result, so it can re-solve without re-inference (Mocai).
- Never filter across a scene cut (SAM3DBody-cpp). Overlap chunks: Epic's chunk borders show jitter (user).

## 5. What the attack changed

- **"ExMR first"** Attack: 11 days old, 36 stars, its numbers are its authors', one friendly independent user, rotation-only camera, research-only terms. Changed: no single model is hard-wired. The models are swappable, labelled options and a test on the user's own clip picks the default.
- **"GEM-X as the open default"** Attack: its one independent test lost to GVHMR; `body_s240000.ckpt` and `vitpose.pth` are initialised from SAM 3D Body weights (maintainer, issue #32), which leaves its licence open; `gem-x.cpp` is the old model. Changed: a test candidate, not the pick.
- **"HandFlow needs 16 GB"** (paper: 13.1 GB). Attack: RGB MoCap runs GVHMR with HandFlow at 5.08 GiB by staging. Changed: it is back on the floor list, unmeasured on 8 GB. Those are allocated numbers on a stronger card.
- **"Physics layer"** Attack: no plain PD route, and we cannot train a policy. Changed: dropped as a run-time layer.

Kit gap, for when the app is built: the top models are PyTorch, and the kit has llama.cpp, sd.cpp, audio.cpp and in-process ONNX with no ML packages. This is NOT STANDARD until the test picks a model. RTMW fits the kit's `onnx` runtime as it stands.

## 6. JustStage: is MediaPipe the right tool?

The ranking the user saw concerns live mocap. It applies to one planned JustStage job, not to the rest. MediaPipe is used in `tools/face_test` only, on stills. The app has none.

| Job | Verdict | Do this |
|---|---|---|
| Align paintings | Add beside it, likely replace | Dense RealDenseFace warp, then flow with rejection. Add Facepoints (620 points on GNM, per-point error) to the approved bake-off; SEA-RAFT in place of RAFT |
| Iris and lids | Keep as seed | Add a limbus ellipse fit on the full-size picture, no weights. Lids stay |
| Landmark shape fit | Retire | Keep `landmarks.py` for measuring |
| Crop box | Replace | Project the mesh's box through the known camera. This unblocks the two profile views |
| Drift judge | Already replaced | Leave-one-out plan stands |
| Live webcam face (planned) | Keep, with calibration | Recorded takes: RealDenseFace plus a bounded solve onto our ARKit keys. 33 ms a frame fills the live budget here |
| Live webcam body and hands (planned) | Don't use MediaPipe's as-is | Same live answer as section 1. Its Python package is CPU only on Windows (snippet) |

Corrections for its docs: RealDenseFace on profile views is **unmeasured**; Sapiens2 pose weights are **not on disk**; Facepoints closes "no 2026 model benchmarked against MediaPipe", self-reported, 0 downloads, CC BY-NC, weak on profiles.

FLAME to ARKit gap: best is a bounded solve onto our own keys in vertex space. Fastest first test: EMAGE's `mat_final.npy`, inverted. Its FLAME version is unverified against FLAME 2023 Open.

## 7. Plain searches run first by the coordinator

Run by the coordinator after the user's "make sure you do good searches" note. The researchers' 200-odd queries are in their notes.

1. "best latest mocap techniques models for single source": Move.ai s2 and s2-Light docs, a Tripo guide, general comparisons. No independent benchmark.
2. "best open source motion capture from video 2026": listicles, FreeMoCap, OpenPose, MediaPipe, Mocai, Uthana.
3. "latest monocular motion capture model full body and hands 2026" (extended): DanceHMR, FrankMocap, older real-time papers, BeyondRetarget.
4. "best webcam full body motion capture with fingers open source": FreeMoCap, MediaPipe, OpenPose, Webcam Motion Capture, Remocap.
5. "best hand tracking model better than mediapipe jitter 2026": a jitter study, Warudo docs, Leap Motion advice. No 2026 model named.
6. "new ways to do markerless mocap from one camera": mostly old papers. Dead end.
7. "reddit best AI mocap from video free local 2026": no Reddit; MoCap AI, Epic's plugin, Kinephy, Rokoko Video, SEO pages.
8. "ComfyUI motion capture video to BVH FBX SAM 3D Body GVHMR workflow": native SAM 3D Body nodes (merged 2026-08-23), ComfyUI-MotionCapture.

Note: plain searches gave names, and the best finds (ExMR, RGB MoCap, HandFlow) came from following those names into GitHub and Hugging Face.
