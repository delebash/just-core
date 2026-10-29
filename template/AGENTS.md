# Family Template — instructions for any AI working in this repo

The family's reference app: the Quasar app every family app starts as a copy of (the
`/new-just-app` skill generates one from it). It carries everything the family's apps share — the
desktop app on the kit's shell, its own Node server (Hono) with a SQLite database, the AI stack,
the standard chrome (title bar, AI tasks, Help, Settings with its seven family sections, backups,
logs), help pages and tests at every level — plus one small example area, **notes**, that is the
reference for validation, errors, data, screens and tests. Plain JavaScript, `"type": "module"`
everywhere; Vue SFCs; Quasar's components under the kit's (`@delebash/ui`).

`README.md` lists the layout and every difference from Quasar's default; `docs/dev/PRD.md` is what
an app made from it is for.

## Commands

```bash
npm install            # the renderer and the server/ workspace; once each: (cd src-electron && npm install), (cd e2e && npm install), and the kit's fonts (cd ../packages/ui && npm install)
npm run dev            # the desktop app, live (the shell starts the server on <repo>/data)
npm run dev:spa        # the renderer alone in a browser tab on :9000 (run `npm run server` beside it)
npm run server         # the server alone (headless) on :17490, the built UI at /
npm run build          # the installer (dist/electron/Packaged)
npm run build:spa      # the browser build (dist/spa), what the headless server serves
npm run build:unpacked # the desktop app unpackaged — what the e2e smoke drives
npm run lint           # Biome
npm run i18n:lint      # no word written into a template or built in code (must be 0)
npm run i18n:report    # keys used but missing from the English catalog (must be none)
npm run test:server    # the server's tests, on Electron's Node
npm run test:unit      # the renderer's tests (stores, the mounted Notes page, the kit's controls mounted, the boot smoke)
npm test               # the e2e smoke on the unpacked desktop build (build:unpacked first)
npm run screenshots    # every surface as a PNG in e2e/shots/
npm run test:coverage  # coverage (Vitest's v8), no gate
npm run bump 0.2.0     # the version (package.json and server/package.json)
npm run release        # the release: installers + the update feed built on GitHub (.github/workflows/release.yml, manual only)
```

**Must pass before a commit:** `npm run lint && npm run test:server && npm run test:unit` and the
family guard, `node ../scripts/check-family.js` — run by hand; no hook runs anything on a commit (the
user, 2026-10-29: no commit hooks, family-wide). A change a user can see also passes `npm run i18n:lint`, updates `docs/*.md`,
and `npm run build:unpacked && npm test`.

## What bites

- **The server owns the data.** The renderer keeps nothing durable: it asks `/v1/*`. A value a user
  might change is a seeded row (`server/src/database/seed.js`) with a schema
  (`server/src/schemas/settings.js`), never a constant.
- **SQL lives only in the stores** (`server/src/database/notes.js`, `settings.js`). A schema change is
  a new entry in `database/schema.js` `MIGRATIONS` — never an edit to an applied one.
- **A route's schema is its form's rules.** `server/src/schemas/<area>.js` imports only
  `@delebash/core/platform/schema`, because the renderer imports it too
  (`family-template-server/schemas/<area>.js`, `schemaRules(...)`).
- **Errors:** a refusal is the kit's `notFound`/`ApiError`, never hand-built JSON; the renderer shows
  a failure through `reportError`, a 422 under its field through `fieldErrors`. Never log a secret or
  the user's content.
- **AI calls go through the kit's runners** (`runAiFeature`, `withAiTask`) — never the task store
  directly. A new AI feature is a `feature_catalog.js` row + a prompt + a preset, registered the day
  it calls the engine.
- **Seeding is serve.js's**, not `createApp`'s: a test's `createApp(tmp)` starts empty.
- **Server tests use `useHermeticKit()`** (`server/tests/helpers.js`): the kit's singletons, the fake
  hardware, `JUST_AI_HOME` in a temp folder.
- **`window.appShell` is read only by `src/services/native.js`.** Every word is a vue-i18n key.
- **The e2e smoke needs port 17490 free** — it runs its own server there and won't touch yours.

## Where to look

| For | Read |
|---|---|
| **THE family app structure — every app** | `../docs/app-structure.md` (§Q the layout, §11 the chrome, §15–§18 the contracts) |
| The shared stack (kit) | `../docs/dev/README.md` · `../packages/core/README.md` |
| What this app is for | `docs/dev/PRD.md` |
| Open work · ideas | `docs/dev/TASKS.md` · `docs/dev/IDEAS.md` |
| What is already known | `docs/dev/RESEARCH.md` (the kit's: `../docs/dev/RESEARCH.md`) |
| The example to copy | `server/src/{schemas,database,api}/notes*` · `src/pages/NotesPage.vue` · `src/components/NoteDialog.vue` · their tests |

## The family rules

A copy of the kit's `docs/family-rules.md`, kept identical by a check — edit the kit's file, never
this copy.

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
- **A fork is brought up to date before we work on it.** Before any work on a fork we keep (today
  our audio.cpp, github.com/delebash/audio.cpp; any fork a later app takes on), merge its upstream
  into our branch, build it, and test the merged build in the app that runs it — the real app on its
  real data (JustVoice: `npm run dev`) — then start the work. (The user, 2026-10-29: "before we do
  any work on audio cpp nextime we should update the fork and test it in our app … this should be
  true for any forks for futre apps that we may use".)
- **Modern ES modules everywhere.** `.js` files with standard `import` — app and kit code,
  scripts, tests and tools alike — never `require`, `createRequire`, `.mjs` or `.cjs`. The only
  CommonJS is what a platform forces, named with its doc: Electron's sandboxed preload
  (electronjs.org/docs/latest/tutorial/esm) and Capacitor's `.js` config
  (quasar.dev/quasar-cli-vite/developing-capacitor-apps/configuring-capacitor).
<!-- family-rules:end -->
