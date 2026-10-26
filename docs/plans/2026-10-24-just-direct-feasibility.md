# just-direct — a free, local-first ArtCraft-style film app: is it feasible on the kit and this PC?

Status: RESEARCH, answering the user's question (2026-10-24). Nothing is built; no repo exists.

The user, 2026-10-24: "could we make a clone of artcraft that includes running local modles with our kit that uses
llm speech audio and image, would it befeasable to be able to do all the things it can do on this system … maybe
unreal engeine integration if that would be useful? think on this adverserially", then: "i want to be able to use
online services like that have but local was well all free accepts for what user has to pay for any api fontier
model", and the name: "just-direct it is".

This PC: RTX 2070 SUPER 8 GB (Turing, sm_75 — no native BF16, no FP8, no FlashAttention-2), Ryzen 7 5700X 8c/16t,
32 GB RAM, Windows 11 (*measured, 2026-10-24*: `nvidia-smi`, `Win32_Processor`, `Win32_ComputerSystem`).

## A · ArtCraft, what it is (*agent, web, 2026-10-24* — read-only fetches; not re-checked by this session)

- "The IDE for artists": an open-source desktop + web studio — compose in 2D, stage in 3D, render with hosted AI
  models (github.com/storytold/artcraft README; getartcraft.com).
- Features → providers:
  - text-to-image: Nano Banana/2/Pro, GPT Image 1–2.5, FLUX.1/1.1, Seedream 4–5, Midjourney 7/8/niji, Grok
    (README; getartcraft.com/faq/models-supported).
  - edit/inpaint on a Konva 2D canvas: Nano Banana Pro, GPT Image, Flux Pro Kontext Max, Flux Pro Inpaint, Flux Dev
    Juggernaut Inpaint.
  - image/text→video, first/last frame: Kling 1.6–3.0, Seedance 1.0–2.5, Veo 2–3.1, Sora 2/Pro, Vidu Q3, MiniMax H3,
    Grok Imagine Video, Happy Horse, Flux 3 (`frontend/libs/model-list/src/lib/lists/VideoModels.ts`).
  - the 3D stage: Three.js 0.171 run locally — GLB/glTF, PMD/PMX (MMD), SPZ splats (Spark), ammo.js, camera
    controller, a timeline, snapshots; a posed mannequin guides the final character (getartcraft.com/faq/3d-editor;
    `frontend/libs/components/pagescene/src/lib/engine/scene.ts`).
  - image→3D mesh: Hunyuan3D 2.0–3.1, Tripo3D, Meshy 6, Rodin via fal or ArtCraft hosted; worlds: World Labs Marble,
    TripoSplat (Gaussian splats).
  - music/sound: Suno, Seed Audio 1.0. Background removal: a server job (model unverified).
  - a video editor (`@storyteller/ui-video-editor`, 30 fps 1920×1080; mediabunny, opencut-wasm); pages Angles,
    Storyboard, Moodboard, Frame Extractor, Background Change, watermark removers.
  - **not found**: lip-sync, TTS/voice, upscaling, style transfer.
- Clip limits per model (VideoModels.ts): Seedance 2.0 4–15 s 480p–1080p (up to 9 ref images, 3 videos, 3 audio);
  Kling 3.0 3–15 s with audio; Happy Horse 3–15 s 720p/1080p; Veo/Sora not set in that file.
- Money and keys: credit plans Basic $8 / Pro $28 / Max $48 a month, yearly (getartcraft.com/pricing). API keys only
  for **fal** and **Replicate** (`ProviderCredentialKey`); Grok, Higgsfield, Midjourney and Runway are **web
  logins** — Midjourney's by extracting its webview's cookies (`services/midjourney/windows/
  extract_midjourney_webview_cookies.rs`); crates named `browser_emulation` and `cloudflare_mitigation`.
- Local models: **none**. ComfyUI request #968 open ("100% going to be put on our roadmap", 2026-01-08); ROADMAP.md:
  "Remove dependence on ArtCraft hosted services".
- Stack: Tauri 2 + a 39-crate Rust workspace (SQLite via SQLx) + React 18 / Nx / Vite / Zustand / Tailwind; a pure-Rust
  egui app `artcraft-native` added 2026-10-10; the hosted backend is a separate `artcraft-services` repo. Repo ~1.3 GB.
