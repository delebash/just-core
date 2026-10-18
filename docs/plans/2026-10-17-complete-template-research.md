<!-- SPDX-License-Identifier: MIT -->
# The complete template — research evidence (2026-10-17)

Saved 2026-10-17 from session e638ccef (run from `E:DevWeb`) so the reports survive context
compaction. Three read-only agents worked for the complete-template plan (TASKS: "A standard start for
every new just app"). Their reports follow verbatim. Paths are as of 2026-10-17, before the kit's
rename to just-core (`server/` → `packages/core/`, `ui/` → `packages/ui/`). The register's distilled
facts: [RESEARCH §2](../dev/RESEARCH.md#2--the-family-stack-electron-node-phones), "The complete template".

## A · Standards coverage map — every part of an app against the written standard that governs it

*Agent `abd345e9ba3e774d7`, read-only, 2026-10-17 — its report as handed back, not re-checked by the session that saved it.*

**Standards coverage map for the "just" app family (read-only, 2026-10-17)**

I edited nothing in any repo. I wrote one word-count file in the session scratchpad.

**Key.** These short names stand for the repos and files:
- kit = `E:\Dev\Web\just-llm-runner`
- JW = `E:\Dev\Web\justwrite-app`
- JV = `E:\Dev\Web\JustVioce`
- DG = `E:\Dev\Web\just_ai_i18n_docgen`
- SYNC = `E:\Dev\Web\just-sqlite-sync`
- G = `C:\Users\danel\.claude\CLAUDE.md`
- AS = kit `docs/app-structure.md`. Section start lines as read: Q.1 37 · Q.2 88 · Q.3 153 · Q.4 200 · Q.5 249 · Q.7 273 · Q.8 303 · Q.9 318 · Q.10 334 · Q.11 385 · §2 448 · §4 503 · §5 562 · §8 590 · the AI-call convention 660 · §10 702 · §11 723 · §12 890 · §13 922 · §14 958 · Open deviations 989.
- FR = kit `docs/family-rules.md`.

The kit's TASKS.md changed while I was reading it (another session is editing), so I cite it by heading. Verdicts: **C** complete · **P** partial · **A** app-specific only · **N** none.

#### UI
- **Tokens, theme, dark mode — P.**
  - Docs: AS Q.4 and §4; kit `ui/src/common/tokens.contract.css` (colour roles, radius, font, `.ui-w-*` width caps); `common/services/appearance.js` (the Appearance knobs); kit `docs/plans/2026-10-09-kit-controls-on-quasar.md` §2 (Quasar sits in the lowest cascade layer; dark mode via `data-theme`).
  - Missing: no type scale, spacing scale, density rule or minimum text size. JV's 12.5 px text floor applies to JV only. The dark-mode rule exists only in that plan.
- **Layout — C.**
  - Docs: G (Layout and Stack); AS §4 and Q.4 (`pageFill`/`pageFlow`); JV design-law #2 and #7.
  - Rules: a `height:100%` chain, one scroller per area, controls sized to content.
  - ⚠ G names `styles.css` and `services/serverApi.js`. The apps have `src/css/app.scss`, and `serverApi.js` is the kit's file. G says prose fields are "~60ch"; the kit sets `--w-prose: 640px`.
- **Components — P.**
  - Docs: FR rule 3; AS Q.4 and §4 (kit first, one `intent` prop, "name your donor"); the kit-controls plan §2–3 (how a control is built on Quasar).
  - The only written `Ui*` API reference is JW `docs/dev/ui-kit.md`.
  - ⚠ kit `ui/README.md` is stale (Python core, pydantic, `Toast`) and tells hosts to call `configureLlmUi`, which AS §4 forbids.
- **Page patterns — P.**
  - AS §11 fully specifies the standard chrome: the Settings order, `/ai`, the boot splash, the once-ever AI offer, and "port the donor's states".
  - Generic list/detail pages, toolbars and empty/loading/error states have kit components (`PaneHeader`, `EmptyState`, `UiBanner`), but their rules exist only in JW `ui-kit.md` and JV design-law (`.jv-lib-toolbar`).
- **Navigation — P.**
  - Docs: AS Q.1 and Q.4 (hash routing, lazy pages, the `/offline` guard); §11 (`/ai`, `?tab=`/`?action=`, `/settings/:section?`).
  - ⚠ JV's `settings` route has no `:section`; its old sub-tab links go through sessionStorage.
- **Forms — P; client-side validation — N.** Form layout comes from G Layout, JV design-law #1–3 and JW CLAUDE "No naming popups". No doc says how a form validates input or shows errors.
- **Dialogs and toasts — P.**
  - Docs: AS §4 (`<LlmUiHosts/>`); JW `ui-kit.md`; JW `AGENTS.md` §4 (confirm vs undo); JV design-law.
  - ⚠ JW AGENTS §4 says deletes show an undo toast through `_toast()`, but there is no `_toast` in JW `src/stores/project.js`. JW architecture-notes ("Soft deletes") says there is no delete toast.
- **Keyboard shortcuts — A.** AS §14 only names `KeyboardCheatsheet.vue`. ⚠ The cheatsheet key differs: JV uses `?`, JW uses `Ctrl/⌘+/`. AS §11 says the same function gets the same mechanism.
- **Accessibility — N.**
- **Words and i18n — C for the mechanism, P for wording.**
  - Docs: AS Q.11, kit `docs/plans/2026-10-12-i18n-standard.md`, guard check 16, the copy law in AS §11, JV design-law 6b.
  - Rules: every word is a vue-i18n key, the kit's words are `kit.*`, English is the source, the i18n lint stays at 0.
  - Open: help docs in other languages, words seeded in the database, server messages, tray text. JV has no `eslint.i18n.config.js`.
- **Help docs — P.**
  - Docs: AS §14 (`helpDocs.js` on `makeDocsHelpAdapter`); guard check 9, advisory only (required pages: getting-started, ai-features, ai-providers, troubleshooting, whats-new; plus family slugs and `toc.json`); kit TASKS "The family docs standard — DECIDED 2026-08-08"; JW CLAUDE "User docs ship from docs/"; DG `docs/docs-authoring.md` (lede/hints front-matter).
  - None of this is in AS §13.
- **Mock built in the app — A, by decision.** It lives in JV's CLAUDE.md. The user kept it out of FR on 2026-10-09 (kit TASKS, "The family standard: one short rules file…").

#### Server
- **Architecture — C.**
  - Docs: AS Q.3 and §14; kit `server/README.md` "Consume it"; kit `docs/plans/2026-10-09-hono-standard.md` §10.
  - Rules: Hono comes from the kit (one copy), the guards are added before the routers, and each router file is `<area>_api.js`.
  - ⚠ That plan's header still says "Nothing is coded yet". `2026-10-07-kit-in-javascript.md` §3 rule 17 still describes Fastify plugins.
- **Routes and wire format — P.**
  - Rules: everything under `/v1/*` (AS §8); camelCase JSON (§4). There is no rule for naming resources or choosing verbs.
  - ⚠ The template's `/v1/health` returns `{ok, app, product}`. §14's base shape, which all three apps use, is `{status, product, version, apiVersion}`.
- **Error envelope — P.**
  - Written only in kit `server/src/platform/errors.js`'s header (RFC 7807 problem+json, pydantic-style 422, FastAPI-style 404) and AS Q.3 ("registered before CORS").
  - Two shapes exist (`errors: "problem" | "fastapi"`). DG uses fastapi, which is a listed deviation.
- **Validation — P.** Only the hono plan §5/§9/§10 covers it (`input()`, TypeBox schemas via `platform/models.js`, ajv with Fastify's options).
- **Auth, CSRF, CORS — C.**
  - Docs: AS Q.3 and §11 Server.
  - Rules: bearer tokens, off while the list is empty and loopback exempt; a CSRF origin allowlist (`app://<id>`, Capacitor, the dev server); CORS proven by a test that sends an `Origin:` header.
- **Database and migrations — A.**
  - Docs: FR rule 2; AS §14 (file list only); kit `platform/sql.js` header; JW `docs/dev/ARCHITECTURE.md` "Storage policy" (drop and reseed); JW CLAUDE "No JSON blobs"; SYNC `README.md` "Rules for a synced table" (random ids, never AUTOINCREMENT).
  - ⚠ `sql.js`, `data_api.js` and the apps' `models_schema.js` cite `scripts/capture-schema.py`, which is tracked in no repo.
  - ⚠ JV `docs/dev/design-decisions.md` §2 says "idempotent column checks", but JV `server/src/database/session.js` and JW both follow "no migrations".
- **Seeds and no hardcoded values — P.** FR rule 1, AS §8, JW CLAUDE "seed ships FACTS and RULES". Nothing explains how to write a seed.
- **Settings and prefs — P.**
  - Docs: AS §14 (`/v1/prefs`, `stores/ui.js`); §8 (an app's own table); the header of kit `platform/prefs_api.js` (how settings and prefs split).
  - JW's `/v1/settings` is a listed deviation.
- **Background jobs — P.** The AI-call convention (AS §8) and guard check 11 cover the client side of a task. Nothing covers server-side queues, resuming after a restart, or one-job-at-a-time.
- **Logging — P.** AS §11 covers the wiring (log ring, file log, logs router). `errors.js` sets the level from the status code. There is no policy on levels or what to log.
- **Data folder — P.** AS Q.8 defines how the root folder is found. Nothing lists what lives inside it.
- **Backups — C.** AS §11 and the `data_api.js` header: `makeDataRouter` (backup ZIP, table-copy restore, reset) plus the kit's `DataManagement` screen.
- **Sync — P.** SYNC `README.md` and `docs/design.md`, and kit `docs/plans/2026-10-08-sync-product-design.md`, document the engine. AS has no section on how an app adopts it.
- **Headless mode and CLI — C.**
  - Docs: AS Q.3, §8 and §14.
  - Rules: headless runs the app's exe as Node through `<app>-server.cmd`, and that launcher is never named like the exe. A CLI boots the stack with `installLlm(null)`.

#### AI
- **Installing the stack — C.**
  - Docs: AS §8 and kit `docs/dev/install-runbook.md`.
  - Rules: one `installLlm` call on the server and one `installLlmUi` on the client, plus seeds; always pass `dataDir`.
  - ⚠ The runbook's client half (lines 41–60) still says `vite.config.js`, `main.js` and "Tauri-webview fallback".
- **Features → presets, seeds — C.** AS §8 and kit `docs/feature-model-system.md`: each feature points at a preset, and the preset owns every tunable. ⚠ 12 of that doc's 13 server-code pointers are `.py` files.
- **AI-call convention and the Lab — C.**
  - Docs: AS §8 and §11, guard check 11.
  - Rules: app code never starts or finishes a task itself; it uses `runAiFeature(Stream)` or `withAiTask`. One progress indicator per run, and the trigger button is disabled while it runs. Pipeline apps implement `/v1/ai/prompt-preview`.
  - ⚠ JW `AGENTS.md` §2 names `runAiStream`, which now exists only in comments. §8 describes `/debug/<name>` pages; JW has no such routes.
- **Local vs cloud providers — P.** Docs: kit CLAUDE (the ruling on three vendor SDKs) and AS §8 (structured output). Where API keys are stored: not found.
- **Model cache sharing — C.** AS §8 and kit CLAUDE: one machine-wide registry, files an app generates stay per app, and the engine's port is allocated (never 8080).
- **Memory arbiter — P.**
  - Docs: kit `docs/dev/serving-design.md` and RESEARCH §1. ⚠ Both point at `llm_runner/runner/*.py`.
  - No family text says how a non-LLM GPU user (JV's speech engines) books memory.
- **Image and vision models — N.** There is one IDEAS line.

#### Desktop and phone
- **Shell, tray, keep-running — C.**
  - Docs: AS Q.2, §5 and §11.
  - Rules: `runDesktopApp` takes config only; one `window.appShell` bridge, read only by `native.js`; three ways out (open a URL or folder, call a command, save a file).
  - Tray text is English only (a noted gap).
- **Updates — P.** AS Q.2 (`updates`) and §11. DG and the template don't wire updates. ⚠ JW ARCHITECTURE says auto-update was skipped, but JW's `electron-main.js` sets `updates`.
- **Installers — P; signing — N.** AS Q.2 covers electron-builder with NSIS. JW ARCHITECTURE says signing was skipped.
- **Phone and the in-app server worker — C.**
  - Docs: AS Q.7 and kit `docs/plans/2026-10-08-the-phone.md`.
  - ⚠ Q.7 says the `workerShims` plugin swaps in `.phone.js` twins. The header of `platform/worker/esbuild.js` says "not by this plugin".
  - The rule that phone-only gaps answer "not on this device" is only in the hono plan §1.

#### Quality
- **Testing — P.**
  - Family docs cover server tests (AS Q.3), hermetic AI-stack tests (§8), the e2e harness (§10) and the boot smoke (§14).
  - No family text covers the headless smoke (which JW and JV call their "renderer gate"), renderer unit tests, flow tests with the kit's `scripts/lib/ai-stub.js`, or evals. The de facto standard is JW `docs/dev/architecture-notes.md` "Test harness detail".
  - ⚠ AS Q.9/§10 says `build:unpacked` builds what the e2e drives. JW `e2e/README.md` says it skips the server package, so use `npm run build`.
  - ⚠ JV has no `e2e/`, and that isn't listed under Open deviations. Each app's "must pass before a commit" line differs.
- **Definition of done — C.** AS §12. ⚠ It lists 4 Settings sections where §11 has 7, and it leaves out the PRD.
- **Lint — C.**
  - Docs: AS §2, Q.10 and Q.11. One `biome.json`, identical in every app and exact-pinned, plus one i18n ESLint config.
  - ⚠ G says "Biome for lint and format", but every `biome.json` turns the formatter off. JW AGENTS says "No formatter or linter".
- **The guard — C.** Kit `scripts/check-family.js`. Checks 9 and 10 are advisory. A new app isn't checked until it is added to `APPS`.
- **Performance budgets — N.**
- **Security — P.**
  - Docs: AS Q.2, Q.3 and Q.5; kit RESEARCH §2 "The shell against Electron's security checklist".
  - There is no checklist doc. Where secrets are stored: not found.

#### Process
- **Docs convention — P.** AS §13 and G. The six-field TASKS format is only in the header of JV `docs/dev/TASKS.md` and in guard check 10. ⚠ No app has `docs/dev/PRD.md`, which §13 has required since 2026-10-17.
- **CLAUDE.md and AGENTS.md — P.**
  - Docs: AS §2, kit `template/CLAUDE.md`, kit TASKS "A standard start for every new just app" (AGENTS.md decided but not built).
  - ⚠ The template's CLAUDE.md imports FR. The decision says CLAUDE.md = `@AGENTS.md` plus Claude-only lines, with no separate import.
- **Commits and CI — P.**
  - Docs: G; the template's "must pass before a commit" line; kit TASKS 2026-10-17, "CI runs only by hand". A Husky + lint-staged pre-commit hook was decided but not built.
  - ⚠ JV's `release.yml` runs on `v*` tags and its `codeql.yml` runs weekly.
- **Releases, versioning, changelog — A.** JW ARCHITECTURE "Release system", guard check 9 (whats-new page), the Updates panel in AS §11. ⚠ JW releases by manual dispatch; JV releases on a tag push.

#### Other stale content and unlisted deviations
- **Stale docs:**
  - kit `docs/dev/README.md`: Python core, venv, and three `.py` check scripts that don't exist.
  - `model-research.md:8`.
  - AS §11 cites `FeatureWorkbench.vue:235`; the call is now at :293.
  - AS Q.10 says the i18n lint stays advisory "until docgen and JustVoice have theirs"; DG has one now.
  - JV `design-decisions.md` §2: Tauri, FastAPI, "the runner is Python".
  - JV `code-map.md`: 77 lines cite `.py` files.
  - JV CLAUDE's "Where to look" points at `../justwrite-app/docs/TASKS.md`.
  - JW CLAUDE's "Known-bad" list names `.py` tests.
  - DG CLAUDE's Settings list omits Backups and Updates.
- **Outside the family rules:** SYNC doesn't import FR and requires SPDX headers on every file; the user ruled SPDX out of the family rules on 2026-10-09.
- **Deviations AS requires to be listed but which aren't:** JW's single `project` store, JV's missing `e2e/`, and the missing PRD in all three apps.
- **The template is not a complete reference app.** It has no AI stack, no §11 chrome, no help docs, no §14 skeleton, no tests and no `docs/`. It still carries Quasar's scaffold files (`EssentialLink.vue`, `example-store.js`) and `IndexPage.vue` where §14 expects `HomePage.vue`.

#### Gaps, most-hit first for a new app
1. **Database:** defining the schema, migrations, seeds and ids. Every app needs this on day one, and the tool the docs cite is gone.
2. **Screen patterns and visual scale:** page layout, list and toolbar, forms and validation, empty/loading/error states, confirm vs undo, plus type size, spacing and minimum text size. Every screen hits this.
3. **Testing beyond server tests and e2e:** renderer unit tests, the headless smoke, flow tests, evals, and what must pass before a commit. Every change hits this.
4. **Request validation and the error envelope as a written contract.** Every route hits this.
5. Where a new setting goes, and how to write seeds.
6. Server-side long-running jobs.
7. Keyboard shortcuts.
8. Accessibility.
9. A security checklist and secret storage.
10. Releases: versioning, changelog, signing, update feed.
11. A logging policy and a map of the data folder.
12. Adopting sync (only for apps that sync).
13. Performance budgets.
14. Image and vision models (only if an app needs them).

#### App-specific docs to promote to family level
- **JV `docs/dev/design-law.md`:** the method and the conformance checklist. JV's class list stays in JV. JW CLAUDE's "Design against precedent" is the same rule.
- **JW `docs/dev/ui-kit.md`:** should become the kit's component reference, replacing `ui/README.md`.
- **JW architecture-notes "Test harness detail":** into AS §10.
- **Into AS §13:** JW CLAUDE "User docs ship from docs/", the required-page list from guard check 9, and the six-field TASKS format from JV's TASKS header.
- **A family database section:** JW "Storage policy", "No JSON blobs" and "seed ships FACTS and RULES", plus SYNC's synced-table rules.
- **JW "Release system":** once reconciled with JV's tag-based release.
- **JW AGENTS §4 (confirm vs undo):** fix its stale toast half first. Also DG `docs-authoring.md` (help-doc front-matter).
- **JV's mock-in-app rule:** you kept it out of FR on 2026-10-09; whether AS should carry it is your call.

---

## B · What the three apps share — the inventory for a complete template

*Agent `a7d74d73327b511cd`, read-only, 2026-10-17 — its report as handed back, not re-checked by the session that saved it.*

**What the three apps share, for a complete template.** I worked read-only: `git ls-files` plus file reads. Nothing was edited, built or run. The repo roots are `E:\Dev\Web\justwrite-app` (JW), `E:\Dev\Web\JustVioce` (JV), `E:\Dev\Web\just_ai_i18n_docgen` (dg) and `E:\Dev\Web\just-llm-runner` (the kit); every path below is relative to its repo.

Classes:
- **S**: the same mechanism in all three, or required by app-structure (the § is cited).
- **P**: in 2 of the 3 apps.
- **D**: domain code.

A donor is the file to copy. I named the JW file §11 points at first. Where that file carries domain code or breaks a rule (no `navAttrs`, a hand-built Appearance section, no logs test), I name a compact dg or JV file beside it.

### 1 · Server
| Item | JW | JV | dg | Class · donor |
|---|---|---|---|---|
| `serve.js` calls `runServer({productName, defaultDataDir, build})` and seeds inside `build` | its own argument parser | its own parser; port from settings | runServer's parser | S · dg serve.js:38-53 |
| Order: log ring + file log, then `createServer({typeBase,onUnhandled})`, `csrfOrigin`, `starletteCors`, `bearerAuth`, the routers, `installLlm`, then the static UI | app.js:144-296 (ring after initDb, :146-155) | :226-461 | :463-528 | S §Q.3/§11 · JW app.js |
| Error envelope (`onUnhandled`) | app_errors.js | :127-131 | :458 | S · JV app.js:127-131 |
| CORS from settings, the desktop origin always allowed | ✓ | ✓ | allows all | P · JW app.js:163-196 |
| `runnerRouter()` + `installLlm(app,{db,dataDir,product,featureCatalog,featurePrompts,enginePresets,featurePresets,defaultPresetId,modelCatalogExtra,classTunesSeed,classTuneIdentity})` | adds embedTemplates, testSamples, featurePromptHeals, allowKeyReveal | adds testSamples, preferLocalFeatures, speechModelsFn | `featurePrompts:{}`; `installLlm(null)` for the CLI | S §8 · JW app.js:233-273; smallest: dg app.js:357-437 |
| `seedLlm()` + `loadFromConfigs(…)` when the server starts | database/seed.js:44-62 | database/seed.js:102-117 | app.js:445-449 | S §8 · JW |
| `FeatureCatalogEntry({key,label,hint,group})` + preset seeds | feature_catalog.js, seed_presets.js | same files | app.js:71-117 | S for the shape, D for the content |
| `makeLogsRouter`, `makeDiskRouter` | ✓ | ✓ | ✓ | S §11 |
| `makeDataRouter` | data_admin.js:78 | data_admin.js:207 | :406 | S · JW |
| `makePrefsRouter` | prefs_api.js (over /v1/settings) | prefs_api.js:20-49 | :418 | S §14 · JV |
| `/v1/server-auth` + `auth.js readAuth()` | ✓ | ✓ | ✓ | S §11 · dg api/server_auth_api.js |
| `/v1/health` returns status, product, version, apiVersion | adds dataDir, dbReady | adds engines | those four only | S §14 · dg api/health_api.js:12-18 |
| `makeShutdownRouter` + `loopbackOpenPaths:[SHUTDOWN_PATH]` + the desktop main's `shutdownPath` | :201, :215 | :329-344 | — | P · JW |
| `/v1/settings` document | ✓ | ✓ | — | P |
| app_state, paths (`resolveDataDir`), version, auth | ✓ | ✓ | ✓ (defaultDataDir is in app.js:312) | S §14 · JW; version.js: JV (it reads package.json) |
| errors.js re-exporting the kit's errors | ✓ | ✓ | — | P §14 |
| `locateUiDir` (<APP>_UI_DIR, then dist/spa, the packaged folder, cwd) + `serveStatic` + `/ui` redirect + 405 | :123-141, :275-294 | :137-154, :472-496 | :296-303, :519-525 | S §Q.3 · JV |
| database/ (index, session, models, models_schema, seed) | ✓ | ✓ | `openDatabase` :388 + appmeta.js | P (§14: dg has none by design) · JW database/session.js |
| build/launcher/<app>-server.cmd | ✓ | ✓ | ✓ | S §Q.3 (the template has one) |
| cli.js | — | ✓ | ✓ | D |
| Phone in-app server (server/src/phone.js, src/phone/*, scripts/phone-worker.js, `.phone.js` twins) | ✓ | — | — | §Q.7, for apps with a phone · JW |
| Sync (below) | :221; flush :205-208 | :412 (adds /v1/sync/projects) | — | P, not in app-structure · JV sync.js |

How sync is wired in JW and JV:
- `createAppSync` from `@delebash/sqlite-sync/app`.
- Routes under `/v1/sync/`: hello, pull, push, rev, status, settings, folder/*, run, export, import, peer/run, pair, pair/join.
- A middleware flushes after every request that writes.
- `networkHost()` in serve.js, `restoreHooks` in the data router, and the kit's `SyncPanel` and `watchSync` in the renderer.

Route modules: JW exports Hono instances; JV and dg export `router()` factories.

### 2 · Server tests
- `server/vitest.config.js` is byte-identical in all three, and so is the `test:server` script. S · JW.
- `useHermeticKit` and `testClient` helpers exist in JW (tests/helpers.js:44, :77) and dg (helpers.js:41, :99), so P. The kit's reference is server/tests/install_llm.test.js.
- csrf.test.js and prefs.test.js are in all three (S).
- A test that sends an `Origin:` header and checks the CORS answer is in all three (S): JW csrf.test.js:104, JV error_cors.test.js:13, dg app.test.js:128.
- §11 requires a test that logs a marker and finds it in `/v1/logs/tail`. JV has it (logs_download.test.js:25), dg has it (app.test.js:62), **JW has none**.
- Tests for health, disk, the bearer gate, lockout escape and the runner cache under dataDir: JW and dg (P). Shutdown and command-line tests: JW only.
- Best donor for the generic tests: dg server/tests/app.test.js:32-140.

### 3 · Renderer
**Boot (S, §Q.4/§4/§11)**
- `boot/i18n.js` calls `followQuasarLang` in all three, and the template has it.
- `boot/<app>.js` calls `installLlmUi(app,{i18n, devPorts, fallbackBase, external:{open:openUrl, openPath}, capabilities})`. devPorts: JW ["1420"], JV ["1430","1431"], dg ["1450"]. JV adds serverOverrideKey, labAdapters, sectionedFeatures, featurePanels and onQuickSetupApplied.
- All three then call `configureHelp`, guard routes with `checkServer()` sending them to `/offline?from=`, load prefs, and call `startWarmOnBoot`. dg and JV load prefs with `bootPrefs`; JW uses `bootSettings`, a listed Open deviation.
- JV and dg call `router.replace(history.location)` and wrap boot in a try/catch that removes `#app-boot`. JW does neither.
- P (JW and JV): the `shellServerUrl` race for fallbackBase, `configureFileSave`, `configureTestData`, the tooltip directive, `watchSync`.
- Donor: JW boot/jw.js:65-131 and :220-228. Minimal version: dg boot/docgen.js:15-84.

**Chrome (S, §11, all three)**
- App.vue is a bare `<router-view />` that removes `#app-boot`, with the same code in all three (JW App.vue:10).
- MainLayout has:
  - the TitleBar in a q-header and the nav in a q-drawer
  - `<LlmUiHosts/>` and `<HelpDrawer/>`
  - `<AiSetupOffer>`, shown once ever
  - a splash shown while `warmModelId` is set, holding `<BootModelLoad/>`
  - `onShellEvent` handlers for the three tray events (open-settings, about, copy-url)
  - keep-running re-applied at boot

  Donor: JW MainLayout.vue:160-271; compact version: dg MainLayout.vue:60-167. Only JW calls `setTrayLabels` (:190).
- The TitleBar is the kit's frame plus `AiStatusButton`: JW components/TitleBar.vue:105-179, dg components/TitleBar.vue, JV inline at MainLayout.vue:544-660.
- The AI-tasks row uses `useAiTasksNav()`. JW (Sidebar.vue:152/233/901) uses its own `panelToggleAttr`. JV (MainLayout.vue:510) and dg (:117) spread `navAttrs` as §4 requires. Donor: dg MainLayout.vue:109-125.

**Routes and pages**
- In all three (S): the layout is imported directly, pages load lazily, and `/offline` sits outside the layout. Each has HomePage, AiPage (`AiModelsArea` at `/ai`), SettingsPage, and ConnectionErrorPage (`ConnectionError` + `serverUrl`).
- `/settings/:section?`: JW routes.js:97 and dg :20; JV has only `/settings`. P.
- `/help/:slug?`, a full help reader, is JW only; dg's `/docs` page is domain code.
- Route names follow no common standard. router/index.js is the same in JW and dg.
- ConnectionErrorPage shows the `shellServerStatus` detail in JW and JV.

**Settings** (S: `SETTINGS_SECTION_ORDER`, settingsSections.js and settingsCanon.test.js in all three)
| Section | Mechanism |
|---|---|
| Appearance | kit `AppearancePanel` (JV :1800, dg :213) + `LanguagePicker` (JW :935, dg :224); JW's is hand-built (:929) |
| Backups | `DataManagement` |
| Storage | built by each app over `storageGetRoot`/`storageRelocate` + `/v1/disk/usage`; no kit panel |
| Server | built by each app: `/v1/server-auth` tokens + the keep-running toggle; no kit panel (§11 donor: JW :1471-1510) |
| Logs | `LogsPanel` |
| Updates | `UpdatesPanel` + `renderHelpMarkdown(loadDoc("whats-new"))` + `desktopUpdater()` |
| About | built by each app |

Donor: dg pages/SettingsPage.vue:205-397. JW and JV add a Sync section using the kit's SyncPanel.

**Stores and services**
- `stores/index.js` is identical in all three.
- `stores/ui.js` exports `useUiStore` in all three (S, guard-checked). Donor: dg, which uses the kit's `readPref`/`writePref` for appearance, aiOfferShown, keepServerRunning and locale.
- `services/native.js` in all three. Donor: dg :1-84. JW's adds pickFile, saveFile, shellServerUrl, shellServerStatus and setTrayLabels.
- `services/helpDocs.js` in all three: `makeDocsHelpAdapter(import.meta.glob("../../docs/*.md",{query:"?raw",import:"default"}), toc)`. Donor: dg; JW adds `webUrlFor`.
- `services/appearance.js` in all three. Donor: JV (§11).
- P (JW and JV): composables/, fonts.css, and KeyboardCheatsheet, which differs: JW renders docs/keyboard-shortcuts.md, JV has a hand-written list.
- S and already in the template: tokens.css, app.scss, quasar.variables.scss, and i18n/index.js (`kitMessages`, `catalogsFromFiles`) with locales/en.json.
- eslint.i18n.config.js and the `i18n:lint`/`i18n:report` scripts: JW and dg only.

### 4 · Renderer tests
- `vitest.config.js` in all three (S): aliases for `@renderer`, `@delebash/llm-ui` and `#q-app`, the `quasarBuildPerEnvironment` plugin, and dedupe. Donor: JV, because dg's dedupe misses vue-i18n and qrcode.
- `boot.smoke.test.js` in all three (S), built on `registerBootSmoke` and `createTestApp`. Donor: JV or dg, which stub `/v1/prefs`.
- `test:unit` and settingsCanon.test.js in all three (S). kitWords.test.js and ConnectionErrorPage.test.js: JW and JV (P).

### 5 · Desktop
- `electron-main.js` in all three passes the required fields, `trayIcon` (tray.png), `icon.ico` on Windows and `logFile` (S).
- P (JW and JV): `updates` with the builder's GitHub `publish` and an nsis `artifactName`, and `shutdownPath`.
- D: `serverProduct`, `closeHoldMs` and `cspAdd` (JW); `permissions:["media"]` (JV).
- The tray and keep-running belong to the kit's shell.
- The preload is the same one line in all three. All three pin electron 44.7.0 and electron-builder 26.15.3 exactly.
- The `electron` block of quasar.config.js is the same in all three (S; donor JW quasar.config.js:125-193). Every block has:
  - extendElectronPackageJson
  - `--install-links`
  - preloadScripts
  - a builder with: better-sqlite3 `files` excludes, asarUnpack, the launcher in extraResources, `executableName`, electronFuses
  - nsis with `oneClick:false`, `perMachine:false`, and the kit's installer.nsh included

  electron-updater comes from the kit.

### 6 · Phone
- JW is complete:
  - android and ios projects committed
  - allowMixedContent
  - the barcode, filesystem and share plugins
  - the in-app server
  - `build:android`
  - e2e/phone-ios.js with phone-ios.yml
- JV has only the config and package.json; its native folders are gitignored and it has no `build:android`.
- dg has no phone. The template has an Android project but no in-app server.
- I verified no phone build.

### 7 · e2e (required by §10; 2 of 3 have it)
- JW and dg both have:
  - an e2e/ package using playwright-core
  - lib/driver.js, which calls `_electron.launch` on dist/electron/UnPackaged
  - tests/smoke.test.js and capture-direct.js
  - root `test` and `screenshots` scripts exactly as §10 specifies
- Hermetic (the shell starts no server during tests): dg yes (smoke.test.js:19 feeding driver.js:40); JW no.
- JV has no e2e/: `test` runs scripts/e2e.js in Chromium against a running server, and `screenshots` runs scripts/smoke_gui.js.
- Donor: dg's e2e/ (smoke.test.js:61-86 and 362-435, contract.test.js).

### 8 · Docs
- In all three (S, the guard's DOC_REQUIRED): getting-started, ai-features, ai-providers, troubleshooting and whats-new, plus toc.json. JW and JV also have backups-and-data, core-concepts, import-and-export, keyboard-shortcuts and sync.
- toc.json shape: JV and dg use `[{group, items:[{slug,title}]}]`; JW uses `section` and adds `hint`. The kit reads only `items`.
- whats-new.md feeds UpdatesPanel in all three (JW SettingsPage.vue:113, JV :522, dg :56).
- `docs/dev` README, TASKS, IDEAS and RESEARCH plus `docs/plans`: all three (S). No app has a PRD.md.
- A MIT LICENSE: JW and JV only (dg has none). NOTICE.md: JV only.

### 9 · Repo config
- package.json in all three: private, `"type":"module"`, productName, workspaces ["server"], and the same allowScripts. Only the template has `engines`.
- Scripts in all three (S): dev, dev:spa, build, build:spa, build:unpacked, postinstall (`quasar prepare --silent`), server, test:server, test:unit, lint. P (JW and dg): `test`/`screenshots` in the §10 shape, and the i18n scripts. JW alone has build:android. JV's `test:server:js` duplicates `test:server`.
- Byte-identical in all four (the template included): biome.json, .gitattributes, eslint.i18n.config.js (JV lacks it). The same text in all three apps: node24.js, server/vitest.config.js, postcss.config.js.
- CLAUDE.md in all three imports family-rules.
- Only some repos have:
  - AGENTS.md and .claude/: JW only. Its .claude/ allows scripts that don't exist, and settings.local.json is tracked.
  - .editorconfig: the template only.
- Workflows:
  - JW: release, run by hand, which uploads the installers, latest*.yml, blockmaps and the docs; and phone-ios.
  - JV: ci, run by hand (biome, test:unit, build, test:server); codeql weekly; release on v* tags.
  - dg: none.
- No repo has .nvmrc, husky or a hooks path.

### 10 · Other shared pieces
- The CSP meta tag (S, and in the template).
- The static `#app-boot` plate (S; JW index.html:26-44). JW and dg also have a splash image.
- Quasar's `'Notify'` plugin with the kit's `pushToast` (S).
- `just-ai-i18n-docgen/config.json`: JW and dg (P).
- The app version comes from a different place in each app:
  - JW reads `VITE_APP_VERSION` (quasar.config.js:21, :101), but its server says 0.0.1 while package.json says 1.0.0.
  - JV reads `/v1/health`, which reads package.json, and has a test for it.
  - dg hard-codes "0.1.0" (SettingsPage.vue:49).

### What the template lacks (S items, ranked)
1. **The server's AI half (§8):** a SQLite handle, `installLlm` with `runnerRouter`, seeding at server start, a feature catalog and presets.
2. **The server's family surface (§11/§14/§Q.3):** the log ring and file log; the logs, disk, data, prefs and server-auth routers; the health base fields; the error envelope; app_state, paths, version and auth; `locateUiDir`; and `defaultDataDir` passed to runServer.
3. **Server tests** (§Q.3, §12, checked by the guard for products): server/vitest.config.js, the helpers, the csrf, prefs, CORS and logs-content tests, and a `test:server` script.
4. **The boot file** `boot/<app>.js`, plus `services/native.js`.
5. **The §11 chrome:** MainLayout, the TitleBar, the AI-tasks row, the tray handlers and keep-running.
6. **Pages:** HomePage (guard-checked), `/ai`, the Settings page with all seven sections plus settingsSections.js and settingsCanon.test.js, and `/offline`.
7. **`stores/ui.js`** (guard-checked) and `services/appearance.js`.
8. **Help:** `services/helpDocs.js` (guard-checked), the five required docs, toc.json, and whats-new.md feeding the Updates panel.
9. **Renderer tests:** vitest.config.js and boot.smoke.test.js (both guard-checked), `test:unit`, and the `@renderer` alias.
10. **e2e/** with the root `test` and `screenshots` scripts (§10).
11. **docs/dev** README, TASKS, IDEAS and RESEARCH, plus docs/plans (§13) and PRD.md.
12. **The `#app-boot` plate** and the code that removes it.
13. **Desktop:** tray.png and icon.ico; electronFuses, the nsis include, `perMachine` and the better-sqlite3 excludes; an exact electron-builder pin.
14. **package.json and quasar.config.js:** the kit's peer packages and the test dependencies; `extras: []`; `server.fs.allow`.

The template has things no app has, which should be dropped or decided on:
- a lazily loaded layout route imported through `@/`
- Quasar's scaffold pages and its roboto and material-icons extras
- the ssr, ssg, pwa, cordova and bex config blocks
- two pnpm-workspace.yaml files
- `engines` in package.json
- a health answer of `{ok, app, product}`

### Where the apps or the template disagree with app-structure
1. **§2/§12, the first "Where to look" row:** no app's CLAUDE.md points it at app-structure.md.
2. **§13, PRD.md:** no app has one.
3. **§10, a hermetic smoke suite:** JW never sets JUSTWRITE_DEV_NO_SERVER, so the shell can start a real server during tests. JV tests in Chromium, which §10 calls a proxy.
4. **§Q.9/§10, `build:unpacked` as the e2e target:** JW's driver.js:12-13 and its README say that build skips installing the server package, so use `npm run build`. dg's README uses build:unpacked. I did not check which is right.
5. **§11, the logs content test:** JW has none.
6. **§11 cites JW Sidebar.vue:148:** the row is at :152, and it doesn't spread `navAttrs`.
7. **§11, the same kit Appearance surface in every app:** JW's Appearance section is hand-built.
8. **§11, `/settings/:section?`:** JV has only `/settings` (routes.js:49), and its tray About opens Settings, not the About section (MainLayout.vue:454).
9. **§11, "four tray:* listeners":** the shell sends only three events (main.js:472, 479, 494).
10. **§Q.2, ids without hyphens:** dg's id is `just-ai-i18n-docgen` and its appId has hyphens too (quasar.config.js:111). This is not listed under Open deviations.
11. **§Q.7, the `#in-app-server` alias:** JW names it `#phone` (quasar.config.js:72).
12. **§Q.7, native phone projects committed:** JV gitignores them (.gitignore:44-45).
13. **§Q.2's field table:** it omits `shutdownPath`, `serverProduct` and `permissions`. dg has no `/v1/shutdown`, so on quit its server gets SIGTERM, which on Windows kills it at once.
14. **§3, devServer host 127.0.0.1:** JW sets no host (quasar.config.js:104-110).
15. **The template against §Q.4/§14/§Q.3:**
    - its layout route loads lazily (routes.js:5)
    - its layout uses raw `q-*` tags
    - its health answer has the wrong shape (server/src/app.js:33)
    - it serves the headless UI only when FAMILY_TEMPLATE_UI_DIR is set (server/src/serve.js:20)
16. **"No hard-coded values":** JW's server version is 0.0.1 while package.json says 1.0.0, and dg hard-codes 0.1.0.
17. **Stale entries:**
    - The kit's RESEARCH.md:1103 says the template's biome.json differs; all four copies are now identical.
    - JV's toc.json lists five pages that don't exist: generate, chapter, take-versioning, labs, channels.

None of these facts are in RESEARCH.md yet, because this brief was read-only.

---

## C · What a 2026 Quasar, Electron and Capacitor template should carry — industry practice

*Agent `a8da65e8ffc85e075`, read-only, 2026-10-17 — its report as handed back, not re-checked by the session that saved it.*

### What a 2026 Quasar, Electron and Capacitor template should carry (research, 2026-10-17)

**How this was done.** I read RESEARCH §2 first and did not re-check its facts on Quasar, Electron, electron-updater, Hono or "Starting a new app". Versions are the npm `latest` as of today. I read every page today; most show no page date, so dates are given only where a page has one. "Measured" means I ran it on this machine today. I wrote no repo files, so these facts still need a RESEARCH §2 entry.

I tested each verdict against an objection before keeping it. Three changed:
- **Fuses vs e2e:** fuses are kept, and the e2e tests drive the unpackaged build instead.
- **Biome's experimental Vue support:** moved to "needs your word".
- **Update bots running on their own:** moved to "needs your word", because of the by-hand ruling.

#### 1. Testing
- **Vue's docs:** Vitest for units. For components, Vitest plus `@vue/test-utils`, because `@testing-library/vue` "has issues with… Suspense". Playwright or Cypress for e2e. Nothing on accessibility or coverage. vuejs.org/guide/scaling-up/testing
- **Quasar:** `quasar ext add @quasar/testing-unit-vitest`, version 3.0.0 (2026-08-24; needs app-vite 3, supports Vitest 4 and 5).
  - It derives the Vitest config from `quasar.config` through `quasarViteTestingConfig()`.
  - It uses happy-dom, and mounts with `installQuasarPlugin()` plus test-utils' `mount`.
  - Source: github.com/quasarframework/quasar-testing, packages/unit-vitest.
  - The new `@quasar/testing-playwright` 1.0.0 (2026-09-17) covers SPA mode only and has 45 downloads a week.
- **Vitest itself** calls Browser Mode "the recommended approach for component testing" (vitest.dev/guide/browser/component-testing). That conflicts with Vue's and Quasar's simulated DOM.
- **Hono:** test routes with `app.request(path, init, env)`; its examples use Vitest (hono.dev/docs/guides/testing). RESEARCH §2 found `app.request` misses the @hono/node-server Request bug, so keep one test through the real server.
- **Electron e2e:** Playwright's `_electron` is "experimental" and needs Electron 21+ (playwright.dev/docs/api/class-electron). Electron "doesn't actively maintain its own testing solution" (electronjs.org/docs/latest/tutorial/automated-testing). The traps:
  - **Fuses:** launch times out if the `EnableNodeCliInspectArguments` fuse is false. All three apps ship it false, so e2e can only drive the unfused `dist/electron/UnPackaged`. The shipped fuses are never under test.
  - **One copy at a time:** the kit allows one running copy (`server/src/shell/main.js:34,721`), and Electron's second instance quits. So run with `workers: 1` and the real app closed.
  - **Environment:** strip `ELECTRON_RUN_AS_NODE` before launching.
  - **Fixed waits:** JustWrite's driver sleeps 3.5 s. Playwright calls fixed waits "discouraged… inherently flaky".
- **Accessibility:** `@axe-core/playwright` 4.14.0 with `withTags(['wcag2a','wcag2aa','wcag21a','wcag21aa'])`.
  - Playwright says these scans catch only "some" problems. Snapshot a fingerprint, never the whole violations array (playwright.dev/docs/accessibility-testing).
  - Its licence is MPL-2.0; it is a test-only dependency and never ships.
- **Coverage:** v8 is the default and marked "✅ Recommended". Set `coverage.include` or untested files don't show. No advice on thresholds (vitest.dev/guide/coverage).
- **Current versions:** vitest and @vitest/coverage-v8 5.0.5, @vue/test-utils 2.5.1, playwright 1.64.1.
- **Verdict — carry:**
  - server route tests (`app.request`, plus one through the real server);
  - component tests through the Quasar extension, including the boot smoke test the guard requires;
  - one Electron smoke test on UnPackaged, with one axe scan;
  - a `test:coverage` script with no pass/fail gate.

  This also answers the open "§14 product skeleton" item in TASKS. Skip Browser Mode and the Playwright extension for now.

#### 2. Electron security, signing, updates
- **The checklist** has 20 items (electronjs.org/docs/latest/tutorial/security). The kit shell already covers:
  - context isolation, sandbox, no Node in the renderer;
  - CSP on `app://`, and a custom protocol instead of `file://`;
  - navigation, new windows and `<webview>` refused;
  - permission handlers, and IPC checked against the sender;
  - `openExternal` limited to http(s) and mailto.

  Source: `server/src/shell/main.js:30-35,395-409,651-653,703-725`. One observation outside the checklist's letter: `openPath` hands any path the renderer sends to `shell.openPath` (`main.js:655-658`).
- **Item 16, current Electron:** 44.9.0 is current (2026-10-17, Node 24.22.0). The template pins 44.7.0; 45 is at beta.5.
- **Item 19, fuses** (electronjs.org/docs/latest/tutorial/fuses):
  - disable runAsNode (unless used), nodeOptions, nodeCliInspect and grantFileProtocolExtraPrivileges;
  - enable cookieEncryption, embedded ASAR integrity and onlyLoadAppFromAsar;
  - electron-builder's `electronFuses` setting flips them before signing (electron.build/docs/tutorials/adding-electron-fuses);
  - all three apps carry an identical block (runAsNode stays on for the headless launcher). **The template has none.**
- **Signing (Windows):**
  - Since 2024 an EV certificate "no longer earns SmartScreen reputation immediately", and SmartScreen treats EV and OV the same (electron.build code-signing-win, v27 docs).
  - Azure Artifact Signing is "limited to developers in certain countries" (electronjs.org/docs/latest/tutorial/code-signing).
  - SignPath Foundation signs OSI-licensed open source for free. Conditions: an automated build and a published signing policy, and the Foundation is the publisher. I found this via search and did not read it in full.
- **Updates:** the kit already uses electron-updater. It updates NSIS, DMG (the Mac app must be signed) and AppImage/deb/rpm. Version 7 / electron-builder 27 (still alpha) signs the update manifest with Ed25519, and publishing fails without a key (electron.build/docs/features/auto-update).
- **Verdict:** carry the `electronFuses` block. Leave signing and the update feed to each app's first release.

#### 3. Capacitor 8
- **appId:** reverse-DNS, "generally representing a domain name that you or your company owns" (capacitorjs.com/docs/config).
  - Android: at least 2 segments, each starting with a letter, `[a-zA-Z0-9_]` only, and never changed after publishing (developer.android.com/build/configure-app-module).
  - Apple: letters, digits, hyphen, period (developer.apple.com/help/glossary/bundle-id).
  - `com.just<name>.app` fits both, but it names a domain you may not own. For comparison, Flathub requires domain control or `io.github.<user>.<repo>` and rejects a `.app` ending (docs.flathub.org).
- **Keep these defaults** (capacitorjs.com/docs/config):
  - `androidScheme` https and `hostname` localhost;
  - `cleartext` false ("not intended for use in production") and `allowMixedContent` false;
  - release builds not debuggable.

  The security guide adds: no secrets in code, keychain/keystore storage, HTTPS only, a CSP, nothing sensitive in deep links (capacitorjs.com/docs/guides/security).
- **Live reload:** `quasar dev -m capacitor -T android` gives hot reload on the device. Never commit a `server` block (capacitorjs.com/docs/guides/live-reload).
- **Capacitor 8 needs** Node 22+, minSdk 24 / target 36, Xcode 26, iOS 15, and Swift Package Manager by default (capacitorjs.com/docs/updating/8-0). Current is 8.5.3.
- **Verdict:** nothing to add. The only open point is the app-id domain question, which becomes permanent once an app is on Play.

#### 4. Dependency hygiene
- **OpenSSF's npm guide** (the repo has been archived since 2023-10-09): commit lockfiles, install with `npm ci`, run `npm audit`, use Dependabot or Renovate. github.com/ossf/package-manager-best-practices
- **npm 12.2.0 is now `latest`** (2026-09-30): "Dependency install scripts are blocked by default". `approve` writes pinned `pkg@1.2.3` entries by default; `--no-allow-scripts-pin` writes name-only ones (docs.npmjs.com/cli/v12/commands/npm-install-scripts). npm 11 only warns. The template's `allowScripts` is name-only.
- **Node version:**
  - `engines` is "advisory only"; `devEngines` is enforced (docs.npmjs.com/cli/v11/configuring-npm/package-json).
  - setup-node v7 reads `devEngines.runtime`, then `engines.node`, from `package.json`, so `.nvmrc` isn't needed.
  - Node 24 goes to maintenance 2026-10-20 and Node 26 becomes LTS 2026-10-28 (nodejs/Release). Electron 44 and 45 both run Node 24.22.
- **Dependabot** (docs.github.com dependabot-options-reference; about-dependabot-on-github-actions-runners):
  - supports `directories`, `groups` and a default 3-day `cooldown`;
  - its jobs run on Actions runners, "bypassing" Actions being disabled;
  - its PRs come on a schedule, and I found no approval gate.
- **Renovate** 44.166.0 (Renovate docs: configuration-options.md, config.preset.ts):
  - `dependencyDashboardApproval: true` creates no branch or PR until you tick a box;
  - `config:best-practices` adds a 3-day minimum release age for npm and weekly lockfile maintenance.
- **Scanners:**
  - `npm audit --omit=dev` and `npm audit signatures`;
  - OSV-Scanner v2.7.0 (2026-10-12): `osv-scanner scan -L package-lock.json`, plus a `--licenses="MIT,…"` allowlist check (google.github.io/osv-scanner/usage).
- **Verdict:** carry an `audit` script; lockfiles and `allowScripts` are already there. Ask you about a bot. Skip `.nvmrc`.

#### 5. Repo hygiene files
- **GitHub's community profile** checks for README, CODE_OF_CONDUCT, LICENSE, CONTRIBUTING and issue templates.
- **SECURITY.md** should give "supported versions… and how to report a vulnerability". Private vulnerability reporting is a per-repo switch on public repos.
- **OpenSSF's passing-level criteria** require a published vulnerability-report process and "human-readable" release notes (bestpractices.dev/en/criteria/0).
- **Keep a Changelog 1.1.0:** an Unreleased section on top; Added/Changed/Deprecated/Removed/Fixed/Security; "commit log diffs… a bad idea".
- **Secret scanning** "runs automatically for free" on public repos.
- **Verdict:**
  - carry SECURITY.md, pointing to GitHub's private reporting (switched on when the skill creates the repo);
  - carry a CHANGELOG.md stub;
  - skip CONTRIBUTING, CODE_OF_CONDUCT and issue/PR templates (solo repo; AGENTS.md covers agents).

  The template already has LICENSE, README, .editorconfig and .gitattributes.

#### 6. Git hooks
- **Already decided (2026-10-17):** Husky + lint-staged, running Biome on staged files.
- **Versions:**
  - husky 9.1.7 (2024-11-18, no release in 23 months; 20.9M downloads a week);
  - lint-staged 17.6.0 (needs Node ≥ 22.22.1);
  - lefthook 2.2.2 (2026-10-13), which Biome's recipe lists first.
- **Template inside the kit repo:**
  - Husky's docs: it "doesn't install in parent directories"; for a subfolder they suggest `"prepare": "cd .. && husky frontend/.husky"`.
  - I read Husky 9.1.7's code: with no `.git` in the folder, `husky` prints ".git can't be found" and exits 0. So `"prepare": "husky"` in `template/` does nothing inside the kit and never touches the kit's hooks.
  - It installs on the first `npm install` after `git init`, so the new-app skill must run `git init` before `npm install`.
  - Hooks are POSIX sh; `HUSKY=0` turns them off.
- **lint-staged command:** `biome check --files-ignore-unknown=true --no-errors-on-unmatched` (biomejs.dev/recipes/git-hooks).
- **Conventional Commits** pays off in changelog and version automation; the family's commits are plain sentences.
- **Verdict:** carry Husky + lint-staged as decided. Skip commitlint (21.2.3).

#### 7. Accessibility and i18n linting; Biome on Vue
- **i18n:** the template's `@intlify/eslint-plugin-vue-i18n` 4.5.1 is current.
- **Biome on Vue:**
  - parsing, formatting and linting are all "Experimental";
  - `html.experimentalFullSupportEnabled` (default false) lints the whole file instead of only the script (biomejs.dev language-support and configuration pages);
  - Biome 2.5 (2026-06-05) promoted the Vue template rules to stable.
- **Measured** (Biome 2.5.15, on a copy of the template):
  - with full support on, accessibility rules fire in templates (useAltText, noPositiveTabindex, useKeyWithClickEvents, useValidAnchor, useButtonType);
  - `useVueVForKey` fires too;
  - `noUnusedImports` and `noUnusedVariables` now see what the template uses: no false positives, and real ones were caught;
  - `noUndeclaredVariables` flags Quasar's `$q`, but the family config doesn't turn that rule on for .vue files;
  - the template's 13 src files lint clean with full support and without the `.vue` override.

  I did not try it on the three apps.
- **Alternative:** eslint-plugin-vuejs-accessibility 2.6.2. It would break the rule that the ESLint file does i18n only, which the guard keeps identical across repos.
- **Verdict:** carry Biome full support, but only with your word, since it changes the family's biome.json.

#### 8. Type-checking plain JS
- **What the docs say:**
  - TypeScript: `// @ts-check` or a jsconfig, plus JSDoc types;
  - Vue: `vue-tsc` for SFCs, documented on a TypeScript-only page;
  - Quasar: documents type checks for TypeScript projects only. Its generated `.quasar/tsconfig.json` has allowJs and noEmit but no checkJs.
- **TypeScript 7.0** (2026-07-08) ships no API, so Vue tooling "will likely not yet be able to leverage TypeScript 7". Its JSDoc support was reworked (`@enum` and `@class` dropped). `@typescript/typescript6` lets 6.0 run alongside it.
- **Vue tooling:** language-tools#5381 (closed 2026-07-23) says TypeScript 7.1 support is "still on the roadmap". @vue/eslint-config-typescript marks plain-JS script blocks as "DISCOURAGED".
- **Verdict:** skip a type-check gate. Checking `server/` (plain .js) is an app's choice.

#### 9. Observability
- **Electron's crashReporter** writes minidumps to `crashDumps`; `uploadToServer: false` keeps them local. Electron has no API to read them and endorses no crash service.
- **@sentry/electron** 8.2.0 needs a DSN and sends user identity data by default.
- **The kit already logs** (`platform/log.js`: an in-memory ring plus daily files). It is not the standard Node logger (pino 10.4.0, 32M downloads a week), but that's kit scope.
- **Verdict:** skip in the template. A local-only crashReporter is a kit decision; Sentry at most as opt-in per app.

#### 10. Other expected pieces
- **Licence notices:** Vite 8's `build.license` writes the licences of the bundled dependencies (vite.dev/config/build-options). Carry it via `extendViteConf`.
  - Measured: electron-builder already ships `LICENSE.electron.txt` and `LICENSES.chromium.html` (seen in three packaged apps).
  - Nothing gathers the notices of the server's `node_modules` inside the asar, and I found no standard tool for it.
- **SBOM:** `npm sbom --sbom-format cyclonedx|spdx`, or GitHub's SPDX export. Leave to release.
- **Build attestations** (`actions/attest@v4`): leave to the release workflow.
- **CodeQL default setup** runs on Actions on a weekly schedule, which clashes with the by-hand ruling. So does JustVoice's weekly `codeql.yml`.
- **PWA mode:** skip.

#### Ranked: carry in the template
1. The `electronFuses` block (copy the apps').
2. The test set from §1.
3. Husky + lint-staged with Biome on staged files (already decided).
4. SECURITY.md, plus private vulnerability reporting switched on.
5. Biome full Vue support (after your go).
6. Vite's `build.license`.
7. CHANGELOG.md in Keep a Changelog form.
8. An `audit` script, run by hand.
9. Electron 44.7.0 → 44.9.0, then 45 after 2026-10-20.

#### Needs your word
- **Update bot:** Renovate in approval mode, Dependabot (runs on its own), or none.
- **Biome full Vue support:** experimental, and it changes the family biome.json.
- **axe's MPL-2.0 licence:** test-only, but needs checking against the family's licence rule.
- **App id:** keep `com.<id>.app`, or use a domain you own.
- **JustVoice's weekly CodeQL run:** it clashes with the by-hand ruling.
- **Things I saw that aren't standard:**
  - JustWrite mounts components with `createApp`, where Vue recommends `@vue/test-utils`;
  - the kit's own logger rather than pino;
  - fixed sleeps in the e2e driver.

#### Unknown or not tried
- How Renovate and Dependabot handle npm workspaces (not on the pages I read).
- What Mend charges for the hosted Renovate app.
- Whether Electron's single-instance lock is tied to the user-data folder.
- GitHub's push-protection defaults.
- Whether the Quasar Vitest extension works with the kit's aliases (not tried).
- Biome full support on the three apps (not tried).
