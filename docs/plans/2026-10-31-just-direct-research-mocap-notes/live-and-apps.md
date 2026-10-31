# One-camera mocap: live webcam capture and how the leading apps work (as of 2026-10-31)

How to read these notes:

- Evidence tags: **code** (read in source, file and line given), **card** (model card or repo README, including the maintainer's own measurements), **paper**, **user** (a user report), **vendor** (maker's docs or marketing; claims stay claims).
- "(snippet)" means read only as a search-result summary, because the page itself could not be fetched.
- Web pages were read through a fetch tool that returns a summary, so quotes from web pages are as the summary gave them. Code facts were read directly from raw files on the default branch on 2026-10-31.
- Nothing was measured on this PC. No weights were downloaded and nothing was executed. Every 30 fps statement for the 2070 Super is an inference from published numbers on other cards.
- Licence, VRAM and platform are labels, never filters.
- Reddit could not be read: see the query log. User evidence is thin for that reason, and that is a gap in the search, not a lack of users.

**Biggest findings for the report writer**

1. **The best single-camera results are offline.** Move AI's single-camera models are all batch, and its real-time models are multi-camera ([vendor](https://developers.move.ai/docs/models)). Epic's plugin is offline ([vendor](https://dev.epicgames.com/documentation/metahuman/metahuman-animation-from-mono-video-capture-in-unreal-engine)). QuickMagic is "not presented as a real-time or streaming SDK" ([vendor](https://www.quickmagic.ai/facts)). Rokoko removed direct webcam recording in Vision 3.0 ([vendor](https://www.rokoko.com/insights/introducing-rokoko-vision-3-0)). RADiCAL's live cloud service closed on 2026-07-06 ([CG Channel](https://www.cgchannel.com/?p=175200)).
2. **The end-user capture apps whose internals can be read are all MediaPipe:** XR Animator, Warudo, BlendArMocap, MoCap AI and AI Mocap Studio. Webcam Motion Capture, Remocapp and CyanPuppets could not be read. Tools aimed at labs and developers differ: Sports2D and FreeMoCap's realtime path use RTMPose or RTMW, and SAM3DBody-cpp and ROMP have webcam modes.
3. **Epic's plugin is Meshcapade's work, rebuilt on a diffusion transformer** ([Michael J. Black post, reposted by Zicong Fan](https://ch.linkedin.com/in/zfancode)). It is free and local, but it runs only inside Unreal, with a static camera and one person.
4. **QuickMagic exposes its physics stage in its API:** `physicType` and `physicTimes` (1 to 6, where 6 means 10 passes) ([vendor](https://docs.quickmagic.ai/docs/video-upload.html)). It also offers SMPL output, which suggests a body-model core (inference).
5. **Mocai's "127-joint native rig" and "70 tracked keypoints" match MHR and SAM 3D Body exactly** ([vendor](https://mocai.ai), [paper](https://arxiv.org/html/2511.15586v3)). This is my inference, and Mocai does not say it.
6. **`AmmarkoV/SAM3DBody-cpp` (MIT) is a C++ runtime for SAM 3D Body:** ONNX Runtime plus ggml, webcam input, BVH export, no Python at runtime ([card](https://github.com/AmmarkoV/SAM3DBody-cpp)). It is the closest open code to our job.
7. **The MediaPipe Tasks API has no landmark smoothing, unlike the legacy library** ([user, issue #4507](https://github.com/google-ai-edge/mediapipe/issues/4507)). That is an engine-layer cause of jitter, separate from the model.
8. **RTMW-m runs in a browser on WebGPU at 13.3 ms** on an M4 Max through LiteRT.js ([card](https://huggingface.co/litert-community/RTMW-m-WholeBody-LiteRT)), and MediaPipe's pip package on Windows is CPU only ([vendor](https://ai.google.dev/edge/api/mediapipe/python/mp/tasks/BaseOptions?authuser=0), snippet). Runtime choice therefore matters as much as model choice.

## What is best today for real-time whole-body capture from a webcam, including fingers?

### Takeaway

Nothing shipped combines top quality with 30 fps and fingers. By quality, SAM 3D Body leads but runs at about 6 to 15 fps on strong cards. By live capability, the candidates are RTMW with hand crops plus our own IK, or PEAR for direct whole-body rotations, which claims 100 FPS and has no independent reports.

### Cited Findings

Ranked by quality and capability first. "30 fps" is the question for this feature, not a filter.

| Rank | Option | Output | Fingers | Published speed | 30 fps on a webcam? | Limit layer | Labels |
|---|---|---|---|---|---|---|---|
| 1 | SAM 3D Body (original) | MHR rotations, 70 keypoints, mesh | Yes, hand decoder and hand crops | "several seconds per image" ([paper](https://arxiv.org/abs/2603.15603)) | No | Model (ViT-H backbone) | Code [NOASSERTION in GitHub, SAM License](https://github.com/facebookresearch/sam-3d-body) |
| 2 | Fast SAM 3D Body | SMPL rotations by MLP, plus MHR | Yes | 6.3 to 8.3 FPS on RTX 6000 Ada; 65 ms on RTX 5090 ([paper](https://arxiv.org/html/2603.15603v1)) | No, about 15 fps at best | Model | [MIT code](https://github.com/yangtiming/Fast-SAM-3D-Body); SAM weights |
| 3 | SAM3DBody-cpp | MHR, 70 keypoints, BVH | Yes; `--refined-pose` adds hand crops | RTX 3090 backbone 150 to 200 ms; RTX 1000 Ada 6 GB 170 ms with TensorRT FP16 ([card](https://github.com/AmmarkoV/SAM3DBody-cpp)) | No, about 6 fps at the low end | Model, not runtime | MIT code; SAM weights; C++ |
| 4 | PEAR | SMPL-X plus scaled FLAME | Yes, one crop, no hand crop | 9 ms L40S; 11 ms RTX 4090; 15 ms RTX 3090 for inference; 23 to 35 ms with animation ([paper](https://arxiv.org/html/2601.22693v1)) | Maybe on the floor card, unproven | Unknown until measured | [Apache-2.0 code](https://github.com/Pixel-Talk/PEAR); needs SMPL-X and FLAME files |
| 5 | RTMW plus hand crops plus IK (our build) | 133 2D keypoints, then rotations from our solver | 42 hand keypoints in RTMW; better from a crop | See next section | Yes (inference) | Quality limit is the solver, not the model | Apache-2.0 |
| 6 | RTMW3D-x | 133 keypoints with root-relative z | Keypoints only | Third-party "~30 FPS on RTX 3090" ([card](https://huggingface.co/rbarac/rtmpose3d/blob/main/README.md), inconsistent card) | Likely, unproven | Model size (369 MB ONNX) | Apache-2.0 |
| 7 | Multi-HMR | SMPL-X, camera-space, multi-person | Yes | 30 FPS on V100 with ViT-S at 448 ([paper](https://www.arxiv.org/pdf/2402.14654)) | Borderline | Model | [NAVER licence](https://github.com/naver/multi-hmr) |
| 8 | MediaPipe (XR Animator's way) | 33 landmarks, 21 per hand, world landmarks | Yes, weak and jittery | 20+ fps on GTX1650-class ([vendor](https://github.com/ButzYung/SystemAnimatorOnline)); 15 to 30 FPS in Warudo ([vendor](https://docs.warudo.app/docs/mocap/mediapipe)) | About 20 to 30 | Hand crop 192 to 224 px (model); no smoothing (engine) | Apache-2.0 |

- SAM 3D Body uses two decoders so that body and hand optimisation do not conflict ([paper](https://arxiv.org/pdf/2602.15989), snippet).
- PEAR hands (PA-PVE, lower is better): 12.8 on EHF and 9.8 on UBody, against Hand4Whole 10.8 and 8.9, which uses a separate hand crop ([paper](https://arxiv.org/html/2601.22693v1)). So a single crop costs some hand accuracy.
- PEAR trades body accuracy for full expressiveness, and it still struggles with "extremely blocking and complex interactions" ([paper](https://arxiv.org/html/2601.22693v1)).
- Online temporal HMR is not live yet: OnlineHMR (CVPR 2026) reports 3.3 FPS with 0.30 s average per-frame delay ([secondary summary](https://www.alphaxiv.org/overview/2603.17355), snippet).
- The user's hand jitter has three recorded causes, in layers:
  - **Engine:** the Tasks API dropped the legacy `smoothLandmarks` option. Side-by-side users report more jitter on 0.10.1 than on 0.8.11 ([user](https://github.com/google-ai-edge/mediapipe/issues/4507)).
  - **Model:** hand landmarks are regressed on a 192 or 224 px crop ([vendor](https://developers.google.com/edge/mediapipe/solutions/vision/hand_landmarker)).
  - **Whole-body scale:** "input resolution strongly limits keypoint accuracy" for small parts ([paper](https://ar5iv.labs.arxiv.org/html/2407.08634), summarised wording).
- Warudo's own docs recommend Leap Motion Controller 2 over MediaPipe for more stable hands ([vendor](https://docs.warudo.app/docs/mocap/mediapipe)).

### Inferences

- Live capture and final capture are different jobs. Every top vendor gets quality from look-ahead, so a live webcam mode is best treated as preview, performance capture and streaming, with a second offline solve available on the same recording. Open decision for the report.
- The floor-card candidates worth measuring first are RTMW with hand crops, and PEAR.

### Gaps

- No independent report of PEAR's real webcam fps or VRAM. Its 100 FPS covers inference only.
- No head-to-head of hand quality between MediaPipe, RTMW hand keypoints and hand crops on webcam footage. The hands researcher covers this in depth.

## Which fast pose estimators beat MediaPipe, and what do they output?

### Takeaway

For fingers, the real options are the 133-keypoint family (RTMW, DWPose, RTMPose wholebody, ViTPose++ wholebody) and Sapiens, which is slow. YOLO26, RTMO, RF-DETR Keypoint and MoveNet ship 17 body keypoints, so they serve as detectors or body-only trackers.

### Cited Findings

| Model | Output | Keypoints | Weights and code | Speed with hardware | Runtime paths | Labels |
|---|---|---|---|---|---|---|
| RTMW-m 256x192 | 2D | 133 | Open | Pixel 8a GPU ~6 ms; browser WebGPU LiteRT.js 13.3 ms on M4 Max; Raspberry Pi 5 CPU 109.6 ms ([card](https://huggingface.co/litert-community/RTMW-m-WholeBody-LiteRT)) | ONNX, LiteRT, WebGPU | Apache-2.0; AP 58.0, hand AP 49.1 |
| RTMW-l 256x192 | 2D | 133 | Open | CPU 35.32 ms, CPU not named ([paper](https://ar5iv.labs.arxiv.org/html/2407.08634)) | ONNX, TensorRT | AP 66.2, hand AP 59.8 |
| RTMW-l 384x288 | 2D | 133 | Open | CPU 47.62 ms ([paper](https://ar5iv.labs.arxiv.org/html/2407.08634)) | ONNX | AP 70.1, hand AP 66.3 |
| RTMW-x 384x288 | 2D | 133 | Open | No latency published | ONNX | AP 70.2, hand AP 66.4 |
| RTMW3D-x 384x288 | 2D plus root-relative z | 133 | Open; [ONNX on HF](https://huggingface.co/Soykaf/RTMW3D-x) | Runs "real-time" in browser with WebGPU, no figure ([card](https://mmla.gse.harvard.edu/tools/rtmw3d)) | ONNX Runtime Web, rtmlib `Wholebody3d` ([card](https://github.com/Tau-J/rtmlib)) | AP 68.0, hand AP 62.7; H3WB MPJPE 0.057 ([paper](https://ar5iv.labs.arxiv.org/html/2407.08634)) |
| RTMPose-m / l wholebody (DWPose is this family, distilled) | 2D | 133 | Open | 4.00 / 5.67 ms GTX 1660 Ti TensorRT FP16; 13.50 / 23.41 ms i7-11700 ONNXRuntime ([card](https://github.com/open-mmlab/mmpose/tree/main/projects/rtmpose)) | ONNX, TensorRT, ncnn, MMDeploy C++ SDK | Apache-2.0; AP 60.6 / 63.1 for COCO+UBody |
| RTMPose-l 384x288 wholebody | 2D | 133 | Open | 7.68 ms GTX 1660 Ti; 44.58 ms i7-11700 ([card](https://github.com/open-mmlab/mmpose/tree/main/projects/rtmpose)) | As above | AP 66.5 |
| ViTPose++ wholebody | 2D | 133 | Open | No speed read; ViTPose-B about 86M, L 307M, H 632M params ([vendor blog](https://roboflow.com/blog/best-pose-estimation-models)) | rtmlib lists it ([card](https://github.com/Tau-J/rtmlib)); XR Animator ships Transformers.js, whose vitpose processor is in its tree ([code](https://github.com/ButzYung/SystemAnimatorOnline)) | Apache-2.0 |
| Sapiens / Sapiens2 | 2D | 17, 133, 308 | Open | No speed or VRAM found. Sizes 0.3B to 2B ([card](https://huggingface.co/facebook/sapiens/blob/5edcfe85b0d6b7137b5e351f44edf4e9303961eb/README.md?code=true)); Sapiens2 0.4B to 5B at native 1K ([paper](https://arxiv.org/abs/2604.21681)) | TorchScript | Sapiens licences; heavy (model layer) |
| RTMO-l | 2D one-stage | 17 | Open | 141 FPS on V100 with ONNXRuntime; faster than RTMPose above 4 people ([paper](https://www.arxiv.org/abs/2312.07526), snippet) | ONNX | Apache-2.0; AP 74.8; no hands |
| YOLO26n / m / x pose | 2D | 17 by default | Open | T4 TensorRT 1.8 / 5.0 / 12.2 ms; CPU ONNX 40.3 / 218.0 / 565.4 ms ([vendor](https://docs.ultralytics.com/tasks/pose/)) | ONNX, TensorRT | AGPL-3.0 ([repo](https://github.com/ultralytics/ultralytics)); mAP 57.2 / 68.8 / 71.6 |
| RF-DETR Keypoint | 2D with per-keypoint uncertainty ellipse | 17 by default, trainable to any layout | Open | Not stated ([vendor](https://roboflow.com/blog/best-pose-estimation-models)) | Python, Roboflow Inference | Apache-2.0 |
| MoveNet Lightning / Thunder | 2D | 17 | Open | ~7 ms / ~25 to 35 ms mobile CPU ([vendor blog](https://roboflow.com/blog/best-pose-estimation-models), inconsistent) | TF.js, TFLite | No hands (model) |
| BlazePose | 2D plus world landmarks | 33 | Open | Heavy model ~8 ms on WebGPU in LiteRT.js ([guide](https://betterstack.com/community/guides/ai/litert-js-browser-ai/), snippet) | MediaPipe, LiteRT.js | Apache-2.0 |

- rtmlib modes are `lightweight`, `balanced` (default) and `performance`; backends are `opencv`, `onnxruntime`, `openvino`, with `tensorrt` optional ([card](https://github.com/Tau-J/rtmlib)).
- **Real fps warning:** one user got a maximum of 7 fps with rtmlib, `onnxruntime-gpu` and CUDA on an RTX 3080 Ti Laptop on Windows 11 ([user, rtmlib #4](https://github.com/Tau-J/rtmlib/issues/4)). The maintainer suggested performance mode or warm-up, and no fix is recorded. Published numbers exclude pre-processing and may use TensorRT. Layer: engine and pipeline, not model.
- A person detector does not need to run every frame: Pose2Sim uses `det_frequency = 4` ([code](https://github.com/perfanalytics/pose2sim/blob/main/Pose2Sim/Demo_SinglePerson/Config.toml), line 79).
- rtmlib is adding RF-DETR as a detector option ([issues #71, #84](https://github.com/Tau-J/rtmlib/issues/84), titles only).
- Runtime paths:
  - **The kit:** `onnx` is already a kit runtime, in-process, with `onnxruntime-node` as the app's package ([code](file:///E:/Dev/Web/just-core/packages/core/src/runner/runtimes.js), lines 38 to 46).
  - **Windows providers:** Transformers.js adds `dml` on Windows and CUDA only on Linux x64 for `onnxruntime-node` ([code](https://app.unpkg.com/@huggingface/transformers@4.2.0/files/src/backends/onnx.js), snippet). Not confirmed in ONNX Runtime's own docs.
  - **Browser:** ONNX Runtime Web with WebGPU, WASM fallback, runs RTMDet-s plus RTMW3D-x ([card](https://mmla.gse.harvard.edu/tools/rtmw3d)).
  - **C++:** MMDeploy C++ SDK, and ONNX Runtime or TensorRT C++ examples ([card](https://github.com/open-mmlab/mmpose/tree/main/projects/rtmpose)).
  - **Vulkan:** ncnn is the only lead, with Android examples; no desktop Vulkan RTMPose project was found.
  - **MediaPipe:** pip GPU delegate is Ubuntu only ([vendor](https://ai.google.dev/edge/api/mediapipe/python/mp/tasks/BaseOptions?authuser=0), snippet). The JS build runs on GPU in Chromium with `delegate: "GPU"` ([code](https://github.com/ButzYung/SystemAnimatorOnline/blob/master/js/mocap_lib_module.js), lines 323 and 624). Layer: engine.

### Inferences

- RTMW-l 384x288 has 1.8 times the FLOPs of RTMPose-l 384x288 (17.7 G against 10.07 G), yet its CPU latency is only 7 percent higher; at 256x192 the CPU gap is 51 percent. From RTMPose-l's 7.68 ms, RTMW-l 384x288 probably sits near 8 to 14 ms on a 1660 Ti. This is an estimate; no GPU figure is published.
- The Electron renderer gives us WebGPU without Python, which fits the family stack. Native `onnxruntime-node` with DirectML is the other path. Both need measuring, and both would be routed through the kit.

### Gaps

- No GPU latency published for RTMW itself. The RTMW paper's table is CPU only.
- No VRAM figures for any 2D model here.
- Sapiens speed: searched twice, nothing found.
- No model newer than RTMW on 133 keypoints turned up. The search engine returned nothing dated 2026 for that query, so this is a gap, not a finding that none exists.
- RTMW3D output units confuse users: issue #3115 is unanswered ([user](https://github.com/open-mmlab/mmpose/issues/3115)).

## How do methods get from keypoints to bone rotations with stable depth?

### Takeaway

Live single-view depth comes from one of three places: per-joint z from a network, a fit body model, or tricks such as bone length, palm size and camera FOV. Quality tools regress rotations directly. Tools built on landmarks use geometry and hold bone lengths fixed.

### Cited Findings

**Per-joint depth from the network**

- BlazePose world landmarks are metric with origin at the hips, trained from GHUM fitted to 2D, with annotators' depth-order hints cutting depth-ordering errors from 25 to 3 percent ([paper](https://arxiv.org/pdf/2206.11678), snippet). The screen-space z is "not recommended" ([card](https://developers.google.cn/static/ml-kit/images/vision/pose-detection/pose_model_card.pdf?authuser=9), snippet).
- FreeMoCap's maintainer says they skip MediaPipe's 3D because "the quality of the 3d data was so poor that it looked worse than just 2d" ([user, issue #575](https://github.com/freemocap/freemocap/issues/575)).
- RTMW3D predicts each keypoint's z-offset from a root point, with a z-axis mask so 2D-only datasets can still train it. MPJPE on H3WB is 0.056 to 0.057 ([paper](https://ar5iv.labs.arxiv.org/html/2407.08634)).

**Direct regression of a body model**

- SAM 3D Body: "This is not 2D-to-3D lifting." The focal length is estimated from the image diagonal and fed to the decoder, so the network learns to link apparent body size to metric depth, placing the body in camera space ([card](https://github.com/AmmarkoV/SAM3DBody-cpp)). Floor recovery is a separate later step. This is the HMR family's depth method.

**Analytical plus neural IK**

- HybrIK solves swing analytically from 3D joints and takes twist from a network, composing along the kinematic tree ([paper](https://openaccess.thecvf.com/content/CVPR2021/papers/Li_HybrIK_A_Hybrid_Analytical-Neural_Inverse_Kinematics_Solution_for_3D_Human_CVPR_2021_paper.pdf)). [HybrIK-X](https://ar5iv.labs.arxiv.org/html/2304.05690) extends it to the whole body. Code is [MIT](https://github.com/jeffffffli/HybrIK).
- A 2026 paper targets real-time single-frame rotations from dense 3D joints by graph attention ([paper](https://arxiv.org/pdf/2604.16629), snippet; the PDF would not load).
- MocapNET goes from 2D joints straight to BVH with an ensemble of orientation-tuned networks, real-time, up to v4 with hands and gaze ([card](https://github.com/FORTH-ModelBasedTracker/MocapNET)). Same author as SAM3DBody-cpp's lineage, per the repo's `mocapnet.bvh` template; authorship link not verified.

**Geometry from landmarks**

- Kalidokit computes "simple euler rotations"; only wrist and thumb get 3 degrees of freedom, and other finger joints rotate on Z alone ([card](https://github.com/yeemachine/kalidokit)). Layer: app.
- BlendArMocap sets the hip as origin, then derives chain rotations, torso and shoulder from landmark frames; finger x and z angles come from projections ([code](https://github.com/cgtinker/BlendArMocap/blob/main/src/cgt_core/cgt_calculators_nodes/mp_calc_pose_rot.py), lines 52 to 60, 96, 162; [hands](https://github.com/cgtinker/BlendArMocap/blob/main/src/cgt_core/cgt_calculators_nodes/mp_calc_hand_rot.py), lines 62 to 100).
- MoCap AI solves each bone parent-first against Blender's own evaluation of the rig, and joints the tracker cannot see are left unkeyed ([vendor](https://superhivemarket.com/products/mocap-ai/docs)).

**Stabilising bone length and root depth**

- FreeMoCap's rigidifier anchors the root, walks the tree outward, and for each bone keeps the observed direction but overrides the length with a rolling median over 10 s. Last-good direction fills dropouts ([code](https://github.com/freemocap/freemocap/blob/main/freemocap/core/tasks/mocap/rigid_body/skeleton_rigidifier.py), header; [config](https://github.com/freemocap/freemocap/blob/main/freemocap/core/tasks/mocap/realtime_filtering/realtime_filter_config.py)).
- XR Animator estimates hip depth with a user scale. At 0 percent it "freezes the z position (i.e. no camera depth estimation)" ([code](https://github.com/ButzYung/SystemAnimatorOnline/blob/master/images/XR%20Animator/translation.json), line 936).
- XR Animator adds arm depth by comparing palm size with shoulder width ([code](https://github.com/ButzYung/SystemAnimatorOnline/blob/master/images/XR%20Animator/translation.json), line 1314).
- Warudo estimates hand depth from the camera's diagonal FOV, pushes hands forward to prevent body clipping, and ignores hands near the top or bottom edge to cut jitter ([vendor](https://docs.warudo.app/docs/mocap/mediapipe)).
- Sports2D warns "The Z coordinate (depth) should not be overly trusted" and requires motion in the sagittal or frontal plane ([card](https://github.com/davidpagnon/Sports2D), line 410; [Pose2Sim README](https://github.com/perfanalytics/pose2sim), line 46).

**Filtering rotations correctly**

- SAM3DBody-cpp does not low-pass Euler or quaternion components for global rotation, because of Euler wrap and because SO(3) is not a vector space. It uses a quaternion SLERP-EMA with a geodesic clamp of 1 degree per frame by default ([card](https://github.com/AmmarkoV/SAM3DBody-cpp), Output filtering).
- XR Animator's One Euro filter has a quaternion mode ([code](https://github.com/ButzYung/SystemAnimatorOnline/blob/master/js/one_euro_filter.js), line 80).

### Inferences

- For a keypoint-based live path, the stable recipe from read code is: RTMW 2D, then RTMW3D or a lifter for z, then bone-length rigidifier, then parent-first rotation solve with joint limits, then a rotation-space filter. All parts have open examples. The smoothing researcher should own the filter detail.
- Root depth is the weakest link in every live tool read here. XR Animator exposes it as manual sliders, which says a lot.

### Gaps

- No published comparison of RTMW3D z against BlazePose world landmarks on webcam footage.
- No real-time whole-body lifter with hands and published webcam latency was found.

## What runs at 30 fps on the floor card, and what do bigger cards and CPU add?

### Takeaway

On an 8 GB RTX 2070 Super, keypoint pipelines fit 30 fps with room to spare. Direct whole-body rotations are the open test, and SAM 3D Body does not fit at any listed tier. These are inferences; nothing was measured.

### Cited Findings

Published anchors, all from sections above: RTMPose-l wholebody 384x288 at 7.68 ms on a GTX 1660 Ti, a weaker card than the floor; PEAR 15 ms on RTX 3090; SAM3DBody-cpp 170 ms on a 6 GB RTX 1000 Ada with TensorRT; Fast SAM 3D Body 65 ms on an RTX 5090; XR Animator 20+ fps on GTX1650-class.

- TensorRT through ONNX Runtime gave 1.6x over the CUDA EP in SAM3DBody-cpp, with keypoints within about 4 mm ([card](https://github.com/AmmarkoV/SAM3DBody-cpp)).
- Skipping hand crops below 64 px cut a frame from 213 to 135 ms ([card](https://github.com/AmmarkoV/SAM3DBody-cpp)). That is a useful gate for any hand-crop pipeline.
- Epic plugin: recommended hardware cited is 16 physical cores, 32 GB RAM, RTX 3070 8 GB ([secondary](https://digitalproduction.com/2026/06/23/metahuman-gets-markerless-mocap/)). A 10 s clip used about 3 GB extra VRAM on a 7900 XTX; a 3 s clip took about 2 minutes on an RX 6750 XT ([user](https://forums.unrealengine.com/t/epic-games-metahuman-animator-markerless-motion-capture-plugin/2729293?page=2)).
- ROMP: real-time on a 1070Ti ([card](https://github.com/saafke/romp), snippet); 45 to 50 fps on Windows with an NVIDIA card in a TouchDesigner tutorial ([user](https://derivative.ca/community-post/tutorial/3d-model-2d-image-or-video-input-humanpop/74494), snippet). Body only, no fingers (model).

### Inferences

| Tier | 30 fps live, expected | Better option at this tier | Below 30 fps |
|---|---|---|---|
| CPU only | MediaPipe; RTMPose-m wholebody (13.5 ms on i7-11700) with detector every few frames | RTMW-l 256x192 (35 ms) reaches about 20 to 25 fps | Any body-model regressor |
| 8 GB (2070 Super, floor) | RTMW-l or x 256x192 plus hand crops; RTMW-l 384x288 alone; RTMW3D likely; ROMP body-only | PEAR, to measure: 15 ms on a 3090 leaves headroom, but no VRAM figure exists | SAM 3D Body family at about 5 to 8 fps |
| 12 GB | RTMW-x 384x288 plus hand crops at higher resolution | PEAR with room for animation, Multi-HMR | SAM 3D Body family |
| 16 GB | As 12 GB, plus RTMW3D-x | Live keypoints and a Fast SAM 3D Body side pass at lower rate | Fast SAM 3D Body at 10 to 15 fps |
| 24 GB | As 16 GB | Fast SAM 3D Body near its published 15 fps | Still not 30 fps |

- The frame budget at 30 fps is 33 ms, and capture, decode, IK and streaming also spend from it.
- The rtmlib 7 fps report means the first measurement must be a full pipeline, not inference alone.

### Gaps

- No fps or VRAM report on a 2070 Super was found for any model. To be measured later.
- Whether PEAR or Multi-HMR fit 8 GB is unknown.

## Output and streaming: VMC, Live Link, OSC, BVH

### Takeaway

VMC is the cheapest live output and reaches Blender, Unity, Warudo and others. Unreal needs a plugin whichever way we go. BVH recording is simple, with two open writers to study.

### Cited Findings

- **VMC:** OSC over one-way UDP, bundled, about 1500 bytes per packet. Marionette listens on 39539, Performer on 39540. Protocol v3.1 ([spec](https://protocol.vmc.info/specification)).
- VMC messages: `/VMC/Ext/Root/Pos` and `/VMC/Ext/Bone/Pos` carry a name plus position (x, y, z) and quaternion (x, y, z, w). Bone names follow Unity's `HumanBodyBones`, including fingers. Blendshapes use `/VMC/Ext/Blend/Val` then `/VMC/Ext/Blend/Apply` ([spec](https://protocol.vmc.info/marionette-spec)). Handedness is not stated on that page; Unity convention is implied.
- XR Animator credits `osc-js` and, from v0.35.0, supports VMC over WebSocket ([code](https://github.com/ButzYung/SystemAnimatorOnline), README line 156; [release](https://github.com/ButzYung/SystemAnimatorOnline/releases/tag/XR-Animator_v0.35.0)). Its README lists VMC as Electron mode only (line 35). Layer: a browser page cannot open UDP sockets, so VMC over UDP needs the Electron main process or a server.
- **Blender receiver:** VMC Link, GPL-3.0, v0.3.1 on 2026-04-14, Blender 4.2 and newer, body, fingers, eyes, shape keys, can record ([vendor](https://extensions.blender.org/add-ons/vmc-link/)).
- **Unity receiver:** EVMC4U, MIT, last pushed 2024-08 ([repo](https://github.com/gpsnmeajp/EasyVirtualMotionCaptureForUnity)).
- **Unreal receiver:** VMC4UE lists UE 4.26 to 5.1, last pushed 2022-11 ([repo](https://github.com/HAL9HARUKU/VMC4UE)). Layer: app; it is stale, not impossible.
- **Live Link has two paths:** an Unreal source plugin, recommended for your own protocol; or a Message Bus provider in third-party software, which "must include Unreal Engine's core libraries" ([vendor](https://dev.epicgames.com/documentation/unreal-engine/live-link-plugin-development-in-unreal-engine)). Layer: engine. Message Bus uses Unreal's own UDP protocol ([vendor](https://dev.epicgames.com/documentation/unreal-engine/live-link-in-unreal-engine), snippet).
- Open example: JSONLiveLink, a UE4 plugin taking JSON over UDP, transforms, camera and light only, not skeletons, "not intended to be used in production" ([repo](https://github.com/moversevlad/JSONLiveLink), snippet).
- **Rokoko's stream** is custom JSON v3 over UDP with LZ4 ([vendor](https://support.rokoko.com/hc/en-us/articles/4410416376977-Custom-Streaming), snippet; [SideFX HDK sample](https://sidefx.com/docs/hdk/mocapstream_2_mocap_stream_rokoko_h_d_k_8_c-example.html)). Port 14043 not verified.
- **BVH:** XR Animator has `js/BVH_filewriter.js` and exports VMD, BVH and glTF ([code](https://github.com/ButzYung/SystemAnimatorOnline), README line 29). SAM3DBody-cpp's `bvh_writer` writes one file per person, rescales OFFSETs to the actor's measured bones, and ships MHR, MakeHuman and Mixamo templates ([card](https://github.com/AmmarkoV/SAM3DBody-cpp)).

### Inferences

- Order of work if asked: BVH recording, then VMC out, then a small Unreal plugin that reads VMC or a simple UDP format. A Message Bus provider inside our app is unattractive because of the Unreal core libraries.

### Gaps

- No maintained UE 5.x VMC receiver found. A VRM4U route exists but was not tested ([itch.io build](https://arekku.itch.io/vrm4u), snippet).
- No source on writing custom sources for Live Link Hub itself.

## How do the leading commercial apps get their quality?

### Takeaway

Stated or visible stages repeat across vendors: track and segment the person, regress body and hands, detect contact, lock feet, solve a floor, apply physics or joint limits, then filter. The core models are unreadable except Epic's in one sentence. Post-processing is where vendors say the most, and all of it can be rewritten by us.

### Cited Findings

Overall independent quality evidence is weak. No blind test of all leaders was found.

- The closest comparison is by TATO Studio, which sells animation services and describes no protocol. QuickMagic and Move AI lead, DeepMotion and Plask show sliding and twitching, and Rokoko Vision was "shaky and jumpy" ([source](https://tato.studio/blog/best-ai-video-to-mocap)). It mentions dual-camera, so it predates Vision 3.0.
- One r/vfx commenter: "quick magic was significantly smoother and accurate" than Move One, even with a busy background ([user](https://lr.psf.lt/r/vfx/comments/1k9cxss/ai_mocap_solutions/mpda12t/?context=3), snippet).

**Epic: MetaHuman Animator Markerless Motion Capture (UE 5.8, June 2026)**

- What: free including commercial use, Windows only, experimental, local; body and fingers ([CG Channel](https://www.cgchannel.com/?p=176626)).
- Internals, partly readable: built on Meshcapade tech. "We joined Epic just a few months ago and have completely rearchitected our approach"; "The model is now based on a diffusion transformer, which helps the model deal with occlusion"; "Body pose is 9% more accurate, the motions are 29% smoother, and foot sliding is reduced by 34%" (own testing against MoCapade); "The current version only works with a static camera and one person" ([post](https://ch.linkedin.com/in/zfancode)).
- Stages visible from users: 5 passes; crashes "always" at stage 4/5 on the same frame; jitter at chunk borders that went away when chunk size matched the clip; about 340 GB committed memory on 20,000 frames; DirectML `887A0005` device-removed errors; log line "Detector:2, Headpose:0, Solver:0" ([user](https://forums.unrealengine.com/t/epic-games-metahuman-animator-markerless-motion-capture-plugin/2729293?page=2), [page 3](https://forums.unrealengine.com/t/epic-games-metahuman-animator-markerless-motion-capture-plugin/2729293?page=3)). The solve is chunked, which explains the border artefacts.
- Quality per users: fingers surprisingly good "even at a distance and when occluded", some floating feet, weaker on moving cameras (early tester, [CG Channel](https://www.cgchannel.com/?p=176626)); feet floating and mesh clipping noted ([CGWorld](https://cgworld.jp/flashnews/01-202610-MetaHuman-MoCap.html), snippet). A skeptic: "The single camera is just not good enough" ([user](https://forums.unrealengine.com/t/epic-games-metahuman-animator-markerless-motion-capture-plugin/2729293?page=3)).
- Limit layers: Windows and Unreal only (app); one person and static camera (the post calls it the current version, so likely model plus app); mesh output tied to MetaHuman (app).
- The open ancestors are published: PromptHMR, TokenHMR, WHAM, BEDLAM ([Meshcapade science page](https://www.meshcapade.com/science)). One search summary said MoCapade is based on PromptHMR, but a follow-up search could not confirm it, so which of them MoCapade used stays open. PromptHMR is research non-commercial ([licence](https://github.com/yufu-wang/PromptHMR)); the method can be rewritten.

**Move AI (s2, s2-light, Move One)**

- What: s2 is single-camera, batch, one person, Dex hands, auto calibration ([vendor](https://developers.move.ai/docs/models/s2)). s2-light is Enterprise, ~0.5 to 1x real time, "up to 20x faster than s2" ([vendor](https://developers.move.ai/docs/models/s2-light); 20x from search snippet). The Gen 2 set adds an `enhance` motion-to-motion cleanup model ([vendor](https://www.move.ai/gen-2), snippet; page 404 on fetch).
- Technique claims: s2 improves "depth estimation from one view", with "greater motion stability, significantly better foot-planting, and smoother reconstruction" ([vendor](https://www.move.ai/gen-2), snippet).
- Readable: patent family GB2589843, US20230008567, EP4062371 by Zikos and Millar covers real-time multi-camera sports capture: detect and classify, per-object 2D skeleton by NN, map or triangulate to 3D, recursive estimators, Kalman, particle or unscented filters on a hidden Markov state, and holonomic joint constraints reducing over 200 DOF to about 58 ([patent](https://ipiq.io/patents/302049)). This predates s2 and is not its method.
- Production uses TensorRT, T4 GPUs, with Labelbox-labelled data ([partner blog](https://labelbox.com/blog/move-ai-is-revolutionizing-video-content-creation/), older).
- Internals of s1, s2 and Dex could not be read. Job posts: none found. Cloud for single camera (inferred from API; not stated on the s2 page). A competitor's blog says Move AI's multi-camera software can process locally on NVIDIA GPUs under Ubuntu ([Viggle](https://viggle.ai/blog/best-ai-motion-capture-tools-blender-unreal)); not checked against Move's docs.
- Complaints: noticeable foot sliding in Move One ([user](https://lr.psf.lt/r/vfx/comments/1k9cxss/ai_mocap_solutions/mpda12t/?context=3), snippet).

**QuickMagic (also powers iClone Video Mocap)**

- What: web, cloud, body, hand and face options, multi-person, QuickMagic LLC, Wan Chai ([vendor](https://www.quickmagic.ai/facts)). Developed with Reallusion for iClone Video Mocap ([CG Channel](https://www.cgchannel.com/2025/10/reallusion-launches-ai-motion-capture-service-video-mocap/), snippet). iClone's API has an `OnQuickMagicWebSocketNotified` service ([our notes](file:///E:/Dev/3D/just-stage/docs/plans/2026-10-29-research-03-iclone-pass2.md), line 463).
- Readable stages from API parameters ([vendor](https://docs.quickmagic.ai/docs/video-upload.html)): `physicType` is on by default and the server sets 2; `physicTimes` 1 to 6, where 6 means 10 passes; `isStaticCamera`; `baseModel` V1.0 or V2.1; `standPose` for in-place; `poseType` T, A or original first frame; person boxes `multiAddr` from a chosen frame.
- Contact editing: "IK contact detection" with feet in contact shown red and in the air green, which users correct ([vendor](https://docs.quickmagic.ai/docs/getting-gz.html)). The newer motion editor cleans foot sliding, jitter and penetration ([vendor](https://www.quickmagic.ai/tools/video-to-3d-animation)).
- SMPL (Beta) exports `.npz` with `global_orient`, `body_pose`, `transl`, `betas` ([vendor](https://www.quickmagic.ai/facts)). Core model not named.
- Input limits reveal the model: 720p or higher, flat camera angle because elevated views make motion lean, one continuous shot, steady subject size, small hands lose accuracy, hand capture "works best with simple dance moves" ([vendor](https://docs.quickmagic.ai/docs/getting-video.html)).
- Caution: the Product Hunt "maker" who praises ground contact is also the top reviewer and looks like a spam account ([page](https://www.producthunt.com/products/quickmagic-2)). I do not treat that as user evidence.

**DeepMotion Animate 3D**

- What: cloud; body, optional hands and face ([vendor](https://github.com/DeepMotion/Animate-3D-REST-API)).
- Readable stages from the REST API ([vendor](https://github.com/DeepMotion/Animate-3D-REST-API)): `sim` physics simulation, off by default; `footLockingMode` auto, always, never, grounding; `poseFilteringStrength` 0 to 1 "advanced AI filter"; `videoSpeedMultiplier` 1 to 8 for slowed footage; `trackHand`; `trackFace`; `upperBodyOnly`; two-phase multi-person with `pipeline=mp_detection` first.
- Auto foot locking switches "between locking and gliding modes" ([vendor](https://deepmotion.com/article/foot-locking)). Multi-level ground is supported in auto, always and grounding ([vendor](https://www.deepmotion.com/post/animate-3d-v2-6-release-foot-locking-modes), snippet).
- Physics Filter: "reinforcing joint limits, addressing self-collisions, and reducing clipping" ([vendor](https://deepmotion.com/article/physics-filter)). Motion Smoothing can reduce accuracy on some frames ([vendor](https://deepmotion.com/article/motion-smoothing)).
- Hands: merged with body results; 1080p recommended; fails when hands touch the face or each other, such as clapping (beta) ([vendor](https://www.deepmotion.com/post/animate-3d-hand-tracking-faq)).
- Origins: CEO Kevin He describes an articulated multi-body physics simulator later combined with computer vision ([interview](https://gamesbeat.com/how-deepmotion-uses-ai-to-create-believable-characters/), snippet). Chief scientist Libin Liu's SIGGRAPH 2018 paper used deep RL ([blog](https://blog.deepmotion.com/2019/09/10/procedural-animation-physics-simulation-and-virtual-beings/), snippet). No source ties that RL work to Animate 3D's solver. Core internals could not be read. Patents: only a "patent-pending" mention, no number.
- Complaints: twitching and sliding ([TATO](https://tato.studio/blog/best-ai-video-to-mocap)).
- Check on just-stage RESEARCH.md line 270: multi-person there is "up to 8 people"; the REST API now maps up to 16 `trackingId` values, marked experimental ([vendor](https://github.com/DeepMotion/Animate-3D-REST-API)).

**Rokoko Vision 3.0 and Rokoko Studio**

- What: cloud, monocular solver "rebuilt from the ground up" ([vendor](https://rokoko.com/products/video)). Dual-camera sunset, webcam capture removed, no finger tracking ([vendor](https://www.rokoko.com/insights/introducing-rokoko-vision-3-0)). The launch post calls the missing fingers intentional, and a search summary adds that fingers were not frequently requested ([vendor](https://www.rokoko.com/insights/introducing-rokoko-vision-3-0)). Layer: app decision.
- Readable: Studio's locomotion filter generates per-foot locks. Both locked: averaged. One: that foot holds. None: a jumping arc between locks. "Sliding is currently not supported". Users can drag lock keys. Treadmill mode drops locomotion. Drift Fix handles root drift ([vendor](https://support.rokoko.com/hc/en-us/articles/4410415474321-Filters-explained), snippet; support pages return 403 on fetch). A later update makes locomotion real-time ([vendor](https://support.rokoko.com/hc/en-us/articles/41620261484945-Rokoko-Studio-Update-Real-time-Locomotion-Drift-Fix), snippet).
- Solver internals could not be read.

**RADiCAL (dead; IP at Autodesk)**

- Autodesk bought the core tech and IP in April 2026, and the portal closed on 2026-07-06. Radical Live was cloud streaming ([CG Channel](https://www.cgchannel.com/?p=175200)).
- Readable method statements: rotations first, "skeletal joint rotations, expressed as quaternions", "explicitly considers the temporal dynamics of human motion", trained on "actual human motion, augmented with synthetic data" ([80.lv](https://80.lv/articles/radical-creating-ai-powered-3d-motion-animation)).

**Autodesk Flow Studio (Wonder Studio)**

- Cloud, body, face and hand from footage, camera track with focal length, alpha masks, clean plates, USD or FBX ([vendor](https://autodesk.com/products/flow-studio/overview)). Radical's fit is "selectively integrate" ([CG Channel](https://www.cgchannel.com/?p=175200)). Internals could not be read; no Wonder Dynamics patent surfaced.

**Plask**

- Browser, up to 5 minutes, horizontal video best, 24 source bones, "extracts up to the hand and index finger" ([vendor](https://knowledge.plask.ai/can-i-do-finger-tracking), snippet). Internals could not be read. Sliding and twitching ([TATO](https://tato.studio/blog/best-ai-video-to-mocap)).

**Mocai**

- Readable passes: per-frame segmentation; mesh and skeleton reconstruction including hands; occlusion repair and solved floor; export. "A limb behind a prop keeps moving instead of collapsing." Upright and floor solves, foot grounding ([vendor](https://mocai.ai)).
- Smoothing `off`, `standard`, `strong`, described as "zero-lag temporal smoothing" with raw keypoint JSON kept untouched. `rootMotion` is `drop-in` or `performer`. Status flow `queued`, `processing`, `baking`, `ready` ([vendor](https://mocai.ai/docs)).
- Clips upload to `api.mocai.ai`, so cloud (inference from docs).
- Inference: the 127-joint rig and 70 keypoints equal MHR and SAM 3D Body ([paper](https://arxiv.org/html/2511.15586v3); [SAM3DBody-cpp](https://github.com/AmmarkoV/SAM3DBody-cpp)). Mocai does not name its models.

**Uthana**

- Cloud API, video 2 to 60 s, finger motion included if hands visible. v2.0 returns base motion, v2.1 adds "model-native post-processing" ([vendor](https://uthana.com/models/video-to-motion)). Internals could not be read.

**Kinephy**

- `kinephy.ai` (the .com is parked). "physics based Generative AI", "Enact yourself", edit "with physics awareness" ([vendor](https://kinephy.ai)). One reviewer got only "Failed to create video2motion job" in November 2025 ([review](https://cgdivetest.super.site/tools/kinephy)). Internals could not be read.

**Live webcam, closed source**

- **Webcam Motion Capture:** local tracker plus separate Receiver app; hands and fingers are its strength; full body 720p; VMC and FBX export need a subscription; an iPhone can offload tracking ([vendor](https://webcammotioncapture.info/)). v1.12.2. Models unknown.
- **Remocapp:** local real-time webcam, fingers and face, Unity receiver plugin ([listing](https://assetstore.unity.com/packages/package/1549411)). Models unknown; "Remocap" as named did not resolve, so this is the likely match.
- **CyanPuppets:** "1-billion-parameter" model, camera or video, Blender and Unreal plugins ([news](https://letsdatascience.com/news/cyanpuppets-releases-billion-parameter-motion-capture-model-61b69f07)). No fps or GPU figures. Not independently checked.
- **Warudo:** MediaPipe built in, see above; wrists and fingers, not full body.

### Inferences: techniques we can write ourselves

| Technique | Seen in | How we could use it |
|---|---|---|
| Separate foot-contact detection, editable by the user | QuickMagic red and green dots, Rokoko lock keys | Show contact as a timeline and re-solve from edits |
| Auto lock, glide, always, never, grounding modes | DeepMotion | Expose four modes, default auto |
| Foot lock logic: both locks average, one holds, none arcs | Rokoko Studio | Simple rule set, works in real time |
| Multiple physics passes as a user setting | QuickMagic `physicTimes` | Offline quality slider |
| Physics filter: joint limits, self-collision | DeepMotion | Post-process pass; physics researcher owns detail |
| Solved floor plus upright correction | Mocai | Fit a plane from stance feet, correct camera tilt |
| Occlusion repair as a separate pass | Mocai, Epic's diffusion | Diffusion or interpolation over gaps |
| Slow-motion input and speed multiplier | DeepMotion `videoSpeedMultiplier` | Tell the solver the true speed |
| Static camera flag | QuickMagic, Epic, PromptHMR | Skip SLAM when the user says so |
| In-place option | QuickMagic `standPose`, Rokoko treadmill | Toggle root motion |
| Performer versus drop-in root scale | Mocai | Two export modes |
| Keep raw keypoints beside the smoothed result | Mocai | Re-solve without re-inference |
| Scene-cut detection before filtering | SAM3DBody-cpp offline | Never filter across a cut |
| Whole clip look-ahead, chunk overlap | Epic's chunk border jitter is the warning | Overlap and blend chunks |

### Gaps

- No Move AI, QuickMagic, Rokoko or Uthana paper, talk or job post giving core model details turned up. Job-post search returned only Mecka's unrelated role.
- YouTube comparison videos were not read; only their text descriptions could have been, and none surfaced.
- Whether Epic's solve runs through NNE and DirectML is an inference from one user's error.

## How do the open-source apps work, read from code?

### Takeaway

The open apps fall into three groups: MediaPipe with hand tricks (XR Animator), multi-camera labs (FreeMoCap, Pose2Sim, EasyMocap), and old or abandoned (FrankMocap, BlendArMocap). The best single-camera open code is outside the leads list: SAM3DBody-cpp.

### Cited Findings

**XR Animator** (v0.36.0, 2026-10-17, maintained, 1,984 stars; [README licence CC BY-NC-SA 4.0](https://github.com/ButzYung/SystemAnimatorOnline), line 127, which corrects just-stage RESEARCH.md line 1266, "no licence detected by GitHub")

- Models: MediaPipe `pose_landmarker_{lite,full,heavy}`, `hand_landmarker`, optional `holistic_landmarker`; pose runs on a chosen device, hands on GPU ([code](https://github.com/ButzYung/SystemAnimatorOnline/blob/master/js/mocap_lib_module.js), lines 322 to 341, 619 to 631).
- Filters: pose `OneEuroFilter(30, 1, 1, 2, 3)` on landmarks and world landmarks (lines 356 to 357); hands `OneEuroFilter(30, 1, 1/1000, 1, 3)` (line 709), so hands use a far lower beta. Pose beta and dCutOff scale with how small the person is in frame (lines 820 to 829). Arm target `[30, 0.5, 0.5, 1, 3]` and rotation offset one_euro in quaternion mode ([code](https://github.com/ButzYung/SystemAnimatorOnline/blob/master/images/XR%20Animator/animate.js), lines 5456, 5526).
- Hand pipeline: crops around pose wrists with a radius from shoulder width, then runs the hand model on that crop (`get_hand_canvas`, lines 1280 to 1330). `is_hand_visible` gates hands off-screen (line 1265).
- Stabilisation: hand tracker's wrist replaces body's wrist, fading back when tracking fails, default 20 percent; arm stabilisation uses hand data to cut false positives at the frame edge ([code](https://github.com/ButzYung/SystemAnimatorOnline/blob/master/images/XR%20Animator/translation.json), lines 1335 to 1386).
- Grounding is a toggle: "feet will always be grounded" (translation.json line 789). Output: VMD, BVH, glTF, VMC.
- Quality: developer-claimed 20+ fps on GTX1650; 116 open issues. Independent reviews: none found.

**FreeMoCap** (v2.0.0-alpha.25, 2026-09-24, active, AGPL-3.0, 10,625 stars)

- Multi-camera triangulation by DLT, with reprojection gating. The realtime chain is One Euro, velocity gate, rigidifier ([docs in repo](https://github.com/freemocap/freemocap/blob/main/freemocap-docs/docs/architecture/backend-pipeline-architecture.mdx)).
- One Euro defaults: `min_cutoff` 1.0 Hz, `beta` 0.01 per mm, `d_cutoff` 1.0, with a warning that metre-space beta would be 1000 times too responsive ([code](https://github.com/freemocap/freemocap/blob/main/freemocap/core/tasks/mocap/realtime_filtering/realtime_filter_config.py)).
- Default wholebody model `rtmw-x-l_256x192` ONNX; batched GPU inference; GPU OOM triggers session rebuild, up to 3 retries ([code](https://github.com/freemocap/skellytracker/blob/main/skellytracker/core/detectors/keypoint_detectors/rtmpose/wholebody/rtmpose_wholebody_detector.py), line 82).
- Single camera: no 3D today, by choice ([issue #575](https://github.com/freemocap/freemocap/issues/575)). Layer: app, because of the model's 3D quality.
- `rtmlib` and `onnxruntime-gpu` clash on install, solved in `pyproject.toml` lines 89 to 98 ([code](https://github.com/freemocap/freemocap/blob/main/pyproject.toml)).

**Pose2Sim and Sports2D** (BSD-3-Clause, both active, last pushes 2026-10-20)

- Pose2Sim: multi-camera, RTMPose by rtmlib, then triangulation, then OpenSim. Filters: Hampel outlier rejection, then butterworth, acc_minimizing, kalman, one_euro, gcv_spline, gaussian, LOESS, median, butterworth_on_speed ([code](https://github.com/perfanalytics/pose2sim/blob/main/Pose2Sim/Demo_SinglePerson/Config.toml), lines 247 to 249). IK filter default `acc_minimizing` (line 312).
- Sports2D: single camera or webcam, real-time display, 2D keypoints and angles, OpenSim IK with bone-length constraints, motion in one plane ([card](https://github.com/davidpagnon/Sports2D)).

**EasyMocap** (Project Registration License v1.0, pushed 2026-09)

- Fits SMPL, SMPL+H, SMPL-X and MANO from multiple views. Single view uses 2D keypoints with CNN initialisation from SPIN, in the style of SMPLify-X ([card](https://github.com/zju3dv/EasyMocap)). Offline, not live.

**FrankMocap** (archived, CC BY-NC 4.0, last push 2022)

- Separate body and hand modules joined afterwards, "reminds us of Frankenstein's monster"; body module 6 to 11 fps with rendering ([card](https://github.com/facebookresearch/frankmocap)). The method survives in SAM 3D Body's hand splice.

**BlendArMocap** (GPL-3.0, README says "Discontinued")

- MediaPipe inside Blender, geometry rotations, transfer through mapping objects to Rigify ([card](https://github.com/cgtinker/BlendArMocap)).

**Blender add-ons on Superhive**

- MoCap AI ($9.99) and AI Mocap Studio are both MediaPipe. Gaussian filter on curves; Medium "averaged 1.4° from the tracker" with drift up to 24 degrees on fast frames; separate Remove Jitter; Fix Foot Sliding corrects root travel; Keep on Ground per frame ([vendor](https://superhivemarket.com/products/mocap-ai/docs), [vendor](https://superhivemarket.com/products/ai-mocap-studio)). The 1.4 and 24 degree numbers are a rare honest smoothing trade-off.

**SAM3DBody-cpp** (MIT, 707 stars, pushed 2026-10-19; not in the leads list)

- Runtime: YOLO ONNX, backbone ONNX, decoder ONNX, ggml heads, native C LBS. Linux first; Windows headless only, GUI overlay not available (app layer) ([card](https://github.com/AmmarkoV/SAM3DBody-cpp)).
- ORT's CPU EP has no BF16 kernels, so CPU needs separate fp32 files (engine layer). CPU backbone takes 5 to 15 s (model layer).
- Hands: `--refined-pose` does body decode, per-hand crop decode with left crop flipped, keypoint-prompted second body decode, then a wrist-IK splice. It costs about +0.18 s; pass 1 fixes image alignment, which it calls the foot-slippage symptom.
- Live filter: Butterworth at 6 Hz default on position and joint vectors, quaternion SLERP-EMA on root.
- Offline binary, five passes: inference with scene-cut voting (background LK flow, HSV correlation, person-set discontinuity); global identity tracking by IoU and 3D distance with track merging; gap interpolation; jitter interpolation by velocity threshold; zero-phase `filtfilt` smoothing per shot; then BVH.

**Others that surfaced**

- MocapNET: active, custom licence (NOASSERTION), 2D to BVH real-time, MediaPipe webcam script ([card](https://github.com/FORTH-ModelBasedTracker/MocapNET)).
- ThreeDPoseTracker: last pushed 2021-10 ([repo](https://github.com/digital-standard/ThreeDPoseTracker)).
- Mediapipe-VR-Fullbody-Tracking: MIT, last pushed 2023-07 ([repo](https://github.com/ju1ce/Mediapipe-VR-Fullbody-Tracking)).

### Inferences

- XR Animator's tuning is the best public record of what MediaPipe needs in practice. Its value is the methods, since the licence is non-commercial and the code is one large script.

### Gaps

- Independent output-quality reports on XR Animator, EasyMocap single-view and SAM3DBody-cpp were not found.
- XR Animator's bone solver in `animate.js` (599 KB) was only sampled by grep, not read end to end. Its hip-depth computation was not traced.

## Which open code is good enough to base on or copy from, and which is not?

### Takeaway

Base the live 2D stage on RTMW through rtmlib's approach, the offline solve on SAM 3D Body via SAM3DBody-cpp's approach, and copy filter and hand-merging methods from FreeMoCap and XR Animator as our own code.

### Cited Findings

| Code | Verdict | Why | Labels |
|---|---|---|---|
| [RTMW](https://github.com/open-mmlab/mmpose/tree/main/projects/rtmpose), [rtmlib](https://github.com/Tau-J/rtmlib) | Base | Whole-body with hands; ONNX; the model needs no Python at inference, though rtmlib itself is Python; rtmlib maintained (pushed 2026-08) | Apache-2.0; mmpose itself last pushed 2025-08 |
| [SAM3DBody-cpp](https://github.com/AmmarkoV/SAM3DBody-cpp) | Base or copy for offline | C++, ONNX, BVH, hand splice, five-pass offline design | MIT code, SAM License weights, 5.2 GB CUDA models |
| [Fast SAM 3D Body](https://arxiv.org/html/2603.15603v1) | Copy methods | YOLO pose wrist crops, batched hands, 2.5M MLP from MHR to SMPL in about 0.5 ms | MIT code |
| [PEAR](https://github.com/Pixel-Talk/PEAR) | Test first | Fastest whole-body rotations on paper; code and demo exist | Apache-2.0, SMPL-X and FLAME terms separate, install is heavy |
| [FreeMoCap filters](https://github.com/freemocap/freemocap/tree/main/freemocap/core/tasks/mocap/realtime_filtering) | Copy method | Clean rigidifier and gate with tests | AGPL-3.0; rewrite |
| [XR Animator](https://github.com/ButzYung/SystemAnimatorOnline) | Copy methods | Hand crop, wrist merge, palm depth | CC BY-NC-SA; rewrite |
| [Pose2Sim filters](https://github.com/perfanalytics/pose2sim) | Copy method | Filter list and Hampel gate | BSD-3 |
| [MocapNET](https://github.com/FORTH-ModelBasedTracker/MocapNET) | Study | 2D to BVH directly | Custom licence |
| HybrIK | Study | Twist and swing IK | MIT code; SMPL terms |
| FrankMocap, BlendArMocap, ThreeDPoseTracker, Mediapipe-VR | Do not base on | Archived, discontinued or stale | Various |
| EasyMocap, Pose2Sim as a base | Not for one camera | Multi-camera by design | Various |
| Kalidokit | Reference only | Euler output, limited finger DOF | MIT |

### Inferences

- Everything here that rests on SMPL, SMPL-X, FLAME or SAM weights has model-licence terms for the report to label. Per the user's rule these are labels, and MHR itself is [Apache-2.0](https://github.com/facebookresearch/MHR).
- Per family rules, any engine goes through the kit, and copied code keeps its notice in `NOTICE.md`.

### Gaps

- No code from any option was run here, so "good enough" rests on reading only.

## Query log

Dead ends are marked. Numbers 60 to 62 failed outright.

**Searches**

| # | Query | Returned |
|---|---|---|
| 1 | best webcam mocap 2026 | DEAD END. Webcam buying guides only |
| 2 | best free AI mocap app | Listicles; names Rokoko Vision, Plask, Kapwing, Modif, Move One, Krikey, RADiCAL |
| 3 | best video mocap for blender unreal | SEO; names AI Mocap Studio, BlendArMocap, Mocap Fusion |
| 4 | real time pose estimation better than mediapipe | Weak. MediaPipe vs YOLOv8 study; no RTMPose |
| 5 | best latest mocap techniques models single camera | Move AI docs, Reboot Motion |
| 6 | reddit best single camera AI motion capture 2026 | No Reddit; Uthana, neolemon, Move AI |
| 7 | Move AI patent markerless motion capture neural network biomechanical model | SwRI patents, not Move's |
| 8 | Move AI engineering how it works gen 2 model training data motion capture CTO interview | Labelbox, Gen 2; no CTO interview |
| 9 | Move AI s2 s2-light review hands foot sliding users compare QuickMagic | r/vfx mirror snippets |
| 10 | QuickMagic vs Move One vs DeepMotion comparison test reddit | Aggregators; one r/vfx comment |
| 11 | QuickMagic AI mocap how it works hands quality Blender | Directories |
| 12 | RTMW whole-body pose estimation real-time ONNX fps webcam | Models, no fps |
| 13 | webcam full body tracking fingers real time vtuber best software 2026 XR Animator vs Webcam Motion Capture | Useful |
| 14 | real-time SMPL-X whole body mesh recovery webcam 30 fps 2026 | PEAR, Multi-HMR, Fast SAM 3D Body |
| 15 | Fast SAM 3D Body real-time full-body human mesh recovery | Paper, SAM3DBody-cpp lead |
| 16 | MediaPipe hand jitter alternative real time hand pose webcam 2026 | Background only |
| 17 | YOLO26 pose estimation vs RTMPose real-time keypoints | No head-to-head |
| 18 | docs.move.ai s2-light single camera model hands processing Move API gen 2 what's new | s2-light page |
| 19 | cgchannel Epic MetaHuman markerless motion capture plugin free single camera Unreal Engine 5.8 | CG Channel, docs, forum |
| 20 | DeepMotion Animate 3D how it works physics simulation foot locking motion brain patent | Foot locking docs; no patent |
| 21 | Rokoko Vision how it works AI video mocap dual camera technology hands | Vision 3.0 page |
| 22 | RADiCAL motion shutting down 2026 portal AI mocap technology how it worked | CG Channel, 80.lv, fxguide |
| 23 | Epic Games acquires Meshcapade 2026 | Confirmed by Max Planck, others |
| 24 | Meshcapade MoCapade how it works markerless motion capture single video SMPL hands technology | Thin; PromptHMR claim unverified |
| 25 | Rokoko Vision 3.0 review jitter foot sliding hands users | No user review of 3.0 |
| 26 | DeepMotion Animate 3D settings physics filter speed multiplier slow motion enhancement hand tracking documentation | REST API, help articles |
| 27 | Kevin He DeepMotion physics simulation deep reinforcement learning character talk GDC Animate 3D | Background; no Animate 3D talk |
| 28 | Rokoko Studio locomotion filter foot locking how it works cleanup filter documentation | Useful, 403 on fetch |
| 29 | Plask Motion AI mocap how it works patent company hands 2026 | Limits; no patent |
| 30 | Kinephy AI motion capture | DEAD END, other companies |
| 31 | Mocai AI motion capture video to animation app | iTechGuides only |
| 32 | Uthana video to motion how it works founders research motion model | Product pages; no paper |
| 33 | Autodesk Flow Studio Wonder Dynamics motion capture how it works technical moving camera hands body model | Marketing only |
| 34 | QuickMagic 动作捕捉 技术 原理 公司 AI动捕 手部 | Directories |
| 35 | Kinephy mocap video to animation Blender Unreal | cgdive page, kinephy.ai lead |
| 36 | Remocap AI mocap app webcam motion capture | Remocapp, thin |
| 37 | Warudo MediaPipe tracker webcam full body hand tracking docs | Warudo docs |
| 38 | Reallusion iClone Video Mocap QuickMagic how it works hand tracking | Confirms QuickMagic link |
| 39 | Move AI Ltd patent application pose estimation cameras Tino Millar | GB2589843 via award entry |
| 40 | Move AI research scientist job motion capture computer vision requirements inverse kinematics diffusion | DEAD END; Mecka job, not Move |
| 41 | Wonder Dynamics patent video actor motion capture character replacement system | DEAD END; Roku patent |
| 42 | DeepMotion Inc patent "physics" motion capture video pose estimation Kevin He inventor | DEAD END; patent-pending mention only |
| 43 | MoCapade 3.0 PromptHMR Meshcapade motion capture model based on | No confirmation |
| 44 | MetaHuman Animator markerless motion capture plugin test review hands fingers feet Steagall compared Move AI | Zicong Fan lead |
| 45 | "Real-time system for generating 4D spatio-temporal model of a real-world environment" | Patent family |
| 46 | Michael Black MetaHuman Markerless Motion Capture diffusion transformer "foot sliding" 34% Meshcapade Epic | Confirms post |
| 47 | rtmlib wholebody fps GPU onnxruntime issue slow RTX real time webcam | Setup hints, no fps |
| 48 | RTMO one-stage real-time multi-person pose estimation fps GPU results paper | 141 FPS |
| 49 | RTMW3D whole-body 3D pose real-time rtmw3d model speed GitHub | Paper, inconsistent HF card |
| 50 | Sapiens 2 Meta human pose lite model 2026 keypoints 308 speed | Sapiens2 exists; no speed |
| 51 | onnxruntime-web WebGPU RTMPose browser real-time pose estimation demo fps | MMLA demos, LiteRT.js; no fps |
| 52 | online causal real-time video human mesh recovery SMPL temporal low latency 2026 webcam GVHMR streaming | OnlineHMR |
| 53 | ROMP simple_romp real-time SMPL webcam fps GPU onnx CPU | Useful |
| 54 | BlazePose GHUM 3D world landmarks how computed hybrid heatmap z depth stability paper | Paper, model card |
| 55 | keypoints to bone rotations real-time inverse kinematics neural IK monocular Kalidokit HybrIK twist swing SMPL from 3D keypoints | HybrIK, amortised IK |
| 56 | Unreal Engine Live Link custom source plugin UDP Python stream skeleton data without Unreal C++ Live Link Hub | Docs, JSONLiveLink |
| 57 | Blender VMC protocol receiver add-on stream VRM OSC mocap live link blender 2026 | VMC Link |
| 58 | Rokoko Studio Live JSON UDP stream custom integration format port 14043 | Custom streaming; port unverified |
| 59 | XR Animator review full body webcam jitter hands legs depth users reddit vtubers | Changelogs; no reviews |
| 60 | single camera AI mocap quickmagic move one comparison (reddit.com only) | FAILED. API 400: reddit.com not accessible |
| 61 | webcam full body tracking XR Animator mediapipe jitter (reddit.com only) | FAILED, same |
| 62 | best free mocap from video blender hands (reddit.com only) | FAILED, same |
| 63 | AI motion capture comparison Move One DeepMotion Rokoko Vision QuickMagic tested results animator (extended) | tato.studio, listicles |
| 64 | mediapipe python GPU delegate Windows not supported CPU only tasks API | Ubuntu-only GPU |
| 65 | RTMPose ncnn Vulkan C++ deploy real-time fps rtmpose cpp onnxruntime | RTMPose paper; no Vulkan project |
| 66 | Sapiens pose estimation lite fps GPU VRAM issue real time video speed 1b 0.3b | DEAD END on speed |
| 67 | Move One app review foot sliding jitter hands animator test 2026 | Launch coverage only |
| 68 | DeepMotion Animate 3D review complaints jitter credits hands forum | Hand guide; no complaints |
| 69 | Mocap AI Blender add-on superhive how it works models hands rtmpose local | Both add-ons are MediaPipe |
| 70 | Momentum Human Rig MHR 127 joints SAM 3D Body parametric body model | Confirmed 127 joints |
| 71 | SAM 3D Body output 70 keypoints mhr70 pred_keypoints_3d hands | Confirmed 70 keypoints |
| 72 | CyanPuppets real-time markerless mocap webcam fingers plugin GPU | Thin |
| 73 | Unreal Engine VMC protocol plugin receive VRM motion Live Link VMC4UE VRM4U 5.x | VMC4UE stale |
| 74 | Live Link Hub custom data source plugin UE 5.6 developer write Live Link source third party skeleton | Live Link dev docs |
| 75 | best real-time pose estimation model 2026 | RF-DETR Keypoint, YOLO26, listicles |
| 76 | new whole-body pose estimation model 2026 133 keypoints real-time arXiv beats RTMW | Nothing newer; RTMW LiteRT build found |
| 77 | onnxruntime-node execution providers dml webgpu cuda Windows supported list | Secondary only |

**Failed or blocked fetches**

| URL | Result |
|---|---|
| docs.move.ai/knowledge/2nd-generation-models | 404 |
| move.ai/gen-2 | 404 on fetch; snippets only |
| docs.move.ai/knowledge/overview | 404 |
| docs.move.ai/knowledge/move-one-ios-app-release-notes | 404 |
| move.ai blog on neural rendering | 404 |
| lr.psf.lt r/vfx mirror | Redirects to a login |
| blog.deepmotion.com posts | TLS certificate mismatch |
| forum.deepmotion.com update log | TLS certificate mismatch |
| support.rokoko.com articles | 403 |
| patents.justia.com/patent/20230008567 | 403; read through ipiq.io instead, first 100,000 of 147,744 characters |
| data.epo.org EP4062371 | Bibliographic data only |
| GB2589843B on Google Patents | No claims in page |
| arxiv.org/pdf/2407.08634 | Binary; read through ar5iv |
| arxiv.org/pdf/2603.15603v1, 2604.16629 | Over the size limit; first read through HTML, second snippet only |
| kinephy.com | Parked, redirects to a sale page |
| sourcepulse.org SAM3DBody-cpp | 404; read on GitHub |

**Direct code and API reads**

`gh api` for repo metadata, READMEs, trees, licences and issues on: XR Animator, FreeMoCap, skellytracker, skellyforge, EasyMocap, FrankMocap, Pose2Sim, Sports2D, BlendArMocap, mmpose, rtmlib, DWPose, ViTPose, Sapiens, Sapiens2, Ultralytics, MediaPipe, SAM 3D Body, NLF, Multi-HMR, ROMP, HybrIK, PromptHMR, MHR, VMC4UE, EVMC4U, Kalidokit, ThreeDPoseTracker, Mediapipe-VR, PEAR, Fast SAM 3D Body, SAM3DBody-cpp, MocapNET. Issue searches on rtmlib, mmpose, MediaPipe, XR Animator, FreeMoCap. Raw files were saved to separate empty folders in the scratchpad and read only: nothing was executed.
