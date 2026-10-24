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
- **Speech** (*measured on this PC* by JustVoice, `justvoice-quasar/docs/engines.md`): Kokoro 11.9× real time on CUDA
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

## D · The answer (argued against)

- **Buildable on the kit: yes.** sd.cpp (image + video through sd-server's `img_gen`/`vid_gen` jobs), audio.cpp
  (voice, music, some SFX), llama.cpp (script, shot list, prompts), the kit's cloud adapters and feature routing (local
  or the user's key per feature). ArtCraft itself runs nothing locally (§A), so the local half is new ground.
- **Every feature local and smooth on this PC: no.** Images, voice, music, the LLM, a 3D stage and the editor —
  yes. Video — a queue, not interactive: 480p, ~2–5 s clips, minutes each by proxy (unmeasured here), the LLM
  unloaded meanwhile, RAM nearly full on 14B. Lip-sync, image-to-3D, 720p+ and long clips — not usable here; the
  cloud key covers them.
- **The first step is a measurement**, the way P1 was for sd.cpp: Wan2.2 A14B I2V Q4 (and Q3) + the 4-step LoRA
  through sd-server `vid_gen` on this card at 832×480 × 33/81 frames — time, RAM, card, how it looks. That number
  decides whether local video is a tool or a toy.
- **Unreal: no integration.** glTF in and out of the app's 3D stage gives Unreal and Blender the scene (Unreal imports
  .gltf/.glb through Interchange, whole scenes by File › Import Into Level — *web, 2026-10-24*:
  dev.epicgames.com/documentation/unreal-engine/importing-gltf-files-into-unreal-engine; cameras and animation
  through it not checked); running Unreal beside a video model on one 8 GB card isn't possible.
