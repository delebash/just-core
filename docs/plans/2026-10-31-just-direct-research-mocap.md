# One-camera mocap for JustDirect: results (2026-10-31)

The user, 2026-10-31: "another app i want to build is signle source mocap like from webcam or video full mocap including hands, i used mediapipe in the past but hands where jittery"; "this whould be part of just direct"; "we can take ideas and write our own code based on techniques from commercial apps".

**Read sections 11 to 14 first: section 11 holds the current picks, section 12 the measured body and finger accuracy, section 13 face and eyes, section 14 the export and cleanup that are built. Section 10's audit supersedes anything older that disagrees.** Measured on this PC: SAM 3D Body, GEM-X, EgoHand, MediaPipe and RTMW. ExMR, FlowHMR and GVHMR are unmeasured. No source reports those on an 8 GB card, so their 8 GB lines are inference. Reddit could not be reached by any tool (a gap in the search). Evidence labels and full tables are in the notes.

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
| Live webcam | **MediaPipe with a causal filter and our own IK**, corrected by the audit | Steadier than RTMW on the violinist and mixed on the guitarist, 22-30 ms a frame on the CPU, clean licence. It fails on fast, blurred motion. RTMW with a hand model on crops and PEAR stay unmeasured | Apache-2.0 |
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
| Live webcam body and hands (planned) | Keep, with a causal filter | Same live answer as section 1. Its Python package is CPU only outside Ubuntu (`base_options.py`, read here) |

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

**Corrected the same day.** The first version of this section scored all 150 frames and said MediaPipe lost a hand in 84 of them. That was wrong: in frames 38-121 the second hand is below the frame, so MediaPipe was right to report one hand, and SAM 3D Body's second hand there is a guess. These rows score visible hands only: both hands in frames 0-37 and 122-149, the raised hand in 38-121.

| Method | Jitter across the visible windows | Fit for |
|---|---|---|
| SAM 3D Body, raw | 1.0-2.2 | |
| SAM 3D Body, Gaussian window 7 | 0.21-0.52 | Offline |
| MediaPipe, raw | 5.9-11.4 | |
| MediaPipe, Gaussian window 7 | 0.40-0.97 | Offline |
| MediaPipe, One Euro (causal) | 1.2-2.5 | Live |

Reading it:
- SAM 3D Body raw is about 3 to 5 times steadier than MediaPipe raw, and about twice as steady once both are smoothed.
- Most of MediaPipe's jitter on this clip goes with a filter, which fits the source: its hand graph has none. A live One Euro filter brings it to about SAM 3D Body's raw level.
- There is no ground truth on this clip, so these are steadiness numbers, not accuracy. Joint sets differ slightly (17 against 15), and handedness labels weren't matched.
- 21.6 ms a frame for MediaPipe on the CPU, so it is the live option on speed. SAM 3D Body at 0.32 s a frame is about 3 fps here: offline only.

MediaPipe alone on the harder sample clips (likely AI-made, CPU, 22-30 ms a frame, raw):

| Clip | Frames with a hand found | Both hands | Jitter |
|---|---|---|---|
| Street dancer: full body, fast, small hands | 23 of 121, switching 30 times | 6 | 36 |
| Violinist: hands 77 px, quick fingers | 121 of 121 | 121 | 3.0-3.7 |
| Subway guitarist: hands 87 px | 121 of 121 | 108 | 8.0-12.9 |

The dancer's hands are in view in the sampled frames, so that miss is real. A filter can't fill it: most frames have nothing to smooth.

MediaPipe's model files have not changed since 2023 (Google Storage last-modified: hand 2023-04-26, pose 2023-04-28, face 2023-05-03, holistic 2023-12-21), while its releases carry on (v1.2.0, 2026-10-28). The recent hand-folder commits found are code clean-ups and doc notes.

Checked by eye on two frames (`out/check-hands.png`): every finger on the right hand, including both hands interlaced around the glass and the raised hand gripping it. The full overlay is `out/sam3d-overlay.mp4`, the OpenPose-style render a pose guide would use.

Not shown yet: fast motion, full-body shots with small hands, moving camera, world position. SAM 3D Body gives no world position.

**Not run: GEM-X + EgoHand.** The permission system refused the install as code from outside, and it was not retried. The setup script is `E:\Dev\Web\just-mocap\bench\setup_gemx.sh`, unrun, and nothing of GEM-X is on this PC. The RGB MoCap step needs the same kind of install.

## 10. Audit (2026-10-31, supersedes anything above that disagrees)

The user, after the "lost a hand" error: "this makes me think you do bad judgment in all things, rethink everything keep asking yourself questions until you are sure you give good reliable rec think adversiralyy aw many time check fact check code". Every recommendation was re-checked against licence texts, paper tables, source code and new runs on this PC. No agents.

**Errors found in what the user was told:**

