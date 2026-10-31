# JustDirect: saved character, set and prop pictures, one consistent keyframe, and image fixes (2026-10-30)

Nothing here was run: no graphics card, no model, no weights downloaded. Clones were read, not executed.

Scope, from the user mid-task: "we want it to work on my specs but also different machines better specs as well this is
not just for me it is for anyone". 8 GB is the floor. Feasibility sections E to H are settled and were not re-derived.
Anything used from sections A and B was re-checked (see "Corrections").

Proof labels: **code** = read in source; **card** = stated on a model card or README; **user** = reported by a user;
**API** = Hugging Face API; **measured** = measured on this PC by an earlier session; **unverified** = only a claim, or
nothing tested.

## What this comes to

- **Cast, set and prop in one keyframe has never been run on this PC.** Every row below that says "several references" is
  unproven here. Only one reference at a time was measured.
- **The earlier FLUX 3 runs skipped its prompt upsampler.** BFL: "Do not use the model without it", because "The model is
  trained on the captions it writes". The text encoder never sees the pictures, so a caption is the only thing telling
  the model what to take from which image. This may explain the two-reference run that copied the wrong pose. Unverified.
- **The set can be locked outright, not just referenced.** `--mask` works on every model, and pixels outside the mask keep
  the original latent at each step, so the set cannot drift. It has never been tried for placing a person.
- **FLUX 3 boxes are only prompt text**, so sd.cpp can carry them with no new input. But sd.cpp treats `[ ] ( )` as weight
  syntax, so they must be sent as `\[ \] \( \)`.
- **sd.cpp's built-in face fix cannot use the saved actor.** `detailer.cpp:987-988` removes the reference images.
- **For anyone with a bigger card:** sd.cpp streams weights, so a card size is mostly a speed and resolution step, not a
  yes or no. System RAM decides what loads at all (Qwen-Edit Q4_K_M took 29 GB private RAM here).

## Ranked table, best first

Sources V1 to V14 are listed under the tier table. "Better cards" figures are not sd.cpp measurements unless they say so.
Sizes are GiB as the API reports them.

