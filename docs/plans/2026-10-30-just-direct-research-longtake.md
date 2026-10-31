# Long takes with no visible seam: research for JustDirect feature 6

Done 2026-10-30. Nothing was run, no weights were downloaded, and the graphics card was not touched. Code was read in
shallow clones under `scratchpad/research-clones/longtake`. Settled measurements in feasibility §E–§H are used as they
stand. The three §B facts this relies on were re-checked; see section 9.

Proof labels:
- **code**: read in a clone or in our sd.cpp copy.
- **card**: stated on a model card, README or changelog by the people who made it.
- **user**: a report from someone else, on a forum or in a discussion.
- **measured**: run on this PC (§E–§H only).
- **estimate**: my arithmetic, not a run.
- **unverified**: could not be checked.

## 1. The short answer

1. Nothing past 121 frames has ever been run here. The first thing to try needs no code: ask for more frames in one
   pass. There is no seam because there is no join. By token arithmetic 241 to 361 frames at 1280×704 could fit this
   card (estimate). That is 10 to 15 s, and it would be the cheapest win available.
2. `take.js` is the weakest method on the list. One picture carries no motion, so every join loses velocity.
3. Lightricks ships the right method for any length. It is not "Extend" as a separate model. It is `ltx_pipelines/chunks`:
   keep the last latents of each window, pin them at the start of the next, and crossfade the decoded overlap. The
   MiniMax-H3 community reached the same design on its own (Herrgott v1.4, ComfyUI PR #15375). sd.cpp already has most
   of the pieces (`apply_ltxav_condition_by_latent_index`), so this is a small addition, not a port.
4. A variant worth testing: run stage 1 once over the whole take, then refine in windows. Lightricks' DFR epilogue uses
   the same pattern, keeping stage 1 audio and refining in pinned time windows. Stage 1 at 640×352 × 481 frames (20 s) is
   13,420 tokens, which is under the 14,080 tokens stage 2 already handles here.

## 2. Ranked table, best first

Tokens = (W/32) × (H/32) × ((frames−1)/8+1). The measured clip is 14,080 tokens at stage 2.

| # | Method | How it works | Proof | Weights | 8 GB outlook and why | Engine path | Better machine gets |
|---|---|---|---|---|---|---|---|
| 1 | **One longer pass**, LTX-2.3 two-stage | Same run as today with `--video-frames` raised. No join at all | **code** that frames are free to rise (`align_video_frames`, 8k+1). **user**: 3070 8 GB, 900×1600, 20 s, 21 min, ComfyUI with SageAttention. **card**: WanGP defaults LTX to a 481-frame window. Not measured here | On disk: Q4_K_M 14.19 GB | Good to ~361 frames by arithmetic (estimate). 241 frames: 27,280 tokens, about 3.5 GB buffer, ~10 min. 361: 40,480 tokens, about 5.3 GB, ~13 min. 481: about 7.0 GB, over the budget. RAM at decode is the other limit: 361 frames is 3.9 GB of float frames | **Already in sd.cpp. No change** | 12 GB: 481 frames at 720p (estimate). 24 GB: "20 s at 720p in a single window" (WanGP changelog, LTX-2) |
| 2 | **Latent carry windows**, the official long-video method | After each window, slice the last latents (default 25 frames) and pin them at index 0 of the next, video and audio, once per stage at that stage's size. New seed each window. Decode, drop the carried frames, crossfade them linearly. Audio gets a 40 ms equal-power crossfade | **code** `chunks/layout.py`, `operators.py`, `distilled.py`; shipped as `--chunked`. Same design on H3: Herrgott v1.4. **user**: RuneXX reports slight degradation over a minute on the related pixel-based extend. No user report of seams on `--chunked` itself was found | None new | Good. A window costs what a clip costs: same tokens, and two timesteps, which the `jd` AdaLN patch already handles (407 s measured for one pinned frame). 20 s = 5 windows, ~34 min (estimate). Each window is its own process, so the "fresh server" limit does not bite | **Small addition**, section 5. Audio pin is a second small patch | Longer windows mean fewer joins. 12 GB+: Q5/Q6 and Gemma on the card on BF16 cards |
| 3 | **One long base, refine in windows** | Stage 1 once across the whole take, one seed, one soundtrack. Upscale. Stage 2 in overlapping time windows with the previous window's tail pinned and all audio frozen | **code** for the pattern: DFR epilogue, "time windows run sequentially (pinned prefix handover)… frozen stage-1 audio". Applying it to the distilled two-stage is my combination. **NOT STANDARD**; the standard option is row 2 | None new | Good on paper. Base 640×352 × 481 = 13,420 tokens, under what stage 2 runs today. Refine windows are today's stage 2. 20 s ~20 min (estimate). Decode at 481 frames is the RAM risk (5.2 GB of float frames); decode per window if so | Half-test needs **no change**. Windowed refine is a **small-to-medium addition**, section 5 | Bigger stage 2 windows, so fewer joins |
| 4 | **Retake across the join** (repair), also the community "Extend Any Video" | Encode a stretch of finished video, mask a time range, redo only that range, video and audio separately | **code** `retake.py`, `TemporalRegionMask`. **user**: Extend Any Video uses a Retake-style mask with about 3 s of reference; one user says Retake mid-video gave poor results | None new | Fair. Runs at full size for 8 steps, so keep it short: 97 frames is 11,440 tokens, about 5 min a join (estimate) | **Small addition**: encode `control_frames` for LTX and fill the mask by time. Today that path errors with "LTXAV control_frames are not implemented" | Longer repair range |
| 5 | **MiniMax-H3 masked AV carry** | Same as row 2 on H3: previous video and audio latents copied in and protected by per-stream masks. 39 frames held. Trims H3's frozen end frames first | **code** Herrgott v1.4, ComfyUI PR #15375. **user**: 11-clip example in the repo; its own test suite covers logic, not picture | Have Ref2VA Q4_K_M; FL2VA pruned Q4_K_M 11.42 GB | Fair. 480p only here (376 s for 5 s, measured). WanGP says 15 s at 480p fits 5–6 GB (card) | **Medium**: H3 uses appended keyframe rows; per-row masks do not exist in sd.cpp. Upstream PR #2249 adds `--hires` for H3 (open today) | **Best use of a bigger card.** WanGP: 15 s at 1080p in 11 GB |
| 6 | **Keyframes inside a window** (ImageGuide, repeated last frame) | Extra frames at chosen times, appended as tokens at their time position. Herrgott repeats a last frame as a "quality reset" for drift | **code** `VideoConditionByKeyframeIndex`; sd.cpp already does this for the end frame only | None | Good, small cost: 1 latent plane per keyframe | **Small addition**: turn `apply_video_condition_by_keyframe_index` from one call into a list | Same |
| 7 | **LTX-2.5 generated keyframes at seams** | The model makes extra single-frame planes; one sits at each seam and pins the next window, so fast motion crosses the join cleanly | **code** `chunks/planner.py`, `conditioning.md`. LTX-2.5 only. Lightricks' cost: +16% to +31% tokens | LTX-2.5 distilled Q4_K_M 13.58 GB (unsloth), Gemma 4 Q4_K_M 8.41 GB; only `keyframes_abs_pos_embedding` is in sd.cpp | Unknown. LTX-2.5 has never run here, and Gemma 4 on Turing is untested | **Medium**: slots are not wired in `video.cpp`. Keyframe-aware decode needs the diffusion VAE sd.cpp does not have | Tier pick from 24 GB |
| 8 | **Overlap trajectory replay** (H3 Seamless) | Save the overlap's state at every sampling step and replay it at the same step of the next window, instead of a clean pin | **code** pseudocode in `docs/METHOD.md`. One test: 39.9 s, 2 joins, talking head. Its own report says consumer GPU viability is not established | None | Unknown. No per-token timestep needed, which is attractive. Never tried on LTX | **Small addition** in the sampler loop; needs a saved copy of the overlap for every sampling step | Same |
| 9 | **Co-denoised windows** (FlowLong, Tiled Fusion temporal) | All overlapping windows stepped together, blended every step, so they share one path | **code** for Tiled Fusion (`tiled_fusion_plan.py`, overlap 0.5). **card** for FlowLong (paper, no code found) | None | Fair. Twice the windows because overlap is 50% | **Medium**: sampler must loop windows per step, sd.cpp has no hook | Same |
| 10 | **Stable Video Infinity 2.0 Pro** (Wan 2.2) | Two LoRAs. Each clip gets first-frame latent + last latent of previous clip + zeros. Trained to tolerate its own errors | **code** `wan_video_svi_pro.py`. **card**: 14-minute video (SVI 2.0 on Wan 2.1). **user**: "no colour drift" tutorials | 1.23 GB × 2 (MIT) + Wan 2.2 I2V experts | Poor. 14B at 480×832, 16 fps, no sound. Both experts + umt5 in RAM. No 8 GB report found. User rejected the 5B look; 14B never run here | **Small addition** in the Wan I2V branch of `video.cpp`: build `concat_latent` the SVI way | 16 GB Q4 (svi2_colab T4). Best silent option from 24 GB |
| 11 | **H3 Ref2VA with `ref_videos`** | Feed the end of the last clip as a reference video | **code** in `video.cpp`. References are not pinned frames, so the next clip does not start on them. sd.cpp also refuses references with `-i` | Have it | Poor for one take. Fine for same-scene shots | **Already in sd.cpp** | Same |
| 12 | **LongCat-Video** | Model trained for continuation: 13 frames of condition, 93-frame windows, then a refine | **code** `run_demo_long_video.py`. **card**: "minutes-long videos without color drifting". 480p then refine; no sound | 54.3 GB transformer + umt5 (MIT). No plain-video GGUF found, only Avatar GGUFs | Poor. **Large port** and no GGUF | **Large port** | Unknown; no VRAM figure published |
| 13 | **Last-frame chain** (`take.js`) | I2V from a late frame, hard cut | **code**; earlier run failed before the `jd` patch (`take-c2.log`) | Have it | Runs, ~407 s a clip. Motion velocity breaks at every join. Keep as the control | **Already in sd.cpp** | Same |
| 14 | **First + last frame bridge** | Generate a short bridge between two clips | **code** FLF2V in `video.cpp` | Have it | Runs, but both ends are single frames, so same velocity break as row 13 | **Already in sd.cpp** | Same |
| 15 | **Wan VACE clip joiner** | Replace frames around a cut using context from both sides | **user**: Civitai 2024299, 15–40 min per transition on a 4090 at 14B | VACE 14B | Poor. 14B VACE did not fit at 720p (measured §E). sd.cpp's VACE mask is fixed to all ones | **Small addition** for the mask, but no 8 GB path | From 24 GB as a repair tool for any clip |
| 16 | **FramePack / F1** | History in multi-scale clean latents, section by section | **code**, **card** 6 GB. **user**: 4060 8 GB, 4.83 s, 56 min, 43 GB RAM peak, looks good | 25.8 GB, Apache | Poor. Far slower than LTX here, no sound | **Large port** (HunyuanVideo-based 13B, not in sd.cpp) | Faster, same limits |
| 17 | **Autoregressive family**: SGF+, RMD, Looking Ahead, Helios, LongLive, RAVEN | Causal models that stream chunk by chunk | **card** (READMEs read, code not traced). Several are from the last month. Mostly Wan 1.3B/5B/14B bases, no sound. RAVEN is H3 with sound but its card calls itself "undertrained" | SGF+ 11.35 GB, RMD 5.68 GB, Looking Ahead 8–34 GB, SANA LongLive 4.12 GB, RAVEN LoRA 5.06 GB | Poor for film quality today | **Large port**: causal attention and KV cache | RAVEN: 192 frames at 1376×768 in 24 GiB (card) |
| 18 | **RIFLEx** | Lowers a RoPE frequency so Wan/Hunyuan stretch past trained length | **card** (paper). Not in sd.cpp. LTX positions are in seconds, so it does not apply | None | Not needed for LTX | Not applicable | Not applicable |

Open weights are confirmed through the Hugging Face API for every size above. Licence labels:
- LTX-2.x Community License (a separate licence applies at USD 10M revenue).
- MiniMax-H3 Community License.
- MIT: SVI, LongCat, AEX Drift.
- Apache-2.0: FramePack, SGF+, RMD, Helios.
- GPL-3: Herrgott suite.
- RAVEN: CC BY-NC per MosaiChunk's README.
- H3-LongVideos: no redistribution, so its method would need rewriting in our code.

Also checked:
- **LTX Extend in the API** is cloud only ($0.10/s on fal, mode "end"). No local Extend pipeline exists in Lightricks/LTX-2; rows 2 and 4 are the local forms.
- **Local 4-minute claim** (Klankdon) was a workflow on 96 GB cloud hardware with clips joined in an editor. Not a method.
- **FramePack-U** is a false lead: it is about video understanding, not generation.

## 3. Add-ons that go with any row

| Add-on | What it does | Proof | Engine path |
|---|---|---|---|
| Pixel crossfade over the carry | Linear blend across the 25 overlap frames, as Lightricks does | **code** `_crossfade_video_overlap` | ffmpeg in the test; a few lines in the app |
| Drift correction | AdaIN of each new window's latent stats against the first; docs suggest 0.1–0.3 | **code** `latent_norm.py`, `looping_sampler.md` | **Small**: sd.cpp tensor maths after stage 1 |
| Seam Anchor (MIT) | Gain and offset of low frequencies fitted on still parts of held frames. Says it slows drift rather than stopping it | **code** `comfyui-aex-drift`, H3 only so far | **Small** to port |
| Colour grade at pickup | Match first new frame to the frame it continues from, carry the correction | **card** H3-LongVideos: H3 gets more saturated each continuation | App side, in pixels |
| Which frame to continue from | LTX: no LTX-specific evidence found that end frames are bad (a gap in the search); one "wonky" tail report was traced to upscaler 1.0, and we use 1.1. H3: FL2VA has a frozen end, so it must be trimmed | **user** for LTX; **code** `motion_analysis.py` for H3 | Trim in the app |
| Beats in one window (Prompt Relay) | Time-weighted text cross-attention; supports LTX | **code** `kijai/ComfyUI-PromptRelay/patches.py` | **Medium**: needed if row 1 or 3 must carry several actions |
| Audio across joins | Audio faded to near silence over a long chain in one report; level normalising each step fixed it | **user** RuneXX discussion 131 | Normalise per window |

## 4. Best option per tier

"Best" means: the longest seam-free take at the best quality with sound, from what the sources support. Estimates are
marked. Anything above 8 GB comes from other people's cards, not this PC.

| Tier | Best option | What the machine gets | Source of each VRAM figure |
|---|---|---|---|
| **8 GB** (floor) | Row 1 up to its limit, row 2 past it. LTX-2.3 Q4_K_M. Gemma on the CPU on Turing | 1280×704 × 121 proven. 10–15 s one pass (estimate) | **Measured** §G: 7,231 MB peak. **User**: 3070 8 GB, 900×1600, 20 s, 21 min, Reddit 1rxtay2 |
| **10–12 GB** | Row 1 with 481-frame windows at 720p, or 1080p short windows. Row 2 past that | 20 s one pass at 720p (estimate) | **Card**: WanGP "as low as 10 GB" for LTX-2 and "15 s of H3 at 1080p in 11 GB". **User**: 3060 12 GB crashed at VAE decode, Reddit 1rxtay2 |
| **16 GB** | LTX-2.3 Q5/Q6, 1920×1088 refine windows (32,640 tokens at 121 frames, estimate). Row 2 with 241+ windows. Stage 1 alone can run far longer: see figures | Higher Q, Gemma on the card on BF16 cards (unmeasured). SVI Q4 becomes possible | **User**: 5060 Ti 16 GB, 900×900, 20 s, ~7 min; 900×1600 × 15 s ran out at VAE decode. **User** (estimated 16 GB, LTX-2.5 int8, stage 1 only): 576×576 41 s, 416×416 81 s. **Card**: NVIDIA guide, 16 GB recommended, under 257 frames. **Card**: svi2_colab, T4 16 GB |
| **24 GB** | LTX-2.5 distilled Q6/Q8 with row 2 and row 7, or H3 row 5 at 1080p. RAVEN only for experiments | 20 s window at 720p and above; H3 stereo at 1080p | **Card**: WanGP "at least 24 GB… 20 s at 720p in a single window in 2 minutes" (LTX-2 distilled). **Card**: RAVEN, 192 frames at 1376×768 in 24 GiB |
| **32 GB and up** | Same methods at higher Q or BF16, with DFR quality on LTX-2.5 once sd.cpp has it | BF16 file is 42 GB. Lightricks' DFR docs work up to 3840×2176; sd.cpp has no DFR yet | **Unverified**: an LTX blog snippet says 32 GB+ for distilled workflows (page would not load). Lightricks' docs give no absolute VRAM figures. Klankdon: 96 GB cloud, 1280×720 |

## 5. Exact sd.cpp additions

All go on our branch `jd`, which is **NOT STANDARD** until upstream takes them. Family rule first: merge upstream into
`jd` (25 commits behind), rebuild, re-run the baseline (§J item 1). No upstream PR adds LTX extend or carry; PR #1921
(LTX-2.5 upscale only) and #1676 (A2V) are open drafts.

**Row 2, latent carry.** Standard: `Lightricks/LTX-2/packages/ltx-pipelines/src/ltx_pipelines/chunks`.
1. `include/stable-diffusion.h`, `sd_vid_gen_params_t`: add a carry input path, a carry output path and a carry length in latents.
2. `video.cpp`, `prepare_video_generation_latents`, LTX branch at line 786: also enter when a carry is set. Call the existing `apply_ltxav_condition_by_latent_index(&init_latent, &denoise_mask, tail, 0, "carry", 0.f)`.
3. `video.cpp`, `apply_ltxv_refine_image_conditioning` line 1447: stop returning early when a carry is set, and pin the stage 2 tail the same way.
4. `video.cpp`, `generate_video`: slice the video tail after line 1776 and again after line 1917, then write both to the file. `load_tensor_from_file_as_tensor` exists at `src/core/tensor_ggml.hpp:108`; the save side is commented out at `ggml_tensor_utils.cpp:138`.
5. Audio pin, second patch: zero the audio head in `pack_ltxav_audio_and_video_denoise_mask` line 212 and pass per-token audio timesteps. Today `audio_timesteps_tensor` is a scalar (`diffusion_engine.cpp:2463`) and `a_timestep` goes to `get_ada_values` without an index. The first test can skip this and crossfade the audio.

**Row 3, windowed refine.** Nearest standard: Lightricks DFR epilogue. After line 1793 in `generate_video`, loop windows over the
upscaled latent: slice 16 latents, pin the previous window's tail, set every audio mask value to 0 and set
`audio_timesteps_tensor` to 0, sample with the hires sigmas, keep the new latents. Then decode the joined latent, or
decode per window if RAM runs short.

**Row 4, Retake.** In `prepare_video_generation_latents`, replace the "LTXAV control_frames are not implemented" error: encode
`control_frames`, fill `denoise_mask` by time range, leave the rest at 0.

## 6. Tests for the top three

All use this PC's files in `E:\Dev\Web\_spikes\ltx`: `ltx-q4km.gguf`, `gemma.gguf`, `conn.safetensors`, `vae.safetensors`,
`avae.safetensors`, `up\ltx-2.3-spatial-upscaler-x2-1.1`. Run with `SDCLI` set to the `jd` build, through `cli.js`
(RAM guard 1.5 GB) with the browser closed and nothing else on the card. Use the café SUBJECT and SETTING from `take.js`,
and the `BASE` flags from `take.js`, changing only what is listed.

Shared failure signs from others' reports: loss of contrast, then detail, then a gray screen (Robotman2100's stages for
LTX-2.5 past its limit); output that repeats the reference clip (Extend Any Video).

