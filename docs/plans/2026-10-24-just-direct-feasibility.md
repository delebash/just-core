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

## G · The viability round (*measured, 2026-10-26*)

The user, 2026-10-26: "your rec keep testing until we determine if the app is viable, think on antying else or other
models or methods that could make this app viable, think adversiarly go". The bar, restated the same day: "it can be
over the 5 minute a little even 6 i just dont wnat a 5s click takking a real long time so that it make it not worth it,
if figure 5 min should be ok but if it is a few min more that can be ok".

How: sd-cli `master-1004-a85db96` under a RAM guard (stops the run when available RAM stays under 1 GB), driver
scripts in `E:\Dev\Web\test-just-direct\` (`cli.js`, `srv.js`), weights on E: (NVMe), nothing else on the card, the
browser closed for the clean runs (with it open: 19.3 GB available, 0.9 GB of the card in use). Prompt: the fox of §E;
seed 42; 121 frames at 24 fps (5.0 s).

- **LTX-2.3 two-stage at 1280×704 runs on this PC: 410 s cold (6.8 min), and it looks right.** Stage 1 640×352 × 8
  distilled sigmas, the ×2 spatial upscaler, stage 2 1280×704 × 3 sigmas, Gemma on the CPU, the VAE in 384-pixel
  tiles at 1/8 overlap: load ~22 s, text 44.6 s, stage 1 ~152 s (18–19 s a step), upscale 1.6 s, stage 2 ~134 s
  (44.5 s a step), audio decode 5 s, video decode 37.6 s. Card peak 7,231 MB, sd-cli private peak 23.3 GB, lowest
  available RAM 5.6 GB. Frames 0/60/120: sharp trees and snow, a clean sun flare, the fox's head whole (eye, ear,
  muzzle) — soft fur and motion-blurred legs; nothing melts as FastWan's face did (`frames/s4-*`, `frames/s3-*crop*`).
  Same run with sd.cpp's default tiles (256, 1/2 overlap): decode 78.7 s, 450 s in all; no seams at 1/8 overlap.
- **Stage 1 is bound by moving weights, not by arithmetic**: 18 s a step for 3,520 positions against 44.5 s for
  14,080 at stage 2; a 512×288 × 25 clip still takes ~15 s a step. The link is PCIe 3.0 x16 (`nvidia-smi`), so the
  ~0.9 GB/s is sd.cpp's staging, not the bus. Q4_0 (12.7 GB, 10 % fewer bytes) left stage 1 unchanged (18.4 s).
- **Q4_0 instead of Q4_K_M: not worth it** — 398 s (stage 2 42.5 s a step, −5 %), but sd-cli's private memory rose
  to 30.5 GB and available RAM fell to 1.49 GB. (sd.cpp #1818 reports K-quants ~2× slower on a 2080 Ti — not seen
  here.)
- **RAM: sd.cpp's auto-fit places the weights; `--mmap` doubles them.** Auto-fit (on by default) put the 13.5 GB
  diffusion model in RAM and Gemma (9.2 GB with its connectors) on disk — read for the text step, then released. With
  `--mmap` the mapped file pages and the pinned copies stack: a 512×288 run hit 0.55 GB available and the guard
  stopped it. Without `--mmap`: 5.6 GB left at 720p. `--params-backend diffusion=disk` (weights read from the NVMe
  each step) held 11.5 GB free and cost ~20 % at 512×288 (19.6 against ~15 s a step).
- **Gemma on the card works with the overflow flags, but not beside a 720p run on 8 GB.** `--linear-scale 0.00390625
  --attn-scale 0.00390625 --flash-attn auto,te=off` (docs/troubleshooting.md's fix, the smaller value) gave a proper
  clip at 512×288 with the text step in 16.8 s against 44.6 s on the CPU; 0.0078125 with flash attention on was still
  white (235). Which of the two flags does it is not isolated. At 1280×704 stage 2 then failed: ~3 GB of weights stayed
  on the card ("need 3425.73 MB device … available 3407.00 MB") and pinned host allocations failed. Text stays on the
  CPU until sd.cpp releases the encoder from the card first.
- **`--sage-attn` is not for this card**: "SageAttention is unavailable on CUDA0; it requires … SM80 or newer kernels"
  (sd.cpp's error; docs/sage_attention.md).
- **sd-server's `vid_gen` runs the two-stage job** (*code*, the research agent, pinned `a85db96`: `from_json_str`
  reads the `hires` object for both modes; only api.md leaves it out). *Measured*: through the kit's
  `RuntimeService.ensureServer` + `runJob` and `sdcpp.runVideoJob` (`srv.js`; the kit's `videoJobBody` plus a `hires`
  object and `vae_tiling_params`; server flags `--backend te=cpu --hires-upscalers-dir <the upscaler's snapshot>`, no
  `--offload-to-cpu`) the job ran text 43.8 s, stage 1 170.3 s (19.7 s a step), then "LTX latent spatial upscale" —
  and **Claude Code stopped it for critically low system memory** while the upscaler loaded (2026-10-26). In
  sd-server auto-fit chose `--params-backend "diffusion=cpu,te=cpu,vae=disk"`: Gemma's 9.2 GB **kept in RAM** beside
  the 13.5 GB diffusion model (~23 GB), where sd-cli's auto-fit read it from disk and released it. Not re-run (the
  harness's rule: only on the user's word). The fix to measure: `--params-backend "diffusion=cpu,te=disk,vae=cpu"` on
  the server.
- **Kit gaps from this round** (none in TASKS.md): `videoJobBody` has no `hires`; `sdServerArgv` always adds
  `--offload-to-cpu` and has no way to add `--backend te=cpu`, `--params-backend` or `--hires-upscalers-dir`; the
  webm sd.cpp writes carries LTX's sound as PCM (48 kHz stereo, mean −19 dB — real audio), which browsers may not
  play in webm.

## H · The consistency round (*measured unless marked, 2026-10-27*)

The user, 2026-10-27, after seeing the 720p clips: quality and time pass ("that is much better quality"); "we just
need to figure out how to fix consistancy" — the same actors and sets across shots, longer takes from 5 s clips, voices.
The app's direction: "i just want to make films easily via ai without having to do much of my own manual work i want ai
to do it all fix lighting do camer ect" (the app is the AI director). No second engine: "i dont wna to run confyui and
python, you can build the lypsc cant you". Before building: "lets make sure we get the correct models and methods
before we build so run whatever tests you need to"; licences aside for now.

