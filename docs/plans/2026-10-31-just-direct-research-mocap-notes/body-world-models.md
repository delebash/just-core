# Body-and-world motion from one camera (JustDirect mocap research, 2026-10-31)

Scope: the body-and-world motion model. Hands in depth, live webcam and apps, and smoothing/contact/physics/retargeting are covered by the other researchers; hand output is noted here only where a model has it.

Evidence tags: **code** (read in source, file and line given), **card** (model card, maker's README or docs), **paper** (a paper's claim), **user** (a user report or independent project), **vendor** (commercial marketing). Paper and card numbers are claims. Limit tags: **[model]**, **[engine]**, **[app]** say where a limit lives.

**Nothing here was measured on this PC.** No weights downloaded, nothing installed, nothing run. Numbers are other people's, mostly on far stronger cards than the RTX 2070 Super. `docs/dev/RESEARCH.md` has no mocap section (grep for mocap, SMPL, GVHMR, SAM 3D Body returned nothing), so these notes start from zero there.

Changes to the earlier notes (`E:\Dev\3D\just-stage\docs\plans\2026-10-30-research-all-functions.md` §5a):
- FlowHMR "no code found" is out of date: code, weights and a demo are public.
- TopoCap "no code found" is out of date: `czpcf/TopoCap` exists.
- gem-x.cpp is listed there as GEM-X's no-CUDA path, but it ports the release before the current one (see question 4).
- GEM-X "VRAM not stated" still stands for upstream.

---

## 1. What are the best methods today by quality and capability, and how does each work?

### Takeaway