| # | What was said | What is true |
|---|---|---|
| 1 | MediaPipe lost a hand in 84 frames | That hand is out of frame. MediaPipe was right. SAM 3D Body's hand there is a guess |
| 2 | SAM 3D Body is 3-5x steadier | True on the woman's clip only (4.6x, 4.9x). On the violinist it is 2.6x on one hand and equal on the other. The dancer can't be compared. See the table below |
| 3 | RTMW + hand crops is the live pick, 30 fps | Unsupported. RTMW alone is about 4x jitterier than MediaPipe's image points on the violinist and mixed on the guitarist (1.4x steadier on one hand, 2.5x worse on the other). 34 ms inference, so about 26 fps at best for the -x model. Crops untested |
| 4 | RTMW is fine for commercial use | Code and the ONNX host say Apache-2.0, but its config trains on COCO-WholeBody, "**ONLY** for research and non-commercial use" |
| 5 | 4.9 GB, then "6.1 GB is the honest peak" | Clean runs: 3.7-4.8 GB, desktop included. The 6.1 GB run did not reproduce; its cause is unknown |
| 6 | Violinist's hands are large; woman's are about 170 px | Median 77 px and 146 px, measured from landmarks |
| 7 | The dancer's miss is about small hands | His hands are 63 px against the violinist's 77 px, and MediaPipe found the violinist's in every frame. Blur and speed look like the cause (inference) |
| 8 | "Same smoothing" | Same window and near-equal width (sigma 1.4 and 1.5), but rotations against positions |
| 9 | C++ is about equal in speed | That figure is BF16 on supported cards, single image, no hand refinement. The port's strict F32 path measured about 395 ms. On a Turing card it may be slower than PyTorch |
| 10 | Python or C++ were the choices | ONNX through the kit was left out. `runner/onnx.js` already runs DirectML on Windows; RTMW ran that way here |
| 11 | SAM 3D Body + Apache cleanup is the likely default | Unproven chain. `correct_motion` needs contacts as input and SAM 3D Body gives none. `mhr2soma.py` converts dataset parquet files and is unproven on video |
| 12 | SAM 3D Body has no world position | A camera-space root path exists (`camera_translation`). On a static camera that is a real path, but the dancer's depth swings 95 cm, so it needs checking |
| 13 | Guitarist's fretting hand was 65 px off | The skeleton was on a passer-by. The run capped detection at one person with no tracking, against the template's own note. That clip's SAM 3D Body scores are void |
| 14 | MoCapAnything V2 not assessed | MIT code and weights by its README. Trained on animals and objects (`zoo1030`, `obj1k`); RMBG-1.4 and Truebones data are outside the grant. Human hand quality unknown. CAST is the same class, under review, 0 stars |
| 15 | "Cost is almost all in the image encoder" | Incomplete: with Sapiens2 keypoints that stage is 118.6 ms against SAM 3D Body's 25.3 ms. ExMR's fast mode swaps in RTMW-x, which costs foot accuracy (paper) |

**Held up on checking:** ExMR's Table III and VIII numbers; FlowHMR's human study once corrected; the Motius leaderboard; SAM License has no non-commercial term (full text read); DINOv3's grant reads the same way; GVHMR, WiLoR and FlowHMR weight restrictions; SMPL-X's bar on commercial artifacts; NVIDIA's "Models are commercially usable"; EgoHand's OpenMDW-1.1; `gem-x.cpp`'s static camera in code; RGB MoCap's quoted verdicts; MediaPipe's missing hand filter (0 hits against 14 for pose); MediaPipe's Python GPU limit in `base_options.py`.

**SAM 3D Body speed, models unloaded before each run, 150 frames, 1280×720:**

| Setting | Prediction | Per frame | Peak card use, desktop included |
|---|---|---|---|
| Hands, batch 8 | 49.5 s | 0.33 s | 4,644 MiB |
| Hands, batch 4 | 59.7 s | 0.40 s | 4,036 MiB |
| Hands, batch 1 | 123.2 s | 0.82 s | 3,666 MiB |
| Body only, batch 8 | 17.8 s | 0.12 s | 4,015 MiB |

Person detection adds about 3.4 s for 150 frames (9.3 s cold). The other clips at batch 8, 121 frames: 0.32-0.35 s a frame, peak 4,609-4,812 MiB.

**Finger jitter, re-scored after a re-read of the audit's own scripts (`bench/matched_hands.js`).** The first table here had three faults, all found the same day:
- Its "MediaPipe 2D" dropped z from the world landmarks, while RTMW used image pixels. Both now use image pixels.
- Hand order differed by column, so the violinist's pairs were crossed.
- Each method was scored on its own frames. A frame now counts only if every method has it and the two before it.

Degrees per frame², inner 10 finger joints, person's left hand then right, Savitzky-Golay smoothing:

| Clip | Hand, median | Usable frames | SAM 3D Body raw | SAM 3D Body smoothed | MediaPipe 3D raw | MediaPipe image raw | RTMW-x image raw |
|---|---|---|---|---|---|---|---|
| Woman with glass | 146 px | 62, 148 | 2.25, 1.76 | 0.94, 0.48 | 10.26, 8.56 | 7.49, 4.88 | not run |
| Violinist | 77 px | 119, 119 | 1.18, 3.48 | 0.35, 1.07 | 3.11, 3.77 | 3.02, 2.71 | 12.80, 9.80 |
| Guitarist | 87 px | 106, 119 | void: person switching | void | 10.84, 12.47 | 16.09, 9.47 | 11.24, 23.21 |
| Dancer | 63 px | 5, 1 | no comparison | no comparison | no comparison | no comparison | no comparison |

MediaPipe has too few runs of three frames in a row on the dancer, so the earlier dancer figures for all three methods can't be compared.

**Steadiness isn't accuracy, and this data shows the risk.** No clip has ground truth. The clips look AI-made or stock and none is the user's. Three checks from the same run:
- SAM 3D Body's and MediaPipe's bends barely agree: median correlation 0.40 at best on the same hand, and the side mapping is only weakly shown (dancer, woman and guitarist favour it, the violinist is neutral). At least one of them isn't following the real fingers.
- SAM 3D Body's fingers move less: its spread is about half MediaPipe's image spread on the woman and on the violinist's left hand (3.65 against 8.64). So part of its steadiness may be fingers that barely move. It needs a test with known finger motion.
- MediaPipe's image points are steadier than its world points on 5 of 6 hands, so a live solve should start from image points.

MediaPipe's label matched RTMW's side on 242 of 242 hands on the violinist and 226 of 229 on the guitarist, but only 16 of 29 on the dancer. Side comes from RTMW's wrists where it ran, from MediaPipe's label on the woman's clip.