- License: **MIT or Apache-2.0** since PR #2043 (2026-10-10); before it a fair-source "ArtCraft License (WIP)" that
  barred a competing product. NOTICE: the ArtCraft name, wordmark and logos are trademarks, not licensed; some
  bundled assets (Nintendo sound effects, memes, skyboxes, an MMD motion, Mixamo renders) are excluded from the open
  license. Issue #2016 ("You are asking for lawsuits") on its Adobe-like product names.
- Activity: 36,290 stars, 5,736 forks, last push 2026-10-23, 4 listed contributors (squashed history), releases
  v0.15.0 (2026-03-16) … v0.41.0 (2026-09-26); Windows + macOS + web, Linux from source; an account is required.
- Game engines: no Unreal, Unity or Blender code; import GLB/glTF/PMX/SPZ only, no FBX, no exporter. Bridge requests
  #2179 (Godot/Unity/Unreal via glTF/USD) and #2159 (Blender) have no maintainer reply.
- Not verified: the models behind background removal, identity transfer and "Image to Location"; what "kinovi" is;
  the `artcraft-services` license; whether a live "ArtCraft" trademark registration exists.

## C · Cloud on the user's own key (*web, 2026-10-24* — third-party pages; the providers' own pricing pages not
fetched)

- **Midjourney: no official API**, and its terms (effective 2026-05-27) bar automated access; "Midjourney APIs" are
  unofficial wrappers that risk the user's account (unifically.com/blogs/midjourney-api, 2026-08-18;
  apiframe.ai/blog/best-midjourney-apis). ArtCraft's cookie login is that kind of access.
- **Suno: no public API**; an invite-only partner program announced 2026-07-01, no terms or prices
  (digitalmusicnews.com/2026/07/03/suno-is-opening-an-api-partner-program/).
- **Veo 3.1 in the Gemini API**, billed per second with audio: Standard $0.40/s 720p–1080p; Fast $0.10/s 720p,
  $0.12/s 1080p; Lite $0.05/s 720p, $0.08/s 1080p; no free tier (benchlm.ai/media-pricing/veo,
  layer3labs.io/guides/veo-3-pricing — three sites agree).
- **Kling: an API**, billed in units; ~$0.084/s for Kling 3.0 720p without audio (atlascloud.ai/blog/guides/
  kling-ai-api-pricing); 3–15 s per clip on 3.0.
- **fal and Replicate**: one key reaches many hosted video, image and 3D models — the only two key types ArtCraft
  itself takes (§A).

## B · Local models on this PC (*agent, web, 2026-10-24* — read-only; not re-checked by this session unless marked)

No sd.cpp video timing on any NVIDIA 8 GB card was found, and no Turing video number at all: every video figure
below is a proxy from another card.

- **sd.cpp makes video now**: Wan2.1/2.2 (2025-09-06), VACE (2025-09-14), LTX-2.3 (2026-05-17), LTX-2.5
  (2026-08-20), HunyuanVideo 1.5, MiniMax-H3, LingBot-Video (github.com/leejet/stable-diffusion.cpp README).
  **sd-server has `POST /sdcpp/v1/vid_gen`** — an async job like `img_gen`; `video_frames` (rounded down to 4n+1),
  `fps`, `output_format` webm/webp/avi, `high_noise_sample_params`; the job returns one encoded container
  (*web, this session*: examples/server/api.md).
- **audio.cpp covers more than speech**: music (ACE-Step 1.5, HeartMuLa, YuE2, Stable Audio 3), foley
  (ControlFoley), lip-sync (LatentSync, experimental), audio-driven avatars (LiveAvatar) (github.com/0xShug0/audio.cpp).
- **Turing**: ComfyUI/PyTorch falls back from bf16 to fp32 (Z-Image 3.37× faster with `--force-fp16` on a 2080 Ti;
  LTX-2 stayed fp32 — ai-muninn.com/en/blog/2080ti-turing-fp32-fallback); FlashAttention-2 and SageAttention only
  through community forks; fp8 gives no speed. ggml's MMA flash-attention is on for compute ≥ Turing (llama.cpp
  #11583), so sd.cpp/llama.cpp/audio.cpp don't hit these.