### Test 1: one longer pass (no code)

- **Input:** one prompt with three actions in order, seed 21. Use T2V first, then I2V with `out/k1-cafe.png`.
- **Runs, one at a time, stopping at the first failure:** `--video-frames` 193, 241, 289, 361 at 1280×704 two-stage. Example: `node cli.js L241 ltx -W 640 -H 352 --video-frames 241 --hires …` with the BASE flags.
- **Record:** card peak, lowest RAM, seconds per step for each stage, decode time.
- **Expected if the estimate holds:** ~9, 10, 11, 13 min. This is arithmetic from §G and §H, not a promise.
- **Look at:** frames at 0, 25, 50, 75 and 100%; the whole clip at normal speed; whether all three actions happen; face and hands at full size in the last quarter; sound over the full length.
- **Failure:** out of card memory; guard stop; gray or washed frames; motion stalls or loops in the second half; the user rates it below the 121-frame clip.
- **Result used:** the longest passing N becomes the window size for tests 2 and 3.

### Test 2: latent carry against the `take.js` chain (after the section 5 patch)

- **Control:** `node take.js cafe v1-cafe-jd.webm`, the same two BEATS and seeds 21, 22.
- **Run:** same prompts and seeds, 121-frame windows, carry 4 latents (25 frames), both stage tails saved, a fresh `sd-cli` per window. Join: drop the 25 carried frames from each later window and crossfade them linearly against the previous tail. Audio crossfade 1 s for now.
- **Second run:** the same with the N from test 1.
- **Look at:** each join at normal speed; ±12 frames stepped by hand; a moving object's speed across the join; `take.js` SSIM at the seam against an ordinary frame step; mean luma and saturation of each window (ffmpeg `signalstats`) against window 1; the face in window 3 against window 1; the sound at each join.
- **Failure:** the user can spot a join at normal speed; seam SSIM well under the ordinary step; luma or saturation moving in one direction across windows; the next window repeating the carried frames; a click or a jump in room tone; no gain over the control.

