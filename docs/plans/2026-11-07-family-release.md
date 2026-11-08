# The family release — JustWrite, house-paint, docgen, JustVoice, the kit and our audio.cpp fork (2026-11-07)

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
**STOPPED again (2026-11-08)** — the user, verbatim: "stop release". Stopped at once: the dev build halted at step
174 of 179 (unfinished, never run), the outdated check halted; no build or engine process left. The merge 73a2b82e
stays local in ../audio.cpp (origin/jv is still 6d64f04e), untested. Nothing tagged, dispatched, published or
deployed; the kit freeze lifted; the card handed back. Restart: on the user's word, from the first open box below.

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