- **Video, proxies**: Wan2.2 A14B + lightx2v 4-step, RTX 4060 8 GB / 32 GB RAM, ComfyUI, 480×480, 33 frames: 111 s,
  4.6 GB card + 11 GB RAM (lilting.ch/en/articles/wan22-comfyui-rtx4060-i2v); an 8 GB card, Q4 + lightx2v, 480×480,
  81 frames, 6 steps: ~181 s warm (runflow.io/blog/comfyui-wan-2-2-image-to-video). Wan2.2 TI2V-5B: 95 s at 480×480
  on a 4060 but "distorted, almost no motion" (same lilting.ch page; sd.cpp #1243). A Dec 2025 sd.cpp report had
  both A14B experts + the encoder allocated at once (#1129). LTX-2.3 distilled Q4 on an RTX 3070 8 GB laptop with
  SageAttention: 20 s of 900×1600 in 21 min (reddit 1rxtay2). FramePack on a 4060 laptop: 4.83 s in 56 min, RAM-bound
  (43 GB demand). HunyuanVideo 1.5: 14 GB minimum with offload (official).
- **RAM is the limit for 14B video**: Wan A14B Q4_K_M 9.65 GB × 2 experts + umt5 Q8 6.04 GB ≈ 25.3 GB resident (≈ 6 GB
  left on 32 GB, no LLM beside it); Q3_K_M × 2 + umt5 Q4 ≈ 18 GB; LTX-2.5 Q4 + Gemma 4 Q4 ≈ 24 GB.
- **The Wan family** (*web, this session, 2026-10-24*): open weights stop at **Wan 2.2** (2025-07-28, Apache-2.0);
  Wan 2.5 (2025-09), 2.6 (2025-12), 2.7 and a 3.0 beta (2026-08) are API-only — no Hugging Face weights
  (howaiworks.ai/blog/alibaba-wan-open-weights-stopped-at-2-2; flowjam.com/blog/wan-ai-review-2026; a 2025-12
  "Wan 2.6 open source" item rests on one tweet). Open text-to-video: Wan2.1 T2V 1.3B and 14B, Wan2.1 VACE 1.3B/14B,
  Wan2.2 T2V A14B (two 14B experts), Wan2.2 TI2V-5B. **Wan2.1 T2V 14B has a 4-step, no-CFG distill** from lightx2v
  (`lightx2v/Wan2.1-T2V-14B-StepDistill-CfgDistill`, Apache-2.0, a full model or a rank-64 LoRA, "~20–24×" fewer
  steps' time — lightx2v-en.readthedocs.io/en/latest/method_tutorials/step_distill.html). One 14B file is half the
  2.2 A14B's two (≈ 9.65 GB at Q4_K_M + umt5 ≈ 16 GB RAM — an estimate from §B's per-expert size, not measured).
- **Images**: FLUX.2 klein 4B (Apache) measured here 15.3 s warm (§ sd.cpp in RESEARCH.md); Z-Image Turbo 6B
  (Apache) — sd.cpp k-quants gave black images on an RTX 2070 until PR #1020 (2025-12-01); Qwen-Image-Edit
  2509/2511 20B (Apache) Q4_K_M 13.1 GB + a 7B VL encoder, takes 1–3 images and keypoint/depth/edge maps; FLUX.2
  klein 9B and FLUX.1 Kontext dev are non-commercial.
- **Consistency tools**: sd.cpp ControlNet is SD1.5 only, IP-Adapter SD1.5/SDXL; reference edits (`-r`) for klein,
  Kontext, Qwen-Edit; Wan VACE; Wan2.1 FLF2V 14B (first/last frame). **LoRA training: none in sd.cpp** — every trainer
  is PyTorch; on 8 GB only SDXL (kohya: "8 GB (10 GB recommended)"); FLUX.2 klein 4B LoRA needs 24 GB.
- **3D**: TRELLIS.2 4B (MIT; DINOv3 its own license) has ggml ports (github.com/localai-org/trellis2cpp): 1024
  cascade ~10 GB card + 14 GB RAM spike, 512 path ~110 s on a 16 GB card. Hunyuan3D 2.1 shape 10 GB, texture 21 GB;
  no C++ path.
- **Speech** (*measured on this PC* by JustVoice, `JustVioce/docs/engines.md`): Kokoro 11.9× real time on CUDA
  (< 1 GB), 3.2× on CPU; Qwen3-TTS 1.7B 1.9×; Chatterbox Multilingual 2.1× (~3.2 GB); VoxCPM2 1.3–1.4×; Pocket TTS
  on CPU 3.9–4.1× with cloning.
- **Lip-sync**: LatentSync 1.6 18 GB and its InsightFace weights non-commercial; LiveAvatar (Wan2.2-S2V-14B) "near
  16 GiB" at 720p; MuseTalk 1.5 (MIT) runs on 4 GB but is PyTorch + mmpose/mmcv. No 8 GB number for any.
- **Music/SFX**: ACE-Step 1.5 (MIT) official "<4 GB"; HeartMuLa (Apache) 60 s in ~80 s on a 3060 12 GB; YuE2 and
  ControlFoley CC-BY-NC; Stable Audio 3 free under US$1M revenue; MMAudio weights CC-BY-NC — **no commercially
  licensed local foley model**.
- **Post**: ESRGAN in sd.cpp (`--upscale-model`); Real-ESRGAN and RIFE as ncnn-vulkan executables; BiRefNet (MIT)
  with official ONNX; RMBG-2.0 non-commercial.
- **The card holds one big model at a time** (kit-measured: Gemma 4 26B-A4B 6,844 MB, evicted by Kokoro's 567 MB);
  sd.cpp with offload idles at ~90 MB card / ~8 GB RAM, 455 MB after unload.
- **Disks** (*measured, 2026-10-24*, `Get-PhysicalDisk`): E: is a Samsung 990 PRO 2 TB NVMe, F: a 970 EVO Plus NVMe,
  C: and D: SATA SSDs — model loads come off NVMe.
- Not verified: any sd.cpp video number on 8 GB; whether sd.cpp's `--max-vram` fixes #1129; how 4-step distilled
  Wan looks; TRELLIS.2 at 512 on 8 GB; audio.cpp speed for ACE-Step, LatentSync, LiveAvatar on 8 GB; licenses of
  FramePack, HunyuanVideo-Foley, LingBot, the ncnn tools.

## E · The quick test, measured on this PC (*measured, 2026-10-25* — the user's go "your rec go when ready"; bar:
"i would like a 5s clip to take a max of 5 mins")

How: everything through the kit — `RuntimeService.install` (sd.cpp `master-1004-a85db96` cuda12, the pinned build),
`downloadModel` (pinned file sets, SHA-256 verified, the kit's HF cache layout), `ensureServer` + `runJob` with the
arbiter, and the kit's new video job (`runner/sdcpp.js` `videoGen` / `runVideoJob` / `videoJobBody` →
`POST /sdcpp/v1/vid_gen`, kit 59e3d87). The cache root is the session scratchpad, not the shared family cache inside
JustWrite's data folder (the user's rule: test output never in an app's real data folder). Driver scripts and logs:
the session scratchpad `video-test/`. sd-server turns flash attention on itself (`--flash-attn` default `auto`), so
the kit's argv needed no flag. Nothing else on the card (JustVoice's session confirmed).

- **FastWan 2.2 TI2V 5B Q8_0** (Green-Sky GGUF of FastVideo's 3-step DMD distill) + umt5-xxl Q8_0 + wan2.2_vae;
  T2V, 1280×704, 121 frames, 24 fps (5.0 s, VP8 webm 26.3 MB), euler, 3 steps, cfg 1, flow shift 5, VAE tiled
  (spatial 256 default, temporal, `temporal_decode_frames=1`):
  - cold: **1,003 s** total — load + 3 steps done at 122 s (sampling 103.6 s), then the **VAE decode ~14 min** (36
    tiles at ~23–28 s each). Peak card 7,146 MB (whole card, ~700 MB is the desktop), sd-server RAM 14.0 GB.
  - warm (second run): sampling **94.1 s**; its decode was stopped (same settings, same ~14 min).
  - Look: a fox in a snowy forest at golden hour, clear motion, sharp at 720p; motion blur as it nears the camera
    (frames 0/60/120 viewed).
  - **The decode is the bottleneck, not the model**: during it the card held only 4.2 GB.
  - **The user, 2026-10-25: "the quality of the video is bad" · "as you say the fox is blurry this is not
    acceptable"** — a full-size crop of frame 40 shows the face smeared (eyes and muzzle melt), waxy fur, soft trees;
    the file is 44 Mbit/s VP8, so not the encoding. Suspects: the 5B model itself, or the sampling — FastWan was
    distilled on DMD timesteps 1000/757/522 at flow shift 5 (FastVideo's `distill_dmd_t2v_5B.sh`), and this run used
    sd.cpp's default 3-step schedule. **FAILS the quality bar as run.**
- **A kit finding — sd-server can't open a model path over 260 characters.** The 14B's file in the kit's HF cache
  layout under the scratchpad cache root was 298 characters (`models--QuantStack--Wan2.1_T2V_14B_LightX2V_
  StepCfgDistill_VACE-GGUF/snapshots/<40-hex>/<56-char file>`); sd-server exited at start: `[E] cannot inspect model
  source …` → `get sd version from file failed` → `new_sd_ctx_t failed`. The same file through a 34-character
  junction (215 characters) opens. An app whose data folder is deep (a user profile path) plus a long repo/file name
  can hit it — the kit should hand sd-server a path under the limit (Windows' `\\?\` prefix if sd.cpp's open
  honours it, or a short link), and the model download should warn. Not yet checked: llama-server and audio.cpp.
- **Wan 2.1 T2V 14B LightX2V 4-step, the VACE GGUF (Q4_K_M) — does not run at 720p on 8 GB.** 1280×720, 81 frames,
  euler, 4 steps, cfg 1, flow shift 5, VAE tiled: sd.cpp first ran a VAE **encode** of an empty control video
  because the file carries VACE blocks (`encode_first_stage` 361.8 s — 36 tiles at ~5 s, plus "wan_vae does not
  support temporal tiling for encode"), then sampling failed at once: "model manager cannot make enough memory
  available on CUDA0: need 8028.43 MB device / 7516.43 MB budget, available 7031.00 MB" → "Wan2.x-VACE-14B segment
  1/42 (wan.prelude) failed during weight preparation". 378 s, no clip; sd-server peak RAM 6.4 GB. Choosing the VACE
  file for plain text-to-video was my mistake (it was the only 4-step 14B GGUF found); a non-VACE 14B (city96
  Q4_K_M + the lightx2v LoRA) skips the encode, but at 720p its own working memory is unmeasured and its 4 steps
  were estimated at ~15 min from the 5B's per-step time — past the 5-minute bar either way.
- **Wan 2.2 T2V A14B — not run**: two 14B experts used in turn, each with the 14B's 720p working memory that already
  didn't fit, and ~25 GB of RAM.
- **LTX-2.3's fast pipeline is two-stage** (*code, 2026-10-25*: Lightricks/LTX-2 `ltx_pipelines/utils/constants.py`
  and `distilled.py`): stage 1 at half the target size with `DISTILLED_SIGMA_VALUES = [1.0, 0.99375, 0.9875, 0.98125,
  0.975, 0.909375, 0.725, 0.421875, 0.0]` (8 steps), a ×2 spatial upsampler, stage 2 at full size with
  `[0.909375, 0.725, 0.421875, 0.0]` (3 steps); 121 frames at 24 fps by default. sd.cpp runs it with `--hires`
  (docs/ltx2.md), but **sd-server's `vid_gen` takes no `hires` object — it is `img_gen`-only** (*web*,
  examples/server/api.md; upscalers live flat in `--hires-upscalers-dir`). Through the kit's server LTX can only run
  one stage (all 8 steps at 720p); the two-stage route needs sd-server to grow `hires` for video (upstream) or the
  kit to run sd-cli for it.
- **LTX-2.3 22B distilled 1.1 Q4_K_M, one stage through the kit's server** (Gemma 3 12B Q4_K_M, the distilled
  connectors and VAEs; 1280×720 → sd.cpp aligns to 1280×736, 121 frames, 24 fps, euler, the 8 distilled sigmas,
  cfg 1, VAE tiled, `--mmap` — a test-only server flag, the weights in the scratchpad on C:'s SATA SSD): text 7.8 s,
  8 steps **413 s**, audio decode 5.6 s, video decode **79.6 s**, **520 s** in all; card peak 6,980 MB, RAM peak
  22.8 GB. **Every frame was white.**
- **Why white: Gemma 3 on this card** (*measured, 2026-10-25*, sd-cli at 512×288 × 25 frames, one change at a time):
  default sigmas and no tiling — white; the VAE on the CPU (`--backend vae=cpu`) — white; **the text encoder on the
  CPU (`--backend te=cpu`) — a proper clip** (a fox trotting through snowy pines at golden hour). Gemma's activations
  overflow fp16 (the card has no bf16), the conditioning goes bad and the whole video with it. Text on the CPU: 41.8 s
  per prompt (7.8 s on the card, broken). **A kit gap:** a catalog row (or the runtime, by the card's bf16 support)
  must be able to place a model part on the CPU — sd-server takes `--backend te=cpu`.
- **The disk, not the card, set the small run's pace:** 8 steps at 512×288 × 25 frames (~600 positions) took 137 s —
  ~17 s a step for a few seconds of arithmetic — because `--mmap` read the 13 GB of weights off the SATA SSD each
  step. The app's real cache is on E: (NVMe), so the two-stage measurement reads its weights from a scratch copy on
  E: (`E:\Dev\Web\_spikes\ltx`, not an app's data folder; deleted after).
- **LTX-2.3 two-stage at 1280×736 × 121 (sd-cli, weights mmapped from the NVMe copy, Gemma on the CPU) — stopped by
  Claude Code for low system memory** after the text step (42.1 s), during stage 1 (2026-10-25). The set is ~25 GB
  (13.2 diffusion + 6.8 Gemma held in RAM for the CPU + 2.2 connectors + 1.7 VAEs + 0.9 upscaler) against ~20 GB free
  with the other sessions' processes running. Not restarted (the harness's rule: only on the user's word). **32 GB of
  RAM is tight for LTX 22B + Gemma 12B: in an app nothing else could run beside it.**
  On 2026-10-26 free RAM was 15.6 of 31.9 GB with normal desktop use, and no one program held much of it: Edge 2.9 GB,
  Claude 2.4, ChatGPT 1.7, Windows services 1.6. The pinned sd-cli (`master-1004-a85db96`, its `--help`) can keep
  weights on disk instead of in RAM: `--params-backend` takes `disk` per part (e.g. `diffusion=disk`).
  `--auto-fit`, on by default, places weights on the card, then in RAM, then on disk, by free memory, but an explicit
  `--params-backend` turns it off. Streaming the 13.2 GB diffusion weights from disk would bring the set under the
  free RAM, at the cost of reading them from NVMe on every step. Not run yet.
- **HunyuanVideo 1.5 — not run, by arithmetic**: its VAE compresses 16×16×4 against LTX's 32×32×8, so 5 s at 720p is
  ~111,600 positions against LTX's ~14,700 (which already took ~48 s a step here); sd.cpp has none of its sparse
  attention, attention grows with the square, and it runs at cfg 6 over many more steps. An estimate from the
  published compression, not a run.

## F · The kit's downloader, measured again (*measured, 2026-10-25*, 20 s each, one at a time, this PC)

The user: "check your damn nots … we spent time on this recently and it was supposed to be fixe" · "read your notes
this is exact probmel that you said you fixed last thime".

| | curl, 1 connection | kit `streamDownload` segments=1 | kit segments=8 | undici, 8 parts on ONE agent | undici, 8 parts each on ITS OWN agent | curl, 8 separate HTTP/1.1 connections |
|---|---|---|---|---|---|---|
| Hugging Face (LTX Q8_0, 22.8 GB) | 103.2 MB/s | 86.2 | 97.7 | 100.4 | 104.8 | — |
| GitHub release asset (sd.cpp cuda12 zip, via release-assets.githubusercontent.com) | 0.7 MB/s | 0.9 | 0.8 | 1.2 | **6.7** | **7.3** |

- **Why it came back:** GitHub caps each connection (~0.7–1.2 MB/s today). The kit's 8 parts ride on ONE connection
  — RESEARCH §9 recorded it ("every parallel part of a download to one server shares one connection", undici's
  HTTP/2) — and the 2026-10-18 fix widened that one connection's windows, which fixed Hugging Face, but never gave
  each part its own connection, which is what aria2 and IDM do. So "8 connections" (`download.CONNECTIONS`) is 1
  against any server that limits per connection. The sd.cpp engine install today: ~0.9 GB in ~12 min.
- **Second bug:** `models.acquireModel` and `models.acquireFileSet` default `segments = 1` and pass it to
  `streamDownload` (models.js:656, :696), and no caller passes one (lifecycle.js:2930, :3182; runtime_service.js:274)
  — every model download since the 2026-10-18 settings removal runs on one part, against "a download's connections
  (8) … are the downloader's own".
- **The fix, proven above with the kit's own undici:** each worker of `chunked` on its own agent (5.6× on GitHub,
  +4 % on Hugging Face), and the model downloads on `download.CONNECTIONS`.

## D · The answer (argued against)

- **Buildable on the kit: yes.** sd.cpp (image + video through sd-server's `img_gen`/`vid_gen` jobs), audio.cpp
  (voice, music, some SFX), llama.cpp (script, shot list, prompts), the kit's cloud adapters and feature routing (local
  or the user's key per feature). ArtCraft itself runs nothing locally (§A), so the local half is new ground.
- **Every feature local and smooth on this PC: no.** Images, voice, music, the LLM, a 3D stage and the editor —
  yes. Video — a queue, not interactive: 480p, ~2–5 s clips, minutes each by proxy (unmeasured here), the LLM
  unloaded meanwhile, RAM nearly full on 14B. Lip-sync and image-to-3D — not usable here; the cloud key covers them.
  **720p for 5 s is unmeasured, not ruled out**: LTX-2.3 distilled Q4 made 20 s at 900×1600 in 21 min on an RTX 3070
  8 GB laptop with 32 GB RAM (ComfyUI + SageAttention); LTX-2 made 10 s at 720p in under 15 min on an RTX 3050 6 GB
  with 44 GB RAM; Wan2.2 TI2V-5B is a native 720p model (§B) — all on Ampere/Ada cards, none on Turing or in sd.cpp
  (was: "720p+ and long clips — not usable here", from the agent's blocker list, until 2026-10-24).
- **Licences never rule a model out** — the user, 2026-10-24: "stop worrying about the damed licesnes we already
  fixed that in justvoice we can use any license we just let the user know". JustVoice's way (*code/docs*,
  `JustVioce/docs/engines.md`:42-50, its TASKS "DECIDED 2026-10-11"): every model is offered, labelled *Commercial
  use: Yes, Conditional, Separate licence, No or Unclear* with a plain summary on hover and in the opened model, and a
  model that isn't a plain Yes asks the user to accept its licence once, before its first download ("NOT: removing
  any engine for its licence — the user chooses"). Today that label lives in JustVoice's own model notes
  (`LICENCE {commercial, summary, url, checked}`); for just-direct it is a kit gap — a licence field on the kit's
  catalog rows. The licence facts in §B are the label's data, not a filter.
- **The user's bar, 2026-10-24:** "if we cant do text to video 5s 720p clicp on this pc then it is not worth it".
- **The first step is a measurement**, the way P1 was for sd.cpp: Wan2.2 A14B I2V Q4 (and Q3) + the 4-step LoRA
  through sd-server `vid_gen` on this card at 832×480 × 33/81 frames — time, RAM, card, how it looks. That number
  decides whether local video is a tool or a toy.
- **Unreal: no integration.** glTF in and out of the app's 3D stage gives Unreal and Blender the scene (Unreal imports
  .gltf/.glb through Interchange, whole scenes by File › Import Into Level — *web, 2026-10-24*:
  dev.epicgames.com/documentation/unreal-engine/importing-gltf-files-into-unreal-engine; cameras and animation
  through it not checked); running Unreal beside a video model on one 8 GB card isn't possible.