### Test 3: one long base, refine in windows

- **Step A, no code:** `-W 640 -H 352 --video-frames 481`, no `--hires`, 8 sigmas, seed 21, one prompt. Expected ~8 min (estimate). Fails on gray frames, stalled motion, or more card memory than stage 2 uses today. Stop here if it fails.
- **Step B, after the section 5 patch:** the same seed with `--hires`, windows of 121 frames and 4 latents pinned, audio frozen.
- **Look at:** each window boundary as in test 2; whether the detail level pulses as windows change; the single soundtrack against the picture; RAM at decode.
- **Failure:** the look changes at a boundary; detail pulses; lips drift from sound; decode hits the RAM guard (then decode per window and re-judge); slower than test 2 for the same length with no visible gain.

## 7. Attacks made on these recs

- **Row 1:** the model may fall apart when pushed. RuneXX says LTX trains up to 20 s with a sweet spot of 10–15 s, and NVIDIA says under 257 frames. Changed: the ladder stops at 361, and row 1 is treated as the window size, not the whole answer.
- **Row 2:** the carry inherits any fault in the tail, and H3's tail has one. Also, Lightricks' Tiled Fusion doc warns mid-clip latents differ from fresh-clip latents; that is why overlap frames are dropped and crossfaded. Changed: test 2 checks the tail and the crossfade, and adds a window-3 drift check.
- **Row 3:** it could lose to row 2, because one prompt must carry all beats and stage 1 sets all motion at 360p. Changed: kept third and marked NOT STANDARD, with step A as a cheap stop.
- **Simpler option:** plain H3 at 15 s has native stereo but is 480p here, below the look the user approved. It stays row 5 for this card and rises on better machines.

