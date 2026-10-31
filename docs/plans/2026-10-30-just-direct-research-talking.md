# Talking characters: matching lips and a chosen voice, on the user's own PC

Research, 2026-10-30. **Nothing was run.** No model, no weights downloaded, the card not touched. Every 8 GB outlook below is reasoning from measured numbers on other work, not a result.

Proof labels: **code** (read in a shallow clone, or in our sd.cpp or audio.cpp), **card** (stated on a model card or README, not checked by us), **user** (issue, forum or workflow report), **measured** (on this PC, settled in plan sections E to H), **estimate** (mine), **unverified**.

## 1. The answer

1. **The plan in `voice.ps1` should not stay first.** It lets LTX invent the words and voice, then repairs the voice. The better order is voice first: make the line with audio.cpp TTS, then have the video model draw the mouth from that exact audio. That gives exact words, exact voice and exact timing. Lightricks ships this as `A2VidPipelineTwoStage`, and H3 can do the same.
2. **Best for quality at 8 GB: TTS plus LTX-2.3 audio-to-video (A2V), 720p.** No new weights are needed. It needs a small sd.cpp addition.
3. **Testable today with no engine work: H3 Ref2VA with `<Audio 1>: fully_copy`,** at 480p.
4. **Best repair tool: LatentSync 1.6 in audio.cpp.** It fixes lips on any finished clip, including cloud clips. Its 8 GB fit is unproven: 9,144 MiB was measured on an RTX 5090, and `mem_saver` has no published number.
5. **Two findings that change the work:**
   - PR #1676 does not match Lightricks on one point. Lightricks gives frozen audio tokens timestep 0; the PR leaves them on the global timestep (section 6). This may be why its author called it "janky". That cause is a hypothesis, not proven.
   - The built audio.cpp is older than LatentSync. `build/jv-dev/bin/audiocpp_cli.exe` (2026-10-15) has zero `latentsync` strings. The source on `jv` has it since 2026-10-21. It must be rebuilt before Test 3.

## 2. Best option per tier

VRAM alone is not the whole floor. The 8 GB routes also need about 25 GB of RAM: LTX peaked at 23.3 GB and H3 at 25.5 GB (measured). `--params-backend diffusion=disk` freed RAM at about 20 % slower on LTX at 512×288 (measured, section G). So 32 GB of RAM is the real floor unless that flag is used, and weight streaming from disk needs an NVMe drive to stay usable.

| Card | Best method | Setting | Backup | VRAM source and proof |
|---|---|---|---|---|
| **8 GB (floor)** | TTS + LTX-2.3 A2V | Q4_K_M, 640×352 then 1280×704, 8+3 steps | H3 Ref2VA `fully_copy` at 864×480; LatentSync Q8 `mem_saver` as repair | LTX 7,231 MB, H3 7,024 MB (**measured**, plain video runs, audio path not run). LatentSync: **unproven** |
| **12 GB** | Same LTX A2V, with less weight streaming | Same quant; a higher quant if RAM allows | LatentSync Q8/F16 fits as it stands; H3 long takes | LatentSync 9,144 MiB; F16 9,974 MiB (**card**, RTX 5090). H3: 1:30 lip-synced in about 2 h on an RTX 3060 12 GB (**user**, Civitai 2909076). LTX own-audio workflow "12gb VRam or more" (**user**, Civitai 2411105) |
| **16 GB** | LTX-2.5 A2V (GGUF), or H3 at higher resolution | LTX-2.5 GGUFs run 11.5 to 23.6 GB on disk (**card**) | LatentSync original F32/F16; LiveAvatar 720p if the PC has 64 GB RAM | LatentSync 15,700 MiB; LiveAvatar 15,993 MiB with 43+ GiB host RAM (**card**). LTX-2.5 "16GB requires the GGUF path" (ltxworkflow.com, low authority, **unverified**) |
| **24 GB** | LTX-2.5 A2V at a higher quant; ID-LoRA one-stage for a voice held from a short clip | ID-LoRA, quantized | Wan2.2-S2V at 720p; InfiniteTalk 480p | ID-LoRA "24+ GB" (**card**, official, PyTorch). audio.cpp's web UI lists LiveAvatar `min_vram_gb` 24 (**code**, config). InfiniteTalk: 480p fine at 24 GB, 16 GB unverified (**user**, one Japanese guide) |
| **32 to 48 GB+** | Full LTX pipelines; ID-LoRA two-stage | Official full weights | LipForcing 14B | LTX "32GB+" (official page, read only through a search snippet, fetch got 403). ID-LoRA two-stage "48+ GB" (**card**). LipForcing about 37 GB peak on an H200 (**card**) |

Notes for other machines:
- sd.cpp streams weights, so official PyTorch minimums overstate what it needs. The proof is LTX itself: 32 GB+ officially, 7.2 GB measured here.
- A bigger card should mean less weight copying and higher resolution. That is expected, not measured.
- AMD, Intel and Mac go through the Vulkan and Metal builds of sd.cpp and audio.cpp. Nothing here was measured on them.

