# One-camera mocap for JustDirect: results (2026-10-31)

The user, 2026-10-31: "another app i want to build is signle source mocap like from webcam or video full mocap including hands, i used mediapipe in the past but hands where jittery"; "this whould be part of just direct"; "we can take ideas and write our own code based on techniques from commercial apps".

**Measured on this PC so far: section 9, SAM 3D Body against MediaPipe.** Everything else is unmeasured. No source reports the other models on an 8 GB card, so their 8 GB lines are inference. Reddit could not be reached by any tool (a gap in the search). Evidence labels and full tables are in the notes.

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
| Video, best overall motion | **FlowHMR** (code 2026-09-29) | Wins 61.5-79.2% of blinded pairwise human judgements against GVHMR, PromptHMR, GENMO, DuoMo (paper: pairs from a pool of 500 videos, annotator count not stated). Physics tracking 82.47% on 4,182 clips against 62.82% for GVHMR (paper). Physics is trained into the weights, no simulator at run time | SMPL-H. Code Apache-2.0, weights non-commercial. Heavy: 24-31 GB dense moving camera, 2.77 GiB Low Memory on 60 frames (user) |
| Video, 8 GB floor | **GVHMR + HTD Refine + FootMR + HandFlow** | Peak 5.08 GiB allocated, 12.5 GiB RAM on a 25.7 s clip (user, RTX 5090, Windows; RGB MoCap's defaults, and its table is marked historical). Fallback: ExMR Low Memory | SMPL-X + MANO. GVHMR research and non-profit, HTD Refine AGPL-3.0, HandFlow MIT |
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

## 7. Adversarial re-check of this research

The user, 2026-10-31: "think adversily on this again make sure you did not over under research as you have in past limited it or did everything". No new agents were run for this: the coordinator checked the map below, reading the notes and sources directly.

| Job | Coverage | Verdict |
|---|---|---|
| Body and world motion | `body-world-models.md`, repo and weight rows checked by API | Enough |
| Hands | `hands.md`, MediaPipe cause checked in source | Enough. Hand size against accuracy stays unmeasured by anyone found |
| Live webcam | `live-and-apps.md` | Enough on paper. No fps on this card |
| Commercial techniques | `live-and-apps.md` | Enough. Core solvers are unreadable |
| Cleanup, retarget, export | `cleanup-retarget.md` | Enough. **Over-researched:** physics trackers and streaming protocols go beyond what the next test needs |
| Face | `face-landmarks-juststage.md` | Enough for JustStage. **Over-researched:** WFLW detector rankings |
| **How motion reaches the film** | **Not asked in any brief. Under-researched.** Closed below from our own notes and local code | Fixed |
| **Two actors in one shot** | Thin | Still a gap, below |
| **Real user opinion (Reddit)** | Not reached | Still a gap, below |
| **A real test** | None | Item 14 on the proof list |

**Errors found in this report and corrected:**
- FlowHMR's blind human study used a pool of 500 videos, not 4,182. The 4,182 clips are its physics test. The annotator count is not stated.
- The 8 GB row left out HTD Refine (AGPL-3.0), which the 5.08 GiB figure includes.
- The ExMR hand jitter numbers were re-read in the paper and hold: Table III, 5.2 against 32.4, unit 10 m/s³.

**How motion reaches the film.** Mocap only helps JustDirect once it can steer a shot:
- **Route A, 3D guide.** Mocap on a rigged character, render, then guide LTX. Our guide works at full size today (the action research's row 3).
- **Route B, pose clip.** Union Control reads a half-size pose clip, and ComfyUI's LTX-2 Pose to Video template shows the pattern (web). ComfyUI's `comfy_extras/sam3d_body/export/openpose_2d.py` already draws SAM 3D Body output as DWPose-style skeletons (code, read here). It needs the half-size guide, which sd.cpp doesn't have yet (action research).
- **Route C, no mocap.** Wan-Animate 2 transfers an actor's motion straight onto a character, but it is 31 GB and needs a 16 GB+ tier (consistency research).

The next test should end with route A or B on a real shot. A mocap file alone proves little for this app.

**Two actors.** No open single-camera tool was found that does two actors with hands in one shared world. PromptHMR-Vid places people jointly but has no fingers. RGB MoCap runs each person separately. `darcyjia/ue5-ai-mocap` does two people from AI video through GVHMR (one line from GitHub's topic page, unread). For now, capture each actor alone.

**New names from the re-check.** BlendCap is a paid local Blender add-on doing body, hands, face and world motion from one clip, for about $60, with an 11 GB download. Its setup asks users to accept Meta's SAM License, so it is probably built on SAM 3D Body (inference, as with Mocai). `anymove` does any creature from AI video. `vid2anim` uses DWPose. None changes the ranking.

**Search limits, stated plainly.** The coordinator repeated the plain queries with `curl` against DuckDuckGo and Bing using a browser user-agent. The first query returned the same vendor lists as before, and DuckDuckGo then returned bot checks while Bing returned junk. A further attempt to reach Google and Reddit through proxies and archives was blocked by the permission system and was not retried. **Google's own results and Reddit stay unread.** The user's own Google answer remains the one check we couldn't repeat.

## 8. Plain searches run first by the coordinator

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

## 9. Measured here: SAM 3D Body against MediaPipe (2026-10-31)

RTX 2070 SUPER 8 GB, 32 GB RAM. ComfyUI 0.43.0, PyTorch 2.14.1 cu126, `sam_3d_body_dinov3_bf16` (2.83 GB, ungated re-host), RT-DETR for the person box. MediaPipe 1.2.0 on the CPU. Clip: ComfyUI's own `woman_holding_water_glass.mp4`, 1280×720, 30 fps, 150 frames, one person waist-up, static camera, hands about 170 px across. **One gentle clip, and not the user's. It proves it runs and sets a baseline, nothing more.** Scripts and results: `E:\Dev\Web\just-mocap\bench` (`runs.jsonl`, `jitter.js`).

| Run | Time for 150 frames | Per frame | Peak card use, desktop included |
|---|---|---|---|
| Hands on, batch 8 | 48.8 s | 0.32 s | 4,853 MiB |
| Hands on, batch 4, first run | 71.2 s, models loading | 0.47 s | 6,133 MiB |
| Hands off, batch 4 | 22.6 s | 0.15 s | 3,925 MiB |

The hands-on batch 8 run reused the loaded models, so its figure excludes load time. ComfyUI's dynamic VRAM loading did the staging with no settings changed. The card idles at about 770 MiB.

Finger jitter, scored the same way for both: each finger joint's bend angle over time, RMS second difference in degrees per frame², median across joints. Spread is that angle's standard deviation, so a frozen hand can't look best.

| Method | Jitter, hand 1 | Jitter, hand 2 | Spread | Hand found |
|---|---|---|---|---|
| SAM 3D Body, raw | 1.47 | 1.87 | 3.7, 4.2 | 150 of 150 (both) |
| SAM 3D Body, Gaussian window 7 | 0.26 | 0.56 | 3.6, 4.2 | 150 of 150 (both) |
| MediaPipe, raw | 8.21 | 7.37 | 6.1, 8.9 | Left 66 of 150, right 150 of 150 |
| MediaPipe, Gaussian window 7 | 0.73 | 0.74 | 4.7, 8.2 | Same |
| MediaPipe, One Euro (causal, as live) | 1.70 | 1.51 | 5.2, 8.2 | Same |

Reading it:
- SAM 3D Body raw is 4 to 5 times steadier than MediaPipe raw.
- Most of MediaPipe's jitter on this clip goes with a filter, which fits the source: its hand graph has none.
- The real gap left is coverage: MediaPipe lost one hand in 84 of 150 frames. SAM 3D Body kept both.
- MediaPipe's higher spread is at least partly noise, since Gaussian smoothing cut the left hand's from 6.1 to 4.7. It can't be read as more real motion. Joint sets differ slightly (17 against 15), and handedness labels weren't matched between the two.
- 21.6 ms a frame for MediaPipe on the CPU, so it is the live option on speed. SAM 3D Body at 0.32 s a frame is about 3 fps here: offline only.

Checked by eye on two frames (`out/check-hands.png`): every finger on the right hand, including both hands interlaced around the glass and the raised hand gripping it. The full overlay is `out/sam3d-overlay.mp4`, the OpenPose-style render a pose guide would use.

Not shown yet: fast motion, full-body shots with small hands, moving camera, world position. SAM 3D Body gives no world position.

**Not run: GEM-X + EgoHand.** The permission system refused the install as code from outside, and it was not retried. The setup script is `E:\Dev\Web\just-mocap\bench\setup_gemx.sh`, unrun, and nothing of GEM-X is on this PC. The RGB MoCap step needs the same kind of install.