## 8. What I could not verify

- Every time and memory figure above 121 frames on this PC is arithmetic. Nothing was run.
- 0.13 MB per token comes from §H's 1,831 MB buffer and assumes it scales linearly. The 3070 report suggests about 0.09 MB in ComfyUI, with unknown steps and frame count.
- No user report of seams on Lightricks' `--chunked` was found, good or bad. No issue is filed either way.
- Reddit could not be fetched. It was reached through search snippets and two snapshot mirror pages, so that coverage is thin. Civitai was reached through snippets only.
- `ltx.io` pages failed to load, so the 32 GB vendor figure is a search snippet only.
- `Lightricks/LTX-2.5-22b-IC-LoRA-Restore` (1.71 GB) is gated, so I saw its size but not its card. It might serve as a final pass over a take. That is a guess.
- WanGP's VRAM figures are its author's own claims on its own engine, not sd.cpp.
- Whether Gemma 4 overflows on Turing as Gemma 3 does is unknown, so all LTX-2.5 rows here are open.
- FlowLong has a paper and a project page. No method code was found.
- RAVEN's licence is stated two ways: the card says the H3 community licence, MosaiChunk's README says CC BY-NC 4.0.
- H3-Seamless and PromptRelay repos carry no licence file I could find.
- H3-LongVideos is tagged not-for-all-audiences. Only its joining and colour-grade method was used.
- SVI's "no colour drift" claim comes from video titles in its README, not from data.