## 3. Ranked table (8 GB floor, quality first)

| # | Method | What it is, how it works | Proof | Open weights, size, licence label | 8 GB outlook and why | Better machines get | Engine path |
|---|---|---|---|---|---|---|---|
| 1 | **TTS + LTX-2.3 A2V** | Voice first. The wav is encoded by the audio VAE and frozen; only video is denoised, in both stages; the output keeps the original waveform | **code** `a2vid_two_stage.py:414,481,490,503`. **user**: works, varies by seed; V2V masking is harder ("voice-over narrator instead of lips moving", RuneXX #36). Not run here | None new. `avae.safetensors` has 44 encoder tensors (**code**, header read). LTX community licence | **Good.** Same token count as measured 720p I2V (407 s, 7,231 MB). Encoding happens before sampling. **Estimate** | LTX-2.5 A2V (Civitai 2306894, 7,784 downloads); stricter on reverb (**user**, LTX-2.5 #44). 1080p | **sd.cpp, small addition.** Re-port #1676 (+565, old layout) and add the timestep fix |
| 2 | **H3 + audio** | Two ways. `fully_copy` puts the audio in Ref2VA as the target track. Or the audio lane is masked to 0: "inpainting, with the audio lane as the known region" | `fully_copy` **code** (MiniMax `ref-en.txt:194-200`); `--ref-audio` **code** (`video.cpp:738`). Mask: **user** (Civitai 2930619). Identity dispute: similarity 0.09 against 0.88 with Ref2VA + audio, disputed by a second user (HF #91), no official answer | On disk. `ref2va_pruned` Q4_K_M 11.42 GB, Q2_K_M 6.72 GB; text encoder 18.2 or 13.1 GB. MiniMax community licence | **Likely at 480p.** Plain 480p measured 376 s, 7,024 MB, 25.5 GB RAM. An audio reference adds tokens, cost unmeasured. 720p needs open PR #2249 | Unpruned Q4 18.78 GB, higher resolution. No official VRAM figure found | **`fully_copy`: already in sd.cpp CLI;** server took `ref_audios` upstream (#2194). **Mask-0: small addition** (H3's audio encoder exists; first frame then works) |
| 3 | **LatentSync 1.6** | Edits an existing clip. Whisper + temporal U-Net + SD VAE, 512×512 face crop, pasted back; output keeps video resolution | **card** (audio.cpp's own run: 133 s for 9.68 s of 1080×1920, RTX 5090). **code** for `mem_saver` (`pipeline.cpp`). Issue #284 asks about 8 GB, no reply | `latentsync-1.6-q8_0-f16.gguf` 2.10 GB. Package label "No" for commercial use (InsightFace weights), LatentSync itself Apache-2.0 | **Unproven.** 9,144 MiB default; `mem_saver` runs CFG branches in turn and frees parts. No figure exists. Python's 18 GB does not apply | F16 at 12 GB, F32/F16 at 16 GB. No resolution gain: the model stays at 512 | **Already in audio.cpp, experimental.** Rebuild needed |
| 4 | **LTX speech + voice conversion** (current plan) | LTX writes speech with the clip; BS-RoFormer splits it; MeanVC2 or Chatterbox VC changes the voice; mixed back | Pipeline scripted (`voice.ps1`), never finished. Accent card says LTX's voice prior ignores accent requests (**card**). Audio buzz noted on a LoRA card (**card**) | On disk. MeanVC2 1.6 GB, Chatterbox 2.0 GB, BS-RoFormer 165 MB | **Good.** About 410 s + VC. Quality unknown. Words not guaranteed; voice is only as good as the conversion | Little: the weak link is control, not memory | **Works today** |
| 5 | **Wan2.2-S2V 14B** | Portrait + wav to video. wav2vec2 audio encoder, 16 fps only, one chunk (77 to 81 frames, about 5 s) | **code** and docs (`docs/wan.md`). **user**: lip sync "genuinely finicky", speed LoRAs degrade it (Reddit snapshot, March 2026) | Q2_K 9.5 GB to Q8 19.6 GB. Apache-2.0 | **Uncertain.** 14B at 720p missed by about 0.5 GB (measured, E); 832×480 has about 40 % of the area, so it may fit. Slow; 16 fps. **Estimate** | 720p at 16 GB+ | **Already in sd.cpp** |
| 6 | **LTX Dub-It IC-LoRA** | Reference video + a text line. LTX re-speaks the line and re-draws the mouth, mask-free. It does **not** take a TTS wav | **code** `dubit.py`; docs.ltx.io. **user**: sync mixed; voice "completely changes" (RuneXX #141). HF card gated, 401, not read | 2.47 GB. Gated. Single speaker, 5 languages, LTX-2.3 only | **Risky.** Guide tokens at full output size, plus the LoRA in RAM. Unmeasured | 16 GB+ for 720p likely. **Estimate** | **sd.cpp, medium:** IC-LoRA guide (same work as row 9 of plan J), audio encoder, appended audio tokens |
| 7 | **LTX ID-LoRA** | Zero-shot: first frame + about 5 s of voice. Reference audio tokens plus identity guidance (scale 3.0, an extra pass each step) | **code** `inference_one_stage.py:294-305`; README. Study figures (73 % over Kling 2.6 Pro) are the authors'. ComfyUI has it natively (#13111) | 1.16 GB, CelebVHQ and TalkVid | **Possible, slow.** Uses the dev model with several passes per step. About 19 s a pass at stage 1 (measured), so tens of minutes. **Estimate** | The official route starts at 24 GB | **sd.cpp, medium:** audio encoder, reference tokens, guidance mode |
| 8 | **Chanjing-Avatar V2V 1.3B** | InfiniteTalk method on Wan 1.3B; keeps body, background and camera, regenerates the face | **card** only; code cloned, no VRAM figure in it; new, few reports | 7.70 GB, Apache-2.0; needs Wan2.1-T2V-1.3B, wav2vec2, face models | **Best small unknown.** 1.3B should fit; nothing confirms it | V2V 5B add-on 1.31 GB; 14B: 720×1280, 15 GB per card on two 4090s, 9 min per second (**card**) | **sd.cpp, large** |
| 9 | **InfiniteTalk** | Wan2.1 14B + audio module; image or video input, long takes | **card**; very-low-VRAM flag exists, no figure. No 8 GB timing found | Module Q4_K_M 1.40 GB to Q8 2.65 GB, plus the Wan base. Apache-2.0 | **Doubtful.** 14B base; §E's limit applies at 720p | 480p at 16 to 24 GB (**user**) | **sd.cpp, large** (S2V code helps) |
| 10 | **MuseTalk 1.5** | One-step latent inpaint of the lower face, 256×256 | **card**: 30 fps+ on a V100. §B's "4 GB" is not in the README; a comment cites a 3050 Ti 4 GB, one user ran a 1060 3 GB "ultra slow", 6 GB users hit out-of-memory (#331, #362) | `unet.pth` 3.40 GB. MIT | **Likely fits, lower detail** than LatentSync's 512 | Speed only | **audio.cpp, medium port;** shares Whisper and SD VAE parts |
| 11 | **Ditto** | Audio to LivePortrait motion by diffusion; 512 crop with paste-back; image or video source | **code** (`inference.py:84`, `putback.py`). No independent film test found | ONNX 2.22 GB (voxta, Apache-2.0) | **Likely fits**; small networks, no figure. Head only | Speed | **ONNX, through the kit's `runner/onnx.js`** |
| 12 | **LivePortrait** | Motion transfer from a driving video; lip retargeting. Takes no audio | **code**, config read | 2.14 GB. MIT | Fits (**estimate**). Not lip-sync on its own | Speed | **ONNX;** a C++ onnxruntime port exists (hpc203) |
| 13 | **Wav2Lip family** | 96 px mouth; FaceFusion also has `edtalk_256` | **code** `lip_syncer/core.py:33-111` | ONNX through FaceFusion's model set | Fits. 96 px is too soft for a close-up; wide shots or previews only | Nothing | **ONNX** |
| 14 | **LiveAvatar** | Wan2.2-S2V with a 4-step blockwise adapter | **card**: 1280×720, 93 frames, 276 s, 15,993 MiB, RTX 5090; 2-block run used 43.33 GiB RAM | 18.25 GB. Apache-2.0 | **No.** 13.86 GB denoiser and 43+ GiB RAM | 16 GB + 64 GB RAM | **Already in audio.cpp** |
| 15 | **LongCat-Video-Avatar 1.5** | Whisper-large-v3 audio, distilled, INT8 option, multi-speaker demos | **card**; demos use 2 GPUs. No VRAM figure | 30 GB+ base, MIT | **No** | 24 GB+ likely. **Estimate** | **Large port** |
| 16 | **LipForcing** | Autoregressive few-step V2V lip sync | **card**: 37 GB at 14B. 1.3B student "coming soon" | 14B only. Apache-2.0 | **No, until 1.3B ships.** Worth watching | 37 GB+ | **Large port** |

**Seen, weights checked at most, inference code not read:** OmniAvatar (14B: 36, 21 or 8 GB by offload, 16 to 22 s/it on an A800, **card**; 1.3B adapter 0.36 GB), EchoMimicV3 (1.3B, "12G", **card**), StableAvatar (1.3B, 480×832 or 512×512, card only), LiveTalk 1.3B (5.69 GB, 24.82 FPS claim), SoulX-FlashHead (512 px; Lite 6.1 GB; a third-party 3.05 GB GGUF with no README and no known runtime), KeySync (24.6 GB), Sonic (6.7 GB, clone failed), HuMo GGUF (6.2 to 34 GB), SoulX-FlashTalk 14B, Hallo-Live (46.7 GB), bonframe lipsync, Talker-T2AV, AvatarForcing, LeapTalk, PersonaLive, SyncAnyone, HighSync, EditYourself (code and weights not checked).

**LoRAs:**
- `elix3r` AV talking-head (0.43 GB): locked to one trained character; training peaked at 77 GB (about $5 of rented GPU). Fails "any character". Its method is the useful part.
- `fbjr` Audio-Only-Context and Helium (164 to 290 MB): audio-only reference on distilled LTX at CFG 1. Marked experimental by its author. Lighter than ID-LoRA, needs the same reference tokens.
- American accent LoRA (177 MB): only helps row 4.
- Natural Face & Speech for H3 (Civitai, 4,377 downloads): for row 2.

**Face-crop pass (works with rows 1, 2 and 6):** H3 draws small faces poorly at any resolution (ComfyUI-H3-FaceRefine README), and Dub-It's docs give the same advice: track and crop the face, regenerate it filling the frame, composite back. Worth trying if wide shots fail. It is an image-processing addition, and untested here.

## 4. Voice conversion (only rows 4 and 6 need it)

No head-to-head benchmark exists, so this needs a listening test.

| Model | In audio.cpp | Size | Label | Note |
|---|---|---|---|---|
| Chatterbox VC | Yes | 2.0 GB on disk | MIT | About 3.2 GB when speaking (JustVoice measured) |
| MeanVC2 | Yes | 1.6 GB on disk | Apache-2.0 | Streaming, zero-shot |
| Seed-VC | Yes | not read | GPL-3.0 | Also singing |
| Vevo2 | Yes | not read | CC-BY-NC-ND | Licence label "No" |
| RVC | Yes | not read | not read | Trains per voice, a small-training option |
| OpenVoice V2 tone colour | Yes | not read | MIT | Tone colour only |

For rows 1, 2 and 3 no conversion is needed: JustVoice's measured TTS engines make the voice directly.

## 5. Tests for the top three

**Run order:** Test 1 first (no engine work), then the shared baseline, then Test 3 (rebuild only), then Test 2 (needs code). Time is recorded, not pass or fail. All tests wait for the card to be free. Use 3 seeds (41, 42, 43), because reports show sync varies by seed.

**Shared input.** Make the line with the TTS command already in `voice.ps1`, using the text "I could sit here all night, just listening to the rain." Save it as `out\talk\line.wav`. Convert with `ffmpeg -i line.wav -ac 2 -ar 48000 line-st.wav`. Measure its length with ffprobe. The picture is `out\k3-cafe-close.png`.

**What to look at in every test:** view at full size and half speed. Check that lips close on "m", "b" and "p" sounds, that the mouth opens on "all" and "night", that lips are shut in silence, that teeth and tongue hold together, and that the face still matches the keyframe.

### Test 1: H3 `fully_copy` (rank 2, no engine work)

- **Files:** `minimax_h3_ref2va_pruned-Q4_K_M.gguf`, `qwen3vl_32b_minimax_h3-Q4_K_M.gguf`, the H3 video and audio VAEs, the turbo LoRA: the `h3` preset in `cli.js`.
- **Run:** `$env:SDCLI='E:\Dev\Web\stable-diffusion.cpp\build-jd\bin\sd-cli.exe'`, then `node cli.js h3-lipsync h3 -W 864 -H 480 --video-frames <next 17k+5 at or above seconds×24> --vae-tiling --seed 41 -r out\k3-cafe-close.png --ref-audio out\talk\line-st.wav -p $h3`
- **Prompt:** the `$h3` block in `queue5.ps1`, with `<Picture 2>` and `<Subject 2>` removed, and this line added: `<Audio 1>: fully_copy - <Audio 1> is reused 1:1 as the target video's complete final audio track.`
- **After:** H3 may regenerate the audio (a user reports "pseudo-Chinese vocals"), so keep its track for comparison and mux the real wav on: `ffmpeg -i <clip> -i line.wav -map 0:v -map 1:a -c:v libx264 -crf 16 -pix_fmt yuv420p -c:a aac -b:a 192k -shortest <out>.mp4`
- **Failure:** the face is a different person (the HF #91 collapse) on all seeds; the mouth barely moves; sync is off by more than 2 frames at the muxed wav; out of memory or the RAM guard stops it.

### Test 2: LTX-2.3 A2V (rank 1, needs sd.cpp work)

- **Engine work first, on `jd`, after the merge in plan J row 1:**
  1. Re-port the LTX audio encoder from #1676 into `ltx_audio_vae.hpp`.
  2. Add `--init-audio` (the `load_wav_from_file` loader already exists).
  3. Set the audio lane's denoise mask to 0 in both stages in `src/pipeline/video.cpp`.
  4. Return the input audio as the output.
  5. Set `audio_timesteps_tensor` to 0 when audio is frozen (`diffusion_engine.cpp:2463`). This step is not in the PR. *Corrected 2026-10-31: that tensor also feeds the prompt and gate AdaLNs, which must keep sigma, so only the audio lane's AdaLN and cross-attention scale-shift get 0. See the register, §J.3.*
- **Files:** the `ltx` preset in `cli.js`; no new weights.
- **Run:** `node cli.js ltx-a2v ltx @base --video-frames <next 8k+1 at or above seconds×24> -i out\k3-cafe-close.png --init-audio out\talk\line-st.wav --seed 41 -p "<prompt>"`, where `@base` is the `$base` array in `queue5.ps1` (640×352, hires to 1280×704, 3 refine steps, 384-pixel tiles).
- **Compare:** once with timesteps 0 and once as the PR has it, same seed, to learn whether the fix matters. Also run a prompt with the spoken line and one with only "woman speaking", since the PR author saw mixed results.
- **Failure:** the mouth barely moves on all seeds ("voice-over narrator"); sync off by more than 2 frames; out of memory at 1280×704 (then record 640×352 without the refine as a separate result); the face drifts from the keyframe more than in `i2v-720p-cafe.mp4`.

### Test 3: LatentSync 1.6 Q8 (rank 3, needs a rebuild)

- **First:** rebuild audio.cpp at `jv` HEAD and confirm `latentsync` is in the exe. Put FFmpeg on PATH. Download `latentsync-1.6-q8_0-f16.gguf` (2.10 GB) from `audio-cpp/LatentSync-1.6-GGUF`.
- **Run:** `audiocpp_cli --task gen --family latentsync --model <file> --backend cuda --audio out\talk\line.wav --request-option reference_video_file=out\ltx23-2stage-1280x704-woman.mp4 --session-option latentsync.mem_saver=true --request-option num_inference_steps=20 --request-option guidance_scale=1.5 --request-option seed=1247 --out-dir out\talk\ls --log`
- **If out of memory,** change one thing at a time and record it, since each changes the output: `frames_per_chunk=12`, then `guidance_scale=1`.
- **Encode:** the rawvideo-plus-wav ffmpeg command in `docs/models/latentsync.md`, with sizes from `latentsync_video.json`.
- **Failure:** out of memory at every setting; a visible square seam around the mouth; "glitches instead of mouth" (LatentSync #336); the mouth clearly softer than the skin beside it at 720p; an error from a frame with no face (then note it and retry on a clip with the face always visible).

### Baseline: the current plan (rank 4)

Rerun `queue5.ps1` line 12, then `pwsh voice.ps1 ltx-talk.webm talk`. Judge whether the words are right and whether MeanVC2 or Chatterbox sounds like the designed voice.

## 6. What the reading established

- **The timestep gap (code).** Lightricks: `timesteps_from_mask` returns `denoise_mask * sigma` (`helpers.py:546-555`), so frozen tokens get 0. `jd`: `audio_timesteps_tensor` is built from `base_timesteps_vec`, the global value (`diffusion_engine.cpp:2463`). PR #1676 does not touch this. So with the PR, clean audio is labelled as noisy.
- **#1676 is a re-port, not a merge.** It is a draft from June, CLI only, tested at 256×256 × 65 frames, and it targets the old `src/stable-diffusion.cpp`; our code moved to `src/pipeline/video.cpp`. Its audio freeze matches Lightricks in both stages.
- **Dub-It does not solve "chosen voice".** It re-speaks a text line. A TTS wav can't drive it without masking that its workflow author doubts ("the LoRA may not hear it").
- **A2V, mask-0 H3 and LatentSync all take a fixed wav.** That is what "chosen voice" needs.

## 7. Corrections to the plan

- §B "LatentSync 1.6 18 GB": true only for Python. audio.cpp's own run is 9,144 MiB (Q8).
- §B "MuseTalk runs on 4 GB": not in its README; reports are mixed.
- §B "LiveAvatar near 16 GiB": confirmed, but it also needs 43+ GiB of RAM, and audio.cpp's own web UI lists 24 GB.
- §H "`ltx-talk.log` stops during model load": wrong. It passed stage 1, the upscale, stage 2 and audio decode, and stopped during video decode (2026-10-28 00:13). The cause is not recorded.
- §H/§J voice plan: `h3-talk` in `queue5.ps1` never ran either; there is no output.

## 8. Not verified

- No method here has been run on this PC or any 8 GB card. No head-to-head of LTX A2V, H3 and LatentSync exists.
- That the timestep gap is why A2V felt "janky" is a hypothesis.
- `mem_saver`'s real peak. H3 with an audio reference: memory and identity. Whether H3 Ref2VA regenerates audio in sd.cpp as it does in ComfyUI. Whether H3 Turbo LoRA suits `fully_copy`.
- Reddit: searches returned no threads apart from one snapshot. That is a gap in the search, not proof of absence.
- Blocked: docs.ltx.video and stable-diffusion-art.com (403), the gated LTX Dub-It card (401, docs.ltx.io read instead).
- Clones that failed: Sonic, LiveTalk, StableAvatar (card only). H3 file paths in `cli.js` were not re-checked on disk.
- Licence labels are as stated by the sources, not a legal reading.
- Sizes for Seed-VC, Vevo2 and RVC were not read.

## Sources

Local: `E:\Dev\Web\stable-diffusion.cpp` (`jd`), `E:\Dev\Web\audio.cpp` (`jv`), `E:\Dev\Web\test-just-direct`. Clones: `F:\ClaudeCode\tmp\claude\E--Dev-Web\c6773446-0ddf-4d1c-b8d4-a350607697fc\scratchpad\research-clones\talking`.

Web:
- [Lightricks LTX-2](https://github.com/Lightricks/LTX-2), [Dub-It guide](https://docs.ltx.io/open-source-model/feature-guides/audio/dub-it-beta), [sd.cpp PR 1676](https://github.com/leejet/stable-diffusion.cpp/pull/1676), [sd.cpp PR 2249](https://github.com/leejet/stable-diffusion.cpp/pull/2249)
- [RuneXX discussion 36](https://huggingface.co/RuneXX/LTX-2.3-2.5-Workflows/discussions/36), [RuneXX discussion 141](https://huggingface.co/RuneXX/LTX-2.3-2.5-Workflows/discussions/141), [LTX-2.5 discussion 44](https://huggingface.co/Lightricks/LTX-2.5/discussions/44)
- [ID-LoRA](https://github.com/ID-LoRA/ID-LoRA), [paper](https://arxiv.org/abs/2603.10256), [Dub-It weights](https://huggingface.co/Lightricks/LTX-2.3-22b-IC-LoRA-DubIt)
- [MiniMax-H3 repo](https://github.com/MiniMax-AI/MiniMax-H3), [H3 weights card](https://huggingface.co/MiniMaxAI/MiniMax-H3), [H3 discussion 91](https://huggingface.co/MiniMaxAI/MiniMax-H3/discussions/91), [H3 GGUF](https://huggingface.co/leejet/MiniMax-H3-GGUF), [ComfyUI-H3-FaceRefine](https://github.com/Carasibana/ComfyUI-H3-FaceRefine)
- Civitai workflows: [2930619](https://civitai.com/models/2930619), [2954231](https://civitai.com/models/2954231), [2863848](https://civitai.com/models/2863848), [2909076](https://civitai.com/models/2909076), [2925394](https://civitai.com/models/2925394), [2411105](https://civitai.com/models/2411105), [2306894](https://civitai.com/models/2306894)
- [LatentSync](https://github.com/bytedance/LatentSync), [LatentSync GGUF](https://huggingface.co/audio-cpp/LatentSync-1.6-GGUF), [LiveAvatar GGUF](https://huggingface.co/audio-cpp/LiveAvatar-GGUF), [MuseTalk issue 392](https://github.com/TMElyralab/MuseTalk/issues/392)
- [Chanjing-Avatar](https://github.com/chanjing-ai/Chanjing-Avatar), [V2V 1.3B](https://huggingface.co/cicada-ai/Chanjing-Avatar-V2V-1.3B), [InfiniteTalk](https://github.com/MeiGen-AI/InfiniteTalk), [LongCat-Video](https://github.com/meituan-longcat/LongCat-Video), [LipForcing](https://github.com/cvlab-kaist/LipForcing), [Ditto](https://github.com/antgroup/ditto-talkinghead), [Ditto ONNX](https://huggingface.co/voxta/ditto-talkinghead-onnx), [FaceFusion](https://github.com/facefusion/facefusion), [OmniAvatar](https://github.com/Omni-Avatar/OmniAvatar), [EchoMimicV3](https://github.com/antgroup/echomimic_v3)
- [LTX talking-head LoRA](https://huggingface.co/elix3r/LTX-2.3-22b-AV-LoRA-talking-head), [Audio-Only-Context IC-LoRA](https://huggingface.co/fbjr/LTX-2.3-22b-IC-LoRA-Audio-Only-Context), [accent LoRA](https://huggingface.co/joeygambino/ltx23-accent-american-audio-lora)
- Low authority, for VRAM conflicts only: [ltxworkflow.com](https://ltxworkflow.com/guide/vram-requirements), [thundercompute](https://www.thundercompute.com/blog/ltx-2-3-comfyui)

---

# Working notes

Scope update from the coordinator (user: "we want it to work on my specs but also different machines better specs as well this is not just for me it is for anyone"): 8 GB stays the floor; each candidate also says what 12, 16, 24 GB+ gets, with a source for each VRAM figure; ranking shows the best per tier. Sections E-H of the feasibility plan are settled and not re-derived. Sections A/B are unchecked web findings: anything relied on here is verified, not repeated.

Queries run so far (query -> what it returned):
- HF `models?search=lipsync` / `lip-sync` sorted newest -> FlashHead-LipSync-Lite (GGUF!), bonframe_lipsync-ONNX, enconvo avatar-lipsync-1 (LAM int8, audio-to-blendshape), p0pc0rn MuseTalk 1.5 pfw, LTX lipsync (empty user repo), SadTalker re-uploads.
- HF `talking-head` -> voxta/ditto-talkinghead-onnx (2026-09), bentay85 ditto TRT Windows, elix3r LTX-2.3 AV LoRA talking-head.
- HF `avatar` -> longcat-video-avatar-1.5 MLX, SimonGiebenhain/video-diffusion-avatars (2026-10, CC-BY-NC-SA), liveportrait reuploads.
- HF `dub` -> Lightricks/LTX-2.3-22b-IC-LoRA-DubIt; HF `ID-LoRA` -> nothing relevant; HF `ltx audio` -> fbjr Audio-Only-Context IC-LoRA, fal audio-reactive LoRA, accent LoRA.
- gh search repos `lip sync|lipsync|talking head|talking avatar|audio driven portrait pushed:>2026-04-01` -> FaceFusion (lip syncer), ComfyUI-H3-FaceRefine, LeapTalk, AvatarForcing, Talker-T2AV, Chanjing-Avatar 14B, LiveTalk-Unity, Phosphene, EchoMimic, FLOAT.
- gh `wav2lip onnx` -> wav2lip-onnx-HQ (162*), Subtitld addon (torch-free, CPU). `liveportrait onnx` -> hpc203 C++ onnxruntime, nsr-engine (CPU). `musetalk onnx` -> nothing. `lip sync ncnn OR onnxruntime OR ggml` -> nothing.
- Web "best open source lip sync model 2026 new release" -> listicles: LatentSync 1.6 top offline, MuseTalk real-time, Wav2Lip dated, KeySync (retest), Hallo-Live arXiv 2604.23632.
- Web "LTX-2.3 lip sync character speaks own voice audio to video workflow reddit 8GB" -> YouTube "LTX-2.3 Lip Sync/Audio to Video on 8GB VRAM" (RuneXX HF workflow), no Reddit threads returned.

ltx-talk.log re-read (NOT a re-derivation; the plan's "stops during model load" was wrong): the run passed stage 1, the x2 upscale, stage 2 (44.85 s/it) and audio decode, then ended during video VAE decode on 2026-10-28 00:13. The clip was lost at the last step; the speech was generated. Picture-to-video from out/k3-cafe-close.png, seed 41.

More queries:
- Web "ID-LoRA LTX-2 identity voice personalization ..." -> github ID-LoRA/ID-LoRA, arXiv 2603.10256 (ECCV 2026), HF AviadDahan weights, native ComfyUI PR #13111 (LTXVReferenceAudio).
- Web "latest techniques lip sync AI video local 2026 LTX Dub-It vs LatentSync comparison" -> docs.ltx.io Dub-It guide, RuneXX discussion 141, LTX-2.5 discussion 44; no head-to-head benchmark exists.
- Web "site:reddit.com r/StableDiffusion lip sync LTX 2.3 ..." -> no Reddit threads returned (gap); hinody Q4_K_M A2V repo, ComfyUI-LTXVideo low-VRAM loaders.
- Web "arxiv 2026 lip sync diffusion video-to-video mask-free code released weights" -> LipForcing (KAIST, 2606.11180), Hallo-Live, SyncAnyone, HighSync, EditYourself.
- Civitai API (lip sync|lipsync|talking|speech|dialogue, newest) -> MiniMax H3 LipSync workflows (2,294 dl), H3 Original Audio Lip-Sync (691), H3 Perfect Lipsync (949), H3 ref2va Lip Sync + TURBO (550), Natural Face & Speech H3 LoRA (4,377), LTX2 own-audio lip sync (550), InfiniteTalk native (797).
- HF names: StableAvatar, HuMo (Comfy-Org/HuMo, VeryAladeen GGUF), EchoMimicV3, KeySync, LiveTalk-1.3B, JoyFox-LiveTalk-DH-1.3B, LeapTalk, AvatarForcing, Talker-T2AV, PersonaLive, Wan2.2-S2V GGUF (QuantStack), OmniAvatar-1.3B.

Verified so far (proof level in brackets):
- A2V method [code, LTX-2 a2vid_two_stage.py:414,481,490,503]: "Audio is the frozen source latent both stages; decoded output is the original waveform." freeze_audio=True in both stages, then replace_chunks_audio. Video-only denoising.
- PR #1676 [code, diff]: same method (audio mask 0 in both stages; output audio = clone of input). Draft, author: "still feels off and pretty janky", CLI only, targets the OLD file layout (src/stable-diffusion.cpp); our jd moved this to src/pipeline/video.cpp, so it is a re-port, not a merge. Ported file set: 565 added lines. Author's test: 256x256x65 frames only.
- Our audio VAE [code: safetensors header of E:/Dev/Web/_spikes/ltx/avae.safetensors]: 44 audio_vae.encoder tensors present (1329 total, 1284 loaded today). So A2V needs NO new weights; jd has no LTX audio encoder class yet.
- Dub-It [code dubit.py + docs.ltx.io]: IC-LoRA 2.47 GB on the distilled model; takes a reference VIDEO + a text line; speech is RE-GENERATED by LTX from the prompt, frozen at stage 2. It does NOT take a TTS wav to drive lips. Single speaker, 5 languages, LTX-2.3 only. Mask-free. Frames snap to 8k+1. Users: voice "completely changes from the original" (RuneXX #141).
- ID-LoRA [code + README]: rank-128 LoRA 1.16 GB (HF: CelebVHQ, TalkVid). Zero-shot, ~5 s reference voice + first frame. Official: 24+ GB one-stage quantized, 48+ GB two-stage (PyTorch). Uses extra guidance passes (identity guidance scale 3.0 = one more forward pass each step), so it needs the dev model, not distilled. 
- LatentSync: official README min VRAM 8 GB (1.5), 18 GB (1.6) -> that is §B's figure and it is the PyTorch one. audio.cpp's measured numbers are far lower (RTX 5090, 1080x1920, 242 frames): Q8/F16 9,144 MiB, F16 9,974 MiB, F32/F16 15,700 MiB; 132.95 s session.
- LiveAvatar [card audio-cpp/LiveAvatar-GGUF]: 1280x720, 93 frames, 16 fps: 276 s, 15,993 MiB; denoiser file 13.86 GB + 4.13 + 0.25. NVFP4 (Blackwell only per the name; check). 43+ GiB host RAM at 2 blocks. Webui catalog says min_vram_gb 24.
- Chanjing-Avatar 14B: "two RTX 4090, 1 s took ~9 min, ~15 GB per card" [README line 150]. V2V 1.3B: 7.70 GB safetensors, Apache, InfiniteTalk approach on Wan2.1-T2V-1.3B.
- MuseTalk "4 GB" of §B: NOT found in the MuseTalk README (it says 30 fps+ on a Tesla V100, face region 256x256). Unverified as stated.

- H3 lip sync, two ways [user/workflow: Civitai 2930619, 2954231; none official]: (1) Ref2VA with the prompt instruction "Audio 1: fully_copy" (reference vs fully_copy per asset); (2) latent-noise masking: "The audio lane is masked at 0, so it is never denoised ... the mouth is drawn from the sound ... It is inpainting, with the audio lane as the known region" (works with frame2v too, i.e. keeps first-frame identity; two speakers via timed prompt). Same idea as LTX A2V.
- H3 identity warning [user, HF MiniMax-H3 discussion 91]: Ref2VA + audio similarity 0.08-0.09 against 0.88 for FL2VA + Ref2V Turbo; a second user disputes it ("Ref2va preserves identity with or without audio"). No official answer. Must be tested by eye.
- H3 12 GB data point [user, Civitai 2909076]: RTX 3060 12 GB, 1:30 lip-synced video in about 2 h with retries.
- Query log: Web "MiniMax H3 lip sync reference audio voice Ref2VA ..." -> TheLocalLab patreon, stable-diffusion-art guide (403 on fetch), HF discussion 91, atlascloud, hybrid checkpoint smhfacct; no VRAM data. Web "best voice conversion model 2026 ..." -> no head-to-head exists; OneVoice arXiv 2601.18094, MeanVC2 card. Web "InfiniteTalk 8GB VRAM GGUF ..." -> no 8 GB timing; low-authority Q3/Q4 advice. Web "LatentSync 1.6 8GB VRAM ..." -> no 8 GB success report for 1.6; ComfyUI node advice chunk_frames 16.

Final round of queries:
- Web "LTX-2.3 LTX-2.5 system requirements VRAM official ..." -> official 32GB+ (via snippets; docs.ltx.video fetch 403), community 12-16 GB figures that conflict, LTX-2.5 GGUF 11.5-23.6 GB.
- Web "LivePortrait Ditto talking head audio driven quality compared ..." -> no film close-up comparison exists.
- Web "Wan2.2 S2V speech to video GGUF low VRAM ..." -> no head-to-head; Reddit snapshot: S2V lip sync "genuinely finicky".
- arXiv abs 2601.22127 EditYourself: base model and code status not stated on the page.
- gh issues MuseTalk #392, #331, #362; LatentSync VRAM search (#284 asks 8 GB, 0 replies).
