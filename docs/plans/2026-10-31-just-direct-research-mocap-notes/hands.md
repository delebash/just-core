# Hands: stable hand and finger capture from one camera (JustDirect mocap)

Researched 2026-10-31. Evidence labels: **code** (read in source), **card**, **paper**, **user**, **vendor**. Paper and vendor numbers are the authors' claims unless a third party re-ran them. Limit layers: **model**, **engine**, **app**. Line numbers are from each repo's default branch as read today.

Nothing was measured on this PC. Nothing was installed, downloaded as weights, or run on the GPU. Every VRAM and speed number below is someone else's.

Metrics are not comparable across papers. Units differ (mm/frame², m/s², m/s³, unnamed), and so do datasets and camera setups. Read each table only inside itself.

## Why exactly do MediaPipe hands jitter?

### Takeaway
The main cause is in the pipeline, not one bad output. Each frame the landmark model runs alone on a 224x224 crop, that crop is built from the previous frame's own landmarks, and MediaPipe filters pose landmarks but has no filter stage for hands. The model and output format add to it: direct regression, depth learned only from synthetic data, no rotations, and a hand that vanishes all at once.

### Cited Findings
- **Layer: pipeline.** The hand graph has no smoothing. A grep for `smoothing|one_euro|velocity_filter` gives 0 hits in `hand_landmarker_graph.cc`, `hand_landmarks_detector_graph.cc`, `hand_roi_refinement_graph.cc`, `hand_landmark_tracking_cpu.pbtxt` and `hand_landmark_cpu.pbtxt`. **code** — [hand_landmarker folder](https://github.com/google-ai-edge/mediapipe/tree/master/mediapipe/tasks/cc/vision/hand_landmarker)
- **Layer: pipeline.** Pose does get filtered. `pose_landmark_filtering.pbtxt` lines 104-124 and 174-194 run `LandmarksSmoothingCalculator` with a One Euro filter (min_cutoff 0.05, beta 80), and the Tasks `pose_landmarks_detector_graph.cc` has 14 `smooth` hits. So part of the gap between smooth bodies and jittery hands is by design. `holistic_landmarker_graph.cc` has 0 hits. **code** — [pose_landmark_filtering.pbtxt](https://github.com/google-ai-edge/mediapipe/blob/master/mediapipe/modules/pose_landmark/pose_landmark_filtering.pbtxt)
- MediaPipe ships the filters, unwired for hands: `calculators/util/landmarks_smoothing_calculator.cc`, `multi_landmarks_smoothing_calculator.cc`, `multi_world_landmarks_smoothing_calculator.cc`, `util/filtering/one_euro_filter.cc`, `relative_velocity_filter.cc`. **code** — [one_euro_filter.cc](https://github.com/google-ai-edge/mediapipe/blob/master/mediapipe/util/filtering/one_euro_filter.cc)
- **Layer: pipeline, feedback crop.** `hand_landmarker_graph.cc` lines 276-285 and 347-374: frame t's landmarks become `hand_rects_next_frame`, pass through `PreviousLoopbackCalculator`, and become frame t+1's crop. The palm detector is skipped while enough hands are tracked (lines 143-145, 301-305). Centre, size and rotation of the crop all come from predicted landmarks: `ComputeRotation` uses wrist plus index, middle and ring PIP, and the rect is the bounding box of all landmarks. The rect is then scaled 2.0, shifted y by -0.1 and squared (`hand_landmarks_detector_graph.cc` lines 145-152). There is no filter anywhere in this loop. **code** — [hand_landmarker_graph.cc](https://github.com/google-ai-edge/mediapipe/blob/master/mediapipe/tasks/cc/vision/hand_landmarker/hand_landmarker_graph.cc), [hand_landmarks_to_rect_calculator.cc](https://github.com/google-ai-edge/mediapipe/blob/master/mediapipe/modules/hand_landmark/calculators/hand_landmarks_to_rect_calculator.cc)
- **Layer: pipeline.** In IMAGE mode, tracking is off entirely (lines 324-331), and IMAGE is the default `running_mode`. VIDEO and LIVE_STREAM reuse the previous box and rerun palm detection only when presence or tracking fails. **code**, **vendor** — [HandLandmarker docs](https://developers.google.com/edge/mediapipe/solutions/vision/hand_landmarker)
- **Layer: model.** Per-frame direct regression: "21 hand landmarks consisting of x, y, and relative depth", with no temporal input. Full has 1.98M parameters. **paper** — [MediaPipe Hands, arXiv 2006.10214](https://arxiv.org/abs/2006.10214)
- **Layer: model.** Depth is the weakest output: relative depth to the wrist was "learned only from synthetic images". The authors note that synthetic training gave "less jitter visually across frames", so visible jitter was already a known model-level concern. **paper** — [arXiv 2006.10214](https://arxiv.org/abs/2006.10214). SignAll, using it for sign language, reports the 2D data is more stable than the third coordinate. **vendor** — [Google developers blog](https://developers.googleblog.com/en/signall-sdk-sign-language-interface-using-mediapipe-is-now-available-for-developers/)
- **Layer: model input.** Crop is fixed at 224x224 (`hand_landmark_cpu.pbtxt` lines 47-48), palm detector at 192x192. **code**, **vendor**
- **Layer: output format.** Positions only: 21 landmarks plus world landmarks predicted per frame and rotated through the crop (`hand_landmarks_detector_graph.cc` lines 354-364). No rotations, no bone-length constraint, no fixed hand shape. An app must run its own IK, and bone lengths vary per frame. **code**
- **Layer: pipeline, lost hand.** Below the presence threshold the outputs are gated off (`AllowIf(..., hand_presence, graph)`, lines 331, 352, 364, 385), so a hand disappears at once. **code**. Independently, on Phoenix signing frames MediaPipe misses 20.22% left, 23.61% right and 8.84% both, and when lost all keypoints drop to zero confidence together. AlphaPose, MMPose, Sapiens, SDPose and SMPLest-X report 0% missing. **paper** — [O'Brien et al., arXiv 2604.24609](https://arxiv.org/abs/2604.24609)
- **Layer: pipeline, Holistic.** Holistic builds the first hand crop from pose wrist, pinky and index, refines it with a 256x256 re-crop model, then switches to the same previous-frame loop. If the pose wrist is not visible, no hand is predicted that frame (`hand_landmarks_from_pose_cpu.pbtxt`, `GateCalculator` on `hand_visibility`). At full-body distance the hand depends on the pose model finding the wrist. **code** — [hand_landmarks_from_pose_cpu.pbtxt](https://github.com/google-ai-edge/mediapipe/blob/master/mediapipe/modules/holistic_landmark/hand_landmarks_from_pose_cpu.pbtxt)
- A third-party paper says Holistic's hand crop heuristic assumes the hand plane is parallel to the camera and breaks otherwise. **paper**, seen as a search snippet only — [Optimizing Hand Area Detection in MediaPipe Holistic](https://github.com/google/mediapipe/files/15219308/Optimizing_Hand_Area_Detection_in_MediaPipe_Holistic.pdf)
- Warudo adds a "Hand Y Threshold" that ignores a hand near the frame edge: "This helps to avoid jitter problems caused by unstable tracking." It recommends 30+ FPS, better light, and a Leap Motion Controller 2 for hands if budget allows. **vendor** — [Warudo docs](https://docs.warudo.app/docs/mocap/mediapipe)
- A moving average reduces position jitter but works less well on rotation. **paper**, small study — [Karsanusa](https://journalng.uwks.ac.id/karsanusa/article/download/644/373/3075)

### Inferences
- The feedback loop probably feeds noise back into the input: landmark noise moves the crop, and the moved crop changes the next prediction. The loop is **code**. The amplification itself is my hypothesis; no source I found measured it.
- If that holds, the right fix is to filter the crop before it feeds back, as well as filtering the output. EgoHand and GEM-X do exactly this for their crops (see the temporal stability question below).
- The missing-hand rate may be as big a visible problem as landmark noise, since a hand that vanishes and returns reads as a large jump. The sign-language paper does not analyse this link.

### Gaps
- The Oct 2021 model card PDF was downloaded, but its text could not be extracted because no PDF tool is installed. Its stated hand-size and distance limits are unread.
- Appendix B of arXiv 2604.24609 holds the full hand-only jitter table. Only the main text's hand values were retrieved.

## What are the best hand methods now, and how does each work?

### Takeaway
The newest strong options are temporal or filter-based: HandFlow (July 2026, learned temporal, MANO), EgoHand-v1 (October 2026, single-frame plus a published filter, no MANO needed), and ViDiHand (June 2026, video diffusion, release unconfirmed). WiLoR remains the best-documented single-frame MANO model. Nearly everything serious is egocentric or close-up, so third-person full-body use is mostly untested.

### Cited Findings

**Temporal video models that output rotations**
- **HandFlow** (arXiv 2607.11221, July 2026). Flow matching over a 16-frame window of MANO parameters, 3 Euler steps. Inputs are frozen HaMeR ViT-H tokens, 21 HaMeR 2D keypoints as camera rays, and per-frame detection confidence. Denoiser is 8 dual-stream plus 16 single-stream blocks. Long video uses overlapping windows blended during integration. Low-confidence frames lean on a learned mask token, and removing that weighting raised MPJPE 86%. **paper** — [arXiv](https://arxiv.org/abs/2607.11221). Fixed-camera mode `--fix_camera` skips SLAM. **code** — [repo](https://github.com/mxxu00/HandFlow)
- **ViDiHand** (arXiv 2606.30308, NeurIPS 2026 poster). Adapts the 1.3B-parameter Wan2.1-VACE video diffusion model to full frames, with a dual-branch decoder for MANO pose and camera translation, and no detector, infiller or test-time optimisation. **paper**, via search summaries; the abstract gives no numbers — [arXiv](https://arxiv.org/abs/2606.30308)
- **OmniHands** (arXiv 2405.20330, journal version TOG 2026 per a news listing). ViT-H crops at 256x192 for both hands, a relation map between them, a Bimanual Decoder, and 4D Interaction Reasoning over 9 frames sampled with a 5-frame gap. Outputs the middle frame, so it uses past and future. MANO. **paper** — [arXiv](https://arxiv.org/abs/2405.20330)
- **HaPTIC** (3DV 2026). Repurposes HaMeR to take several frames, adding cross-view self-attention across time and global cross-attention. Aimed at global trajectory. **paper** — [arXiv 2501.08329](https://arxiv.org/abs/2501.08329)
- **HaWoR**. WiLoR's frozen ViT plus temporal attention on image tokens and on MANO pose, then SLAM and an infiller. Built for egocentric world-space video. **paper** — [arXiv 2501.02973](https://arxiv.org/abs/2501.02973)
- **Dyn-HaMR**. Multi-stage optimisation with SLAM, an interacting-hand prior for infilling, and hierarchical initialisation. Offline. **paper** — [arXiv 2412.12861](https://arxiv.org/abs/2412.12861)
- **DanceHMR** (see the attachment question). Joint body and hand temporal model. No code or weights found. **paper**

**Single-frame models that output rotations**
- **EgoHand-v1** (arXiv 2610.30293, released 2026-10-21). DINOv3 ViT-H/16+ on a 256x256 crop, a parameter head for wrist plus 24 finger rotations, plus a separate 25-point 2D decoder with uncertainty and presence that refines lateral translation. Output is SOMA-Hand, not MANO. Trained on about 14M images. **paper**, **card**, **code** — [paper](https://arxiv.org/abs/2610.30293), [card](https://huggingface.co/nvidia/EgoHand-v1), [GEM-X MODEL_OVERVIEW](https://github.com/NVlabs/GEM-X/blob/main/docs/MODEL_OVERVIEW.md). GEM-X is explicit: "GEM does not include a learned Hand Motion model". **code** — [DEMO.md](https://github.com/NVlabs/GEM-X/blob/main/docs/DEMO.md)
- **WiLoR** (CVPR 2025). Detector plus a ViT with an image-aligned refinement module that samples per-vertex features to correct pose and shape. The paper says ViT-Large, but `vit.py` has `embed_dim=1280, depth=32`, which is ViT-H sized. **paper**, **code** conflict — [arXiv 2409.12259](https://arxiv.org/abs/2409.12259), [vit.py](https://github.com/warmshao/WiLoR-mini/blob/main/wilor_mini/models/vit.py). FreiHAND PA-MPJPE 5.5, PA-MPVPE 5.1. **paper**
- **HaMeR**. ViT-H at 256x192, predicts MANO directly. FreiHAND 6.0 and 5.7. Each frame is independent. **paper**, **user** — [hamer#65](https://github.com/geopavlakos/hamer/issues/65)
- **Hamba** (NeurIPS 2024). Graph-guided bidirectional Mamba scanning, using 88.5% fewer tokens than attention methods. FreiHAND PA-MPVPE 5.3. **paper** — [repo](https://github.com/humansensinglab/Hamba)
- **SAM 3D Body hand decoder**. Shared encoder, separate hand decoder, MHR output. FreiHAND PA-MPJPE 5.5, PA-MPVPE 6.2, without training on FreiHAND. The paper says it does not surpass specialised hand-only models and that hands from the body decoder alone are "suboptimal". **paper** — [arXiv 2602.15989](https://arxiv.org/abs/2602.15989)
- **Older or narrower:** HandOccNet (occlusion, 2022), Deformer (video transformer, 2023, 31 stars), HaMuCo (multi-view self-supervised; multi-view inference code still unticked in its README), EgoForce (2026, forearm-guided, egocentric). **code**, **paper**

**Landmark-only**
- **MediaPipe.** 21 points, 2D plus relative depth.
- **RTMPose hand.** RTMPose-m at 256x256: PCK@0.2 81.5 on COCO-WholeBody-Hand, 96.4 on Hand5. **vendor** — [RTMPose README](https://github.com/open-mmlab/mmpose/tree/main/projects/rtmpose)
- **RTMW.** Whole-body 2D, 133 keypoints. Reported hand AP 66.4 for the largest 384x288 model and 59.8 for a mid model, read from a search extract of the paper's table. **paper** — [arXiv 2407.08634](https://arxiv.org/abs/2407.08634)
- **DWPose.** Hand AP 52.7 (m) and 56.6 (l) at 256x192. MMPose maintainers warn that these were not trained on the same data as RTMW. **paper**, **user** — [arXiv 2307.15880](https://arxiv.org/abs/2307.15880), [discussion #3135](https://github.com/open-mmlab/mmpose/discussions/3135)
- **Sapiens2.** 308 keypoints including hands, input 1024x768, sizes 0.4B to 5B parameters. **card** — [sapiens2-pose-1b](https://huggingface.co/facebook/sapiens2-pose-1b)

### Inferences
- Rotation-output models fit a rig directly. Landmark models need a separate IK stage, so they keep MediaPipe's bone-length problem unless the IK fixes it.
- The field has moved the jitter fix from one place to two: temporal learned models (HandFlow) and strong filtering on good per-frame models (EgoHand). Both report large gains over raw per-frame output in their own tables, on different metrics and datasets. Neither has been compared head to head.

### Gaps
- ViDiHand's numbers, weights and hardware were not confirmed. Its README, as searched, showed only authors and a citation, and the repo has no licence file.
- UniHand appears in HandFlow's tables, but no matching code repo was found in this search.
- HaPTIC's own jitter numbers were not retrieved.

## Which methods handle stability, occlusion, contact, blur and small hands? Is a hand crop better than a whole-body model?

### Takeaway
Yes, per the sources, hand crops beat whole-body models for finger detail and stability: every best result uses hand crops as input, including the joint temporal model. The biggest single stability gain with published numbers is a two-sided adaptive filter on the parameters, which roughly halved acceleration error. Small hands are the weakest spot: no source measured accuracy against hand pixel size, and one major pipeline simply rejects hands at 64 px or below.

### Cited Findings

**Temporal stability**
- EgoHand's adaptive smoothing cuts acceleration error from 3.92 to 1.90 mm/frame² on H2O, 4.39 to 1.63 on HOT3D, and 7.64 to 2.64 on ARCTIC, and spatial metrics improve slightly. **paper** — [arXiv 2610.30293](https://arxiv.org/abs/2610.30293)
- H2O table, same paper: HaMeR 4.53, WiLoR 3.87, Dyn-HaMR 4.36, HaWoR 2.82, EgoHand smoothed 1.90. So raw EgoHand (3.92) is about as jittery as raw WiLoR (3.87). WiLoR still has the best PA-MPJPE (6.06 vs 6.87) and 2D EPE (8.96 vs 9.59 px). **paper**. Caveats from the authors: only EgoHand was smoothed, ground-truth boxes were used, HaWoR's infilling was omitted, and Dyn-HaMR's HMP stage could not be run.
- HandFlow claims the lowest acceleration among its tested methods on HOT3D: Accel 4.18 m/s² against Dyn-HaMR's 4.77, with W-MPJPE 43.00 mm. **paper**. The rest of that table was ambiguously aligned in extraction, so check it before citing. — [arXiv 2607.11221](https://arxiv.org/abs/2607.11221)
- OmniHands reports Accel 2.81 on InterHand2.6M against 3.70 for the next best, and says it is 16.05 FPS on an A800 and not real-time. **paper** — [arXiv 2405.20330](https://arxiv.org/abs/2405.20330)
- HOT3D world-space Accel (m/s²): HaMeR-SLAM 19.25, HandDGP-SLAM 20.17, WiLoR-SLAM 8.02, HMP-SLAM 5.50, HaWoR 5.41. **paper** — [arXiv 2501.02973](https://arxiv.org/abs/2501.02973)
- UmeTrack reports a better jitter metric from a training-time temporal loss, against a multi-stage kinematic pipeline. MEgATrack feeds tracking history into its keypoint network. Both are multi-camera headset systems. **paper** — [UmeTrack](https://arxiv.org/abs/2211.00099), [MEgATrack](https://ai.meta.com/research/publications/megatrack-monochrome-egocentric-articulated-hand-tracking-for-virtual-reality/). [UmeTrack repo](https://github.com/facebookresearch/UmeTrack) is archived. **code**

**The filter recipe, fully readable**
- `gem/pose/smoothing.py`, adaptive smoothing of parameters: rotations are filtered in the local SO(3) tangent space (`R_out = R_t Exp(sum w_i Log(R_t^T R_i)/sum w_i)`), "not an element-wise matrix/Euler average"; the window narrows with speed (`max_sigma / (1 + (speed/ref)^2)`, default ref π rad/s and 0.25 m/s, max sigma 2/30 s); noise is estimated from fifth divided differences; local quadratic fits run with robust reweighting; shape smooths on a 0.2 s sigma; "Vertices are never averaged". It needs "both temporal directions", so it is offline. The comment says defaults are "experimental; they are not tuned to a particular motion capture dataset". **code** — [smoothing.py](https://github.com/NVlabs/GEM-X/blob/main/gem/pose/smoothing.py)
- `gem/common/detectors/hand_tracking.py` `_stabilize`, crop stabilisation: linear gap fill between observed boxes, box size frozen while the centre stays within 8 px of an anchor, size change capped at 1.12× per frame, centre speed capped at 90 px/frame. **code** — [hand_tracking.py](https://github.com/NVlabs/GEM-X/blob/main/gem/common/detectors/hand_tracking.py)
- `gem/common/detectors/hand_boxes.py`, crop smoothing **before** inference: rejects isolated spikes, smooths centres and log sizes with speed-adaptive EMA, and bounds size change with a forward and backward envelope. It uses future frames. **code** — [hand_boxes.py](https://github.com/NVlabs/GEM-X/blob/main/gem/common/detectors/hand_boxes.py)
- Licence labels by file header: `hand_tracking.py` Apache-2.0; `hand_boxes.py` and `smoothing.py` OpenMDW-1.1. All three are plain NumPy and SciPy. **code**
- **Layer: app.** The stabiliser is tuned for egocentric video. `MIN_SIZE_FRAC = 0.16` sets the minimum box to 16% of image width, or 307 px on a 1920-wide frame. `enforce_lr_order` assumes the left hand is on the left of the screen. **code**. In the CLI, `--smooth-hand-boxes` requires ego video with the native tracker (`cli.py` lines 190-191), while `--smooth-hand` works on any hand video (lines 166-167), and defaults off for exo (lines 183-184). **code** — [cli.py](https://github.com/NVlabs/GEM-X/blob/main/gem/inference/cli.py)
- SAM3DBody-cpp's offline binary runs five passes: inference and scene detection, global tracking, gap interpolation, opt-in jitter interpolation (frames over 30 cm/frame replaced), and zero-phase Butterworth `filtfilt` with zero lag, never bridging a scene cut. Its live path is causal Butterworth at 6 Hz by default. It notes "SO(3) is not a vector space", yet `hand_pose` is filtered with the scalar path. **code** — [SAM3DBody-cpp README](https://github.com/AmmarkoV/SAM3DBody-cpp)
- Tamaththul3D smooths with data, velocity, acceleration and jerk terms, heavier on hands than body. Weights are not published. Hand jitter 299.14 against DexAvatar's 1783.64. **paper** — [arXiv 2605.05367](https://arxiv.org/abs/2605.05367)

**Tiny trainable smoothers**
- **SmoothNet** is a post-processing temporal network with windows of 8 to 64 frames, for 2D, 3D and SMPL. Apache-2.0. Hand-specific weights were not found. **code** — [SmoothNet](https://github.com/cure-lab/SmoothNet)
- **HMP** is a generative hand motion prior trained on AMASS, used in latent optimisation, with its largest gains under occlusion. Code exists, 62 stars. **paper**, **code** — [arXiv 2312.16737](https://arxiv.org/abs/2312.16737), [enesduran/HMP](https://github.com/enesduran/HMP)

**Occlusion**
- DexYCB PA-MPJPE at 75-100% occlusion: WiLoR 5.68, HaWoR 5.07, HandFlow 4.85, and UniHand 4.26 in HandFlow's table. **paper**
- OmniHands shows temporal fusion recovering a fully hidden hand from past and future frames, and sequence fusion lowers MPJPE from 7.69 to 7.37. **paper**
- SAM-Body4D adds occlusion-aware diffusion, at a large cost: 26 minutes against 3 for 90 frames and 5 people. **user** — [sam-3d-body#32](https://github.com/facebookresearch/sam-3d-body/issues/32)
- **Layer: model.** HandFlow treats occlusion and out-of-frame the same, so a hand fully out of view degrades without being flagged. **paper**

**Hand-to-hand contact**
- OmniHands has relation maps, a Bimanual Decoder and inter-hand contact losses. Dyn-HaMR has an interacting-hand prior. **paper**
- **Layer: model.** HaWoR models each hand independently, so hands can pass through each other. **paper**
- One user testing static-camera sign language, where hands frequently cross, reports HaWoR losing finger detail compared with HaMeR, though handedness stayed stable. **user** — [HaWoR#31](https://github.com/ThunderVVV/HaWoR/issues/31)

**Hand-to-face contact**
- **Decaf** (SIGGRAPH Asia 2023) recovers hand and face motion plus contact deformation, by fitting with contact and deformation networks. **DICE** does it end to end from one image, and its authors call Decaf's fitting slow and reliant on good initial keypoints. **paper** — [Decaf](https://arxiv.org/abs/2309.16670), [DICE](https://arxiv.org/abs/2406.17988)

**Motion blur**
- **BlurHandNet** unfolds one blurry frame into a mesh sequence. The authors argue deblurring first performs worse because leftover artifacts hurt the next stage, and deblurring removes motion information. Code and dataset are released. **paper** — [CVPR 2023](https://ar5iv.labs.arxiv.org/html/2303.15417). A 2025 follow-up outputs several candidates because forward and reversed motion blur alike. **paper** — [ICME 2025](https://pure-oai.bham.ac.uk/ws/files/285929186/ICME_2025_Paper.pdf). WiLoR says its detector copes with motion blur, shown only qualitatively. **paper**

**Small hands**
- **Layer: engine.** SAM 3D Body rejects hand crops with `bbox_scale` at or below 64 px and falls back to the body decoder's hand (`sam3d_body.py` lines 1316-1328). **code**. SAM3DBody-cpp reports that on multi-person footage with a distant subject this is "commonly half the hand crops in the frame". **code** — [sam3d_body.py](https://github.com/facebookresearch/sam-3d-body/blob/main/sam_3d_body/models/meta_arch/sam3d_body.py)
- HaMeR pads the box by 2.0 and WiLoR by 2.0 to 2.5, then resizes to 256. **code** — [hamer demo.py](https://github.com/geopavlakos/hamer/blob/main/demo.py), [WiLoR demo.py](https://github.com/rolpotamias/WiLoR/blob/main/demo.py)
- WiLoR's paper shows failures on small hands in crowded scenes and says it can fail to detect hands in crowded environments. **paper**
- EgoHand reports nothing on third-person views or small hands. All its evaluations are egocentric. **paper**. **Layer: model.**
- DanceHMR masks hands that become too small or have too few reliable keypoints, and masks keypoints below 0.55 confidence, so it relies on temporal context there. **paper**

**Hand crop versus whole-body model**
- ARCTIC hand PA-PVE (mm): SMPLer-X-L 18.1, PyMAF-X 14.3, GVHMR+HaMeR 13.9, SMPLest-X 11.9, DanceHMR 8.5. **paper** — [arXiv 2605.18102](https://arxiv.org/abs/2605.18102)
- ARCTIC hand jitter (m/s³): SMPLest-X 55.4, SMPLer-X-B 52.1, GVHMR+HaMeR 7.4, DanceHMR 4.2. **paper**
- Removing hand observations from DanceHMR nearly doubles hand PVE (24.8 to 44.8) and raises hand jitter from 4.2 to 10.1. **paper**
- Counter-case: on UBody, AiOS scores hand PA-PVE 7.3 against DanceHMR's 7.4, so a whole-body image model can match on aligned hand shape. **paper**
- SMPLest-X scored the lowest hand jitter in the sign-language study (5.85, 7.40) but with "rigid" hand configurations. Low jitter here means little motion, not good hands. **paper** — [arXiv 2604.24609](https://arxiv.org/abs/2604.24609)

### Inferences
- Arithmetic from the padding above: a 100 px hand gives a 200 to 250 px crop, about native for a 256 input. A 50 px hand gives 100 to 125 px, upsampled about 2×. So the hands to worry about start near 50 px, and crops must come from source-resolution frames, not a downscaled one.
- The 7.4 hand jitter for GVHMR+HaMeR is far below SMPLest-X's 55.4 even though HaMeR is per-frame. Hand joints inherit the arm's motion, so much of that gap is likely the temporal body, not the hand. The numbers do not separate finger jitter from arm jitter.
- **Leading approach for files, attacked.** Stabilised crops from source frames, a good per-frame hand model, then two-sided SO(3) smoothing. Attack 1: the filter is egocentric-tuned and its defaults are "experimental", so third-person constants must be re-derived. Attack 2: fast finger snaps lose peak values under any smoothing; the speed-narrowed window lessens this but does not remove it. Attack 3: it only works on a finished clip, so live capture needs something else. It survives for offline use because it has the best published numbers and costs a few ms per frame (1.8 to 2.9 ms). What the attack changed: live needs a causal version, listed as open below.
- Filtering the crop and filtering the output are separate gains. No source measures the crop filter alone.

### Gaps
- No source measures hand accuracy against hand size in pixels. Search "3D hand pose small hands low resolution full body image hand crop versus whole-body model" returned only the MANO paper. This is a gap in the search, and it is the most important one for full-body shots.
- No head-to-head of HandFlow and filtered EgoHand or filtered WiLoR on the same footage was found.
- No causal (live) version of the adaptive SO(3) filter was found. SAM3DBody-cpp's causal Butterworth is the nearest. Its effect on fingers is unmeasured.
- A tiny hand-only temporal network with open weights was not found in this search. HMP and SmoothNet are the nearest.
- Decaf and DICE weights were not checked.

## How is a hand result attached to the body without the wrist breaking?

### Takeaway
There are four working approaches: per-frame acceptance gates plus keypoint re-prompting (SAM 3D Body), closed-form forearm IK (Tamaththul3D), elbow-twist compensation (PyMAF-X), and a joint temporal model (DanceHMR). The cheapest good recipe is forearm IK with swing-twist on the elbow, then a small shoulder fit, and it has a published formula. Only SAM 3D Body's version can be read as code. The joint temporal model has the best published numbers but no released weights.

### Cited Findings
- **The problem.** Independent estimation "usually leads to physically disjointed wrist orientations", and a stitched pipeline "cannot fully ensure temporally coherent body-hand motion". **paper** — [DanceHMR](https://arxiv.org/abs/2605.18102). Naive "Copy-Paste" can give unnatural wrists. **paper** — [PyMAF-X](https://arxiv.org/abs/2207.06400). Directly inserting hand output causes "errors in adjacent joints, particularly at the elbows". **paper** — [SAM 3D Body](https://arxiv.org/abs/2602.15989)
- **SAM 3D Body, `run_inference`, lines 1285-1560.** **code** — [sam3d_body.py](https://github.com/facebookresearch/sam-3d-body/blob/main/sam_3d_body/models/meta_arch/sam3d_body.py)
  - Accept a hand only if all four hold: wrist angle difference to the body under 1.4 rad, hand box over 64 px, all hand 2D keypoints inside the box (under 0.5 normalised), and hand wrist within 0.25 box sizes of the body wrist in 2D.
  - Feed the hand's wrist and the body's elbow as keypoint prompts and rerun the body decoder, so the arm moves to meet the hand.
  - Drop in hand pose, hand scale and shape (scale and shape averaged across hands).
  - FK to get the new forearm, then solve the local wrist rotation so the hand keeps its global rotation.
  - Rejected hands keep the body decoder's hand (`torch.where(valid_angle, ...)`).
  - Porting note: the 2D wrist check divides the right-hand distance by the left box's scale and the left by the right's (`right_kps_dist ... / batch_lhand["bbox_scale"]`). It reads as a swap; confirm before copying.
- **Layer: engine bug.** `run_inference` drops the refreshed `joint_global_rots`, so rotations stay pre-hand-refinement while vertices are refined. One user driving a rig got half-open fists for a whole clip. **user**, with line refs — [sam-3d-body#139](https://github.com/facebookresearch/sam-3d-body/issues/139)
- **Layer: engine.** Fast SAM 3D Body drops the keypoint-prompted second pass. Its hand FreiHAND numbers stay within 0.3 mm, but those are hand-only numbers, not wrist joins. **paper** — [arXiv 2603.15603](https://arxiv.org/abs/2603.15603). `sam3d.cpp` does not implement hand-crop refinement at all. **card** — [GGUF card](https://huggingface.co/LocalAI-io/sam-3d-body-dinov3-GGUF). SAM3DBody-cpp implements it with `--refined-pose`, including pass 2 and IK, and `--no-pass2` skips the second pass. **code** — [README](https://github.com/AmmarkoV/SAM3DBody-cpp)
- **Tamaththul3D** (May 2026). Body from SMPLer-X, hands from WiLoR, 2D from MediaPipe. It solves the elbow local rotation in closed form so the forearm chain reaches WiLoR's global wrist (`R_elbow_new = R_shoulder_world^T · R_target_wrist · R_wrist_local,cur^T`), extracts forearm twist by swing-twist, then refines only the shoulder for 50 Adam steps at lr 0.01 against a confidence-weighted 2D loss, a regulariser and VPoser. Both estimators are swappable. 0.67 s/frame on an RTX 5070 Ti with 16 GB. No code found. **paper** — [arXiv 2605.05367](https://arxiv.org/abs/2605.05367)
- **PyMAF-X.** Adjusts the elbow's twist rotation to compensate the wrist, which barely moves joint positions, so alignment holds. **paper** — [arXiv 2207.06400](https://arxiv.org/abs/2207.06400)
- **DanceHMR.** Frozen HMR2.0 and HaMeR features, ViTPose and RTMW keypoints, hand tokens added by an MLP to the body token before a 120-frame-window temporal encoder. About 46M parameters, SMPL-X output including wrist contact states. Ablation: full model hand jitter 4.2, without residual fusion 6.6, without hand observations 10.1. **paper** — [arXiv 2605.18102](https://arxiv.org/abs/2605.18102). No code or weights on the [project page](https://shenwenhao01.github.io/dancehmr/).
- **EgoForce.** Adding an arm crop cut hand camera-space acceleration from 19.3 to 15.2 m/s² on ARCTIC, about 21%. Egocentric only, code and weights not stated. **paper** — [arXiv 2605.12498](https://arxiv.org/abs/2605.12498)
- **GEM-X Motion.** Temporal, 77-joint SOMA skeleton including fingers, but finger output was reported static in March, with `remove_fingers: true` in the config and a maintainer saying finger tracking was being improved. **user**, **code** claims — [GEM-X#4](https://github.com/NVlabs/GEM-X/issues/4), [#20](https://github.com/NVlabs/GEM-X/issues/20). The October release adds Hand Pose as a separate per-frame model. Whether Motion's fingers improved was not verified.
- **MPC IK.** `comfi-examples-hands` runs full-body plus MANO hand IK with ACADOS MPC, live, from SAM3D keypoints. **code**, 0 stars — [repo](https://github.com/SoulieTechnologies/comfi-examples-hands). [Momentum](https://github.com/facebookresearch/momentum) offers general IK and tracking solvers, MIT. **code**
- **Shape.** HaMeR's author recommends optimising the whole sequence to one shape and encouraging neighbouring frames to agree. **user** — [hamer#65](https://github.com/geopavlakos/hamer/issues/65). EgoHand smooths shape heavily at 0.2 s. **code**

### Inferences
- SAM 3D Body's gates decide per frame with no hysteresis, so a hand near a threshold can flip between refined and body-decoder hand across frames, which would show as a pop. This is read from the code and not reported by any user I found. Any port should add hysteresis or a blend.
- Order matters: join first, then filter in local joint space, so arm noise does not leak into fingers and the wrist stays attached. No source tests this order explicitly.
- Lock one hand shape per person per clip. It is the cheapest gain and stops bone-length flicker.
- **Leading approach, attacked.** Forearm IK with swing-twist, a small shoulder fit, gates with hysteresis, then SO(3) filtering. Attack 1: Tamaththul3D has no code, so its numbers cannot be re-run. Attack 2: its 50-step shoulder fit makes it slow, at 0.67 s/frame including all stages. Attack 3: trusting the hand's wrist assumes the hand's global rotation is better than the body's, which fails on small, blurred hands; the 1.4 rad gate exists for that reason. Attack 4, a simpler option: GEM-X Motion alone would need no join, but its fingers are unverified. The approach survives; the attacks add gates and a fallback to the body's wrist. What changed: gates are required, not optional.

### Gaps
- No released code was found for DanceHMR or Tamaththul3D.
- The wrist-mismatch metric itself is rarely reported. No table of wrist angle error across join methods was found.
- Using a smaller hand-only DanceHMR-style temporal net is untested. At 46M parameters it may exceed the "small training" limit, and it needs whole-body hand data.

## Serious candidates: weights, code, output, gated files, real VRAM and speed, live or offline, non-Python path

### Takeaway
No single candidate wins every column. SAM3DBody-cpp is the only path found with both full body and hand refinement and no Python. EgoHand needs no MANO and has clear commercial terms. WiLoR and HaMeR are small and well-tested, but they need MANO. HandFlow has the strongest learned temporal numbers, but needs MANO, HaMeR and about 13 GB.

### Cited Findings

Weights were checked on the Hugging Face API or release page today. Licences are labels only.

| Candidate | Kind | Output | Open weights | Gated files | Licence label | VRAM and speed | Live or offline | Non-Python path |
|---|---|---|---|---|---|---|---|---|
| **WiLoR** | Per-frame | MANO | Yes. `warmshao/WiLoR-mini` 2,565 MB ckpt, 53.6 MB detector | MANO | CC-BY-NC-ND weights; MANO; Ultralytics | Author: 25 ms per hand; ~10 ms on RTX 5090 with `--fast`. Users: 11 Hz on 3090, 10.46 FPS on Titan RTX, 17.99 on RTX 5000, end to end. No VRAM figure | Near-live on large cards | `wilor_vit.onnx` 1,262 MB (ViT only); `lyonsno/wilor-mlx` for Apple; no C++ port found |
| **HaMeR** | Per-frame | MANO | Yes, via repo; HF mirrors | MANO | MIT code; MANO | ~32 ms per crop on 3090; <7 GB with `regnety` detector (author) | Near-live without its detector | Tenstorrent port only; no ONNX found |
| **EgoHand-v1** | Per-frame + filter | SOMA-Hand | Yes. 10,657 MB ckpt, HF `gated: False`, though GEM-X docs say access is managed | None. SOMA-X `gated: False`, Apache-2.0 | OpenMDW-1.1, commercial use stated | 9.01 ms on RTX PRO 6000 Blackwell, 18.35 ms on L40, batch 32. VRAM not reported | Offline as shipped (filter); model fast | RT-DETR detector is ONNX (80.4 MB); model is PyTorch, card says Linux |
| **HandFlow** | Temporal | MANO | Yes. `mxxu00/HandFlow` 667.9 MB plus HaMeR | MANO | MIT; MANO; HaMeR | 3.19 s for 150 frames, 13.1 GB, H100 (about 47 fps) | Offline, 16-frame window | None found |
| **OmniHands** | Temporal | MANO | Yes, Google Drive | MANO | No licence file | 16.05 FPS, A800 | Offline | None found |
| **HaPTIC** | Temporal | MANO | Yes, script | MANO | No licence file | Not found | Offline | None found |
| **HaWoR** | Temporal | MANO | Yes. `ThunderVVV/HaWoR` | MANO | CC-BY-NC-ND | 38.13 s for 150 frames, 6.9 GB (HandFlow's table); ~40 ms per frame claimed by its paper | Offline | None found |
| **Dyn-HaMR** | Optimisation | MANO | `Zhengdi/Dyn-HaMR` HF repo holds no weight files; it reuses other models | MANO | LICENSE file MIT, README says non-commercial: conflict | 288.58 s for 150 frames. 1.1 GB per HandFlow's table, but a user saw ~11 GB | Offline | None found |
| **ViDiHand** | Temporal diffusion | MANO, per summaries | Not confirmed | MANO, per summaries | No licence file | Not found; 1.3B-parameter base | Offline | None found |
| **DanceHMR** | Temporal, joint | SMPL-X | Not found | SMPL-X | Paper only | Not reported | Offline | Method can be rewritten; needs training |
| **SAM 3D Body** | Per-frame, body + hand | MHR | Yes. Official `gated: manual`; ungated `Comfy-Org`, `jetjodh` mirrors | Official repo gated | SAM licence; MHR Apache-2.0 | 9 s/frame on 2080 Ti, 4 s on 3060, ~0.72 s on 3090 (users); 2.15 fps full on 4080 Super with fast detector | Offline | See next two rows |
| **SAM3DBody-cpp** | C++ port | MHR, BVH | Yes. `AmmarkoV/SAM3DBody-cpp-onnx-models` | None | MIT code; model licences apply | Peak ~7.2 GB (desktop app). 0.89 s per frame with hands on 4080 Super; a TensorRT run shows 135 ms on two-person frames, not confirmed as whole-frame time | Live at ~1.1-1.4 fps without TensorRT; offline 5-pass | **Yes.** ONNX Runtime + ggml, Windows build |
| **Fast SAM 3D Body** | Speed-up | MHR/SMPL | Uses SAM 3D Body | As above | Repo licence not read | 45.5 FPS hand-only, 5.28 FPS with body on 3DPW; 65 ms end to end on RTX 5090 | Near-live | TensorRT option |
| **GEM-X Motion** | Temporal, body | SOMA 77 | Yes. `nvidia/GEM-X` | SOMA assets | Apache-2.0 code; NVIDIA Open Model | gem-x.cpp: 13-15 fps on RTX 5070 Ti, no VRAM figure | Live and offline | **Yes.** `gem-x.cpp`, GGML + Vulkan, but hand depends on finger output above |
| **Hamba** | Per-frame | MANO | Yes, Mar 2025 | MANO | NOASSERTION | Not found | Offline | None found |
| **HaMuCo** | Per-frame | MANO | Not confirmed | MANO | Not read | Not found | Offline | None found |
| **HandOccNet** | Per-frame | MANO | Not checked | MANO | No licence file | Not found | Offline | None found |
| **Deformer** | Temporal | MANO | Not confirmed | MANO | Apache-2.0 | Not found | Offline | None found |
| **RTMW** | Per-frame 2D | 133 points | Yes. `bukuroo/RTMW-ONNX` 62-369 MB; `RTMW3D-ONNX` | None | Apache-2.0 | Not read | Real-time claimed in its title | **Yes.** ONNX |
| **DWPose** | Per-frame 2D | 133 points | Yes, per repo | None | Apache-2.0 | Not read | Not read | Not read |
| **Sapiens2** | Per-frame 2D | 308 points | Yes. 1B is 6,079 MB | None | Sapiens2 licence | Not read | Likely offline, judged from size | None found |
| **MediaPipe** | Per-frame 2D+rel. depth | 21 points | Yes | None | Apache-2.0 | 17.12 ms CPU, 12.27 ms GPU on Pixel 6 | Live | **Yes.** C++, JS, WASM |

- `facebookresearch/MHR` is Apache-2.0 and `NVlabs/SOMA-X` is Apache-2.0, and both ship hand models that do not need MANO. **code** — [MHR](https://github.com/facebookresearch/MHR), [SOMA-X](https://github.com/NVlabs/SOMA-X)
- `SOMA-X` MANO interop needs user-supplied MANO files. **code**
- `sapiens2-pose-1b` and `facebook/sam-3d-body-*` have large sizes (6,079 MB; 2,109 MB plus 696 MB MHR). **card**
- **Layer: engine.** NVIDIA cards list Ampere as the supported architecture. EgoHand's card lists Linux only; GEM-X's lists Linux, Windows and macOS. **card**

### Inferences
- A rewrite does not remove MANO: it is a data asset, not a method. SOMA-Hand and MHR are the ways out, and EgoHand already predicts SOMA-Hand.
- EgoHand's 9 ms is throughput at batch 32, not single-frame live latency. Its 10.7 GB checkpoint is far larger than 883.5M parameters need at 32-bit (about 3.5 GB), so it probably contains training state. Real load size is unknown.

### Gaps
- No VRAM number was found for WiLoR, EgoHand or OmniHands.
- ComfyUI node sources were not read: `gh search repos` returned nothing for "ComfyUI hand mocap", "ComfyUI SAM3DBody" and "ComfyUI WiLoR". This may be a failure of the search command, not absence, since `Comfy-Org/sam-3d-body` does exist.

## What runs on 8 GB (RTX 2070 Super), 12, 16, 24 GB and CPU?

### Takeaway
On the floor card, the realistic hand models are HaMeR, WiLoR and possibly EgoHand, run one stage at a time, plus MediaPipe, RTMW and RTMPose for live. SAM3DBody-cpp fits by a thin margin but its stock build skips this card's architecture. HandFlow's measured 13.1 GB needs 16 GB unless it is split into stages.

### Cited Findings
- **8 GB, fits by evidence:** MediaPipe; RTMW and RTMPose ONNX, with models of 62 to 369 MB; HaMeR at under 7 GB for the whole demo with `regnety`, against failure on 8 GB with the default ViTDet. **user**, author reply — [hamer#13](https://github.com/geopavlakos/hamer/issues/13). HaWoR at 6.9 GB, but it is built for egocentric video. **paper**
- **8 GB, thin:** SAM3DBody_Desktop lists "Ampere, Lovelace, or Blackwell RTX GPU with 8 GB+ VRAM" and observed peak "about 7.2 GB". **vendor** — [SAM3DBody_Desktop](https://github.com/Saganaki22/SAM3DBody_Desktop)
- **Layer: engine.** The RTX 2070 Super is Turing. That desktop build targets `sm_86;89;120` only (Ampere and later). **code**. SAM3DBody-cpp's own build takes `CMAKE_CUDA_ARCHITECTURES` including 75 (Turing), but its default `backbone.onnx` and `decoder.onnx` are BF16. **code** — [README](https://github.com/AmmarkoV/SAM3DBody-cpp). Whether BF16 runs acceptably on Turing was not found.
- A user reports 9 s/frame in full mode on a 2080 Ti, the same generation as the floor card. **user** — [sam-3d-body#55](https://github.com/facebookresearch/sam-3d-body/issues/55). `--tf32` tips do not apply to Turing. **code**
- **12 GB:** HandFlow is about 1 GB short of its measured peak. `sam-body4d` masklets alone peak 9.9 GB. **code** — [resources.md](https://github.com/gaomingqi/sam-body4d/blob/master/assets/doc/resources.md)
- **16 GB:** HandFlow fits at 13.1 GB. Tamaththul3D ran on an RTX 5070 Ti 16 GB at 0.67 s/frame. SAM-Body4D, one person, batch 64, no occlusion module: 14.49 GB. **paper**, **code**
- **24 GB:** A commenter who says they worked with both SAM 3D models says most images fit but "certain inputs" exceed 24 GB. **user** — [sam-3d-body#136](https://github.com/facebookresearch/sam-3d-body/issues/136). That conflicts with the 7.2 GB seen in the native port, probably from batching, detectors and FOV estimators in the PyTorch demo. Not verified.
- **CPU:** MediaPipe is the proven path. SAM3DBody-cpp has a CPU mode with a separate fp32 backbone and fp16 decoder, and its README warns of slow speeds; the figure was not retrieved. **code**

### Inferences
- Run stages one after another and unload between them, so that only one model holds VRAM at a time. This is offline-only.
- On Titan RTX (Turing), WiLoR reached 10.46 FPS. The 2070 Super is a smaller Turing card, so expect well under that. A rough guess is 4 to 7 FPS, unmeasured.
- EgoHand at 8 GB is plausible at small batch with bf16 (about 1.8 GB of weights, 256x256 input), but Turing is below its stated support, and the card says Linux. This must be measured on the real card before any plan depends on it.
- HandFlow could fit less VRAM by caching HaMeR tokens first, then running the denoiser alone. Its peak may reflect a big machine's defaults. Unmeasured.
- A live hand mesh on 8 GB is not supported by any source here. Live on the floor means 2D landmarks plus IK, or a slow body-only rate with hands added later offline.

### Gaps
- No VRAM number was found at 8 GB for WiLoR or EgoHand.
- No CPU timings were found for WiLoR, HaMeR or EgoHand.
- ViDiHand's VRAM was not found.

## Independent evidence: GitHub issues, forums, jitter metrics

### Takeaway
Users back the core claim: per-frame hand models jitter on video, including WiLoR, even though its paper says it is smooth with no temporal components. Third-party tables put WiLoR's advantage over HaMeR at about 15% to 60%, well below the roughly 70% in WiLoR's own table. Reddit and VTuber evidence was thin in this search.

### Cited Findings
- WiLoR's abstract claims "smooth 3D hand tracking from monocular videos, without utilizing any temporal components". Its HO-3D table gives Jitter 5.92 against HaMeR's 20.43. **paper** — [arXiv 2409.12259](https://arxiv.org/abs/2409.12259)
- Against that: "the jitter is very severe" for WiLoR. The poster tried WiLoR and Dyn-HaMR, and says both jittered even after smoothing. Another user says a 5-frame sliding average fixed it "pretty conveniently". These two reports conflict. **user** — [WiLoR#46](https://github.com/rolpotamias/WiLoR/issues/46). Egocentric left hand "always noisy and jittering". **user** — [WiLoR#31](https://github.com/rolpotamias/WiLoR/issues/31)
- Ratios of WiLoR to HaMeR acceleration or jitter: own table 0.29 (5.92/20.43), HaWoR's table 0.42 (8.02/19.25), EgoHand's table 0.85 (3.87/4.53). **paper**, ratios mine.
- WiLoR's reconstruction speed was never in its paper. **user**, confirmed by reading — [WiLoR#31](https://github.com/rolpotamias/WiLoR/issues/31)
- Exporting rotations is a real trap: a user got "jumbled" fingers treating WiLoR output as 48 axis-angle values on a rig. **user** — [WiLoR#49](https://github.com/rolpotamias/WiLoR/issues/49)
- SAM 3D Body's hand number could not be reproduced by one user: PA-MPJPE 10.02 against 5.5 in the paper, through MHR to SMPL-X to MANO conversion. That conversion may be the cause. **user** — [sam-3d-body#122](https://github.com/facebookresearch/sam-3d-body/issues/122). Hand-only crops did not behave as the paper's Figure 7 shows. **user** — [#120](https://github.com/facebookresearch/sam-3d-body/issues/120), [#61](https://github.com/facebookresearch/sam-3d-body/issues/61)
- GEM-X user: SAM 3D Body hands are "usable" and fixable by hand, but its body is worse than GVHMR. **user** — [GEM-X#7](https://github.com/NVlabs/GEM-X/issues/7)
- HaWoR on third-person sign language: "finger detail is noticeably worse" than pure HaMeR, and HaWoR jitter possibly from depth estimation. **user** — [HaWoR#31](https://github.com/ThunderVVV/HaWoR/issues/31). This matches its paper, which reports no third-person evaluation. **Layer: model.**
- Independent neutral study: 8 estimators on sign language, median of 20 sequences each. J_jerk, all keypoints excluding legs, scaled ×100, Signsuisse and Phoenix: MediaPipe 2.46 and 6.51; SMPLest-X 2.74 and 3.97; Sapiens 7.77 and 10.86; AlphaPose 7.36 and 10.32; MMPose 8.58 and 14.47; OpenPose 6.84 and 26.36. Authors warn that distributions overlap, and that hand missingness matters more than jitter for translation quality. **paper** — [arXiv 2604.24609](https://arxiv.org/abs/2604.24609)
- VTuber and product side: Warudo recommends Leap Motion over its MediaPipe hands. **vendor**. Animaze uses MediaPipe with a hand smoothing panel, per a search summary of its patch notes, which were not opened. **vendor** — [patch notes](https://steamdb.info/patchnotes/16425036). Move.ai's s2 claims the highest quality single-camera mocap, with advanced hand and finger tracking. **vendor** — [docs](https://developers.move.ai/docs/models/s2). A Reallusion thread reports finger jitter, seen as a search snippet. **user** — [forum](https://forum.reallusion.com/PrintTopic469312.aspx)
- MPJAE was not reported in any hand paper retrieved here. UmeTrack uses MPJPA for jitter. Papers mostly report Accel and third-derivative jitter. **paper**

### Inferences
- The fair reading of WiLoR: better than HaMeR for stability, but not smooth enough on its own. A filter is still required.
- EgoHand's paper is a competitor's table, so its WiLoR number may be unfavourable. The ranges above should be read as bounds.
- Low jitter must always be read beside a detail metric, or rigid hands look best.

### Gaps
- No Reddit threads were returned by the search tool for the two Reddit queries. That is a gap in the search, not proof that none exist.
- VTuber community reports on finger jitter by tracker were not found in usable form.
- Only one neutral multi-estimator study was found, and its hand-only table was not fully retrieved.
- HOT3D or HANDS 2025 hand-pose track winners were not found; the search surfaced only the ARCTIC track.

## Query log

Tool notes: WebSearch returns a summary with links. `gh` and `curl` calls were read-only. Nothing was executed from any repo.

**Web searches**
1. "best hand tracking model 2026" — vendor pages and listicles (Ultraleap, roundups). Little use.
2. "best hand mocap from video" — HandCraft Pro, Wonder Studio, Cascadeur, Move.ai, listicles. Products, no methods.
3. "smooth finger tracking from webcam" — hobby repos, One Euro use. Little use.
4. "mediapipe hands jitter fix" — moving-average paper, VIDEO mode blog, Reallusion thread. No official fix.
5. "best latest mocap techniques models single camera hands fingers" — Move.ai s2, FrankMocap, MinimalHand, old RGB-D. Mostly 2014-2020.
6. "mediapipe hand landmark jitter study temporal stability" — arXiv 2604.24609. The key neutral study.
7. "Warudo MediaPipe hand tracking jitter docs" — Warudo docs.
8. "temporal hand mesh recovery video stable arXiv 2026" — DanceHMR.
9. "DanceHMR joint temporal model body and hands arXiv" — paper details.
10. "MediaPipe Hands model card metric mean absolute error palm size distance from camera limitations" — TF blog, Holistic crop paper. Not the card.
11. "webcam finger tracking vtuber best jitter reddit" — blogs, tool pages. No useful Reddit thread. Dead end.
12. "HaMeR WiLoR video jitter temporal smoothing hand mesh" — Tamaththul3D, HaWoR, HaMeR supplement. Useful.
13. "latest 3D hand pose estimation video temporal transformer MANO 2026" — Deformer, PoseBERT, HMP. Nothing from 2026.
14. "HANDS workshop challenge 2025 3D hand pose winners" — ARCTIC track only.
15. "OmniHands Towards Robust 4D Hand Mesh Recovery via A Versatile Transformer" — paper.
16. "HaPTIC Predicting 4D Hand Trajectory from Monocular Videos code" — paper, repo.
17. "RTMW COCO-WholeBody hand AP whole-body pose comparison DWPose Sapiens" — RTMW and DWPose numbers. No Sapiens.
18. "WiLoR ONNX export C++ hand mesh inference without Python" — wilor-mlx only. No C++ found.
19. "Meta MEgATrack UmeTrack hand tracking keypoints kinematic fitting temporal jitter" — UmeTrack, MEgATrack, EgoForce.
20. "hand wrist body integration whole-body mesh recovery FrankMocap PyMAF-X Hand4Whole wrist mismatch" — PyMAF-X.
21. "reddit mediapipe hands alternative stable finger mocap" — no Reddit. SignAll blog. Dead end for Reddit.
22. "monocular hand face interaction capture deformation contact" — Decaf, DICE.
23. "3D hand mesh recovery motion blur blurry image" — BlurHandNet, ICME 2025.
24. "3D hand pose small hands low resolution full body image hand crop versus whole-body model" — MANO paper only. Gap.
25. "Fast SAM 3D Body real-time whole-body mesh hands" — paper, repo.
26. "XR Animator webcam finger tracking MediaPipe hands smoothing stable" — nothing on XR Animator; Animaze notes.
27. "SAM 3D Body paper hand decoder FreiHAND PA-MPVPE body decoder hand results arXiv" — arXiv 2602.15989.
28. "Hand Motion Prior HMP code MANO video denoising temporal hand smoothing network" — HMP, HandFlow.
29. "ViDiHand video diffusion hand reconstruction" — paper. Weights unconfirmed.

**Hugging Face API** (`/api/models?search=`): wilor, hamer, hawor, dyn-hamr, sam-3d-body, GEM-X, rtmw, sapiens gave results. hamba, mano-hand, hand-pose, 3d-hand gave only noise. handflow gave `mxxu00/HandFlow`. vidihand gave nothing. Per-model file lists were read for the models in the table.

**GitHub repo search** (`gh search repos`): "OmniHands", "HaMuCo", "sam3d.cpp", "gem-x.cpp", "SAM3DBody cpp", "Fast SAM 3D Body", "ViDiHand", "UniHand hand" returned repos. "Hamba 3D hand", "HaPTIC hand trajectory", "hand mesh recovery video temporal", "ComfyUI hand mocap", "ComfyUI SAM3DBody", "ComfyUI WiLoR", "sam-3d-body onnx", "hand mesh onnx runtime c++ MANO", "HaMeR onnx", "HMP hand motion prior", "hand motion prior MANO", "HandFlow flow matching hand" printed nothing. Those empties may be command failures, because `mxxu00/HandFlow` and others do exist.

**GitHub issue search** (`gh search issues`): WiLoR, HaMeR, sam-3d-body, HaWoR, Dyn-HaMR and GEM-X, with terms jitter, video, temporal, VRAM, memory, fps, real-time, onnx, smooth, hand, finger, slow, time, third person.

**Failures**
- `arxiv.org/pdf/2604.24609` fetched as unreadable binary; the HTML version was used.
- `pdftoppm` is not installed, so the PDF could not be rendered. The MediaPipe model card PDF stayed unread.
- `ai.google.dev` redirected to `developers.google.com`, refetched.
- `repos/rolpotamias/WiLoR/contents/LICENSE` 404; the file is `license.txt`.
- Guessed repo names that 404ed: Hamba-hand/hamba, wenbin-lin/RelightableHands, IDEA-Research/OmniHands, dulucas/SMPLest-X, kennethwdk/PromptHMR, yufu-wang/PromptHMR-Vid, ETH-AIT/hmp, enriccorona/HMP, vidihand/ViDiHand.
