# Same characters and sets across shots: research for JustDirect (2026-10-30)

Nothing was run, no weights downloaded, no GPU used. Sections E to H of the feasibility doc are treated as settled and
not re-derived. 8 GB is the floor; better cards get their own ranking (section 3).

Proof labels used throughout:
**M** measured on this PC (feasibility doc or `test-just-direct/logs`) · **C** confirmed by reading the code ·
**S** stated on a card or doc · **U** user-reported · **N** not verified.

---

## 1. The answer

1. **Today, on 8 GB, the keyframe route is the only one measured end to end** at a quality the user accepted. It pins
   frame 1 only, so it has not yet been proven across a sequence.
2. **The strongest upgrade is LTX Ingredients.** One sheet holds cast, props and set through the whole clip. The official
   recipe puts the guide on the half-size stage only, so it should fit 8 GB. It is about 120 to 150 lines in
   `video.cpp` (my estimate), plus the fork merge and our AdaLN patch re-fit. User reports are mixed, so test before trusting it.
3. **MiniMax-H3 Ref2VA needs no code, and it has already run here**, but it is capped at about 480p on 8 GB. It becomes
   the best option on 12 to 16 GB and up. The 480p clip it made has never been looked at.
4. Corrections to our own docs are in section 5.

**Attacked before showing:**
- The keyframe route only pins frame 1, and a character who turns or enters later is unpinned. So Test 1 is a three-shot sequence,
  not one clip.
- Ingredients has real failure reports: the sheet animates itself, faces melt at 1280×720, card and official graph disagree.
  That moved it below the measured route and added a wiring gate to Test 2.
- H3 has strong community backing, but 480p cannot be judged against LTX's 720p without eyes on the clip, so it sits third
  on 8 GB and first from 12 GB up.

---

## 2. Ranked table, 8 GB floor, best first

"Weights" = open weights and size, from the Hugging Face API today. Licences are labels only.

