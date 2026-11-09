# The family release — JustWrite, house-paint, docgen, JustVoice, the kit and our audio.cpp fork (2026-11-07)

> **Read this FIRST after any compaction — the live section is "GO (2026-11-09)" at the end.**

The working record of the "family release" session. The approved text is in the kit's TASKS ("The family release");
this file holds the order, the facts each step stands on, and **the decisions this session made under the go — each
marked MINE, never the user's**, with the attack that tested it, so a later session never quotes one as approved.

## The go

The user, verbatim, 2026-11-07: "make sure you have everthing updated whatever forks we have like for jv, and deps ect,
verify you have latest info, go for all your rec for family release jv jw docgen kit the forks housepant docs dev docs
websites ect, go" — on the list in TASKS (versions; JustVoice in; the fork's v0.9.4-jv.7; the kit kept still; the
releases on the user's word; the Sass pin; the boot test). Waits for the user even under the go (the global rules):
the fork's release, the four apps' releases, the website deploys.

Later the same night, the user, verbatim: "you dont need to do any big tests or anything big just get the apps
releases"; then "dont stop keep going asi is if you need to , i understna the release and fork" (the fork's release
started on it: run 42444512703); then, on the docs check, "i thought each app already maintied its docs i didnknow you
are doing some big audit" — the check stopped (JustWrite's verified fixes kept, 7a478fd9 and 6d562c09; the rest put
back) — and on the session's rec (no more audit; one test pass before tagging, inside the fork's two-hour build; one
short llama.cpp card check; then the releases and the site deploys as they are): "whatever your rec is doi it go".

## Facts taken fresh (2026-11-07)

- **npm** (`npm outdated --json --long` in 32 folders: the kit's three, the template's five, each app's five, the sync
  engine, the three websites): the majors are Electron 45.2.3 (from 44.10.0; 45.1.0 carries Node 24.22.1, the same
  Node as 44.10.0), jsdom 31.0.0, @anthropic-ai/sdk 1.6.0 (from 0.132.1), @google/genai 3.0.0 (from 2.28.0),
  simple-statistics 8.0.0, webdriverio 10.1.0, and on the websites @astrojs/starlight 0.42.10 (from 0.41.x — a 0.x
  minor, breaking). Biome 2.6.6 (from 2.5.15).
- **sass-embedded**: 1.108.0's Windows package lacks `dart-sass/src/sass.snapshot` (4 files, 5.3 MB); **1.108.1
  (2026-11-07) has it again** (6 files, 10.7 MB, as 1.107.1) — `npm view sass-embedded-win32-x64@<v> dist.fileCount
  dist.unpackedSize`. The approved pin was "until a fixed Sass ships": it shipped, so no pin; JustVoice's 1.107.1
  override is removed.
- **Forks we keep** (`gh repo list delebash --fork`): audio.cpp (JustVoice — released here) and stable-diffusion.cpp
  (JustDirect's `jd`, web-4c's; no released app uses it: the kit's sd.cpp rows are upstream leejet's). The other
  forks (the storytold *craft repos and older ones) are named by no family app's code (grep of every package's src).
- **Engine pins vs upstream**: llama.cpp b11960 (stable v0.8.0) — upstream stable **v0.9.0** = b12110 (2026-11-04);
  audio.cpp v0.9.2-jv.6 → v0.9.4-jv.7 (this release); FFmpeg 9.0.2 (pinned 2026-11-07). "The family release moves
  every pinned engine to its latest" — the user, 2026-10-29 (config.js, the sd.cpp and llama.cpp pin comments;
  llama-cpp-watch.md). **sd.cpp is NOT moved to upstream's master-1056 here**: the user approved (the kit's TASKS,
  "JustDirect's six decisions", item 1, NOT STANDARD by name) that the kit's sd.cpp downloads point at our fork's
  releases (delebash/stable-diffusion.cpp `jd`, upstream merged + our four changes); web-4c commits that pin and
  retests house-paint's AI photo on it, before the kit is kept still (web-4c's message, 2026-11-07).