**MediaPipe with wrist crops, tried on the CPU:** dancer 24 and 20 of 121 frames, barely better than 23. Violinist 110 and 117, worse than full frame. Guitarist's left hand 48, worse. 44-59 ms a frame. The crop sizes were chosen here, not XR Animator's, so this tests the idea rather than that app.

**RTMW-x 384 through ONNX Runtime and DirectML, the kit's engine:** 34.4 ms inference, 53.6 ms for the whole loop including start-up, 1,086 MiB peak. CPU 143-147 ms. It always returns a position, and in the sampled dancer frames it mostly sat on the hand, once on his face, with fingers collapsed to a blob. Its jitter on that clip is the worst here.

**The recommendations that survive:**

| Job | Commercial use allowed | Non-commercial |
|---|---|---|
| Video | **SAM 3D Body**: run here on four clips, 0.33 s a frame, 3.7-4.8 GB. Turn tracking on | **ExMR**, then **FlowHMR**. Paper numbers and one independent user. Not run here |
| Live | **MediaPipe** with a causal filter. Fails on fast blur | RTMW with a hand model on crops, if it proves itself. Unmeasured |

Not proven: SAM 3D Body's root path, any cleanup chain on its output, GEM-X, ExMR or FlowHMR on this card, and everything on the user's own footage. Next engine route to try for the winner: ONNX through the kit. A C++ port only if that fails.

## 11. Picks after the goal was restated (2026-10-31, replaces section 10's table)

The user: "simple a profressional version of ai mocap like quickmagic or many othe online singleshot or video ai to macap that can run on local machine for both commercial and non commercial use"; "best means best quality you can get with acceptable perfomance for my machine"; "ExMR or FlowHMR its oke not to run these yet asw they are not for commercial i what 2 iptions best non commercial best commercial".

The non-commercial pick comes from the existing notes and hasn't run on this PC. The commercial pick was changed by the measurements in section 12. Its parts ran here one by one; they aren't joined yet.

| Option | Pick | Why | Risk |
|---|---|---|---|
| Best non-commercial | **ExMR through RGB MoCap** | Best hand numbers in its paper. RGB MoCap's default, with cleanup, retarget and FBX export already built. Moving camera without VGGT. 1m 44s for 25.7 s on an RTX 5090 | Nobody has reported it on 8 GB. Low Memory 3.87 GiB on 60 frames, stronger card. Needs SMPL-X, MANO and Meta's SAM 3D Body file |
| Best commercial | **GEM-X for body, feet and world path, with contact IK on, plus SAM 3D Body's fingers joined at the wrist.** Fingers smoothed with the SOMA RTS smoother; export to BVH, FBX and Live Link Face CSV, built on `video2mocap`'s approach (section 14). Kimodo MotionCorrection was tested on the two walks on 2026-11-03 and not kept: the floor spread dropped only 3-6% and pose got 1-3 mm worse (just-mocap `docs/dev/RESEARCH.md`). Retargeting is JustStage's importer's job, not built here. Face: MediaPipe Face Landmarker's ARKit blendshapes on a head crop, measured in section 13; GEM-X's jaw and eye joints don't move | Measured in section 12 on four clips. GEM-X with contact IK wins both walking clips on every score and plants feet as steadily as the measured data. SAM 3D Body has the best fingers close up and ties GEM-X far away. No registration. GEM-X was trained on NVIDIA-owned synthetic data, by `video2mocap`'s survey | The finger join is built (section 12) and loses some movement close up. Brows are the weak part of the face, and gaze is unmeasured. Fingers are weak when hands are about 50 px, in every source. Moving camera untested: only GEM-X's static mode ran. With hidden legs it lost one clip to SAM 3D Body and tied one. About 7 minutes of processing per 10 s of video here: 4.5 for GEM-X, 2 for SAM 3D Body. Clips up to 60 s, one person |

Attack on ExMR against FlowHMR: FlowHMR won its own blind study and one independent user's eye, so it may be better on body motion. But it took 7m 32s on the same clip and card, and its moving-camera stage wants about 30 GB of free RAM on a 32 GB PC. No source compares their hands. ExMR stands for this machine.

Withdrawn: SAM 3D Body as the commercial body, because it works frame by frame with no motion model and no foot contacts, and section 12 measured the cost. It stays the body fallback, and it is now the finger source. EgoHand is withdrawn as the finger source: section 12 found it lost on fingers and missed frames. MediaPipe is withdrawn as a quality option. Section 10's jitter tables show steadiness only and decide nothing.

**Accuracy evidence found late:**
- MediaPipe against an 11-camera Vicon system: 22.5° RMSE against Leap Motion 2's 14.8°, correlation 0.45, falling from 0.55 at 0.5 Hz to 0.36 at 1.5 Hz ([PMC12473350](https://pmc.ncbi.nlm.nih.gov/articles/PMC12473350/), page read).
- Baby Grow, Behavior Research Methods 2026, newborn video: RTMPose most accurate, MediaPipe fastest (search summary, the PDF refused the fetch).

**The user's pasted Google answers, checked at source:**
- FreeMoCap is AGPL-3.0, not MIT. One camera uses a "planar projection fallback" (`posthoc_mocap_task.py:75-79`). The "worse than just 2d" quote is a 2024 collaborator comment, not a current statement.
- WHAM's code is MIT, but it needs SMPL, has no hands and was last pushed 2024-04. A code search of its repo finds no MotionBERT; its README names ViTPose and DPVO or DROID-SLAM.
- MotionBERT takes 17 body keypoints, so no fingers. YOLOv8 (`ultralytics`) is AGPL-3.0. VideoPose3D is archived with no standard licence detected. MMPose and MMHuman3D are Apache-2.0, last pushed 2025-08 and 2024-11.
- MediaPipe as fastest and lower quality matches the evidence above.

One idea in the Google answers holds up: a mocap product needs a separate hand model on crops, which agrees with `hands.md`. Discarding the body mesh doesn't lift the model files' terms.