| # | Candidate | How it works | Proof | Weights, size, licence | 8 GB outlook and why | Engine path |
|---|---|---|---|---|---|---|
| 1 | **Keyframe route**: FLUX.2 klein 4B `-r` still → LTX-2.3 two-stage picture-to-video | Identity is built into the first frame; the clip follows it | **M** 20 s + 407 s, 1280×704×121. One woman held across 3 scenes in stills. Not proven as a video sequence | Already on disk. Apache-2.0 (klein); LTX community | **Works.** Peak 7,231 MB (T2V, same stage buffers for I2V) | In sd.cpp; needs `jd` patch for 720p picture-to-video |
| 2 | **LTX Ingredients IC-LoRA** on LTX-2.3, alone or with a first-frame keyframe | One sheet, repeated as a still video, encoded and appended as clean tokens; LoRA learned to attend across them | **C** pipeline and graphs read. **S** card. **U** mixed. **N** on this PC | 2.3 and 2.5 files 1,248 MB each, gated, LTX community | **Likely.** Stage 1 guide: 3,520 + 3,520 = 7,040 tokens, half of stage 2's 14,080 that already fits. Single-stage 960×544 is 16,320 tokens, likely over. Risk: 960 LoRA tensors at runtime; untiled 121-frame encode | **Small addition**, section 6 |
| 3 | **MiniMax-H3 Ref2VA** | Up to 9 pictures, 3 videos, 3 audio clips as attended references, with labels `<Subject N>`, `[Shot N]`, joint sound | **M** 864×480×124, 2 refs, 4-step turbo, 376 s, 7,024 MB. Output never viewed. **S** official prompt guide. **U** identity praised, not guaranteed | leejet GGUF Q4_K_M pruned 11.4 GB (`rows.js`); Abiray fused Q3 8.5 GB, Q4 11.0 GB. H3 community licence (form needed in USA, EU, UK, South Korea) | **Works at 480p.** Compute buffer 4.8 GB at 864×480, so 720p (×2.25 tokens) won't fit (estimate) | **In sd.cpp.** Multi-shot is prompt text only |
| 4 | **H3 orbit sheet** (feeder for 1 to 3) | One H3 pass, statue pose, slow orbit, no cuts; pull 4 to 6 frames as a turnaround. Frames from one pass agree | **S** PoopMan333 workflow (213 likes). **N** on this PC | Workflow only; uses H3 | **Should work**, 480p panels. 73 frames for 4 panels | Already possible: `h3` preset plus frame extract |
| 5 | **LTX mid-clip keyframes** (`ImageGuide` at any frame) | Extra stills appended at chosen frames, 1 latent frame each | **C** `keyframe_cond.py`, conditioning.md. **N** here | No new weights | **Likely**; adds about 220 tokens per keyframe at stage 1 | Same work as #2, needs a list of appended blocks |
| 6 | **Character LoRA** (small) | Train the face into the model. One H3 user says a trained LoRA is the only way to beat "SD 2.5" (probably Seedance) on consistency across a short drama | **S** trainer README. **U** one comment. **N** | LoRAlab trainer, MIT, Python; H3 rank 16, 600 steps | Train **H3 8 GB** (S, ~37 min on 16 GB; 8 GB time not stated), **FLUX.3 klein 8 GB** (S). LTX needs 12 GB | Run: `<lora:>`, proven with H3's turbo. Training: Python tool, needs the user's word |
| 7 | **Dual-Character LoRA** (SyFeee) | Ordinary LoRA with first-frame pin, author's A/B says it is not a real IC-LoRA; composite picture for two people | **S** author only | 312 MB, Apache-2.0 | **Should work**: same path as #1 at the same 1280×704×121 | **In sd.cpp** via `<lora:>`; LTX LoRA path unproven here |
| 8 | **LTX-2.5 native multishot** | Cuts written as prose inside one prompt | **S** official guide: 2 to 4 shots, 8 to 10 s. Identity by text only. **N** independent test | Q4_K_M 12,955 MB (unsloth); text encoder Q4_K_M 8,025 MB (elix3r, gated); LTX community | **Doubtful for 10 s**: 241 frames doubles stage 2 to about 28,160 tokens. 121 frames with 2 shots may fit. LTX-2.5 never run here | **In sd.cpp** (T2V, I2V); diffusion decoder not implemented |
| 9 | **Ingredients multishot fine-tune** (linoyts) | Same mechanism, trained 2,500 steps on multi-shot data | **S** card has no claims or samples. **C** header read | 1,248 MB, not gated | Same as #2 | Same as #2 |
| 10 | **Entity memory scheduling** (GroundShot, EntityMem method) | Generate the shots that show an entity best first, save verified crops, retrieve them for later shots | **S** paper abstract. No code found | No weights needed | Fits: it is scheduling on top of #1 to #3 | **App logic**, not engine |
| 11 | **ID-LoRA** (voice, not face) | Reference audio appended at negative time positions; face comes from the first frame | **C** `audio_ref_only_ic.py`. **S** 24+ GB official | 1,104 MB × 2 datasets, not gated, audio branch only, 1,728 tensors | **Unknown.** Audio tokens are cheap, video tokens unchanged | Moderate: needs audio reference latents, overlaps PR #1676 |
| 12 | **Phantom Wan 1.3B** | Reference latents appended on the time axis; 3 model passes per step | **C** `subject2video.py`. **U** one tutorial: 8 GB for two subjects | 5,429 MB, Apache-2.0 | **Possible at 480p, poor fit**: base 1.3B is below LTX quality, 3 passes per step | Small to moderate; sd.cpp #966 open since 2025 |
| 13 | **MultiShotMaster** (Kling, CVPR 2026) | Multi-shot RoPE and per-shot captions; ≤5 shots, ≤308 frames | **C** repo read. Multi-reference version unreleased | 1.3B 2,707 MB, 14B 27,253 MB, Apache-2.0 | **Unmeasured**, 480p only on 1.3B, text-only consistency | Moderate port |
| 14 | **StoryMem** | Shot by shot; 8 to 10 keyframes of past shots as memory at negative RoPE, rank 128 LoRA | **C** `model_memory.py`. **U** 4090 crashes, A800 works; one user reports poor motion | 2,340 MB × 2 on Wan 2.2 A14B; CC-BY-NC, code S-Lab non-commercial | **No.** Two 14B experts, 40 steps, plus memory tokens | Moderate port. The method idea is what is worth keeping |
| 15 | **Stand-In**, **SkyReels-V3 R2V**, **HuMo 1.7B**, **HoloCine**, **HunyuanCustom**, **ShotStream** | See section 4 | See section 4 | See section 4 | **No, or not worth it** | Large ports, except SkyReels via VACE merge (N) |

---

## 3. Best option per tier