| # | Candidate | How it works | Proof | Open weights, size, licence | 8 GB outlook, why | Engine path | Better cards get |
|---|---|---|---|---|---|---|---|
| 1 | **FLUX 3 Klein, several `-r`, caption from its upsampler** (keyframe) | Each picture is VAE-encoded into its own token stream, labelled -1, -2, … The upsampler looks at the pictures and writes which thing comes from which image. Up to 10 refs; one workflow author reports drift past 4. | **Code:** references. **Card:** upsampler needed. **Measured:** one ref holds shape best (6.2 px against klein's 14.5). Two refs with no caption copied the wrong pose (177 px). Three refs: **unverified**. | Q8_0 5.73 GB, text encoder Q8: on disk. Upsampler Q4_K_M 5.24 + mmproj 0.86 GB: not on disk. FLUX Kommunity; upsampler Apache. | Likely. One ref peaked at 7,165 MiB. Three refs at 1280×704 double the tokens (about 14,000). Upsampler runs first, on its own: about 7.5 GB with mmproj (V13). | In sd.cpp from master-1024 (not `jd`). Upsampler through the kit's llama-server: no engine work, not verified on the pin. | 12–16 GB: less streaming. 32 GB+: full bf16 with the upsampler beside it (V4). Up to 4K (BFL, unverified here). |
| 2 | **Set lock by mask** (keyframe) | `-i set --mask area -r set -r actor -r prop`. Outside the white area the original latent is restored every step, so the set stays the same. | **Code:** generic mask. **Measured:** init + refs + mask in house-paint (ΔE 0.31) for paint, not for people. Placing a person: **unverified**. | No new weights. Works on klein 4B or FLUX 3. | Same as the model used. | In sd.cpp. Feathered paste-back is a small step in our code, because the mask is binary (`image.cpp:223`). | Same as the model used; larger output before upscaling. |
| 3 | **FLUX.2 klein 4B, several `-r`, plain ordinal prompt** (keyframe, the floor) | Same token idea, labelled 10, 20, … No caption writer; the prompt says "the woman from the second image". BFL lists 4 refs on its API. | **Measured:** one ref, face held across 3 scenes, 18–20 s. Several refs: **unverified**. **User** (snippets): good at two-image combining; others unhappy with faces on 9B. | Q8_0 4.01 GB on disk. Apache-2.0, all parts. | Very likely. BFL says ~8 GB (V1), its docs say about 13 GB (V2); it runs here. Refs can be shrunk with `vae_input_max_pixels`. | In sd.cpp today. | 12 GB: klein 9B Q4 (5.23 GB file, non-commercial). 16 GB: 9B Q8 (9.29 GB). 29 GB: full 9B (V3). |
| 4 | **Qwen-Image 2.1 Turbo, `Picture N`** (keyframe) | References go to both the text encoder and the DiT, so the prompt side does see them. Prefix cache reuses reference attention. | **Measured:** one ref 52.6–91.6 s (logs). My look at the sheet: identity held, but it reused the reference's street in the lamp shot, the same failure §H logged for Qwen-Edit. Viggle's card warns multi-ref edits drift or ghost on turbo. | Turbo int8 6.76 GB, Qwen3-VL-8B + mmproj: on disk. Viggle v0.3 Q4–Q8 4.0–7.2 GB. Qwen Research licence (text unread). | Runs. Multi-ref memory unknown; prefix cache costs about 1 GiB per 4,096 tokens at `q8_0`, 4 GiB at f32. | In sd.cpp. | 12–16 GB: Q4 at 1024² (V5). Base model at 40 steps, which Viggle says beats turbo on multi-ref. About 26 GB: int8 + enhancer at 1248×832 (V6). |
| 5 | **FLUX 3 with a clay render as a reference** (pose from a rough 3D render) | The gray render is the first reference; no LoRA. | **Measured** by JustStage on faces: 6.2 px, close-ups 7.9–12.7 px. Clay + actor together: failed once with no caption. | On disk. FLUX Kommunity. | Same as rank 1. | In sd.cpp. | Same as rank 1. |
| 6 | **refcontrol depth LoRA, klein 4B** (pose) | A LoRA teaches: image 1 depth, image 2 person. Trigger `refcontrol`. | **Measured** by JustStage: 44 s, 11.3 px on the left-turn view. | 0.09 GB. Apache-2.0. | Proven. | In sd.cpp today. | 9B depth and pose versions (non-commercial base) at 12 GB+. |
| 7 | **fal Multiple-Angles LoRA on Qwen-Edit 2511** (turnaround) | Prompted camera moves, one new angle per image. | **API:** 74,599 downloads. Both files on disk. Result on this PC not recorded. | 0.27 GB, on disk. Apache-2.0. | Runs (92 s, 29 GB RAM on the base recipe). | In sd.cpp, LoRA in the prompt. | 16 GB: Q4 on the card (V8). 24 GB: Q6 (16.7 GB file). |
| 8 | **Qwen 2.1 Multiple-Angles v2** (turnaround) | `<mva>` prompt, 72 framings. Trained again on characters. | **Card** only, with sample grids. | 0.30 GB. Apache tag on a Qwen Research base. | Probable: same as rank 4. Step 1,500 is the card's pick. | In sd.cpp if keys map (#2057 merged). Not tested. | Same as rank 4. |
| 9 | **Prop cut-outs**: Qwen 2.1 RGBA or BiRefNet | Qwen 2.1 outputs real alpha from a set prompt. BiRefNet cuts out any picture. | **Code/docs:** alpha in sd.cpp. BiRefNet **API**. Neither run for props. | BiRefNet ONNX fp16 0.46 GB, MIT. | Fine; BiRefNet can run on the CPU. | RGBA in sd.cpp. BiRefNet through ONNX Runtime; goes in the kit first. | Larger cut-outs. |
| 10 | **Panorama set bible** (Qwen 2.1 + nomadoor LoRA) | Build one 360° picture of a set, then crop any camera direction from it as the set reference. | **Card:** v0.1, seam still breaks on some scenes; people stretched. Crop step is ours. | 0.15 GB. Qwen Research. | Unknown at 2048×1024. | LoRA in sd.cpp if keys map. Crop in Three.js or JS. | Unknown: V5 covers 1024² only. |
| 11 | **Restore and upscale** | Pixel: `4xNomos2_hq_mosr` in sd.cpp. Redraw: ausboss Restore LoRA on Qwen 2.1 at about 2 MP. | **Code:** MoSR. **Card:** Restore 0.3 px off against 2+ px, on 37 pictures, author's own test. | Restore 0.15 GB, Qwen Research. MoSR weights: docs link, not sized. | MoSR: yes. Restore at 2 MP: unknown. | MoSR in sd.cpp today. | More room for 2 MP. V5 gives 12–16 GB at 1 MP only. |
| 12 | **Consistence Edit LoRA, klein 4B** (drift, detail) | Trained to keep structure while restoring detail. Inspired by ByteDance Helios anti-drifting. | **Card/user.** Strength 0.5–0.7. Keys in diffusers-split form, not tested in sd.cpp. | 0.36 GB. Apache-2.0. | Very likely. | sd.cpp if keys map. | 9B version at 12 GB+. |
| 13 | **Outfit Swap Consistency LoRA** (costume change) | Image 1 person, image 2 outfit. | **Card:** on 16 unseen swaps, 3.6 px shift falls to 0.1 px; face change 14.1% to 1.7%. Author's own test. | 0.15 GB. Qwen Research. | Probable: same as rank 4. Card says load at 1.0. | sd.cpp if keys map. | Same as rank 4. |
| 14 | **Relight** | First try the prompt on FLUX 3 or Qwen 2.1. Sun-Direction LoRA: picture + lit-ball picture + `match the sun direction from the reference`. | **Card:** exteriors only, make it overcast first. Ball renderer is **code** (Three.js). | 4B LoRA 0.17 GB, Apache-2.0. Qwen-Edit Relight 0.22 GB (2509, not 2511). | Likely on klein 4B. | Sun-Direction in sd.cpp if keys map, ball render in our Three.js. | 9B version at 12 GB+ (169 likes against 9). |
| 15 | **Outpaint**: ausboss LoRAs | Pad with flat gray `#808080`; the LoRA fills it and keeps the picture in place. | **Card:** Qwen 34 dB against 16 dB placement. FLUX 3 stayed within 2 px on 15 of 16 at strength 1.5. Author's own tests. | 0.15 GB each. Qwen Research; FLUX Kommunity. | Same as ranks 4 and 1. | sd.cpp if keys map (#2214 for FLUX 3). | Same as the base model. |
| 16 | **Face fix with the saved actor** | Crop the face, then `-i crop --mask face -r actor`, paste back. | **Code.** Not run. | No new weights. | Yes: small crop. | Works by hand now. Automatic needs a two-line patch to `detailer.cpp`, plus a YOLO file converted once in Python. | Larger crops. |
| 17 | **Colour match** | Post: Lab match to the set. Or Color Anchor: pull each latent channel's mean toward a reference during sampling. | **Code** (Enhancer). Not run. | None. | Yes. | Post: our code. Anchor: small sd.cpp patch. | Same. |
| 18 | **Per-reference strength and masks** (Identity Feature Transfer) | Matches generated tokens to reference tokens inside attention; a mask limits one reference to, say, its jacket. | **Code.** Claims are the author's. Upstream repo deleted; MIT mirror read. | None. | Yes. | Medium sd.cpp patch (local, NOT STANDARD until upstream). | Same. |
| 19 | **Fibo 2.0 Edit Turbo** | 4 steps, CFG 1, `<image_1>` tokens in the prompt. Vision encoder sees references. | **Code/docs.** Never run here. | int8 7.83 GB, needs Qwen3-VL-4B mmproj (not on disk). CC-BY-NC-4.0. | Unknown. | In sd.cpp. Mask support is open PR #2215. | 16 GB bf16 is 15.3 GB file. |
| 20 | **Z-Image Turbo + Union ControlNet** | Real pose, depth and canny control. | **Code:** PR #2187, tested only by its author. No reference input, so identity needs a second pass. | ControlNet GGUF 3.32 GB. Apache-2.0. | Likely: 4 GB or less for the base (V9). Keep `--vae-tiling` off. | In sd.cpp. | Little: it is already small. |
| 21 | **Small character LoRA** | Train a small add-on on pictures of the actor. | **Card** (see tier table). | Base open. Trainers are PyTorch. | SDXL only, and SDXL does not feed klein. Klein 4B needs 12 GB (V10). | Trainer is Python: a sidecar, NOT STANDARD, needs the user's word. | 12 GB: klein 4B. 22 GB + 64 GB RAM: klein 9B (V10). |
| 22 | **klein 9B-KV** | Reference attention computed once, 1.8–2.2× faster with 2–4 refs. | **Card/code.** Needs its own checkpoint (causal attention). No 4B version. | Q8 9.29 GB. Non-commercial. | Not useful. | Medium to large port. | 12–16 GB+ if ported. |

**Dropped, with reasons**

- **RefMods:** sold as "no-training adapters". `core.py` shows a saved VAE latent, optionally average-pooled. Not a new method.
  `vae_input_max_pixels` does the same job more cleanly.
- **Sana:** text-only, no reference input; sd.cpp issue #569 still open.
- **PuLID:** sd.cpp supports FLUX.1 only and needs a Python step per face.
- **IP-Adapter:** SD1.5 and SDXL only, in sd.cpp today, but a generation behind.
- **Krea 2:** text-only without community LoRAs (JustStage).
- **SeedVR2:** GGUFs exist for ComfyUI only; a large port.
- **LBM relight:** 4.68 GB, PyTorch, CC-BY-NC.
- **Qwen 2.1 Fun ControlNet:** in Comfy-Org's files; no path found for it in `jd` or the sd.cpp PR list.
- **No usable card or weights:** `KENIC-1` Turbo LoRAs (empty card), `ViktorRtm` FLUX 3 relight (no weights).

## Best option per tier

Nothing above 8 GB has been measured by us. Every figure below comes from the source named, mostly PyTorch or ComfyUI, so
sd.cpp with streaming should need less. Where a tier shows the same model, the gain is speed.

| Job | 8 GB (floor) | 12 GB | 16 GB | 24 GB | 32 GB and up |
|---|---|---|---|---|---|
| **Keyframe** | FLUX 3 Q8_0, klein 4B as fallback (measured) | Same, less streaming. Or Qwen 2.1 Q4 at 1024² (V5) | klein 9B Q8 or Qwen-Edit Q4 on the card (V8) | FLUX.2 dev 4-bit, about 20 GB, 6 refs recommended (V7) | FLUX 3 bf16 + upsampler 31 GB (V4). Full klein 9B 29 GB (V3) |
| **Turnaround** | fal LoRA on Qwen-Edit, streamed | Same | Qwen-Edit Q4 on the card (V8) | Qwen-Edit Q6 | Qwen-Edit Q8 (20.8 GB file) |
| **Pose from 3D** | FLUX 3 clay reference, refcontrol 4B | + 9B refcontrol | Same | Same | Same |
| **Relight** | Prompt, Sun-Direction 4B | + Sun-Direction 9B | Same | Same | Same |
| **Upscale** | MoSR, Consistence 4B | + Restore LoRA, likely; V5 covers 1 MP, not 2 MP | Same | Native 2K Qwen 2.1, unconfirmed | Same |
| **Character LoRA** | SDXL only, small dim 4–8 (V12) | klein 4B Base, 32 GB RAM (V10); 960×544 on musubi (V11) | Same, larger size | klein 4B at full size (V14); klein 9B Base at 22 GB + 64 GB RAM (V10) | Same |

Sources:

- **M1, measured here:** FLUX 3 Q8_0 peak 7,165 MiB including the desktop's 588 (JustStage, master-1024). klein 4B 18–20 s
  (logs). Qwen-Edit 29 GB private RAM (§H).
- **V1:** BFL `flux2` README: "Klein 4B fits in ~8GB VRAM".
- **V2:** docs.bfl.ai/flux_2: 4B about 13 GB. Conflicts with V1; M1 shows it runs on 8 GB.
- **V3:** HF FLUX.2-klein-9B card: "~29GB VRAM".
- **V4:** BFL `flux-3-image-klein` README: distilled 31 GB bf16, 26 GB fp8, 25 GB nvfp4, on a B200 at 1024². fp8 needs Ada or
  newer, nvfp4 Blackwell.
- **V5:** unsloth.ai/docs/models/qwen-image-2.1: "11GB VRAM with GGUFs or 24GB with INT8/FP8"; 12–16 GB for Q4_K_M at 1024×1024;
  "estimates, not tested minimums".
- **V6:** Viggle card: "peaks at about 26 GB of VRAM at 1248 × 832".
- **V7:** BFL `docs/flux2_dev_hf.md`: 4-bit, ~18 to ~20 GB; 80 GB+ in full. BFL docs: 6 refs recommended for dev.
- **V8:** lilting.ch guide, search snippet only: Q4_K_M for 16 GB, Q4_0 for 12 GB. No official table found.
- **V9:** sd.cpp `docs/z_image.md`: "GPUs with 4GB of VRAM — or even less".
- **V10:** docs.bfl.ai/flux_2/flux2_klein_training: 4B Base 12 GB + 32 GB RAM; 9B Base 22 GB + 64 GB RAM.
- **V11:** musubi-tuner README: 12 GB at "960x544 or lower" with `--blocks_to_swap`; 64 GB RAM recommended.
- **V12:** kohya `docs/train_SDXL-en.md`: "8GB GPU memory (10GB recommended)", dim 4 to 8.
- **V13:** unsloth pup GGUF card: UD-Q4_K_XL "about 7.5 GB of VRAM with the mmproj".
- **V14:** Hugging Face blog, search snippet: a 4B LoRA run fits in 24 GB.

Things that change the choice on other machines:

- **fp8 files** need Ada or newer (V4), so GGUF stays the format every card can use. The accelerated INT8 path needs CUDA
  compute capability 7.5 or newer, which this card has (`docs/int8_convrot.md`).
- **Non-NVIDIA cards are not safe yet:** #2192 FLUX 3 garbled above 768² on Vulkan (Radeon 840M), #2008 Qwen Image fails on
  one ROCm card. Both open.
- **System RAM** is untested below 32 GB. Qwen-Edit at 29 GB will not fit a 16 GB machine without `--params-backend disk`.

## Attacks on the ranking

- **Rank 1 against klein 4B.** klein is measured, Apache and about 3.5× faster. FLUX 3 failed the only two-reference run, and
  testers call it a weak generator of people. It keeps the rank because quality is the bar, editing is its strong side, it held
  shape best, and the failed run skipped a step BFL calls required. It is a bet. What the attack changed: Test 1 includes a
  no-caption baseline, and klein takes rank 1 if the caption shows no visible gain.
- **Rank 2.** Masked insertion can look pasted, and the model cannot change light outside the mask, so her shadow would be
  missing. It stays second because it is the only method here that guarantees the set does not change. What the attack
  changed: the mask must cover where her shadow falls.
- **Sheets against single pictures.** Luma warns against multi-angle sheets as references; others recommend them. Keep saved
  references one angle per picture. Make a sheet only for LTX Ingredients (§H), which wants one.
- **Qwen 2.1 above klein 4B?** It tops one editing board by a search snippet (1,074). I could not open the board, and on this
  PC it reused the reference background. It stays fourth, as the control in Tests 1 and 3.

## Exact tests for the top three

All use the existing harness, which has a RAM guard and logs card peak, RAM and time. Both inputs are already 1280×704.

```powershell
cd E:\Dev\Web\test-just-direct
$actor = 'E:\Dev\Web\test-just-direct\frames\srv3-1-p1-f60.png'   # the §H woman
$set   = 'E:\Dev\Web\test-just-direct\out\plate-cafe.png'         # the empty cafe plate
$prop  = 'E:\Dev\Web\test-just-direct\out\prop-notebook.png'
$F3Q8  = 'E:\Dev\Web\test-just-direct\ai-cache\hf\models--leejet--flux-3-image-klein-GGUF\snapshots\1c2ad2f9b9247ccca6506a23bdb033fdb0873321\flux3-image-klein-Q8_0.gguf'
node cli.js prop-notebook klein -W 1024 -H 1024 -p "A worn red leather notebook with a brass clasp and a small embossed compass on the cover, on a plain mid-gray background, product photograph, soft even light"
$ask = "Use the woman from the second image as the main character, sitting at the table in the cafe from the first image. She holds the notebook from the third image in both hands, looks down at it and smiles. Keep her face, freckles, curly red hair, black jacket, bag strap and necklaces. Keep the cafe exactly as it is. Medium shot, lit by the cafe's own light."
```

**Look at, at 100%, for all three:**

1. Face: freckle pattern, eye colour, curls.
2. Clothes: black jacket, strap, necklaces.
3. Set: window, table and wall items present and in the same places.
4. Prop: red, brass clasp, compass, right size, held by believable hands.
5. Light: she and the prop are lit by the room.
6. No copied pose, no second woman, no stamped text.

**Failure for all three:** in 2 of 3 seeds, any of those six is wrong, or the run is stopped for memory. Speed is recorded only.

### Test 1: FLUX 3 Q8_0, three references, with and without a caption

- **Build:** needs master-1024 or newer, set with `$env:SDCLI`. Q8_0 streaming arrived in #2224 on 2026-10-26, so `jd` and the
  harness's master-1004 will not do. §J item 1 covers this. I did not find a master-1024 `sd-cli.exe` under `E:\Dev`.
- **Files:** on disk, plus `unsloth/flux-3-image-klein-pup-GGUF`: `flux-3-image-klein-pup-Q4_K_M.gguf`, `mmproj-F16.gguf`.
  To avoid the download, use `Qwen3VL-8B-Instruct-Q8_0.gguf` with its mmproj (on disk) and the `i2i` prompt from
  `pup_prompts_external_vlm.json`. BFL documents this route for other vision models.

1. Baseline, no caption, seeds 1, 2, 3:
   ```powershell
   node cli.js kf-f3-short-s1 flux3 --diffusion-model $F3Q8 --offload-to-cpu --seed 1 -W 1280 -H 704 -r $set -r $actor -r $prop -p $ask
   ```
2. Write the caption, on its own, with no model loaded in sd.cpp:
   ```powershell
   llama-server -m flux-3-image-klein-pup-Q4_K_M.gguf --mmproj mmproj-F16.gguf -ngl 99 -c 8192 --port 8099
   ```
   POST `/v1/chat/completions`:
   - system: key `i2i` of `system_prompts.json` (BFL's prompts, unchanged according to the card; `pup_prompts.json` in the clone is BFL's own copy);
   - user: the three images, then the text
     `Reference images follow in order (the first image, the second image, ...).\nUser request: <$ask>\nOutput the caption.`;
   - `temperature 0, top_p 0.95, top_k 20, presence_penalty 0, max_tokens 3584`, `chat_template_kwargs {"enable_thinking": false}`.

   Scale the images first, as BFL does for three or more references: JPEG quality 92, 672×352 for the 1280×704 pictures and
   512×512 for the prop.
3. Escape and run, seeds 1, 2, 3:
   ```powershell
   $cap = $caption -replace '([\\()\[\]])', '\$1'
   node cli.js kf-f3-cap-s1 flux3 --diffusion-model $F3Q8 --offload-to-cpu --seed 1 -W 1280 -H 704 -r $set -r $actor -r $prop -p $cap
   ```
   In `logs\kf-f3-cap-s1.log`, the `parse '...' to [...]` line must show every weight at 1 and brackets intact.
4. Boxes, optional: use key `i2i_bbox` and the text `Reference images follow in attachment order: ref_image_0, ref_image_1, ...\nUser editing instruction: <$ask>\nDecide the edit, imagine the target image, and output the annotation record.` Escape and run as above. Look at whether she lands in her box. Boxes "are not a hard mask" (model card, as quoted in the JustStage file).

**Also a failure:** the caption run is not visibly better than the baseline. Then klein 4B takes rank 1, since the caption costs
a 6 GB download and an extra step.

### Test 2: set lock by mask on klein 4B

Files are all on disk. Draw white where she sits and where her shadow falls, black everywhere else. The rectangle below is a
starting guess; move it to the plate's table.

```powershell
$ff = 'C:\Users\danel\AppData\Local\Microsoft\WinGet\Packages\Gyan.FFmpeg_Microsoft.Winget.Source_8wekyb3d8bbwe\ffmpeg-8.1.1-full_build\bin\ffmpeg.exe'
& $ff -y -f lavfi -i color=black:s=1280x704 -vf "drawbox=x=420:y=120:w=460:h=584:color=white:t=fill" -frames:v 1 out\mask-kf.png
node cli.js kf-lock-k4-s1 klein --offload-to-cpu --seed 1 -W 1280 -H 704 -i $set --mask out\mask-kf.png --strength 1 -r $set -r $actor -r $prop -p $ask
& $ff -i out\kf-lock-k4-s1.png -i $set -lavfi "[0]crop=400:704:0:0[a];[1]crop=400:704:0:0[b];[a][b]psnr" -f null -
```

Seeds 1, 2, 3. I did not confirm which picture house-paint passed as its reference, so passing the set as both `-i` and `-r` is
my choice; try once without `-r $set` if the room looks wrong.

**Also look at:** PSNR outside the mask should sit near the VAE round-trip level, about 35 dB or better. That number is my
expectation, not measured for this VAE.

**Also a failure:** a visible rectangle edge, her lit differently from the room, wrong scale, or limbs cut off at the mask.

### Test 3: klein 4B, the floor

Files are all on disk.

```powershell
$k = "Create a photograph of the woman from the second image sitting at the table in the cafe from the first image, holding the red notebook with the brass clasp from the third image in both hands. She looks down at it and smiles. Keep her face, freckles, curly red hair, black jacket, bag strap and necklaces exactly the same. Keep the cafe exactly the same. Medium shot."
node cli.js kf-k4-s1 klein --offload-to-cpu --seed 1 -W 1280 -H 704 -r $set -r $actor -r $prop -p $k
node cli.js kf-k4-small-s1 klein --offload-to-cpu --seed 1 -W 1280 -H 704 --ref-image-args "vae_input_max_pixels=262144" -r $set -r $actor -r $prop -p $k
```

Seeds 1, 2, 3 at full size, one seed small. Then add a fourth `-r` with a second angle of her, to find where it breaks.

**Control:** same inputs through Qwen 2.1, one seed. Replace the ordinals with `Picture 1`, `Picture 2`, `Picture 3`:

```powershell
node cli.js kf-qi21-s1 qi21 --seed 1 -W 1280 -H 704 -r $set -r $actor -r $prop -p "<same request, using Picture 1, 2, 3>"
```

**Also a failure:** the set or prop is ignored at full size. Then a keyframe takes two passes: actor into the set, then the prop
into that result.

## Corrections to sections A and B

Only these were relied on, so only these were checked.

- **Wrong, or too strong:** "FLUX.2 klein 4B LoRA needs 24 GB." BFL's own training page says 12 GB + 32 GB RAM. A Hugging Face
  blog says 24 GB. musubi-tuner's 12 GB advice is 960×544 or lower.
- **Out of date:** "sd.cpp ControlNet is SD1.5 only." SDXL works (`control.hpp`, #1752) and Z-Image Union works (#2187, in `jd`).
- **Confirmed:** kohya SDXL "8GB (10GB recommended)"; klein 9B non-commercial; Qwen-Edit 2511 Apache; BiRefNet MIT with ONNX
  files; IP-Adapter SD1.5 and SDXL only.

## What could not be verified

- **Any multi-reference result on this PC, and anything above 8 GB.** No run happened.
- **Reddit.** WebSearch refuses the domain. A direct request for its public search was blocked by this session's permission
  system, and I did not try to get around that. Only search snippets were seen, and they carry little weight.
- **Artificial Analysis editing board.** The URL I guessed returned 404 and the OrcaRouter page returned no tables, so the
  Elo figures come from a search snippet.
- **YouTube.** ausboss's Qwen 2.1, FLUX 3 and Fibo 2 comparison video was not watched. No third-party comparison of those three
  in editing was found.
- **LoRA key mapping.** Only refcontrol, Lightning and the H3 turbo LoRA are known to load in sd.cpp. For the rest, read the log:
  zero applied tensors means it silently did nothing (#2212).
- **The upsampler in llama.cpp.** The GGUF exists and is tagged for llama.cpp. Vision support in the kit's pinned build was not
  checked.
- **Licence texts.** FLUX Kommunity and Qwen Research were not read. Licences are labels only, here.
- **All "Card" numbers.** They are each author's own tests. The ausboss figures are detailed and open about limits, but not
  independently reproduced.
- **My look at `id-sheet-2.png`** is one person, one seed. Row order confirmed from `queue3.ps1`: klein, flux3, qi21. The user's
  eye decides.
- **Other editors not tested or compared:** Boogu, Mage-Flow, LLaDA and LongCat are in sd.cpp. FireRed Image Edit is not in the
  local tree. This is a gap in the search, not a finding that they are worse.
- **OneTrainer's** VRAM figure: its README shows klein and Z-Image support, no number.

## Code findings (read in source)

Engine: local `jd` is dffe732, from master-1004-a85db96. Upstream is at master-1028-37bc88b (2026-10-29). The kit pins
master-1024-77b72a2.

- **Mask.** `src/pipeline/image.cpp:221-245` builds a latent mask for every model. `diffusion_engine.cpp:2492-2493` and
  2863-2864 blend `denoised*mask + init*(1-mask)`. White repaints. Needs `-i`. Binary (`sd::ops::round`, line 223), no feather.
  Trained inpaint heads exist only for SD1, SD2, SDXL inpaint, FLUX Fill and Flex-2 (line 386+).
- **ADetailer.** `src/detailer.cpp:987-988` sets `ref_images=nullptr`, count 0.
- **Reference sizing.** `image.cpp:331-338`: each ref is cut to `min(1024², output area)` keeping its aspect, unless
  `vae_input_max_pixels` says otherwise. At 1280×704 a target is 3,520 tokens; three refs plus target is about 14,000.
- **FLUX 3 references.** `flux3.hpp:217-235`: l-axis -1, -2…, RoPE 0.5, limit 10; matches BFL `pipeline.py:90-91,125`. Refs have
  their own block stack (`content_mode_blocks.image_cond`). BFL's default output size comes from the first ref; sd.cpp uses `-W -H`.
- **FLUX 3 text path.** `conditioner.hpp:3096-3104`: the same 8 output layers as BFL `text_encoder.py`, and a chat template that reads as equivalent.
  `generate.py` appends boxes as `json.dumps` text to the prompt.
- **Weight syntax.** `conditioner.hpp:2159` runs `parse_prompt_attention` over the user text; `util.cpp:910+` removes unescaped
  `[ ] ( )` and reweights. The word `BREAK` is also special. `-v` logs the parse at line 2181.
- **klein references.** `flux.hpp:1545-1547` forces `INCREASE` for FLUX.2; `flux.hpp:97` sets scale 10.
- **Upsampler settings.** `pup.py:24-37`. Ref budgets: one 1024², two 724², three or more 512². `system_prompts.json` ships with the
  GGUF. `pup_prompts_external_vlm.json` holds longer prompts for other vision models.
- **KV cache.** `flux2/src/flux2/model.py:494` uses causal attention, so it needs the 9B-KV weights. BFL table at 1024²: 2 refs
  1.77×, 3 refs 1.99×, 4 refs 2.22×. Qwen 2.1's prefix cache in sd.cpp is the same idea.
- **Color Anchor.** `flux2_klein_color_anchor.py`: a post-CFG correction of per-channel means, small enough to port.
- **Sun-Direction.** Sphere render is Three.js in the browser, no Python needed for the render itself.

**Prompting method seen across sources:** give each reference one job and say which is which ("the character", "the outfit",
"the location"). ausboss: image 1 is the picture that changes; the others are pictures to take from. Keep a written description
beside the pictures. Multi-reference workflow author on Civitai: "accuracy degrades noticeably past 4 references". Keep
references in one style (third-party guide). Qwen 2.1 uses `Picture N` here; its README's rewriter uses `<image1>` tags.
Qwen-Image 2.1 also has its own prompt enhancer: `prithivMLmods/Qwen-Image-2.1-PE-I2I-GGUF`, not examined.

## Search log

**Web (WebSearch, standard mode)**

1. "latest techniques consistent character multiple reference images combine character set prop one image 2026" → vendor blogs (Luma, Runway, Lovart, sorceress). Conflict: Luma says one angle per image; others say composite all views. One job per reference; keep a written description.
2. "best open source image edit model multiple references 2026 local 8GB VRAM" → klein 4B as the 8 GB pick (secondary); FireRed Image Edit and nihui's qwenimage-ncnn-vulkan as new names.
3. "FLUX.2 klein multiple reference images character background object workflow reddit" → no Reddit; BFL docs (klein 4 refs); Comfy KV-cache template.
4. "new ways to make character sheet turnaround from one image ComfyUI 2026" → Kontext turnaround LoRA, VNCCS, CharacterForge Pro, Comfy tutorial on GPT Image 2.
5. "FLUX.2 klein prompting guide multi-image reference image 1 image 2 official Black Forest Labs" → fal's guide (ordinal phrasing); no official syntax.
6. "FLUX 3 Klein vs Qwen Image 2.1 vs FIBO 2 image edit comparison reference images results" → no direct comparison; Reddit snippets on 9B and Qwen-Edit; eesel review.
7. "Qwen Image 2.1 multiple reference images consistent character local low VRAM reddit StableDiffusion" with domain reddit.com → refused by the tool.
8. "FLUX.2 klein 4B character consistency multi reference reddit comfyui results 8GB" with domain reddit.com → refused by the tool.
9. "best open weights image generation models October 2026 Artificial Analysis leaderboard Qwen Image 3 FLUX 3" → Qwen 2.1 claimed top open row (1,034 / 1,074, OrcaRouter snippet); Cosmos3, HiDream-O1, ERNIE on other snapshots.
10. "Qwen-Image 2.1 official GitHub memory VRAM requirements int8 quantization text encoder multi image editing Picture 1" → Unsloth docs, Spheron estimates.
11. "FLUX.2 klein 4B LoRA training VRAM requirements 8GB 12GB ai-toolkit OneTrainer musubi-tuner" → BFL docs 12 GB; HF blog 24 GB; no 8 GB source.
12. "best image upscaler 2026 open source AI upscale model comparison SeedVR2 real-esrgan alternatives" → vendor blogs; no independent benchmark.
13. "Qwen-Image-Edit-2511 GGUF VRAM requirements GPU memory 12GB 16GB 24GB offload" → community estimates; no official table.

**Fetched**

github.com/black-forest-labs/flux-3-image-klein; docs.bfl.ai/flux_2; docs.bfl.ai/flux_2/flux2_klein_training; github.com/QwenLM/Qwen-Image-2.1; huggingface.co/Viggle/Qwen-Image-2.1-viggle-turbo; huggingface.co/ausboss/Qwen-Image-2.1-Consistency-LoRA; huggingface.co/black-forest-labs/FLUX.2-klein-9B; unsloth.ai/docs/models/qwen-image-2.1. Failed: artificialanalysis.ai/image-editing/arena/leaderboard (404); orcarouter.ai blog (no content).

**Hugging Face API**

- Sort lastModified: flux-2-klein; flux2-klein lora; flux-3-image-klein; flux-3-klein; qwen-image-edit-2511; qwen-image-2.1; relight; character sheet; turnaround; multiple angles; multi-view.
- Sort downloads: flux-2-klein; flux-3-image-klein; qwen-image-edit-2511; qwen-image-2.1; relight; character sheet; multiple angles; klein-kv; flux-2-klein-9b-kv gguf; qwen-image-2.1 lora relight; qwen image 2.1 inpaint; flux.2 klein relight; klein lora edit; flux2 klein controlnet; flux 2 fun controlnet union; z-image controlnet union; qwen-image-edit relight; qwen-image-edit fusion; qwen-image-edit inpaint; face swap lora klein; head swap klein; seedvr2 gguf; 4xNomos2; LBM_relighting; flux 3 angles lora; sana_1600m; qwen-image-edit-2511 upscale; qwen-image-2.1-pe; Qwen-Image-2.1-PE-I2I. Empty: qwen-image-2.1 lora relight; flux.2 klein relight; flux2 klein controlnet; face swap lora klein; head swap klein.
- Cards read: ausboss Consistency, Outfit-Swap, Restore, Outpaint, FLUX 3 Outpaint; SMD klein; DMD2 2-step; akhaliq Qwen 2.1 and FLUX 3 angles; Abiray FLUX 3 GGUF; refcontrol 4B; Sun-Direction 4B; Consistence Edit mirrors and lrzjason; dx8152 Fusion and Relight; Kun1009 relight; ostris inpainting; nomadoor panorama; zuanfilm multiview; tarn59 sheet; Viggle turbo; unsloth pup GGUF. SMD and DMD2 are speed methods, so they were not ranked.

**Civitai API** (sort Newest): "flux klein character sheet"; "qwen 2.1 relight"; "klein multi reference". Read in detail: 2988766, 2834956, 3008258, 3004026, 2401955, 2966369, 2979835.

**Reddit:** direct public search request blocked by this session's permission system. No thread was read.

**GitHub** (`gh`)

- sd.cpp: releases and commits; PR #2187; PR #2215; title-filtered PR list; issue searches "sana", "klein", "reference image multiple", "controlnet flux2".
- Repo searches: flux2 klein reference; Flux2Klein; flux.2 klein enhancer; klein identity reference comfyui; comfyui flux2 klein; comfyui multi reference flux; comfyui reference latent control; qwen image 2.1 comfyui nodes; flux 3 klein comfyui.
- Shallow clones read, nothing run: flux-3-image-klein, flux2, Sphere-Light-Render-ComfyUI, ComfyUI-Flux2Klein9Mod, ComfyUI-Flux2Klein-Enhancer (MIT mirror), comfyui-flux2-photomatch, musubi-tuner, ai-toolkit. They are in `research-clones\images` beside this file.
- kohya sd-scripts `docs/train_SDXL-en.md`; OneTrainer README.

**Local files read:** sd.cpp `docs/` (edit, flux2, flux3, qwen_image_edit, qwen_image_2.1, lora, esrgan, image_preprocessing, adetailer, pulid, ip_adapter, z_image, fibo2, boogu_image, mage_flow, llada_image, hidream_o1_image, int8_convrot, performance) and `src/`; `test-just-direct/idtest.js`, `cli.js`, `rows.js`, `queue3-5.ps1`, run logs, `out/id-sheet-2.png`.
