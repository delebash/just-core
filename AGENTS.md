# just-core — instructions for any AI working in this repo

The family's shared kit: the local-LLM runner (detects hardware, picks and downloads GGUF models
and the right prebuilt llama.cpp, spawns `llama-server`), the shared AI stack, the platform
pieces every app server uses, and the desktop shell — all in `packages/core/` (`@delebash/core`,
plain JavaScript, imported by subpath: `/platform`, `/llm`, `/shell`). The Vue UI kit is
`packages/ui/` (`@delebash/ui`, on Quasar). `template/` is the reference Quasar app every family app
starts from. Renamed from `just-llm-runner` on 2026-10-18 — older docs and plans say `server/`
(`@delebash/llm-runner`) and `ui/` (`@delebash/llm-ui`).

**Internal — never published.** Apps consume `packages/core/` as
`"@delebash/core": "file:../just-core/packages/core"` and `packages/ui/` as a source alias in their
`quasar.config.js` (app-structure §3) — no build or publish step.

The family rules every family repo follows, this one included, are at the end of this file.

Claude Code reads this file through CLAUDE.md's `@AGENTS.md`; Codex, Cursor and the other tools read it
directly and follow no `@` imports — so it holds everything itself, the family rules included (the
family's design, the user, 2026-10-17).

> **A change here lands in EVERY app** (JustWrite, JustVoice, docgen). There is no per-app copy
> of any of this — that is the point of the repo.

## Commands

```bash
cd packages/core && npm test          # vitest on Electron's own Node 24 (scripts/node24.js), never PATH's node
cd packages/core && npm run lint      # Biome: src, tests, scripts
cd packages/ui && npm install           # its tools AND the fonts every app bundles (common/fonts.css) — an app build needs them
cd packages/ui && npm run lint          # Biome: src
cd packages/ui && npm run check:pickers # fails a hand-coded copy of a shared picker
node scripts/check-family.js   # the family guard: the three apps + the template against the kit
```

**After any change to a shared export, build and test every app that uses it** — nothing here
checks the consumers. `packages/core/tests/process_job.test.js` proves the Windows kill-on-close job for real
only with `KIT_REAL_SPAWN=1`; `tests/realrouter_smoke.test.js` needs `JW_REALROUTER=1` and a real
engine.

## What bites

- **Dependencies stay light — no ML packages.** The three vendor SDKs (openai, anthropic,
  google-genai) were an explicit ruling, not a precedent for adding more.
- **`packages/ui/package.json` `peerDependencies` must list everything the kit imports.** A missing peer
  still resolves through the app's own `node_modules` by luck (`quasar` was missing until
  2026-10-09). The kit's controls take one `intent` prop for role AND style — never add
  `severity` / `outlined` / `text`.
- **A module with a `<name>.phone.js` twin** (`runner/lifecycle.phone.js`) is swapped for it in
  the phone's worker bundle (app-structure §Q.7) — change both.
- **The desktop shell is `packages/core/src/shell/`** (`runDesktopApp`, the preload, the data-root
  ladder). A new shell command goes in main's `COMMANDS` and the preload's list, never in an app.
- **An unwired catalog is not an empty one.** The runner's models response carries
  `catalogWired`; JustVoice once sat for months on "no host wired a catalog" reading as "empty".
- **Always pass `dataDir`** to `installLlm`. Without it the engine and models land in
  `~/.cache/just-llm-runner` (or `LLM_RUNNER_CACHE`), outside the app's data folder — an
  uninstall strands tens of GB and a backup misses them.
- **The cache may be shared; what an app generates never is.** The cache root holds weights and
  llama.cpp builds (content-addressed — two apps can share them); the runtime root holds
  `models.ini` and spawn logs, which each app renders from its own catalog. The family registry
  (`%LOCALAPPDATA%\just-ai\caches.json`) is machine-wide, so it ignores writes inside a vitest
  run unless `JUST_AI_HOME` points somewhere safe.
- **The router port is allocated — nothing may assume 8080.** `findFreePort` starts there; the
  live URL is the service's `routerUrl()`. Health-by-port is not identity: a second app's probe
  once passed against the FIRST app's engine. A `local-llamacpp` provider's stored `baseUrl` is
  a guess — `openai_compat.js` resolves it per request through `setLocalRunnerBaseUrl` and never
  falls back to the configured port when the router is down.
- **The wire is camelCase** (`runner/schema.js` and the `llm/` routes): renaming a field breaks
  every app's screens.
- **Engine defaults are DATA** — the pinned llama.cpp build, binary assets, flag presets and fit
  knobs are `runner/config.js` constants an app seeds into its database (editable there). Prefer
  a row over a code branch.