The 2026 pattern is one recipe: detect and track the person, run a heavy frozen image encoder (usually SAM 3D Body's) per frame, then a small temporal model turns those features, 2D keypoints and camera rotation into motion in a gravity-aligned world. For body plus hands in world space, the two best public methods are **FlowHMR** (best overall motion in two separate lines of evidence) and **ExMR** (best hand and foot numbers, cheaper, released 10 days ago). Both are new since the earlier notes, and ExMR was not in any lead.

### Cited Findings

**Ranking by quality and capability** (my ranking from mixed evidence, licence and VRAM are labels only, full labels in question 2):

| # | Method | Date | Why here | Main weakness |
|---|---|---|---|---|
| 1 | **FlowHMR** | code 2026-09-29 | Wins 61.5-79.2% of blinded pairwise human judgements against GVHMR, PromptHMR, GENMO, DuoMo, on pairs from a pool of 500 Wild-4K videos; the 4,182 clips are the physics test (paper, corrected 2026-10-31). Independent app author ranks it best overall (user). Most physically trackable. Hands included. | Slowest; heavy moving-camera stage |
| 2 | **ExMR** | code 2026-10-21 | Best hand and foot numbers in its own tables; independent app makes it the default (user). | World position is a GVHMR-style estimate, not measured on EMDB-2 in its paper |
| 3 | **DuoMo** | CVPR 2026, code 2026-04 | Best or near-best world-space numbers on EMDB and RICH (paper). Handles out-of-frame. | No hand articulation claimed. Release has no camera estimator **[app]** |
| 4 | **GEM-X** (2026-10-20 "native77") | new release | The only one here with a body model needing no registration, and a C++ port of its previous version. | No public real-data benchmark for this release; the previous release scored clearly worse than SMPL models in an independent test |
| 5 | **SAM 3D Body** | 2025-11 | Best per-frame model, including hands; the encoder behind ranks 1, 2 and 4. | One image at a time: jitter and no world **[model]** |
| 6 | **GVHMR** | 2024 | Still the baseline everyone compares with; light; some extreme poses better (user). | No hands **[model]** |
| 7 | **PromptHMR-Vid** | 2025 | Best public joint multi-person placement (user). | No fingers **[model]** |
| 8 | **TRAM** | 2024 | Good world numbers from masked SLAM plus a lift. | Slow, body only |
| 9 | **WHAM** | 2024 | Superseded. See question 6. | |
| no code | **DreamHMR** | 2026-10 | Best camera-space numbers under a unified protocol and best under occlusion (paper). | Code "will be made publicly available"; `iclr2027-submission/DreamHMR` is empty (size 0) |
| no code | **DanceHMR** | SIGGRAPH Asia 2026 | Close-up and hand-focused SMPL-X video model (paper). | No code or weights found |

**How each works, in plain words:**

- **FlowHMR**: treats capture as generating motion, because depth is ambiguous and direct regression averages the possibilities. A 0.46-billion-parameter flow-matching transformer (the HY-Motion MM-DiT design) is conditioned on SAM 3D Body features and camera rotations and produces SMPL-H body, hands and global path together. It is then post-trained (GRPO) with two rewards: stay faithful to the video, and be trackable by a physics controller. — [paper](https://arxiv.org/abs/2610.03691), [card](https://huggingface.co/fafsaf1/flowhmr-0.46B)
- **ExMR**: a GVHMR-derived temporal transformer predicts whole-body SMPL-X from SAM 3D Body and HaMeR features plus 2D keypoints. Two refiners then revisit local evidence and add residual rotations: HandMR for elbows, wrists and fingers, FootMR for ankles. World trajectory comes from camera rotation plus predicted root velocity. — [paper](https://arxiv.org/abs/2610.26213), [repo](https://github.com/twehrbein/ExMR)
- **DuoMo**: two diffusion models. The first generates motion in camera space, which generalises well to odd footage. That is lifted to the world with camera poses, then a second model cleans it into globally consistent motion, filling gaps when the person leaves frame. It outputs mesh vertices directly rather than body-model parameters. — [paper](https://arxiv.org/abs/2603.03265)
- **GEM-X**: Body Pose (a DINOv3 image model) gives 1024-D features, ViTPose gives 77 2D keypoints, and a 12-layer temporal transformer predicts SOMA motion in camera and world coordinates; optional contact/IK afterwards. Hand Pose is a separate image model run frame by frame. — [model overview](https://github.com/NVlabs/GEM-X/blob/main/docs/MODEL_OVERVIEW.md) (card)
- **SAM 3D Body**: encoder-decoder on one image crop producing MHR parameters; a separate hand decoder; optional prompts (keypoints, masks). Trained with a data engine that hunts for unusual poses. — [paper](https://arxiv.org/abs/2602.15989)
- **GVHMR**: predicts pose in a gravity-view frame (gravity plus camera view direction), then rolls out the world path, so only camera rotation is needed, not a full SLAM reconstruction. — [paper](https://arxiv.org/abs/2409.06662)
- **PromptHMR-Vid**: promptable image model plus a video model over several people together; DROID-SLAM and Metric3D for the world. — [repo](https://github.com/yufu-wang/PromptHMR)
- **TRAM**: masks people out of DROID-SLAM to get a scaled camera path, then lifts camera-space motion into the world. — [repo](https://github.com/yufu-wang/tram)
- **DreamHMR**: retrains a video-generation backbone (Wan, Cosmos, LTX) to predict complete human renderings, so its features encode body surface, then refines body and hands from local evidence. — [paper](https://arxiv.org/abs/2610.20124)
- **Add-on, worldhmr-fastcam**: a closed-form correction for world drift under fast camera motion. It shows drift comes from camera and human being recovered at mismatched scales. No retraining; works with PromptHMR-Vid, GVHMR, TRAM. — [paper](https://arxiv.org/abs/2610.19729), [repo](https://github.com/chien90190/worldhmr-fastcam)

**Accuracy tables** (all paper claims; each table is one paper's protocol, do not mix columns across tables):

World-space, EMDB, lower is better, from [DuoMo](https://arxiv.org/abs/2603.03265) and [WildHSR](https://arxiv.org/abs/2609.29106):

| Method | WA-MPJPE | W-MPJPE | RTE | Jitter | Foot sliding |
|---|---|---|---|---|---|
| DuoMo | 67.6 | 171.6 | 1.2 | 8.7 | 3.7 |
| GENMO | 74.3 | 202.1 | 1.2 | 17.8 | 8.8 |
| TRAM | 76.4 | 222.4 | 1.4 | 18.1 | 11.0 |
| GVHMR | 111.0 | 276.5 | 2.0 | 16.7 | 3.5 |
| WHAM | 135.6 | 354.8 | 6.0 | 22.5 | 4.4 |
| PromptHMR-vid (WildHSR table) | 71.0 | 216.5 | 1.3 | | |
| JOSH (WildHSR table) | 68.9 | 174.7 | 1.3 | | |
| WildHSR (its own table) | 66.3 | 193.6 | 0.9 | | |

World-space, RICH, from [FlowHMR Table 2](https://arxiv.org/abs/2610.03691): DuoMo WA 52.86, W 78.28; FlowHMR 56.68, 88.43; PromptHMR 72.25, 115.55; GVHMR 82.83, 133.08; GENMO 88.12, 140.51. FlowHMR has the best PA-MPJPE (31.40), the lowest jitter (6.71) and the highest physics success (51.35%).

Physical plausibility on Wild-4K, 4,182 clips, PHC+ success rate, from FlowHMR Table 1: FlowHMR 82.47, without post-training 78.79, GVHMR 62.82, PromptHMR 60.33, GENMO 58.80, DuoMo 56.71 (paper).

Camera-space, from [ExMR Table VIII](https://arxiv.org/abs/2610.26213), PA-MPJPE / MPJPE in mm, Accel in m/s²:

| Method | 3DPW | EMDB-1 | RICH | Accel 3DPW |
|---|---|---|---|---|
| ExMR | 33.0 / 51.8 | 37.4 / 64.1 | 27.3 / 50.0 | 4.1 |
| DanceHMR | 35.2 / 53.6 | 40.1 / 64.3 | | 4.9 |
| SAM 3D Body, as reported | 33.8 / 54.8 | 38.2 / 61.7 | 30.9 / 53.7 | |
| SAM 3D Body, released checkpoint re-run by ExMR | 35.1 / 55.5 | 39.6 / 64.5 | 33.0 / 56.4 | 14.0 |
| DuoMo | | 41.8 / 67.1 | 34.8 / 51.4 | |
| GENMO | 34.6 / 53.9 | 42.5 / 73.0 | 39.1 / 66.8 | 5.2 |
| PromptHMR-Vid | 35.5 / 56.9 | 40.1 / 68.1 | 37.0 / 57.4 | |
| GVHMR | 36.2 / 55.6 | 42.7 / 72.6 | 39.5 / 66.0 | 5.0 |
| WHAM | 35.9 / 57.8 | 50.4 / 79.7 | 44.3 / 80.0 | 6.6 |

DreamHMR Wan-5B, its own unified protocol: 3DPW 30.9 / 51.9, EMDB-1 36.2 / 58.3, RICH 27.2 / 49.3; under occlusion body 107.1 and hands 55.1 against SAM 3D Body 115.2 and 61.2 (paper, [Table 1-2](https://arxiv.org/abs/2610.20124)).

Hands, from ExMR Tables I and III: whole-body hand per-vertex error on ARCTIC 14.7 mm (SAM 3D Body 16.3, DanceHMR reported 24.8), MOYO 26.5 (SAM 3D Body 32.9), RICH 21.9 (SAM 3D Body 27.5). Hand jitter on ARCTIC 5.2 against 32.4 (paper).

### Inferences

- Cost concentrates in the encoder, not the temporal model. ExMR's three temporal nets total about 0.02 ms per frame against 25 ms for SAM 3D Body (Table S1). FlowHMR generation takes 0.78 s against 173.53 s for full SAM features on 300 frames ([issue #4](https://github.com/flowhmr/flowhmr/issues/4)). This decides the C++ question in section 4.
- "Most accurate" and "looks best" differ. DuoMo beats FlowHMR on RICH world error, yet FlowHMR beats DuoMo in blind human comparison and physics success. For a film app, the human-preference and physics evidence matters more, though both come from FlowHMR's own authors.
- Ranks 1 and 2 are a pair, not a contest: FlowHMR for final-quality body motion, ExMR for hands, feet and speed. No source compares their hands head to head.

### Gaps

- ExMR reports no EMDB-2 world-space numbers, so its world accuracy against DuoMo or FlowHMR is unmeasured in any source found.
- No published benchmark on real footage for GEM-X's 2026-10-20 release. Its card gives only W-MPJPE 100.2 mm on NVIDIA's own synthetic set.
- Cross-paper comparison is approximate: re-runs differ in protocol, joint sets and alignment.
- FlowHMR's blind study and physics results are authors' claims, not repeated by anyone else found.

---

## 2. For each serious candidate: weights, code, body model, gate, and capabilities

### Takeaway

Almost every top method needs a registration-gated SMPL-family body file, so a free app cannot ship them and the user must fetch them by hand **[app]**. SAM 3D Body weights are gated at Meta but re-hosted ungated. GEM-X (SOMA) and SAM 3D Body (MHR) are the only strong options needing no body-model registration. No method combines top quality, moving camera, multi-person and hands.

### Cited Findings

**Availability and body model:**

| Method | Open weights? (checked) | Code | Output body | Registration-gated files needed | Licence label |
|---|---|---|---|---|---|
| FlowHMR | Yes, HF API `fafsaf1/flowhmr-0.46B`, `gated:false` | [flowhmr/flowhmr](https://github.com/flowhmr/flowhmr), pushed 2026-10-31 | SMPL-H with hands | SMPL-H (AMASS, MANO site); gated SAM 3D Body; gated VGGT-Omega | Code Apache-2.0; [weights non-commercial](https://huggingface.co/fafsaf1/flowhmr-0.46B/blob/main/LICENSE) |
| ExMR | Yes, HF API `twehrbein/ExMR`, `gated:false`, 236 MB | [twehrbein/ExMR](https://github.com/twehrbein/ExMR), pushed 2026-10-30; demo only so far, no training code | SMPL-X with hands and feet | SMPL-X, MANO, gated SAM 3D Body ([INSTALL](https://github.com/twehrbein/ExMR/blob/main/docs/INSTALL.md)) | Code and weights educational, research, non-profit only; modifications must be open source; [GVHMR-derived](https://github.com/twehrbein/ExMR/blob/main/LICENSE). Sapiens2 restricted, YOLO AGPL-3.0, nvdiffrast non-commercial ([notices](https://github.com/twehrbein/ExMR/blob/main/THIRD_PARTY_NOTICES.md)) |
| DuoMo | Yes, GitHub release v1, 2026-05-27: `duomo_cam` 516 MB, `duomo_world` 473 MB, `dense_kpt` 1374 MB, `converter` 143 MB | [facebookresearch/DuoMo](https://github.com/facebookresearch/DuoMo) | Mesh vertices (issue #5 says MHR LOD6 topology); converter included | SMPL family via `scripts/download_smplx.sh` | XRCIA Noncommercial Research (card; `LICENSE.pdf` not read) |
| GEM-X | Yes, HF API `nvidia/GEM-X`, `gated:false`. Body, motion, ViTPose. Hand: `nvidia/EgoHand-v1`, `gated:false` by API, OpenMDW-1.1 | [NVlabs/GEM-X](https://github.com/NVlabs/GEM-X), pushed 2026-10-22 | SOMA, 77 joints; no face | None for SOMA: [nvidia/SOMA-X](https://huggingface.co/nvidia/SOMA-X) `gated:false`, Apache-2.0 | Code Apache-2.0 plus OpenMDW per-file; weights NVIDIA Open Model Licence, "ready for commercial use" (card). `body_s240000.ckpt` and `vitpose.pth` are initialised from SAM 3D Body weights (maintainer, [issue #32](https://github.com/NVlabs/GEM-X/issues/32), 2026-10-31), and whether the SAM License then applies is unanswered |
| SAM 3D Body | Gated manually at `facebook/sam-3d-body-dinov3`. Ungated re-hosts: `Comfy-Org/sam-3d-body` (`gated:false`, sam-license), `LocalAI-io/sam-3d-body-dinov3-GGUF`, `AmmarkoV/SAM3DBody-cpp-onnx-models` (labelled MIT, conflicts with source) | [facebookresearch/sam-3d-body](https://github.com/facebookresearch/sam-3d-body), last push 2026-02-19 | MHR, 70 keypoints, body, hands, feet | None for MHR (Apache-2.0) | SAM License, conditional |
| GVHMR | Yes, via repo download links, not re-checked | [zju3dv/GVHMR](https://github.com/zju3dv/GVHMR), pushed 2026-09-15 | SMPL / SMPL-X body, no fingers | SMPL-X, SMPL | Educational, research, non-profit; PRL v1.0 was adopted then reverted the same day (2026-09-15, commit log) |
| PromptHMR-Vid | Yes, Google Drive and [BEDLAM2 site](https://github.com/yufu-wang/PromptHMR#bedlam2-checkpoints) | [yufu-wang/PromptHMR](https://github.com/yufu-wang/PromptHMR), last push 2026-01-28 | SMPL-X, fingers neutral | SMPL-X, SMPL | Non-commercial scientific research, Meshcapade |
| TRAM | Yes, by script | [yufu-wang/tram](https://github.com/yufu-wang/tram), last push 2025-06-08 | SMPL | SMPL, SMPLify | Repo MIT; SMPL separate |
| WHAM | Yes, by script | [yohanshin/WHAM](https://github.com/yohanshin/WHAM), last push 2024-04-18, 83 open issues | SMPL | SMPL, SMPLify | Repo MIT; SMPL separate |
| DreamHMR | No (searched arXiv, GitHub, HF). Training-free equivalent: none known | Placeholder repo, size 0 | SMPL-X | | |
| DanceHMR | No (arXiv page, project page, GitHub, HF). ExMR's "DanceHMR-style" baseline is the only public approximation, not released | None | SMPL-X | | |
| GEM-SMPL | Only at old revision `5ccf5ca` of `nvidia/GEM-X`; removed from HEAD by the 2026-10-20 release. [GENMO](https://github.com/NVlabs/GENMO)'s README still points to HEAD | NVlabs/GENMO, last push 2026-06-23 | SMPL | SMPL | NVIDIA OneWay Noncommercial code; weights NVIDIA Open Model Licence |

Other classes, reported for completeness:

- **Any-skeleton models, no body model at all**: [MoCapAnything V2](https://github.com/phongdaot/MocapAnything) (SIGGRAPH Asia 2026; video plus reference skeleton to BVH rotations; weights open at `kehong/MoCapAnythingV2-weights`, HF says MIT, repo NOASSERTION; "clean reimplementation", not the paper's code), [CAST](https://github.com/CAST-mocap/CAST) (under review; MIT label, weights `CAST-mocap/CAST`, causal checkpoint for streaming, Windows steps documented), [TopoCap](https://github.com/czpcf/TopoCap) (weights on HF, no licence file). No human benchmark against the methods above was found.
- **People plus scene in one pass**: [Human3R](https://github.com/fanegg/Human3R) (SMPL-X, CC BY-NC-SA, WA 112.2), [WildHSR](https://github.com/jerrinbright/WildHSR) (repo exists, no weights link found in its README grep), [OnlineHMR](https://github.com/Tsukasane/Video-OnlineHMR) (streaming, CVPR 2026, WA 93.5).
- **Multi-person per-frame**: [CoMotion](https://github.com/apple/ml-comotion) (SMPL, Apple licences, weights by script, multi-person online), [Multi-HMR 2](https://github.com/naver/multi-hmr2) (repo exists, not read).
- **Training-free**: [SAM-Body4D](https://github.com/gaomingqi/sam-body4d) (SAM 3 tracking, Diffusion-VAS occlusion completion, then SAM 3D Body per frame, MIT code). A commenter says it has no real temporal model ([issue #32 thread](https://github.com/facebookresearch/sam-3d-body/issues/32), user). [Mocap-2-to-3](https://github.com/WangZhumei/Mocap2to3) (CVPR 2026, not read beyond README head).
- **Older video pipeline**: [EasyMocap](https://github.com/zju3dv/EasyMocap), see question 6.

**Capabilities** (code or card unless tagged):

| Method | Moving camera | World position | People | Occlusion | Fast motion, extreme poses | Close-ups, truncation |
|---|---|---|---|---|---|---|
| FlowHMR | Yes, VGGT-Omega camera; a sign bug made moving-camera output wrong until fixed 2026-10-21 ([issue #5](https://github.com/flowhmr/flowhmr/issues/5), user found it) | Yes | One chosen per run **[app]**; [RGB MoCap](https://github.com/toyxyz/toyxyz_RGBMocap) runs several separately | Wild-4K includes severe occlusion, trained on synthetic occlusion (paper) | Tested on "highly dynamic" clips (paper) | Not stated |
| ExMR | Yes, rotation only: SimpleVO default, DPVO in `accurate`; `-s` static gives the best trajectory (card) | Yes; `--snap_to_ground` for vertical drift | "Main person" **[app]**; RGB MoCap does several separately | Designed for partial hand occlusion via HaMeR features (paper) | 30 fps trained | Portrait phone bug fixed in v0.1.5 (card) |
| DuoMo | Yes **only with your own camera poses**: "this release does not include a SLAM module" **[app]** | Yes | Not stated | Best here: generates through out-of-frame, EgoBody tested (paper) | | Handles truncated, shaky EgoBody (paper) |
| GEM-X | Rotation only: [`gem/inference/camera_motion.py:5-11`](https://github.com/NVlabs/GEM-X/blob/main/gem/inference/camera_motion.py) "approximate rotation-only demo estimator"; errors out if background evidence is too weak; `provided` mode takes external rotations (code). [Issue #24](https://github.com/NVlabs/GEM-X/issues/24) "camera.pt never produced" describes the removed older script | Yes, `translation_world` | One, largest area; [`body_video.py:118,177`](https://github.com/NVlabs/GEM-X/blob/main/gem/inference/body_video.py) **[app]**; supplied boxes allow several for Pose only | Tracking fails partly out of frame ([#11](https://github.com/NVlabs/GEM-X/issues/11), user, old release) | Foot above hip loses limbs ([#26](https://github.com/NVlabs/GEM-X/issues/26), user, old release); vigorous lower body with fixed hands unstable ([#27](https://github.com/NVlabs/GEM-X/issues/27)) | Forward lean and offset on portrait ([#16](https://github.com/NVlabs/GEM-X/issues/16), user, old release) |
| SAM 3D Body | None **[model]**, per image | Camera space only **[model]** | Multi-person by boxes | Paper categories below | Inverted body aPCK 78.18 vs CameraHMR 46.12 (paper) | Upper-body truncated aPCK 64.49 vs 62.37 (paper): small gain |
| GVHMR | Yes, SimpleVO default, DPVO optional | Yes | Not re-read; RGB MoCap runs selected people separately (user) | | Backflips better than ExMR and FlowHMR in one independent test (user) | |
| PromptHMR-Vid | Yes, DROID-SLAM, Metric3D | Yes | **Jointly**, the strength here | | Lower overall quality than ExMR (user) | |
| TRAM | Yes, masked DROID-SLAM | Yes | Not re-read | | | |
| WHAM | Yes, DPVO or DROID-SLAM, or gyro | Yes | Not re-read | | | |

GEM-X hard limit: **clips up to 60 s** and one person (`body_video.py:177`, `docs/DEMO.md`) **[app]**; 30 Hz normalisation.

GEM-X hands: the 2026-10-20 "native77" Body Motion observes all 77 keypoints including fingers (card). Older reports of static fingers ([#4](https://github.com/NVlabs/GEM-X/issues/4), [#20](https://github.com/NVlabs/GEM-X/issues/20)) were against the previous release, whose config said `remove_fingers: true`. `native29` is `soma29_nofinger_v1` ([config](https://github.com/NVlabs/GEM-X/blob/main/docs/configs/motion_mixed_example.yaml)) (code). Quality of native77 fingers is not reported.

### Inferences

- For a free app, the user flow for SMPL-family models is: register on the Max Planck sites, download, import. RGB MoCap shows that as a working pattern with a Model Manager; nothing can be bundled.
- Rotation-only camera handling is the mainstream choice because predicted root velocity supplies translation. It means a dollying or tracking camera is partly misread as person motion; only DuoMo, PromptHMR and TRAM take full camera paths.
- Multi-person placement in one world is weak everywhere except PromptHMR-Vid and worldhmr-fastcam.

### Gaps

- FlowHMR and ExMR on fast motion and close-ups: no measured category found.
- GVHMR weights' location was not re-checked in this pass.
- Licence terms were read for ExMR, FlowHMR weights, GVHMR, PromptHMR (opening only) and SAM (opening only); DuoMo's `LICENSE.pdf` and CoMotion's model licence were not read.

---

## 3. Real VRAM and speed. What runs on 8 GB, 32 GB RAM? What is better at 12, 16, 24 GB? Anything CPU-only?

### Takeaway

On the 8 GB floor the realistic candidates are GVHMR, ExMR and FlowHMR through RGB MoCap-style low-memory modes, plus SAM 3D Body through sam3d.cpp. Nobody has reported any of these on an 8 GB card, so the floor is unproven. Dense moving-camera FlowHMR is the real memory hog, at 24 to 31 GB. "SAM 3D Body needs over 24 GB" is an upstream code limit, not the model's. No good CPU-only option was found.

### Cited Findings

**Whole-pipeline measurements.** RGB MoCap, RTX 5090 32 GB, Ryzen 9 9950X, 96 GB RAM, Windows, October 2026 ([USER_GUIDE](https://github.com/toyxyz/toyxyz_RGBMocap/blob/main/docs/USER_GUIDE.md) lines 357-369, user). VRAM is peak PyTorch **allocated**, not total; the table predates later speedups; FlowHMR used original SAM:

| Clip | Model | Time | Peak VRAM GiB | Peak RAM GiB |
|---|---|---|---|---|
| 7 s | ExMR | 1m 08s | 11.32 | 19.31 |
| 7 s | FlowHMR | 2m 49s | 14.89 | 22.19 |
| 7 s | GVHMR + add-ons | 2m 01s | 5.08 | 12.47 |
| 25.7 s | ExMR | 1m 44s | 11.32 | 19.31 |
| 25.7 s | FlowHMR | 7m 32s | 10.67 | 16.94 |
| 25.7 s | GVHMR + add-ons | 3m 00s | 5.08 | 12.42 |
| 14.1 s, 2 people | PromptHMR | 3m 56s | 4.61 (7.83 reserved) | 8.74 |

Low Memory mode, 60 frames, same PC ([PERFORMANCE](https://github.com/toyxyz/toyxyz_RGBMocap/blob/main/docs/PERFORMANCE.md), user): ExMR 5.68 to 3.87 GiB, FlowHMR 6.10 to 2.77 GiB (SAM and VGGT blocks offloaded to CPU), GVHMR no meaningful change at 4.20 GiB. These are short clips and do not establish long-video capacity (their own warning).

**ExMR**: author says "about 8 GB", 7.4 GB peak on a 1080x1920 video, RTX 4090, Linux ([INSTALL](https://github.com/twehrbein/ExMR/blob/main/docs/INSTALL.md), card). RTX 4090, 37 s, 1122 frames: `fast` 1m 3s, `balanced` 1m 17s, `accurate` 2m 58s ([README](https://github.com/twehrbein/ExMR), card). Stage medians: 153 ms per frame with Sapiens2-1B at 1024×768, 37 ms with RTMW-x, and accuracy barely changes (Table S1-S2, paper). `fast` mode uses the ONNX RTMW-x, 2.11 ms per frame.

**FlowHMR**, A100 80 GB, NVML including caches ([performance.md](https://github.com/flowhmr/flowhmr/blob/main/docs/performance.md), card):

| Camera | SAM path | Total, 300 frames | VRAM GiB |
|---|---|---|---|
| Static | Original | 166.90 s | 6.16 |
| Static | Lite + compile, chunk 32 | 27.22 s | 10.82 |
| VGGT, interval 10 | Lite + compile | 29.47 s | 17.22 |
| VGGT, interval 1 | Lite + compile | 53.97 s | 31.76 |

SAM alone: Original chunk 1 is 154.45 s at 4.10 GiB; Lite chunk 4 is 34.71 s at 5.02 GiB; chunk 8 is 26.26 s at 6.02 GiB; chunk 16 is 21.77 s at 8.01 GiB. Peak allocated during VGGT was 24.08 GiB ([issue #4](https://github.com/flowhmr/flowhmr/issues/4), card). Generation alone is 1.99 GiB at 300 frames, and query-batched attention takes 3,600 frames from 13.87 to 2.78 GiB (card). A user ran it on an RTX 3060 12 GB and found it slower than GVHMR or GEM-X ([issue #7](https://github.com/flowhmr/flowhmr/issues/7), user); part of that was the web timer counting manual person selection (card).

**Limit on 32 GB RAM**: RGB MoCap stopped with "FlowHMR flow_camera needs about 30.0 GiB of available RAM including a desktop reserve" ([issue #6](https://github.com/toyxyz/toyxyz_RGBMocap/issues/6), user) **[app]**, a safety check around VGGT.

**GEM-X upstream**: no VRAM figure published; card lists A100 80 GB. Config runs Pose and observation at batch 4 and loads models by stage ([yaml](https://github.com/NVlabs/GEM-X/blob/main/docs/configs/body_video_native77.yaml), code). A third-party README asks for "8 GB+" ([video2mocap](https://github.com/freddysae0/video2mocap), user, not a measurement). Old ONNX demo, 300 frames, GPU unstated: detection 12.3 s, ViTPose 4.5 s, SAM features 8.2 s, denoiser 1.3 s ([issue #8](https://github.com/NVlabs/GEM-X/issues/8), card).

**SAM 3D Body**: a team member says "certain inputs push memory usage above 24 GB" ([issue #136](https://github.com/facebookresearch/sam-3d-body/issues/136), card). Against that: FlowHMR runs its features at 4.10 GiB, sam3d.cpp peaks at 4,472 to 4,686 MiB device memory including the desktop ([BODY_PERFORMANCE.md:43,139](https://github.com/localai-org/sam3d.cpp/blob/main/reference/BODY_PERFORMANCE.md), code), and SAM3DBody-cpp runs on a 6 GB RTX 1000 Ada at 273 ms or 170 ms with TensorRT ([README](https://github.com/AmmarkoV/SAM3DBody-cpp), card). So the 24 GB figure is the **[engine]** (upstream PyTorch path), not the **[model]**. A Blender add-on author saw about 17 GB on an RTX 3090 and others 12 GB ([Patreon, search result only](https://patreon.com/posts/157553368), user).

**SAM-Body4D** on an H800: 14.49 GB for 1 person, 40.87 to 53.28 GB for 5 people; occlusion refinement raises 5-person time from about 3 to 26 minutes ([resources.md](https://github.com/gaomingqi/sam-body4d/blob/main/assets/doc/resources.md), card).

**FPS across methods** on one RTX 6000 Ada ([OnlineHMR Table 3](https://arxiv.org/abs/2603.17355), paper): TRACE 24.6, GLAMR 17.2, GVHMR with DPVO 12.1, WHAM with DPVO 9.3, Human3R 4.8, OnlineHMR 3.3, TRAM 2.1, SLAHMR 0.1. Fast SAM 3D Body: about 7 fps on a 4090 by one user ([#8](https://github.com/NVlabs/GEM-X/issues/8), user), ~65 ms latency on an RTX 5090 (card).

**By card tier** (assembled from the above, unmeasured on these cards):

| VRAM | What fits |
|---|---|
| **8 GB, 32 GB RAM** | GVHMR (5.08 GiB with add-ons, 2.82 GiB without, RAM 12.5). ExMR Low Memory (3.87 GiB on 60 frames, author says 7.4 GB peak, RAM up to 19.3). FlowHMR Low Memory (2.77 GiB on 60 frames, including camera estimation, RAM risk above). SAM 3D Body via sam3d.cpp (about 4.5 GiB including desktop). PromptHMR tight (7.83 reserved). gem-x.cpp live: 3.96 GB of F32 weight files alone, unmeasured |
| **12 GB** | ExMR Automatic near its recorded 11.32. FlowHMR static with Lite chunk 8 to 16. A real user report exists on RTX 3060 12 GB |
| **16 GB** | FlowHMR static at full speed (10.82). VGGT interval 10 still over by about 1 GB without offload |
| **24 GB** | FlowHMR moving camera at sparse sampling. Dense VGGT still exceeds it upstream (24.08 allocated, 31.76 NVML); offload changes that (3.14 GiB on 9 images, 3.3× slower) |

**CPU-only**: SAM3DBody-cpp documents 5 to 15 s per frame for the backbone on a modern laptop CPU, "impractical" for video (card). gem-x.cpp's temporal net is fine on CPU (113.5 ms for 120 frames, 2 cores), but its ViT-H inputs are not (see section 4) (code/card). MoCapAnything "works but is slow" on CPU ([installer README](https://github.com/pixelartistry/PixelArtistry-MoCapAnything), user).

### Inferences

- On 8 GB, the blocking stage is the ViT-H encoder at batch size above 1, not the motion model. Lower batch, offload and CPU-first loading are the known levers.
- An 8 GB run needs staged loading: gem-x.cpp offline holds 3.96 GB plus 4.29 GB of F32 weights in total, more than the card if resident together. The demo runs the body worker as a separate process, so staging looks natural (reading of `demo/README.md`, not a measurement).
- A 30 s clip at 30 fps (900 frames) through a ViT-H on CPU at 5 to 15 s per frame takes about 1.25 to 3.75 hours per encoder pass, and these pipelines run at least one such encoder plus a keypoint model. That is arithmetic from the documented figure.

### Gaps

- **No report found of any top model on an RTX 2070 Super or any 8 GB card.** Every 8 GB row above is inference from stronger cards.
- GEM-X upstream VRAM has no number anywhere found.
- Peak-allocated PyTorch figures understate real board use; driver and desktop overhead are extra.
- Multi-minute clips: FlowHMR's RAM and VRAM growth is partly addressed by query batching; ExMR long-clip VRAM not reported.

---

## 4. Is there a runtime without Python? How complete is each port?

### Takeaway

**gem-x.cpp** and **sam3d.cpp** are real GGML ports with CPU and Vulkan, tested against upstream, and fit the family's engine pattern. But gem-x.cpp ports the *previous* GEM-X, hard-codes a static camera, is capped near 120 frames in tested parity, and is Linux-tested only. **SAM3DBody-cpp** is not a GGML port of the network: its backbone needs ONNX Runtime with CUDA. No port of ExMR, FlowHMR, GVHMR or PromptHMR was found.

### Cited Findings

**gem-x.cpp** ([localai-org/gem-x.cpp](https://github.com/localai-org/gem-x.cpp), Apache-2.0, 61 stars, pushed 2026-10-19). C++23, GGML, Go demo. Read: README, `demo/README.md`, `docs/IMPLEMENTATION.md`, `docs/LIVE-OFFLINE-PARITY.md`, `docs/LICENSING.md`, `distribution/README.md`, `include/gemx.h`, `tools/pipeline.cpp`, `src/live.cpp`.

What is complete (code):
- YOLOX-X detection, ByteTrack, ViTPose (DINOv3 ViT-H, 77 heatmaps), the GEM temporal network, the contact head, contact/IK grounding, SOMA forward kinematics, animated GLB export, SOMA-to-SMPL-joints adapter (positions only).
- Runs on CPU and Vulkan with no Python or CUDA at runtime.
- Parity against upstream on a pinned 72-frame clip, strict F32: mean joint error 0.877 mm offline pelvis-relative, 3.496 mm world, 0.984 mm live. It "does not establish bit-exact parity" and is not a quality measurement ([parity report](https://github.com/localai-org/gem-x.cpp/blob/main/docs/LIVE-OFFLINE-PARITY.md)).

What is missing or limited:
- **Old model** **[engine]**: pinned to GEM-X revision `32992550`: 585-D output, 33 observed joints, SAM 3D Body features ([IMPLEMENTATION.md](https://github.com/localai-org/gem-x.cpp/blob/main/docs/IMPLEMENTATION.md)). Upstream's 2026-10-20 release is native77 with 655-D output and its own Body Pose model ([yaml](https://github.com/NVlabs/GEM-X/blob/main/docs/configs/body_video_native77.yaml)). GGUFs stay on `LocalAI-io/GEM-X-GGUF`; the old checkpoint survives only at old revision `5ccf5ca`.
- **Static camera only** **[engine]**: [`tools/pipeline.cpp:376-381`](https://github.com/localai-org/gem-x.cpp/blob/main/tools/pipeline.cpp) fills `angular` with the identity rotation, "Static camera motion is the identity rotation"; `src/live.cpp:148-151` does the same. No SIFT, homography or VO exists in the port. Moving-camera world output will be wrong even though the model accepts rotations.
- **Length** **[engine]**: offline fixtures to 120 frames; the API takes up to 4096 with consecutive windows, "not equivalent to upstream overlapping local attention"; the demo limits clips to 120 frames ([model card](https://github.com/localai-org/gem-x.cpp/blob/main/distribution/README.md)). That is 4 seconds at 30 fps.
- **Live mode has no world path**: it omits SAM 3D Body, contact refinement and world trajectory; "Rolling-window translation is not a continuous world trajectory" ([MOTION-STREAMING.md:111](https://github.com/localai-org/gem-x.cpp/blob/main/docs/MOTION-STREAMING.md)).
- **Skeleton only**: GLB has no mesh. No EgoHand path. Dominant single track.
- **Platform** **[engine]**: "Linux is the tested platform"; CI is Ubuntu only. `CMakeLists.txt` has no WIN32 branch (grep), no POSIX includes in `tools/pipeline.cpp` or `src/live.cpp`, and no `syscall` in `demo/live.go` or `process.go`. A Windows build is unverified.
- **Speed is tuned for one card** **[engine]**: custom Vulkan ViTPose kernels are guarded to RTX 5070 Ti, F32 and fixed shapes ([VITPOSE-DEFAULTS.md:15](https://github.com/localai-org/gem-x.cpp/blob/main/docs/VITPOSE-DEFAULTS.md)); other GPUs use generic GGML kernels, speed unknown.
- Measured on RTX 5070 Ti (card): live 15.35 fps; denoiser 3.38 ms for 120 frames on Vulkan, 113.5 ms on 2 CPU cores; ViTPose plus flip 33.1 ms at batch 2; YOLOX 27.5 ms.
- Weight files: `gem-x-contact-f32.gguf` 0.18 GB, `vitpose-f32.gguf` 3.39 GB, `yolox-f32.gguf` 0.40 GB (HF API). F32 only: "not low-bit quantization".

**sam3d.cpp** ([localai-org/sam3d.cpp](https://github.com/localai-org/sam3d.cpp), Apache-2.0, 54 stars, pushed 2026-10-19). Pose branch to MHR mesh on CPU and Vulkan, without Python, CUDA or llama.cpp. Also an experimental SAM 3D Objects path.
- "Video uses independent frame estimates, not a learned temporal model" ([README](https://github.com/localai-org/sam3d.cpp)) **[model]**.
- "Detailed hand refinement remains outside the current supported scope" **[engine]**.
- 640 of 646 strict CPU comparisons pass, six remain open ([ROADMAP](https://github.com/localai-org/sam3d.cpp/blob/main/docs/ROADMAP.md)). BF16 has a recorded hand-logit difference.
- Warm BF16 85.8 ms against 81.6 to 84.5 ms upstream CUDA; live 8.1 Hz on the profiled NVIDIA GPU. BF16 fast path needs "supported NVIDIA GPUs".
- No person detection, calibration or tracking in the library **[engine]**: roadmap future work.
- README says converted downloads were not yet published, but `LocalAI-io/sam-3d-body-dinov3-GGUF` exists (HF API): `body-dinov3-f32.gguf` 3.36 GB, branch 0.23 GB, MHR 0.69 GB. The README line looks stale.

**SAM3DBody-cpp** ([AmmarkoV/SAM3DBody-cpp](https://github.com/AmmarkoV/SAM3DBody-cpp), MIT code, 707 stars, pushed 2026-10-19). The Python-free label is true, the GGML label is thin:
- Backbone and decoder run in **ONNX Runtime with the CUDA execution provider**; only the small FFN heads run in ggml on CPU ([README pipeline diagram](https://github.com/AmmarkoV/SAM3DBody-cpp)) (card). BF16 graphs have "no CPU BF16 path" ([DEPENDENCIES.md:21](https://github.com/AmmarkoV/SAM3DBody-cpp/blob/main/knowledge/DEPENDENCIES.md)); FP32 CPU models are separate downloads.
- No Vulkan or DirectML provider: grep of `CMakeLists.txt` and `DEPENDENCIES.md` found only CUDA and TensorRT **[engine]**.
- Useful extras: multi-person with an IoU tracker, BVH per person, MPEG ARF, an offline five-pass smoother with scene-cut detection, `--refined-pose` hand crops.
- Windows: headless MSVC build **[engine]**; PRs #13 and #17 for a fuller port are open.
- A user reports results not aligning with official SAM 3D Body; the author reproduces and attributes it to a "substantial rewrite" ([#15](https://github.com/AmmarkoV/SAM3DBody-cpp/issues/15), user). Fingers barely move on a hard clip; author blames the network ([#7](https://github.com/AmmarkoV/SAM3DBody-cpp/issues/7), user).
- Speed: RTX 3090 backbone 150 to 200 ms; RTX 1000 Ada 3.7 fps, 5.9 fps with TensorRT (card).
- `Saganaki22/SAM3DBody_Desktop` wraps it in a Windows Tauri app (GitHub search, not read).

**ONNX only**: `twehrbein/ExMR` ships RTMW-x ONNX (2D only). `nvidia/GEM-X` ships `onnx/vitpose.onnx` at HEAD and had `gem_denoiser.onnx`, `sam3db_backbone.onnx` at old revision `5ccf5ca` (HF API). Also `peasanttide/sam-3d-body-decoder-fp32`, `gok11/sam-3d-body-onnx`, `KitsuMate/sam-3d-body-onnx` (HF search, unread). `embedl/sam-3d-body` is gated, unread. ComfyUI carries a bf16 and an INT8 ConvRot SAM 3D Body checkpoint (`Comfy-Org/sam-3d-body`), and its native nodes (merged 2026-08-23) include smoothing, SAM 3.1 tracking, GLB and BVH export. World motion is not mentioned ([wiki](https://comfyui-wiki.com/en/news/2026-08-23-sam-3d-body-native-comfyui)). That is PyTorch, not a port.

### Inferences

- Fixing gem-x.cpp for the family means three pieces of work: add a camera-rotation estimator (GEM-X's own is about 240 lines of Python and OpenCV, `gem/inference/camera_motion.py`), lift the 120-frame limit with upstream's windowing, and prove a Windows build. Upgrading to native77 is a fourth, larger piece, as it also needs the new Body Pose model. Not costed here.
- Since sam3d.cpp already holds the most expensive stage of ExMR and FlowHMR, a GGML port of those temporal nets looks small compared with what is already done: ExMR's model file is 236 MB and its transformers cost 0.02 ms per frame. This is a method-level reading: the weights would stay non-commercial, it needs a keypoint model and HaMeR too, and FlowHMR is 0.46B parameters with 20 sampling steps. Nobody has done it, and whether sam3d.cpp's feature mode matches what they consume is unverified.
- An ONNX Runtime path with DirectML or Vulkan would need new work; the BF16 graphs would not transfer.

### Gaps

- No port of ExMR, FlowHMR, GVHMR, PromptHMR or DuoMo found. Searched HF API and GitHub for these names plus onnx, cpp, ggml; one plain search for a GVHMR ONNX export returned nothing relevant. That is a gap in the search, not proof none exist.
- gem-x.cpp and sam3d.cpp on a non-5070 Ti GPU, and on Windows: no report found.
- gem-x.cpp source below the files listed was not read line by line.

---

## 5. Independent evidence: does anyone other than the authors compare these?

### Takeaway

Yes, a little, and it is the most useful evidence here. RGB MoCap is an independent subjective comparison with measured VRAM. Motius is a same-protocol third-party leaderboard, which shows the old GEM-X well behind SMPL models. A clinical paper pits GEM-X against SAM 3D Body. Reddit could not be reached.

### Cited Findings

- **RGB MoCap**, Windows app by toyxyz, MIT, created 2026-10-26, 460 stars, one test PC, subjective:
  - FlowHMR "gave the best overall motion quality", slower than ExMR ([guide](https://github.com/toyxyz/toyxyz_RGBMocap/blob/main/docs/models/FLOWHMR.md)).
  - ExMR is the default: "generally fast with good motion quality" ([guide](https://github.com/toyxyz/toyxyz_RGBMocap/blob/main/docs/models/EXMR.md)).
  - GVHMR "lower than ExMR/FlowHMR, but some unusual poses, including backflips, were better" ([guide](https://github.com/toyxyz/toyxyz_RGBMocap/blob/main/docs/models/GVHMR.md)).
  - PromptHMR better for multi-person contact, "overall motion quality was lower than ExMR" ([guide](https://github.com/toyxyz/toyxyz_RGBMocap/blob/main/docs/models/PROMPTHMR.md)).
  - They warn this is "not a universal accuracy ranking". GEM-X is not in the app. ExMR's author thanks them in [issue #12](https://github.com/toyxyz/toyxyz_RGBMocap/issues/12), so they are independent but friendly.
- **Motius leaderboard**, third party, updated 2026-07-28, 3DPW, 15-joint common subset, not comparable with paper numbers ([json](https://github.com/ZeyuLing/Motius/blob/main/docs/leaderboards/hf_space_monocular_capture/monocular_capture_results.json), user):

  | Method | PA-MPJPE | MPJPE | Accel |
  |---|---|---|---|
  | PromptHMR-Video (full-frame multi-person, not ranked) | 46.17 | 64.50 | 4.80 |
  | GEM-SMPL | 46.45 | 64.46 | 5.71 |
  | GVHMR | 47.66 | 62.65 | 5.47 |
  | GEM-X (pre-October, SOMA) | 53.20 | 84.38 | 5.62 |

  Their card notes the official demo produced an identity camera on that run, so world ranking was unavailable.
- **A user's SOMA-to-SMPL test** of the old GEM-X: EMDB-1 108.1 / 48.4, 3DPW 69.6 / 39.0, bodies about 15% too large ([issue #30](https://github.com/NVlabs/GEM-X/issues/30), user). No maintainer answer yet.
- **Clinical joint angles**, Babon Innovations and HU Utrecht, no NVIDIA or Meta authors, on OpenCap lab data: GEM-X 4.50° mean error, SAM 3D Body 4.66°, "statistically indistinguishable"; GEM-X better at ankle and pelvis tilt, SAM better at trunk and knees ([paper, appendix C](https://arxiv.org/abs/2607.17639)). Old GEM-X; lab gait, not film motion.
- **Cross-method re-runs by other authors**: ExMR re-ran SAM 3D Body's released checkpoint and got slightly worse than Meta's reported numbers on all three sets (Table VIII). DreamHMR re-ran GENMO, PromptHMR-Vid, SMPLest-X and SAM 3D Body under one protocol (Table 1). FlowHMR re-ran GVHMR, PromptHMR, GENMO and DuoMo. Each is a competitor's test, so independent of the method tested but not disinterested.
- **Short user opinions**: a user who tried both says SAM 3D Body hands are usable but its body is worse than GVHMR, and "gvhmr is already quite good", wanting hands ([GEM-X #7](https://github.com/NVlabs/GEM-X/issues/7)). Another calls GEM-X "basically a video support for SAM3D Body", with "great result" ([SAM 3D Body #32](https://github.com/facebookresearch/sam-3d-body/issues/32)). A QtMeshEditor PR found SAM's pose is camera-relative, so a tilted camera makes the subject look leaned over ([PR #1118](https://github.com/fernandotonon/QtMeshEditor/pull/1118), search summary only).
- **Commercial tools** (Move.ai s2, QuickMagic, DeepMotion, Rokoko Vision, RADiCAL) surfaced from broad searches; all vendor or affiliate content. Belongs to the apps researcher.

### Inferences

- GEM-X's marketing position needs care. The previous release lost to GVHMR by about 22 mm MPJPE in the only same-protocol independent test, which fits its synthetic-only training and over-sized bodies. Whether native77 fixes this is unknown. Test before relying on it.
- Weight the RGB MoCap verdicts as one skilled user's eye on one PC. Nothing else compares ExMR and FlowHMR at all.

### Gaps

- **Reddit was not reachable**: WebSearch refuses reddit.com as a domain filter, WebFetch cannot fetch it, and `curl` got a block page. Searches with subreddit names returned no threads. This is a gap in the search, not evidence of no discussion.
- X, YouTube and Bilibili comparisons were not searched beyond plain queries.
- No independent test of GEM-X's 2026-10-20 release, of DuoMo beyond FlowHMR's table, or of ExMR's benchmark claims. ExMR is ten days old.

---

## 6. The pasted claims

### Takeaway

"WHAM is the gold standard" is false today. The SAM 3D Body claim is true for hard poses, weak for "significantly" on standard body benchmarks, and unsupported for close-ups and hand-to-face. "Swap EasyMocap's base engine" is the wrong shape of idea.

### Cited Findings

**"WHAM is the gold standard for video tracking." False.**
- Far behind on EMDB world error: WA 135.6, W 354.8, RTE 6.0 against TRAM 76.4, 222.4, 1.4 and DuoMo 67.6, 171.6, 1.2 ([DuoMo Table 4](https://arxiv.org/abs/2603.03265), paper).
- Behind every recent temporal method in camera space too: EMDB-1 MPJPE 79.7 against ExMR's 64.1 (ExMR Table VIII, paper).
- Code last pushed 2024-04-18, 83 open issues (GitHub API). FlowHMR's Wild-4K comparison leaves it out.
- It may have been a fair statement in early 2024; that is a guess, no source was found calling it the gold standard.

**"SAM 3D Body handles extreme close-ups, hand-to-face interactions and complex poses with significantly higher accuracy than old SMPL-based models." Partly true.**
- *Complex poses, true by Meta's own numbers*: inverted body aPCK 78.18 vs CameraHMR 46.12; very hard 3D poses PVE 114.2 vs 213.66 ([paper Tables 5-6](https://arxiv.org/abs/2602.15989), paper).
- *Standard body benchmarks, small*: 3DPW PA-MPJPE 33.8 vs NLF-L+fit 33.6; EMDB-1 38.2 vs 40.9 (ExMR Table VIII). ExMR's re-run of the released checkpoint gives 35.1 and 39.6.
- *Extreme close-ups, not shown*: the paper's text has no "close-up" term. Its nearest category, upper-body truncated, is 64.49 vs CameraHMR 62.37 (aPCK body), a small gain. Lower-body truncated is a big one: 61.95 vs 39.27.
- *Hand-to-face, not shown*: no such category in the paper. "Self-occluded hands" 80.07 vs 73.22 is the nearest.
- *Hands in general*: best among per-frame methods in ExMR's Table I, but hands jitter (32.4 vs ExMR 5.2 on ARCTIC) and SMPL has no hands to compare.
- The claim also leaves out that it is a single-image model: no video support ([issue #32](https://github.com/facebookresearch/sam-3d-body/issues/32)), Accel 14.0 m/s² against 4.1 for ExMR, no world position.

**"Swap EasyMocap's base engine for one of these two." Not a meaningful swap.**
- EasyMocap's single-video mode fits SMPL to 2D keypoints with CNN initialisation, using SPIN and HRNet ([README lines 50, 178-184](https://github.com/zju3dv/EasyMocap), card). Its strength is multi-view fitting. Its last code change was 2026-03-01, then a licence swap to Project Registration License v1.0 on 2026-09-15 ([LICENSE](https://github.com/zju3dv/EasyMocap/blob/master/LICENSE)).
- WHAM and SAM 3D Body are full estimators, not plug-ins, and output SMPL and MHR respectively. Dropping one in removes most of what EasyMocap's video mode does.
- The field has already done the sensible version: SAM 3D Body's encoder feeds temporal models (ExMR, FlowHMR, GEM-X). WHAM's approach has been superseded by those.

### Inferences

- The claim text reads like an AI summary from 2024-25 updated with one 2025 model. Neither named tool is the right pick today for body-plus-hands in the world.

### Gaps

- No search result found anyone doing an EasyMocap swap in practice.
- Numbers for `truncation:severe` in SAM 3D Body Table 6 were not extracted.

---

## 7. Query log

Tools: WebSearch, WebFetch, GitHub API (`gh`), Hugging Face API, raw GitHub files, arXiv HTML. All on 2026-10-31.

**Plain web searches:**

| Query | Mode | Result |
|---|---|---|
| best latest mocap models single camera | extended | Vendor lists (Move.ai s2, QuickMagic, Rokoko, RADiCAL, DeepMotion), EasyMocap forks. No research models |
| best video to motion model 2026 | extended | Dead end: all generative video (Seedance, Kling, Veo, Wan) |
| new human motion capture from video monocular 2026 world-grounded | extended | **Useful**: GVHMR TPAMI, OnlineHMR, FlowHMR, Natural Human Motion Recovery, BeyondRetarget, EgoExoMoCap |
| best open source markerless mocap from single video reddit | standard | No Reddit. EasyMocap, FreeMoCap (multi-camera), OpenPose |
| SAM 3D Body vs GVHMR comparison video mocap | extended | **Useful**: RGB MoCap, video2mocap, clinical paper, Fast SAM, 4DAnyone PR, Mocap-2-to-3 |
| ExMR vs FlowHMR vs GEM-X mocap reddit | standard | ExMR card, GEM-X forks, GENMO, Motius cards. No Reddit |
| free AI motion capture from video open source 2026 GEM-X GVHMR ComfyUI results | extended | SEO roundups, FreeMoCap, EasyMocap, physics paper 2601.19036. Nothing on the named models |
| reddit best local video to mocap ... (allowed_domains reddit.com) | standard | **Failed**: tool refuses reddit.com |
| DuoMo human motion monocular video arXiv code | standard | Paper, CVPR page. Search said no repo; project page linked `facebookresearch/DuoMo` |
| EMDB-2 WA-MPJPE W-MPJPE RTE comparison ... 2026 | standard | **Useful**: WildHSR, OnlineHMR, Human3R, GENMO, BEDLAM2 |
| SAM 3D Body VRAM requirement out of memory GPU video inference | standard | Patreon add-on note; otherwise SAM 3 or Objects, off target |
| GVHMR ONNX export C++ inference without Python | standard | Dead end: generic ONNX pages |
| WHAM gold standard video mocap vs GVHMR TRAM ... | standard | WHAM, GVHMR, OnlineHMR papers. Nobody calls it the gold standard |
| video to BVH open source new model October 2026 monocular motion capture hands | extended | MoCapAnything V2, ExMR, Motius-FlowHMR, Mocapy, RunPod GVHMR worker |
| SIGGRAPH Asia 2026 monocular human motion capture world coordinates code released | standard | Mostly old; 2512.21573 World-Coordinate Retargeting via SAM 3D Body |
| latest techniques human mesh recovery video 2026 hands whole-body temporal SMPL-X arXiv | extended | **Useful**: DreamHMR, DanceHMR, SAM-Body4D, Multi-HMR 2 |
| r/StableDiffusion SAM 3D Body mocap ComfyUI video animation retarget | standard | ComfyUI wiki and docs. No Reddit |
| GEM-X NVIDIA review test results motion capture Blender video tutorial | standard | Cards, BlendCap on 80.lv. No independent review |
| RGB MoCap toyxyz ExMR FlowHMR Windows app review | standard | Dead end: unrelated |
| EasyMocap replace base model GVHMR WHAM SAM 3D Body monocular upgrade | standard | Nothing on EasyMocap; 4DAnyone, Fast SAM |

**Fetches**: arXiv abs or HTML for 2605.18102, 2610.26213, 2610.03691, 2603.03265, 2603.17355, 2609.29106, 2607.17639, 2602.15989, 2603.15603, 2610.20124, 2606.14841, 2610.19729. docs.comfy.org SAM 3D Body page, comfyui-wiki news page, DanceHMR project page, DuoMo project page. The arXiv PDF fetch of 2603.15603 failed (over size limit), abstract used. Reddit: WebFetch failed; `curl` search.json returned a Blocked page.

**GitHub search** (`gh search repos`): gem-x.cpp (found localai-org and a one-star fork riyad242514), SAM3DBody-cpp-onnx (empty), "sam 3d body", "sam3d body onnx cpp" (empty), SAM3DBody, sam3d.cpp, dancehmr (empty), MoCapAnything, TopoCap, OnlineHMR, WildHSR, Mocap-2-to-3, duomo dual motion diffusion (empty), DreamHMR, motius, multi-hmr2, "CAST motion capture any skeleton topology" (empty). A sweep of "monocular motion capture", "human motion recovery video", "video mocap smpl world" sorted by stars with pushes after 2026-05 returned nothing (filter or search quality); "video to bvh" returned only MediaPipe wrappers. A code-search batch for `_WIN32` and similar hit the rate limit, so raw files were grepped instead.

**Hugging Face API**: models by name for nvidia/GEM-X (and revision `5ccf5ca`), EgoHand-v1, SOMA-X, facebook/sam-3d-body-dinov3, Comfy-Org/sam-3d-body, fafsaf1/flowhmr-0.46B, twehrbein/ExMR, kehong/MoCapAnythingV2-weights, CAST-mocap/CAST, LocalAI-io GGUFs, AmmarkoV ONNX. Search "sam-3d-body" (22 repos), "mocapanything", "dancehmr" (empty), "dreamhmr" (empty), "duomo" (unrelated), "motion capture", "mocap". Searches "human mesh recovery", "video to motion", "world-grounded" returned nothing.

**GitHub repos read** (README plus named files): NVlabs/GEM-X, localai-org/gem-x.cpp, localai-org/sam3d.cpp, AmmarkoV/SAM3DBody-cpp, twehrbein/ExMR, flowhmr/flowhmr, toyxyz/toyxyz_RGBMocap, facebookresearch/DuoMo, facebookresearch/sam-3d-body (issues), zju3dv/GVHMR, yufu-wang/PromptHMR, yufu-wang/tram, yohanshin/WHAM, NVlabs/GENMO, NVlabs/SOMA-X, gaomingqi/sam-body4d, yangtiming/Fast-SAM-3D-Body, phongdaot/MocapAnything, CAST-mocap/CAST, czpcf/TopoCap, chien90190/worldhmr-fastcam, freddysae0/video2mocap, fanegg/Human3R, apple/ml-comotion, Tsukasane/Video-OnlineHMR, jerrinbright/WildHSR, WangZhumei/Mocap2to3, PozzettiAndrea/ComfyUI-MotionCapture (GVHMR wrapper, GPL-3.0), zju3dv/EasyMocap, ZeyuLing/Motius (leaderboard JSON and cards). Issue trackers read: GEM-X, FlowHMR, ExMR, RGB MoCap, SAM3DBody-cpp, DuoMo, and SAM 3D Body by search.

**Files fetched to the scratchpad for reading only, nothing executed**: text copies of papers and docs under `F:\ClaudeCode\tmp\claude\E--Dev-Web\6501f898-7efc-4755-8eb3-1123a3af6862\scratchpad`.
