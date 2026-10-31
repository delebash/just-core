# Action and anything in a movie: research for JustDirect features 12 and 13

The user, 2026-10-31: "we need to be able to do quality action swords cars ect"; "anything someone would wnat to put in a movies is part of the bar".
Method labels: **code** read in the source, **card** from the model's card, **user** a user report, **measured-here** on this PC. Nothing below has been run on action yet.

## 1. The answer so far

1. **Users report LTX-2.3 as great quality, weak motion.** A May 2026 r/StableDiffusion thread: "Great quality, no motion"; the workaround is motion made elsewhere, then a video-to-video pass through LTX ("rendering low-res Wan clips then doing a V2V pass through LTX"). Others: Wan 2.2 depth into LTX, Union Control for pose, fight LoRAs, and cutting around the action. **user**, no settings given. Our 3D guide test is this same pattern, with Blender as the motion source.
2. **Half-size guides are the key engine feature.** Motion Track Control, Union Control and Lightricks' DFR detail pass all use a reference at half the output size (ref0.5). Our guide handles full size only. **code**
3. **Motion Track Control is the best find.** You give a video with coloured spline overlays for the paths things should follow, and the model follows them. For a car's path or a sword's arc this is direct control. Lines can be drawn by hand or tracked from a video, so in the app they could come from the user, the AI or a 3D scene. **card**
4. **DFR is Lightricks' "production quality" path, on our same distilled model.** Half-size stage 1 with extra generated keyframes, then a full-size pass with a detailing IC-LoRA, plus optional temporal rounds to 48 fps, which should help fast motion. Lightricks calls the one-pass pipeline "primarily for educational purposes", though it was what made lips follow audio here. **code, docs**
5. **Cloud leads on fights by the only sources found:** Seedance 2.0 and Kling 3, from a vendor guide that sells access to them, so biased. No head-to-head of fast action exists in what I searched. A gap in the search, not proof.

## 2. Candidates

| # | Method | What it gives action | Weights | sd.cpp needs | State |
|---|---|---|---|---|---|
| 1 | Motion Track Control IC-LoRA (Lightricks) | Exact paths for cars, swords, runners | 312 MB, ungated, community licence, ref0.5, modified 2026-10-22 | Half-size guide | Downloaded for test |
| 2 | Union Control IC-LoRA (Lightricks) | Pose, depth, edges from any motion source, including 3D | ref0.5, in the scene research | Half-size guide | Planned |
| 3 | Our guide + 3DREAL on a moving 3D scene | Exact shapes and paths from Blender or JustStage | On disk | Works today, factor 1 | Gray run proved motion and layout, look not yet |
| 4 | MotionDeblur IC-LoRA (`oumoumad`) | Clears fast-motion smear as a repair pass; heavy blur is "softened rather than fully eliminated" | 1,248 MB, ungated, community licence | Works today if factor 1, not stated on the card | Downloaded for test |
| 5 | DFR pipeline | Better detail, generated keyframes, up to 48 fps | Distilled on disk; detailing IC-LoRA 624 MB, `gated: auto`; temporal upsampler | Half-size guide, keyframe slots, temporal rounds. Large | Read, not planned yet |
| 6 | Motion Enhancer n4w (`rzgar`) | General motion strength; tuned on adult content, "general-purpose" by its card; 3 of 5 usable on full-body input | 2,167 MB, Apache-2.0 | None | Test on action |
| 7 | motion_stabilizer v2 (`vpakarinen`) | Smoother human motion | 643 MB, Apache-2.0; card says 15 to 30 steps, so may not suit distilled 8 steps | None | Lower priority |
| 8 | Wan 2.2 low-res, then LTX V2V | The users' workaround | Wan 2.2 14B needs heavy streaming here; FastWan 5B is in `cli.js` | Guide works today | To test once baselines exist |
| 9 | Go-with-the-Flow noise warping (Netflix, CVPR 2025) | Motion from optical flow, any model | Code and weights on GitHub, per the paper | Noise warp input. Unread | Read next |

## 3. Tests, in order

1. **Baseline, no new code (`queue16.ps1`):** sword duel, car chase, explosion. FLUX.2 klein keyframe, then LTX. Judge shape hold: blade, car body, hands.
2. Half-size guide in sd.cpp, then Motion Track Control on the worst of the three.
3. The motion source test: a fast 3D blockout with coloured props through the guide.
4. MotionDeblur as a repair on the best clip.
5. **Movie shot set:** dialogue close-up, two people talking, crowd, animals, hands at work, dance, water, fire, night exterior, wide landscape, a creature, stylized animation.

## 4. Query log

- "best AI video model for fast action scenes fight scenes 2026" -> vendor lists: Seedance 2.0 and Kling 3 for fights (overchat, a seller), Veo 3.1 general. No head-to-head.
- "how to fix motion blur and warping fast motion AI video generation local LTX Wan" -> the r/StableDiffusion snapshot in section 1; LTX's warble blog (fetch failed, header overflow, unread); hosted Retake.
- "sword fight AI video open source model workflow ComfyUI LTX-2.3 action" -> no sword workflow; a YouTube LTX fight workflow (unread); pose or depth V2V in GGUF workflow collections.
- "car chase AI video local model keep car shape consistent drift Wan 2.2 LTX" -> no shape test exists; Remade-AI car chase LoRA for Wan 2.1.
- "latest techniques controlling fast motion video diffusion pose control depth previs action choreography open weights" -> Go-with-the-Flow, MOFT.
- Hugging Face API, sorted by downloads: "ltx-2 lora", "ltx-2.3 lora", "ltx2 lora", "ltx-2.3", "ltx lora action", "ltx lora fight", "ltx lora motion" -> 130 LTX repos; the names filtered by motion words gave rows 1, 4, 6 and 7, Lightricks' camera LoRAs for LTX-2 19B and slow motion for 2.5.
- Lightricks docs read: `pipeline-selection.md`, `pipelines.md` §12, `multimodal-guidance.md`, `constants.py`, `dfr_pipeline.py` header.

- "LTX 2.3 fight LoRA civitai punches sword action motion lora" -> `Muapi/ltx-2.3-swordbattle` (a listing with no training data or examples, unchecked); `vpakarinen/motion-stabilizer-ltx-23`; **`Lightricks/LTX-2.3-22b-LoRA-Foley-V2A`**, gated, adds sound effects to silent video, worth testing for feature 11; `joyfox/LTX-2.3-Transition-LORA`.
- "LTX 2.3 settings for fast motion action shots steps sampler euler_ancestral res_2s tips reddit" -> no sampler findings. A prompt guide: "fast action" alone is unpredictable, name the concrete motion. A test: tiny moving objects wobble.
- YouTube `Povm432cVtg`, "LTX 2.3 Fight Scene Workflow in ComfyUI": the page gave the title only.

Lightricks' Motion Track example workflow (`LTX-2.3_ICLoRA_Motion_Track_Distilled.json`): a chase scene, one pass at 960×544 × 121, the same 8 distilled sigmas, `euler_ancestral_cfg_pp`, CFG 1, the dev model with the distilled LoRA at 0.5, IC-LoRA at 1. **Note for quality:** that is the dev model at half distilled strength, not our full distilled file.

Not searched yet: Civitai directly (named by a user; blocked to the fetch tools so far), LTX-Director, Reddit directly.
