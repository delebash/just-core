<!-- SPDX-License-Identifier: MIT -->
# The family app template (Quasar)

The complete reference app every family app starts from — a fresh default Quasar app (`npm init
quasar@5.0.32 template -- --template app --preset sass --preset pinia`) made into the family's shape,
with everything the family's apps share and one small example area, **notes**. The `/new-just-app`
skill (`../skills/new-just-app/`, `../scripts/new-app.js`) copies its tracked files into a new
`just-<name>` app and renames it. The standard it follows is `../docs/app-structure.md` (§Q wins);
the plan that made it complete is `../docs/plans/2026-10-18-complete-template-and-standards.md` §6.

Run it: `npm install` (then once `cd src-electron && npm install` and `cd e2e && npm install`), and
`npm run dev`. The instructions for an AI are `AGENTS.md`.

## The shape

| Folder | What | How it runs |
|---|---|---|
| `src/` | the renderer: Vue 3, Quasar's components under the kit's (`@delebash/ui`), Pinia, the hash router, vue-i18n | Quasar's CLI builds it for every mode |
| `server/` | the app's Node server, its own package (`family-template-server`): Hono from the kit, the family guards, the family routers, the AI stack (`installLlm`), the database (`database/`), the example area's schema, store and routes | the desktop app runs it in a utilityProcess; `npm run server` headless |
| `src-electron/` | the desktop app: `electron-main.js` is the kit's `runDesktopApp` with this app's names; the preload is the kit's | `quasar dev -m electron` · `quasar build -m electron` (electron-builder, NSIS) |
| `src-capacitor/` | the phone app (Android, iOS), as Quasar generates it | `quasar build -m capacitor -T android` |
| `build/launcher/` | the headless launcher `family-template-server.cmd`: the installed exe (`familytemplate.exe`) run as Node on its server package — never the exe's name (§Q.3) | copied beside the exe by the installer |
| `e2e/` | the smoke suite and the screenshot capture over the real desktop app (Playwright's `_electron`), hermetic | `npm test` · `npm run screenshots` |
| `docs/` | the Help pages (`toc.json`, the five the family requires + `notes.md`) and `docs/dev/` (README, PRD, TASKS, IDEAS, RESEARCH) | the kit's Help drawer; `whats-new.md` feeds Settings → Updates |

### What every family app carries — where it is here

| Part | Files |
|---|---|
| Server wiring (§Q.3, §8, §11, §14) | `server/src/app.js` (the order), `serve.js`, `version.js`, `paths.js`, `app_state.js`, `auth.js`, `data_admin.js`, `api/{health,server_auth,prefs,settings}_api.js` |
| Data (§16) | `server/src/database/` — `schema.js` (migrations), `index.js` (open + migrate), `seed.js`, the stores `notes.js` and `settings.js` |
| Validation and errors (§15) | `server/src/schemas/` (shared with the forms), the kit's `input()`, `notFound`, problem+json with request ids |
| The AI half (§8) | `server/src/feature_catalog.js`, `seed_feature_prompts.js`, `seed_presets.js` (presets, JustWrite's three general Gemma rows and their class tunes) |
| The chrome (§11) | `src/layouts/MainLayout.vue`, `src/components/TitleBar.vue`, `src/pages/{AiPage,SettingsPage,ConnectionErrorPage}.vue`, `src/components/settings/`, `index.html`'s `#app-boot` plate |
| Start-up (§Q.4) | `src/boot/i18n.js`, `src/boot/familytemplate.js` |
| Services and stores | `src/services/{native,helpDocs,appearance,settingsSections}.js`, `src/stores/{ui,settings,notes}.js` |
| Tests (§18) | `server/tests/`, `src/**/*.test.js`, `src/boot.smoke.test.js`, `e2e/` |

## Commands

```bash
npm run dev            # the desktop app, live (quasar dev -m electron)
npm run dev:spa        # the renderer alone in a browser tab on :9000 (start the server yourself)
npm run server         # the server alone on :17490 (scripts/node24.js — Electron's Node); the UI at /
npm run build          # the installer → dist/electron/Packaged
npm run build:spa      # the browser build → dist/spa
npm run build:unpacked # the desktop app unpackaged → dist/electron/UnPackaged (what e2e drives)
npm run build:android  # the Android app
npm run lint           # Biome
npm run i18n:lint      # the i18n lint (zero)
npm run i18n:report    # keys missing from the English catalog (none)
npm run test:server    # the server's tests (Vitest on Electron's Node)
npm run test:unit      # the renderer's tests (Vitest, jsdom, Vue Test Utils + Quasar)
npm test               # the e2e smoke on the unpacked desktop build
npm run screenshots    # every surface as a PNG
npm run test:coverage  # coverage (v8), no gate
```

## What differs from Quasar's default, and why

- **`src-electron/electron-main.js` is the kit's shell**, not Quasar's window code: one shared
  implementation of the data folder, the server process, the tray and the window on `app://<id>`
  (Quasar's template loads `file://`).
- **The main process's dependencies are local packages** (`file:` the app's `server/` and the
  kit): `quasar.config.js` makes their paths absolute for `dist/electron/UnPackaged` and installs
  them with `npm install --install-links` (real copies, production dependencies only).
- **`server/` is an npm workspace** of the root: one `npm install`, one copy of what the renderer
  and the server share — and the renderer imports the server's request schemas by name
  (`family-template-server/schemas/notes.js`) for its forms.
- **The server runs on Electron's own Node** (`scripts/node24.js`) — the runtime it ships on, the one
  its native modules (better-sqlite3) are built for. Its tests too.
- **electron-builder**, not @electron/packager: NSIS installers (per user, the kit's
  `installer.nsh`), Electron's fuses, better-sqlite3's build leftovers excluded.
- **The CSP `<meta>`** in `index.html` lets the page reach its server (`connect-src http: https:`).
- **The boot plate** (`#app-boot` in `index.html`) shows the same picture as the warm-start splash —
  start-up is one continuous image, never a spinner.
- **Boot files**, not `main.js`: `src/boot/i18n.js` (vue-i18n, as Quasar's i18n preset installs
  it) and `src/boot/familytemplate.js` (the kit's UI, error reporting, Help, the server check, the
  preferences, the warm start).
- **The router is one exported instance** and the layout route is imported, not lazy (§Q.4).
- **No Roboto or Material Icons** (`extras: []`): the type is the tokens' `--font-ui` and Quasar
  draws the kit's line icons.
- **The theme**: `src/css/quasar.variables.scss` imports the kit's, `postcss.config.js` runs the
  kit's `dropQuasarDisabledRule()` and `quasarBaseLayer()`, `ripple: false`, the `Notify` plugin
  for the kit's toasts; `src/css/tokens.css` is hue-driven so Settings → Appearance retints it.
- **Biome**, not ESLint/oxlint (the family's one `biome.json`); ESLint runs one thing only, the i18n
  lint (`eslint.i18n.config.js`, the kit's file). Husky + lint-staged run Biome on staged files.
- **`resolve.dedupe`**: the aliased kit's peers come from this app's `node_modules`, one copy each.
- **`allowScripts`** in every `package.json` Quasar installs into (see "Traps").
- **Removed from the scaffold:** `EssentialLink.vue`, the example store, `IndexPage`/`SecondPage`/
  `ErrorNotFound` (a not-found page lives inside the chrome), the Quasar logo, the pnpm workspace
  files, the ssr/ssg/pwa/cordova/bex config blocks, `engines` and `keywords` in `package.json`.
- `src-capacitor/capacitor.config.js` stays CommonJS as Quasar generates it — the one non-ESM file.
- The icons (`public/icons`, `src-electron/electron-assets/icons`) are still Quasar's logo; an app
  brings its own (`tray.png` is the icon at 32 × 32).

## Traps

- **npm 11 refuses `allow-scripts` from `.npmrc` in a project install** unless the project's
  `package.json` declares `allowScripts`; `npm run` also hands the setting to every child as
  `npm_config_allow_scripts`, which made Quasar's own installs fail (`EALLOWSCRIPTS`), so
  `quasar.config.js` deletes that variable first thing (2026-10-08).
- **`build:unpacked` installs no `node_modules` into `dist/electron/UnPackaged`**: the unpacked app
  finds the kit's shell in the checkout's `node_modules`, and its own server can't start from there.
  The e2e harness runs the server itself; `npm run build` installs everything for the installer.
- **The agent's shell sets `NoDefaultCurrentDirectoryInExePath=1`**, so cmd won't run `gradlew.bat`
  from the current folder; build Android there with `env -u NoDefaultCurrentDirectoryInExePath …`.
- Quasar's dev watcher must not watch `data/` (Chromium keeps its files locked) — `extendViteConf`.
- Inside the kit's repo `npm install` prints husky's ".git can't be found" — harmless; the hook
  installs once a generated app has its own `.git`.
