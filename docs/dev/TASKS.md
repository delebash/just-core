# TASKS — the live open-work tracker (just-core: kit + shared server)

> **THIS is the live tracker for the shared stack** — created 2026-08-04 by the docs
> campaign (`just_ai_i18n_docgen/docs/plans/2026-08-04-docs-cleanup-campaign.md`),
> per the family convention (`docs/app-structure.md` §13). One line per open item +
> a pointer to its detail doc. **Close = delete** — git and the plan docs keep
> history. **An item lives where the code that closes it lives** — kit/shared-server
> work HERE; app work in `../justwrite-app/docs/dev/TASKS.md` /
> `../JustVioce/docs/dev/TASKS.md`. A tracker line is a claim, not evidence.
> Items extracted from plan docs are marked **[verified]** (code-checked at
> extraction) or **[attributed]** (the plan doc's claim, not re-verified).
> A citation elsewhere of the kit's TASKS by a section's title that is no longer here ("the kit's TASKS, …") points
> at git: the done sections were deleted on 2026-10-29 — `git log -S "<the title>" -- docs/dev/TASKS.md`.
> Items written before 2026-10-18 use the kit's old names: `just-llm-runner` is now `just-core`,
> `server/` (`@delebash/llm-runner`) is `packages/core/` (`@delebash/core`), `ui/`
> (`@delebash/llm-ui`) is `packages/ui/` (`@delebash/ui`).

## The family release: JustWrite, house-paint, docgen and JustVoice, together [2026-10-29; the three, 2026-11-06; JustVoice, 2026-11-07]
DECIDED: the user, verbatim (2026-10-29, in JustWrite's session, relayed): "you dont understand we have several apps i
        want all kit work done for all apps before we release any app, i want to relase all apps that we are working on
        now but not until all kit work is done by each app that means each app is complete bugs fixed featrues done all
        tasks ideas done or removed from list".
DECIDED 2026-11-06 — the user, verbatim, in JustVoice's session: "mark jw as clear,  the kit if stuff is done mark it and
        close it out, i ipened a new session i want it to do a a releaswe for the family apps jw, housepaint, docs gen with
        the items you listed website ect make sure all deps are updated all docs are updated all websites are updated and do
        a family releaeas have the new session do this it is called family release"; then "have it do all your recs for
        the apps that you listed".
DECIDED 2026-11-07 — JustVoice joins, the user, verbatim, in JustVoice's session (relayed): "pass what need to be done
        to release session so we can do family release let it know if anyting needs updating for jv"; then "what are you
        doing i said hand it off to the release session not do it yourslef" — every JustVoice release step, the audio.cpp
        fork's included, is the "family release" session's.
GO:     2026-11-07, the user, verbatim, in the "family release" session: "make sure you have everthing updated whatever
        forks we have like for jv, and deps ect, verify you have latest info, go for all your rec for family release jv
        jw docgen kit the forks housepant docs dev docs websites ect, go" — on the session's list: 1. versions JustWrite
        v2.1.0, house-paint v0.2.0, docgen v0.1.0, JustVoice v0.1.0; 2. JustVoice joins, all its release work in this
        session; 3. the audio.cpp fork: the two local commits kept, verified by this session's build and tests, tagged
        v0.9.4-jv.7, released before the final pass on the user's word; 4. the kit kept still for the final checks and
        the releases, the other sessions messaged first; 5. the four releases and three website deploys on the user's
        word once every dry run is green; 6. sass-embedded held at 1.107.1 (npm `overrides`) until a fixed Sass ships;
        7. the template's boot test (template/server/tests/boot.test.js) in the four apps, docgen's serve.js given the
        template's entry check first. The working record: `docs/plans/2026-11-07-family-release.md`.
STATE:  OPEN — the "family release" session releases JustWrite, house-paint, docgen and JustVoice together, each on the
        same kit commit (each release.yml's `core_ref`), our audio.cpp fork's v0.9.4-jv.7 before them. JustDirect's kit
        gaps (below) are not in it.
        Closed 2026-11-06 (JustVoice's session, each checked in its code): every JustVoice line this item carried — its
        workflows on actions v7/v8 (CodeQL's action on v4, its own latest), its e2e on the template's driver with the
        a11y test, no click or isolation exceptions left (the guard's CLICK_KNOWN and ISOLATION_KNOWN are empty), no
        commit hooks, AGENTS.md, installErrorReporting, the kit's token (no `jt:token`), ImportModal on UiSelect, the
        LanguagePicker, the kit's DataManagement (`replacingData`), `aiRunHttpError`, round E, "Installing it"; and its
        roadmap and ideas listed and decided (its TASKS, "The finish run's nine decisions") — which closed "Each app's
        roadmap and ideas, listed with recommendations, for the user" for every app (house-paint's and docgen's
        2026-10-29, JustWrite's its own, the kit's "Finish the kit").
OPEN:   the release work, as JustVoice's session listed it on 2026-11-06 (its recs, which the user said to do):
        1. Dependencies at their latest in the three apps, the template and the kit — minor and patch first; each major
           after reading its breaking changes: Electron 45 (from 44.10.0), jsdom 31, the kit core's @anthropic-ai/sdk 1.x
           (from 0.132) and @google/genai 3, JustWrite's simple-statistics 8 and webdriverio 10. Biome is one exact pin
           family-wide (the guard), so JustVoice moves with it; a kit change reaches JustVoice too (its server and unit
           suites stay green).
        2. Each app's full suites, unpacked build and e2e after them — none of the three has built or run its e2e since
           the kit's JustDirect changes (6c43d7ca).
        3. house-paint's accessibility test, first run (e2e/tests/a11y.test.js — written, never run); what it finds is
           fixed before the release.
        4. Each app's docs and in-app Help checked against its screens (only the guard's format and link checks have run).
        5. JustWrite's Spanish re-translated by docgen if `en.json` changes (JustWrite's TASKS: clear otherwise).
        6. Each website brought up to date (text, screenshots of what changed) and deployed by its own `npm run deploy`
           after the release (house-paint's close-ups, fef4d64, wait for it).
        7. The releases: each app's release.yml by hand (`workflow_dispatch`), one `core_ref` for all three.

## JustDirect's kit gaps, filled before the app [2026-11-06]
DECIDED: the user, verbatim, 2026-11-06: "your rec go", on item 4 of the session's list: "Four gaps to fill in the kit
        before the app. These aren't NOT STANDARD, but kit changes reach every app, so I want your go: the video job
        needs guide frames, audio input and the upscaler stage; audio.cpp needs music, sound-effect and lip-sync kinds;
        a chat request needs to carry an image, for the first-frame check (the runner already loads vision models);
        Blender as an engine, if you take item 2."
        Items 1–3 of that list are NOT STANDARD (the sd.cpp `jd` build pinned as the kit's, the Blender shot builder on
        the engine host, `drawtracks.js` in the kit): a blanket go never covers one, so they wait for the user's word on
        each by name, and Blender as an engine waits with item 2. Record: `docs/plans/2026-10-31-just-direct-handoff.md`.
CORRECTED: "the runner already loads vision models" was wrong — the kit DOWNLOADS a row's `mmproj` (runner/models.js
        selectFiles) but never passes it to llama-server (process.js emitModelsIni writes `model =` only), so the image gap
        includes loading it. No seeded catalog row in any app names an mmproj (grep, 2026-11-06), so no current model
        changes.
PLAN (each its own test, the suites once at the end):
  1. Image in a chat request — standard: OpenAI's chat content parts (`text`, `image_url` with a data URL), which
     llama-server takes when started with `--mmproj` (llama.cpp tools/server/README.md, "multimodal").
     `runner/models.js` cachedMmprojPath; `ModelIniEntry.mmprojPath` at its four builders (lifecycle.js) → `mmproj =`;
     RunRequest `images` → the user turn's parts (prompts.js resolveAction); the adapters map the parts to their own
     shapes (anthropic image blocks, gemini inlineData, openai_sdk input_image, ollama images; openai_compat as is).
     Real test: the kit's emitModelsIni + the pinned llama-server with Qwen3-VL-8B (on disk) answering about a frame.
     DONE 2026-11-06, 567dae7e: three frames answered right, 4.4–5.7 s each (RESEARCH, "A chat request carries an
     image").
  2. Video job — standard: sd-server's own vid_gen fields (examples/server/api.md): `control_frames`, `ref_audios`,
     `hires`, `lora`, `strength`; sdServerArgv `--lora-model-dir`, `--hires-upscalers-dir`, `--params-backend`;
     videoGen records its speed as imageEdit does. Only the `jd` build makes LTX read the guide and the audio (item 1),
     so the real test runs the kit's path on that build.
     DONE 2026-11-06, 6cb10337 (with `--backend` from the row's spec too, which the CLI recipe uses): the passing
     explosion remade through the kit's path matches the sd-cli clip, PSNR 46.7 dB. NOT done: the speed record — a clip
     has no speed unit or band (sd.cpp's runtime has one kind, image), so it moved to FOUND.
  3. audio.cpp music, sfx and lipsync kinds, each its own process as tts and stt are — standard: audio.cpp's
     `POST /v1/tasks/run` (app/server/api.md), task `gen`, the one route its music (Stable Audio 3, ACE-Step), effects
     (Stable Audio 3 SFX) and lip-sync (LatentSync) families run by. Needs the merged fork (281de44a; the pinned
     v0.9.2-jv.6 has no LatentSync) — the pin moves with the family release (JustVoice TASKS, "Our audio.cpp fork is
     released with the family"). LatentSync runs `ffmpeg` from PATH.
     BUILT 2026-11-06, e547bded (kinds, providers, placement rules, speed bands, runAudioFeature, the screens' words in
     en and es; unit tests). DONE 2026-11-06, real run (`E:\Dev\Web\test-just-direct\kit-audio.js`, the merged fork's
     server at 281de44a): sfx 10 s of three sword clashes in 2.1 s, music 30 s with a storm swell in 5.0 s, each in its
     own process. LatentSync through the kit is not run yet (its frames are about 270 MB of Base64 for 3 s).
CHECKED 2026-11-06, once after the three (6c43d7ca): kit core 1641 and lint, kit ui 93 and lint, the family guard at
        zero; server suites — template 63, JustWrite 197, docgen 223, house-paint 397, JustVoice 1295, JustStage 48;
        renderer suites — template 141, JustVoice 306, house-paint 196, JustWrite 885, docgen 52; the template's unpacked
        build and e2e 15/15. Not run: the four apps' own builds and e2e.
FOUND, not on the approved list (for the user's next list): no `runVideoFeature` (a video feature's preset and
        dispatch — `videoGen` has no feature routing) and no video kind with its speed band; no kit FFmpeg (JustVoice
        asks the user to install it); LatentSync's frames come back as one Base64 string, so a 720p line past about 6 s
        can't be read whole (RESEARCH §12). — All three decided 2026-11-06: the next section.

## JustDirect's six decisions after the kit gaps [2026-11-06]
DECIDED: the user, verbatim, 2026-11-06: "1 your rec dont do 2 , 3 your rec , 4 your rec 5 your rec, 6 your rec  go" —
        on the session's re-checked list (its reply "Decisions, re-checked"), item 1 as restated after the user asked
        "did we make our own additions to the sd.cpp, if so why and if we need it shouldnt we follow what we are already
        doing with others and make a repo like audo.cpp, what did we change and verify via adverserially thinking we
        need those changes". The recs as approved:
  1. NOT STANDARD, the user's word on it by name. Our four sd.cpp changes go into a fork repo like our audio.cpp's:
     github.com/delebash/stable-diffusion.cpp. `jd` is pushed there and the kit's 8 sd.cpp downloads point at our
     releases, built by hand on GitHub with upstream's own release workflow. Before each change: upstream merged in,
     built and tested (the family fork rule; 23 commits behind on 2026-11-06). ~~All four changes are offered upstream as
     pull requests; once upstream has them all, the kit goes back to upstream's releases and the fork is retired.~~
     STRUCK by the user, verbatim, 2026-11-07: "no dont send patches upstream this is rulle on all and you should know
     this" — nothing is sent upstream, from any repo; the fork stays ours. The fork itself: "your rec go make sure
     another session hasnt done it" (2026-11-07; checked — no session had: github.com/delebash/stable-diffusion.cpp
     didn't exist and no repo under E:\Dev named it).
     house-paint's and JustStage's image features move onto the build too and are retested (the reserve change reaches
     every model on Windows cards under 12 GB). The four, each checked against today's upstream:
     `dffe732` picture-to-video memory (upstream: "need 9806.96 MB device" at 1280×704); `b9e4949` LTX guide frames
     (upstream: "LTXAV control_frames are not implemented", video.cpp:783); `cf4af3a` audio-to-video (PR #1676 idle
     since 2026-06-20, two faults found in it); `27fbab0` half-size guides and the small-card peak (before it: refused
     18 MB and 227 MB short, nothing past 121 frames).
  2. Don't do: the Blender shot builder, neither inside JustStage nor inside JustDirect; Blender as a kit engine waits
     with it. The builder stays test-only (`E:\Dev\Web\test-just-direct\shot-scene.py`).
  3. NOT STANDARD, the user's word on it by name. The motion-path drawer is rewritten clean-room in the kit (MIT): one
     pass writes the drawing format Lightricks' Motion Track LoRA was trained on as a spec, a second writes the code from
     that spec only, and a test compares our frames with Lightricks' own renderer (their licence claims no rights in
     output). Why: `drawtracks.js` ports `sparse_tracks.py` from ComfyUI-LTXVideo, which is under the LTX-2 Community
     License, not an open licence. The test clones github.com/Lightricks/ComfyUI-LTXVideo (about 13.6 MB).
  4. A video feature in the kit: a video kind on sd.cpp's runtime with its preset, speed band, booking kind and
     `runVideoFeature`, built as the image features are. A fresh sd-server per clip unless two clips back to back prove
     safe on the `jd` build (2026-10-28 a second clip on one server crashed or ran out of memory; `videoGen` keeps its
     server, sdcpp.js:261) — about 25 minutes of the card, after JustStage's "card free".
  5. FFmpeg from the kit: gyan.dev's 9.0.2 essentials for Windows, Martin Riedl's 9.0.2 for macOS and Linux, pinned by
     SHA-256; the addresses are data rows; a path the user sets falls back to their own FFmpeg; JustVoice moves onto it
     in its own session. The test downloads `ffmpeg-9.0.2-essentials_build.zip`, 114,768,076 bytes, from
     github.com/GyanD/codexffmpeg/releases/download/9.0.2/.
  6. Dropped: LatentSync's long lines. Its package (huggingface.co/audio-cpp/LatentSync-1.6-GGUF) carries InsightFace
     face weights "restricted to non-commercial research", so lip repair stays off the commercial-use route (it was
     already optional, off by default). The kit's lipsync kind stays, labelled with its licence.
  Also, from the same check: Stable Audio 3 (music and effects) is free for commercial use only under US$1M a year in
  revenue (LTX: US$10M) — added to the route's licence list as a label.
BLAST RADIUS (greps, 2026-11-06):
  1. `DEFAULT_SDCPP_BUILD` / `SD_REL`: just-core `runner/config.js:294-295`, its tests (runtime_service, runtime_server,
     runtime_models, runtimes, sdcpp_real); house-paint `server/tests/aiphoto/real.test.js`, `migrate.test.js`;
     JustStage `server/src/app.js:124` (`runtimes: ["sdcpp"]`); `E:\Dev\Web\test-just-direct\rows.js`.
  3. New file; no callers.
  4. `runImageFeature` / `videoGen`: just-core `llm/image_dispatch.js`, `llm/image_jobs_api.js`, `runner/sdcpp.js`;
     house-paint `server/src/aiphoto/edit.js`, `aiphoto_service.js`; the kind lists in `llm/runtimes_api.js`,
     `ui/composables/useMemoryCells.js`, `ui/views/AiModelsArea.vue`, the en/es catalogs.
  5. `ffmpeg`: JustVoice `server/src/mastering.js`, `export_audiobook.js`, `book_run.js`, `models.js`, `system_info.js`,
     `audio/wav.js`, `api/export_jobs_api.js`, `api/render_chapter_api.js`, `api/book_runs_api.js`,
     `api/projects_api.js`; just-core `llm/speech_dispatch.js` (the lipsync note).
STATE 2026-11-06:
  1. Merged upstream into `jd` locally (`2d036b0`; one conflict, video.cpp's stage-2 upscale: our guide clearing kept,
     upstream's new H3 and generic upscalers taken); CPU and CUDA builds clean (the local CUDA build without CUTLASS,
     upstream's new optional submodule). `9d4fbd5`: the fork's release run pushes no container images (upstream's
     build.yml would push Docker images under the fork's account). BLOCKED: creating github.com/delebash/
     stable-diffusion.cpp was refused by Claude Code's permission check ("the auto mode classifier judged this action
     dangerous") — pushing `jd`, the release run and the kit's rows wait for the fork. No upstream pull requests — the
     user's rule (2026-11-07, above).
     The merged build makes the passing explosion with the same content frame for frame (PSNR 34.5 dB against the
     pre-merge clip — RESEARCH §11). house-paint's FLUX.2 klein 4B picture through the kit is identical pixel for pixel
     on the merged build and on upstream's pinned master-1024-77b72a2 (`E:\Dev\Web\test-just-direct\kit-image.js`,
     1024×768, 4 steps, seed 42: PSNR infinite; 11.1 s and 10.3 s). Waiting with the fork: the same on our release's
     builds, and JustStage's image models (Z-Image, Qwen-Image, HiDream), when the kit's rows point at our release.
     2026-11-07: the fork exists (github.com/delebash/stable-diffusion.cpp, made by this session after the user's go).
     The local clone's remotes are now `origin` = the fork and `upstream` = leejet, as in our audio.cpp. Upstream's
     three new commits (#2284 SDXL ControlNet Union, #2285 RelayVSR, #2286 MiniMax-H3 QKV chunks) are merged into `jd`
     with no conflict (`e910eee`), and `jd` is pushed to the fork. The "I understand my workflows" button I named didn't
     exist: GitHub had listed no workflows at all ("No workflows found"), because it lists them only from a push to the
     default branch that touches them. The user, verbatim: "does audic cpp have workflows automatic, no it doest so why
     would you do sd with worflows you idiot i dont wnat automatic stuff fireing off", then "any you can accept things
     you can do all this yourslef you dont nee me". Done by this session instead: `4400f6d` makes `build.yml` start
     only by hand (upstream's push and pull_request triggers removed) and deletes upstream's three issue and pull-
     request housekeeping workflows (two daily schedules). `jd` is now the fork's default branch, so upstream's
     `master` copy of the files is never read for schedules. After the push GitHub lists one workflow, `build.yml`,
     and nothing ran by itself. Release run 42431109657 started by hand on `jd` (2026-11-08 00:44 UTC). The fork's
     `master` is never pushed or synced; upstream reaches us only by a local merge into `jd`.
  2. Not done, by the user's word.
  3. DONE `336d6556`: the spec `docs/plans/2026-11-06-motion-tracks-spec.md` (written from sparse_tracks.py at
     ComfyUI-LTXVideo `220e1d4`, no code in it); `runner/motion_tracks.js` written from it alone by a separate agent;
     Lightricks' renderer's frames (`E:\Dev\Web\test-just-direct\tracks-golden.py`) match ours — sampling identical, 15
     frames at 1152×640, 1280×704 and 384×640 within one step. Two spec lines of mine were wrong (32-bit vs 64-bit, a
     line's arithmetic order); corrected in spec and code, each with a test. The clone
     `E:\Dev\Web\test-just-direct\ext\ComfyUI-LTXVideo` is 110 MB on disk with its examples (the API's 13.6 MB was the
     repository's packed size).
  4. DONE `1a97d977`, real test: two clips back to back on one kit-started server (`E:\Dev\Web\test-just-direct\
     kit-video2.js`, the merged `jd` build): 661 s and 589 s, card peak 6.95 GB, booking `video:sdcpp`, speeds 0.0062× and
     0.0069× (fine) — so an LTX row needs no `spec.serverPerJob`. A first try was cancelled by its RAM guard when
     JustVoice's router loaded Gemma 4 26B (13.75 GB) mid-clip.
  5. BUILT `edd35715`, measured: the kit installed the pinned Windows build (SHA-256 checked, `-version` probe), and it
     turned sd-server's WebM into H.264/AAC MP4 in 1.2 s. The first try failed at the swap (EPERM — Windows Defender
     reading the new exe); the engine swap and the extras swap now retry (`renameHeld`). JustVoice's session told.
  6. Dropped.
CHECKED 2026-11-06, once after 3–5 (`7fb8ebe0`): kit core 1675 (13 skipped) and lint, kit ui 94 and lint; server suites —
        template 63, house-paint 397, JustWrite 197, docgen 223, JustStage 48; unit suites — template 141, house-paint
        196, JustWrite 885 (5 timeouts at 5 s under the PC's load, the two files 8/8 on a rerun), docgen 52. The family
        guard: zero but one page another session wrote (`docs/plans/2026-11-06-subscription-providers-research.md` has
        no standards table — that session told). Not run: JustVoice's suites (its session asked: uncommitted close-out
        work in its tree; it runs them on these commits), the apps' builds and e2e (the family release session's final
        pass).

## JustDirect: finish the app [2026-11-07]
DECIDED: the user, verbatim, 2026-11-07: "finish the app, dont stop coding at turns or decsions, for decisions you think
        adverserily multiple times on each decision you need to make and take your own rec, do not stop to ask me to make
        decsions, complete the app until all bugs features things you find our think of to do are donel, finish the app".
        It builds on the standing go of 2026-11-05 ("keep working on aap until it is finished … complete the app or let
        me know it is not possible to meet quality bar with the commercial use reseoruces and models"). Every decision
        this takes is recorded below with its attack. Two earlier words stand, since this go names neither: "dont do 2"
        (no Blender shot builder in JustStage or JustDirect) and "no dont send patches upstream".
  1. DECIDED (Claude's rec, attacked): start the app now. It is `E:\Dev\Web\just-direct`, made by /new-just-app on
     2026-11-07 (server 17500, dev 1470/1471, registered in the guard), and its PRD is written from the record. The
     attack: decision J says no app code until the proof list is green. But the list's open items ride on the 3D shot
     builder that "dont do 2" keeps out: the planner writing body scenes and crossing fire attacks, a following
     camera, and crowd faces, hands and a horse through 3D. So the list can't go green without breaking that word, and
     the newer go is to finish the app. Where the app can, those items become features: drawn motion paths, and a guide
     video brought in from elsewhere. Where it can't, they are written down as the app's limits. Its open work lives in
     the app's own TASKS from here on.
  2. Kit fix on the way: the generator renames the template's dev port (9000) in every file it copies, and a template
     test typed "9000" as its out-of-range number, so a new app failed its first test run. The test now types 8192.
  3. Kit fixes on the way (Claude's, plain repairs): `runFfmpeg` (ff905613) for the app's joins; thinking allowed
     beside a strict JSON schema (2e34fd67, c5b47f87); the template's `server/tests/boot.test.js` (307ec7d2) — the
     server's entry loaded by Node itself, because Vitest let a wrong kit import pass while JustDirect's server
     couldn't start. The other apps copy that test in their own sessions (told to the family release session).
HERE:   JustDirect's milestones 1–7 are built (the app's TASKS and its plan's "Where it stands"); its first real run
        waits for the card (JustStage), its clips for our sd.cpp release run 42431109657.
