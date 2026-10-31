# Making local video follow a staged scene: research (2026-10-30)

Nothing here was run. No model, no graphics card, no weights downloaded. Safetensors and GGUF headers were read with HTTP range requests. Clones are under
`F:\ClaudeCode\tmp\claude\E--Dev-Web\c6773446-0ddf-4d1c-b8d4-a350607697fc\scratchpad\research-clones\scene` and nothing in them was executed.

Proof labels: **code** (read in source), **header** (read from the weights file header), **card** (stated by the publisher), **user** (a user's report), **elsewhere** (someone's run on other hardware), **estimate** (my arithmetic), **unverified**.

## 1. The answer

- **First test: 3DREAL on LTX-2.3.** It does the exact job, needs no LTX-2.5, and is an ungated 156 to 312 MB LoRA on the base model already proven here at 410 s.
- **LTX-2.5 Layout-To-Render is not needed to start.** Its official recipe keeps the guide on both stages, which Lightricks' own memory line prices at 15 GiB for 1280×704. It is the better pick at 16 GB and up, and user reports on it are mixed so far.
- **The sd.cpp change is smaller than feared for most of these.** A full-size guide (3DREAL, Layout-To-Render, Cameraman, BBox) needs changes in `video.cpp` only. A half-size guide (Union, Motion-Track) also needs token dropping in `ltxv.hpp`.
- **Two things already run with no code:** H3 Ref2VA with a reference video and Wan VACE 1.3B with a depth clip. Both are worth one baseline run. Neither is the expected winner.

Corrections to the brief and the plan:

1. Lightricks' `docs/conditioning.md:34` says video conditioning uses `VideoConditionByKeyframeIndex`. That line is stale. The running code (`iclora_utils.py:218`) uses `VideoConditionByReferenceLatent`, which behaves differently (section 4). The keyframe class is used for image guides.
2. Plan §I.3, "guide on stage 1 by default", is true of `ICLoraPipeline`, but Layout-To-Render's recipe overrides it: guide and look still on both stages (`stage_2_ic_lora: true` in LTX Desktop's catalog).
3. Plan §I.3, "all of those are one engine feature", holds in shape, but there are two sizes of work (factor 1 and factor 2).
4. Gating (plan: "several gated") is confirmed per repo: Layout-To-Render, Ingredients and Slow-Motion are `gated=auto`; Union and Motion-Track are not.

## 2. Ranked table, best first

The order assumes quality first, judged on the 8 GB floor. Section 3 gives the best pick per tier. Weights are open unless noted. Sizes are from the Hugging Face API or the file header.

