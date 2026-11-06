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

## The family releases together, once every app and all kit work are done [2026-10-29]
DECIDED: the user, verbatim (2026-10-29, in JustWrite's session, relayed): "you dont understand we have several apps i
        want all kit work done for all apps before we release any app, i want to relase all apps that we are working on
        now but not until all kit work is done by each app that means each app is complete bugs fixed featrues done all
        tasks ideas done or removed from list". Before it, there: "why whould we release house paint if we are still
        doing kit work, wouldnt that mean houspaint gets old kit?"
STATE:  No app releases — JustWrite, JustVoice, docgen, house-paint — until each is complete (bugs fixed, features done,
        every TASKS line and IDEAS entry done or removed) and every kit item for every app here is done; then all
        release together, each on the same kit commit. Dry runs only meanwhile (house-paint's 40823762045 green on
        6879a42, the kit at ddb1431 — publish skipped). Told: JustWrite's session (it relayed it), docgen's; JustVoice's
        when one runs.
KIT 2026-10-29: every kit item done — the finish list and round E's kit half (with JustVoice's §3) closed, the last
        pass green at 4d331e6 (core 1619, template e2e 15, the realrouter smoke 7 on JustWrite's data; house-paint e2e
        18, docgen e2e 19, JustWrite e2e 9 on e45086d). JustVoice's move onto it runs in its session
        (docs/plans/2026-10-29-round-e-onto-the-kit.md §4 there).
OPEN:   - the workflows' actions at their latest majors (JustWrite's asks, 4) — JustWrite's all on @v7 (2026-10-29, its
          session); JustVoice's 18 lines on v4 are the last; each app's roadmap and ideas listed with
          recommendations for the user (5).
CHECKED 2026-10-29, once after the day's kit changes (5a429ad, 1dcce91, be584a9, 2c76636, ca087d0): 21 steps green — kit
        core 1528 and lint, kit ui 77 and lint, the template's lint, i18n, server 62, unit 114, unpacked build and e2e 12/12;
        house-paint's lint, i18n, server 391, unit 195, unpacked build and e2e 16/16; JustVoice server 1384, unit 261;
        JustWrite server 195; docgen server 194; the guard at zero. JustWrite's and docgen's renderer suites run in their
        sessions once they install dompurify.
FOR JUSTVOICE'S SESSION, when one runs (none since these landed): this release rule; its release.yml on the actions'
        latest majors (JustWrite's asks 4, the template's lines); its roadmap and ideas listed with recommendations (5);
        its e2e onto the template's e2e/lib/driver.js shape (scripts/e2e.js today — docgen's session found the apps
        differ, 2026-10-29); its 8 bare `element.click()` tests (the guard's CLICK_KNOWN). DOMPurify is installed there
        already (7c383a1d). From "Finish the kit" (2026-10-29): mount the kit's `resourceIsolation` beside csrfOrigin and
        play its server's audio with `crossorigin="anonymous"` (its ~25 `<audio>` / `new Audio` uses — app-structure §19;
        the guard's ISOLATION_KNOWN until then); no commit hooks (the family's ruling); AGENTS.md (its CLAUDE.md is 207
        lines) and installErrorReporting in its boot; its UiServerImage override of the token (`jt:token`, src/boot/jv.js); its import-format picker (ImportModal.vue) onto UiSelect's groups (`{label, options}`); the kit's 2026-10-20 changes (serveUi, `aiRunHttpError` on its AI routes,
        `replacingData` in its restore screens, the focus back in a field after a 422 — `git show 96ad8e5:docs/dev/TASKS.md`,
        "What the kit's 2026-10-20 changes need in the apps"); the language as the kit's
        LanguagePicker (AppearancePanel's own Language row is gone — SettingsPage.vue still passes `locales` and
        `locale-desc`); round E (J1, the engines plan) on the kit's audio.cpp part once it lands; the template's
        e2e/tests/a11y.test.js (axe, WCAG 2.2 AA) and the "Installing it" section of docs/getting-started.md.

## Each app's roadmap and ideas, listed with recommendations, for the user [2026-10-29]
DECIDED: the user, verbatim (relayed from JustWrite's session): "i want all apps to have the roadmap ideas ect listed and
        recommed do d0ont remove pas this to other session after they complete there bug and current feature fixes".
STATE:  OPEN — each app (house-paint, JustVoice, docgen; JustWrite its own) lists everything open beyond TASKS — its
        roadmap, IDEAS and any candidate pools — each with a recommendation, do it or remove it, its reasons and the
        attack, for the user to decide. House-paint's DONE 2026-10-29 (its TASKS has the user's words); docgen's DONE 2026-10-29 (the user on its whole
        list: "your rec on all go"; no roadmap file, IDEAS.md empty). The kit's:
        DONE 2026-10-29 (the finish list, closed — `git log -S "Finish the kit" -- docs/dev/TASKS.md`). JustVoice's session
        gets it when one runs.
        (The rest of that day's asks from JustWrite's session — multi-window, token budgets, q-inner-loading in dark,
        renderAiMarkdown, the website's lede, the workflows' latest majors — are built or cancelled: git history.)

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
        can't be read whole (RESEARCH §12).