- **llama.cpp b11960 → b12110, the watch doc's checklist** (2026-11-07): all 150 commit titles read (treeless clone);
  `common/arg.cpp` loses only the Windows argv reconstruction (#31417 — the new manifest, #31329, makes the process's
  code page UTF-8 and allows long paths), no flag added or removed; `common/preset.cpp` and `server-models.cpp` only
  swap `fs_path_to_utf8()` for `path.string()`; `tools/server/server-common.cpp` (request parsing) unchanged;
  `common/common.h`'s `LLM_FFN_EXPS_REGEX` unchanged; `src/llama-model.cpp`'s placement lines (`i_gpu_start`,
  `act_gpu_layers`, "always keep the input layer") unchanged; the loader reuses one staging buffer (#31321); MTP
  hidden state is now saved and restored with checkpoints (#30141). All seven rows' names exist at b12110; the two
  Windows cudart zips are byte-identical (same SHA-256). The watched issues #30698, #30419, #31077, #30975, #30688 are
  all still open upstream. The b12110 Windows CUDA 12.4 zip's SHA-256 is GitHub's (`1ce755bc…`); `--version`: build
  12110, commit cd959bae9.
  **Step 0b** (`llama-fit-params -fitp on`, JustWrite's two Gemma-4 rows, `-c 32768 -ctk q8_0 -ctv q8_0 -fa on -b 512 -ub
  512`; b11960 from the shared cache beside b12110): the model MiB on the card is **identical at both builds** in all five
  configs — 26B 31/21 4,998 · 30/21 4,968 · 31/0 13,573 · 12B 48 6,269 · 49 6,390 (the same as the kit's prediction on
  record) — and the host side too. **The context MiB is 11–19 larger at b12110** (26B 499 → 511, 493 → 504, 499 → 511;
  12B 520 → 539, 527 → 545), compute 0–4 smaller: most likely #31073 (the KV rotation constants kept on the GPU). The
  kit learns its overhead per build, so a borderline fit sees it. The router run on the card waits for the card.

## The majors, read at their own notes

| Package | Breaking changes (the maker's notes) | Our code | Verdict |
|---|---|---|---|
| Electron 45 (electron/electron releases v45.0.0) | sandboxed preload loses `events`/`timers`/`url`, `Buffer`, `setImmediate`; `window.open` child with a different sandbox state gets its own process; screen capture reported as `display-capture`; ASAR `fs.open` descriptors not backed by the file; sync `safeStorage` deprecated | the kit's preload uses only `require("electron")` (contextBridge, ipcRenderer); a second window gets the same `webPreferences()` (shell/main.js guardPage); permissions: clipboard + JustVoice's microphone; no safeStorage, contentTracing, desktopCapturer | take it |
| jsdom 31 (jsdom/jsdom v31.0.0) | a new CSS engine (computed styles can differ), parsing pauses at blocking scripts, focus moves asynchronously, `load` only on window, canvas backend `@napi-rs/canvas` | test environment only (no `new JSDOM` in any package's src) | take it; the suites show the fallout |
| @anthropic-ai/sdk 1.x (the 2026-10-21 migration guide, TypeScript) | requests on API version 2026-10-21: `temperature`/`top_p`/`top_k` 400 on every model; the key goes as `Authorization: Bearer`; one credential per client; Text Completions, tool-runner compaction, `betas` on non-beta Models gone; licence Apache-2.0 | anthropic.js sends `temperature` (default 0.7) and `top_p`/`top_k` from a preset's extra; `models.list()` without betas; `apiKey` only | take it, with MINE 1 and 2 |
| @google/genai 3 (googleapis/js-genai v3.0.0) | the Gemini API default moves v1beta → v1; `gemini-flash-latest`, `gemini-flash-lite-latest`, `gemini-pro-latest` exist only on v1beta; Node ≥ 22 | gemini.js DEFAULT_MODEL is `gemini-flash-lite-latest` | take it, with MINE 3 |
| simple-statistics 8 (its CHANGELOG) | no ES5 build; `quantileRank*`, `minSorted`/`maxSorted`/`extentSorted` throw on empty input | JustWrite calls only `linearRegression` (src/services/analysis.js) | take it |
| webdriverio 10 (its v10.0.0 notes) | Appium 3 required, `$` strict, `executeAsync`/`touchAction` removed, Node ≥ 22.19 | JustWrite's e2e/phone-ios.js only (Appium 3.8.0 already; getContexts, switchContext, execute, getLogs with a catch) | take it; runs on GitHub's macOS only, unrun here |
| Biome 2.6 (its CHANGELOG, 2.6.2) | 59 nursery rules promoted, many recommended; `javascript.parser.gritMetavariables` removed | one biome.json in every app; JustVoice moves with it (now this session's) | take it; the lint fixes in the final pass |
| Starlight 0.42 (withastro/starlight 0.42.0) | mobile menu markup (`starlight-menu-button`, `data-mobile-menu-expanded` gone), `tagline` removed, astro ≥ 7.2.10 | no site's src or config names them (grep) | take it with astro 7.4.7 |

## Standards for the pieces

| Piece | Standard it follows | Kit code |
|---|---|---|
| Every range at its latest | npm-check-updates 23.1.1 (`ncu -u`, the range style kept), then `npm install` / `npm update` (docs.npmjs.com/cli/commands/npm-update) | `packages/core/package.json`, `packages/ui/package.json`, `template/package.json` |
| Claude on API version 2026-10-21 | the migration guide's TypeScript section (platform.claude.com/docs/en/api/migration-2026-10-21): no sampling parameters; `defaultHeaders: { "X-Api-Key", Authorization: null }` for a gateway | `packages/core/src/llm/anthropic.js` (`AnthropicAdapter`) |
| Gemini on @google/genai 3 | the SDK's own `httpOptions.apiVersion` (googleapis/js-genai v3.0.0's notes) | `packages/core/src/llm/gemini.js` (`GeminiAdapter`) |
| llama.cpp b12110 | the kit's review checklist, `docs/llama-cpp-watch.md` | `packages/core/src/runner/config.js` (`DEFAULT_PINNED_BUILD`) |
| audio.cpp v0.9.4-jv.7 | our fork's release workflow (dispatch only); the rows measured as the config's comment says | `packages/core/src/runner/config.js` (`DEFAULT_AUDIOCPP_BUILD`) |
| The boot test in each app | the template's test, copied as it is | `template/server/tests/boot.test.js` |
| docgen's entry check | the template's serve.js | `template/server/src/serve.js` |
| Biome 2.6 | `biome migrate` (biomejs.dev), one biome.json for every app | `template/biome.json` |

## Decisions made under the go (MINE — not the user's; each reversible)

1. **MINE — Claude's sampling settings are dropped for every Claude model.** On API version 2026-10-21 a request with
   `temperature`, `top_p` or `top_k` is refused on every model. The kit already dropped them for every Claude 4.7+
   model (`GENERATIONS` `sampling: false`); what changes is the three older models a user may still pick (Sonnet 4.6,
   Opus 4.6, Haiku 4.5): their requests now sample at Anthropic's defaults (temperature 1.0) instead of the preset's.
   Attack: (a) hold the SDK back on 0.x and API version 2023-06-01 — keeps the old sampling but ships the release on a
   superseded SDK and version, against "make sure all deps are updated"; (b) keep only the old models' calls on
   2023-06-01 with a version override — the migration guide's least recommended choice, and an override that dies with
   2023-06-01. The guide's recommended choice is to delete. Survives.
2. **MINE — an Anthropic provider with its own base URL keeps sending its key as `X-Api-Key`.** SDK 1.x sends
   `Authorization: Bearer`; the 0.x the kit used sent `X-Api-Key`, so any gateway a user points the provider at today
   reads `X-Api-Key`. With a custom base URL the client sets `defaultHeaders: { "X-Api-Key": key, Authorization: null }`
   (the guide's own TypeScript fix, "If a proxy or gateway reads X-Api-Key"); with Anthropic's own URL the SDK's
   default stands. Attack: a gateway that reads only `Authorization` — none could have worked with the kit before
   (0.x never sent it). The Claude API takes either header (the guide). Survives.
3. **MINE — the Gemini adapter asks for API version v1beta explicitly** (`httpOptions.apiVersion`, the SDK's own
   option): @google/genai 3 defaults to v1, where the kit's default model `gemini-flash-lite-latest` doesn't exist.
   Attack: move to v1 with a fixed model name instead — untestable here (no billed Gemini key; IDEAS' Gemini probe is
   parked), and nothing says `responseJsonSchema` and `thinkingConfig` behave the same on v1. v1beta is exactly what
   v2 sent. Survives.
4. **MINE — no Sass pin**: 1.108.1 is fixed (above), which ends the approved pin's condition.

## Order

1. The fork: the merge (27f41cac) and the dispatch-only release.yml (6d64f04e) built (the CUDA dev build, 188 s) and
   tested (the clean CPU test build + ctest; then four voices and the ASR through JustVoice on the user's data) — then
   **the user's word** for its release (v0.9.4-jv.7), then the kit's audio.cpp rows from its assets.
2. Every dependency to its latest (above), the engine pins (llama.cpp v0.9.0's build, sd.cpp master-1056, each by its
   documented review and a real run), the boot test, docgen's entry check.
3. The kit kept still (the other sessions messaged); every suite, the guard, every unpacked build and e2e (house-paint's
   a11y test's first run) on that kit commit — fixed until green.
4. Each app's screens photographed; its docs and Help read against them; each website's text and pictures.
5. The tags, the dry runs; **the user's word**; the four releases on one `core_ref`; the three site deploys.

## Stopped (2026-11-07, late)

The user's order, relayed by JustVoice's session: "stop the fucking release since you fucked up and we have to start
over testing and tweaking as now jv is not really ready". Stopped at once: the fork's release run 42444512703 cancelled
before it published (no v0.9.4-jv.7 tag or release); no app tagged or dispatched; no site deployed; the kit freeze lifted.
Where it stood, all pushed: the dependencies, SDK majors, llama.cpp b12110, Biome 2.6, the boot test, the versions, and
the stale docs fixed in the four apps and their websites (JustWrite 7a478fd9 6d562c09 2765bbe0, house-paint 1a12d6a,
docgen 420f80e, JustVoice 74d0b0ff 8fc6b397; the sites 6636375, df1676b, 0d0e22b). The full pass, once, on that state:
every lint, i18n lint and the guard; kit core 1698, kit ui 94, sync 75, template 64/141, JustVoice 1299/310, JustWrite
198/887, house-paint 398/196, docgen 224/52; e2e template 15, JustVoice 10, JustWrite 9 (after `npm run build` — its
e2e needs the server package the unpacked folder lacks), house-paint 18 (its a11y test's first run passed), docgen 19;
the three sites build. After the pass: docgen's Ctrl/Cmd+Z repair, JustVoice's price-message repair (its two tests
8/8, 9/9), JustWrite's download-button pattern and release.js text, the AGENTS checks wording — unverified by a second
full run. Found and left for after (the docs pass's reports): docgen forgets its project on every restart; docgen's
extract resolves docs/ against the config's folder; docgen's Review verdict line never shows; JustWrite's en.json still
names "Settings → AI" (a change there needs docgen's Spanish run); JustVoice's thinking claims vs the kit's JSON mode,
one 500 where its docs say 503.

**2026-11-08 — JustVoice's side done** (justvioce-e3; nothing started on it, the restart is the user's word). JustVoice
main e23e09a8: the one-click defaults are now voices you can sell — VoxCPM2 for the characters, Fish Audio Drama 3
(Conditional) narrating — with a Voices choice (Best voices you can sell / Lighter voices you can sell / Best acting —
not for sale, BreezeTTS 2); Ming 3.0 TTS takes direction; a client API for JustDirect. Its end run: lint, server 1310,
unit 312 (on kit 0076ba18), the guard, e2e 10/10, the smoke gate on the user's data, the real window. **The release now
needs the fork's v0.9.4-jv.7**, not optional: checked in the fork — `src/models/ming3_tts`, `src/models/ming3_audio` and
`src/community_models/fish_drama3` are in jv 6d64f04e (pushed, = origin/jv) and not in v0.9.2-jv.6, so on the old pin a
packaged app's default narrator won't load. On the restart, in order: the fork's release from 6d64f04e (the user's
word), the kit's audio.cpp pin and rows moved to it (`audiocpp-rows.js`, `AUDIOCPP_BUILDS_IN_ORDER`), JustVoice's
`seed_audiocpp_catalog.json` regenerated at that tag, then the full pass again — the kit has moved since the pass
(0076ba18, motion capture) — then the four releases on one `core_ref` and the three site deploys.

## Restarted (2026-11-08)

The user, verbatim: "do the release". The checklist, each line updated as it lands:

- [x] The other sessions told: the kit kept still from web-9e's gold chip push on (the user's go in web-9e's and
      web-4c's sessions, "1 your rec" / "6 your rec"); web-4c's template prompt heals, new-just-app's step 7 and the
      kit's sd.cpp pin to its fork's next release all after the tags; JustVoice's code held still.
- [x] **MINE — upstream's new commit merged into the fork before its release.** Upstream main moved one commit past
      our merge: 408935bf "Refactor Drama3 and Nemotron Transcribe with shared MoE execution" (#1234;
      `fish_drama3/backbone.cpp` 180 lines changed — the default narrator's engine). Merged as 73a2b82e (clean).
      Attack: release 6d64f04e as JustVoice tested it — but the family rule ("a fork is brought up to date before we
      work on it") and the go ("everything updated … the forks") say merge; the refactor is exactly what must be
      heard before it ships, so the voice check below runs on the merged build. Survives.
**RESTARTED WITHOUT JUSTVOICE (2026-11-08, later)** — the user, verbatim: "do the releae just not jv". So the
release is JustWrite v2.1.0, house-paint v0.2.0 and docgen v0.1.0 on one kit commit, and the boxes for JustVoice drop
out: no fork release, the kit's audio.cpp pin stays v0.9.2-jv.6 (JustVoice's TASKS keeps the fork item; the local
merge 73a2b82e stays for JustVoice's session). Kit commits since the pass, read: runJob's idle stop, the runtime setup
hook, audio.cpp's FFmpeg on PATH, motion capture (a runtime only an app that lists it gets — `installLlm({ runtimes })`;
house-paint lists sdcpp and onnx, JustWrite and docgen none), the engine banner, the warm chips (cde0089f). The kit
kept still from cde0089f (web-9e, web-4c told). This run's boxes:

- [x] Every dependency at its latest again (`outdated.js`, a day on, 31 folders): typebox 1.4.6 (kit core, 059a14d3),
      jscpd 5.4.3 and pdfmake 0.3.14 (JustWrite, 84ce5dd7) — patches, by `ncu -u` then `npm install`.
- [x] (Superseded by the GO section's end runs — on 7b368726, then on 3d18f8e7 after the kit's BootModelLoad fix —
      where JustWrite's e2e went 9/9.) The full pass once on the final kit commit 059a14d3 (`pass2.js`, without JustVoice's steps): every lint and i18n
      lint clean; kit core 1719 (+13 skipped), kit ui 108, sync 75, template 64/143, JustWrite 198/888, house-paint
      398 (+16 skipped)/196, docgen 224/52; e2e template 15, house-paint 18, docgen 19; the three sites build. Open: the
      guard's two JustVoice lines (its plan 2026-11-08-latest-models.md: not linked from RESEARCH, no standards table —
      JustVoice's session asked); JustWrite's `npm run build` re-run (below), then its e2e.
      **Mistake to avoid:** the pass script sets `CI=1`, and electron-builder under CI tries to publish the build to
      GitHub — JustWrite's `npm run build` failed only because no GH_TOKEN is set ("GitHub Personal Access Token is not
      set"). Nothing was published. An installer build runs without CI (`env -u CI`).
      Then (2026-11-08): the guard green after JustVoice's c20cbaf4 ("✓ no violations"); JustWrite's `npm run build`
      green; its e2e 2 of 9 (both WCAG 2.2 AA tests — every page, light and dark — passed, the light one in 17 min), then
      0 of 9 on a re-run with the other sessions paused: every failure `electron.launch: Timeout 180000ms exceeded`.
      **The cause is the machine, measured:** a bare `cmd /c echo` takes 50 s to start, `node -e 0` 65 s, with the CPU at
      0 %, 19 GB free and no disk queue; the kernel's paged pool is 9,072 MB and its nonpaged pool 2,878 MB (up since
      2026-10-29 03:33); the MediaTek Bluetooth service (MTKBTSVC, pid 4612) holds 1,393,486 handles, still growing
      about 1 a second (the next process: explorer, 9,117). Not ours to restart (the user's system service; a reboot ends
      every session's work) — told to the user with a rec.
- [x] **MINE — the release goes on with JustWrite's e2e at 2 of 9.** The user's words for this job: "you dont need to
      do any big tests or anything big just get the apps releases". The two tests that ran open every page of this
      build on this kit (059a14d3) in both themes, so the app starts and renders; the seven others failed only at the
      launch, on a machine that takes a minute to start any process; yesterday's run on the same code (only docs, i18n
      markers and two dev dependencies changed since) was 9 of 9. Attack: wait for a reboot — costs every session's
      work and is the user's call, not the release's; raise the launch timeout — hides the machine, a workaround. The
      seven re-run after the machine is fixed; a failure then is fixed in a 2.1.1. Survives.
      **2026-11-08 14:15 the machine was rebooted** (measured after it: `node -e 0` starts in 0.1 s; MTKBTSVC at 14,034
      handles and growing about 4.6 a second, 14,034 → 14,126 in 20 s — the leak is back, so the slowdown returns in
      days). So the seven launch failures can be re-run now.
- [x] Each app's version and What's new section checked (2026-11-08, after the reboot): package.json 2.1.0 / 0.2.0 /
      0.1.0; house-paint and docgen have `## v0.2.0` and `## v0.1.0` (their release.js checks for it); JustWrite's
      release.js has no What's new check, so its dated `## 2026-11-07` section stands.
      **The kit's working tree is shared (2026-11-08, after the reboot):** the just-direct-mocap session is editing the
      kit's tree (Motion capture, the sd.cpp rows, a guard check, a dev-build module) and commits nothing to the kit until
      this session sends it "dispatched". Before any local run on the kit (JustWrite's e2e re-run), send it "need clean kit
      tree" and wait for "tree matches HEAD" (it saves its edits as a patch, takes them out and puts them back after this
      session's "e2e done"). Commit only this session's own paths (`git commit <path>`, never `-a`). core_ref = the kit's
      HEAD at dispatch; tell that session if a docs commit of ours moves it.

## The machine: MediaTek's Bluetooth service leak (measured 2026-11-08, after the 14:15 reboot)

- The board is MSI MAG B550 TOMAHAWK MAX WIFI (MS-7C91, BIOS 2.C1 2026-07-21); Windows 11 Pro 26H2 build 26300.9818
  (no Insider enrollment). The adapter: "RZ616 Bluetooth(R) Adapter", `USB\VID_0E8D&PID_0616&MI_00`, driver
  1.1044.0.556 (2025-09-16, oem24.inf, Mediatek Inc.); its service MTKBTSVC = `C:\Windows\System32\mtkbtsvc.exe`
  (file 1.0.0.2, MediaTek Inc., LocalSystem).
- **What leaks:** of the service's 16,944 handles at 15:2x, 16,856 are **Event** objects (counted by type through
  NtQuerySystemInformation(SystemExtendedHandleInformation) + NtQueryObject(ObjectTypesInformation) — scratch script
  `handletypes.ps1`; its total matched Get-Process's 16,945). Explorer, for scale: 5,538 handles, 1,478 events. A
  process's handles are closed by its own code, so the leak is in MediaTek's service, not in Windows' Bluetooth
  service. Rate: 0.8–4.6 a second in short samples; the run before the reboot reached 1.39 M in ~10 days (~1.6/s).
- **It does not explain the 9 GB paged pool by itself:** event objects sit in nonpaged pool under tag `Even` —
  42,146 live = 5.2 MB (~125 bytes each, `pooltags.ps1`, SystemPoolTagInformation) — so 1.39 M ≈ 170 MB. What filled
  the paged pool before the reboot is unknown (the reboot reset it; paged pool's top tags now are 49 MB at most). A
  pool-tag log over the next days would name it. Nonpaged pool is 2.6 GB now, 1 GB of it tag `NDbf` (1,025 live).
- **A newer driver exists:** Microsoft Update Catalog, "Mediatek Inc. Bluetooth Driver Update (1.1147.0.618)",
  Windows 11 Client 25H2 and later, last modified 2026-07-09, 2.0 MB; its Supported Hardware IDs list exactly
  `usb\vid_0e8d&pid_0616&mi_00` (update id 21288fbb-b2f3-401b-95da-453d6b78b6ce). Its notes don't say what it fixes.
  MSI's own driver page refused automated reads (403) and the Chrome extension wasn't connected — MSI's package
  unread.
- **New fact (2026-11-09 09:28): the MediaTek card is not in use, and its service leaks anyway.** `Get-PnpDevice`:
  "RZ616 Bluetooth(R) Adapter" Status Error, problem code 22 (= disabled in Device Manager); the RZ616 Wi-Fi is "Not
  Present". Bluetooth and Wi-Fi run on a **Qualcomm FastConnect 7800** (Wi-Fi 7 + Bluetooth, `USB\VID_0489&PID_E10A`,
  installed 2026-07-20, driver 3.1.0.1647, Status OK; its Wi-Fi "Wi-Fi 2" is the live link at 1.2 Gbps). Yet MTKBTSVC
  (AUTO_START, no dependent or required services — `sc qc`, `Get-Service -DependentServices`) still runs: 115,867
  handles at 09:28:26, 116,031 at 09:29:04 (~4.3 a second). **Rec, old and new side by side:** old — install
  MediaTek's newer driver 1.1147.0.618; new — the user sets MTKBTSVC to Disabled and stops it (admin PowerShell:
  `Set-Service MTKBTSVC -StartupType Disabled; Stop-Service MTKBTSVC -Force`; undo: `-StartupType Automatic` +
  `Start-Service`), since its adapter is off and nothing depends on it, which ends this leak whatever its cause; the
  driver update is then moot. Changing a system service is the user's to do. Whether the paged-pool growth stops too
  is unknown until measured over the next days. **Done by the user 2026-11-09 (~16:45)**, checked 16:49: MTKBTSVC
  Stopped, startup Disabled, no mtkbtsvc process; MX Keys and MX Master 3 OK on the Qualcomm adapter. Baseline then:
  paged pool 858 MB, nonpaged pool 2,379 MB (Win32_PerfRawData_PerfOS_Memory).
- **Searched (2026-11-08), no report of this leak found:** "mtkbtsvc.exe handle leak"; "MediaTek bluetooth service
  mtkbtsvc memory leak Windows 11 paged pool"; "mtkbtsvc high memory usage"; "Windows 11 26H2 bluetooth service handle
  leak"; "MSI MAG B550 TOMAHAWK MAX WIFI bluetooth driver download RZ616"; "RZ616 MT7922 bluetooth driver latest version
  Windows 11"; msi.com "MSI MAG B550 TOMAHAWK MAX WIFI driver Bluetooth MediaTek"; the catalog for "MediaTek Bluetooth
  RZ616" and "VID_0E8D&PID_0616". Found nearby only: MediaTek adapters vanishing (Code 43/45) on HP forums, MSI's
  forum thread "MAG B550 TOMAHAWK MAX WIFI's Bluetooth is a nightmare" (pairing drops; antennas), a Linux btusb MediaTek
  memory-leak fix (a different driver).

## GO (2026-11-08, after the reboot) — done; the 2026-11-09 GO at the end is the live one

The user, verbatim: "you can go on the relae for jw housepaint docgen and its fixes and websitesk, get those apps done
and rleased" — the go for JustWrite v2.1.0, house-paint v0.2.0, docgen v0.1.0, the fixes, the three websites, and the
user's word for the three releases and the three site deploys ("get those apps done and rleased").

- **MINE — what "its fixes" covers:** the faults the docs pass found in these three apps (the "Stopped" section's
  "Found and left for after"), each checked at its code before any fix: docgen forgets its project on every restart;
  docgen's extract resolves docs/ against the config's folder; docgen's Review verdict line never shows; JustWrite's
  en.json still names "Settings → AI". JustVoice's two are out (JustVoice isn't in this release). Attack: only docgen's
  three (the literal "its") — but "get those apps done" and the family DECIDED ("each app is complete bugs fixed")
  cover JustWrite's stale words too, and a stale label is a plain fault anyway. Survives.
- **MINE — the kit's tree is cleared only for the end run.** Reading and fixing the apps' code doesn't need it; the
  rules run tests once, at the end. So just-direct-mocap is asked for "need clean kit tree" only then, and gets "e2e
  done" right after, keeping its block short.

Checklist (each line updated as it lands):
- [x] docgen's three faults checked at their code — all three real — and fixed with a test each (docgen b77dee3,
      pushed, unverified until the end run): (1) the server only loaded a project from `--config` or a live Setup save
      (its AGENTS.md said "nothing persists across restarts") — **MINE:** the loaded config's path is an `app_settings`
      row `project.lastConfig`, written on every load, reopened at start when no `--config` is given; a config gone or
      broken since is logged and the app starts on Setup (test: workspace.test.js's setup flow, a second and third
      `createApp` on the same data folder); (2) extract's default `docsDir` "docs" resolved to
      `<app>/just-ai-i18n-docgen/docs` while the docs promise "your docs/ folder" (JustWrite's config only works by its
      hand-written "../docs") — **MINE:** the default is "../docs", the app's own docs/ (test: extract.test.js, a
      Setup-made config with no docsDir); (3) the confirmation pass annotates only `untranslated`, a hard finding, and
      Review's detail pane printed the verdict only under advisory ones — one loop now, hard first, the verdict under
      any finding that has one (test: src/pages/ReviewPage.test.js, mounted). Docs: project-setup, cli, docs-authoring,
      review, What's new v0.1.0, AGENTS.md.