| # | Method | How it works | Proof | Weights | 8 GB outlook | Engine path |
|---|---|---|---|---|---|---|
| 1 | **3DREAL** (fal), Light, Strong, Strong v2 | IC-LoRA trained on CG and photoreal pairs. Clay clip drives motion and framing; a keyframe drives look | Weights, names, factor: header. "Exact composition": card. 132-clip film: fal's own write-up. No independent accuracy test found | 156 / 312 / 312 MB, video-only, rank 16 / 32. Ungated. Licence field "other", no terms on the card | **Good.** Stage 1 is 7,040 tokens, half of the 14,080 that stage 2 already fits at 7.2 GB (§G). New risk: reference VAE encode (section 4) | Small addition, `video.cpp` only |
| 2 | **Union Control + depth rendered from the 3D scene** (LTX-2.3, also used on 2.5) | IC-LoRA reads a half-size depth, canny or pose clip. Depth comes straight from the render, no depth model | Factor 2: header. Lightricks staff confirm pre-rendered depth (HF #1). User: Redshift Z "DOES WORK" (HF #4). Official 2.5 workflow loads this 2.3 file: code. AVControl "outperforms baselines" on the VACE benchmark: abstract only, no numbers seen | 624 MB, rank 64, video-only. Ungated | **Good, cheapest.** Stage 1 3,600 tokens at 1152×640. 1280×704 is not allowed, since stage 1 must be a multiple of 64 | Small addition plus token dropping in `ltxv.hpp` |
| 3 | **Layout-To-Render** (LTX-2.5, official) | IC-LoRA. Clay clip as a guide at frame 0, look still as a one-frame guide at frame -1, on both stages | Recipe: public copy of the workflow (code). Factor 1: inferred from LTX Desktop code, the file is gated. RTX 4090, 25 frames, 1280×640 in 31 to 89 s: elsewhere. "Does not establish exact camera fidelity": that same test. Two users on HF #5 report poor results and the look arriving late; unresolved | 1,248 MB, rank 128, gated. Header unread | **Risky as published.** Both stages cost 29,040 tokens, 15.07 GiB on Lightricks' line. Stage-1-only is a departure: Desktop allows no still in that mode | Same small addition, plus the -1 still |
| 4 | **Motion-Track Control** (LTX-2.3, used on 2.5) | IC-LoRA reads coloured spline overlays. From 3D, project actor points to 2D and draw them | Factor 2: header. Official 2.5 workflow: code. Purpose: card. No accuracy data | 312 MB, rank 32. Ungated | Good, same costs as #2 | Same as #2 plus a spline drawer in the app |
| 5 | **BBox-Control** (LTX-2.5, yuvraj108c) | IC-LoRA reads white boxes with a centre dot and trail. Regional prompts bind each object to its box through masked cross-attention | Header. Detailed card with method. Author: without regions it "does not reliably bind". Reference latent downscale 1: card. Trained on 152 clips, 15 multi-object, no overlaps | 312 MB, rank 32. GPL-3.0 | Good for tokens (factor 1). Needs LTX-2.5 | Boxes: small. Regions: medium, new text and mask plumbing |
| 6 | **Cameraman IC-LoRA v2** (Cseti) | Reference clip carries the camera move; the scene comes from the prompt or a picture | Header. Author on 1:1 match: "most probably never generates exactly the same camera movement" (HF #5). "Prompt matters a lot": card. Reference content can leak, rarer in v2, gone at 0.8 (HF #4) | 624 MB, rank 64, factor 1. v2 has no licence field; v1 Apache-2.0 | Fair. Author says no first pass below 960×512, which is 15,360 tokens with its guide | Same as #1. Sibling repo `ComfyUI-CameraReference3D` shows a neutral grey reference generator |
| 7 | **H3 Ref2VA + reference video** | Video latents condition the transformer as a reference, not as an aligned guide | In sd.cpp: code. Following a blockout: no evidence. fal's hosted "H3 Max 3D to video" says exact paths are not guaranteed: card | Pruned Q4_K_M 11.42 GB, text 18.22 GB | Runs: 480p measured 376 s (§H) without a reference video. A reference adds attended tokens | **In sd.cpp now**, no code |
| 8 | **MiniMax-H3 Fun ControlNet Union 2.0** | ControlNet branch on 10 of 50 blocks, 8 conditions incl. Depth, Layout, Gray | Card, repo. Control strongest at `control_context_scale` 1.0. No VRAM figure | 8.38 GB pruned bf16, 4.53 GB int8, v1 4.22 / 2.30 GB. MiniMax licence | **Out on 8 GB** on top of 11.4 GB H3: **estimate** | Large port. `video.cpp:536` refuses control_frames for H3 |
| 9 | **Wan VACE 1.3B + rendered depth** | VACE context branch with a depth clip | In sd.cpp: code, docs. Base 1.3B "8.19 GB": Wan README. No VACE 1.3B test on 8 GB found | Q4_K_M 1.47 GB, Q8_0 2.32 GB. Apache-2.0 | Likely fits at 480p, 81 frames at 16 fps. Quality unknown here | **In sd.cpp now**, `--control-video` |
| 10 | **Wan VACE 14B** with LightX2V 4-step | Same, larger model | §E: 720p failed, need 8,028 MB against 7,031 available | Q4_K_M 11.64 GB, Q3_K_S 7.84 GB | 480p may fit at 43 % of the 720p tokens: **estimate**, unmeasured | In sd.cpp now |
| 11 | **Wan2.2 Fun 5B Control + 4-step DMD LoRA** (Perflow) | Control channels on 5B, distilled to 4 steps, cfg 1 | Card with 3,600 logged runs. 5B quality failed the bar in §E | 10 GB base, 0.64 GB LoRA | Decode ~14 min at 720p (§E). Poor fit | Small to medium: different input channels |
| 12 | **CoaG** (Sept 2026) | One cylinder per person on a ground grid, plus a camera path. LoRA on Fun Control | Card, abstract. Repo 2 stars. Dolly-out only weakly followed: abstract. No numbers | 0.51 GB × 2, Apache-2.0. Base Q4_K_M 9.66 GB × 2 | Out on 8 GB: 50 steps at cfg 6 on two 14B experts | Medium, Fun channels plus `control_ref` |
| 13 | **CrossView Warp v2** (Cseti) | Re-shoots a clip from another angle using a warp and the clip as two guides | Header, card | 312 MB, factor 1, Apache-2.0 | Fair: three token sets | Multi-guide. Later: for coverage, not scene to video |
| 14 | **CameraNoise** (ICML 2026) | Warps noise along camera motion, LoRA on Wan I2V 14B. Reprojection uses a depth map and camera matrices, so a 3D scene could supply both | Code. LoRA folder and defaults are 1024×576 × 49 | 0.61 GB LoRA. HF says "other", GitHub badge says Apache-2.0 | Doubtful, 14B I2V | Small: load an initial noise. Warp must be written in C++ or the app |
| 15 | **Uni3C**, **SymphoMotion** | ControlNet on Wan 14B for camera and motion. Method not read in code | Repo titles and sizes only. Not run | 3.99 GB each, plus 1.77 GB for objects | Out, 14B plus ControlNet: **estimate** | Large port |
| 16 | **CamCloneMaster**, **TriMotion** | Wan 1.3B fine-tunes, reference video or pose | Repo. CamClone's own paper model is unreleased; the public one is an adapted 1.3B. TriMotion weights on Google Drive only | CamClone 3.13 GB; TriMotion size not confirmed | Likely fits by size: **estimate**. TriMotion defaults to 672×384. Weak base | Large: motion encoder for TriMotion |
| 17 | **Warp-as-History** | Warped frames placed in Helios's history | Repo. Base is Helios, not in sd.cpp | LoRA 0.21 GB, base transformer ~57 GB | Out | Large port |
| 18 | **Prompt-only camera LoRAs** | Trained phrases such as "the camera pans left" | 19B files: header. Static is 2,112 MB with audio modules. "Not a path for the 22B LTX-2.5": OmniCam docs. Civitai 2.3 Camera Controls, non-commercial per its author | 312 MB to 2.1 GB | Fits | **In sd.cpp now** via `<lora:>`, not run. Rough moves only, ignores the scene |
| 19 | **CQ Freeform Motion Transfer** | Motion onto another character | Header. Thin card, workflow not read | 775 MB, rank 40 | Unknown | Kohya names `lora_unet_...`; sd.cpp mapping for LTX not confirmed, rename likely needed |
| 20 | Research, out for consumers | VideoFrom3D (CogVideoX, per-style Flux LoRA); DualCamCtrl (25.73 GB); WorldCast (≥48 GB, README); FlashMotion (42 to 50 GiB, README); Geometry-as-Address (no code yet); UCPE (OneDrive weights) | README | see left | Out | Large port |

**Attack on the #1 rec.** It rests on fal's own results, and no one independent has measured camera accuracy. It survives because it is the cheapest to disprove: same base model, same engine change as #3, and a failed test costs one night. What the attack changed: Union depth moved above Layout-To-Render, because depth is a stated geometric signal with a staff answer and a user success on a real Z pass.

**Depth from a 3D render.** No depth model is needed. Use inverse depth, near = white, resized so W and H are multiples of 64 and fed straight to the guide. `ComfyUI-CameraReference3D` uses `clip(NEAR_REF / z, 0, 1)`. Normalising over the whole clip is my proposal, following how video depth tools behave. It is not confirmed for this LoRA.

## 3. Best option per VRAM tier

Token counts follow LTX Desktop's `video_tokens`. "Lightricks line" is `required = max(8.00, 6.50 + 2.95e-4 × tokens)` GiB from `ic_lora_job_budget.py`, Lightricks' Windows measurements in PyTorch. Their cap: 14,880 stage-1 tokens measured, no extrapolation.

"sd.cpp estimate" scales that line by 0.68, one point only: 14,080 tokens at 7.2 GB in §G against 10.65 GiB on the line. It is rough. Lightricks' line inverts to 18,644 tokens at 12 GiB, 32,203 at 16, 59,322 at 24 and 86,441 at 32.

| Tier | Best pick | Output, 121 frames | Heaviest pass | Lightricks line | sd.cpp estimate | Source for the VRAM figure |
|---|---|---|---|---|---|---|
| **8 GB** (floor) | LTX-2.3 Q4_K_M + 3DREAL, guide on stage 1, bare stage 2. Alternative: Union depth at 1152×640 | 1280×704 | 14,080 | 10.65 GiB | 7.2 GB **measured** for a plain run | §G. The guide pass is 7,040 tokens, lighter than stage 2 |
| **12 GB** | LTX-2.5 Q4_K_M + 3DREAL, or Layout-To-Render stage 1 only | 1536×896 | 21,504 | 12.84 GiB | ~8.7 GB | Line. LTX Desktop's floor is 9 GiB with FP8 support, else 15 GiB (README) |
| **16 GB** | Layout-To-Render as published, both stages | 1280×704 | 29,040 | 15.07 GiB | ~10.2 GB | Line |
| **24 GB** | Layout-To-Render both stages, or Q8_0 base with a bare 1080p stage 2 | 1536×896, or 1920×1088 | 44,352, or 32,640 | 19.58, or 16.13 GiB | ~13.3, or ~11 GB | Line. LTX Desktop asks 24 GB (README). RTX 4090 ran the recipe at 25 frames (OmniCam docs) |
| **32 GB+** | Layout-To-Render both stages at full size | 1920×1088 | 67,320 | 26.36 GiB | ~18 GB | Line. docs.ltx.io minimum for LTX-2.5 is 32 GB; Desktop recommends 32 GB |
| **48 GB+** | Research methods: WorldCast, FlashMotion | 480×832 | n/a | n/a | n/a | Their READMEs |

Other options by tier:

- **Depth on bigger cards:** Union at 1408×768 or 1536×896 costs only a quarter more tokens on stage 1, so it scales well. Its guide can stay on stage 1.
- **12 GB, H3:** 576×832 × 124 frames peaked at 10.66 GiB on an RTX 4070 (sepiablue, cited in wildminder's guide; quantisation not stated).
- **16 GB, plain LTX-2.5:** 1280×704, 5 s in 125 s on an RTX 5080 with NVFP4 (`myllmbox/LTX-2.5-16gb-hibrid`, publisher's table, no IC-LoRA).
- **Cards newer than Turing** also get SageAttention (§G: needs SM80 or newer) and native bf16, so Gemma may stay on the card. Whether Gemma 4 overflows in fp16 is unverified.
- **RAM is its own limit at every tier.** LTX Desktop asks for 32 GB. §G measured 5.6 GB left of 32 GB on this PC.

## 4. What an IC-LoRA guide needs in sd.cpp

**Does the loader accept these files? By name, yes. Not run.**
- Keys are `diffusion_model.transformer_blocks.N.attn1.to_k.lora_A.weight`. `name_conversion.cpp:1627-1628` and `:1683` map them to `model.diffusion_model.transformer_blocks.N.attn1.to_k.weight.lora_down`. `ltxv.hpp:672-678` and `:219` show the same module names, and `build_ltxav` uses the prefix `model.diffusion_model`.
- Union, Motion-Track, 3DREAL, Cameraman and BBox share 960 tensors over 48 blocks, video modules only.
- GGUF models apply LoRAs `at_runtime` (`diffusion_engine.cpp:1033-1048`). `forward_with_lora` adds a low-rank term per layer, about 6 % more arithmetic per linear layer at rank 128 (2 × 128 / 4096): **estimate**.
- Risk: LoRA files are bf16 and are cast in the graph (`lora.hpp:244`). Untested on Turing. If it fails, convert the LoRA to F16 first.

**Guide against keyframe, from `reference_video_cond.py` and `keyframe_cond.py`:**

| | Keyframe (sd.cpp today) | Reference (IC-LoRA) |
|---|---|---|
| Grid | same W×H as target | may be smaller |
| Time position | `frame_idx + t × 8` (`video.cpp:116-117`) | causal, `max(0, t×8 + 1 − 8)`, same as target |
| Spatial position | `h × 32` | `h × 32 × factor`, start and end |
| Denoise | `1 − strength` | same |
| 2.5 keyframe marker | no | no. sd.cpp marks only the first W×H target tokens, which matches |

**Half-size path.** ComfyUI core dilates the guide onto a full-size grid, marks padding -1 in the noise mask, and drops those tokens before attention through `grid_mask` (`comfy/ldm/lightricks/model.py:1131-1135`). This suits sd.cpp's rectangular latent, including audio packed in extra channels. Rule: at factor 2, stage-1 W and H must be multiples of 64. `iclora.py` raises otherwise, and Lightricks staff say the same on HF #1.

**Stage rules.** Crop guides before the upscaler (`LTXVCropGuides`). Skipping the crop leaves noise at the end of the clip: HF #4 on Union. Stage 2 has no guide and no LoRA by default (`DEFAULT_IC_LORA_STAGES`). `ic_lora.py:150-155` says an untiled stage 2 "can recover structure from the upsampled full-canvas latent alone". sd.cpp keeps LoRAs across both stages today (`video.cpp:1650`), so they must be cleared. `apply_loras_at_runtime({})` already does this.

**Look still.** One-frame guide at `frame_idx = -1`, time `[-1, 0) / fps`, appended after the video guide: `[target | video ref | still]` (`tiled_ic_lora_pipeline.py:13-15`). It requires factor 1 (`:96-101`), which with the 64 grid is the evidence that Layout-To-Render is factor 1.

**Sampler.** Workflows use `euler_ancestral`, cfg 1, the 8 + 3 distilled sigmas. sd.cpp has `euler_a`. §G ran plain `euler`; compare both.

**New memory risk: encoding the reference.** `ltx_vae.hpp:1250` allows temporal tiles for decode only, so 121 frames encode as one block, spatial tiles at most. Python encodes untiled. ComfyUI warns "tiled guide encodes imprint a grid into the conditioning". Check for that in test 1. Fallback: encode on the CPU.

## 5. LTX-2.5 on this card: estimate, not measured

The GGUF header confirms `model_version 2.5.0`, `keyframes_abs_pos_embedding`, connectors bundled in the file, 48 blocks at width 4096. That is the same shape as 2.3, so working memory at equal tokens should match.

| Part | LTX-2.3 used here | LTX-2.5 | Change |
|---|---|---|---|
| Diffusion Q4_K_M (distilled) | 13.22 GiB | 12.65 GiB | −4 %, with connectors inside |
| Text | Gemma 3 + connectors, 9.2 GB | Gemma 4: 24.46 GiB bf16; Q8_0 ~12 to 13 GiB after `sd-cli -M convert`; Q4 ~7 GiB if allowed | Larger, unless Q4 works |
| VAEs + upscaler | 2.6 GiB | 2.62 GiB | Same |
| Layout-To-Render | n/a | 1.22 GiB | New |

- **Card:** peak ~7.0 to 7.3 GB at 1280×704, same as §G.
- **RAM:** private peak ~24 GB, ~0.6 GiB over §G. It only works with Gemma read from disk and released: `--params-backend "diffusion=cpu,te=disk,vae=cpu"`, one clip per server (§H).
- **Time:** text 45 to 90 s on the CPU. Sampling about §G's times plus ~5 to 10 % with a rank 128 LoRA.
- **Note:** the 26 GB Gemma download is needed before conversion. No ready GGUF of it was found in the repos checked.

## 6. The sd.cpp change, written plan

Before work, per the family fork rule: merge master into `jd` (25 commits behind, `git log jd..origin/master`), rebuild, re-fit the AdaLN patch (§J row 1). **NOT STANDARD:** this is a local engine patch until offered upstream. Standard option: upstream PR, like open A2V PR #1676.

**Phase 1, factor-1 guides. No `ltxv.hpp` change. Covers 3DREAL, Layout-To-Render, Cameraman, BBox boxes.**

1. `include/stable-diffusion.h`, `sd_vid_gen_params_t`: add at the end only: `float control_strength`, `bool control_on_hires`, `sd_image_t look_still`. `control_frames` already exists.
2. `examples/common/common.h/.cpp`: add `--control-strength`, `--control-on-hires`, `--look-still`, plus JSON keys in `from_json_str`. `--control-video` already loads a frame folder (`examples/cli/main.cpp:863`).
3. `src/pipeline/generation.h`, `ImageGenerationLatents`: `video_conditioning_frame_count` becomes the sum across guides.
4. `src/pipeline/video.cpp`:
   - New `append_ltxv_reference_positions()` beside `build_ltxv_video_positions` (line 83): grows the position tensor per guide, with causal time and a factor argument. Today each call rebuilds it, so a second guide would erase the first.
   - New `encode_ltxav_reference_video()` beside `encode_ltxav_condition_image`: build `{w, h, frames, 3, 1}` as H3 does at lines 688-703, trim to `8k+1`, then `sd->encode_first_stage`.
   - `prepare_video_generation_latents`, lines 780-785: replace the refusal. Open the block at 786 when a guide exists, so `init_latent` and `denoise_mask` are created without an image. Append `[target | video ref | still]`.
   - Phase 1 refuses guide plus `--end-img`: the lambda at line 802 overwrites the shared counters.
   - `generate_video`, before line 1784: new `crop_ltxav_guides()`. Unpack audio with `unpack_ltxav_audio_latent`, slice to `video_target_frame_count`, re-pack, set the conditioning count to 0. Run it only when guides exist, so FLF2V behaviour stays as it is.
   - Near line 1840: without `control_on_hires`, call `sd->apply_loras(nullptr, 0)` before the hires `sd->sample`. With it, new `apply_ltxv_refine_reference()` re-encodes at stage-2 size and appends, called after `apply_ltxv_refine_image_conditioning`.
   - Line 1983: trim uses the stage's own count.
5. `examples/server/model_catalog.cpp` recipes: LTX gets `control_frames`. `examples/server/api.md`, `docs/ltx2.md`: document it.
6. Kit, `runner/sdcpp.js` `videoJobBody`: add `control_frames`, plus the `hires` gap from §G.

**Phase 2, factor-2 guides. Covers Union and Motion-Track.**

7. `video.cpp`: new `dilate_ltxav_reference()`, per `LTXVDilateLatent`. Padding gets mask 0, since the -1 marker would break the blend at `diffusion_engine.cpp:2487`. A separate `video_token_keep` list records survivors.
8. `sd->sample` and the extra params at `diffusion_engine.cpp:2606`: pass the keep list.
9. `ltxv.hpp`, `LTXAVRunner::build_graph` (1860): filter `timesteps_tensor` before the distinct search at 1890, and pass only surviving positions so the assert at 1919 holds. `LTXAVModelBlock::forward` (1631): select kept tokens after `patchify_video`. After `proj_out`, take the target tokens and pad zeros back to W×H×T. Guide output is discarded by the mask blend anyway, so no scatter op is needed.
10. Read `reference_downscale_factor` as `lora.hpp:70` reads `alpha` (`file_metadata`). Reject factor 2 unless stage-1 W and H are multiples of 64. Reject mixed factors, as `ic_lora.py:379` does.

**Phase 3, optional.** Attention strength under 1.0 and BBox regions: `BasicAVTransformerBlock::forward` already has `self_attention_mask` (1245) and `attention_mask`, but `forward` at 1741 passes nullptr. Regions add per-object text encoding and masks.

**Blast radius.**
```
apply_video_condition_by_keyframe_index  video.cpp:802,862
build_ltxv_video_positions               video.cpp:83,824,1516
video_conditioning_frame_count           generation.h:34  video.cpp:814,1503,1983,1985
video_target_frame_count                 generation.h:35  video.cpp:813,826,1503,1507,1984
upscale_ltx_spatial_video_latent         video.cpp:1320,1784
apply_loras                              image.cpp:870  video.cpp:1650  diffusion_engine.cpp:1809
control_frames (producers)               common.cpp:2333,2831,2889  main.cpp:863  routes_sdcpp.cpp:219  image_preprocess.cpp:223,477
control_frames (consumers)               video.cpp:535,781,1070
video_token_count assert                 ltxv.hpp:1919
```
Regression to re-check after the change: FLF2V with `--end-img` through hires, since it keeps frames across the upscaler by design (`apply_ltxv_refine_image_conditioning`, lines 1503-1525).

## 7. Tests for the top three

All run when the card is free, on the merged and patched `jd` build (`E:\Dev\Web\stable-diffusion.cpp\build-jd\bin\sd-cli.exe`), through `E:\Dev\Web\test-just-direct\cli.js`, weights on E:. Judge by eye; time is recorded only.

**Shared inputs: one gray layout clip made with free tools.**

1. In Blender (free), build: floor plane, back wall, side wall, a table box at centre, a cylinder actor A walking left to right behind the table, a cylinder actor B standing still. The occlusion is deliberate.
2. Camera: dolly in over 121 frames plus a 15 degree pan right. 24 fps. Keep the first frame clear of ambiguity.
3. Clay pass: Workbench engine, single colour 0.6 gray, Studio light, shadows on. PNG frames into `E:\Dev\Web\test-just-direct\scene\clay-1280x704\` at 1280×704, and a second copy at 1152×640 into `clay-1152x640\`.
4. Depth pass, 1152×640: Cycles on the CPU, 1 sample, Raw view transform, a view-layer material override: Camera Data (View Z Depth) → Math 1/z → Map Range from 1/far to 1/near, to 0..1 → Emission. Fixed near and far for the whole clip. PNG frames into `depth-1152x640\`.
5. Keyframe from clay frame 0, FLUX.2 klein as in §H: `node cli.js key-scene klein -W 1280 -H 704 -r scene\clay-1280x704\0001.png -p "<photoreal description>"`. Check the overlay: `ffmpeg -i key.png -i clay.png -lavfi "[0]edgedetect[a];[1]edgedetect[b];[a][b]psnr" -f null -`. fal treats ~17 or higher as good. Do not use the gray frame itself.

**Pass or fail, all tests.** Compare frames 0, 30, 60, 90, 120 against the clay, by 50 % overlay and the same edge PSNR.
- Fails: camera moves the wrong way, or stops following; table or actors more than about 5 % of frame width from their place at frame 120; the occlusion lost; a third actor appears; gray look; end-of-clip noise (guides not cropped); a tile grid in the output (encode tiling). The 5 % figure is my proposal.
- Quality fails the §G bar: melted faces or smeared detail in a full-size crop.

**Test 1, 3DREAL, needs Phase 1. Model files:** the LTX preset of `cli.js`, `3DREAL-strong-v2.safetensors` and `3DREAL-light.safetensors` from `fal/LTX-2.3-3DREAL-LoRA` in a LoRA folder.
```
node cli.js scene-3dreal ltx --lora-model-dir <loras> --control-video scene\clay-1280x704 -i key.png \
  -W 640 -H 352 --video-frames 121 --vae-tiling --vae-tile-size 384 --vae-tile-overlap 0.125 \
  --hires --hires-upscalers-dir E:\Dev\Web\_spikes\ltx\up --hires-upscaler ltx-2.3-spatial-upscaler-x2-1.1 \
  --hires-width 1280 --hires-height 704 --hires-steps 3 --hires-sigmas 0.909375,0.725,0.421875,0.0 \
  --sampling-method euler_a -p "3DREAL. Make it photorealistic. <scene>. <lora:3DREAL-strong-v2:1>"
```
Then one change at a time: Light in place of Strong v2; `euler`; `--control-on-hires`; and LTX Desktop's own default, single stage at 960×512 (15,360 tokens, no `--hires`). In the log, `lora_stat` must show all 960 tensors applied. Extra failure: LoRA tensors skipped, or a bf16 cast error.

**Test 2, Union with rendered depth, needs Phase 2.** Files: `ltx-2.3-22b-ic-lora-union-control-ref0.5.safetensors`.
```
node cli.js scene-union ltx --lora-model-dir <loras> --control-video scene\depth-1152x640 -i key-1152x640.png \
  -W 576 -H 320 --video-frames 121 --vae-tiling --vae-tile-size 384 --vae-tile-overlap 0.125 \
  --hires --hires-upscalers-dir E:\Dev\Web\_spikes\ltx\up --hires-upscaler ltx-2.3-spatial-upscaler-x2-1.1 \
  --hires-width 1152 --hires-height 640 --hires-steps 3 --hires-sigmas 0.909375,0.725,0.421875,0.0 \
  --sampling-method euler_a -p "<scene>. <lora:ltx-2.3-22b-ic-lora-union-control-ref0.5:1>"
```
Look at: edges tighter to the clay than test 1? Extra failure: depth banding or a flat look from over-strong guidance. Make the keyframe at 1152×640.

**Test 3, Layout-To-Render, needs Phase 1, the look still, and LTX-2.5.** Accept the gated terms on Hugging Face first; Claude did not and cannot do that for the user. Files: `distilled/ltx-2.5-22b-distilled-Q4_K_M.gguf` (`unsloth/LTX-2.5-GGUF`), Gemma 4 bf16 converted with `sd-cli -M convert --type q8_0`, `ltx-2.5-video-vae-conv-bf16`, audio VAE, `ltx-2.5-latent-spatial-upscaler-x2-bf16-1.0`, `ltx-2.5-22b-ic-lora-layout-to-render-1.0`.

Do a plain LTX-2.5 two-stage run first (§J row 10). Then the same command as test 1, with those files, `--look-still key.png` in place of `-i`, prompt without "clay", "3D" or "Unreal", and `--params-backend "diffusion=cpu,te=disk,vae=cpu"`. Stage 1 only first, then `--control-on-hires` if RAM and card hold. A 1280×640 clip is the OmniCam size if 704 misbehaves. Extra failure: the look arrives late in the clip (HF #5).

**Baselines, no code, can run first.**
```
node cli.js scene-h3 h3 -W 864 -H 480 --video-frames 124 --vae-tiling --ref-video scene\clay-1280x704 -r key.png -p "Use the look of <Picture 1>; follow the camera move and blocking of <Video 1>. <scene>. <lora:minimax_h3_ref2v_turbo_4step_v0.1_comfyui_bf16:1>"

sd-cli -M vid_gen --diffusion-model wan2.1-vace-1.3b-q8_0.gguf --vae wan_2.1_vae.safetensors --t5xxl umt5-xxl-encoder-Q8_0.gguf \
  -p "<scene>" --cfg-scale 6.0 --sampling-method euler -W 832 -H 480 -i key.png --control-video scene\depth-832x480 --video-frames 81 --offload-to-cpu --vae-tiling
```
The `<Video 1>` and `<Picture 1>` tokens are real (`conditioner.hpp:2513,2525`). The prompt wording around them is my guess.

## 8. Not verified

- **Nothing here has run on this PC.** Every 8 GB outlook is reasoning from §E to §H and file sizes.
- **Layout-To-Render and Ingredients headers:** gated, no Hugging Face token on this PC. Layout-To-Render's factor 1 and its tensor list are inferred, not read.
- **Reddit:** r/StableDiffusion and r/comfyui could not be read. WebSearch refuses the domain and WebFetch cannot reach it. I did not work around that. Reddit figures here are second-hand through wildminder's guide. This is a real gap in user reports, so "no reports found" means only that.
- **Camera accuracy:** I found no independent measurement for any method. Papers' numbers were not read; only abstracts for AVControl and CoaG.
- **Licences:** "free under USD 10M revenue" comes from third-party pages, not the licence text. 3DREAL's terms are not on its card.
- **3DREAL on LTX-2.5:** listed in LTX Desktop's catalog; its own HF #6 asks and has no answer. Union on 2.5 is confirmed by the official workflow.
- **Layout-To-Render stage-1-only:** no one was found running it. LTX Desktop has no still in that mode.
- **TriMotion's checkpoint size:** Google Drive not read. **GEN3C, WorldStereo, CamGeo, Vid-CamEdit, 3DScenePrompt:** seen, not read.
- **fal "H3 Max 3D to video":** vendor page via search only; H3 Max is not shown to be the open H3.
- **Models in sd.cpp not confirmed to load:** `unsloth/LTX-2.5-GGUF` distilled; the header looks right but `docs/ltx2.md` names a different repo.
- **Sources that disagree:** H3 VRAM (31.7 GB peak against 6 to 8 GB with offload); VACE 1.3B (8 GB against a workflow page's 16 GB minimum).

## 9. Query log

**WebSearch**
1. "latest techniques to make AI video follow a 3D blockout camera path and layout 2026" → Seedance 2.5, fal H3 Max, Blender-first guides, Higgsfield Blender MCP. Vendor pages.
2. "best open source tools 3D scene to AI video control camera 2026 local model" → Topview 3D Builder, one vendor blog on CameraNoise, TriMotion, FlashMotion, a Mochi listicle.
3. "LTX-2.5 Layout to Render IC-LoRA review results clay viewport reddit" → card, docs.ltx.io, one X post. No results.
4. "LTX-2.5 8GB VRAM GGUF workflow results reddit StableDiffusion comfyui" → guides, GGUF repos, a YouTube title. No benchmark.
5. "new ways to control camera in Wan video open source 2026 pose trajectory arXiv github weights" → overview pages, nothing usable.
6. "LTX-2.3 3DREAL LoRA fal blockout render to real ComfyUI results" (reddit.com only) → refused, domain not accessible.
7. "Cameraman IC-LoRA LTX camera motion reference does it follow" (reddit.com only) → refused, same.
8. "MiniMax H3 reference video camera movement follow blockout Ref2VA low VRAM" → VRAM guides that disagree; nothing on camera following.
9. "3DREAL LTX-2.3 IC-LoRA blockout tested ComfyUI low VRAM user results camera accuracy" → general LTX pages; no 3DREAL reports.
10. "Wan 2.1 VACE 1.3B depth control 8GB VRAM 480p test results how long quality" → no test; 8.19 GB for base, a conflicting 16 GB page.
11. "arXiv 2026 video generation from coarse 3D blockout geometry camera path open weights code low poly proxy" → CoaG, WorldStereo, VideoFrom3D, DualCamCtrl, Vid-CamEdit, CamGeo.

**WebFetch:** Layout-To-Render page (card text); docs.ltx.io system requirements (32 GB minimum for 2.5); fal blog on the clay-to-film pipeline; docs.ltx.io IC-LoRA adapters (no factors given); wildminder H3 performance guide (cited numbers only); arXiv 2603.24793 and 2609.24208 (abstracts); reddit.com search (refused).

**Hugging Face API, newest first:** author=Lightricks; "layout-to-render" (official only); "ltx-2.5"; "camera control"; "wan camera"; "ltx camera"; "ltx-2 lora camera"; "motion transfer"; "wan vace"; "layout"; "blockout" (0); "trimotion" (0); "camclonemaster"; "cameranoise"; "flashmotion"; "wan fun control"; "ltx control"; "depth control video"; "3dreal"; "3d real"; "render to real"; "3d-to-real"; "ltx 3d"; "clay to real" (0); "ic-lora"; "ltx-2.3-22b-ic-lora"; "minimax h3 controlnet"; "h3 fun controlnet"; "videox-fun h3" (0); "uni3c"; "helios".

Discussions read: Layout-To-Render #5, #6; 3DREAL #1, #4, #6; Cameraman v2 #4, #5, #6; Union #1, #3, #4.

**GitHub.** `gh search repos --sort updated` for 8 queries returned almost nothing. Re-run through the search API, `pushed:>2026-01-01`, sorted by stars: "camera control video generation", "wan camera control", "video generation from 3D scene", "camera trajectory video diffusion", "IC-LoRA LTX", "LTX-2 ControlNet", "VACE camera", "wan fun control camera", "VideoFrom3D", "blender AI video render diffusion", "scene layout video generation", "TriMotion", "CameraNoise", "FlashMotion", "CamCloneMaster". Found GEN3C, UCPE, Warp-as-History, SymphoMotion, DualCamCtrl, WorldCast, 3DScenePrompt, Geometry-as-Address, ComfyUI-CameraReference3D. Also "CoaG cylinders grid video", "Uni3C".

Code search: "Layout_To_Render" (LTX Desktop, OmniCam); "3DREAL-strong" (ComfyUI-Easy-Media, PeterDuncan workflow).

sd.cpp issues: "ltx lora", "ltx-2 lora not applied", "ltx ic-lora" returned nothing. PRs on "ltx": #1676 A2V open, #2249 H3 latent hires open.

**Civitai API, newest:** "LTX camera", "LTX blockout", "3d to real LTX", "camera control LTX 2.5", "IC-LoRA", "wan camera control". Models 2928691, 2762508, 2803304 read. New: Cameraman page, H3 camera-prompt editor.

**Code read in clones:** Lightricks/LTX-2 (`ic_lora.py`, `iclora_utils.py`, conditioning types, `docs/`), ComfyUI-LTXVideo (`iclora.py`, `latents.py`, workflows), ComfyUI core (`model.py`, `av_model.py`, `nodes_lt.py`), LTX-Desktop (runtime_config, catalog, recipes, pipelines), ComfyUI-CameraReference3D, ComfyUI-LTX-BBox-Animator, CameraNoise, TriMotion, and READMEs of the others in the table.
