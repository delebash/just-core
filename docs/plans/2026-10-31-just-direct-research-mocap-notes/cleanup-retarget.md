# Mocap after the raw model output: cleanup, contacts, physics, collision, retargeting, export

Researched 2026-10-31. Read only: nothing installed, no weights downloaded, nothing run, nothing measured on this PC. Repo files were read from the GitHub API or raw URLs into scratch folders and never executed.

Evidence tags: **code** (read in source, file and line), **card** (model card or HF API), **paper**, **user** (a user or practitioner report), **vendor**. Vendor and paper numbers are claims, not measurements. Licence, VRAM and platform are labels beside each option, never filters. Limits name their layer: **[model]**, **[engine]** or **[app]**.

The body models, hands and live apps belong to other researchers. They appear here only where their output or post-processing code is the subject.

## Short answer

The pasted four-layer text is a rough sketch of real ideas, with wrong names and the wrong order.

- Open code now shows a better path than the text proposes. It is contact-driven kinematic correction, retargeting to the character, re-solving contacts on the character, and only then light smoothing.
- **The best single find is NVIDIA's MotionCorrection in the Kimodo repo.** It is C++17, Apache-2.0, CPU, and Python only through a thin binding. toyxyz RGB MoCap already ships a modified build of it on Windows for SMPL-X.
- **The best smoother found is SOMA-X's error-state RTS smoother on SO(3)**, Apache-2.0. It runs offline, adds no lag by construction, and has separate gains for hands.
- **Physics is not a post-filter you bolt on.** A plain PD ragdoll does not stand up without a trained policy or a "hand of God". The newest open answer, FlowHMR, trains physics into the weights, so no simulator runs at inference.
- **Self-collision has a training-free kinematic route:** capsule collision terms in an IK solver (Momentum, mink, PyRoki).

## 1. The pasted claims, checked one by one

### Takeaway
Layer 2 mostly holds. Layer 3 is wrong in its names and mechanism. Layer 4 is right about collision and wrong about the PD controller. The order is not what leading open systems do. The Move.ai and QuickMagic claim has no evidence either way.

### Cited Findings