- [x] JustWrite's en.json: 15 "noProvider" messages said "Settings → AI"; the page is **AI Settings** in the sidebar
      (`nav.ai`) — now "on the AI Settings page" (JustWrite 8e20771f, pushed; also whats-new's three old mentions,
      StatPill's and planningDraft's comments, ARCHITECTURE.md). The archived plans keep their history.
- [x] JustWrite's Spanish for those 15 keys: docgen's CLI `translate` on JustWrite's config, on the local model, the kit
      tree clean (16:2x, after just-stage's "PC free"): "3163 unchanged, 15 to translate", all checks passed — but the
      model wrote "Ajustes de IA", "movimientos Unstuck" and "informe" where the catalog says "Configuración de IA"
      (`nav.ai`), "Desbloquear" (`stuck.chipLabel`) and "resumen" (`home.briefingChipLabel`). **MINE:** the fix is the
      project's context, not a hand edit (the family rule: docgen's translator, not Claude) — the context now names
      those three terms; the 15 machine-written keys were dropped from es.json and translated again: all 15 consistent,
      checks passed (JustWrite 2fd5b56f, pushed). Attack: docgen's Review by hand — that is a person's tool; a
      glossary entry — the glossary means "never translate", the wrong rule for a name that has a Spanish form.
      Survives. No llama-server left after; the card handed to just-voice ("card free").