- **Launch flags resolve in four tiers** (`README.md`, "the 4-tier doctrine"): our estimate never
  reaches the launch; an untuned model leaves GPU placement to llama-server's own `--fit`, but
  `ctx-size` is always emitted; user values render exactly; measured tunes win, and auto-tune
  saves only a strict winner beyond the 5 % tie band.
- **Detection proposes, never dictates.** The box's class is `dgpu-vram<GB>|ram<GB>` (`igpu-mem<GB>` / `unified-mem<GB>` on one
  memory pool — `hardware.js` `formatClassKey`), overridable via
  `classKeyOverride` on `/v1/ai/engine-config`.

## Where to look

**Before researching anything — reading code to answer a question, measuring, briefing an agent —
read the subject's section of `docs/dev/RESEARCH.md`** (the family rule, 2026-10-04, app-structure
§13). Research isn't done until its facts land there.

| For | Read |
|---|---|
| **THE family app structure — every app** | `docs/app-structure.md` (§Q is the layout; `template/` the reference app) |
| Installing the stack in an app | `docs/dev/install-runbook.md` · app-structure §8 · `packages/core/README.md` "Consume it" |
| How launch flags derive | `README.md` "the 4-tier doctrine" |
| Open work — the tracker for this repo (kit + shared server) | `docs/dev/TASKS.md`; unscheduled ideas in `docs/dev/IDEAS.md` |
| Model verdicts, licensing, measured serving numbers | `docs/dev/model-research.md` · `docs/dev/serving-design.md` |
| The routing/preset model | `docs/feature-model-system.md` |
| App-side open work | `../justwrite-app/docs/dev/TASKS.md` · `../JustVioce/docs/dev/TASKS.md` · `../just_ai_i18n_docgen/docs/dev/TASKS.md` |
| Per-task history and evidence | `docs/plans/*`; closed history in `docs/plans/archive/` |

Read branch and working-tree state from git, never from a doc.

---

## The family rules

A copy of the kit's `docs/family-rules.md`, kept identical by a check (`scripts/check-family.js`) — edit the
kit's file, never this copy (this file is the kit's, so the check holds it to the same text).

<!-- family-rules:start -->
# Family rules

The rules every family repo follows: JustWrite, JustVoice, docgen and this kit. Each repo's
CLAUDE.md imports this file; a repo's own rules stay in its CLAUDE.md. How an app is laid out is
the kit's [`docs/app-structure.md`](https://github.com/delebash/just-core/blob/main/docs/app-structure.md)
§Q; the reference app is the kit's [`template/`](https://github.com/delebash/just-core/tree/main/template).

- **No hardcoded values a user might want to change.** Thresholds, limits, names and presets live
  in the database (seeded, editable in Settings), not in code, so changing one never needs a code
  change.
- **The server owns the data.** An app's data is one SQLite database that only its server reads
  and writes; the screen holds no durable data and asks the server. The desktop window, the
  browser tab of a headless server, the phone and other apps calling the API must all see the
  same data.
- **Nothing hand-rolled that Quasar or the kit ships.** The kit's `Ui*` controls sit on Quasar's
  components; apps use the `Ui*` API, and a shape the kit doesn't have uses Quasar's own component
  before anything hand-rolled. Before building a control, dialog, task or service, look in the kit
  (`packages/ui/src/index.js`, `packages/ui/src/common/index.js`, `packages/core/`), in the app's
  own `src/services/`, and for a screen that already has the same shape, and reuse it. A gap is
  filled in the kit so every app gets it. Copies drift and share bugs.
- **Code copied from another project keeps its licence notice** and gets an entry in the repo's
  `NOTICE.md`. MIT, Apache and BSD licences all require it.
- **Every AI engine and model goes through the kit, the way llama.cpp does.** Its builds are
  seeded rows, its models catalog rows in the kit's cache, its features routed by a preset, its
  graphics-card use booked with the kit's VRAM arbiter, its screens the kit's. An engine the kit
  doesn't have yet is a kit gap: it goes into the kit first and the app is built on it — never
  inside the app.
- **Modern ES modules everywhere.** `.js` files with standard `import` — app and kit code,
  scripts, tests and tools alike — never `require`, `createRequire`, `.mjs` or `.cjs`. The only
  CommonJS is what a platform forces, named with its doc: Electron's sandboxed preload
  (electronjs.org/docs/latest/tutorial/esm) and Capacitor's `.js` config
  (quasar.dev/quasar-cli-vite/developing-capacitor-apps/configuring-capacitor).
<!-- family-rules:end -->