- **The kit's server path makes one clip per server, at the sd-cli time.** `srv.js` with `--params-backend
  "diffusion=cpu,te=disk,vae=cpu"` (sd-cli's own auto-fit choice): fox 419 s, the woman 417 s, lowest available RAM
  5.6 GB. A **second clip in the same server fails** both ways: with Gemma kept in RAM the RAM runs out (0.03 GB
  available, guard stop); with Gemma read from disk the second read fails ("read tensor data failed" → GGML_ASSERT
  crash). The conditioning cache (sd-server's default 4) did not spare the re-read for the same prompt. So: a fresh
  server per clip; warm costs ~13 s more than nothing, since the weights load lazily inside the job anyway.
- **Speed variants of the 410 s clip:** 12 fps × 65 frames 316 s (needs interpolation to 24); refine in 2 steps 364 s;
  `--cache-mode easycache` 414 s (no gain); Gemma on the card: text 17 s but stage 2 out of card memory again. A list
  flag given twice (`--hires-sigmas`) is appended, not replaced (6 refine steps, a white clip) — the test script now
  drops a preset flag the run gives again.
- **The ~12 s of every step is not the copying**: with `--disable-prefetch` each 238 MB block stages in 0.03 s, and
  `--max-vram 4` (more blocks streamed) left the step time unchanged (12.1 against 11.9 s at 512×288×25). The cause is
  still open.
- **Keyframes from a reference picture (the method AI Movie Studio 2 and LTX Studio use):** FLUX.2 klein 4B Q8 with
  `-r` makes a 1280×704 shot in 20 s; at face size the woman's freckles, curls, eyes, bag strap and necklaces hold
  across a train, a bookshop and a streetlamp (`out/id-sheet.png`). Qwen-Image-Edit 2511 Q4_K_M + Lightning 4-step:
  92 s, 29 GB private RAM, closer to the reference face but it reused the reference's street for "streetlamp" and
  stamped a text mark. Qwen-Image 2.1 Turbo: 92 s. FLUX.3 klein Q8_0: sd.cpp planned one 7.7 GB segment against a
  6.6 GB budget and failed (re-run with `--max-vram 5` pending).
- **Picture-to-video at 1280×704 ran out of card memory in `a85db96`** ("need 9806.96 MB device"): with a picture
  the clip carries one timestep per video token, and every block built its AdaLN tables per token ([dim × 9 × 14,080]
  f32, ~2 GB each, several per block; `ltxv.hpp` `get_ada_values`). **A local sd.cpp patch** (branch `jd` in
  `E:\Dev\Web\stable-diffusion.cpp`, NOT STANDARD until upstream takes it) runs the tables on the distinct timesteps and
  gathers them per token where applied: **720p picture-to-video 407 s** (the text-to-video time), stage buffers 511 /
  1,831 MB like text-to-video; she sips and smiles with freckles, curls, necklaces and jacket intact
  (`out/i2v-720p-cafe.mp4`). At 640×352×49 the patch is also faster (187 s against 235 s; buffer 245 against
  1,038 MB). Equivalence is not proven yet: builds from this PC's toolchain (CUDA 12.4, MSVC 14.44) differ from the
  official ones even on the untouched text-to-video path (PSNR 28.7 dB) while official runs are bit-identical; a clean
  same-toolchain build decides it.
- **FastWan 2.2 5B picture-to-video at 1280×704: out** — ~49 VAE rounds of 23 s each, ~25 min a clip.
- **What sd.cpp `a85db96` lacks for consistency** (*code*, research agents): LTX takes a first and a last frame only
  (`"LTXAV control_frames are not implemented"`) — no IC-LoRA guide (Lightricks' "Ingredients" reference sheet), no
  middle keyframes, no latent extend, no input audio (draft PR #1676 `--init-audio`, unmerged); no Phantom/Stand-In.
  MiniMax-H3 Ref2VA (up to 9 pictures + voice clips → video with sound) is in; sd-server takes its `ref_images` only.
  Wan VACE takes one reference, through `-i`. sd.cpp's default `discrete` scheduler mis-places few-step distill
  ladders; `--scheduler simple` matches LightX2V/H3-turbo.
- **Lightricks' own consistency tools** (*web/code*): Ingredients IC-LoRA (one sheet: faces + turnarounds + props +
  location → the cast and set in the video), ID-LoRA (face + a 2–8 s voice → LTX speaks in that voice), A2V (input
  voice frozen), Extend (latent overlap, no re-encode seams); official I2V settings: picture strength 0.7, the picture
  pre-compressed like a video frame (H.264 CRF 18). All ComfyUI today; each is an sd.cpp addition for us.
- **Voices** (*docs*): audio.cpp clones voices (Qwen3-TTS Base from ~3 s, Chatterbox, IndexTTS-2, MOSS-TTSD dialogue)
  and converts them (Chatterbox VC, MeanVC2, Vevo2, Seed-VC), splits stems (BS-RoFormer), makes Foley from video
  (ControlFoley) and music (ACE-Step 1.5, Stable Audio 3).
- **Results of the last queue** (*read from the logs 2026-10-30*, `test-just-direct/logs/queue4.log`, `queue5.log`; the
  runs were 2026-10-27/28, the pictures and clips were not looked at again here):
  - The clean-build equivalence: built with the same toolchain, text-to-video from the patched and the clean sd.cpp is
    identical (PSNR inf); picture-to-video differs (PSNR 32.8 dB). So the patch leaves text-to-video alone and does
    change picture-to-video's output; whether that change can be seen is not recorded.
  - MiniMax-H3, 5 s at 480p: `generate_video` 376 s (text 15.6, sampling 307, decode 40.9), card 7,024 MB, process
    25.5 GB, lowest available RAM 5.13 GB. A smaller run (`h3-small`): 120 s. Ref2VA at 480p left a clip
    (`h3-ref2va-480p.mp4`).
  - FLUX.3 klein ran after the 7.7 GB failure above: `id-flux3-{train,books,lamp}.png`, `id-sheet-2.png`,
    `k3-cafe-close.png` (20 s: text 1.9, sampling 14.2, decode 1.3).
- **Open:** the voice and long-take tests have no output in `out/` (`take.js` and `voice.ps1` exist); `ltx-talk.log`
  reached video decode and ends there with no output (was: "stops during model load"); Qwen-Image 2.1 in the stills sheet not checked.

## I · Fork or write our own (*web and code, 2026-10-30*; the answer here is a rec, not a decision)

The user, 2026-10-30: "we can fork it, the question is should we. it is not our quasar app, but that can be ok i mean
if the advantages of forking the rust version of it and adding our local llm to it and adding and improving on it vs
writing our own, i am not sure, i like keeping our family and controling our own but i also dont like duplicating work
if we dont feel it is worth it".

- **ArtCraft today** (GitHub API): 37,818 stars, 5,965 forks, MIT or Apache-2.0, 593 open issues. `main`'s last feature
  commit is 2026-10-11; everything after it is CI. The last release is `artcraft-v0.41.0`, 2026-09-26. None of the 25
  most recently updated pull requests is merged, and the 12 most recently merged came from four team logins. Every
  other Craft app was pushed 2026-10-30, so the team's work is there.
- **The Rust version** (`artcraft-native`, its README and Cargo.toml): 47 `.rs` files, 594 KB, egui. "Create Image,
  Create Video and Create Audio are fully built. The other tools show a 'coming soon' page that links to the same tool
  in the web app." **No canvas, no 3D stage, no video editor, no storyboard in Rust.** Generation goes through ArtCraft's
  hosted OmniGen; the model list comes from that server; sign-in is required; "Provider choice (Midjourney direct, fal)
  … Done (images; video runs on ArtCraft)", so own-key video isn't in it. By area: `backend` 129 KB and `models.rs` 32 KB
  (the hosted side), `pages` 105, `prompt_box` 84, `overlays` 60, `ui` 54, `feed` 51, `app.rs` 38, `shell.rs` 18. It landed
  as four PRs merged within 20 hours, 18,372 added lines (#2067, #2068, #2079, #2115; the dates show when they merged,
  not when the writing began).
- **Where ArtCraft's value is**: TypeScript/React — video editor 2.0 MB, app 1.1 MB, 3D stage 838 KB, moodboard 305 KB,
  2D draw 258 KB (source sizes from the git tree). Those sit on Konva, Three.js, mediabunny and opencut-wasm (§A).
  The Rust side: hosted client 3.4 MB, fal client 1.8 MB, Tauri app 1.1 MB. PhotoCraft's rule is "Never add Tauri (or any
  webview/JS UI framework)", which may mean the React app stops being developed (my inference, nothing stated).
- **Local models upstream**: still none in ArtCraft. Code search: `llama` 0, `stable-diffusion` 0, `ollama` 0, `comfyui`
  7 (GitHub's index, default branch). Issues #968, #2225, #2152 are open; PR #2577 (U2-Netp background removal through
  tract-onnx) is open and would be the first. `craft-ai-integrations` ("first draft", Apache-2.0) is their shared layer;
  its `docs/STATUS.md`: generic image and video run through ComfyUI, "This does not make the generic ComfyUI image or
  video workflows live-tested"; built-in engines are SAM and matting; "The built-in recommended-models catalogue
  (`catalog.json`) is empty"; "No app imports the widgets"; no real hosted provider verified.
- **FilmCraft** (README, ROADMAP): MIT or Apache-2.0, 45 crates, ~343k lines of Rust, its own codecs, 650+ commands behind
  a CLI, a JSON control channel and an MCP server; takes FCP7 XML, AAF and OTIO; alpha, "Ready for real work ~56 %";
  Windows start-up crashes are its G4. A program a film app can hand a cut to, without forking it.
- **The kit a Rust fork can't reuse**: `packages/ui/src` 183 files, 1.6 MB, 81 Vue files at 1.0 MB — `LuModelCatalog` 117 KB,
  `QuickSetup` 75, `AiModelsArea` 70, `ConfigColumn` 50, `LuRuntimeTab` 41, `ProviderForm` 31, `AiStatusPanel` 25,
  `StoragePanel` 25. Measured against the 594 KB fork, that is the larger duplication. `packages/core/src` (2.1 MB of JS)
  would be reached over HTTP through the engine host, not imported.
- **Other open apps, the job is the same** (README via page summary, GitHub API; no code read):

| App | Stars, last push | Stack | Local | Licence label | Worth taking |
|---|---|---|---|---|---|
| Toonflow | 19,988, 10-27 | Vue 3 + TypeScript on Bun, Electrobun | ComfyUI, local LLMs; keys | MIT (README; older versions differ) | script → shots → character and scene assets → multi-reference video; a third refactor is under way; no timeline |
| huobao-drama | 16,800, 10-25 | Nuxt 3, Vue 3, Hono, Drizzle, better-sqlite3, Electron, Mastra | none, cloud only | CC BY-NC-SA 4.0 ("Commercial use is prohibited") | agent chain `script_rewriter` → `extractor` → `storyboard_breaker` → `prompt_generator`, `@name` references, FFmpeg assembly |
| ViMax | 12,805, 09-30 | Python | configurable | MIT | Director, Screenwriter, Producer roles; 2 keyframe candidates, a vision model picks one |
| Nomi | 618, 10-30 | Electron, React | ComfyUI; keys | AGPL-3.0 | one row per shot (prompt, first frame, model, duration), reference cards, timeline, 3D director, 24 MCP tools |
| OmniChar (was Inline Studio) | 571, 10-29 | Python engine | own engine: LTX-2.5, MiniMax H3, FLUX, Z-Image; LoRA training | GPL-3.0 | a portable `.char` file (references, identity fingerprint, wardrobe) |
| LTX Desktop | 2,190, 10-19 | Electron + Python (from its folders) | LTX 2.5 Fast | Apache-2.0 | its floor is 9 GiB of card with fp8, 15 GiB otherwise, else "Coming soon to your device" — it would not run on this 8 GB Turing card, where §G's route does |

  Not read past stars and licence: OpenMontage (73,360, AGPL-3.0, Python), AIComicBuilder (1,929, Apache-2.0, last push
  04-27), Openframe (135, AGPL-3.0), OpenCut (96,857, MIT, an editor). AI Movie Studio 2 and ComfyStudio need ComfyUI,
  which the user ruled out (§H).
- **Methods from the searches**: lock a style block, multi-angle sheets and approved stills before any motion; chain
  clips by re-feeding the tail; expect to select — one production kept 41 of 164 clips (invideo.io FAQ pages, a vendor's
  own figures, unverified); FilmWeaver (AAAI 2026, Tsinghua and Kuaishou), cache-guided multi-shot diffusion, a research
  model, open weights not checked.
- **Searches run**, the plain way:
  1. "best open source AI filmmaking app local models 2026" → Inline Studio, Nomi; the rest model listicles.
  2. "LTX Desktop open source local video editor github" → Lightricks' repo, its help pages, listings.
  3. "open source AI movie maker script to video storyboard consistent characters github 2026" → OpenStory, Openframe,
     SeeFactory, KupkaProd, AIComicBuilder, Shortify AI.
  4. "latest techniques AI film production pipeline agent director multi-shot consistency local" → invideo.io FAQ pages,
     FilmWeaver; nothing on local.
  5. "new ways to make AI short film locally desktop app ComfyUI alternative storyboard timeline open source" → AI Movie
     Studio 2, ComfyStudio, Companion for ComfyUI.
  Toonflow, huobao-drama, ViMax, OpenMontage and OpenCut were looked up by name from what I already knew. A gap in these
  searches is a gap in the searches: Chinese-language results and non-GitHub apps were barely covered.
- **First rec, WITHDRAWN 2026-10-30, see I.2 — it judged family fit and READMEs, not features and code:** don't fork;
  write JustDirect as our Quasar app on the kit, and take methods from the table. "Beside
  JustStage" is already decided (R20, just-stage TASKS.md:451, "go your rec all"). Attacks: (a) "you are duplicating ArtCraft" — what a fork keeps is the prompt box, feed and shell, under
  600 KB, while the kit's AI screens (1.0 MB of Vue) would be rewritten in egui, so the fork duplicates more; (b)
  "merging gets the upstream work" — the family's fork rule merges upstream before any work, and we would have removed
  the hosted backend every feature calls, so each merge lands on deleted code; (c) "fork the React app then" — it has the
  stage and editor, but brings a second UI stack, and the 3D stage is JustStage's job; (d) "Toonflow is Vue and MIT" —
  the strongest rival, but Bun and Electrobun instead of Node and Electron, no Quasar, a refactor under way and no
  timeline, so its method is worth more than its code; (e) what a fork would not save: a fal or Replicate route is a kit
  gap either way (no match in `packages/core/src`). **What flips it:** upstream shipping a real local path and the Rust
  app gaining the stage and editor.

### I.2 · What is worth using, from the code (*code, 2026-10-30: shallow clones read, nothing run*)

The user, 2026-10-30: "the point is to make film using ai with tools tools to manually adjust and edit"; "it does nto
have to be our family, the whole point is is it worth using something that already made with most features that is not
our family or using or family and starting from scracth but using these other apps as reference to get code and ideas
from"; "toonflow doesnt look like it has really much at all with what we want to do". So family fit is not a criterion
here. The test is what each app already does, and how hard our local engines are to plug in.

- **Toonflow is out.** A node canvas with a chat agent: no timeline (`timeline` in 2 files), 0 test files, clips
  download for editing elsewhere; 2.4 MB of app code plus node packages. Calling it "the strongest rival" above was
  wrong, and came from its star count and README.
- **Waoowaoo** (found by name search; 12.1k stars on a tracker, Next.js, MySQL): its README says solo-developed, early
  beta, text models need OpenRouter. Not cloned.
- **Nomi** (AGPL-3.0, older releases Apache-2.0; Electron, React 18, Tailwind 3, Zustand, React Flow, Vercel AI SDK):
  `src` 26 MB, 2,043 test files, PR #1389 merged 2026-10-30; one main author (6,658 contributions, the next 140).
  `generationCanvas` 8.3 MB, `ai` 1.3 MB, `timeline` 528 KB (clips, tracks, text track, transitions, shortcuts), 3D director,
  24 MCP tools, project = a plain folder, no account. The agent reads the canvas, splits the story into shots, makes
  keyframes and video and lays out the timeline, at three levels (ask each step, auto-edit, full auto). Reference cards
  lock a character or place. **Local: ComfyUI natively; any other server through Settings → Models → Custom API /
  gateway**, model type Text, Image or Video, video by "create and result/polling endpoints", with a custom request script
  where needed (`docs/guide/model-connection-en.md`). So our engines can connect without changing Nomi — not tested.
  Its gaps are in I.3 (was: "image editing found is crop only", from English-only searches of code commented in Chinese).
  "Next up: AI editing."
- **ArtCraft's full app**: 17 pages — Image, Video, Audio, Draw, Scene (3D), Moodboard, Storyboard (one 47 KB file),
  Video Editor, Angles, Background Change, Image to 3D Object and World, Remove Background, watermark removers, Frame
  Extractor; `inpaint` in 52 files. No AI flow: `screenplay` 0 files, `shot list` 0 files. `MainApp.tsx` mounts the login
  modal. Credential keys are `FalApiKey` and `ReplicateApiKey` plus web logins; `generate_video` providers are `artcraft`,
  `grok`, `sora2`. `lipsync` is only leftover API fields (`VideoApi.ts`, `Prompts.ts`), so §A's "not found" stands.
- **The two share a stack**: both are React, Zustand and Tailwind (AGENTS.md of each), and ArtCraft's code is MIT or
  Apache-2.0, so its Draw and inpaint pieces could move into Nomi with their notices. Not tried.
- **Searches added:**
  6. "open source alternative to ArtCraft LTX Studio AI film studio self hosted" → LTX Desktop; "no direct open-source
     competitor" (one source's claim about LTX Studio).
  7. "开源 AI 短剧 漫剧 制作 工作台 本地部署 分镜 角色一致性 时间线 2026" → Toonflow mirrors, OpenClaw, LocalMiniDrama; community posts,
     unverified; OpenClaw and LocalMiniDrama not checked.
  8. "best free AI video studio infinite canvas storyboard timeline open source github 2026" → Diffusion Studio (an
     editor), mostly proprietary tools.
  9. "waoowaoo open source AI film studio github" → its repos.
- **Second rec, replaced by I.3 (it came before the user's list and before any scene code was read):** Nomi is worth
  trying as the base; ArtCraft is not, except as code to take from; decide by one test, with no fork yet. Run Nomi on E:, connect the local engines through a small bridge and no change to Nomi, and make one
  3-shot scene with a locked character. Pass: the AI plans the shots, the face holds, the clips land on the timeline, an
  MP4 exports. If it fails, write our own with Nomi and ArtCraft as references (Nomi's code carries AGPL; its ideas don't).
  Attacks: (a) one main author and a fast pace make a long fork costly — **changed:** no fork first, and a fork only if
  the test shows Nomi itself must change; (b) unverified: Nomi's agent on a small local text model sharing an 8 GB card
  with video, and 7-minute jobs through a custom provider — that is why the test comes first; (c) AGPL is a label, and our
  apps are open source; (d) TypeScript and React are outside the family stack, which the user set aside for this question.

### I.3 · The confirmed list, checked in the source (*code, 2026-10-30: read file by file, nothing run*)

The user, 2026-10-30: "but niamo it looks like you have little other control, can you make scene and make ai use scene we
need both ai to do it and user needs full control as well, verify what niami does, i dont think you understand what we are
building"; then on the list below: "yes your list is correct, however juststage is not the only option to make scene it
may not even be necessary, we should be able to describe to ai to make scene or prop or whatever we want save the prop
images and scense ect and resue as we create new clips for consistancy, i am not even sure what we weould need just stage
for yet. What do you think? I want ai to be able to do most of the work but of course the user does need to be able to
modify things then ai pickup after user adjust things".

**What we are building (approved, item 7 changed by the user's words above):**
1. AI and the user work on the same film: AI can handle story, shots, camera, lighting and the cut; the user can take over
   any step by hand, and AI continues from that change. Includes a Seedance-style option: a prompt and references give a
   multi-shot sequence.
2. The scene is the centre: the user or AI builds it, either can edit it, and AI generates the shots from it.
3. The film stays consistent: same actors and sets across shots, longer takes, voices, lip-sync. AI makes scenes, props and
   the rest from a description; they are saved and reused in new clips.
4. Full manual tools: everything ArtCraft has.
5. Every feature runs local or cloud and the user chooses: local free, cloud on the user's key, no account, no ComfyUI or
   Python.
6. It runs on the 8 GB card: 5 s of 720p in about 5–6 minutes.
7. JustStage is optional, "may not even be necessary": nothing in JustDirect waits on it.

**Nomi, from its source:**
- Scene (`nodes/director/model/directorTypes.ts`): a project holds several scenes; each holds characters (rigs: mixamo, ue4,
  ual), imported models, Gaussian splats, groups and primitives; cameras (lens, follow and look-at rigs, paths, closeups);
  directional, point and spot lights with colour, intensity and shadows; panorama, sky, ground; a timeline of paths, action
  clips, bone keyframes and look-at clips. `director/` is 238 files, 1.6 MB, 98 test files. Its own audit
  (`docs/audit/2026-09-07-director-functional-interaction-audit.md`) records real-window runs of the hand tools: IK/FK, crowd,
  phone camera, PNG and H.264 MP4 output, saved and reopened.
- AI builds a scene (`electron/shared/director/directorPlanSchema.ts`, tool `stage_shot`): environment (day, night, studio),
  template (street, room, courtyard, product_stage), set pieces, actors, blocking verbs (walk_to, run_to, turn_to, chase…),
  shots with size, angle, height and camera move. It compiles to a gray 3D blockout, not a finished set.
- AI continues after the user (`agent/applyDirectorWrite.ts`, `model/directorPatchNotes.ts`): an edit recompiles the plan and
  re-applies the user's hand changes by stable id. A hand change AI directly overwrote is dropped and named ("your tweak on
  shot 2"), and undo restores it. Before writing, AI reads the current state and passes its revision; a stale one is refused
  (`look_at_canvas`, `read_timeline`).
- **Gap:** AI can't edit a scene built by hand: `patchPlan` refuses "has no 3D-BOX plan … create a new preview"
  (`applyDirectorWrite.ts:221-223`), and `look_at_canvas` gives a scene summary only when a plan exists
  (`canvasRead.ts:289-293`). A hand-built scene can still drive a generation: `requestDirectorPreviewRender` takes a
  `manual:` revision.
- Scene → video (`agent/attachCameraMoveToTarget.ts`): the gray preview (24 fps, at most 10 s, 720p) is attached as a reference
  video with the line "follow this reference video's camera movement (camera movement only; picture content comes from the
  character references and the text)". A model with no reference-video slot gets a text description and a low-accuracy
  warning. Layout for stills goes through a staging picture on `composition_ref`. Captures are plain colour renders, with no
  depth or pose pass (`scene/capture/directorCapture.ts`).
- Saved references (`canvasModelShapes.ts` `storyboardAnchorSchema`): anchors of kind character, scene, prop or style, each
  with a name, a description, a carrier (reference image or text) and a scope (every shot or named shots). AI makes them through
  `draft_shots`; shots name them by `anchorIds`. Reuse across separate projects: not verified.
- AI tools (`verbs/writeVerbs.ts`): `write_script`, `draft_shots`, `generate`, `stage_shot`, `edit_timeline` (move, remove,
  split, trim, source-window, ripple, transition, text, audio), `export_video`, `undo`.
- Hand tools outside 3D: a drawing board (`nodes/whiteboard/`, 264 KB), background removal (`src/lib/removeBackground.ts`),
  crop. No paint-a-mask repaint in the UI: `局部重绘|蒙版|maskUrl|mask_url|inpaint|MaskEditor` in `src/workbench` hits one regex.
- Audio: text-to-speech and transcription as synchronous OpenAI-shaped calls (`electron/audioTaskRunner.ts`); voices and
  music through providers. **Lip-sync: its handbook says "Not supported yet."**
- Its own open debt (`docs/engineering/director-3dbox-debt.md`, due 2026-11-15): a real model running one sentence → preview →
  attached video → confirm card has no receipt yet; the 10 s preview cap; real Windows walkthroughs.

**ArtCraft's full app, from its source:**
- AI generation is what the app is for, on hosted and paid models (Seedance, Kling, Veo and the rest). What it lacks is an AI
  agent that plans and runs the steps: `\bagent\b` 0 files, auto-generate 0, batch-generate 0. `Storyboard.tsx` (47 KB) takes
  uploads and sketches, and "Director notes" is a text field. Its site: "Compose the shot yourself — then let the model render it."
- Scene (`libs/components/pagescene`, 782 KB): objects, GLB and PMX characters, shapes, splats, FK posing, focal length, point
  lights added as shapes, a keyframe timeline, record to MP4 or WebM (`engine/recording/TimelineRecorder.ts`).
- Scene → AI: one snapshot image into `GenerateImage` (`scene_image_media_token`, `useTauriPageSceneAdapter.tsx:172-186`). Stills
  only. Saving and loading a scene goes to `/v1/media_files/upload/new_scene` on their server.
- Hand tools: real mask inpaint (`EnqueueImageInpaint`, `mask_image_raw_bytes`), Draw, Moodboard, Video Editor (2 MB).
- Server ties: omni generation refuses without login, "You need to be logged into ArtCraft." (`omni/dispatch.rs:43-48`);
  characters at `/v1/character/*`; hosted media library; 18 of 52 page files use the hosted API. The tool libraries barely
  touch it (hosted-API files: Moodboard 0 of 66, Video Editor 2 of 505, Draw 3 of 32, Scene 4 of 201), and each page reaches its
  host through an adapter (`PageSceneAdapter`, `PageDrawAdapter`), which is a clean place to swap in a local one.
- `artcraft-services` (Rust 17.7 MB, TS 8.7 MB): accounts, billing, MySQL, Redis, Elasticsearch, object storage, under "ArtCraft
  License (WIP)", which bars a competing product. Its commits since 10-10 are website, release and Kinovi/Suno work, so the
  app has had no new features since 10-11. A local fork needs none of it.
- `artcraftx` has no licence; code search found no agent or storyboard feature, only `user-agent` strings and client endpoints.

**Local video guided by a scene, the part that decides the 3D route** (*code + docs*, `E:\Dev\Web\stable-diffusion.cpp`):
- **LTX takes references; our engine doesn't pass them yet** (was: "LTX: first and last frame only", which described sd.cpp, not
  LTX; the user: "i am sure ltx does take ref"). Lightricks' pipelines (github.com/Lightricks/LTX-2, `packages/ltx-pipelines/docs/`):
  `ICLoraPipeline` conditions on a whole reference video (`--video-conditioning guide.mp4`, with an IC-LoRA, distilled checkpoint,
  guide on stage 1 by default), keyframe images at any frame (`ImageGuide`), audio-to-video, retake, Dub-It. sd.cpp at master has
  first and last frame only: `video.cpp:782` "LTXAV control_frames are not implemented"; A2V is open PR #1676.
- Open LTX weights on Hugging Face, LTX community licence, several gated (accept the terms first):
  - **Layout-To-Render** (LTX-2.5, 1,248 MB): a layout clip ("a 3D viewport animation or playblast", clay or "a blocky animation of
    simple shapes") plus one keyframe gives a video that "moves like the layout and looks like that first frame", keeping camera
    path and object placement. Do not use the gray frame as the keyframe: make it with an image model from the clay's first
    frame. Stage 1 960×544 × 8 steps, stage 2 1920×1088 × 3; a mid and last keyframe hold the look.
  - **Ingredients** (LTX-2.3 and 2.5, 1,248 MB): one reference sheet of the cast, props and location on black, no text; a character is
    a face close-up plus a body turnaround. Looped as a static video at output size, at least 121 frames; "only reproduces elements
    present on the sheet". Trained at 768×448, 121 frames, 24 fps; strength 1.4, 30 steps, guidance 4.0.
  - **Union Control** (LTX-2.3, 624 MB): canny, depth and pose; the reference is half the output size, so it costs fewer tokens.
  - **Dub-It** (LTX-2.3, 2,352 MB): lip dubbing from a reference video and audio. A lip-sync candidate. Reference at full output size.
  - Also Relight, In-Outpainting, Clean-Plate, Day-To-Night, Motion-Track-Control; LTX-2 19B camera LoRAs (dolly, jib, static).
- All of those are one engine feature: an IC-LoRA guide. Lightricks' docs say video conditioning uses `VideoConditionByKeyframeIndex`,
  and sd.cpp already has that shape, `apply_video_condition_by_keyframe_index` (`video.cpp:802`), which takes multi-frame latents.
  Not checked: sd.cpp loading these LoRAs, and the half-size reference path. Not measured: any of them on 8 GB, and LTX-2.5 on this PC
  at all. A guide adds tokens to the stage it runs on.
- **MiniMax-H3 Ref2VA has a reference-video input** (`docs/minimax_h3.md`): `--ref-image`, `--ref-video`, `--ref-audio`, each
  repeatable; a video's 24 fps latents condition the transformer. sd-server took `ref_videos` on 2026-10-25 (#2194), and H3 got
  faster on 10-29 (#2240). Measured here at 480p with no reference video: 376 s (§H). Never tried with a gray preview. Ref2VA
  can't combine with first or last frames.
- Wan VACE is in sd.cpp (`vace_context`), but 14B ran out of card memory at 720p (§E). A Reddit comment says 1.3B may fit 8 GB;
  guides conflict on 8 vs 16 GB.
- Camera-control research on Wan bases, no head-to-head and not checked: TriMotion (ECCV 2026, takes a pose path), CamCloneMaster,
  CameraNoise, FlashMotion.
- The picture route needs none of this: saved references → a keyframe (FLUX.2 klein `-r`, 20 s) → LTX picture-to-video (407 s),
  both measured in §H.

**Seedance** (*web, third-party pages, no official docs*): up to 6 shots in one pass, each with its own prompt and duration, plus a
character photo, a clip for camera movement and audio for pacing. "Seedance Studio" (tryseedance.ai) is an independent app. The local
equivalent to try is H3 Ref2VA; multi-shot in one prompt not tested.

**Searches added:**
10. "Seedance app how it works agent one prompt multi-shot film workflow 2026" → third-party guides; a 2.0 vs 2.5 conflict.
11. "ArtCraft AI agent auto storyboard script to video features review 2026" → one Feedbagel article; no agent found.
12. "LTX-2 depth pose canny control video guide 3D blockout to video workflow" → RunComfy and Comfy workflow pages.
13. "latest techniques 3D blockout to AI video local depth control Wan VACE low VRAM 8GB 2026" → VACE guides, WanGP, conflicting VRAM.
14. "best way to keep camera and layout from 3D scene in AI video open source model reference video control 2026" → TriMotion,
    CamCloneMaster, CameraNoise, FlashMotion, Adobe LooseControlVideo.

**The rec: start from Nomi alone, use ArtCraft only for ideas, keep JustStage out, and prove it with one test on Nomi unchanged.**
(was: "move ArtCraft's hand tools into it"; the user: "we have various mix of systems, sounds like a mess to me". Correct: ArtCraft's
Draw is Konva on React 18.3.1 and Three.js 0.171; Nomi's board is Leafer on React 19.3 and Three.js 0.184, so that move would mean two
drawing engines in one app. Nomi knows `mask_url` but strips or refuses it because the UI has no mask control (`modelArchetypes/gptImage2.ts`;
was: "already sends" it, wrong). sd-server takes `mask_image`, so the gap is a mask brush on Nomi's own board. That leaves one app, with our engines behind it as a
local service, connected like any provider.)
The main route is the user's: AI makes saved cards → keyframes → clips, already measured here. A 3D scene is the optional precise
route. Attacks: (a) it is read, not run, and Nomi's own debt list has no real-model receipt — so the test comes first, and writing
our own stays the fallback; (b) ArtCraft plus local, the user's idea, works per tool through its adapters, but leaves requirement 1
to build: Nomi's director, AI and agent layers are about 3.9 MB; (c) one main author moving
fast, and the fork rule merges upstream before each work session — **changed:** no fork for the test, later changes kept in
their own folders, and offered upstream (no CLA); (d) lip-sync and voice are gaps with every base; (e) AI can't edit hand-built
3D scenes, a gap to close in Nomi or accept for now, while the card route isn't affected; (f) AGPL is a label.

### I.4 · Every film tool in both apps (*2026-10-30: both full apps read, and ArtCraft used live*)

The user: "what tools does artcraft already have built that users use besides the ai, it looks like it has a lot if soo then we are
just adding scene managment vs making all other tools to niomi, i am not sure what each really use in fimle making from ai to manual
editing". Then: "why dont you actually look at it, see how it works looke how they make films".

Full lists with file and line for every tool, Stub and Dead rows included:
[`2026-10-30-artcraft-tool-inventory.md`](2026-10-30-artcraft-tool-inventory.md) (with what the running app showed) and
[`2026-10-30-nomi-tool-inventory.md`](2026-10-30-nomi-tool-inventory.md). Read from source and, for ArtCraft, seen live. Nomi has not been
run. Re-checked by hand: ArtCraft's login with no dismiss control, `PromptBox3D` unmounted, Blur the only effect, no transition code, no
caller for `openProject`, imports uploaded; Nomi's three fixed tracks, the manifest's "not first-class" warning, `mask_url` stripped.

| Stage | ArtCraft desktop | Nomi 0.24 | Ahead |
|---|---|---|---|
| Story and script | nothing | script editor, AI writing, script to shots | Nomi |
| Saved cast, sets, props | Characters only, one image, Seedance 2.0 only, hosted | cards for character, scene, prop, style, a look lock, per plan; no library across projects | Nomi |
| Moodboard | real tool, beta, local only, no export | none | ArtCraft |
| Shot planning | Storyboard behind an easter egg, lost on close | shot table: model, mode and references per shot, locks, variants, batches, duration rules | Nomi |
| 3D staging by hand | FK only, one point light with fixed intensity, single camera, 30 fps keyframes and animation clips | IK and FK, 44 poses, 13 camera presets, 8 lenses, 3 light types, paths, close-up rig, recorded camera, phone camera, splats, 60 s timeline | Nomi |
| Scene to AI | Capture a still, then Make Video; Record is 720p, silent, via the library; no prompt on the stage (`PromptBox3D` unmounted) | AI builds or edits the scene; gray preview attaches as a reference video; output to 4K | Nomi |
| Image editing | Konva canvas, mask inpaint, Angles; canvas has no save without AI | sketch board, crop, rotate, grid split, local background removal, upscale and outpaint through models; no inpaint | ArtCraft |
| Video generation | keyframe and Omni Reference modes | the same modes, plus batches, a local depth reference, ComfyUI, custom providers | Nomi |
| Audio | Suno music and sounds; no voice tool | voice, cloning (one route), music, sounds, cloud and local transcription | Nomi |
| 3D generation | image to object, image to world | text or image to GLB; no wire into the Director | ArtCraft |
| Timeline editing | OpenCut port: many tracks, per-parameter keyframes, graph editor, 9 mask types, 17 blend modes, speed, detach audio, cut, ripple. No transitions, no colour, one effect. Desktop can't reopen a project; imports upload to their server | 3 fixed tracks and a text lane, trim, one-track ripple, dissolve and fade, fixed-style text. No keyframes, effects, colour, speed or masks; audio can't overlap | ArtCraft |
| Post | frame extractor; BG Change is web only; captions a stub | frame capture, node trim, scene-cut detection, depth pass; SRT to clipboard | Nomi |
| Export | MP4 or WebM, quality presets, canvas size | MP4 only, 720p or 1080p | ArtCraft |
| Project | no film project; each tool saves differently; good library, but hosted | a local project folder, autosave, versions on every shot | Nomi |

Corrections to earlier lines in this file: own keys in ArtCraft are effectively a Midjourney or Grok login, since no UI writes a fal key
(was: "fal and Replicate"). Nomi's saved cards live in one plan, not across projects. Its "AI arrange" is a sort by shot number; real AI
editing is the agent's `edit_timeline`. ArtCraft's site says the AI generates from the scene, but the stage has no prompt box in this build.

**The rec stands, and is closer than it read: start from Nomi; its timeline is the largest job.**
- "Just adding scene management to ArtCraft" doesn't hold. ArtCraft would need script, shot planning, saved sets and props, voice, an
  AI that plans and acts, stronger staging, a film project, local engines, and login, library and scene saving moved off its server.
- Nomi would need a real timeline or a hand-off to one, a mask brush, a fuller image canvas, a moodboard if wanted, lip-sync, local engines.
- Attacks: (a) the gap in the timeline is real, and a hand-editing filmmaker will feel it first — **changed:** name it as the biggest job, and
  plan an OTIO or FCPXML export to FilmCraft or Resolve as the cheap first step (neither app exports one; not built); (b) Nomi's main work
  surface, Storyboard, is off the top bar, and its UI hasn't been judged — the user's own trial decides that; (c) writing our own stays
  the fallback, with both apps as reference.

### I.5 · Decision: start from Nomi (2026-10-30)

The user, verbatim: "i am ok with niamo and users can just download the prebuilt image and video tools from artcraft like film i dont
think the are integrated into the artcraft software itself, we can add anythingh we need to niamo".

Checked: FilmCraft and PhotoCraft are separate Rust apps (MIT or Apache-2.0), installed through the Craft launcher or on their own, not part of
ArtCraft's code. Nomi 0.24.0 (`package.json`): TypeScript 5.6, 2,363 `.ts` and 660 `.tsx` files, 21 MB without tests; Electron 43, Node 22.19 or
later, pnpm, Vite 7, React 19, Tailwind 3, Mantine 8, Zustand, React Flow, Three.js 0.184 with React Three Fiber, Spark, Leafer, Tiptap,
ffmpeg, vitest, Playwright; agent on pi-agent-core and Mastra; AGPL-3.0-only. No database import found in `electron/`: projects are files in folders.
Still open: a go for the AI test; writing TypeScript inside Nomi differs from the family's JavaScript-only rule, so it is named to the user.

**Reopened the same day.** The user: "should we wwrite it in oor family with quasar add just reimplamnet featuresw we want?" Measured
(screen and server code, no tests or assets): the Nomi parts on the wanted list are 5.4 MB — Director 1.55, script and storyboard 0.71, agent
1.69, timeline, preview and export 0.70, providers and model profiles 1.70; the node canvas adds 3.54. JustVoice is 3.6 MB and JustWrite
10.9 MB (not checked how much of that is data); the kit is 3.5 MB. Vue versions of Nomi's main libraries exist: `@vue-flow/core`, `@tiptap/vue-3`,
`@tresjs/core`; Three.js and Leafer aren't tied to React. Nomi took about six months (created 2026-05-04, 6,658 commits by its main author).
Rec, awaiting the user's word: a Quasar app on the kit, written from behaviour without copying Nomi's AGPL code, in stages: saved
cards, shots, clips, simple assembly, then 3D later. Attacks: it is slower than Nomi, it loses about 20 ready providers (a kit gap), and
the user tests more — **changed:** keep Nomi as a working reference and run the AI test on it first, since it proves the method for either route.
FilmCraft and PhotoCraft stay separate downloads either way.

## J · Decided: family app, and local proof comes first (2026-10-30)

The user, verbatim: "the main things is that we want this as a local ai with option for paid, we really just need to continue our testing to
prove that each ai feature we want we can actually run well on this machine, so we need to contine testing and looking at latest techniques
models methods until we can get it working well, what do you think? yes we can write it in our family but we need to prove local ai can do it
all well before we wrtie the actaul app".

So: no app code until this list is green. Nomi stays a reference. Before each test, plain searches for the latest methods, logged here.

| # | Feature | State on this PC | Next |
|---|---|---|---|
| 1 | Current engine | `jd` is 25 commits behind sd.cpp master, including H3 speed-ups; `ltxv.hpp` changed upstream, so our patch must be re-fitted | Merge, rebuild, re-run the LTX clip as a baseline |
| 2 | 5 s 720p video | Proven: LTX-2.3, 410 s, user: "that is much better quality" | Baseline only |
| 3 | Picture to video | 407 s with our patch; patch changes output (32.8 dB), visibility unchecked | Compare by eye |
| 4 | Saved actor across shots | FLUX.2 klein `-r` 20 s, one woman held across three scenes | Cast, set and prop together in one keyframe |
| 5 | Talking with lip-sync | Not proven. Plan: LTX speaks with its own lips, audio.cpp swaps the voice (`voice.ps1`); `ltx-talk` never finished | Finish it. Dub-It is the fallback |
| 6 | Longer takes | Not proven: `take.js` has no output | Run a chain and judge the seams |
| 7 | AI plans the film | Never tested: no local tool-call or shot-plan run in the register | Local LLM turns a story into shots and cards |
| 8 | AI edits after the user | Depends on 7 | Change a shot by hand, then have the plan revised |
| 9 | Stronger consistency | LTX Ingredients exists, sd.cpp can't run it | Add the IC-LoRA guide to sd.cpp, then measure on 8 GB |
| 10 | AI uses a 3D scene | Layout-To-Render needs LTX-2.5, never run here; H3 takes a reference video, untried | Measure LTX-2.5, then a gray-clip test |
| 11 | Music and sound effects | Not measured on this PC | ACE-Step and sound effects through audio.cpp |

Cloud is left to the end: paid models need no proof that they run. Replaces the Nomi AI test: item 7 proves the same risk directly, with no bridge.

The user, on what "well" means and on Nomi's extras: "the other stuff i dont know about the skills and other features not sure what they do but not
a priority and time is not priourity". So quality is the bar, judged by the user's eye. Times are recorded, not pass or fail. Nomi's skills and similar
extras are out of scope for now.

The user, on who it is for: "we want it to work on my specs but also different machines better specs as well this is not just for me it is for
anyone". So 8 GB is the floor, not the target: each feature needs a working option there and a better option per tier on stronger machines.

**Plain searches, 2026-10-30** (the user: "you dont do good broad but simple research"; web, mostly vendor and SEO pages, so names to check, not rankings):
1. "latest techniques for consistent characters in AI video" → lock the look in stills first; reference sheets (front, back, full body); short clips stitched
   together; same light and camera distance; log drift and fix the sheet. Matches items 4 and 9.
2. "best open source AI video models 2026" → Wan, LTX-2.3, HunyuanVideo, CogVideoX, Mochi 1, Open-Sora, SVD. Nothing new for us.
3. "best AI video model for 8GB VRAM" → LTX-2.3 GGUF is the 8 GB pick; Wan 2.2 and HunyuanVideo 1.5 start at 16 GB. Agrees with §E–§G. No independent benchmark.
4. "best open source lip sync 2026" → LatentSync, MuseTalk, Sonic, LivePortrait, DreamTalk, Wav2Lip, SadTalker. Sonic and LivePortrait are new to this file.
5. "how to make longer AI videos new ways" → LTX: extend forward, bridge two clips with keyframes, retake a bad part. invideo ranks reference-to-video chaining first,
   then extend, then last-frame-as-first-frame, which is what `take.js` does. So item 6 starts with the method ranked lowest.
6. "best open source image models 2026" → FLUX.2, Qwen-Image 2.0, SD 3.5, Sana (sharp on 8 GB), HunyuanImage 3.0. Qwen-Image 2.0 and Sana to compare in item 4.
7. "best local LLM for tool calling 2026" → Qwen3 7B on 8 GB (one guide), Qwen 3.6 27B, Mistral Small 3.1. No standard benchmark. Candidates for item 7, on llama.cpp.
8. "best open source AI music generator 2026" → MusicGen in AudioCraft, Stable Audio; ACE-Step did not appear here but is already in §B.
9. "open source AI sound effects generator 2026" → AudioGen in AudioCraft; commercial tools otherwise.
Not checked yet: whether Sonic, LivePortrait, Sana and AudioCraft have a runtime without Python. A gap in these searches is a gap in the searches.

### J.1 · The verified round (*2026-10-30: six researchers read code and checked weights; nothing was run, every 8 GB outlook is reasoning*)

The user: "check code find that latest best tecniques and verify them its useless just to list them if you cant actually reproduce them, test them, verify
someones claims". Each report has ranked candidates, the best per hardware tier, exact tests, what could not be verified, and its query log:
[consistency](2026-10-30-just-direct-research-consistency.md) · [talking](2026-10-30-just-direct-research-talking.md) ·
[long takes](2026-10-30-just-direct-research-longtake.md) · [scene](2026-10-30-just-direct-research-scene.md) ·
[images](2026-10-30-just-direct-research-images.md) · [planner and audio](2026-10-30-just-direct-research-planner-audio.md).
Known gap in all six: Reddit was blocked, so user reports are second-hand. Re-checked by hand: `ic_lora.py` uses `VideoConditionByReferenceLatent`;
`fal/LTX-2.3-3DREAL-LoRA` exists, ungated; `ltx-talk.log` reached decode; the audio.cpp source has LatentSync; sd.cpp's latest build is master-1028.

| # | Feature | What changed | Best next test |
|---|---|---|---|
| 4 | Keyframes | Cast, set and prop together never run; FLUX 3 needs BFL's caption step and a newer build; `--mask` can lock the set | klein 4B with three references, then a set lock (no code, on disk) |
| 5 | Talking | Voice first: TTS, then the model draws the mouth from it. `voice.ps1` drops to fourth | H3 `fully_copy` at 480p (no code); LTX A2V needs a small sd.cpp addition and a fix PR #1676 lacks |
| 6 | Long takes | `take.js` ranks 13th of 18. Nothing past 121 frames has been tried | One longer pass, 193 to 361 frames (no code); then latent carry windows, Lightricks' `chunks` |
| 7 | Planning | Only `response_format` forces a schema; `tools` can't on Gemma 4, and `required` doesn't force a call on Qwen | Three-pass plan with runtime enums (NOT STANDARD); Gemma 4 is on disk |
| 9 | Consistency | Ingredients guide runs on the half-size stage; recipes disagree, reports mixed | Test across three shots first, then the sd.cpp guide |
| 10 | Scene | 3DREAL on LTX-2.3 is the 8 GB pick; Layout-To-Render's recipe prices 15 GiB, so 16 GB and up | Needs the sd.cpp guide; H3 and Wan VACE 1.3B baselines need no code |
| 11 | Audio | audio.cpp has no CPU offload, so ACE-Step's "<4 GB" doesn't carry over; BF16 is slow on Turing | Stable Audio 3 Medium Q8, then ACE-Step Turbo Q8 |

### J.2 · The no-code tests (*measured, 2026-10-30, this PC; frames viewed by Claude, clips not yet judged by the user*)

The user: "go on the engine work after the no-code tests your rec all go". Scripts: `test-just-direct/queue6.ps1`, `queue7.ps1`, `queue8.ps1`; logs beside them.

- **Cast, set and prop in one keyframe works on FLUX.2 klein 4B Q8 (`jd` build).** Three `-r` at 1280×704: 45–49 s, card 7.1–7.2 GB, 14.9 GB RAM; small references
  (`vae_input_max_pixels=262144`) 20 s, card 6.7 GB, as good by eye. Hair, jacket and strap hold; freckles come out lighter than the reference; one seed added a watch; notebook
  colour and clasp hold, the compass usually hidden; table and plant move between seeds.
- **Set lock works.** `-i set --mask --strength 1 -r set -r actor -r prop`: 47 s, no visible seam, table, plant and lamps fixed; 33.3–36.2 dB against the set outside the mask.
- **Three shots in a row work.** Keyframes, then LTX picture-to-video on `jd`: 388–391 s a clip, identity holds across the shots and inside each clip at frames 0, 60, 120. A
  background car changed inside clip 1. `out/seq-joined.mp4`.
- **The longer pass failed at 720p.** LTX 193 frames: stage 1 ran, stage 2 failed: "need 3663.85 MB device / 3497.18 MB budget"; 241 frames: need 4408.30 MB. The report's "241 to 361 may
  fit" was wrong. Nothing past 121 frames has completed. Stage 1 is not the limit.
- **Voice first on H3 ran with no engine work.** Qwen3-TTS VoiceDesign line 3.28 s, then H3 Ref2VA with `fully_copy` at 864×480 × 90 frames: 268 s, face strong, mouth moving. Sync and
  whether H3 kept the audio are for the user to judge. `out/h3-lipsync-41.mp4`, `-42.mp4` (the real wav is muxed on).

### J.3 · Engine work, first round (*measured, 2026-10-30*; `jd` merged to master-1028, clean merge, `E:\Dev\Web\stable-diffusion.cpp`)

- **Baseline on the new engine:** the seq1 clip ran 390 s (`nb-seq1`), the same as before. Old build kept in `build-jd-1004`.
- **The longer pass is worse on the new engine.** 145 frames: stage 1 ran, stage 2 failed, "need 3671.85 MB device / 2910.29 MB budget". The old build failed at 193 frames, 166 MB short. Stage 1 is never the limit.
- **IC-LoRA guide, factor 1, in `src/pipeline/video.cpp`:** `--control-video <dir>` now works on LTX; guide frames share the target's time positions, sit at mask 0, are cropped
  with the LoRA cleared before the upscaler. A still is held for the whole clip, so an Ingredients sheet needs no extra step. NOT STANDARD until upstream takes it.
- **First run, 3DREAL Strong v2 on a gray Blender blockout (`blockout.py`, `out/gray1`), 1280×704 × 121:** LoRA loaded, guide encoded, stage 1, upscale and stage 2 (147.68 s) and audio decode all
  finished on 8 GB. Claude Code then stopped the job during video decode because the system was critically low on memory. No clip yet. `ltx-talk` stopped at the same step on 2026-10-28.
  Fix to try: `--params-backend diffusion=disk` (§G: held 11.5 GB free, about 20 % slower).
- **Second run, same test with `--params-backend diffusion=disk` (2026-10-31, `queue10.ps1`): the first finished clip driven by a 3D scene on 8 GB.** `out/gray1-3dreal-disk.webm`, 1280×704 × 121:
  647.6 s (stage 1 367 s, stage 2 163 s, decode 37 s), card 6.66 GB, lowest free RAM 9.33 GB. The run shows the guide works: camera move, room layout, table, chair, lamps and the walk all follow the
  blockout, and the blocky figure becomes a believable red-haired woman in a black jacket across frames 0, 60 and 120 (viewed by Claude). **It is not yet a café:** the walls, floor, table and chair stay gray, with a
  concrete texture and no warm light, despite the prompt. 3DREAL keeps the input's colours, so a gray scene gives a gray room. Next to try: a coloured scene, or a keyframe for the look (`-i`) on top of the guide.
- **Audio-to-video written into `jd` (2026-10-31), from PR #1676 and checked against Lightricks' source, which caught three faults:** (1) the PR pads the mel on the left only; Lightricks uses
  `center=True, pad_mode="reflect"` (`ltx_core/model/audio_vae/ops.py:29-30`), so the PR's audio sits about 22 ms early; (2) the PR resamples linearly, Lightricks with torchaudio's windowed sinc
  (`ops.py:40`); (3) our plan's "set `audio_timesteps_tensor` to 0" is wrong: that tensor also feeds the prompt and gate AdaLNs, which keep sigma (`transformer_args.py:304-305,433`), so only the audio lane's AdaLN and its
  cross-attention scale-shift get 0 (`:427`). It uses the existing `--audio` flag and `ref_audios`, the way Wan S2V drives video, instead of a new `--init-audio`. Committed `cf4af3a`.
- **Audio round trip (`queue11.ps1`, `audiocheck.js`):** the voice line through the new encoder and back through the decoder matches the original at r = 0.988 on log-spectrograms. Encode takes 0.30 s. The decoded copy is 22.5 ms
  early, under one video frame. The clip keeps the original wav, and the encoder input matches Lightricks', so this shift doesn't reach the clip.
- **First A2V clip fails on sync (`queue12.ps1 41`, `out/a2v-41.mp4`):** 1280×704 × 81 with the keyframe and the designed voice: 404.8 s, card 6.89 GB, lowest free RAM 9.33 GB, face and voice hold. But the voice starts at frame 0 while the
  mouth stays in the keyframe's closed smile until about frame 24, stays parted through the pause at frames 30–45, and barely moves after that. One seed, the "voice-over narrator" failure. Likely cause, from Lightricks' code: their A2V stage 1
  runs with `modality_scale=3.0` (`constants.py`, "improve audio-visual sync" in `multimodal-guidance.md`), an extra pass per step without the audio-video cross-attention. We ran distilled at CFG 1, so the model's sync guidance never ran.
  Neither PR #1676 nor our plan had it. Now added as `--modality-scale`, stage 1 only, with their rescale of 0.7. Built, not committed, not yet proven: the first run (`queue12.ps1 3 41`) was stopped by Claude Code's
  low-memory reaper at 11:33:24 on 2026-10-31, 9 s after it started, with only the text encoder's 7 GB loaded and no sampling done, so the guidance never ran. The cause isn't recorded and doesn't look like this run's own
  memory: the same clip without guidance held 9.33 GB free, and 21.9 GB was free once it had stopped. The JustStage round had finished just before it.

Corrections: klein 4B LoRA needs 12 GB per BFL (was 24). LatentSync is 9,144 MiB in audio.cpp (18 GB is Python). MuseTalk's "4 GB" isn't in its README. sd.cpp ControlNet also
covers SDXL and Z-Image. Lightricks' `conditioning.md:34` is stale: the guide class is `VideoConditionByReferenceLatent`, so "all one engine feature" holds in shape, with two sizes of
work, factor 1 in `video.cpp` and factor 2 also in `ltxv.hpp`. Layout-To-Render keeps the guide on both stages. The kit's law on JSON enforcement with thinking is outdated for
`response_format` (`model-research.md` not edited yet).

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