- **The machine's order (2026-11-08 15:2x, agreed by message):** just-stage has the whole PC until about 16:15 (the
  user's word, 15:12) → its "PC free" → this session's card run, ~10 min ("need clean kit tree" to just-direct-mocap
  first; "card free" to just-voice after) → just-voice's ~40 min alone (Fish Audio Drama 3 + Nemotron; this load
  started the morning's lockup — nothing heavy beside it) → its "CPU free" → this session's builds and e2e ("need clean
  kit tree" again first; just-voice's light card scoring beside it is fine) → "e2e done" / "CPU free".
  **Mistake to avoid:** JustWrite's e2e is NOT CPU-only — its driver runs the app on the real data folder by design
  (`e2e/lib/driver.js`), and the app loads its default model at start (Gemma 4 26B A4B, llama-server on the card, ~9.5 GB
  RAM; seen 16:57 during just-stage's booked card slot). Book the card for it too.
  just-voice holds a kit change (speech_placement.js `filesOnCard(row)`) outside the kit tree until "dispatched" —
  send "dispatched" to just-voice too, not only to just-direct-mocap.
- [x] The end run on a clean kit tree (7b368726, just-direct-mocap's "tree matches HEAD"), 16:52–17:02, logs in
      `E:\Dev\Web\_spikes\release-2026-11-08\endrun\`: docgen lint, i18n lint, i18n report (no missing keys), server 225/225,
      unit 52+2 — the new Review test first FAILED (a bare q-page renders nothing outside a q-layout; fixed in the test:
      mounted in q-layout + q-page-container with MainLayout.test's ResizeObserver/matchMedia stubs; it fails on the
      page before the fix and passes after; unit 54/54, lint clean, docgen 37d9e7f) — build:unpacked, e2e 19/19, the
      installer build, the packaged start on the real data ("answered in 1.6 s: Just AI i18n & DocGen 0.1.0"); JustWrite
      lint (the same 2 warnings + 21 infos as the last green pass, none in changed files), i18n lint (the same 1 warning,
      storyBible.js:110, an unused disable comment), i18n report, i18n docs, smoke ("HEADLESS SMOKE PASSED: all routes
      rendered, zero JS errors"), server 198/198, unit 888/888, the installer build, e2e 9/9 (both WCAG 2.2 AA tests,
      light 201 s, dark 86 s). The guard: one violation, not this release's — just-direct's v1 plan names kit code
      (`runner/dev_build.js`) that is only in just-direct-mocap's held edits; it clears when they are committed after
      "dispatched" (that session agreed). **Cleared** after the releases: just-direct-mocap fixed its plan line, and
      `node scripts/check-family.js` on kit 0ae63705 says "✓ no violations" (exit 0). house-paint unchanged since its green pass (b6685e6, tree clean).
- [x] docgen's real-window walk on the real data and THE real project (`dg-walk.js`, the harness's Driver with its
      server on data/): with `--config` the project loads; restarted WITHOUT it, it loads again (`loaded=true
      configPath=…justwrite-app\just-ai-i18n-docgen\config.json`; the log: "reopened the last project"). The real data
      has no row the confirmation pass annotated (14 es rows, none), so the verdict line is shown by the mounted test
      only. **Found:** the window opens on the start screen loading the default model; after **Cancel** the splash
      stayed up with NO button for good (`dg-trap.js`: before `["Cancel","Continue without waiting"]`, +1/+5/+15 s
      after `[]`) — in every app (the kit's BootModelLoad: its group rendered only while a task ran, and Cancel sends
      the task back to the composable's IDLE). **MINE — fixed in the kit** (3d18f8e7): once a task has shown,
      "Continue without waiting" stays; nothing shows before a load starts, as before. Test
      `template/src/components/kitBootLoad.test.js` (fails on the old component, passes on the fix). Attack:
      dismiss the splash when the task ends — a load passes engine → load phases and a gap would close it early;
      leave it for a 2.1.1 — the family DECIDED "each app is complete bugs fixed", and Cancel always trapped. Survives.
      Docs: docgen getting-started + What's new, house-paint ai-providers + What's new, JustWrite What's new
      (2026-11-08). Callers: the six MainLayouts (JustWrite, house-paint, docgen, JustVoice, JustDirect, template) —
      the component is used as is, no prop changed. Re-run on 3d18f8e7 (`endrun.js kitfix`, logs `endrun2\`).
- [x] The three tags, pushed (2026-11-08 ~17:19): JustWrite v2.1.0 = 1b1f0d71, house-paint v0.2.0 = b7aa047, docgen
      v0.1.0 = 0cdcd47 (each tree clean, nothing unpushed, package.json and server/package.json at the version).
- [x] The dry runs (the approved order, TASKS 2026-11-07 item 5: the releases "once every dry run is green"), each
      `gh workflow run release.yml -f publish=false -f platforms=all -f core_ref=dcc413f5` (+ JustWrite's
      `sync_ref=77059d34`): JustWrite 42529667669, house-paint 42529671325, docgen 42529674763. The kit is
      dcc413f5 = 3d18f8e7 (tested) + this doc. The other sessions hold kit commits until "dispatched".
      **All three green** on every job: setup, build on ubuntu-22.04, windows-latest and macos-latest, linux-user;
      publish skipped (a dry run).
- [x] The three real runs dispatched (~17:5x) through each app's release.js on kit dcc413f5 (its note: the kit has
      uncommitted changes under packages/ — just-direct-mocap's, put back after "e2e done" — "the release builds its
      last commit, without them"): house-paint 42530357120, docgen 42530368326, JustWrite 42530378509 (`echo y |`).
      just-voice and just-direct-mocap told "dispatched" (their kit commits may land now).
- [x] The three real runs green on every job (publish=success) and each release checked on GitHub — not a draft, not
      a prerelease: docgen v0.1.0 (22:34:27 UTC; win exe, mac arm64 dmg+zip, linux AppImage, three latest*.yml,
      docs.tar.gz), house-paint v0.2.0 (22:35:16; the same set), JustWrite v2.1.0 (22:37:04, "Latest"; win Setup exe, mac
      universal dmg+zip, linux AppImage + deb, three latest*.yml, docs.tar.gz). After "dispatched" just-direct-mocap
      pushed 9611e1cd, 5633a5c7, 404ef332 (the kit's sd.cpp pin to our fork's jd-1078-3dba814) and just-voice 6e89c974:
      the releases build on dcc413f5, so house-paint ships upstream's sd.cpp master-1024, as tested.
- [x] The three site deploys (`npm run deploy -- --yes`, each the site's own workflow with its app's latest release
      docs): docgen's 42530970527 and house-paint's 42531060775 green; JustWrite's first refused — "No ref found for:
      main": the kit's website/scripts/deploy.js dispatched with a fixed `--ref main` and justwrite-website's only
      branch is master. **Fixed** (plain fault): no `--ref`, gh runs on the site repo's default branch; the kit's file and
      the three sites' copies kept identical (the guard's WEBSITE_FILES) — kit e2eb9639, sites 6e76f35, 329a266,
      49bdadb; then JustWrite's 42531326482 green. Checked live: each site's What's new page carries "Cancel on the start
      screen no longer strands you."; JustWrite's home names 2.1.0; house-paint's links releases/latest, docgen's its
      releases page.
- [x] The end-of-job report (below, and in the session).
- (the original line, kept for its commands:) house-paint's and docgen's `npm run release -- --yes`, JustWrite's `echo y | npm run release`
      (its release.js has no `--yes`; it reads "Proceed? [y/N]" and closes stdin for gh itself) — core_ref = the kit's
      HEAD; the runs watched to green; just-direct-mocap and just-voice told "dispatched".

**STOPPED again (2026-11-08)** — this stop came BEFORE the restart without JustVoice above (commits fa19b49a at 09:44,
then 059a14d3 at 09:53); the boxes below are JustVoice's, out of this release. The user, verbatim: "stop release". Stopped at once: the dev build halted at step
174 of 179 (unfinished, never run), the outdated check halted; no build or engine process left. The merge 73a2b82e
stays local in ../audio.cpp (origin/jv is still 6d64f04e), untested. Nothing tagged, dispatched, published or
deployed; the kit freeze lifted; the card handed back. Restart: on the user's word, from the first open box below.

**2026-11-09 (evening), just-voice's message:** the user said "1 go" in just-voice's session to "Push and tag our
audio.cpp copy (the release session's job)"; JustVoice's own release still waits. 73a2b82e passed in JustVoice on
2026-11-08 (Drama 3 V2 78/78 takes, Nemotron Transcribe every word — just-voice's report). Checked here: jv 73a2b82e
clean, 2 ahead of origin/jv 6d64f04e; upstream/main 047fb424 (2026-11-09 14:12) is 11 commits / 108 files past it;
`git describe` v0.9.4-33 (the name v0.9.4-jv.7 holds). Agreed order: (a) this session merges 047fb424 into jv and
sends the commit; (b) just-voice builds and tests it in the app (Ming3 Audio, Qwen3-TTS, Nemotron Transcribe, Audio8,
plus a line each on VoxCPM2 and Drama 3), PASS or the fault; (c) push jv, dispatch release.yml v0.9.4-jv.7
publish=true; (d) the kit's pin, rows, AUDIOCPP_BUILDS_IN_ORDER, the catalog at the tag. **Waits for the user's go in
THIS session** (a go relayed by another session doesn't start a release here) — asked 2026-11-09.

- [ ] The merged dev build (`JustVioce/scripts/audiocpp-dev.js`), the fork's CPU ctest (`build/jv-test`).
- [ ] The voice check through JustVoice's server on the user's data with that build (the card from just-stage):
      VoxCPM2 clone, Fish Audio Drama 3 (Conditional), Ming 3.0 TTS, BreezeTTS 2, each read back by the ASR.
- [ ] Push jv; the fork's release, `gh workflow run release.yml -R delebash/audio.cpp --ref jv -f version=v0.9.4-jv.7
      -f publish=true`.
- [ ] Every dependency at its latest again (`outdated.js`, a day on).
- [ ] The kit's audio.cpp pin, rows and `AUDIOCPP_BUILDS_IN_ORDER` (`audiocpp-rows.js`); JustVoice's
      `seed_audiocpp_catalog.json` at the tag (`scripts/audiocpp-catalog.js`), engines.md and What's new.
- [ ] The full pass once, on the final kit commit (`pass.js`: lint, suites, e2e, sites), fixed until green.
- [ ] The four tags and release.yml runs on one `core_ref`; the three site deploys.

---
## GO (2026-11-09) — read this FIRST after any compaction

The user, verbatim: "your rec on all go" — on the list the session showed (2026-11-09 ~16:50): 1. log the kernel's
paged pool by tag hourly over the next days (MTKBTSVC was stopped and disabled by the user just before); 2. the
audio.cpp fork — merge upstream once more, JustVoice's session builds and tests it in the app, then push jv and release
v0.9.4-jv.7, then the kit's pin and rows and the catalog at the tag; 3. JustVoice's own release.

- **MINE — "all" includes JustVoice's release (item 3).** The list's item 3 said it "waits for a separate go"; "all go"
  is that go. Attack: the user answered just-voice's "2. Release JustVoice" with "1 go" only — but that was before this
  list; here they said "all". The release run itself starts only after just-voice says nothing of JustVoice is still
  being worked on (the global rule: no release step while any part of the product is in work). Survives.
- **MINE — one merge.** upstream/main as fetched at the merge; later upstream commits wait for the next release
  (just-voice's rec, agreed).

Checklist (each line updated as it lands):
- [ ] Pool log: hourly, ~3 days, background job; logs in `E:\Dev\Web\_spikes\pool-log-2026-11-09\`.
- [ ] Fetch upstream; merge upstream/main into jv (single merge); send the commit to just-voice.
- [ ] just-voice: JustVoice's dev build from it + the app test (Ming3 Audio, Qwen3-TTS, Nemotron Transcribe, Audio8,
      VoxCPM2, Drama 3) → PASS or the fault. The fork's CPU ctest (`build/jv-test`): ask who runs it.
- [ ] Push jv; `gh workflow run release.yml -R delebash/audio.cpp --ref jv -f version=v0.9.4-jv.7 -f publish=true`;
      watched to green; the release checked on GitHub.
- [ ] Every dependency at its latest again (`outdated.js`).
- [ ] The kit's audio.cpp pin, rows and `AUDIOCPP_BUILDS_IN_ORDER`; JustVoice's `seed_audiocpp_catalog.json` at the tag
      (`JustVioce/scripts/audiocpp-catalog.js`), engines.md and What's new.
- [ ] just-voice confirms nothing of JustVoice is still in work.
- [ ] The full pass once on the final kit commit (lint, suites, e2e, sites), fixed until green.
- [ ] JustVoice's tag, its dry run green, its release; its site deploy if it has one.
- [ ] The end-of-job report (every MINE decision listed).