The app needs no separate code per tier: sd.cpp's auto-fit places weights by free memory, so a tier is a row of model file,
size and frames. A card with BF16 (RTX 30 series and later) should also run the text encoder on the card without the overflow fix.
That is inferred from section E, not tested.

| Tier | Best video route | What the extra memory buys | Source for the VRAM figure |
|---|---|---|---|
| **8 GB** | Keyframe route, then Ingredients on stage 1 once built. H3 Ref2VA at 864×480 for clips with several references and sound | Floor | **M** 7,231 MB LTX; **M** 7,024 MB H3 |
| **12 GB** | **H3 Ref2VA** at about 0.5 MP (576×832×124), or 1280×736 with 4-step + EasyCache. LTX Ingredients at 960×544 (the official size) | Twice the pixels on H3; official Ingredients size; can train LTX character LoRAs | **U** 10.66 GiB peak, RTX 4070 (sepiablue benchmark, in awesome-minimax-H3). **U** 420 s per 5 s at 1280×736 (shiqikuangsan31 guide, same file); 64 GB RAM called the real fix. LTX 12 GB: Civitai workflow titles only, not opened. **S** LoRAlab: LTX-2.3 LoRA 12 GB. **S** BFL: klein 4B LoRA 12 GB |
| **16 GB** | **H3 Ref2VA** Q4 at 960×544 to 1 MP, 8 steps or Pika Flex 6 steps. LTX-2.5 Q4 to Q5 with Ingredients | Native H3 size range; LTX-2.5 becomes practical | **U** RTX 5080 grid at 960×544 (jo-nike eval); **U** ~5 to 6 min per 5 s at 1 MP (same file). **S** LTX Desktop "may work" on 16 GB (help.ltx.io, search snippet only). joeygambino: Q4_0 for 16 GB |
| **24 GB** | **H3 Ref2VA** Q5_K_M or pruned INT8 at 1 MP, 20 steps, up to 9 refs. LTX-2.5 Q8 with Ingredients. Character LoRAs of any kind | Best consumer quality per community; more refs without spill; ID-LoRA one-stage possible | **U** "best consumer" tier (awesome-minimax-H3). **S** sd.cpp on RTX 4090: 16.85 s/it at 1376×768×124 (PR #2240, its author's numbers). **U** LTX-2.5 Q8 ~24 GB (uploader). **S** ID-LoRA 24+ GB one stage. **S** BFL: klein 9B LoRA 22 GB |
| **32 GB+** | LTX-2.5 two-stage with `--stage-2-ic-lora`, DFR pipeline. StoryMem-style memory, HoloCine become possible | Guide on both stages; official LTX trainer | **S** docs.ltx.io: 32 GB+ minimum, A100 80 GB recommended. **S** ltx-trainer: 32 GB low-VRAM config, 80 GB standard. **S** ID-LoRA two-stage 48+ GB. **S** HunyuanCustom 24 GB minimum, 80 GB recommended. **U** StoryMem 80 GB (issue #14; ComfyUI port says 24+ with optimizations) |

Warning: 8 GB figures from ComfyUI users do not transfer directly. awesome-minimax-H3 reports 768p on 8 GB (~7.5 GB, RTX 4060), while
sd.cpp's own buffer here was 4.8 GB at 480p. The two conflict and I could not resolve it.

### What a better machine gets, per candidate

"Estimate" = my token arithmetic from measured buffers (0.126 MB per token, 511 MB at 3,520 and 1,831 MB at 14,080), not a report.

| # | Candidate | 12 GB | 16 GB | 24 GB and up | Source |
|---|---|---|---|---|---|
| 1 | Keyframe route | LTX-2.3 Q5_K_M (15.2 GB file), less streaming | Klein 9B or Qwen-Edit stills; stage 2 at 1920×1088 possible (estimate 4 GB buffer) | Q8_0 (21.7 GB file) | File sizes: HF API. Official LTX minimum 32 GB (docs.ltx.io). This PC shows 8 GB works, so that minimum is not a hard limit for sd.cpp |
| 2 | Ingredients | Official 960×544 single stage (estimate 2.1 GB buffer) | Guide at 960×544, then stage 2 at 1920×1088 (estimate) | `--stage-2-ic-lora` keeps guide on stage 2: double tokens, about 8 GB buffer at 1920×1088 (estimate) | No inference VRAM figure published. ic_lora.py and pipelines.md for the options |
| 3 | H3 Ref2VA | 576×832×124, 10.66 GiB peak | 960×544 to 1 MP | 1 MP, Q5_K_M, 20 steps | awesome-minimax-H3, U |
| 4 | H3 orbit sheet | Panels at higher pixel count | Same | 6 panels, 124 frames at 1 MP | As rank 3 |
| 5 | Mid-clip keyframes | As rank 1 | As rank 1 | As rank 1 | No figure published |
| 6 | Character LoRA | LTX-2.3/2.5 LoRA from images, 768×768, 800 steps; klein 4B | H3 video-clip LoRA, 600 steps ~1 h 10 min | Klein 9B 22 GB; official LTX trainer 32 GB | LoRAlab README (S), BFL docs (S), ltx-trainer docs (S) |
| 7 | Dual-Character LoRA | Same as rank 1 | Same | Same | Card gives no VRAM figure |
| 8 | LTX-2.5 multishot | Q3_K_M marginal for 8 GB by one guide | Q4 to Q5, 8 s clips likely | Q8_0 ~24 GB, 10 s, 2 to 4 shots | Third-party guides (search snippets) and uploaders, U. Not checked |
| 9 | Ingredients multishot | As rank 2 | As rank 2 | As rank 2 | As rank 2 |
| 10 | Entity memory | No VRAM dependence | Same | Same | App logic |
| 11 | ID-LoRA | No | No | One-stage with quantization 24+ GB; two-stage 48+ GB | ID-LoRA-2.3 README (S) |
| 12 | Phantom | 14B Q3 GGUF 6.8 GB file | 14B, 480p trained, 720p "less stable" | Full 14B | File size HF API; Phantom README (S). No official VRAM figure |
| 13 | MultiShotMaster | 1.3B | 14B at 480p | 14B at 720p | README (S) for sizes; no VRAM figure stated |
| 14 | StoryMem | No | No | 24 GB+ "with optimizations", but a 4090 crashed; 80 GB official-run report | anveshane node README (S), issue #14 (U) |

---

## 4. Other candidates, checked

| Candidate | Finding | Proof | Better machine |
|---|---|---|---|
| **Stand-In** (Apache-2.0, 600 MB × 3) | 153M-parameter identity adapter on Wan 14B; Wan 2.1 and Wan 2.2 versions; V2 "coming soon" (2026-08). 14B ran out of card memory at 720p here. Needs a face preprocessor. No VRAM figure found | **C** repo layout, **S** README | Wan 14B tier, 16 GB+ by inference only |
| **SkyReels-V3 R2V** (Skywork licence, 27 GB) | 1 to 4 reference images including background, 14B-720P. VACE merge GGUF exists (BlackStone-Yu), not checked in sd.cpp | **S** README | `--low_vram` for under 24 GB at 540P (**S**) |
| **HuMo 1.7B** (Apache-2.0, 3.3 GB fp16) | Text, reference image, audio to talking video. Card: lower visual quality than 17B, 8 min for 480p on a 32 GB GPU | **S** card | 17B 16 GB fp8 file; no VRAM figure |
| **HoloCine** (CC-BY-NC-SA, 54.5 GB × 2) | All shots in one pass on Wan 2.2 14B, about 15 s max (user comment). No sd.cpp path | **S**, **U** | Above 24 GB; no official figure found |
| **HunyuanCustom** (28.8 GB) | Official 24 GB minimum at 720p; README also claims 8 GB via WanGP, unverified | **S** | 24 GB+ |
| **ShotStream** (Kling, ECCV 2026, Apache-2.0, 5.4 GB) | Causal Wan 1.3B, next shot from history, 16 fps claim. Large port. Worth watching for speed, not quality | **S** card | Not stated |
| **Pika H3 Flex** (yesterday, H3 community, 1,866 MB Comfy LoRA) | 6-step post-trained adapter with Ref2VA. Same reference limits as H3. Added as an A/B in Test 3 | **S** card, Comfy PR #70 | H100 tested only |
| **H3 chain packs** (ComfyUI-H3-Multishot, Apache-2.0) | Long takes via `context_pin` (last 22 frames as raw latents) and a memory bank. Texture ratchet +13% per join is reported by its author. This is item 6, not identity | **S** | Defaults for 16 to 24 GB |
| **Wan-Animate 2** (Apache-2.0, 31 GB), **ID-V2V** (19 GB int8, ~16 GB+) | Actor motion transfer and restyle of existing video, not generation from a saved cast | **S** | 16 GB+ for ID-V2V (one source) |
| **MovieGrid** (Wan 5B) | Many tiny cells on one canvas; 5B already failed the user's eye | **S** README | Not relevant |
| **CineDance-LTX** (LTX-2.3 adapted) | Would be a drop-in, but checkpoints unreleased: repo checklist shows inference and weights unticked | **C** README | Watch |
| **PoCo** (reference routing via RoPE) | Core code unticked, no weights | **C** README | Watch; solves identity swap between two people |
| **Mise-en-Video** | Repo releases data tools only | **C** README | Not usable |
| **MemFlow, ShotDirector, UniVideo, Bernini-R** | Sizes read, cards skimmed. Not assessed further: 1.3B base, or H100 reference environment | **N** | Not assessed |
| **WeVisCut** (Tencent, new this week) | Editing agent, not a video generator; ~24 GB bf16. Relevant to J items 7 and 8, not here | **S** | 24 GB |

---

## 5. Corrections to what we have written

- **Feasibility I.3 says the IC-LoRA guide uses `VideoConditionByKeyframeIndex`.** That is what `conditioning.md` says, but the
  code uses `VideoConditionByReferenceLatent` (`iclora_utils.py`, `reference_video_cond.py`). For a multi-frame guide at frame 0 the
  positions come out the same. sd.cpp's keyframe loop, however, has no causal fix, so it does not match either.
- **Feasibility I.3 "strength 1.4, 30 steps, guidance 4.0"** is the 2.3 card's validation recipe. The official graphs are
  8 distilled sigmas, cfg 1, `euler_ancestral_cfg_pp`, 960×544, 121 frames, sheet resized to short side 544. Users on the
  LoRA's own forum confirm the mismatch (#10, #13).
- **Section B "FLUX.2 klein 4B LoRA needs 24 GB"** is wrong: BFL says 12 GB (klein 9B needs 22 GB).
- **Section B "on 8 GB only SDXL"** is out of date: LoRAlab's README lists 8 GB for H3, Z-Image, FLUX.3 klein and Qwen-Image 2.1.
  Stated, not tested. Z-Image conflicts with OmniChar's measured 13 to 15 GB.
- **§H "H3, 5 s at 480p, 376 s"** was Ref2VA with 2 pictures and turbo v0.1 (log confirmed), so it is already the reference path.
- **Ingredients 2.5:** the official 2.5 graph links the **2.3** file. The 2.5 card says strength 1.0, pre-scaled. An early
  thread said 2.3 on 2.5 failed, then a user reported it best at 1.3.

---

## 6. What the sd.cpp addition is (for rank 2)

All in `src/pipeline/video.cpp` unless noted. Line numbers are branch `jd`. Prerequisite under the family fork rule: merge upstream first
(`jd` is 25 commits behind) and re-fit AdaLN patch `dffe732`. The guide gives two distinct timesteps across the tokens, the same
case as picture-to-video, so the patch is required on 8 GB.

1. Replace the error at line 781 with a guide path. `sd-cli --control-video <dir>` (`examples/cli/main.cpp:863`) and the server
   field `control_frames` (`routes_sdcpp.cpp:219`) already exist.
2. Stack the frames at the stage size, `sd->encode_first_stage`, untiled. Official code does not tile an untiled stage's guide
   because that changes the latent. If it won't fit, run the encoder on the CPU.
3. Concat to `init_latent` and `denoise_mask` on dim 2 with mask 0, as `apply_video_condition_by_keyframe_index` (line 802) does.
   `init_latent` is only created when a start or end image exists today, so that block must move.
4. In `build_ltxv_video_positions` (line 83), let the appended block use `ltxv_latent_corner_to_pixel_frame`, so the guide's
   time positions equal the target's.
5. Crop guide frames from `final_latent` before `upscale_ltx_spatial_video_latent` (line 1784). The crop at line 1983 already
   exists for the no-hires case.
6. Drop the LoRA for stage 2 (official default): `set_weight_adapter` on the diffusion model; quantized weights force at_runtime
   mode (`diffusion_engine.cpp:1033`). This step does not exist yet.
7. For mid-clip keyframes (rank 5), `video_conditioning_frame_count` must become a list.

Already fine, read not run: LoRA keys map (`lora_A` → `lora_down`, `diffusion_model.` prefix, names match `ltxv.hpp`). A runtime LoRA of
1.95 GB ran on this card with H3, 624 of 624 tensors (**M**).

NOT STANDARD until upstream takes it, same as our AdaLN patch. Standard behind it: `ic_lora.py`.

---

## 7. Exact tests for the top three

All use `E:\Dev\Web\test-just-direct`, existing models unless named, one job at a time, nothing else on the card. `$ref` is
`frames\srv3-1-p1-f60.png`. Ingredients and Pika files are new downloads, so they need the user's go.

### Test 1: keyframe route across three shots (no code)

**Files:** klein, LTX-2.3 Q4_K_M and the `jd` build, all on disk.

1. Make a prop picture: `node cli.js prop-mug klein -W 768 -H 768 -p "a chipped blue enamel mug on a plain black background, product photo"`.
2. Three keyframes, same seed, each with `-r $ref -r out\plate-cafe.png -r out\prop-mug.png`, at `-W 1280 -H 704`:
   wide of her at the table with the mug; over-the-shoulder close-up holding it; side view by the window. Labels `seq1`, `seq2`, `seq3`.
   sd.cpp's klein docs show one `-r` only, and three together are unmeasured. If klein drops any, use the `flux3` preset (docs/flux3.md: up to 10 `-r`).
3. Three clips: `$env:SDCLI='E:\Dev\Web\stable-diffusion.cpp\build-jd\bin\sd-cli.exe'`, then `node cli.js seqN-v ltx @base -i out\seqN.png --seed 41 -p "<shot>"`, with
   `$base` from `queue5.ps1`. Each prompt has an action that turns her head at least 45 degrees.
4. Join with a hard cut.

**Look at:** full-size crops of the face at frames 0, 60 and 120 of each clip, side by side; the window, table and light position
between shots; the mug's colour and chip.

**Failure:** a viewer would call any shot a different person; wardrobe, hair or mug change between shots; the room layout
changes between angles; or her face changes more inside a clip than between keyframes (that means frame-1 pinning is not enough, and
rank 2 is needed).

### Test 2: Ingredients (needs section 6 first)

**New files:** `ltx-2.3-22b-ic-lora-ingredients-0.9.safetensors` (1,248 MB, gated, accept terms). Sheet: 1456×825, black
background, no text, 12 px gaps. Top row: face close-up, body turnaround (from the H3 orbit, rank 4, or klein stills), mug. Bottom 40%: `plate-cafe.png`.
Panels whole, not cropped. Export 121 identical frames to a folder.

**Prompt shape:** `Reference sheet: <each panel, by position>` then `Generated video: <shot, restating wardrobe>`. Name every panel,
props included.

Ladder, stopping at the first failure:

| Step | Size | Settings | Gate |
|---|---|---|---|
| a. Wiring | 512×288, 49 frames, one stage | `--control-video sheet\`, `--lora-model-dir <folder>`, `<lora:ingredients:1.0>` in the prompt, 8 distilled sigmas, cfg 1 | Log says **960 / 960 LoRA tensors applied**. The clip shows a scene, not the sheet |
| b. Two-stage | 640×352 → 1280×704, 121 frames, `$base`, guide stage 1 only | LoRA 1.0, then 1.4, same seed | Runs without out-of-memory. Compare the two strengths |
| c. Official size | 960×544, 121 frames, one stage | LoRA at the better strength | May run out of card memory; that is a result, not a failure of the method |
| d. Combined | As b, plus `-i` a keyframe from Test 1 | | Better than Test 1 and b alone? |

**Look at:** the same crops as Test 1, side by side against the same shot from Test 1, with the same seed. Also whether the mug and
window appear unprompted by frame 1.

**Failure:** panels or black bars visible in the output (the sheet animating itself); fewer than 960 tensors applied; faces
melting or blur worse than Test 1; or no visible gain over Test 1 (then the code is not worth carrying).

Time estimate from a two-point fit of measured steps (18 s at 3,520 tokens, 44.5 s at 14,080): about 27 s a step at 7,040 tokens,
so roughly 60 s more than the 410 s clip, plus the guide encode and LoRA overhead, both unmeasured.

### Test 3: H3 Ref2VA multi-shot, then Pika Flex (no code)

**First, one minute:** watch `out\h3-ref2va-480p.mp4`, which nobody has judged. If the face and picture are not acceptable at 480p, stop here.

**Prompt:** official format from `VIDEO_PROMPT_WRITING_GUIDE_ref_en.md`, as in `queue5.ps1` with `subject_definitions`, `summary`,
`retention_analysis`, `detailed_description`. Later shots: `[Shot 2] At 00:02.000, the shot cuts to a close-up of <Subject 1>...`.

**Run:** `node cli.js h3-ms h3 -W 864 -H 480 --video-frames 124 --vae-tiling -r $ref -r out\plate-cafe.png -r out\prop-mug.png -p <prompt>`,
then the same seed and prompt with the orbit-sheet stills added as extra `-r`.

**A/B, new file** (`pika_h3_flex_ref2va_comfy_bf16.safetensors`, 1,866 MB): replace the turbo LoRA in the prompt, point `--lora-model-dir`
at its folder, and pass `--steps 6 --sampling-method lcm --sigmas 1.0,0.972973,0.923077,0.8,0.571429,0.333333,0.0`. Sigmas and sampler come from Comfy-Org PR #70. Check the log for all
LoRA tensors applied.

**Look at:** whether the cuts are real and land near the stated times; face against `$ref` at full size in each shot; the
window and table across the cut; red patches on the cheeks (reported on Ref2VA, #55); sound across the cut.

**Failure:** a dissolve instead of a cut; face change between shots; reference colour or layout lost; audio breaks at the
cut; out of memory with a third reference. 480p softness against LTX's 720p is the user's call by eye.

---

## 8. Not verified

- **Reddit could not be read.** `reddit.com` returns 403 to curl and the search tool refuses the domain. Reddit reports here are second-hand through
  awesome-minimax-H3's thread IDs. I did not route around the block or use the user's browser.
- **No Ingredients run exists on 8 GB anywhere that I found**, nor any inference VRAM figure for it. Its fit here is token arithmetic.
- **ltx.io pages** failed WebFetch; multishot rules came from docs.ltx.io and Runware.
- **The official gated Ingredients headers were not read.** I did not use the user's local Hugging Face token. The linoyts fine-tune's header
  stands in, same size and layout; its metadata was empty, and `reference_downscale_factor` 1 is from the card.
- **Civitai:** the API answered and titles were read, but no workflow was opened.
- **sd.cpp + LTX LoRA:** key mapping read, never run. Any LTX LoRA in sd.cpp is unproven, including ranks 2, 7, 9.
- **LTX-2.5 on this PC:** never run. Whether elix3r's text encoder GGUF loads in sd.cpp is unknown; sd.cpp's docs convert from safetensors.
- **Quality comparisons:** every "better" here is a card or forum claim. No independent benchmark of identity across these models was found.
- **The 12 GB+ tier picks are from ComfyUI reports,** not sd.cpp, except PR #2240's RTX 4090 numbers.

A gap in these searches is a gap in the searches, not proof that nothing exists.

---

## 9. Query log

**Hugging Face API**
1. `models?author=Lightricks&sort=lastModified` → 60 repos; IC-LoRAs re-touched 2026-10-22; new LTX-2.5-Pre-Trained, LTX-2-Marking.
2. Search, 21 terms ("ltx id lora", "ltx multishot", "multishot", "phantom wan", "wan vace", "hunyuancustom", "minimax h3", "wan animate", "lingbot video", "skyreels", "magref", "seedance", and others) → linoyts multishot, MultiShotMaster, joeygambino H3 pack, Smite79 long videos, SkyReels-V3, Wan-Animate-2. "consistent character video", "reference to video", "humo video", "stand-in wan" → nothing.
3. Newest uploads per org: Wan-AI, ali-vilab, tencent, ByteDance, ByteDance-Seed, black-forest-labs, Qwen, Kijai, robbyant, meituan-longcat, Skywork, KlingTeam, MiniMaxAI, Comfy-Org, lightx2v, alibaba-pai → Wan2.2-Animate-2, Bernini-R, ShotStream, MemFlow, HuMo repack, H3 ControlNet 2.0, H3 prompt rewriters, Kijai H3 experimental.
4. Search "CineDance", "cinedance ltx", "character consistency ltx lora", "ltx-2.3 multi-shot" → nothing. "H3 Flex", "pika h3" → Pika-Labs/Pika-H3-Flex and repacks.
5. `?blobs=true` sizes for all named repos. Safetensors headers by Range request, headers only: linoyts multishot, AviadDahan ID-LoRA.
6. Discussions read: LTX-2.3 Ingredients (14), LTX-2.5 Ingredients (listed), Comfy-Org/MiniMax-H3 (selected), H3 workflow, ID-LoRA, StoryMem.

**Web**
7. "latest techniques consistent characters across shots AI video open source local 2026" → vendor blogs; multi-character blur said unsolved.
8. "LTX-2.5 multishot native multi-shot prompt shots same character" → ltx.io page, secondary coverage.
9. "LTX Ingredients IC-LoRA reddit results character reference sheet VRAM" → cards, Patreon; no inference VRAM.
10. "MiniMax H3 Ref2VA character consistency multishot reddit StableDiffusion low VRAM" → GGUF cards, awesome-minimax-H3, ComfyUI-H3-Multishot.
11. "HoloCine StoryMem multi-shot long video open weights Wan 2.2 consistent characters" → repos, arXiv.
12. "new multi-shot video generation arXiv 2026 code weights character consistency reference open source model" → GroundShot, MovieGrid, CineDance, EntityBench, MVAgent.
13. "docs.ltx.video how to prompt LTX-2.5 multishot shot syntax cuts" → Runware guide; docs not returned by search.
14. "LTX-2.5 GGUF 8GB 12GB VRAM ComfyUI reddit results minutes multishot quality compared to LTX-2.3" → quant cards, no timings.
15. "LTX-2.5 system requirements VRAM GPU minimum recommended open source model docs.ltx.io" → docs page, conflicting figures.
16. "train character LoRA low VRAM 8GB 12GB FLUX.2 klein Z-Image musubi-tube ai-toolkit requirements" → BFL docs, LoRAlab, OmniChar.
17. "Phantom Wan 1.3B 8GB VRAM ComfyUI subject to video multiple references results 480p" → one tutorial figure.
18. "Stand-In Wan 2.2 identity LoRA ComfyUI VRAM requirement face consistency test review" → no review, no VRAM figure.
19. "Kijai Wan ID V2V idv2v model what is it Wan 2.1 identity video to video 2026" → ID-V2V, Eyeline-Labs.
20. Two searches restricted to reddit.com → refused by the tool.

**WebFetch (read):** LTX-2.5 and LTX-2.3 Ingredients cards, LTX-2.5 card, MiniMax-H3 card, Runware multi-shot guide, docs.ltx.io prompting guide and system requirements, BFL klein training, arXiv 2606.20799 and 2606.09639, CineDance project page, comfyui-ingredients-sheet-builder. **Failed:** two ltx.io pages.

**GitHub**
21. `gh search issues` in leejet/stable-diffusion.cpp: IC-LoRA, ic_lora, ingredients, control_frames LTX, LTX guide, reference video LTX, phantom, multishot, LTX-2.5 lora, ltx lora → nothing relevant except #966 (open). Open PR list read: #2249, #1676, #1906, #2010, #2240 (merged).
22. `gh search issues` in Lightricks/ComfyUI-LTXVideo: ingredients, IC-LoRA ingredients, ICLoRA VRAM → nothing returned.
23. `gh search repos`: "multi-shot video generation" → Mise-en-Video, moviegrid, ShotStream, PoCo, ShotDirector, MultiShotMaster and others. "StoryMem" → official and anveshane/Comfyui_StoryMem. Three others ("reference to video character consistency", "ComfyUI consistent character video", "ltx ingredients") → nothing returned.
24. StoryMem issues 6, 12, 14, 16 read; kijai/ComfyUI-WanVideoWrapper #1822 read.

**Clones read, nothing run**, under `research-clones\consistency`: LTX-2, ComfyUI-LTXVideo, awesome-minimax-H3, Phantom, Stand-In, HunyuanCustom, MultiShotMaster, SkyReels-V3, StoryMem, HoloCine (cloned, README not read in depth), ID-LoRA, ShotStream, Mise-en-Video, PoCo, moviegrid, ShotDirector.

**Other:** Reddit JSON by curl → 403. Civitai API, 4 queries ("ltx ingredients", "ltx 2.3 consistent character", "minimax h3 character", "h3 multishot") → titles only, including LTX 12 GB workflows, H3 character sheet workflows, Seamless Chain.

**Local read:** `E:\Dev\Web\stable-diffusion.cpp` branch `jd` (`video.cpp`, `lora.hpp`, `diffusion_engine.cpp`, `name_conversion.cpp`, `docs/`), `E:\Dev\Web\test-just-direct` (`cli.js`, `rows.js`, `queue4.ps1`, `queue5.ps1`, `logs/h3-480p.log`, `logs/h3-small.log`).