## 9. §B facts re-checked

| §B claim | Result |
|---|---|
| FramePack, 4060 8 GB, 4.83 s in 56 min, 43 GB | Confirmed on lilting.ch: 3,363 s, 145 frames, 608×640, 5.75 GB card, about 43 GB RAM at load |
| LTX-2.3 Q4, 3070 8 GB, 900×1600, 20 s, 21 min | Confirmed on a snapshot of Reddit 1rxtay2. Steps and frame count are not stated |
| LTX-2.5 Q4 + Gemma 4 Q4 ≈ 24 GB | File sizes: 13.58 + 8.41 GB = 22 GB before connectors and VAEs, so about right |

## 10. Query log

| # | Where | Query | What it returned |
|---|---|---|---|
| 1 | WebSearch | latest techniques to extend AI video longer than one clip without visible seam local 2026 | Vendor pages (invideo, higgsfield, ltx.io/blog, hailuo, kompozy). Last-frame chaining, reference chaining, native extend. No local seam proof |
| 2 | WebSearch | best way to make long continuous video with LTX-2 extend retake seamless ComfyUI reddit | Kijai LTX2.3_comfy discussion 32, RuneXX workflows, javawock7618, ComfyUI-LTXVideo wiki |
| 3 | HF API, sort lastModified | ltx extend; ltx-2 lora; LTX-2.5; ltx keyframe; ltx-video; stable video infinity; framepack; video extension; long video; infinite video | Smite79/MiniMax-H3-Longvideos, Robotman2100 long-duration analysis, LTX-2.5 IC-LoRAs, LongCat forks. Three queries empty |
| 4 | HF API, sort downloads | LTX-2.5 GGUF; ltx-2.5-distilled gguf; LTX-2.3 GGUF; gemma4 ltx gguf; SVI wan gguf; svi pro wan 2.2; MiniMax-H3 GGUF; LongCat-Video; SkyReels-V3; MAGI-1; Helios video; LongLive video; Krea Realtime | unsloth and others, svi repacks, LongCat, SkyReels V3, SANA LongLive, Krea. MAGI-1 and Helios video empty or off-topic |
| 5 | HF API | Helios; BestWishYsh Helios; SkyReels-V3-V2V; WAN VACE extend; PainterLongVideo; Wan2.2 long video lora; RAVEN; MiniMax-H3-RAVEN; H3 streaming lora; H3 extender; h3 continuation | Helios-Distilled, SkyReels-V3-V2V-14B, mvp-lab RAVEN LoRA. Others empty |
| 6 | HF API, file trees | epfl-vita/svi-model, Lightricks/LTX-2.5, vantagewithai, unsloth, Abiray, elix3r, leejet, SANA LongLive, LongCat, FramePack, SkyReels, SGF+, RMD, Looking-Ahead, MosaiChunk, Restore LoRA | All sizes in section 2 |
| 7 | gh search repos, sort updated | stable video infinity; video extension diffusion; infinite video generation wan; long video generation latent overlap; seamless video extension wan vace; ltx extend; framepack; long take video diffusion; autoregressive video generation; video continuation error recycling | SVI, LTX2-Infinity, svi2_colab, Klankdon, LTXDirector-Extender, framepack-U, SGF+, Looking-Ahead, MosaiChunk, RMD, Awesome-AR-Video-Memory. Several empty |
| 8 | gh search repos | MiniMax-H3 extend; H3 video continuation; LingBot-World-Infinity; Helios video generation long; DreaMontage; UnityShots; LongLive-RAG; Connected Self Forcing; SkyReels-V3 extension; Prompt Relay; RAVEN autoregressive video; H3-AR MiniMax autoregressive; Helios long video generation real-time; FlowLong | Herrgott, H3-Seamless, aex-drift, Extender workflows, PromptRelay, LongLive-RAG, UnityShots (no checkpoints yet), Connected-Self-Forcing. DreaMontage is a webpage only. FlowLong has only a page and assets |
| 9 | gh search issues | LTX-2: chunked, chunk seam, extend, long video, chunk-pixel-frames, OOM 8GB. ComfyUI-LTXVideo: extend, seam, looping sampler. sd.cpp: extend, keyframe, overlap, control_frames ltx, latent extend. FramePack: 6GB, RAM out of memory. LongCat: vram OOM memory. SVI: 8GB, VRAM, color drift flicker. Herrgott: 8GB/12GB | No chunk-seam issue. ComfyUI-LTXVideo #369: looping sampler has no audio. sd.cpp #1579 LTX 2.3 dev motion distortion (distilled fine). FramePack has low-VRAM issues open. LongCat and Herrgott none |
| 10 | gh search prs | ltx in sd.cpp, open | #1921, #1676, #1621, #491, #2249 (H3 hires) |
| 11 | WebSearch | SVI 2.0 Pro Wan 2.2 8GB VRAM GGUF long video works reddit StableDiffusion | No benchmark for 8 GB |
| 12 | WebSearch | Wan VACE clip joiner smooth transition between clips seam workflow civitai | Civitai 2024299, 2277993; 15–40 min per transition on a 4090 |
| 13 | WebSearch | new ways to make long AI video one shot no cuts open source model 2026 arXiv code | DreaMontage, LongLive-RAG, Helios, arXiv 2602.24289 |
| 14 | WebSearch | LTX-2 distilled 8GB VRAM 20 seconds video GGUF reddit single pass RTX 3070 laptop | Reddit 1rxtay2 mirror, LTX blog snippet |
| 15 | WebSearch | MiniMax H3 long video continuation 8GB 12GB VRAM reddit comfyui seamless extend how many seconds | Nothing for 8 GB; guides cite 12–24 GB |
| 16 | WebSearch | LTX-2.3 extend video overlap latent seam color shift quality loss each extension comfyui low VRAM 8GB 12GB | Nothing direct |
| 17 | WebSearch | RIFLEx video extrapolation longer than trained frames RoPE Wan HunyuanVideo riflex_freq_index what it does | Paper 2502.15894, thu-ml/DiT-Extrapolation |
| 18 | WebSearch | FramePack 8GB VRAM RAM usage time per second generated real user report quality vs Wan LTX 2026 | lilting.ch, PC Watch |
| 19 | WebSearch | LTX-2 last frames blurry extend trim last frames before continuing video chain best frame to continue | Nothing on blurry end frames; a gap in the search |
| 20 | WebSearch | PainterLongVideo Wan 2.2 motion continuity overlap frames seamless long video node how it works | README summary only; internals not read |
| 21 | WebSearch | Wan2GP LTX 2.3 sliding window 8GB VRAM long video overlap seams reddit report | WanGP pages, a mirror of a ComfyUI 8 GB thread |
| 22 | WebSearch | arXiv 2026 video extension overlapping latent co-denoising sliding window seamless long video diffusion code github | FlowLong 2605.20910, 2511.03272 |
| 23 | WebFetch | HF discussions: Kijai 32, RuneXX 127 and 131, javawock7618 | Method and reports used above |
| 24 | WebFetch | reddit.com; ltx.io/blog/how-to-extend-ai-videos; ltx.io/blog/ltx-2-dev-vs-distilled; ltx.io/model/capabilities/extend | All failed (blocked or header overflow) |
| 25 | WebFetch | Reddit snapshots 1rxtay2, 1t4ef4l; NVIDIA RTX guide; lilting.ch; fal retake and extend; arXiv 2605.20910 | Figures used above. 1t4ef4l: 3070 Ti 8 GB, 512×512, 8 s, 25 min |