**Other tools checked for the commercial option. Plain searches for "local QuickMagic alternative" were first run here, after the user asked; they returned FreeMoCap, EasyMocap, RGB MoCap, BlendCap, `mixamo-llm-mocap` and paid Blender add-ons.**

| Tool | Finding | Verdict |
|---|---|---|
| [`video2mocap`](https://github.com/freddysae0/video2mocap) | Apache-2.0, 0 stars, one author, v0.2. Commercial-clean GEM-X with tracking, smoothing, contacts, foot lock, review sheets, keyframe editor, BVH and FBX. Runs the pre-October GEM-X (`demo_soma_onnx.py`), static camera, no fingers yet, Linux or WSL2. README read in full; the earlier notes used only one line of it | Closest open code to the commercial goal. Base to read and adapt |
| SAM 3D Body with cleanup | Runs here. BlendCap and Mocai look built on it (inference) | Fallback |
| MoCapAnything V2, CAST | Any skeleton, no body model. Trained on animals and objects. Human hand quality unknown | Worth one test later |
| Epic MetaHuman plugin | Free, local, commercial use allowed. Closed, Unreal only, static camera, one person | Quality reference, can't be built in |
| [PoseCap](https://github.com/CorridorTech/PoseCap) | Apache-2.0, with Corridor Digital. Live webcam into Blender through PEAR (needs SMPL-X) or MediaPipe Lite. Pelvis-locked, no world path | Live only. Missing from the earlier notes |
| EasyMocap | Project Registration License v1.0, read in full: free including commercial use once each project is registered. Single video is 2D fitting with SPIN and HRNet, needs SMPL-family files; its strength is several cameras | Not better for one camera |
| MMPose, MMHuman3D, MotionBERT | Code Apache-2.0. MotionBERT takes 17 body keypoints and trains on Human3.6M. RTMW's config trains on COCO-WholeBody, marked non-commercial | Not a commercial base as they stand |

## 12. Measured finger accuracy (2026-10-31)

The ruler is CMU Panoptic `171204_pose1`, camera 00_00, hands 110-122 px, 300 frames a clip. Its 3D hand points come from about 30 cameras. It is research-only data, used here to measure and nothing else: nothing trained on it and nothing ships from it. Scored by `E:\Dev\Web\just-mocap\bench\truth_hands.js`.

Left hand then right. Shape is hand-point error after alignment. "Follows" is correlation with the real bends. "Shown" is movement against the real movement, so 100% is right and frozen fingers can't win.

| Clip | Real fingers move | Method | Shape, mm | Bend error, deg | Follows | Shown |
|---|---|---|---|---|---|---|
| Steady, 1080p | about 8° | SAM 3D Body | 6.2, 5.1 | 4.0, 3.4 | 0.87, 0.91 | 115%, 107% |
| Steady, 1080p | about 8° | MediaPipe 3D | 11.6, 11.6 | 8.4, 7.6 | 0.67, 0.72 | 166%, 167% |
| Steady, half size | about 8° | SAM 3D Body | 7.1, 6.2 | 4.7, 5.0 | 0.86, 0.82 | 115%, 94% |
| Fast arms, 1080p | 4-5° | SAM 3D Body | 5.2, 5.2 | 7.3, 5.5 | no result | 154%, 158% |
| Fast arms, 1080p, 61% of frames | 4-5° | MediaPipe 3D | 14.0, 13.7 | 11.2, 8.0 | no result | 288%, 216% |

Image points, median error: steady MediaPipe 3.0-3.4 px against RTMW-x 5.0-6.3 px. With fast arms MediaPipe found 61% of frames and RTMW all of them, so PCK@0.2 counting misses is 57-59% against 69-73%.

Checks: the wrong hand scores 29-30 mm, so the left-right mapping holds. On the fast clip the wrist error is lowest at frame offset 0, so the frames line up. SAM 3D Body doesn't under-move fingers; the earlier worry came from MediaPipe over-moving them.

Limits: the "follows" figure on the fast clip is empty, because the real fingers barely moved and that is near the measuring noise. The thumb moved least and scored low on every method.

**Big finger movement.** Two more clips, frames 2338 and 20728, where the real index to pinky bends move about 30° (spread) and the fingers open and close. Left hand then right, 1080p unless noted:

| Clip | Method | Shape, mm | Bend error, deg | Follows | Shown |
|---|---|---|---|---|---|
| 2338 | SAM 3D Body | 7.3, 7.7 | 9.5, 8.5 | 0.95, 0.95 | 97%, 96% |
| 2338 | MediaPipe 3D | 11.8, 10.6 | 16.0, 16.0 | 0.87, 0.88 | 103%, 97% |
| 2338, half size | SAM 3D Body | 8.0, 8.6 | 9.5, 9.0 | 0.95, 0.95 | 98%, 97% |
| 20728 | SAM 3D Body | 8.5, 8.6 | 11.7, 9.0 | 0.95, 0.91 | 86%, 101% |
| 20728 | MediaPipe 3D | 13.0, 9.7 | 17.5, 19.2 | 0.80, 0.88 | 110%, 105% |
| 20728, half size | SAM 3D Body | 8.6, 8.9 | 12.2, 9.6 | 0.95, 0.91 | 87%, 100% |

Image points, median: MediaPipe 3.7-4.5 px, RTMW-x 7.3-9.1 px. Peak card use 4,833-4,918 MiB, desktop included. Smoothing barely changed these scores.

Caveat: both hands open and close together in these clips, so the wrong hand "follows" nearly as well (0.90-0.96). The shape error still separates them, at 27-28 mm. A hand held still while the other moves is untested, as are fingers that move fast: these are slow open-close gestures, and the frame-offset check is flat on them.

**The user's ViTPose, RTMW and YOLO paste, checked at source:** the idea is sound, since keypoints need no MANO, and it is `video2mocap`'s own finger plan. But keypoints are 2D, so depth and rotations still have to be solved. ViTPose's code is Apache-2.0, not MIT, its table lists 2D models, and ViTPose++ weights train on COCO-WholeBody, whose annotations are "ONLY for research and non-commercial use". RTMW needs a person box (it ran that way here) and its dataset mix includes the same annotations. YOLO pose is AGPL or paid, with 2D hand points. GEM-X's own `vitpose.pth` gives 77 2D points including fingers under NVIDIA's commercial licence, which is the clean version of this idea.

**Commercial finger sources compared.** The same two clips, frames 2338 and 20728, 1080p, 300 frames each, real fingers moving about 30°. Ranges cover both hands on both clips:

| Finger source | Shape, mm | Bend error, deg | Follows | Shown | Frames with a result |
|---|---|---|---|---|---|
| SAM 3D Body hand model | 7.3-8.6 | 8.5-11.7 | 0.91-0.95 | 86-101% | 100% |
| EgoHand, its own hand detector | 9.0-11.4 | 11.1-12.9 | 0.86-0.95 | 85-103% | 28-83% |
| GEM-X native77 fingers | 13.4-20.2 | 13.3-17.6 | 0.65-0.91 | 49-66% | 100% |

GEM-X's fingers under-move, showing about half the real movement. EgoHand's detector misses many frames at this distance, and on clip 2338 its 2D points sit about 420 px from the labelled hand, so its left and right look swapped there; a shape score can still pass because both hands make the same gesture. Supplying hand boxes ourselves would remove the detector problem and is untested. EgoHand's smoothing barely changed its scores. GEM-X's 2D finger points are 8.0-8.8 px off, the same class as RTMW-x and about twice MediaPipe's.

Run here on native Windows, on the 2070 Super, no WSL: GEM-X body 270-283 s for 10 s of video (static camera, ContactIK on), peak 4,700 MiB. EgoHand 141-147 s for 10 s, peak 6,055 MiB. Installed with the normal steps from GEM-X's docs, run one at a time.

**Body against measured joints.** Same two clips, 12 limb joints, Panoptic's own joint definitions, so a fixed offset is part of every score. Pose aligns each frame alone. Motion aligns the clip once, so path and drift count. Accel error is mm per frame² against the truth. Scored by `bench/truth_body.js`.

| Clip | Method | Pose, mm | Motion, mm | Accel error | Hip travel, mm (real) |
|---|---|---|---|---|---|
| 2338 | SAM 3D Body raw | 42.7 | 50.7 | 10.69 | 125 (33) |
| 2338 | SAM 3D Body smoothed | 42.7 | 50.6 | 3.75 | 122 (33) |
| 2338 | GEM-X world, contact IK | 57.8 | 60.7 | 3.15 | 60 (33) |
| 2338 | GEM-X world, raw | 57.9 | 96.6 | 4.31 | 242 (33) |
| 20728 | SAM 3D Body raw | 29.8 | 34.6 | 8.22 | 80 (15) |
| 20728 | SAM 3D Body smoothed | 29.8 | 34.5 | 2.28 | 72 (15) |
| 20728 | GEM-X world, contact IK | 28.8 | 31.4 | 1.62 | 33 (15) |
| 20728 | GEM-X world, raw | 28.7 | 68.1 | 2.54 | 243 (15) |

The person barely moves through space in these clips, so this says nothing about walking or world path. Clean walks exist at frames 4648, 13858, 18478 and 23158, with 2.6-2.9 m of real hip travel, and two are cut from camera 00_07, where hands are about 50 px. Windows with ankle speeds of 50 m/s and more were rejected as tracking glitches in the data.

**Walking against measured joints.** Frames 4648 and 13858, camera 00_07, 1080p, 300 frames, a high angle looking down, static camera, two different people. Neither clip is walking alone: in the frames looked at, one person raises both arms and the other leans over a laptop. The scoring is the same as above. Foot slide is how far the ankle wanders along the floor while the measured ankle stays under 0.15 m/s for at least 8 frames, averaged over 10-11 stances a clip. The real figure in brackets is the measured data's own wander, which includes the heel rolling and measuring noise.

| Clip | Method | Pose, mm | Motion, mm | Accel error | Hip path error, mm | Hip travel, mm (real) | Foot slide, mm (real) |
|---|---|---|---|---|---|---|---|
| 4648 | SAM 3D Body smoothed | 34.3 | 186.1 | 14.03 | 153.5 | 3028 (2464) | 26.6 (4.6) |
| 4648 | GEM-X world, contact IK | 26.2 | 79.2 | 7.20 | 70.8 | 2631 (2464) | 3.1 (4.6) |
| 4648 | GEM-X world, raw | 26.5 | 115.0 | 8.21 | 100.1 | 2656 (2464) | 25.4 (4.6) |
| 13858 | SAM 3D Body smoothed | 39.9 | 173.2 | 12.30 | 143.7 | 3307 (2498) | 20.0 (3.4) |
| 13858 | GEM-X world, contact IK | 37.1 | 83.4 | 9.38 | 69.8 | 2617 (2498) | 3.3 (3.4) |
| 13858 | GEM-X world, raw | 37.4 | 150.4 | 10.82 | 124.8 | 2789 (2498) | 23.9 (3.4) |

GEM-X with contact IK halves SAM 3D Body's path error and overstates travel by 5-7% against 23-32%. SAM 3D Body has no world solve, so it is really a camera-space result; GEM-X's own camera-space output scores about the same on motion, 182-194 mm. Foot slide on the standing clips, same order, smoothed SAM then contact IK then raw GEM-X: 2338 18.4, 3.8, 77.3 (real 0.9); 20728 10.9, 2.4, 60.8 (real 0.4). Those two clips have the feet out of frame, so their figures only show how steady a hidden foot stays. Raw GEM-X slides about as badly as SAM 3D Body on the walks and worse on the standing clips, so contact IK is not optional.

Step-to-step stance height, a rough floor check on the walking clips: real 24-30 mm, GEM-X with contact IK 51-60 mm, SAM 3D Body 65-77 mm. Neither stays as level as the real floor. Tilt and heel lift are mixed into this number, so it only says floor height still needs a check by eye and probably a cleanup step.

**Why GEM-X lost clip 2338.** The camera cuts that person off at the thighs, and clip 20728 cuts its person's legs off too. Scoring arms and shoulders alone, with their own alignment, GEM-X wins all four clips, smoothed SAM 3D Body then GEM-X: 2338 30.3, 21.4 mm; 20728 28.0, 17.1 mm; 4648 25.4, 18.8 mm; 13858 38.3, 28.2 mm. So the loss is in the hidden legs: SAM 3D Body guessed them better on one clip and tied on the other, and GEM-X is better on all the visible joints scored this way.

**Fingers far away.** The same two walking clips, hands about 50 px, 278-284 frames with measured hands. EgoHand wasn't run here:

| Clip, hand | Real fingers move, deg | Method | Shape, mm | Bend error, deg | Follows | Shown |
|---|---|---|---|---|---|---|
| 4648 left | 5-26 | SAM 3D Body smoothed | 11.1 | 18.0 | 0.63 | 97% |
| 4648 left | 5-26 | GEM-X fingers | 10.7 | 17.3 | 0.79 | 50% |
| 4648 right | 6-11 | SAM 3D Body smoothed | 5.5 | 6.8 | 0.35 | 63% |
| 4648 right | 6-11 | GEM-X fingers | 6.5 | 6.5 | 0.48 | 69% |
| 13858 left | 6-8 | SAM 3D Body smoothed | 6.8 | 6.4 | 0.53 | 97% |
| 13858 left | 6-8 | GEM-X fingers | 6.1 | 8.5 | 0.12 | 83% |
| 13858 right | 8-14 | SAM 3D Body smoothed | 9.2 | 9.8 | 0.49 | 77% |
| 13858 right | 8-14 | GEM-X fingers | 9.8 | 9.0 | 0.60 | 63% |

The wrong hand scores 26-29 mm, so the mapping holds. Far away the two are about tied and neither is professional: the one hand with real movement, 4648 left, is 17-18° off. SAM 3D Body stays the finger source because it wins close up and shows the full movement here, where GEM-X shows half. The honest reading is that a full-body 1080p shot doesn't carry enough finger detail. More pixels on the hands, from 4K or a closer shot, is the likely fix, and Panoptic's HD video can't test that.

Speed for these 10 s clips on the 2070 Super: SAM 3D Body 113-120 s, peak 4,586 MiB. GEM-X 273-280 s. Limits: two walks, two people, one camera angle, about 2.5 m of net travel in 10 s, static camera. No run, jump or fast fingers yet. Scored by `bench/truth_body.js` and `bench/truth_hands.js`.

**SAM 3D Body's fingers joined onto GEM-X's body (2026-11-02).** SAM 3D Body's per-frame MHR mesh is turned into SOMA joint rotations by SOMA's own `PoseInversion`, using SAM's shape for each frame. SOMA's `remove_joint_orient_local` then puts them in the convention GEM-X uses; its docstring names this exact use. Only the 48 finger joints are copied. GEM-X keeps its body, wrists and world path. Code: `E:\Dev\Web\just-mocap\bench\join_fingers.py`; the mesh is saved by a small ComfyUI node in `bench/comfy_nodes`, loaded through ComfyUI's extra-paths file so the shared install is unchanged.

Same four clips and scoring as above. Ranges cover both hands on both clips. SAM 3D Body is the raw run the join was built from:

| Clips | Finger source | Shape, mm | Bend error, deg | Follows | Shown |
|---|---|---|---|---|---|
| Close, 2338 and 20728 | GEM-X body + SAM 3D Body fingers | 7.5-9.1 | 7.5-11.2 | 0.90-0.95 | 78-86% |
| Close, 2338 and 20728 | SAM 3D Body alone | 7.3-8.6 | 8.5-11.7 | 0.91-0.95 | 86-101% |
| Close, 2338 and 20728 | GEM-X alone | 13.4-20.2 | 13.3-17.6 | 0.65-0.91 | 49-66% |
| Far, walks 4648 and 13858 | GEM-X body + SAM 3D Body fingers | 6.0-11.3 | 7.4-18.6 | 0.20-0.66 | 77-102% |
| Far, walks 4648 and 13858 | SAM 3D Body alone | 5.7-11.1 | 7.2-18.3 | 0.33-0.62 | 66-106% |
| Far, walks 4648 and 13858 | GEM-X alone | 6.1-10.7 | 6.5-17.3 | 0.12-0.79 | 50-83% |

Scored against the other hand, the joined fingers are 25.9-29.3 mm off, so the sides hold. The join keeps SAM 3D Body's finger shape and bend accuracy. It loses some of the movement shown close up, 78-86% against 86-101%, and that loss happens in the mesh-to-SOMA conversion, not in the copy.

What was tried: the conversion's other rest-pose setting changed nothing; SOMA's finger refinement (`finger_iters 2, lie_iters 5`) and weighting hand vertices 3x were no better. One average shape for the whole clip was clearly worse far away: walk 4648's left hand was 22.5° off and followed at 0.42, against 18.6° and 0.66 with a shape per frame. Fitting the mesh takes 1.5-2 minutes per 10 s on the CPU; mesh fit error 6.0-9.7 mm.

Two bugs in py-soma-x 0.3.3: `PoseInversion`'s default low-detail path imports `soma.fitting.body`, which doesn't exist, and the low-detail MHR file `mhr_model_lod6.pt` isn't in GEM-X's assets. `low_lod=False` with the full-detail mesh avoids both.

Still open: the wrist keeps GEM-X's rotation and hand orientation isn't scored; the movement lost close up; and SAM's raw mesh is used, so smoothing comes later in the pipeline.

**Correction, 2026-11-02: until this date the join wrote a wrong body.** It turned GEM-X's rotation vectors into matrices with py-soma-x 0.3.3's `soma.geometry.transforms.rotvec_to_matrix`, which is wrong for any real angle: it scales an already unit axis by sin(θ)/θ, so a 90° turn about Z comes out as a matrix with determinant 0.759 whose nearest rotation is 47° (re-measured 2026-11-03; this line said 51° before; checked against SciPy; its `matrix_to_rotvec` is right). Every body joint in the joined pose was off, the feet by up to 860 mm on clip 2338. The finger scores above still stand: they are taken after aligning each hand, the finger rotations come from SAM 3D Body as matrices, and rescoring clip 2338 after the fix gave 8.0 and 7.4 mm against 8.0 and 7.5. The join now uses SciPy for both directions, and only the 48 finger joints change (body joints moved 0.0001 mm). Neither GEM-X nor SOMA calls that function themselves, so the body, foot and face measurements are unaffected. It was found by drawing the exported skeleton on the video (section 14).

## 13. Face and eyes, measured (2026-11-02)

**What the body models give.** GEM-X's skeleton has `Jaw`, `LeftEye` and `RightEye` joints, but on all four clips they barely move: the eyes sit at about 11.8° with a spread across the clip of 0.01-0.08° (0.73° on one walk), the jaw stays near 1°. Its head turns normally (spread 0.25-6.4°). SAM 3D Body's face output is multiplied by zero in its MHR head (`mhr_head.py`, `pred_face = ... * 0`). So face and eyes must come from a face model. ComfyUI's `SAM3DBody_FaceExpression` node is MediaPipe Face Landmarker's 52 ARKit blendshapes mapped by hand onto MHR's 72 expression axes; for our output the ARKit values themselves are what's needed.

**Rulers tried.**
- CMU Panoptic `171204_pose1` measured faces (`hdFace3d`, 70 points with pupils): unusable for faces. Over 3,586 frames the mouth opens more than 3.4 mm in only 5% of them, nobody talks, and the measured eye opening never drops below 0.12 of the eye width, so no blink is captured. Scores there were noise-level and are not reported as results. The CMU server ran at about 15 KB/s and reset parallel connections, so only some frames were fetched by byte range (`bench/panoptic_tar_range.py`).
- KeyframeFace ([paper](https://arxiv.org/abs/2512.11321), [repo](https://github.com/wjc12345123/KeyframeFace), [data](https://modelscope.cn/datasets/chaochaooooooo/KeyframeFace_Dataset)): 21 actors, 2,100 clips, ARKit from an iPhone's TrueDepth through Live Link Face at 60 Hz. The 336 MB release has the ARKit values but no videos (only `video_metadata.json`), and it is CC BY-NC. Not usable as a ruler.
- Meta's [Multiface](https://github.com/facebookresearch/multiface) (CC BY-NC 4.0, archived, used here to measure only): a face mesh per frame tracked from 38 cameras. Mini subject `6795937`, one front camera (`400048`, chosen from the calibration and checked by eye), eight sequences: neutral, blink, mouth open, jaw drop with brows up, smile with mouth open, lowered brows, raised inner brows, hidden lips looking up. One camera's frames were fetched out of the 3-8 GB per-sequence tars by range requests (`bench/tar_camera.py`), about 200 MB each. The mesh has no eyeballs, so gaze isn't measured.

**MediaPipe Face Landmarker against Multiface** (`bench/truth_face_mf.js`, 440 measured frames, MediaPipe found 428). Each MediaPipe point is tied once to the nearest front-facing mesh vertex; the same ratios (to the eye-corner distance) are measured on both. "Follows" is correlation with the real movement, "shown" is the movement's size against the real one. Faces shrunk to the size of a medium and a full-body shot, then enlarged back as a head crop would be:

| Movement | Real spread | Points follow, full / 140 px / 70 px | Points show | ARKit blendshape follows, full / 70 px |
|---|---|---|---|---|
| Mouth opening | 0.084 | 0.99 / 0.99 / 0.99 | 97-100% | `jawOpen` 0.96 / 0.96 |
| Mouth width | 0.052 | 0.95 / 0.94 / 0.93 | 114-121% | `mouthSmile` 0.87 / 0.87 |
| Right eye opening | 0.110 | 0.97 / 0.98 / 0.98 | 95-101% | `eyeBlinkRight` -0.94 / -0.94 |
| Left eye opening | 0.085-0.095 | 0.95 / 0.97 / 0.96 | 110-133% | `eyeBlinkLeft` -0.92 / -0.94 |
| Right brow | 0.052 | 0.97 / 0.96 / 0.94 | 70-72% | `browOuterUpRight` 0.81 / 0.82 |
| Left brow | 0.044 | 0.92 / 0.90 / 0.88 | 65-67% | `browOuterUpLeft` 0.74 / 0.74 |

MediaPipe's points follow mouth and lids closely at every size tested, because it crops and resizes the face to its own input size. Brows are the weak part: the points show about two thirds of the movement and the brow blendshapes follow at only 0.73-0.82, below the points. That gap is what our earlier note on a bounded solve from points onto ARKit keys would address. Speed: 300 frames in 3-4 s on the CPU.

Limits: one person, posed expressions, studio light, a front camera; shrinking imitates resolution, not blur, compression or motion; blendshape sizes against the iPhone's ARKit aren't checked, only how well they follow; gaze is unmeasured. A Live Link Face recording on an iPhone with Face ID saves the ARKit values and the video together, and would measure gaze and blendshape sizes directly.

Searches run for this section: "best open source facial motion capture from video ARKit blendshapes 2026" (returned mocap4face, GodotARKit, DeepMotion; nothing current and open); "dataset video paired with iPhone ARKit blendshape ground truth face capture" (KeyframeFace, Express4D, ARKitFace, REFA); "MediaPipe face blendshapes accuracy compared to iPhone ARKit Live Link Face" (a Reallusion forum comparison with no numbers, arXiv 2601.08234 with no numbers or code); "KeyframeFace dataset github ARKit coefficients video download" (the repo and ModelScope). Multiface came from earlier knowledge, read at source.

## 14. Export and cleanup, built and checked (2026-11-02)

The commercial chain now writes files other tools open, built on [`video2mocap`](https://github.com/freddysae0/video2mocap)'s approach after reading its code (Apache-2.0; its README was read earlier, its code now): one neutral skeleton, BVH as the base, FBX through Blender's own exporter, face as ARKit curves. Code in `E:\Dev\Web\just-mocap\bench`: `export_mocap.py`, `blender/bvh_to_fbx.py` (copied from video2mocap with its notice, `NOTICE.md`), `blender/bone_points.py`, `check_import.py`, `preview_export.py`, and `mocap.js`, which runs a clip from video to files.

- **BVH:** GEM-X's 77 public SOMA joints with SAM 3D Body's fingers, Hips as root, centimetres, Y up, ZXY channels. The rest pose is the person's SOMA reference pose, offsets are world-aligned and each channel is the rotation relative to that rest pose. GEM-X's own SOMA adapter poses it. Read back and posed, it matches the SOMA layer's joints to 0.001 mm. GEM-X gives one body shape per clip (identity and scale spread over 300 frames: 0.0), so one skeleton loses nothing.
- **FBX:** Blender 5.3's BVH importer and FBX exporter, run headless (`E:\blender-5.3.0-beta`). Both files, imported back into Blender, match the joints to 0.002 mm after one fitted similarity (units and axes). One change from video2mocap's script: Blender's scene export writes frame 1 at 1/fps (`export_fbx_bin.py`, `start_zero=False`), one frame late against the video; exporting per action starts the keys at 0, checked by re-import.
- **Face:** MediaPipe's 52 blendshapes from the head crop, gaps up to 0.5 s filled, zero-phase low-pass at 10 Hz (blinks 15 Hz, video2mocap's settings), written in Live Link Face's CSV layout. Head and eye angle columns are zero, since the body carries the head; TongueOut is zero, since MediaPipe has no tongue. Jaw and eye joints in the BVH still come from GEM-X, which barely moves them (section 13).
- **Preview:** the exported joints, put into the camera with GEM-X's per-frame world-to-camera move (0.0 mm gap), drawn on the video with both hands enlarged. On clip 2338 the body sits on the person and the hand shapes match by eye in the four frames looked at (V signs, thumbs out, fist and thumb up, flat hands). GEM-X's own projection is 20-25 px from its own 2D points on that clip, 7-8 px for arms on walk 4648.

Live Link Face's column layout was taken from a real recording and one importer that agree (`DaVinkie/thesis-master` `notebooks/arkit/output/*.csv`, `nmfisher/blender_livelinkface` `bpylivelinkface.py`); a third file, `ChameleonWorkshop/ApplicatorForBlender` `Sample/SampleNeutral.csv`, uses lower-case names with right before left, so importers that match names exactly may differ. Searches: "Live Link Face CSV format columns Timecode BlendShapeCount EyeBlinkLeft HeadYaw LeftEyeYaw" (forum posts, no schema), then GitHub code search for `BlendShapeCount EyeBlinkLeft HeadYaw extension:csv` and `"Timecode,BlendShapeCount"`.

**Finger smoothing measured.** SOMA's RTS smoother on SO(3) (`soma/fitting/rts_smoothing.py`), run on the 48 copied finger joints only with a preset's hand gains (`join_fingers.py`, last argument), so GEM-X's body and contact IK stay untouched. Same four clips and scoring as section 12. "Shake" is a new figure in `truth_hands.js`: each bend's second difference over three frames in a row, degrees per frame², median. Panoptic's own hands show 2.4-5.4 there, but that includes its per-frame triangulation noise, so it is no target. Ranges cover both hands on both clips:

| Clips | Smoothing | Shape, mm | Bend error, deg | Follows | Shown | Shake |
|---|---|---|---|---|---|---|
| Close, 2338 and 20728 | none | 7.4-9.1 | 7.5-11.1 | 0.90-0.95 | 78-86% | 0.85-1.06 |
| Close, 2338 and 20728 | default (`r_obs` 0.005, `q_vel` 35) | 7.8-9.1 | 7.4-10.9 | 0.90-0.95 | 78-86% | 0.23-0.29 |
| Close, 2338 and 20728 | strong (`r_obs` 0.024, `q_vel` 18) | 8.3-9.1 | 7.6-10.9 | 0.90-0.95 | 77-87% | 0.07-0.08 |
| Far, walks 4648 and 13858 | none | 6.0-11.3 | 7.4-18.6 | 0.20-0.66 | 77-103% | 2.26-2.88 |
| Far, walks 4648 and 13858 | default | 5.9-11.3 | 6.9-18.4 | 0.26-0.67 | 72-102% | 0.63-0.68 |
| Far, walks 4648 and 13858 | strong | 5.8-11.3 | 6.4-18.3 | 0.28-0.68 | 69-100% | 0.15-0.18 |

Default cuts shake to about a quarter with no loss on any score. Strong cuts it to about a twelfth and helps a little far away, but costs up to 0.7 mm of shape close up and up to 8 points of movement shown (walk 13858 left hand, 90% to 82%). `mocap.js` uses default and takes strong as an argument. GEM-X's own fingers shook 0.24-0.27 on clip 2338 while showing 63-66% of the movement.
