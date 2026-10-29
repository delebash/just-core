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

## Finish the kit — every open item researched, one list [2026-10-29]
GO:     the user, verbatim (2026-10-29, this session): "fix all kit bug look at any open items or lists i want to finish
        kit so think about all bugs items adverserialy give me your rec to finish kit"; on the list: "your rec on all but
        think adverserily on your recs again go"; then "and we should use the latest engine pin for the release of all
        apps and final testing after all features and bugs are fixed". The list (recs as shown, evidence file:line per
        item in the session's research notes) — close = delete each line as it lands:
        A. Bugs: 1 BUILT (multi-window + the own-page check; the template's e2e test runs with the final pass).
           2 BUILT (one-pool fit). 3 BUILT (a shared cache keeps the builds other apps use). 4 + 5 BUILT (`--no-models-autoload`; the embeddings route makes its model
           ready) — its real-router check (realrouter_smoke, JW_REALROUTER=1) runs with the GPU runs. 6 BUILT (the engine panel's cleared boxes left out of its save). 7 BUILT (stream lines end at CR/LF only). 8 BUILT (auto-tune ends in error when its service throws).
           9 BUILT (a failed model row has Dismiss). 10 BUILT (an unnamed history row reads "Load & measure"; the load rows were already left out —
           measurements.js SPEED_SOURCES). 11 BUILT (the update check keeps a good answer `updateCheckMinutes`, 60 — its field beside the update
           policy, words "Check every (minutes)" mine; a failure says the approved line). 12 BUILT (the llama.cpp download checked against GitHub's digest — the seeded rows get theirs
           at the pin's move).
           13 BUILT (a runtime's speed bands on its tab — words "Speed bands (seconds per image)", "Fast/Fine/Slow
           at ≤" mine). 14 BUILT (Count and Measure share `_servingModel`). 15 BUILT (the local adapters' errors through
           adapterHttpError; §19 row). 16 BUILT (shared_cache's two tests on fixed fixtures).
           17 BUILT (the guard's checkResourceIsolation; §19's media row, measured; JustVoice's move in its
           hand-off line). 18 BUILT (declaredClaimFn, startRunner/Runner — its spawn diagnostics tests now on
           the router — and LoadRequest.jobId/profileSwitchesFn removed; the screenless data routes kept).
        A+. JustWrite's reports (2026-10-29, measured on its built app): an embedding row turns llama-server's prompt
           cache off (`cache-ram = 0` — the qwen3 embed child grew 2.3 → 6.5 GB and the chat load was refused) BUILT
           6954fee; a stream's error frame carries the refusal whole BUILT 7a72c44. Its two questions DECIDED (the user, "your rec
           go" in JustWrite's session, relayed): both stay — the chat rows keep the 8 GB cache, the RAM door counts no pinned embed.
        B. docgen's: 19 + 20 BUILT (start-packaged: the launcher named for server/package.json; `--data-dir <folder>`,
           never removed — its first real run with the final pass; the e2e driver's dashed-id fix). 21 BUILT (the guard:
           docgen in check 17; JustWrite + docgen in the chrome and release checks — JustWrite's clipboard fixed,
           7ba14f7b; AUTO_KNOWN empty; checkRendererPeers).
        C. Features: 22 BUILT (a load's real progress from /models/sse, as the file's bytes; the stream reader
           moved to platform/lines.js — its real-engine run with the GPU runs). 23 BUILT (a vision model's speed: the work's `recordSpeed(secondsPerImage)`, bands 5 / 20 / 60 s seeded and
           editable; house-paint's finder records its encode — bd52883). 24 BUILT (If-Match in the kit — platform/versions.js; the template's notes on it; house-paint's
           outlines onto it — 0f4493e). 25 BUILT (UiSelect groups — JustVoice's picker moves onto it, its hand-off line).
           26 BUILT (sync: remove a device from a cloud folder — just-sqlite-sync ccf3fb6 `DELETE folder/devices/:id`, syncs first;
           SyncPanel's Remove on a folder row, the confirm's words mine; the design's 60-day auto-prune dropped; both apps' help). 27 BUILT (sync "Changes waiting" = this device's
           changes not yet sent — just-sqlite-sync 7e0fc0d `unsent()`, status `waiting`; one line under the sync line, words mine). 28 BUILT (Claude's prompt cache on every request; the ledger prices writes and reads at each model's rates,
           editable on the price table — column words mine). 29 BUILT (Mac/Linux: a pidfile
           sweep of engines a crash left — process.js `_sweepLeftover` in the spawn seam; unit-tested only, no Mac or Linux box here). 30 round E (JustVoice's audio.cpp and jobs into the kit) BEFORE the release.
           31 BUILT (the log names a llama.cpp config.ini the engine reads). 32 the pin's skipped re-read (placement rules,
           request parsing) + one MoE and one dense check run. 33 re-test --fit with Gemma-4 MTP drafts (if broken:
           llama-fit-params first, then launch with its placement). 34 the speed-truth walks on JustWrite's real app.
           LAST before the final tests: the engine pin moves to the latest release (32 and 33 run on it).
        D. Docs: 35 BUILT (the kit's AGENTS.md (CLAUDE.md → @AGENTS.md), just-sqlite-sync's too; the guard checks both copies). 36 BUILT (app-structure: an
           accessibility standard (WCAG 2.2 AA) with a template test — §17, e2e/tests/a11y.test.js on axe; "installers
           are unsigned" family-wide — §Q.2 and the template's getting-started; no performance budgets — §18). 37 BUILT (the labeling law and the dismissal rules into §17/§19, from the code; the two IDEAS entries closed). 38 BUILT (feature-model-system.md
           against the JavaScript — its two stale bug notes now the finding below, "two routing bugs"). 39 REVERSED by the user (2026-10-29, in JustWrite's session,
           relayed): "what is husky and the ci i dont want tests just running or things just running on commit in
           gituhb unless we need it often you take up so much time running tests after each little change i dont like
           that", then on the rec to remove it family-wide: "remove hook your rec on rest" — no commit hooks,
           family-wide: DONE in the template (its .husky, `prepare`, lint-staged and the two packages gone) and
           app-structure §18; JustWrite's gone (324f0f59); docgen never installed it; house-paint's gone (5c7caa8);
           JustVoice has none. 40 BUILT (AppearancePanel's Language row removed; JustVoice onto LanguagePicker — its hand-off line). 41 BUILT (the stale
           docs and comments — the class key, the watch doc, two plan headers, serving-design's sleepers, the skill's
           no-standard list, app-structure's docgen lines, the Bonsai verdicts and licence clause into model-research;
           the skill's TASKS pointers move with F, then install-skills). 42 "tuned config" → "applied config" in the PC classes help BUILT; the Add-model note's last
           sentence: the user's words (asked).
        E. Removed: D5, D6, I3, the KV/context surface (record in its plans), the RAM probe's serial passes (kept),
           Linux CUDA builds (Vulkan there), the template's phone (out of new apps), the per-band 27B trial,
           "Recommended" by hand (no), a one-machine library (no), the unload-clicks watch, the prompt-audit line,
           Bonsai 1/2, the model watchlist, the licence flag, the SDK pivot, the arch check, the MTP-variant steer,
           TTS in llama.cpp, watch 6/7, --log-jsonl, /metrics, the fixture-only probe arms, the imaging trigger.
        E + F DONE 2026-10-29 (the done sections deleted, each confirmed in code by that day's research; the KV surface's
        record in docs/plans/archive/2026-09-19-kv-context-surface.md). G. The apps' items go to their trackers.
DECIDED 2026-10-29 (the user, on four questions, the answers as chosen): round E — "JustVoice session (Recommended)":
        the kit's half here, then a JustVoice session the user starts moves JustVoice's side. The sync conflict (JustWrite's
        close-out dropped 14 "changes waiting" and 15 the remove-device button for JustWrite at 12:20, after this list's
        10:51 go) — "Keep both (Recommended)". The pin move — "Every engine the kit pins (Recommended)": llama.cpp and
        stable-diffusion.cpp to their latest releases, sd.cpp re-checked with one render. The two routing bugs below —
        "Fix both (Recommended)" — BUILT: Set as default records the routing default the Reset reads
        (ui/services/modelApply.js); the picker refreshes when a model lands on disk (ui/composables/useRunnerModels.js);
        template tests kitModelApply / kitRunnerModelsPicker, not yet run.
DECIDED 2026-10-29 (the user, verbatim: "your rec go", on the numbered list of eight, each fact checked first):
        1 speech routing — transcription a kit feature on an stt preset (`captures.stt_model` retired into it by
        retireSettings); speech (tts) no preset, the voice chooses. 2 the DSP program stays the app's (shipped with
        it, started through the kit's spawnChild) — no kit work. 3 the fork's model_management API in the kit (models
        registered into the running server). 4 eSpeak an extra archive on each audio.cpp build row; UniDic an
        optional add-on row installed on demand from the Speech tab. 5 auto-tune gains a measured layer walk for dense
        models; then JustWrite runs it on its 12B (--fit's 1,094 MiB margin left 10 of 49 layers on the CPU: 21 vs 41
        tok/s on b11960). 6 one coordinated card session now on b11960's open Gemma-4 + MTP bugs (#30419, #30698,
        #31077, #30975, exactness); if #30419 or #30698 fires, the release stays on b11239. 7 a one-pool laptop walk
        (the Radeon 780M) if it's at hand, else dropped. 8 the Add-model note's last sentence: "Embedding models keep
        hand-set minimums for card memory and RAM; the Fits badge and Quick Setup both read them."
STATE:  under way.

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
OPEN:   - the workflows' actions at their latest majors (JustWrite's asks, 4); each app's roadmap and ideas listed with
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
        "Finish the kit" above. JustVoice's session gets it when one runs.
        (The rest of that day's asks from JustWrite's session — multi-window, token budgets, q-inner-loading in dark,
        renderAiMarkdown, the website's lede, the workflows' latest majors — are built or cancelled: git history.)

## Round E: JustVoice's audio.cpp engine and its jobs into the kit, the llama.cpp way [2026-10-24]
PLAN:   `docs/plans/2026-10-24-engines-the-llama-way.md` (J1; rounds A–D BUILT — their records are there and in git).
STATE:  OPEN — before the release ("Finish the kit", item 30): the kit's half first (audio.cpp's runtime row, its
        `local-audiocpp` provider for tts/stt, the tts/stt presets' fields, its screens on `LuRuntimeTab`, its jobs on
        `platform/jobs.js`), then JustVoice's own move by its session.
DESIGN: researched 2026-10-29 — the kit's half in order: E0 audio.cpp's descriptor as a fixture → E1 the registry's
        kinds → E2 RuntimeService instances, env/cwd/config file → E3 builds on disk, backend/device, extras → E4
        runner/audiocpp.js and its rows → E5 booking → E6 routes and speech routing → E7 the jobs' forget → E8 the Speech
        tab with slots.
DECIDED 2026-10-29 (the user, the answers as chosen): "One runtime, two kinds (Recommended)" — one `audiocpp` runtime,
        one install and pin, its tts/stt × GPU/CPU processes as instances, one Speech tab; "Kit code, every runtime
        (Recommended)" — measured price beats declared, Auto/GPU/CPU placement and the worse-of-two admission are the
        kit's; "Yes, pin the fork (Recommended)" — the kit pins github.com/delebash/audio.cpp's releases; "JustVoice's UI
        in a kit slot (Recommended)" — the per-model options stay JustVoice's panel in the tab's slot.