| Pasted claim | Verdict | Evidence |
|---|---|---|
| Butterworth "deletes high-frequency noise and jitter" | **Holds, with limits** | `scipy.signal.butter` only designs the filter. Real use pairs it with `filtfilt` for zero phase: **code** Pose2Sim `Pose2Sim/filtering.py:540,553`. FreeMoCap uses a Butterworth low-pass at a nominal 6 Hz and warns the cutoff shifts if the frame rate is wrong: **code** `freemocap/core/tasks/mocap/posthoc_mocap_task.py:105-116`. OpenCap Monocular uses 4 to 8 Hz by activity: [paper](https://arxiv.org/html/2603.24733v1). These tools filter points for biomechanics, and a fixed cutoff also removes real strikes (see below). |
| One Euro "filters heavily when standing still but relaxes during explosive movements" | **Holds, but it is not the best offline choice** | Lowering `fcmin` reduces jitter and adds lag, raising `beta` reduces lag in fast motion: [maker page](https://gery.casiez.net/1euro/). It is causal, so it lags. Pose2Sim and mixamo-llm-mocap run it forward and backward to remove that: **code** `filtering.py:94-96`, `pipeline/retarget_smplx.py:341-367`. On AIST++ with VIBE, the SmoothNet paper reports One Euro behind Gaussian and Savitzky-Golay, and blames its frame-by-frame design: [paper](https://arxiv.org/pdf/2112.13715). These numbers came through a search extract the tool called partly garbled, so check the table before quoting them. |
| "ContactRefiner" library | **Not found** | GitHub repo search returns only a Google Contacts cleaner, `peter-fusek/contactrefiner`. GitHub code search returns grasping, robotics and molecule code (`Editor/Core/Grasp/ContactRefiner.cs`, `grasp/runtime/refinement/contact_refiner.py`, `prismatic/robot/contact_refiner.py`, molstar `refine.ts`). HF model search is empty. This is what was searched: it may exist under another name. |
| "FootMR" as a contact network | **Wrong** | FootMR is real, and it refines **ankle rotation only** by lifting 2D foot keypoints: [paper](https://arxiv.org/abs/2603.09681), **code** `hmr4d/model/footmr/pipeline/footmr_pipeline.py:143-150`. toyxyz's guide says it "is separate from foot contact locking": [user guide](https://github.com/toyxyz/toyxyz_RGBMocap/blob/main/docs/USER_GUIDE.md). The ExMR paper describes no contact or locking mechanism in FootMR: [paper](https://arxiv.org/html/2610.26213). |
| Contact network "based on the velocity of the ankle joints" | **Mostly wrong** | The network behind the claim is GVHMR's static head. Its input is image-derived features. Velocity only makes its **training labels**: **code** `gvhmr_pipeline.py:305-316`, `configs/exp/gvhmr/mixed/mixed.yaml:51` (`vel_thr: 0.15`). Velocity-threshold logic without a network is a heuristic: SOMA Retargeter `documentation/foot-contact.md`, toyxyz `mocap/correction.py:196-203`. |
| "If the contact probability is > 80%" | **Half right** | 0.8 is real. It is in GVHMR `postprocess.py:102`, copied to FootMR `hmr4d/model/footmr/utils/postprocess.py:110`, which explains how the name got attached. ExMR keeps it: `exmr/model/global_traj.py:27`. But it applies only on the static-camera path. The other path uses logits > 0, weighted by softmax (`postprocess.py:31-35`), and the IK uses a soft blend (`:133`). Kimodo defaults to 0.5 (`kimodo/postprocess.py:192`). toyxyz uses 0.65 or 0.75 plus geometry gates (`mocap/correction_settings.py:3-12`). |
| "clamps the foot's Z and Y coordinates" | **Wrong** | GVHMR subtracts the static joints' displacement from the **root translation**, and explicitly not Y: **code** `postprocess.py:105-111`, line 107 `pred_disp[:, :, 1] = 0  # do not modify y`. It then runs CCD IK on legs and arms, `max_iter=2` (`:143-163`). A joint coordinate cannot be clamped alone on an FK skeleton. Sliding also lives in both horizontal axes, so clamping "Z and Y" leaves one horizontal axis free in either up convention. |
| "completely erasing foot sliding" | **Wrong** | With that post-processing, GVHMR still scores foot sliding 3.64 mm on RICH and skating 1.59 mm on Wild-4K: [FlowHMR paper](https://arxiv.org/html/2610.03691v1). toyxyz's guide says detection "can leave residual sliding or penetration". The network can be "confidently wrong": near 1 while a foot slides 0.2 m, under 0.4 for 200 frames of real footwork: **user** [PITFALLS #41](https://github.com/squall01337/mixamo-llm-mocap/blob/main/docs/PITFALLS.md). |
| Ragdoll with AI joints as PD targets | **Wrong as stated** | See section 4. |
| "arms physically bump against the rigid body of the chest and cannot clip through" | **True only for simulated proxies** | PHC: "All inter-joint collisions are enabled for all joint pairs except for between parent and child joints": [paper](https://ar5iv.labs.arxiv.org/html/2305.06456), **code** `phc/data/cfg/robot/smpl_humanoid.yaml:3`. That holds for the simulated body, not the final character's mesh. Retargeting changes proportions, so clipping can return (inference). |
| PHC, PULSE, ProtoMotions, ImDy, PhysHMR, BeyondRetarget | **All exist. Two are not cleanup tools.** | See section 4. ImDy estimates torques and ground forces. BeyondRetarget outputs robots. |
| Order: filter, foot lock, physics, retarget | **Not what leading open systems do** | See section 2. |
| Move.ai and QuickMagic "excel because they apply strict rules to the tracking outputs" | **No evidence** | Move: "patented kinematic understanding of human physics and biomechanics" and "training AI models": **vendor** [/tech](https://www.move.ai/tech). That page speaks of a multi-camera system. An independent analysis says jumps improved "probably due to" a physics model, and flags that as a guess: **user** [Lessidance](https://www.lessidance.com/post/move-ai-gen-2-vs-xsens-traditional-mocap-killer-or-just-hype-part-1). QuickMagic's page only says to "Clean foot slide and jitter in the Motion Editor before mapping": **vendor** [page](https://www.quickmagic.ai/tools/motion-retargeting). A review credits it with spotting planted feet: **user** [CG Dive](https://cgdive.com/quickmagic-review-high-quality-ai-motion-capture/). DeepMotion is the one vendor with named post-filters: **vendor** [Physics Filter](https://deepmotion.com/article/physics-filter), [Foot Locking](https://deepmotion.com/article/foot-locking). Internal methods are unpublished, so the causal claim cannot be checked. |

### Inferences
- The ">80%" sentence looks like GVHMR's static head, seen through FootMR's copied `postprocess.py`, then described by someone who had not read the code.

### Gaps
- GVHMR's `vel_thr` units were not traced into `hmr_global.py`.
- I found no Move.ai documentation of single-camera post-processing.

## 2. The real order of operations

### Takeaway
No open system I read runs filter, lock, physics, retarget. Three repeated patterns: smooth **after** the IK or not at all; re-solve contacts **on the target rig** after retargeting; put physics **inside the model** rather than after it.

### Cited Findings

| System | Actual order | Evidence |
|---|---|---|
| GVHMR | Network, static-joint root fix, ground by -min(y), CCD IK. Gaussian on root translation only, no rotation filter. | **code** `gvhmr_pipeline.py:98-103`, `postprocess.py:50-51,75` |
| ExMR | Root fix, optional snap to ground, IK, **then** Gaussian smoothing, then ground shift, then face forward. Comment: "temporal smoothing, after the IK so that it also smooths the IK's changes". | **code** `exmr/model/exmr.py:197-228` |
| Kimodo MotionCorrection | Root Y warp, root XZ warp, rotation warp, effector-pin IK, contact IK, then pop removal around the IK. Comment: "Fixing the contacts with IK will introduce popping into the animation". | **code** `Utility.cpp:871,1103-1175` |
| toyxyz RGB MoCap | Model (with optional smoothing inside it), contact correction on source, retarget on rotations, **contact re-solve on target**, stabilise, export. | **code** `mocap/correction.py:293-498`, `mocap/retarget/pipeline.py`, [guide](https://github.com/toyxyz/toyxyz_RGBMocap/blob/main/docs/USER_GUIDE.md) |
| mixamo-llm-mocap | Resample (optional One Euro, **off by default**), then in one stage on the rig: floor, contacts, leg IK, locks. | **code** `retarget_smplx.py:842,891,989`, **user** PITFALLS #45 |
| SOMA Retargeter | Scale joints, IK per frame, **then** stabilise contacts and clamp limits. | [README](https://github.com/NVIDIA/soma-retargeter) |
| BeyondRetarget | Robot pose, contact prediction, Savitzky-Golay filter, contact IK, root non-penetration. Method name `canonical_contact_filter_ik_nonpenetration_v2`. | **code** `postprocess/final_robot_postprocess.py:1,26`, `postprocess_robot_motion.py:11,48` |
| FlowHMR | No simulator at inference: "the generator directly produces motion without simulation-based selection or correction". Physics is in training. | [paper](https://arxiv.org/html/2610.03691v1) |
| PHC / PhysHMR | The tracker replaces the post-process. PhysHMR's authors argue separate physics post-processing accumulates error across two stages. | [PhysHMR](https://arxiv.org/abs/2510.02566) |
| Blog workflow | Physics cleanup, retarget, fix artifacts, filter curves, export. Unsourced own testing. | **user** [StraySpark](https://www.strayspark.studio/blog/ai-mocap-indie-developers-2026-comparison) |
| Vendors | Unpublished. | |

Evidence that the pasted order hurts:
- A filter before the lock removes real motion: "fist speed 3.5 m/s vs 5–6 m/s", and "Even a gentle One-Euro filter cost 3–5 % of punch extension, so it is off by default": **user** PITFALLS #45.
- A 2D refit un-plants feet, so locks must come after: **user** PITFALLS #50.
- Foot locks do not survive proportion changes, because a retarget scales the root and rebuilds the legs: **code** `retarget_smplx.py` docstring lines 37-39, toyxyz `mocap/retarget/pipeline.py`.

### Inferences
A sequence that fits this evidence for JustDirect, offline:

1. Keep the raw output and per-joint confidence.
2. Reject spikes (Hampel, `filtering.py:70`). Fill short gaps. Long occluded gaps go to the generative infill in section 6.
3. Build contacts from the network, height, speed and, on a static camera, image stillness. Let the user edit them on a timeline, as toyxyz does.
4. Fix floor and root, then correct contacts on the source skeleton.
5. Retarget rotations with rest-pose alignment.
6. Re-solve contacts on the character's own feet. Apply the collision solve if wanted.
7. Run light SO(3) smoothing that respects contact pins.
8. Run numeric QA: foot skate, jerk, pops. Kimodo's `metrics/foot_skate.py` and mixamo `qa_clip.py` are worked examples.
9. Export.

Attack on this sequence:
- It is kinematic, so balance and centre of mass stay wrong where the estimator was wrong.
- It depends on contacts that can be confidently wrong, so the user timeline is not optional.
- Smoothing after IK can loosen a lock, which is why step 7 must respect pins. ExMR's own sigma is small, one frame at 30 fps (`exmr.py:26-27`).
- A live path cannot look ahead, so it needs causal filtering. That belongs to the live-apps researcher.

### Gaps
No published comparison of pipeline orders on the same clips was found. The sequence above is reasoned from code and one practitioner's notes.

## 3. Jitter, rotations and positions, foot pop

### Takeaway
Filter rotations on SO(3), never as Euler channels. Treat root translation separately. Prefer an offline smoother that looks both ways. Treat filtering as optional, because good temporal models may need little: "The raw GVHMR rotations were not noisy" (**user** PITFALLS #45).

### Cited Findings

**Ranked by quality of method for offline use:**

| Rank | Method | Evidence | Licence and cost |
|---|---|---|---|
| 1 | **Error-state RTS smoother on SO(3)**. State is a unit quaternion plus angular velocity, using shortest-arc log residuals "instead of smoothing raw quaternion components". Separate gains for hands (`r_obs=0.005, q_vel=35`) and body (`r_obs=0.06, q_vel=4.5`). Root translation smoothed too. | **code** SOMA-X `soma/fitting/rts_smoothing.py:4-10,39-58,488`, used by `tools/mhr2soma.py` | Apache-2.0. PyTorch, about 630 lines. No weights. CPU works. Written for SOMA joints, so gains need retuning for other rigs. |
| 2 | **Chordal Gaussian**: smooth rotation matrices, project back with SVD. Comment: "Axis-angle and quaternions are discontinuous". | **code** ExMR `exmr/geometry/smoothing.py:31-44` | GVHMR-derived non-commercial licence on code. The method is simple and rewritable. Sigma is one frame at 30 fps. |
| 3 | **Zero-phase One Euro on unrolled quaternions**, then renormalise. | **code** `retarget_smplx.py:341-367,380-382` | MIT. Pass-through for fast strikes by design, still costs 3-5% extension (**user**). |
| 4 | **Savitzky-Golay on quaternions** with renormalise. | **code** BeyondRetarget `postprocess_robot_motion.py:48,61` | CC BY-NC-4.0 code. Standard filter, trivial to rewrite. |
| 5 | **Butterworth `filtfilt`** on points or rotation channels. | **code** Pose2Sim. **user** StraySpark suggests 8 Hz on rotation channels, which it calls an example. | Pose2Sim is BSD-3-Clause. Standard method. A fixed cutoff has no notion of strikes. |

Other points:
- Filtering Euler axes separately gives "non-linear, unexpected results", and two passes cancel the delay: [Gyroflow docs](https://old-docs.gyroflow.xyz/tech/smoothing/) (camera orientation, not mocap).
- 6D is a network representation here (ExMR, FlowHMR, FootMR), not a filter space in any code read.
- Root: GVHMR smooths X/Z only so Y keeps jumps (`postprocess.py:50-51`). mixamo removes height drift continuously and horizontal drift "one footfall at a time" (**user** README, PITFALLS #40, #51).
- Resampling: linear 24 to 30 fps puts a velocity kink at every source frame. Use a C1 spline on unrolled quaternions (**user** PITFALLS #44). ExMR's `--export_fps` uses slerp for rotations ([docs](https://github.com/twehrbein/ExMR/blob/main/docs/OUTPUTS.md)).

**Foot pop, from the code that fights it:**
- Kimodo solves a separate problem to absorb the pop: keep original position, velocity and acceleration while hitting pins, with ADMM: **code** `TrajectoryCorrector.cpp:139-166`.
- Kimodo: if both ends of a contact interval are masked, "there's no way we can correct the contact without popping": **code** `Utility.cpp:63-64`.
- toyxyz: "Fading inside a contact created large skating errors and stronger release jumps", so transitions sit outside the stance: **code** `correction.py:91-93`. Also, a one or two sample tail must not start a new anchor: `:268-271`.
- ExMR bounds toe targets to 3 cm (`TOE_TARGET_MAX_OFFSET`, `global_traj.py:23`), because pulling a static toe back turned the ankle by tens of degrees: **user** [author's note, issue #12](https://github.com/toyxyz/toyxyz_RGBMocap/issues/12).
- "Static" is not "flat": a boxing stance stands still on its ball, so pivot on the lower point: **user** PITFALLS #53.
- Rest blends must not touch planted legs: **user** PITFALLS #46.

### Inferences
- A port of the RTS smoother to plain JS looks small, since it is a per-joint Kalman pass with no learned parts. Confidence from the model could feed the observation noise, so bad frames count less. That is an idea, not something the code does.
- Position-only filtering breaks bone lengths, while rotation filtering moves end effectors. So any rotation filter needs IK re-pinning afterwards. toyxyz asserts bone lengths stay exact (`pipeline.py`).
- Butterworth overshoot on sharp steps and RTS overshoot at impacts are expected from signal theory. I did not find a mocap measurement.

### Gaps
No head-to-head of RTS on SO(3) against One Euro or Gaussian on real single-camera output was found.

## 4. Physics: the real state of the art

### Takeaway
A plain PD ragdoll does not work for this job. PD is the actuator, and the policy is what keeps the body up. Every serious tracker needs a trained policy, which we cannot train. Open weights exist for some. None gives a clean path on Windows, 8 GB, without Python today. Training-free physics exists in research form but no film-ready tool was found.

### Cited Findings

**Does a plain PD ragdoll work?**
- In DeepMimic the policy sets PD targets. PD "abstracts away low-level control details". The policy still takes "several days per skill", and references must be "feasible to track": [paper](https://ar5iv.labs.arxiv.org/html/1804.02717).
- Tracking controllers built from clips with no feedback are sensitive to starting state and disturbance: robotics [patent](https://patents.google.com/patent/US8781624).
- PHC reaches 98.9% on AMASS "without applying any external forces", and about 90% on noisy video. It calls residual force "a 'hand of God' that puppets the humanoid": [paper](https://ar5iv.labs.arxiv.org/html/2305.06456).
- Even trained, PHC+ tracks only 78.79% of FlowHMR base output and 82.47% of its post-trained output on Wild-4K: [FlowHMR README](https://github.com/flowhmr/flowhmr).

So a plain PD ragdoll has no route to balance on noisy AI motion **[engine + method]**. Pinning the root would avoid balance but then it is the "hand of God", and it gives no physical plausibility for the legs (inference). Game active-ragdoll tools work in this pinned style, but my searches found only forum-level sources on that, so treat it as unverified.

**The tracker family (ranked by usefulness to us):**

| Candidate | What it is | Weights | Code / licence | Cost and limits |
|---|---|---|---|---|
| **FlowHMR** | Flow-matching estimator. Fine-tuned with a frozen PHC+ reward in Isaac Gym. Physics is in the weights. Jitter 6.71 vs GVHMR 20.69, penetration .06 vs 1.02 mm, skating 2.17 vs 1.59 mm (**worse**): **paper** | HF [fafsaf1/flowhmr-0.46B](https://huggingface.co/fafsaf1/flowhmr-0.46B), `flowhmr_latest` | Apache-2.0 source. Supporting models have other terms. SMPL-H needed. | 0.46B params. Peak about 10.7 to 14.89 GiB recorded by toyxyz, lower with Low Memory (**user**). No simulator at runtime. Ground plane only **[model]**. Objects and support surfaces not modelled **[model]**. |
| **ProtoMotions `soma-bones` tracker** | PPO tracker on SOMA 23-body, 66 actions, trained on BONES-SEED. **No SMPL needed.** | In repo via Git LFS, 41.8 MB, `provenance.json`. NVIDIA Open Model License. | Apache-2.0 code | Card: "Recommended runtime: IsaacLab", "Training simulator only" **[engine]**. Isaac Lab recommends 32 GB RAM and, in the [v2.2 docs](https://isaac-sim.github.io/IsaacLab/v2.2.0/source/setup/installation/index.html), 16 GB VRAM. Its [v3 beta docs](https://isaac-sim.github.io/IsaacLab/v3.0.0-beta2/source/setup/installation/index.html) say Windows support is still being completed. The floor is below that VRAM figure. Flat terrain only **[model]**. |
| **PHC** | Reference tracker, SMPL or SMPL-X, 32 FPS real time with sim: **paper** | Google Drive `download_data.sh` | BSD-3-Clear. SMPL files required. | Isaac Gym is deprecated legacy software ([NVIDIA](https://developer.nvidia.com/isaac-gym)). Python 3.8. An NVIDIA forum reply says Linux only, undated **[engine]**. Isaac Lab eval script exists. |
| **PhysHMR** | One policy from video to actions, on PHC and Isaac Gym | Google Drive `download_data.sh`. HF search empty. | No root licence detected, only a PHC third-party file. Fork `jeremydwong/mono_move_inference`. | Same stack as PHC. Preprint, no venue listed. The README's run path uses a prepared test file, with GVHMR image features as input. |
| **PULSE** | Latent skill space over PHC | README `download_data.sh`, not read | No licence detected | Isaac Gym. A motion representation, not a cleanup tool. |
| **MimicKit** | Peng's lightweight imitation kit. Isaac Gym, Isaac Lab, Newton. | Assets on SharePoint | Apache-2.0 | Training framework. |
| **ImDy** | **Not cleanup.** Estimates joint torques and ground reaction forces from motion. | Google Drive checkpoints, HF dataset `XinpengLiu/ImDy` | No licence detected. README: "code release is in progress". | SMPL. Could give contact labels from force, like UnderPressure (inference). |
| **BeyondRetarget** / Plus | **Robots only.** Video straight to humanoid robot joints, eight robots. | Stated released. Not checked. | CC BY-NC-4.0 | Not for characters **[model]**. Its contact head plus CCD IK post-process is a reference. |
| **Metatron** | Unitree G1 generative policy | HF `nvidia/Metatron-v1`, not gated, NVIDIA Open Model License | | Robot only **[model]**. Important as proof of a path: see below. |

**Training cost, ruled out as something we train:**
- PHC: about a week on one A100 (**paper**).
- ProtoMotions: AMASS in 12 hours on 4 A100s, BONES on 24 A100s (**vendor** README).
- DeepMimic: days per skill (**paper**).
- MoCapAct: about 50 years of wall-clock across 2,589 experts (**paper** [link](https://ar5iv.labs.arxiv.org/html/2208.07363)).
- FlowHMR's GRPO: costly repeated rollouts (**paper**).

We report them, we do not train them.

**Path without Python, in principle:** ProtoMotions exports a single ONNX with observations baked in. The Metatron browser demo runs a policy through ONNX Runtime, WebGPU first with a WASM fallback: **code** `demos/metatron/README.md`. Its application source is not published. MuJoCo has official JS and WASM bindings, but "Windows support remains experimental" as of Nov 2025 **[engine]**: **code** `wasm/README.md`. A SOMA tracker in MuJoCo is unsupported by its card, and sim-to-sim transfer is demonstrated in the README for G1 and H1_2 only.

**PyBullet vs MuJoCo:** PyBullet's last release is 3.2.7, 2025-01-30. MuJoCo's is 3.17.0, 2026-10-22 (PyPI API). Between them, MuJoCo is the live one.

**Training-free physics:**

| Option | What it does | Status |
|---|---|---|
| **SPIDER** | Sampling-based physics retargeting, no per-trajectory RL. Hands and humanoid **robots**. 10x faster than RL baselines, 18% better success: **paper** claims via summaries. | CC BY-NC-4.0, repo `facebookresearch/spider`. Runs on MuJoCo Warp. Not checked for human characters. Cost unknown. |
| **MuJoCo MPC** `humanoid/tracking` | Online MPC tracking mocap via residuals on root, head, toe, heel, knee, hand, elbow, shoulder, hip: **code** `mjpc/tasks/humanoid/tracking/tracking.h`. No training. | Apache-2.0. C++. "We have not tested MJPC on Windows" **[app]**. Quality on noisy AI input not found. |
| **Gärtner et al. CVPR 2022** | Trajectory optimisation with a full physics engine, "directly applicable without re-training": [paper](https://arxiv.org/abs/2205.12292) | Abstract only read. Code not found. |
| **OpenCap Monocular** | PyTorch refinement with contact penalties, then direct collocation or force tracking. No RL mentioned. 10 s video in under 2 min on RTX 4090: [paper](https://arxiv.org/html/2603.24733v1) | Apache-2.0 code. SMPL. Built for biomechanics, activity-specific **[app]**. |
| **PhysCap** | Real-time physics-based capture, contact by velocity under 5 cm/s: [paper](https://arxiv.org/pdf/2008.08880) | Older. Code not checked. |

### Inferences
- For JustDirect, physics via a physically trained estimator (FlowHMR-style) is the only route found that adds no runtime simulator. The trade-offs are its VRAM and SMPL-H.
- Running a tracker after retarget would need a character-specific policy, which we cannot train. So any tracker runs on its own body, before retarget. Proportions then undo some of its result.

### Gaps
- No inference VRAM figure for PHC or the SOMA tracker on an 8 GB card was found.
- The Gärtner PDF was too large to fetch. The DReCon PDF could not be read here.
- Isaac Gym's Windows status has only an old forum source.
- No open trained tracker for a human-like body outside Isaac-family runtimes was found.

## 5. Foot contact detection and body self-collision

### Takeaway
Combine signals rather than trust one network. For self-collision, use capsule terms in an IK solver. This is training-free and does not need balance.

### Cited Findings

**Contact detection candidates:**

| Candidate | Method | Weights, licence, cost |
|---|---|---|
| **ExMR `foot_contacts`** | Static prob > 0.8 **and** lowest part of the body within 5 cm, so a foot held in the air is excluded: **code** `global_traj.py:233-247` | Free with ExMR. Non-commercial code terms. HF `twehrbein/ExMR` not gated. |
| **toyxyz gates** | Confidence plus speed < .7 m/s, vertical < .8 m/s, within .12 m of the lower foot; airborne rejection; sole patches from 4 probes: **code** `correction.py:104-139,196-203,515-521` | MIT own code. CPU. Needs body mesh for sole probes. |
| **mixamo-llm-mocap** | Four votes: network, sole still on floor, foot still on screen, or foot carries the body alone. "The image is the best contact detector" on a static camera: **code** `retarget_smplx.py:536`, **user** PITFALLS #52 | MIT. CPU. Static camera only for the image vote **[app]**. |
| **SOMA Retargeter** | Speed and jerk with 0.1/0.2 m/s hysteresis, then plant gates on flatness, height spread, position delta: **code** `documentation/foot-contact.md` | Apache-2.0. Numbers are ready-made defaults. |
| **UnderPressure** | Network from motion to ground reaction forces to contact labels, trained on pressure insoles. Beats height and velocity thresholds, and stays robust to noise: [README](https://github.com/InterDigitalInc/UnderPressure) | Weights public and tiny: `pretrained.tar`, 4.0 MB in the repo. **Evaluation licence**: research only, excludes use in a product offered free or paid (`LICENCE.txt`). Dataset public. Its published method can be rewritten as a **tiny model** we train ourselves (in scope). Skeleton is Xsens-based, so it needs adapting. |
| **BeyondRetarget contact head** | Motion features to probability, label at 0.5 | CC BY-NC-4.0 |

BONES-SEED could train a tiny classifier. It is gated "auto" on HF with an `other` licence, and I could not read its terms. ContactVision (2026) learns heel and toe contact from video: [paper](https://onlinelibrary.wiley.com/doi/10.1111/cgf.70334). Code not checked.

**Foot correction candidates:**

| Rank | Candidate | Why | Licence, cost, no-Python path |
|---|---|---|---|
| 1 | **Kimodo MotionCorrection** | Full solver: root warp, two-bone IK, double-ankle handling, ADMM pop removal, effector pins. Rig-agnostic through parents, T-pose and four tags: **code** `motion_postprocess.py:27-53` | Apache-2.0. C++17, Eigen. CPU. Python only through `BindingsPython.cpp`. toyxyz's prebuilt `.pyd` shows an MSVC x64 build works. Uses `immintrin.h` and AVX (**code** `SIMD.h:9`, [toyxyz note](https://github.com/toyxyz/toyxyz_RGBMocap/tree/main/developer-build/motion-correction)), so a WASM build is unverified **[engine]**. Native addon looks feasible. |
| 2 | **toyxyz changes on top** | Anatomical knee axis, explicit contact targets, bounded solving, multi-level stairs mode, palm contacts, contact report | Modified Apache source plus MIT Python. `mocap/correction.py` is 712 lines. Tuned for SMPL-X 22 joints **[app]**. |
| 3 | **GVHMR/ExMR CCD pass** | Simple, soft, small. Weak on proportion change. | Non-commercial terms. Method is simple to rewrite. |
| 4 | **mixamo FK locks** | Hip-height solve and pivot on ball or heel. "planted feet lock flat or pivot". | MIT |

Paid Blender add-ons (Mocap Bone Lock, Foot Lock, Foot Flow) exist: **vendor** pages. Foot Flow's method and user reports were not published ([post](https://blenderartists.org/t/foot-flow-new-foot-animation-cleanup-add-on/1640052)).

**Self-collision, training-free:**

| Candidate | Evidence | Notes |
|---|---|---|
| **Momentum** `CollisionErrorFunction` | Capsule pairs, with a flag to filter pairs that overlap at rest: **code** `momentum/character_solver/collision_error_function.h`. Also plane collision and SDF collision, and a sequence solver with acceleration and jerk terms: `momentum/character_sequence_solver/`. | MIT. C++ with conda packages, plus pymomentum. CPU. Windows CI badge. Closest to a full answer. Note the flag matters for bulky characters whose arms overlap the body at rest. |
| **mink** `CollisionAvoidanceLimit` | "Self collision is achieved by adding a collision pair with the same geom group in both pair fields": **code** `src/mink/limits/collision_avoidance_limit.py` | Apache-2.0. Python on MuJoCo. Needs a MuJoCo model per character. |
| **PyRoki** | Self and world collision costs, capsules, hand and humanoid retarget examples. ProtoMotions v3 retargets with it: [README](https://github.com/chungmin99/pyroki) | MIT. JAX. JIT overhead, and "Mesh collision is approximated as capsules" **[engine]**. |
| **GMR** | **No collision** in its solver: only config and velocity limits. **code** `motion_retarget.py:102-105` | MIT |
| **Kimodo MotionCorrection** | **No body collision** in what I read. | Kinematic, floor and pins only |
| **DeepMotion Physics Filter** | "attempts to resolve self-collisions": **vendor** | Cloud, closed |
| **Cascadeur AutoPhysics** | Fixes ground contact and interpenetration by report: **user** StraySpark. Hand penetration tutorials exist. | Closed desktop app. Method not published. |

Neural retargeting with mesh awareness is in section 7.

### Inferences
- Attack on capsules: "Capsule proxies are optimistic; only the MESHES decide". One cheap model scored a kick as clearing by 4 mm while the real meshes intersected across 4 frames: **user** PITFALLS #33. A hood, glove or boot lives outside the proxy. So capsules can reduce clipping but cannot promise "cannot clip". A final mesh-against-mesh check (their `run_in_blender.py contact`) is the honest gate, and the `filterRestPoseOverlaps` flag shows bulky characters are a known case.
- Blocking arm-body contact also blocks intended contact, such as a hand on a chest. PITFALLS #38 says to separate intended from unintended contact by asking what the source video does at that frame. So a collision pass needs an off switch or a contact-keep list.
- PITFALLS #35-37 report that pose-level fixes for a grazing collision each moved the problem elsewhere. Expect some clipping to stay a manual edit.

### Gaps
No open tool solving arm-through-chest on arbitrary skinned characters for AI mocap was found. No timing for Momentum's collision solve on a clip was found.

## 6. Learned smoothers, diffusion refiners, occlusion infill

### Takeaway
SmoothNet is old, and I found no clear single successor. The strongest new refiner is HTD-Refine. For filling long occlusions, Kimodo and ARDY are the best licensed generative options, within sparse-keyframe limits.

### Cited Findings

| Rank | Candidate | Job | Weights | Licence, cost, limits |
|---|---|---|---|---|
| 1 | **HTD-Refine** (CVPR 2026 oral, best paper candidate) | Estimates 3D velocity and acceleration from video (PVA-Net), then optimises the whole sequence over an existing HMR result | `pvanet.pt` on Google Drive | AGPL-3.0-only. SMPL or SMPL-X. 30 FPS input only **[app]**. VRAM not stated. toyxyz integrates it. |
| 2 | **Kimodo** | Diffusion with constraints: full-body keyframes, end-effectors, root paths | HF `nvidia/Kimodo-SOMA-RP-v1.2` and others, NVIDIA Open Model License, not gated in the API rows read. SMPL-X model is research-only and gated auto. | Apache-2.0 code. About 17 GB VRAM, or under 3 GB with `TEXT_ENCODER_DEVICE=cpu`: **vendor**. Max 10 s per prompt, under 20 constrained frames per type: **vendor** [limits](https://research.nvidia.com/labs/sil/projects/kimodo/docs/key_concepts/limitations.html) **[model]**. Needs a text prompt. |
| 3 | **ARDY** | Real-time autoregressive diffusion with the same constraint kinds | Per README table | Apache-2.0 code |
| 4 | **RoHM** | Diffusion for noisy and occluded motion, global trajectory plus local | GitHub release v0 | CC BY-NC-4.0 (`LICENSE.md`). SMPL-X. Trained on AMASS. Cost not found. |
| 5 | **StableMotion** (SIGGRAPH Asia 2025) | Learns cleanup from corrupted data, no clean pairs. Used on a 245-hour soccer set: [paper](https://arxiv.org/abs/2505.03154) | OneDrive checkpoint, BrokenAMASS | MIT. SMPL+H. Built for optical data faults, not checked on video output. |
| 6 | **SmoothNet** | Temporal-only network for 2D, 3D, SMPL. VIBE accel 31.64 to 4.15, MPJPE 106.9 to 97.47 on AIST++: [README](https://github.com/cure-lab/SmoothNet) | Google Drive, windows 8, 16, 32, 64. No official HF. | Apache-2.0. Last push 2023. "ignores inter-joint correlations": [ESFP](https://arxiv.org/pdf/2506.21234). A 2026 study reports a smoothness vs responsiveness trade-off: [Sci Rep](https://www.nature.com/articles/s41598-026-54621-x). Small enough to retrain, per the tiny-model rule (inference). |
| 7 | **DPoser-X** | Whole-body pose prior for inverse problems, single pose | HF and Drive via `download_models.py` | MIT. SMPL-X, MANO, FLAME. Sits inside an optimiser, not a drop-in. |
| 8 | **HuMoR** | 2021 motion prior with optimisation | Not checked | MIT. Older. |

GENMO / GEM-X is covered by the body researchers: NVIDIA One-Way Noncommercial, HF `nvidia/GEM-X`.

### Inferences
- Using Kimodo to fill occluded frames (good frames as keyframes, gap generated, then MotionCorrection) is my idea. No source documents it. Sparse keyframe limits mean it fits gaps, not cleanup of whole clips.
- HTD-Refine is the one to watch for quality, but needs a body model and has AGPL terms. Its method is published and could be rewritten, except the PVA-Net weights, which would need retraining at unknown cost.

### Gaps
- No RoHM cost and no independent user reports on these refiners for film use.
- A head-to-head of HTD-Refine and ExMR's smoothing was not found.

## 7. Retargeting to any character, including hands

### Takeaway
No single open tool retargets SMPL-family motion to every rig with contacts. The best open implementations are toyxyz (Mixamo, VRM, PMX) and mixamo-llm-mocap (Mixamo). Robot retargeters carry good methods but target robots. A rig-agnostic JS tool with contacts was not found, so we would build one on published methods.

### Cited Findings

**Core formula:** `P_b(t) = S_j(t) . A_b . B_b`, the target bone takes the source world rotation, with a rest alignment A for limbs only. Spine, neck, head and collars stay unaligned, because "correcting" there injects error. SMPL-X arms hang about 16 degrees below T-pose. **code** `retarget_smplx.py:20-33`.

Practical traps: **user** PITFALLS
- #47 A flat foot is the rig's flat foot. Keep only the yaw of the alignment.
- #49 The SMPL-X ankle-to-ball line reads 18-22 degrees toe-out, the mesh 5-6.
- #19 Check proportions before correcting.

| Rank | Candidate | Targets | Contacts / collision | Licence, runtime |
|---|---|---|---|---|
| 1 | **toyxyz RGB MoCap retarget** | Mixamo FBX, VRM, PMX. Up to 8 characters. Scales root by leg length. No bone stretching. Custom mapping "not available yet" **[app]**. | Re-solves feet and palms on target, least squares, knee stabiliser. `mocap/retarget/solver.py` (1148 lines) | MIT own code, plus GPL scoped FBX sampler `selective_fbx.py`. Blender 4.5 runtime for import and bake **[app]**. Python. |
| 2 | **mixamo-llm-mocap** | Any Mixamo character. Two characters in one scene. | Floor, locks, pivots, QA gate, source-vs-result compare | MIT. About 8 GB VRAM for its GVHMR step. Blender 5.1+ for keying. Author notes numbers can pass while motion is wrong. |
| 3 | **Unreal IK Retargeter** | Mannequin, MetaHuman, any rig with IK Rig | Op stack, Floor Constraint op, Pelvis Motion: [docs](https://dev.epicgames.com/documentation/en-us/unreal-engine/retargeting-operation-stack-in-unreal-engine-5-8) | Needs Unreal Engine **[app]**, not bundled. Best fit for MetaHuman. |
| 4 | **Rokoko Blender add-on** | Any armature with name detection and a custom list | None. `COPY_ROTATION` + `COPY_LOCATION`, then bake: **code** `operators/retargeting.py:204-213,452` | LGPL-3.0. Needs Blender. Good for bone-name detection lists. |
| 5 | **three.js `retargetClip`** | Any SkinnedMesh | None | MIT, plain JS: **code** `SkeletonUtils.js:39,226`. A no-Python base. |
| 6 | **R2ET** / **MeshRet** | Mixamo-style skeletons | Mesh-aware, trained | Both MIT. MeshRet weights on Drive and needs Mixamo skeleton **[model]**. R2ET needs Mixamo data. Python and Blender. |
| 7 | **Spatially Adaptive Interaction Guidance** (KAIST, [2026](https://arxiv.org/html/2605.19355)) | Skinned characters | Penetration 14.730% vs R2ET 14.926%, user scores 4.6 vs 3.1 | Trained. Code said to be on a project page, unconfirmed. A search snippet said ReConForM was a baseline, but the part read lists MotionBuilder, SAME, R2ET, MeshRet. |
| 8 | **ReConForM** (Kinetix, [2025](https://www.alphaxiv.org/abs/2502.21207)) | Diverse morphologies, real time, 70% less floor penetration than earlier work (**paper**) | Key-vertex, optimisation based | No repo found by name search. A method we could write, since it is optimisation-based. |

**Robot retargeters, useful as methods:**
- **GMR**: MIT. mink IK, two-stage IK tables, per-body scale table, real-time CPU. Takes SMPL-X, BVH, FBX, GVHMR. Targets robots only **[app]**. Open issue "How to retarget for human 3d character?" has no answer (#55). A character as a MuJoCo model might work (inference). ExMR links to it.
- **SOMA Retargeter**: Apache-2.0. Needs NVIDIA GPU, Warp and Newton. Input is SOMA BVH only. "An arbitrary BVH... may load incorrectly" **[app]**. Unofficial fork `eden-soma-retargeter` adds SMPL input (from search snippets).
- **Momentum**: no retarget module found in a tree search. It has the solver parts: joint-to-joint, sequence, collision, and BVH, glTF, USD IO.

**"Expressive retargeting" research:** a plain search returned no matching 2026 paper. The closest are DexAvatar and SiGnature for SMPL-X fingers. This is what was searched: a gap in the search, not proof of absence.

**Hands:**
- ExMR outputs 15 finger joints per hand, flat hand mean. BVH has 55 joints with fingertips as end sites ([docs](https://github.com/twehrbein/ExMR/blob/main/docs/OUTPUTS.md)).
- toyxyz maps fingers by phalanx to Mixamo, VRM and PMX names: **code** `mocap/retarget/blender_bake.py:68-78`.
- mixamo-llm reads flexion per finger joint and falls back to a relaxed curl where the detector lost the hand: **code** `retarget_smplx.py:235-300`.
- Finger rest poses differ across rigs. MetaHuman's extra finger joint caused hand penetration after retarget: **user** [blog](https://yihuang.myblog.arts.ac.uk/?p=315), one anecdote.

**Avoiding the SMPL licence (a label, not a filter):**
- MHR repo: Apache-2.0. Output of SAM 3D Body (gated weights, SAM licence).
- `tools/mhr2soma.py` converts MHR to SOMA: Apache-2.0, **code**.
- SOMA-X: Apache-2.0, HF `nvidia/SOMA-X` not gated. Optional SMPL files are user-supplied. The README notes SMPL-Body was used for the SMPL-to-SOMA correspondence.
- Downstream on SOMA: Kimodo MotionCorrection, ProtoMotions tracker, SOMA Retargeter, Kimodo weights.
- So a chain with no SMPL file exists: video to MHR to SOMA to correction to retarget. That is a real alternative. toyxyz's pipeline by contrast needs SMPL-X for sole geometry.
- Anny, from `github.com/naver/anny`, is another identity backend. Its licence was not read directly.

### Inferences
- A character tool would need a bone-name map (Rokoko's lists), rest alignment (the formula above), a leg and arm solver, and a contact re-solve. All of it is published and in permissive code except Blender for loading some formats.
- Attack: FBX rigs have pre-rotations and odd bind poses, and that is where a hand-written retargeter breaks. toyxyz leans on Blender for this. Loading FBX without Blender is possible with ufbx or OpenFBX, but untested here.

### Gaps
- No open direct Character Creator (`CC_Base_*`) target mapping was confirmed. The Rokoko list source was not located.
- No open retargeter with both hands and contacts for MetaHuman outside Unreal was found.

## 8. Export without Blender or the FBX SDK

### Takeaway
BVH and glTF are easy from JS. FBX is the hard one, and there are now two real options without the SDK. USD has a lightweight option.

### Cited Findings

| Format | Best open writer | Notes |
|---|---|---|
| **BVH** | Plain text, write in JS. Reference: Kimodo `kimodo/exports/bvh.py` (Apache-2.0), ExMR `exmr/export.py` (non-commercial), Momentum `io/bvh`. | ExMR writes cm, y-up, 55 joints. Fingers included. |
| **glTF / GLB** | **glTF-Transform** (MIT, Node and web). **three.js GLTFExporter** (MIT, `processAnimation`, `processSkin`: **code** `GLTFExporter.js:2302,2412`). | Native fit for our stack. Momentum also writes glTF. |
| **FBX, no SDK** | 1. **toyxyz `mocap/fbx_writer.py`**: 180-line original MIT binary FBX 7.4 skeleton and animation writer. "No SDK, Blender runtime, third-party implementation or body data is embedded." LimbNode bones, BindPose, curves. **code** 2. **ufbx_write**: single C file, MIT or public domain, animation, skin and bone API present (**code** `ufbx_write.h:947-948,998,1144`). README: "still a work-in-progress". 21 stars. | Port option 1 to JS, or build option 2 as native or WASM (unverified). Option 1 writes animation-only skeletons, no mesh. |
| **FBX, weaker** | **assimp** exporter writes 7.5 with animation stacks (**code** `FBXExporter.cpp:85,638-662`), but open bugs report broken animation: [#5482](https://github.com/assimp/assimp/issues/5482), [#5980](https://github.com/assimp/assimp/issues/5980), [#6312](https://github.com/assimp/assimp/issues/6312), [#4714](https://github.com/assimp/assimp/issues/4714). **Blender** exporter is GPL Python and works headless. | |
| **FBX, SDK** | Autodesk SDK. FlowHMR (`fbx_utils.py:15`, `import fbx`). Momentum saving needs it too (`CMakeLists.txt:69-79`), loading uses OpenFBX. | Proprietary, not redistributable freely. OpenFBX and ufbx are readers. |
| **USD** | **OpenUSD** (full, heavy). **LightUSD**, formerly TinyUSDZ: C++17, dependency-free, Apache-2.0, reads and writes USDA, USDC, USDZ, UsdSkel marked done (`doc/api-status.md:121-129`), JS packages under `web/`. Momentum USD is an off-by-default option. SOMA-X `save_soma_usd`. | SOMA-X reads and writes UsdSkel animation (`docs/api/io.rst`). |
| **VRM / VMD** | `pixiv/three-vrm` has `three-vrm-animation` (MIT). toyxyz `mocap/retarget/vmd_export.py` writes VMD. | |

### Inferences
Non-Python export looks workable: JS for BVH and glTF, a ported or native FBX writer, LightUSD for USD. Attack: a hand FBX writer can load in one DCC and fail in another. Needs round-trip tests in Blender, Maya, Unreal and Unity. toyxyz documents Blender import settings, which hints at this.

### Gaps
No independent test of toyxyz's writer or ufbx_write in Maya or MotionBuilder was found.

## 9. Candidates, cost and the 8 GB floor

Nothing here was measured on this PC. "Not found" means a gap in the search.

| Step | Top candidate | Weights / gated | CPU or GPU | Floor (8 GB, 32 GB RAM) | Path without Python |
|---|---|---|---|---|---|
| Spike reject, fill | Hampel, spline | None | CPU | Fine | Plain JS |
| Contacts | ExMR rule plus gates | Comes with the estimator | CPU after model | Fine | JS rewrite |
| Foot correction | Kimodo MotionCorrection | None | CPU, per toyxyz docstring. Timing not found. | Fine, memory bounded by windows, `CORE=1024` | C++ native addon. WASM unverified. |
| Smoothing | SOMA RTS | None | CPU | Fine | JS rewrite |
| Occlusion infill | Kimodo-SOMA | Not gated | GPU, <3 GB with text encoder on CPU (**vendor**) | Likely fits, not measured | ONNX export not checked |
| Refiner | HTD-Refine | Drive, SMPL | GPU, not found | Unknown | None found |
| Physics in weights | FlowHMR | HF | GPU, peak 10.7 to 14.89 GiB, Low Memory test 2.77 GiB (**user**) | Tight, covered by body researcher | None found |
| Physics tracker | ProtoMotions SOMA | LFS, open | GPU sim | Below Isaac Lab's recommended VRAM **[engine]** | ONNX plus MuJoCo in principle, unsupported |
| Self-collision | Momentum | None | CPU | Fine | C++ core, conda or Windows build |
| Retarget | toyxyz or mixamo method | None | CPU | Fine | Rewrite in JS or use three.js base |
| Export | glTF-Transform, FBX port, LightUSD | None | CPU | Fine | Yes |

Notes for the family rules (from the kit's rules, not new decisions):
- Any model here would go through the kit as an engine, and this needs raising as a kit gap.
- Python-free options above are preferred where quality is equal. Quality ranks first.
- `AGENTS.md` says no ML packages in `core` dependencies, so sidecars or native addons would be the shape. That decision is for the user.

## Query log

Dates: all 2026-10-31. Every search is listed, dead ends included.

**Web searches**

| # | Query | Returned |
|---|---|---|
| 1 | how to clean up AI mocap | Tutorials, vendor blogs, StableMotion. Weak. |
| 2 | fix foot sliding mocap | Reallusion manual, Blender add-ons, forums. |
| 3 | remove jitter from motion capture best method | **Mostly video stabilisation. Dead end.** Old Hermite-fit paper. |
| 4 | physics based mocap cleanup | Review, Cascadeur tutorial, StableMotion. No tool. |
| 5 | best way to retarget mocap to any character 2026 | Vendor blogs, UE IK Retargeter. Nothing new. |
| 6 | FootMR foot contact mocap refinement | **Found FootMR, ExMR, toyxyz guide.** |
| 7 | ContactRefiner foot contact library motion capture | No such library. PyMO, UnderPressure, ContactVision. |
| 8 | ImDy imitation learning human dynamics motion physics github | ImDy paper. |
| 9 | PhysHMR physics human mesh recovery github | **Missed it.** Found through GitHub API. |
| 10 | BeyondRetarget motion retargeting physics | **Missed it.** Found through GitHub API. |
| 11 | SOMA Retargeter NVIDIA github SMPL Newton | Repo, `eden-soma-retargeter` fork, SOMA-X report. |
| 12 | best learned motion smoother SmoothNet newer 2025 2026 human pose jitter diffusion refinement | SmoothNet, ESFP, Sci Rep 2026. No clear successor. |
| 13 | Move.ai QuickMagic how it works foot lock physics post-processing | Reviews, no algorithm. |
| 14 | physically plausible human motion from monocular video open source 2026 | **FlowHMR, OpenCap Monocular,** PhysHO, HOI papers, Gärtner, PhysCap. |
| 15 | SPIDER sampling-based physics retargeting humanoid no training | SPIDER paper and summaries. |
| 16 | MuJoCo MPC humanoid tracking mocap without reinforcement learning trajectory optimization | HumanoidBench MPC paper. No mocap result. Task then found in repo. |
| 17 | ragdoll PD controller follow mocap target unstable falls over needs balance controller | Robotics patents, DReCon PDF link. |
| 18 | Move AI Gen 2 motion model physics biomechanical constraints foot contact how it works docs | Secondary coverage only. |
| 19 | DeepMotion Animate 3D physics filter foot locking motion smoothing documentation | Official pages. |
| 20 | reddit AI mocap cleanup workflow foot sliding jitter Blender best 2026 | **No Reddit threads returned.** Foot Flow, StraySpark, mixamo-llm-mocap. |
| 21 | diffusion motion denoising refine noisy mocap occlusion infill RoHM DPoser-X github weights | RoHM, DPoser-X. |
| 22 | write FBX file without FBX SDK open source library animation skeleton ufbx assimp export | Blender note, C# writer, Godot. ufbx-write found through GitHub. |
| 23 | contact-aware motion retargeting skinned characters self-penetration 2025 2026 ReConForM R2ET code | ReConForM, R2ET, KAIST 2026. |
| 24 | Unreal IK Retargeter 5.7 penetration floor constraint retarget ops MetaHuman Mixamo | Epic API and op stack docs, one blog. |
| 25 | Cascadeur AutoPhysics how it works mocap cleanup animation unpinning fix | Tutorials. Method not described. |
| 26 | Blender 5 built-in animation retargeting new feature add-on free mocap best retarget addon | Add-ons only. No built-in feature evidence. |
| 27 | expressive motion retargeting characters preserve style hands fingers SMPL-X to any rig 2026 paper | **No matching paper.** DexAvatar, SiGnature, Motion2MixamoRig, prompt2rig. |
| 28 | Isaac Gym deprecated Windows support Linux only Isaac Lab replacement requirements GPU | NVIDIA page, Isaac Lab docs. |
| 29 | PHC perpetual humanoid control training time single GPU days Isaac Gym num_envs memory | **Dead end.** Answer came from the PHC paper. |
| 30 | PuppetMaster active ragdoll muscle pin weight Unreal physical animation component kinematic root mocap collisions | **Weak.** Forum and blog only. |
| 31 | quaternion low-pass filter mocap rotation smoothing log map hemisphere flip lag overshoot animation curves | MathWorks, Gyroflow. Nothing on mocap. |
| 32 | SmoothNet vs one euro filter vs Savitzky-Golay comparison SMPL accel error MMHuman3D smoothing | SmoothNet paper table, partly garbled. |

**GitHub API:** repo searches: FootMR, ContactRefiner, PhysHMR, BeyondRetarget, ImDy inverse dynamics, "foot contact refinement mocap" (empty), ufbx_write, SPIDER dexterous retargeting, anny parametric human body naver, ReConForM (empty), R2ET, MeshRet, StableMotion, suzyn space retargeting (empty). Code searches: `ContactRefiner`, `"ContactRefiner" foot`, `collision repo:YanjieZe/GMR`, `butterworth org:freemocap`, `gaussian_smooth_rotations repo:twehrbein/ExMR`, `smooth_pose repo:NVlabs/SOMA-X`, `vel_thr repo:zju3dv/GVHMR`, `self_collision repo:ZhengyiLuo/PHC`, `enable_self_collisions repo:NVlabs/ProtoMotions`, `self_obs collision repo:NVlabs/ProtoMotions` (empty). Issue searches: PHC training time, PHC windows, assimp FBX export animation, toyxyz foot, toyxyz retarget, GMR mixamo or character.

**Repos with 404 (wrong guesses):** `yuanz1ng/GVHMR`, `nvidia/kimodo`, `ZhengyiLuo/PHC-MJX`, `zju3dv/WHAM`, `NVlabs/GVHMR`, `kinetixai/reconform`.

**Hugging Face API:** `nvidia/Kimodo*`, `twehrbein/ExMR`, `nvidia/Metatron-v1`, `nvidia/SOMA-X`, dataset `bones-studio/seed`. Search `physhmr` (empty), `contactrefiner` (empty), `foot contact` (empty), `smoothnet` (one unofficial empty repo, `pengyun1314123/SmoothNet`).

**PyPI API:** `pybullet`, `mujoco`.

**Fetch failures:** `arxiv.org/pdf/2205.12292` over size limit, abstract read instead. DReCon PDF downloaded but no PDF reader here. SFV abstract had no detail. Move.ai home page had no technical content, `/tech` read instead. BONES-SEED README raw fetch returned no licence lines, so its terms stay unread.