Sources:
- [Lightricks/LTX-2](https://github.com/Lightricks/LTX-2)
- [Lightricks/ComfyUI-LTXVideo](https://github.com/Lightricks/ComfyUI-LTXVideo)
- [Herrgott H3 suite](https://github.com/HerrgottMargott/Herrgotts-H3-Infinite-Continuation-Suite)
- [ComfyUI PR 15375](https://github.com/Comfy-Org/ComfyUI/pull/15375)
- [H3 Seamless](https://github.com/yjrocks712/H3-Seamless)
- [AEX Drift](https://github.com/EchoHeadache/comfyui-aex-drift)
- [Wan2GP](https://github.com/deepbeepmeep/Wan2GP)
- [Stable Video Infinity](https://github.com/vita-epfl/Stable-Video-Infinity)
- [svi2_colab](https://github.com/wardayX/svi2_colab)
- [LongCat-Video](https://huggingface.co/meituan-longcat/LongCat-Video)
- [RAVEN LoRA](https://huggingface.co/mvp-lab/MiniMax-H3-RAVEN-Streaming-LoRA)
- [Robotman2100 LTX-2.5 long-duration analysis](https://huggingface.co/Robotman2100/LTX-Video-2.5-long-duration-analysis)
- [Kijai discussion 32](https://huggingface.co/Kijai/LTX2.3_comfy/discussions/32)
- [RuneXX discussion 131](https://huggingface.co/RuneXX/LTX-2.3-2.5-Workflows/discussions/131)
- [Reddit 1rxtay2 snapshot](https://reddit.sentinel-team.org/posts/1rxtay2/snapshots/2026-03-20T17%3A36%3A49.07391Z)
- [NVIDIA guide](https://www.nvidia.com/en-sg/geforce/news/rtx-ai-video-generation-guide/)
- [lilting.ch FramePack test](https://lilting.ch/en/articles/local-long-video-fastwan-framepack-rocm)
- [FlowLong](https://arxiv.org/abs/2605.20910)
- [fal LTX extend](https://fal.ai/models/fal-ai/ltx-2.3/extend-video)
- [Civitai VACE joiner](https://civitai.com/models/2024299/wan-vace-clip-joiner-smooth-ai-video-transitions-for-wan-ltx-2-hunyuan-and-any-other-video-source)
