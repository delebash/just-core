# THE FAMILY APP STANDARD — every family app, identical by construction

**Every family app is a Quasar app (§Q), and a new one starts as a copy of the kit's
`template/` (§1).** The rules every repo follows in every session are in
[`family-rules.md`](family-rules.md), which each repo's AGENTS.md carries a copy of; this document is the
detail behind them. Read the section a change touches: layout, scripts, shell, server, the LLM
stack, the app chrome, docs. `scripts/check-family.js` (the guard) checks what can be checked.

Ruled by the user, 2026-08-02, after parity gaps kept surfacing one at a time: **one
document that covers EVERYTHING, so a new app is the same as the last one — layout,
scripts, tests, shell, server, API — and adding llm-runner is the same every time.**
Where an item here is ambiguous, the template is the reference, then the three apps.

A deviation is allowed only when flagged to the user AND listed under
[Open deviations](#open-deviations) at the end of this document in the same change.

This standard governs the family's APPS. The repo hosting it (`just-core`) is the shared
LIBRARY: it follows §13 (docs) and its own CLAUDE.md and README, and is exempt from the
app-shaped sections (§Q, §1, §2, §5, §10, §12). Its `template/` is checked against §Q. Section
numbers skip (§0, §6, §7 and §9 are gone) so that citations elsewhere keep working.

---

## Q · The Quasar app — every family app (2026-10-08)

**Every family app is a Quasar app** (decided 2026-10-08 — this repo's `docs/dev/TASKS.md`,
"Every family app moves to Quasar, built by one set of framework rules"; the facts:
`docs/plans/2026-10-08-quasar-framework-research.md`; the order of work:
`docs/plans/2026-10-08-sync-and-quasar-program.md`). Quasar's own tooling is the whole app: its
CLI builds the renderer, its Electron mode is the desktop app (calling the kit's shared shell), its
Capacitor mode is the phone app. **The reference is `template/` in this repo** — a fresh default
Quasar app (`npm init quasar@5.0.32 template -- --template app --preset sass --preset pinia`)
made into the family shape and verified as the packaged desktop app, in dev mode, as the browser
build, and as an Android build on the emulator (iOS untested); its README lists every difference
from Quasar's default and why. Where §Q and §1–§14 disagree, §Q wins.

### Q.1 · The layout

**The layout is the one Quasar's CLI creates for a new project** (the user, 2026-10-09) — the
template's, made with `npm init quasar`; the three apps moved to it 2026-10-09
(`plans/2026-10-09-apps-on-the-quasar-cli-layout.md`):
- `src/App.vue` is a bare `<router-view />` — the routes decide what shows.
- `src/layouts/MainLayout.vue` is the app's chrome on Quasar's layout: `q-layout` with the title
  bar in `q-header`, the sidebar in `q-drawer` (Quasar's mobile drawer at phone width, where the
  app has a phone; `behavior="desktop"` where it doesn't), the pages in `q-page-container`. It is
  the parent route of every page.
- `src/pages/<Name>Page.vue`, one per route, each rooted in `q-page` with the kit's `style-fn`:
  `pageFill` (as tall as the space under the header — the page owns its scrollers) or
  `pageFlow` (it flows in an area scroller the layout holds, sized by its own classes).
- A screen outside the chrome is a route of its own beside the layout route — the connection-error
  page (`/offline`), JustVoice's dictation window (`/dictate`).
- Modules that aren't pages go to `components/` (a Settings section, a modal) or `services/`;
  stylesheets are `src/css/` (`tokens.css`, `app.scss`), listed in `quasar.config.js > css`.

```
<repo>/
├── package.json              # the Quasar app — the renderer's dependencies; "type": "module";
│                             #   "workspaces": ["server"] (Q.3); allowScripts (Q.6); scripts (Q.9)
├── quasar.config.js          # the ONE build config (no vite.config.js, no main.js)
├── index.html                # the family CSP <meta> (Q.5)
├── biome.json                # Biome, not oxlint/ESLint
├── postcss.config.js         # the kit's dropQuasarDisabledRule() + autoprefixer (Q.4)
├── src/                      # the renderer
│   ├── App.vue · layouts/ · pages/ · components/   # App.vue is the root Quasar mounts
│   ├── boot/                 # app start-up code (Quasar boot files) — where main.js used to be
│   ├── router/index.js · routes.js   # defineRouter from '#q-app'; hash history (always, for
│   │                                 #   Electron and Capacitor)
│   ├── stores/index.js · <domain>.js # index.js creates Pinia (defineStore from '#q-app');
│   │                                 #   each store is Pinia's own defineStore
│   ├── css/app.scss · quasar.variables.scss   # the family theme maps Quasar's variables onto
│   │                                          #   the kit's live CSS variables (Q.4)
│   └── services/native.js    # the ONLY reader of window.appShell (Q.2)
├── server/                   # the app's Node server — ITS OWN PACKAGE, an npm workspace (Q.3)
│   ├── package.json          # "<app>-server", "type": "module", its runtime dependencies
│   └── src/serve.js · app.js · …   tests/*.test.js
├── scripts/node24.js         # runs a script on Electron's own Node (src-electron's electron)
├── src-electron/             # the desktop app (Q.2)
│   ├── electron-main.js      # the kit's runDesktopApp({...}) — config, no logic
│   ├── electron-preload.js   # import "@delebash/core/shell/preload" — that's all
│   ├── electron-assets/icons/
│   └── package.json          # electron (exact), electron-builder, and the main process's
│                             #   dependencies: the app's server package + the kit (file:)
├── src-capacitor/            # the phone app (Q.7)
├── public/                   # copied as-is
└── data/                     # the dev data folder — gitignored, never watched (Q.8)
```

### Q.2 · The desktop app — Electron mode on the kit's shell

`src-electron/electron-main.js` calls `runDesktopApp` from `@delebash/core/shell` and nothing
else — no logic in main: a need the shell can't meet is built in the kit's `packages/core/src/shell/`, for
every app. Its fields (the template's file is the reference; the guard checks the required ones —
`id`, `appName`, `productName`, `port`, `serverEntry`, `dataDirEnv`, `repoRoot`, `distDir`):

| Field | What |
|---|---|
| `id` | `just<name>` — lowercase letters and digits, no hyphens (an Android applicationId allows only `[a-zA-Z0-9_]`; the template's is `familytemplate`) — the `app://` host, the tray id, `com.<id>.app` |
| `appName` | the data folder's name under the OS fallback (Q.8) |
| `productName` | shown in the tray and dialogs |
| `port` | the app's registered server port (§1) |
| `dataDirEnv` | `<SNAKE_UPPER>_DATA_DIR` |
| `serverEntry` | development: `path.resolve("server", "src", "serve.js")`; packaged: `path.join(import.meta.dirname, "node_modules", "<app>-server", "src", "serve.js")` |
| `repoRoot` | development: `path.resolve(".")` (the dev data folder is `<repo>/data`); packaged: `null` |
| `distDir` | `import.meta.dirname` — Quasar puts the built renderer beside `electron-main.js` |
| `devUrl` | `import.meta.env.QUASAR_APP_URL` (the shell uses it only when not packaged) |
| `preload` | `path.join(import.meta.dirname, "electron-preload.cjs")` — Quasar bundles the preload to CommonJS (sandboxed preloads run as plain scripts) |
| `icon` | `resolveElectronAssetsPath("icons/icon.png")` from `'#q-app/electron/main'` |
| `window` · `trayIcon` · `logFile` | per app — window size/title/background, the tray icon, the server's live log (tray "Open log file") |
| `closeHoldMs` · `csp` · `cspAdd` · `trayExtras` | optional — JustWrite's 400 ms pagehide hold · the `app://` CSP (the kit writes a default) · sources added to the default's directives (JustWrite: `{"img-src": ["https:"]}`, for images pasted from the web) · extra tray items sent as `tray:<event>` |
| `updates` | optional — `{releasesUrl}`, the app's GitHub releases page. With it, a packaged app updates itself (electron-updater): one check at start-up, a download when the user presses Download, the install when the app quits or at "Restart now"; a Mac only checks and links to the release. The feed is electron-builder's `publish` (`quasar.config.js > electron.builder`), and the release workflow uploads `latest*.yml` and the `.blockmap`s with the installers. The app's `native.js` hands `desktopUpdater()` to the kit's `UpdatesPanel` (`:updater`). In development, `<ID>_UPDATE_FEED` names a local feed. The template carries the release: `.github/workflows/release.yml` (manual only — `workflow_dispatch`, as JustWrite's), `scripts/release.js` (`npm run release`), `scripts/bump.js` (`npm run bump`), `scripts/start-packaged.js` (each runner starts the packaged app on a fresh data folder and it must answer on its port with its own version — Linux under Xvfb; then the AppImage is opened on Ubuntu 24.04 as a user opens it, no flags; a publish job attaches every platform's files only after every check passed) and the builder's GitHub `publish`; an app adds `updates` with its first release. The guard's check 19 holds it. |

The window still loads `app://<id>/index.html` (the kit registers the protocol; Quasar's own
template loads `file://`), with the hash router. **Packaging — `quasar.config.js > electron`:**
- **Installers are unsigned, family-wide** (the user, 2026-10-29): no publisher's certificate on Windows or macOS.
  Windows shows "Windows protected your PC" (More info → Run anyway) and Smart App Control blocks the app outright;
  macOS refuses to open it until System Settings → Privacy & Security → Open Anyway (Control-click → Open on macOS 14
  and earlier). A Mac can't install an unsigned update, so it only checks and links to the release (`updates`
  above). Every app's `docs/getting-started.md` says so in its "Installing it" section, from the template's.
- `bundler: 'builder'` — electron-builder (NSIS on Windows, `oneClick: false`), not Quasar's
  default @electron/packager; `builder: { appId: 'com.<id>.app', productName, win, nsis,
  asarUnpack: ['**/*.node'] }` — native modules can't load from inside the asar archive; the
  server itself runs from inside it (the utilityProcess and the headless launcher read the
  archive; JustWrite measured both, 2026-10-08). Unpack only what the server copies out with
  `fs` (JustWrite: `node_modules/justwrite-server/samples/**`).
- The main process's dependencies are local packages named by `file:` paths relative to
  `src-electron/`. Quasar copies them unchanged into `dist/electron/UnPackaged/package.json`, two
  folders down, so `extendElectronPackageJson` makes them absolute, and
  `unPackagedInstallParams: ['install', '--install-links']` installs them as real copies with
  their production dependencies only (a `file:` link would carry the linked folder's whole
  `node_modules`, development tools included). electron-builder then rebuilds the native modules
  for Electron.
- `preloadScripts: ['electron-preload']`.

**What the kit's shell does, so no app does it:** resolves the data root before Chromium writes
anything and keeps Chromium's own files under `<root>/electron`; runs `serverEntry` in a
`utilityProcess` (`serve`, the root in `dataDirEnv` — the server listens on the port its own
settings name, `port` being its default, and says which; when it can't, a listener there is
stopped only if it answers `GET /v1/health` with the app's `product`, then the server starts
again), and stops it gracefully on quit (asks, waits up to 15 s, then kills); loads the window from
`app://<id>/` (the dev server in development) — it opens even with the server down and shows the
kit's connection-error screen; the §11 tray and keep-running switch; the native dialogs; the
opener. The server's own escape hatch is `<ID_UPPER>_DEV_NO_SERVER=1`.

**One bridge object — `window.appShell` — read only by `src/services/native.js`.** The kit's
preload exposes it: `invoke(command, args)` for the shell's commands (`pickDirectory`,
`pickFile`, `saveFile`, `storageGetRoot`, `storageRelocate`, `storageOldCopies`, `storageRemoveOldCopy`,
`storageForgetOldCopy`, `storageUseDefault` (the old copy a move leaves — removed, or its record forgotten when it
can't be found — and the default folder from now on — 2026-10-20), `setKeepRunning`, `setTrayLabels`,
`setContextMenuLabels` and `setSpellCheckerLanguages` — the right-click menu's words and the
spellchecker's languages, since the shell draws the menu (electron-context-menu, 2026-10-18) —
`openExternal`, `openPath`, `serverUrl` — the server's URL once it listens, for the renderer's
API base), `on(event, fn)` for its `tray:*` pushes, `platform`, and `versions`
(`{ electron, chrome }`, for an About page). `native.js` is the one file that reads it and the one
that asks the kit's `isDesktopShell()`; it exports one function per command plus `openUrl` /
`openPath` / `onShellEvent`, and outside the desktop app (a browser tab, the headless UI) each
answers the browser's way — null or a no-op. A new command is added in the kit (main's `COMMANDS`
and the preload's list), never per app. The renderer's three doors are §5; the guard (checks
12–14) fails a `window.appShell` or `isDesktopShell` read outside `native.js`, a main that doesn't
import `runDesktopApp` from the kit, imports anything else, misses a required field, or passes a
port off the registry.

### Q.3 · The server — its own package

`server/` is a package of its own (`"name": "<app>-server"`, `"type": "module"`, its runtime
dependencies, `@delebash/core` as `file:`), because Quasar's packaged app installs only what
`src-electron/package.json` names: the server package goes there, and with it everything the
server needs. It is also an **npm workspace** of the root (`"workspaces": ["server"]`), so one
`npm install` installs both, with one copy of each package the renderer and the server share
(npm ignores `allowScripts` in a workspace — the root's applies). Code both sides need lives in
the server package and the renderer imports it by name (`<app>-server/<path>`, through the
package's `exports`) — JustWrite's editor schema, which its sync parses scene HTML with. The
server's files resolve from its own folder: in the packaged app the package sits at
`<app>/node_modules/<app>-server` and the built UI at `<app>` (`resources/app.asar`). In a
checkout `npm run server` runs it from source on Electron's Node (`node scripts/node24.js
server/src/serve.js serve` — the runtime it ships on, the one its native modules are built for);
headless it is the app's exe run as Node on the installed copy (below). Its shape: `serve.js`
(`serve [--host] [--port] [--data-dir] [--log-level]`) through the kit's `runServer`, a Hono app
from the kit's `createServer`, the family guards added outermost first and before every route
(`app.use("*", csrfOrigin(…))`, `resourceIsolation(…)`, `starletteCors(…)`, `bearerAuth(…)` — Hono runs middleware in the
order added, for the routes added after it), the routers mounted with `app.route()`, the AI stack
(where the app has one) mounted with `installLlm` (§8), the built UI (`dist/spa`) served at `/` for
the headless path (the kit's `serveStatic`, GET only). **One Hono:** an app takes `Hono`, `stream`
and `serveStatic` from the kit (`@delebash/core/platform`), never from `hono` itself — a
second copy's sub-apps answer errors with Hono's plain 500 (the kit's
`docs/plans/2026-10-09-hono-standard.md` §10, which also has the route-by-route rules).
The CSRF guard allows the window's `app://<id>` (the app's own origins), the phone's webview
origins (the kit's `CAPACITOR_ORIGINS`) and Quasar's dev server. `resourceIsolation` (Fetch Metadata, web.dev's
Resource Isolation Policy — 2026-10-20) refuses a GET or HEAD the browser marks `Sec-Fetch-Site: cross-site` (a
cross-site `<img>` of `/v1/data/backup` made backups) unless it carries an Origin from the same allowlist or is a
top-level navigation to the UI's pages: the window's own `fetch`es pass by their Origin; a no-cors load of the
server's files from the window (`<img>`, `<audio>` with the server's address) is refused — fetch them instead.

- **The server rules** — bearer auth for the headless path (OFF while the token list is empty;
  loopback exempt unless required; Settings → Server manages the tokens), the error envelope
  registered before CORS so errors flow out through it, and a test that sends an `Origin:` header
  and asserts `access-control-allow-origin` comes back (no same-origin `inject` test can see a
  missing CORS — the 2026-08-02 i18n rewrite shipped 126 green tests and zero working browser
  requests) — from the kit's `platform` (`bearerAuth`, `csrfOrigin`, `starletteCors`,
  `installErrorHandlers`, `makePrefsRouter`, `makeLogsRouter`, `makeDiskRouter`,
  `makeDataRouter`). The window's origin `app://<id>` is cross-site, so a JSON POST sends a
  preflight; the server's CORS and CSRF allowlists carry it.
- **Tests**: `server/tests/*.test.js`, vitest on Electron's Node (`npm run test:server`); routes
  through Hono's `app.request`.
- **Headless is the app's own exe run as Node**: `build/launcher/<app>-server.cmd` sets
  `ELECTRON_RUN_AS_NODE=1` and runs the exe on
  `resources/app.asar/node_modules/<app>-server/src/serve.js`; its shell-script twin
  `build/launcher/<app>-server` does the same on macOS and Linux (no display needed). The builder
  config in `quasar.config.js` copies each platform's (`extraResources` per platform, `filter`): the
  .cmd beside the Windows exe, the script beside the Linux one (an AppImage: after
  `--appimage-extract`, in `squashfs-root/`) and into the Mac app's `Contents/Resources` (a signed
  bundle's root takes no unsealed file). Same server, same UI at `/`, no window; the release starts
  it on every runner (`start-packaged.js --headless`). A domain CLI gets a launcher the same way
  (docgen's `just-ai-i18n-docgen.cmd`). In a checkout: `npm run server`.
- **A launcher never shares the app executable's name** — Windows resolves a bare name to the GUI
  exe first and spawns windows forever (JustVoice's CreateProcessW trap).

### Q.4 · The renderer — Quasar's components, the kit's family pieces, the family theme

- **The kit's controls are thin layers over Quasar's components** (`UiButton` → `QBtn`,
  `UiSelect` → `QSelect`, `UiTable` → `QTable`, `AppModal` → `QDialog`, `pushToast` → Notify,
  `UiMenu` → `QMenu`, …), and **the kit keeps the family pieces** — the AI settings, the task
  strip, the model catalog, the appearance engine — rebuilt on Quasar (decided 2026-10-08, rec 2;
  built in step Q3, `docs/plans/2026-10-09-kit-controls-on-quasar.md`). Apps keep the `Ui*` API
  and never rewrite views onto `q-*` tags; a shape the kit doesn't have uses Quasar's own component
  before anything hand-rolled. The rule of §4 is **"nothing hand-rolled that Quasar or the kit
  ships"**.
- **The theme:** the kit's `packages/ui/src/quasar/variables.scss` points Quasar's Sass variables at the
  kit's live CSS variables (`$primary: var(--accent)`, …) so the CSS Quasar compiles follows
  Settings → Appearance at runtime (Quasar does no colour maths on them — checked 2026-10-08), and
  switches off Quasar's rules for the bare h1–h6 elements (`$h-tags: ()`: with them on, every
  JustWrite page header grew — a 6rem line-height). The app's `src/css/quasar.variables.scss` (the
  file Quasar reads) is one line: `@import "@delebash/ui/quasar/variables.scss";`. Measured on
  JustWrite (2026-10-08): with it, ten screens match the Electron + Vite build to within 0.02 % of
  their pixels, except for one global Quasar rule, `.disabled, [disabled] { opacity: .6 !important;
  cursor: not-allowed !important }`, which no variable reaches and which outranks the apps' own
  disabled styles. **The kit's PostCSS step `dropQuasarDisabledRule()`
  (`packages/ui/src/quasar/postcss.js`) removes those rules from Quasar's stylesheet**, in every app's
  `postcss.config.js` (decided 2026-10-08 — the kit's TASKS, the Quasar item); with it both apps'
  screens match pixel for pixel. The design tokens the theme reads are the app's own
  (`tokens.css`, from the kit's `tokens.contract.css`; the template's `src/css/tokens.css`). The
  kit's override sheet (with Q3's controls) covers what variables can't reach, and gives Quasar's
  own components their disabled look; Quasar's icons become the kit's line icons (an icon
  set). The kit's toasts (`pushToast`) are Quasar's Notify plugin, so every app lists `'Notify'` in
  `quasar.config.js > framework.plugins` (the guard checks it). The phone UI-library test measured it: every Appearance knob drives Quasar's controls live
  (JustWrite's `docs/plans/2026-10-08-phone-ui-library-test.md`).
- **Start-up code lives in boot files** (`src/boot/<name>.js`, `defineBoot` from `'#q-app'`, listed
  in `quasar.config.js > boot`), not `main.js`: the kit's UI install (`installLlmUi`), the
  appearance engine, the native bridge's openers. Quasar awaits them, then installs the router and
  mounts `App.vue` on `#q-app`. A boot can't swap the root component, so a start-up that ends
  on another screen routes there: a `router.beforeEach` guard in the boot file (Quasar's documented
  place for one) sends every route to it — `/offline?from=…` while the server is down, back to `from`
  once it answers; the root stays a bare `<router-view />`.
  The boot smoke test runs the same steps by hand, since Quasar's entry exists only inside its
  build; vitest aliases `#q-app` to `@quasar/app-vite` (Quasar's own alias).
- **Never** Quasar's private composables (`useField`, `useDark` are private in 2.35); a control of
  our own sits in `QField`'s `control` slot; dark state is `$q.dark`.
- Pages are lazy routes (`() => import('…/pages/…')`); the layout is imported, not lazy — every
  screen needs it, and lazily its components' styles moved into a later chunk, after the app's,
  and won ties with them (measured on JustVoice). `build.vueRouterMode: 'hash'`.
- The layout's root is fixed to the window, clipped and opaque (the kit's `quasar/theme.css`,
  "Layout"; an app's root class may paint its own colour): the window never scrolls, and Chrome
  paints the app and its overlays in that one layer, with sub-pixel text. The page container
  fills it, so `pageFill` is right at every UI zoom (Quasar's own window measurements are
  unzoomed pixels).

### Q.5 · The CSP

`index.html`'s CSP `<meta>` lets the page reach its server — beside it on the desktop
(`http://127.0.0.1:<port>`), a paired device or a server over the network for sync and the thin
client: `connect-src 'self' http: https:` (+ `ws://localhost:*` in development for Quasar's HMR);
`img-src`/`media-src` allow `data: blob: http: https:`; scripts stay `'self'` (+
`'wasm-unsafe-eval'` in Capacitor mode, for the SQLite WASM build). Quasar's default `<meta>` has no
`connect-src` and blocks the renderer → server path (measured 2026-10-08). The desktop shell
still sends its own stricter header for `app://`; both apply there.

### Q.6 · npm and the Quasar CLI — the traps

- **`allowScripts` in every `package.json` Quasar installs into** — the root (which
  `dist/electron/UnPackaged` copies), `src-electron/`, `src-capacitor/` (not the `server/`
  workspace: npm ignores it there). npm 11 refuses
  an `allow-scripts` setting from `.npmrc` in a project install unless the project declares
  `allowScripts` (then it uses that).
- **`quasar.config.js` deletes `process.env.npm_config_allow_scripts`** first thing: `npm run`
  hands an `.npmrc` `allow-scripts` setting to every child as that variable, and the installs
  Quasar spawns then fail with `EALLOWSCRIPTS` (measured 2026-10-08: `npm run build` failed at
  the `UnPackaged` install, then passed with the line).
- Never install Quasar, `@quasar/extras` or `@quasar/app-vite` as a library's dependency (a
  second copy of Quasar breaks its plugins).

### Q.7 · The phone — Capacitor mode

> **Not offered to new apps (2026-10-19, the template audit).** The template's `src-capacitor/` is
> the scaffold only — it has no in-app server, so its phone build shows the connection page. The
> generator makes apps without it (`--phone` says why) until the template carries the in-app server
> below; JustWrite's `src/phone/` and `server/src/phone.js` are the reference.

`src-capacitor/` as Quasar generates it (`quasar mode add capacitor --app-id com.<id>.app
--app-name "<Product>"`). `capacitor.config.js` stays **CommonJS as generated** — "Capacitor's
`.js` config loader doesn't yet handle ESM exports" — the family's one non-ESM file (generated
config, not our code); `src-capacitor/package.json` gets `allowScripts`. Build: `quasar build -m
capacitor -T android` (`-d` debug). The native projects (`android/`, `ios/`) are generated by the
first build and then **committed** — Capacitor treats them as source (its docs: "Workflow"); the
phone's network config (plain HTTP to private addresses), file sharing and permissions live there.
Plugins install in `src-capacitor/`.

**The in-app server** (the plan: `docs/plans/2026-10-08-the-phone.md`). The phone runs the app's
own Hono server in a web worker (`app.fetch` — no stand-ins for Node's http), on the official
SQLite WASM over OPFS (tested on Android 16 and iOS 18.7 — `just-sqlite-sync`'s RESEARCH), and the
window's requests go there; a module that needs the disk has a `<name>.phone.js` version chosen
by the package's `"imports"` with a `"browser"` condition (Node's subpath imports — the kit's
`#runner/lifecycle`, JustWrite's `#app_state`, …):
- the server: `server/src/phone.js` builds it on an open database handle (the routes the phone
  runs; no network door); `src/phone/server-worker.js` is the worker's entry, through the kit's
  `serveInWorker` (`packages/core/src/platform/worker/runtime.js`);
- the bundle: `scripts/phone-worker.js` (esbuild with the kit's `workerShims` plugin — Node's
  built-ins → browser stand-ins, `better-sqlite3` → the same API over SQLite WASM, a module's
  `<name>.phone.js` twin in its place — and the polyfills of Node's built-ins) into
  `src/phone/worker-bundle/` (gitignored), run by `quasar.config.js`'s `beforeDev`/`beforeBuild`
  in Capacitor mode;
- the window: `src/phone/boot.js` starts the worker (the bundle shipped as built, `?url`) and
  routes every request there with the kit UI's `setServerTransport(workerFetch(worker))`; the
  boot file calls it first through the `#in-app-server` alias (`none.js` on a computer). A
  browser build with the in-app server (`<APP>_IN_APP_SERVER=1`) tries it without a phone.

### Q.8 · The data folder, and the dev watcher

ONE module finds the data folder — the kit's `packages/core/src/platform/data_paths.js`, used by the shell
before the window opens and by the headless server (the user, 2026-08-14: "all that can be the
same should be, this includes how data is stored"; nothing lands anywhere the user did not
choose): the app's data-dir variable (`--data-dir` sets it) → the Change-folder pointer
`dataroot.txt` (a pointer naming the computed default is residue and is deleted) → **`data/` in
the install directory** (packaged: beside the exe; a checkout: `<repo>/data`) → the OS fallback
`%LOCALAPPDATA%\<App>\<App>` only when the install directory isn't writable, its pointer beside it
at `%LOCALAPPDATA%\<App>\dataroot.txt`. Chromium's own files and the window position live under the
root (`<root>/electron`).

The dev data folder `<repo>/data` is gitignored, and **excluded from Quasar's dev watcher** (`build.extendViteConf` adds `'**/data/**'` to `server.watch.ignored`):
Chromium keeps its files there locked and the watcher fails on them (EBUSY).

### Q.9 · Commands

| Script | Runs |
|---|---|
| `dev` | `quasar dev -m electron` — the desktop app, live (the shell starts the server from source on `<repo>/data`) |
| `dev:spa` | `quasar dev` — the renderer alone in a browser tab on the dev port (start the server yourself) |
| `build` | `quasar build -m electron` — the installer (`dist/electron/Packaged`) |
| `build:spa` | `quasar build` — the browser build (`dist/spa`), served by the server for headless use |
| `build:unpacked` | `quasar build -m electron --skip-pkg` — the desktop app unpackaged (`dist/electron/UnPackaged`), what the e2e harness drives |
| `build:android` | `quasar build -m capacitor -T android` — where the app has a phone app |
| `server` · `test:server` | `node scripts/node24.js server/src/serve.js serve` · vitest the same way — on Electron's own Node 24, the runtime the server ships on (`scripts/node24.js` runs `src-electron`'s Electron with `ELECTRON_RUN_AS_NODE=1`), never the `node` first on PATH. `test:server` is every app's, the template's included |
| `lint` | `biome check .` |

`npm install` installs the root and the `server/` workspace; `src-electron/` (and
`src-capacitor/`) install separately, once.

### Q.10 · What the guard checks for a Quasar app

`scripts/check-family.js` checks every app against this section (an app without
`quasar.config.js` is a violation, and its layout checks don't run):
- **scripts** (check 3): `dev`, `build`, `build:spa`, `server`, `lint` present, the first four
  exactly as Q.9 (`server` through `scripts/node24.js`); no `tauri` script.
- **server** (check 4): `server/src/serve.js`; `server/package.json` named `<app>-server` with
  `"type": "module"`; tests in `server/tests/*.test.js`.
- **the theme**: `postcss.config.js` runs the kit's `quasarBaseLayer()`;
  `src/css/quasar.variables.scss` imports `@delebash/ui/quasar/variables.scss`;
  `quasar.config.js`'s `framework.config` sets `ripple: false` (Q.4).
- **ports**: the desktop main's `port` matches `APP_PORTS`; `devServer` (and its HMR port, where
  set) matches `DEV_PORTS` (§1).
- **desktop main** (check 14): `src-electron/electron-main.js` imports `runDesktopApp` from the
  kit's shell and nothing but `node:*` and `'#q-app/electron/main'`, passes the required fields
  and the registry port; `src-electron/electron-preload.js` imports the kit's preload.
- **the layout** (Q.1–Q.8): `"type": "module"`, `allowScripts` and `"workspaces": ["server"]` in the
  root; `scripts/node24.js` running `src-electron`'s Electron as Node;
  `quasar.config.js` has hash routing, `bundler: 'builder'`, `extendElectronPackageJson`,
  `--install-links`, the `**/data/**` watch ignore and the `npm_config_allow_scripts` delete;
  `src-electron/package.json` pins `electron` exactly, depends on the server package and has
  `allowScripts` (so does `src-capacitor/package.json` where it exists); `index.html` has a CSP
  `<meta>` whose `connect-src` allows `http:`; `biome.json`; `postcss.config.js` running the
  kit's `dropQuasarDisabledRule()`; `src/css/quasar.variables.scss` importing the kit's theme; `data/` in `.gitignore`; Quasar's
  router, store, `quasar.variables.scss` and `App.vue` files; no `@tauri-apps/*` package, no
  `vite.config.js`, no `src/main.js`, no `electron/main.js`, no `src-tauri/`.
- **the CLI's layout** (Q.1): `src/layouts/MainLayout.vue`; pages in `src/pages/`; no
  `src/views/`, `src/styles/` or `src/AppShell.vue`; `App.vue`'s template a bare `<router-view />`.
- **the headless launcher** (Q.3): `build/launcher/` holds a `<name>-server` launcher, the builder
  copies it beside the exe (`extraResources`), `builder.win.executableName` is set, and no
  launcher shares the exe's name.
- **§14's renderer** (every app and the template): the lanes `boot/ components/ css/ layouts/
  pages/ router/ services/ stores/` (+ `composables/` in JW and JV); the skeleton files
  (`css/tokens.css`, `css/app.scss`, `pages/HomePage.vue`, `boot.smoke.test.js`,
  `services/helpDocs.js`, `stores/ui.js`, `.gitattributes`, `biome.json`, `vitest.config.js`,
  `scripts/node24.js`, `server/vitest.config.js`; `KeyboardCheatsheet.vue` in JW and JV); and the
  door pins — `boot.smoke.test.js` rides the kit's `registerBootSmoke`, `helpDocs.js` its
  `makeDocsHelpAdapter`, `stores/ui.js` exports `useUiStore`.
- Biome's version is one exact pin across the family, the template included; `biome.json` is
  byte-identical among the apps.

- **words** (check 16, §Q.11): `vue-i18n` in `package.json`; `'i18n'` in the boot list;
  `src/boot/i18n.js` calling the kit's `followQuasarLang`; `src/i18n/index.js` starting from
  `kitMessages()`; none of the kit's removed text doors (`configureFamilyLabels`, `setUiLocale`,
  `FAMILY_LABELS`, `familyLabels`, `quickSetupCopy`, `catalogCopy`, `configureDialog`) in
  `src/`; `eslint.i18n.config.js` byte-identical to the kit's `packages/ui/eslint.i18n.config.js` (an app
  without one is advisory until docgen and JustVoice have theirs — the i18n plan's Tasks 4 and 5).

Since 2026-10-18 the template is a complete app and is checked as a product, like every app — plus
`checkCommonServer` (§14, §15) and the AGENTS.md family-rules copy (§2).

### Q.11 · Words — vue-i18n

Every word an app shows is a vue-i18n message, the kit's included (decided 2026-10-12: the kit's
TASKS, "Every app and the kit on vue-i18n"; the plan `docs/plans/2026-10-12-i18n-standard.md`).
The template is the reference.

- **Installed as Quasar's i18n preset installs it** (quasar.dev/options/app-internationalization):
  `src/boot/i18n.js`, first in `quasar.config.js > boot`, `app.use()`s the instance that
  `src/i18n/index.js` exports — exported, because code outside a component translates too.
- **The catalog starts from the kit's.** `createI18n({ legacy: false, messages: kitMessages() })`,
  then the app's `src/i18n/locales/<code>.json` merged over it (`catalogsFromFiles(import.meta.glob(
  "./locales/*.json", { eager: true }))` — a language is a file). The kit's words are `kit.*` keys;
  an app rewords one by setting the same key in its own catalog, never by editing the kit's.
- **The kit's code reads the app's instance:** its components through `useI18n()`, its code outside a
  component through `kitT()`, from the instance `installLlmUi(app, { i18n })` hands over (required;
  kit text read before that warns once in the console).
- **Data that is shown names its key** (`labelKey`), and the component translates when it renders —
  a list built once at load keeps the language it was built in.
- **Quasar's own words follow the language:** the boot file calls the kit's
  `followQuasarLang(i18n, import.meta.glob("../../node_modules/quasar/lang/*.js"))` (Quasar's
  language packs, matched with `Lang.getClosestIsoName`).
- **Dates and numbers in the app's language** — vue-i18n's `d()` and `n()`, or `Intl` given the
  i18n locale — never the browser's default.
- **Checked:** `eslint.i18n.config.js` is the family's one file (a copy of the kit's
  `packages/ui/eslint.i18n.config.js`) with two rules at error — `no-raw-text` (@intlify) for template text,
  `no-literal-string` (eslint-plugin-i18next) for the strings code builds, in `.js` files and in a
  `.vue` file's script and bound attributes: `npm run i18n:lint` (`src/**/*.{js,vue}`) at zero, and
  `npm run i18n:report` with no key missing from the English catalogs (its `--languageFiles` names the
  kit's `en.json` too, or every `kit.*` key reads as missing) — English is the source;
  other languages fill through docgen and show English until then (decided 2026-10-13: the kit's
  TASKS, "Every app and the kit on vue-i18n"). Neither rule reads a template literal inside a
  template attribute, nor a table in an UPPER_CASE declaration — such a table names its keys
  (`labelKey`). Text that stays English on purpose — what the AI model reads (a table it shares
  with the screen gives the prompt its keys in English), the words inside an exported book, ids —
  carries an `eslint-disable` comment with its reason (the kit's `docs/dev/RESEARCH.md` §8).
- `vue-i18n` is one of the kit's peers every app dedupes (§3).

---

## 1 · Creating the app — names and ports

- **Start from the family template**: a new app is a copy of this repo's `template/` (§Q),
  renamed — the official Quasar scaffold already made into the family shape, every change from
  Quasar's default listed in its README. Copy only its tracked files (`git ls-files template`)
  and regenerate the lockfiles. The `/new-just-app` skill does all of this (`skills/new-just-app/`;
  its generator `scripts/new-app.js`; `node scripts/install-skills.js` puts it in Claude Code's user skills folder,
  `$CLAUDE_CONFIG_DIR/skills/` when that is set, else `~/.claude/skills/`).
- **Names, one per layer** — every new app is `just-<name>` (the user, 2026-10-17; the existing
  apps keep their names): the repo `just-<name>` · the shell's `id` `just<name>` (the `app://`
  host; no hyphens, Q.2) and the identifier `com.<id>.app` · the server package
  `just-<name>-server` (§Q.3) · the headless launcher `just-<name>-server`, never the app
  executable's name (§Q.3).
- **Port registry** — in the guard, `scripts/check-family.js`: `APP_PORTS` (the server) and
  `DEV_PORTS` (the dev server and its HMR port). Server: JW **17495** · JV **17494** ·
  i18n-docgen **8742** · the template **17490** · just-house-paint **17499**. Dev: JW **1420** · JV
  **1430**/1431 · docgen **1450**/1451 · the template **9000** · just-house-paint **1460**/1461. A new
  app takes the next free ones — not 17496–17498 and 17504 (JW's smoke scratch port, eval, flow tests and screenshot
  import) or
  1440 (JV's second renderer) — and is added to both, and to `APPS`, once
  it passes the guard. (The server registry said "JV 8741" until 2026-08-04 while JV listened on
  17494 — the registry records reality; the guard checks it against the `port` the desktop main
  passes and the dev server's port.) The app's OWN ports are the only ones it claims — the
  bundled engine's router port is **allocated at spawn**, never registered and never assumed
  (§8), so two family apps can run at once. The dev port is set in three places that must agree:
  `quasar.config.js` `devServer`, the server's dev origins, and `installLlmUi`'s `devPorts`.
- **Env vars**: data dir `<SNAKE_NAME_UPPER>_DATA_DIR` (e.g. `JUSTWRITE_DATA_DIR`).

## 2 · Root files — the exact contract

**The npm script NAMES are the contract** (`npm run dev` opens the DESKTOP APP in every repo;
getting this wrong is the #1 confusion) — §Q.9.

- **biome.json** — the template's, byte-identical to every app's (the guard compares the apps'),
  including the `**/*.vue`
  override that turns `noUnusedImports`/`noUndeclaredVariables` OFF for SFCs (Biome cannot
  see template usage; without the override every view file is a false positive).
- **index.html** — the app's real `<title>`; no scaffold logos; the family CSP `<meta>` (§Q.5),
  because the phone and a browser have no shell to send a header.
- **.gitignore** — `node_modules`, `data/` (§Q.8) **and `dist/`** — corrected 2026-08-05 (s2
  audit): the old "dist/ is COMMITTED" line contradicted every app in the family (all three
  gitignore it); headless serving needs a prior build of the UI. It also ignores
  `.quasar/`, Capacitor's web copy (`src-capacitor/www`) and the in-app server's bundle
  (`src/phone/worker-bundle/`); the native projects (`src-capacitor/android`, `/ios`) are
  committed (§Q.7).
- **AGENTS.md + CLAUDE.md** (decided 2026-10-17) — `AGENTS.md` holds the repo's instructions for any AI
  (agents.md): what it is, the commands, "must pass before a commit", "what bites", a Where-to-look
  table whose FIRST row points at this document, and a copy of `family-rules.md` between
  `<!-- family-rules:start -->` and `<!-- family-rules:end -->` (the guard keeps it identical).
  `CLAUDE.md` is `@AGENTS.md` plus the Claude-only lines. Both start from the template's. The kit and just-sqlite-sync have the same pair (2026-10-29). (JustVoice
  still has the 2026-10-09 shape — a CLAUDE.md importing `@../just-core/docs/family-rules.md`.)

## 3 · quasar.config.js — the kit consumption contract

The kit's UI is consumed as SOURCE from the sibling checkout — no publish step exists. The
template's `quasar.config.js` is the reference (§Q wins); this is the part every app carries — an
app adds the `@renderer` alias with its tests (§14) and sets its registered dev ports (§1):

```js
build: {
  alias: {
    '@renderer': path.join(root, 'src'),
    '@delebash/ui': path.join(kitUi, 'src'),   // kitUi: the sibling ../just-core/packages/ui
  },
  extendViteConf (viteConf) {
    // ONE copy of every peer the kit imports, from this app's node_modules — Vue's
    // provide/inject and reactivity break with two.
    viteConf.resolve.dedupe = [ ...(viteConf.resolve.dedupe || []),
      'vue', 'quasar', '@floating-ui/dom', 'pinia', 'vue-router', 'vue-i18n', 'marked',
      '@vueuse/core' ]   // + 'qrcode' where the app has it
    // The dev server reads the repo and the kit's UI. WATCH IGNORES are part of the contract:
    // the root is the repo, so the big non-frontend trees are never watched (JV measured
    // 500 ms → 6.2 s to first HTML without them; data/ also fails with EBUSY, §Q.8).
    viteConf.server.fs = { allow: [ root, kitUi ] }
    viteConf.server.watch = { ignored: [ '**/server/**', '**/data/**', '**/dist/**' ] }
  },
},
devServer: { host: '127.0.0.1', port: 1430, strictPort: true, hmr: { port: 1431 }, open: false },
// per-app (the guard's DEV_PORTS): JW 1420 · JV 1430/1431 · docgen 1450/1451 · template 9000 —
// the ports installLlmUi's devPorts names
```

NO `/v1` proxy: nothing requests a relative `/v1`. The kit's origin-aware resolver builds
ABSOLUTE URLs to the server port from dev, which is exactly why §Q.3's CORS is load-bearing. The
kit's peer dependencies go in THIS app's `package.json` (`packages/ui/package.json` lists them).

## 4 · Frontend standards

> **§Q.4 changes three things here**: the kit's controls sit on Quasar's components (the
> kit-first rule is "nothing hand-rolled that Quasar or the kit ships"), start-up code lives in
> boot files, and the theme maps Quasar's variables onto the kit's tokens.

- **Vue 3 + `vue-router` in HASH mode** + **per-domain Pinia stores** (`stores/<domain>.js`).
- **`src/css/tokens.css`** — copy the reference block from the kit's
  `common/tokens.contract.css` and retune values; **the kit's `common/app.css`** — the family's
  page looks (the base and its `height:100%` chain — NEVER `100vh` — the shell, pages, cards,
  hints, forms, Settings, the AI page, the splash), listed in `quasar.config.js > css` right
  before **`src/css/app.scss`** — the app's own classes only, ONE scroller per area; a class
  the kit's sheet has is never defined there again (the family guard fails a copy; 2026-10-24).
- **Kit-first, always**: controls come from `@delebash/ui` (`UiButton`, `UiInput`,
  `UiSelect`, `UiMultiSelect`, `UiCheckbox`, `pushToast`…). **A missing capability is
  built IN THE KIT** on Quasar's components with the one-`intent` design contract —
  never app-local (UiMultiSelect is the precedent: born for i18n-docgen, owned by all).
- **`installLlmUi(app, …)` in the boot file — the UI twin of `installLlm`** (2026-08-04).
  ONE call resolves the origin-aware base and feeds it to BOTH transports, wires the
  external opener, declares `capabilities`, and registers `<LlmUiHosts />`. Do not call
  `configureServerApi` / `configureLlmUi` / `configureExternal` by hand: each was a step
  a host had to know about, and every omission failed SILENTLY — the two base URLs
  disagreeing made every kit LLM view render empty IN PRODUCTION ONLY (`configureLlmUi`
  with no baseUrl falls back to `window.location.origin`, which in the packaged app is not
  the server — found live 2026-08-03).

  ```js
  installLlmUi(app, {
    devPorts: ["<DEV_PORT>"], fallbackBase: "http://127.0.0.1:<PORT>",
    capabilities: { embeddings: false },        // what this app's stack does
    i18n,                                        // the app's vue-i18n instance — required
    external: { open: openUrl, openPath },      // from services/native.js (§5)
  });
  ```

  The opener stays the APP's — it is `native.js`'s, the one reader of the shell bridge
  (§Q.2), and the kit decides browser-vs-desktop from what it is handed. (The kit's Electron
  shell hands an `http(s)` `target=_blank` link or `window.open` to the system browser, opens the app's own
  page as another window of the app (§19, "Another window of the app"), and refuses every other new window —
  `setWindowOpenHandler` in `packages/core/src/shell/main.js`.)
- **`<LlmUiHosts />` in the shell, and the AI-tasks row from `useAiTasksNav()`.** The
  hosts are one tag because the failure mode was mounting SOME of them: with no
  `<AppDialog/>`, `confirmDialog()`'s promise never settles and every confirmed action
  is a dead button. The nav row is a composable, not a component (each app styles its
  own nav) — spread its `navAttrs` so the row cannot be rebuilt without
  `data-panel-toggle`, whose absence made the panel open and instantly close.
- **Wire shape: camelCase** — matching the shared stack's `CamelModel` contract.
- **NAME YOUR DONOR** (user-ruled 2026-08-03, after a hand-rolled disk-usage panel
  shipped beside JW's canonical one): before writing ANY UI element, name where it
  already exists — a kit export, a JW section, a JV section. Hand-writing is allowed
  only after that search comes up empty, and the new piece is then usually born in the
  kit. Copy donors WHOLE — strings, confirms, loading states — never a lookalike.
- **TitleBar** — the KIT's `common/components/TitleBar.vue` frame (back/forward over
  the router's history state with the post-nav settle, the centred title, window drag
  with no-drag on its buttons and slotted content, disabled-reason tooltips); the app
  fills the right side via the slot (JW: theme/mode/undo/chat cluster · docgen: mode
  cycler + `AiStatusButton`). Every app carries one; a shell without a native-feel
  title row was ruled a divergence (2026-08-03). JW's `components/TitleBar.vue` was
  the donor and now WRAPS the frame like its siblings (2026-08-07) — this line named
  it as the canonical implementation long after the kit had absorbed it, which kept
  the donor from converting.

## 5 · The shell's three doors, and its one bridge

The shell is the kit's `runDesktopApp` (§Q.2). A renderer
reaches it through three doors, each ONE implementation, and the guard fails anything that
goes around them.

1. **Opening a URL or a folder** — `native.js`'s `openUrl`/`openPath`, handed to the kit
   as the same one line in every app:
   `installLlmUi(app, { external: { open: openUrl, openPath } })`. The kit decides
   browser-vs-desktop (`common/services/external.js`); no app repeats that test.
   Never hand-roll a per-platform `explorer`/`open`/`xdg-open` spawn.
2. **Calling a command** — `src/services/native.js`, one thin export per shell command
   (`pickDirectory`, `storageRelocate`, …), so a command's name-as-a-string exists in exactly
   one place. Commands throw; callers use try/catch, and a cancelled dialog resolves `null`.
   A new command is added in the kit (main's `COMMANDS` and the preload's list), never per
   app — the native dialogs included.
3. **Putting a file on disk** — the kit's `saveBlob`/`downloadBlob`
   (`common/services/fileSave.js`): native dialog where the host wired one via
   `configureFileSave`, browser download otherwise. `a.download = …` anywhere in an
   app is a guard failure. (JustVoice had five copies of it, one per view.)

**One bridge object (`window.appShell`), read only by `services/native.js`** (this rule
replaced "no `window.<app>` global", 2026-10-08). The kit's preload installs that one object
(§Q.2); `native.js` is the only file that reads it, and the rest of the renderer imports
`native.js`. **The renderer installs nothing on `window`**: apps import modules. A
`window.<appname>` bridge was the shape of JustWrite's Electron-era shim, deleted 2026-08-14 —
the guard fails it (check 13), and fails a `window.appShell` read outside `native.js` (check 12).

## 8 · Adopting the shared LLM stack (llm-runner)

The standard is `installLlm` — a few lines plus seeds, identical in every app
(`../packages/core/README.md` "Consume it" has the full tiers; this is the app recipe; JustWrite's
`server/src/app.js` and `database/seed.js` are the reference). The server is §Q.3's.

```js
app.route("/", runnerRouter());                           // the host's line (/v1/llm-runner/*)
await installLlm(app, { db, dataDir, product: PRODUCT,
  featureCatalog: FEATURES,                               // this app's actions
  featurePrompts: {} /* or PROMPTS */,                    // {} if the app builds its own
  enginePresets, featurePresets, defaultPresetId });
// the app's seed pass:
seedLlm(h);                                               // idempotent, insert-if-missing
loadFromConfigs(stores.getProviderStore().list());        // the registry from the DB
```

- **Features → engine presets, one-source**: each action points at a preset owning
  provider+model+temperature/think/samplers. Tunables NEVER live in app config files.
- **Structured output**: hand adapters the OpenAI `response_format` shape via `extra`
  — the adapters own per-provider translation (Ollama converts it to `format` itself).
  A hand-built per-provider fork DEFEATED that routing once; found live (2026-08-02).
- **App-owned settings** (reviewer name, etc.): the host's OWN table in the same SQLite
  database (`appmeta.js` in i18n-docgen is the reference).
- **A routeless door** (CLI) boots the same stack with `installLlm(null, …)` —
  first-class headless: storage, seeds, registry, runner wiring, no routes. Presets
  resolve through the stores; nothing works before storage is configured. (The first
  consumer re-implemented this against private imports; the capability went upstream
  instead — 2026-08-02.)
- **Pass `product`, and let the user share one AI cache.** `installLlm(app, { product:
  PRODUCT })` records this app's cache location in the family registry
  (`%LOCALAPPDATA%\just-ai\caches.json`), which is how the NEXT app's Quick Setup can
  offer to share the engine + models already on the box instead of downloading them
  again — the same model in two apps' caches was 14.2 GB twice, measured. The app's
  wizard asks (`GET`/`PUT /v1/ai/engine-cache`); the answer is a recorded CHOICE and
  never moves a file, so it is reversible in one click. What the app GENERATES —
  `models.ini`, spawn logs — moves to `<dataDir>/ai-runtime` whenever the cache is
  shared, because each app renders that ini from its own catalogue. Anything measuring
  or clearing engine files must read `service.cacheRoot` / `service.runtimeRoot`
  (via `configuredService()`), never `<dataDir>/ai-cache`. Two guards keep the
  registry honest (2026-08-08): a cache root under the OS temp dir is never registered
  and never surfaces from a read — a smoke gate boots a real server on a `%TEMP%`
  snapshot, and one surviving scratch got itself offered as "JustWrite Server already
  has the engine", repointing the real install's cache at a Temp dir with one proceed
  click (`JUST_AI_HOME` opts a harness out, which is also how the suite's tmp-rooted
  tests keep running); and the wizard only offers a sibling cache that holds MODELS —
  the question exists to skip model downloads, so an engine-only cache is not worth
  switching roots for. A harness that boots a server on a scratch data dir must ALSO
  set `JUST_AI_HOME` to the scratch (JW's `scripts/smoke.js` is the precedent), not
  lean on the temp-dir net.
- **The engine's port is allocated, so never print, probe or configure `:8080`.**
  `findFreePort` binds the first free port from 8080 up; the live URL is the runner
  service's `routerUrl()` and it is what `/v1/llm-runner/status` reports. Nothing
  app-side may rebuild that URL — the `local-llamacpp` provider row's `baseUrl` is a
  seeded fallback that the running engine overrules. This exists because every app
  hardcoded 8080 and the second app's traffic silently reached the first app's engine
  (the 2026-08-03 JustWrite "corrupt install" that was neither).
- **API namespace: EVERYTHING under `/v1/*`** — app routes beside the shared stack's.
- **Tests**: `installLlm` mutates process singletons (the storage handle, the seed
  registration, the usage ledger, the runner service) and starts a background backfill —
  snapshot and restore them per test, root `dataDir` in a temp folder and point
  `JUST_AI_HOME` there. The kit's `packages/core/tests/install_llm.test.js` is the hermeticity
  reference.
- **After any shared-export change** build and test every consumer app — kit changes are
  additive by default, and only the consumers' builds prove it.

> **The install SEQUENCE — both halves, step by step — is
> `docs/dev/install-runbook.md`** (user-ruled 2026-08-08: one page a human and
> an AI can follow into a new project). This section is the depth behind it.

### The AI-call convention (2026-08-08) — app code never owns a task lifecycle

Born the hard way: the LLM core converged (every app runs `run_action`), the task
store converged (2026-08-07), and still no JustVoice LLM task had ever shown a
token — because no rule said how app code CALLS AI, so 17 sites hand-managed
their own lifecycles and every one dropped `finish({usage})`. Ten structural
audits passed over it; there was no contract to audit against. This section is
that contract, and check-family's **check 11** enforces the greppable half.

**The rule.** App code never calls `tasks.start()` / `finish()` / `fail()`.
Every AI or long-task call goes through a kit runner:

- **`runAiFeature` / `runAiFeatureStream`** — features whose variables are in
  the renderer's hand (an editor selection, a chat message, fetched context
  passed along). Posts the shared `/v1/ai/run|stream`; streaming, tokens,
  cancel, errors all automatic. JustWrite's writer + RAG features are the
  reference consumers.
- **`withAiTask(opts, fn)`** (+ the `runAiEndpoint` JSON convenience) —
  everything else: server-composed endpoints (the server gathers roster /
  corrections / files and post-processes the answer), TTS renders and
  generates, engine installs, exports, poll-loop jobs, batch owners (one task,
  N sub-calls, `setProgress(n, m)`). The wrapper owns start / finish-with-usage
  / abort-classification / error wrapping; the callback keeps full domain
  freedom and returns `{ result, usage }` so tokens surface.

The lane is chosen **per feature, never per app** — every app has both kinds.
Where composition lives is the feature's business; the seam below it is
identical everywhere.

**Corollaries.** Every AI response carries usage (JustVoice's §16 rule,
family-wide; `toTaskUsage` accepts snake_case and camelCase so nobody
hand-maps). **Every AI task is visible while it runs, and shows where it was
started.** The screen that starts a feature mounts the kit's `AiTaskStrip` there,
its task found with `useSurfaceTask("<feature>", meta)` (meta tells two houses' or
two brands' runs apart) — or, for a page that shows all its own runs, several features
at once with failures lingering until dismissed, `<AiTaskStrips :features="[…]" :meta>`
(`useSurfaceTasks`; JustVoice's pattern, promoted to the kit 2026-10-18). The kit's **global stack** (`AiTaskStack`, mounted by
`<LlmUiHosts />`, so every app has it) shows every running task no screen shows —
a dialog closed mid-run, a page left — so no task is ever invisible; while a
screen's strip is mounted the stack leaves its task out, so one run never shows
twice. An app whose user decided its pages show only their own tasks, the header's ✨ AI
button the one place that shows them all, mounts `<LlmUiHosts :task-stack="false" />`
(JustVoice, decided 2026-10-05: "The app-wide strip goes. Each task shows on the page that
started it"). `inline: true` is only for a task whose screen shows its progress some
other way for its whole life. Hand-rolled progress banners are banned. A trigger
button **disables** while its task runs — the strip is the spinner. The family
guard's check 17 finds each feature an app starts (a literal `feature:`, or
runAiFeature's `action:`) and fails when no `useSurfaceTask("<feature>")` shows
it — for the template and every app made from it; the older apps get advisories
until they adopt the helper (found 2026-10-18: just-house-paint's house page ran
every job with no progress on screen, and the template's own example claimed a
strip it never mounted — this rule had been prose only). Reads are free:
chrome may observe the store (`visibleTasks`, `runningCount`) from check 11's
per-app allowlist; creating lifecycles outside the runners is the violation.

**Why a check and not just this text:** every seam that had only prose drifted;
the seams with a canon + a gate (familyContract.js labels, the target tree)
held. Rules that matter get a check — the doc explains why.

## 10 · The e2e harness — the real app is the acceptance surface

A Chrome tab on the dev port is a PROXY: the app ships in its own desktop window, and "it
looks right" claims are made against the window, never the proxy (user-ruled 2026-08-02,
after exactly that mistake). The harness drives the REAL desktop app — Playwright's Electron
driver (`playwright-core`'s `_electron`: no browser download, no driver binary), on the built UI
from `app://`, with scripts run in the page over the debugger protocol so the app's real CSP
stays on — from `e2e/`, the same shape in every app:

- **Root scripts**: `"test": "npm test --prefix e2e"`, `"screenshots": "node
  e2e/capture-direct.js"` — same names in every app.
- **Hermetic by default**: the smoke suite sets `<ID_UPPER>_DEV_NO_SERVER=1` so a test run
  never evicts your dev server or spawns strays; capture does the same so shots can use a
  demo-data server you started deliberately. The template's harness (the reference) runs its own
  server on the app's port with a temp data folder and `JUST_AI_HOME` there, and refuses to run while
  that port is in use.
- **What smoke asserts is the CONTRACT, not pixels**: shell mounts, nav works, and
  any user-ruled UI behaviour holds (e.g. i18n's "the whole Setup form is visible with
  an explicit Check-path button") — rulings become assertions so they cannot silently
  regress.

Its launch target is the unpackaged desktop build in `dist/electron/UnPackaged` (§Q.9) — which
`build:unpacked` leaves without `node_modules`, so the shell can't start the app's own server from it:
the harness starts the server itself (the template's), or drives a full `npm run build` (JustWrite's).

## 11 · The standard app chrome — every app carries these, no exceptions

Ruled 2026-08-03 after the i18n rewrite shipped its workflow with NONE of this — the
user had to ask "are you bringing in the data directory, the style changer, the ai
progress cancel, the logs?" The answer must never again be no. Each row names its
canonical implementation; all of it is kit/platform code — the app writes wiring only.
**Canonical WORDS live in the kit's catalog, `packages/ui/src/i18n/locales/en.json` (`kit.*` keys),
never in this document** — this section names components and shapes; the kit's components
read their words from that catalog through vue-i18n, in the app's language. (2026-08-04: §11
stopped restating label words; 2026-10-12: FAMILY_LABELS became the catalog.)

**The governing principle (user's words, law — parity batch 2026-08-05):**
*Same function ⇒ same kit surface and mechanism, in every app — including
JustWrite.* The DATA each app feeds the mechanism (model catalogs, presets,
prompt rows, per-app options, app-specific settings sections) is per-app BY
DESIGN. Parity of surface is mandatory; parity of content is wrong. **No
escape valves:** a "verify at build, else fall back" clause is not an outcome
— if a kit surface can't host an app's need, THE KIT GROWS until it can
(SettingsShell, UpdatesPanel, and JW tray localization were each committed
this way; bespoke twins are the deviation class this section exists to stop).

**The copy law (parity batch):** every user-facing label and description
speaks OUTCOMES in the user's words — internal vocabulary (tier / action /
preset / row / pipeline / variant / manifest / pin) never reaches the screen.
Prompt-row labels live in each app's DB seed (recorded limit: vue-i18n cannot
reach DB rows; row-label localization is a future family design).

**The Settings canon (from code, 2026-08-06):** the seven family sections
keep this RELATIVE order wherever they appear —
**Appearance · Backups · Storage · Server · Logs · Updates · About**
(`kit.settingsSections.*` in the kit's catalog is the word source, `SETTINGS_SECTION_ORDER`
the order). App sections may
lead, trail, or interleave freely: JW leads with Project; JV leads with
General and trails its voice-domain sections (Mastering → Webhooks); docgen
interleaves Reviewer before About. Every app renders them through the kit
`SettingsShell` (all three adopted, parity slices 3/4/6); Server is the
headless-URL + bearer-token + keep-running section in every app.

**A browser that needs a token (2026-10-19).** With access tokens on (Settings → Server), a browser
on another computer signs in Jupyter's way: the address Server copies carries `?token=…`, which the
kit's boot check (`checkServer`) keeps for that server (`serverToken.js`, the browser's storage) and
removes from the address; or the connection page, told the server answered 401/403
(`serverNeedsToken`), asks for the token instead of saying the server can't be reached. Every
request through the kit's transport (`serverFetch`) then carries it as `Authorization: Bearer`; a
host's own `configureServerApi({ authToken })` wins.

**The AI-console canon (from code, 2026-08-06):** one route (`/ai`), one kit
`AiModelsArea`. The strip is providers · (models, via the opt-in `modelsTab`
split) · Routing by feature · usage · console, plus the app's HOST TABS via
`appTabs` (`[{id, label, after}]` — `after` anchors each into the strip;
`#app-tab-<id>` slots carry the content; tabs mount lazily on first visit).
Words relabel per app ONLY by setting the kit's key in the app's own catalog (an
app's `kit.*` key wins over the kit's — JV says "LLM providers"/"LLM models"
because it has two provider kinds; siblings keep the kit's words). Deep links: `initialTab` (?tab=) and
`initialFeatureAction` (?action= → the Workbench focuses that action row) —
both one-shot, consumed off the URL on mount. The Lab runs an app's REAL
pipeline through the `labAdapters` seam (installLlmUi option, keyed by
FEATURE: `{run(body,{signal}), render, configExtra}`) — JV's speaker
attribution is the reference adapter; without one, columns run the generic
`/v1/ai/run`.

| Chrome | Canonical | App writes |
|---|---|---|
| **AI area** (providers CRUD, model catalog + downloads, presets, usage/tokens) | kit `AiModelsArea` — host tabs via `appTabs` (JV mounts two speech tabs), `modelsTab` split opt-in, `labAdapters` for real-pipeline Lab columns | one route (`/ai`), one component |
| **Global AI progress + cancel** | kit `AiStatusButton` → `AiStatusPanel` in the TitleBar, PLUS a sidebar nav row "AI tasks" toggling the same panel with a count/error badge (JW `Sidebar.vue:148`). Finished tasks LINGER per `FAMILY_TASK_LINGER` (familyContract.js — completed 5 s · cancelled 3 s · failed until dismissed, the store default since 2026-08-07); the panel splits Running / Recent; failed rows carry the error + Retry until acknowledged | one mount + one nav row |
| **TitleBar** | kit `TitleBar` frame (lifted from JW 2026-08-04; drag + tooltips folded up 2026-08-07) | the right-side slot: mode, status chip, app cluster |
| **Settings page** | kit `SettingsShell` (TOP TABS — the contract killed the rail, 2026-08-04) over JW's `/settings/:section?` pattern | sections as data + panels below |
| **First AI contact** | kit `AiSetupOffer` — the ONCE-EVER modal (ruling R3 2026-08-04; permanent setup buttons are retired), host persists the flag + routes the emits | one App-level mount + one flag |
| — Appearance | kit engine + catalogs (`UI_FONTS`, `ACCENT_PRESETS`, `UI_SCALES`); JV panel shape | mode/font/accent/scale controls over `applyAppearance` |
| — Storage | kit `StoragePanel` (2026-10-19) over shell `storageGetRoot`/`storageRelocate`/`storageOldCopies`/`storageRemoveOldCopy`/`storageForgetOldCopy`/`storageUseDefault` (§Q.2) + shared `makeDiskRouter(dataDir)` | `:shell` (native.js's folder calls), `:saves` (what the app keeps, in its words), the `#extra` slot for its own disk rows |
| — Logs | platform `installLogRing()` + `installFileLog()` + `makeLogsRouter(name)`; kit `LogsPanel` | 3 server lines, one component |
| — Server | kit `ServerPanel` (2026-10-19; JW's headless/auth section): headless URL + bearer tokens over `/v1/server-auth`, each token's "Copy the address with this token" | `:server-command`, `v-model:keep-running` (the ui store's flag, told to the shell) |
| — About | kit `AboutPanel` (2026-10-19): version, desktop runtime, data folder, repo | `:app-name`, `:blurb` (the app's words), `:version`/`:data-dir` from /v1/health, `:runtime`, `:source-url` |
| — Backups (backup/restore/reset) | platform `makeDataRouter` + kit `DataManagement` (adopted in all three, parity slices 4-6; per-app skip options via the `options` seam → `?exclude=`) | asset roots + on_replaced + option rows |
| — Updates | kit `UpdatesPanel` (+ `#actions` slot for an app's own updater verbs) | one panel + a whats-new loader |
| **Tray + keep-running** (family headless ruling 2026-08-04 + the full-donor ruling 2026-08-05; JV is the donor) | tray icon (app icon), left-click toggles the window, menu = the donor WHOLE with JV's emoji: 📺 Show window · 🔵 Hide window · ▶️ Start server · ⏹ Stop server · 🔄 Restart server · ⚙️ Open settings · 📋 Copy server URL · 📜 Open log file · ℹ️ About <App> · 🚪 Quit <App> (app-specific entries like JV's dictate/MCP stay that app's) — every entry WORKS: settings/about/copy show the window and ride `tray:*` renderer listeners (a focused webview's clipboard write is reliable; a hidden one's is not), Open log file opens the server's live log (the shell's `logFile`), Quit stops the server (JW: through its D5 drain); keep-running is the kit shell's (`setKeepRunning`, labels through `setTrayLabels`); Settings → Server carries "Keep server running after the app closes" — OFF ⇒ closing stops everything, ON ⇒ hide to tray, server stays; the renderer persists the flag and re-applies it every boot. The tray's words are the kit's (`shellTrayLabels(t, appName)`, `kit.shellTray.*`, 2026-10-19), sent with `setTrayLabels` at start and on every language switch beside the right-click menu's (`shellMenuLabels` → `setContextMenuLabels`); the shell keeps its English until then | the tray block + the three `tray:*` listeners (open-settings, copy-url, about — what the kit shell sends) + the toggle row + one persisted flag |

Server wiring is JW's lines, ring BEFORE app construction:

```js
installLogRing();
installFileLog(path.join(dataDir, "logs", "<kebab-name>.log"));
app.route("/", makeLogsRouter(PRODUCT));
app.route("/", makeDiskRouter(dataDir));
```

The tray, keep-running, "Open log file" and the Storage verbs are the kit shell's (§Q.2).

**PORTING A DONOR MEANS PORTING ITS STATES, NOT ITS SHAPE.** Naming the donor in a
comment is not checking it. Before writing a surface that copies one, read the donor's
answers to these and copy them or record a deviation:

- what happens on **error**, on **cancel**, and when the work is **already done**?
- what is **clickable while the work runs** — and what does the donor deliberately
  disable or omit then?
- which of its calls are **awaited to a terminal state** vs watched?

The i18n wizard (2026-08-03) is the cautionary case: it named the kit's `QuickSetup`
in its header, copied the look, and invented its own completion — a `busy` flag plus a
watch on a derived model status. That has one happy path, so an already-resident model,
a failed or cancelled engine install and a cancelled download each left "Working…"
forever, and a footer Cancel sat beside the bar's own Cancel meaning something else.
The donor answered all four questions already. Reading it took ten minutes; not reading
it cost a rewrite and shipped a routing-corrupting bug behind a success toast.

**Setup wizards**: since the surgery (2026-08-04) there is ONE wizard — the kit's
`QuickSetup` (LLM chat/embedding) — voiced per app through `kit.quickSetup.*` keys
in the app's catalog and gated by `llmUiCapabilities` (embeddings hidden where an app has
none); `AiModelsArea` mounts it inline and the `wizard` prop exists only for a
DIFFERENT wizard kind (JV's TTS wizard is app-local — a different pipeline, not a
fork). i18n's 359-line fork is DELETED; forking the kit wizard again is the
deviation class this section exists to stop. Its step machine advances on
TERMINAL TASK STATES (`done` | `error` | `cancelled` from `createDownloadTask`),
never on a watched model status — a derived status cannot report three of those
four outcomes. During a run the footer carries no buttons and the modal is
`:closable="false"`, so each `DownloadBar`'s own Cancel is the only cancel on
screen. Trap, found live (i18n 2026-08-03): `setAsDefault(providerId, modelId)` —
the FIRST argument is the PROVIDER (`setAsDefault(LOCAL_RUNNER_ID, id)`).
Passing the model alone rewrites every task preset's `providerId` to a model id
and then toasts success; no smoke test catches it, because none completes a
model load.

**The once-ever AI offer** (ruling R3, 2026-08-04 — JW's donor is THE family
shape; permanent "set up AI" buttons and boot-splash strips are retired): the kit
`AiSetupOffer` modal, fired ONCE EVER off a persisted flag, at the app's
first-project moment — JW right after the user creates/opens their first
project, i18n at Setup's first successful save (the boot-time approximation
popped over live dialogs and died 2026-08-05). Gate the no-AI check on
NO DEFAULT PROVIDER AT ALL (`currentDefaultProviderId` empty) — gating on
`currentDefaultId` is wrong: that value is local-gated, so an online-default box
reads as "no AI" and gets nagged.

**The boot splash + warm start** (2026-08-04, born from a real divergence): the splash
PAGE is per-app — the brand plate, where the load group sits on it — but everything
INSIDE the load group is the kit's `<BootModelLoad />` (engine bar → model bar **titled
with the model name**, one Continue, auto-dismiss on resident), driven by the kit's
`startWarmOnBoot()` which the app's boot file **awaits** — Quasar mounts after its boot files
(JW's `src/boot/jw.js` is the donor; pass `skip` for boots that must never warm, e.g. JW's bench). The app's overlay
`v-if`s on the kit's `warmModelId`. `index.html`'s static pre-JS layer shows the SAME
plate image with the same fit — no spinner, ever — so boot is one continuous image:
static plate → Vue splash → shell. A load that ends in error renders the control's
`#failed` slot under the bar (props `{ task, modelId }`; `task.retry()` is the bar's own
Retry) — the app's own help for that failure. JustVoice fills it with an offer to stop
speech engines left over from an earlier session, which had been holding the GPU memory
the model needed (2026-09-29). Hand-copying the load group per app is how one
consumer got a model-ID title divergence, a spinner-then-plate double splash, and a
shell flash between them; the control exists so none of that can be rebuilt.

**Prompt ownership + the Lab** (2026-08-04; one kind since 2026-10-29): the ENGINE PRESET — provider · model ·
every ask-param — and its whole editing surface (the Feature Workbench's Lab, columns,
Save-as-preset, "Use in production") are the KIT's. The FEATURE LIST is the app's, and every chat
feature's prompt is **prompt rows**: editable system/user templates the kit seeds, renders and runs
(`runAction`), saved and applied — JustWrite's writing actions, docgen's translate/confirm/review. The
pipeline-owned kind (`featurePrompts: {}`, the app building the prompt in code and serving
`POST /v1/ai/prompt-preview` for the Lab) retired on 2026-10-29, when docgen, its last user, moved onto
rows. One carve-out keeps that door: a **sectioned** feature (`installLlmUi({ sectionedFeatures })` —
JustVoice's refine), whose rows compose into ONE call (the `<key>.base` row the template, its
`{{section}}` markers filled from the other rows): the app answers `POST /v1/ai/prompt-preview {feature}
→ {system, user, sample}` with the REAL composition over a small live sample, every other feature a
404, and the Lab shows it read-only (unlockable per-column copies, ephemeral, never saved). A chat
feature with neither rows nor sections is a bug state the Workbench says (`kit.workbench.err.noPrompt`),
never a preview asked for. The Lab's test input comes from the app's own data through
`configureTestData` and `installLlm` `testSamples` (§19). The optional `dataLinks` prop
(`[{label, href}]`, forwarded AiModelsArea → Workbench → Lab) links the DATA a prompt is fed — docgen's
context · glossary · notes — under the test input ("Change what this prompt says:", `kit.lab.changeData`)
on every Lab; apps that pass nothing render nothing. `jsonMode` is prompt-row state. A registered
feature that never calls the engine is a LIE on the routing surface — register it the day it routes.

And the test is CONTENT, not mounting: log a marker line, fetch `/v1/logs/tail`,
assert the marker (a 200 from an empty ring proves nothing).

## 12 · Definition of done — a new app ships when every box checks

> The commands are §Q.9's.

- [ ] `npm run dev` opens the DESKTOP APP with the server started by the shell
- [ ] The browser loop (`dev:spa`) + `npm run server` on the app's OWN dev port (JW 1420 · JV 1430 · docgen 1450); the kit's origin-aware resolver hits the server directly, no proxy
- [ ] The server's tests green from a fresh clone (`npm run test:server`, vitest on Electron's Node through `scripts/node24.js`)
- [ ] `npm run lint` (Biome, the pinned family version) clean
- [ ] The UI builds clean (`dist/` is gitignored build output); the server serves it headless
- [ ] The desktop main's required fields set (§Q.2); port claimed in §1
- [ ] `npm run build` produces the installer, which installs and starts (§Q.2)
- [ ] Closing the window stops the server (no orphan on :PORT)
- [ ] All routes under `/v1/*`; wire shape camelCase
- [ ] Kit-first UI; any new control landed in `@delebash/ui`
- [ ] Boot: static index.html plate (no spinner) → pre-mount `startWarmOnBoot()` →
      app splash hosting the kit `<BootModelLoad />` — ONE continuous splash
- [ ] `installLlm` + seeds + registry boot per §8; presets own every tunable
- [ ] Error envelope + CORS per §Q.3, with the Origin-header test that bites
- [ ] `e2e/` harness per §10; `npm test` (smoke, the real app) green against the
      built app; `npm run screenshots` captures every surface
- [ ] The standard app chrome per §11: `/ai` area, AiStatusButton, Settings with
      appearance/storage/logs/about, log ring + file + router with the content test
- [ ] Every AI/long-task call goes through a kit runner per §8's AI-call
      convention — no `useAiTasksStore` import outside check 11's allowlist
- [ ] Run an LLM feature and LOOK: tokens on the strip, one indicator total,
      the trigger button disabled (not spinning) while it runs
- [ ] A batch shows real n/m; a polled job's percent reaches the strip
- [ ] AGENTS.md (with the family rules' copy) + CLAUDE.md (`@AGENTS.md`), from the template's; first
      Where-to-look row → this document (§2)
- [ ] `docs/dev/PRD.md` + `TASKS.md` + `IDEAS.md` + `RESEARCH.md` present per §13
- [ ] §15: every route that takes input has a schema; forms use `schemaRules` / `fieldErrors`;
      failures show through `reportError`; the boot file calls `installErrorReporting`
- [ ] §16: the schema is `database/schema.js` migrations; ids random text; seeds insert-if-missing
- [ ] §17: every loading screen has its loading, empty and failed states
- [ ] §18: tests at every level — routes (happy, 422, refusal), the real socket, stores, the
      mounted pages, the boot smoke, the e2e smoke
- [ ] Any deviation: flagged to the user AND listed under Open deviations

## 13 · The docs convention — every repo, including this one

Ruled by the user 2026-08-04 (modeled on JustWrite; enforced family-wide by the
docs campaign the same day):

- **`docs/dev/TASKS.md` is THE live open-work tracker** — one line per open item plus
  a pointer to its detail doc; the depth lives in the linked doc, never in the
  tracker. **Close = delete**: when an item ships and its QC is done, its line leaves
  the file — git and the plan docs keep history. A tracker line is a CLAIM, not
  evidence — verify against code before repeating it.
- **An item lives where the code that closes it lives** — kit/shared-server work in
  this repo's tracker, app work in the app's. One item, one home; cross-repo
  interest is a pointer, not a copy.
- **`docs/dev/IDEAS.md`** holds unscheduled ideas — adding one is never starting it.
- **`docs/dev/PRD.md`** (every app — ruled 2026-10-17) is what the app is for: who uses it, its
  features and how each one is proven, the outside data, accounts or paid services it uses, and
  what's out of scope. It is written from an interview with the user when the app is created; it
  changes when the product does, like any doc, and a feature's detail lives in its plan doc, not
  here.
- **`docs/dev/RESEARCH.md` is the research register** (ruled 2026-10-04) — what is
  already known, by subject, one verified fact per bullet with how and when it was
  checked and where the proof is. **Read the subject's section before researching
  anything** (and put it in any agent's brief); research is not done until its facts
  land there. The kit's register holds the shared stack's facts, each app's its
  domain. `scripts/check-family.js` check 15 fails a missing register, a plan dated
  2026-10-04 or later that the register doesn't link, and a register link to nothing.
- **`docs/plans/*.md` keep history**: a completed plan gets a loud ✅ CLOSED /
  SUPERSEDED banner at the top (or moves to `docs/plans/archive/`); before a plan
  closes, any still-open item or durable ruling inside it is extracted to its real
  home (TASKS / IDEAS / a dev doc). A stale `file:line` in a tracker or plan is NOT
  a fixed bug — correct the pointer; close only when the underlying issue is
  verified dead in code.
- **CLAUDE.md stays small** — rules and pointers, never tasks or status.
- User-facing docs (where an app has them) update in the SAME change that alters
  anything a user sees.

## 14 · The family skeleton — what every app has outside its domain code

The three apps are structurally identical outside their domain code (the 2026-08-08 convergence
program; its record is `plans/archive/target-tree.md`). The guard checks the layout (§Q.10); the
lists below are what to keep when adding or moving a file.

**Server** (`server/src/`, plain JavaScript): `serve.js` (the entry — `serve`, run by the shell
and the headless launcher) · `app.js` · `app_state.js` · `paths.js` · `version.js` · `auth.js`
(the per-app settings-read seam) · `api/` where every route file is `<area>_api.js`
(leading-underscore private helpers allowed beside them) with `health_api.js` (one base wire:
`status/product/version/apiVersion` + per-app extras) and the family `/v1/prefs` door through the
kit's `makePrefsRouter` · `database/` (`index.js`/`session.js`/`models.js`/`models_schema.js`/`seed.js`)
where the app owns SQL — JW + JV; docgen keeps only its `appmeta` table, by numbered migrations in
`database/schema.js` (2026-10-29), its workspace data in sidecar files · NO per-app CSRF (pure kit); `errors.js` exists only as an alias re-exporting
the kit's `platform/errors` (JW + JV). `cli.js` stays where an app has domain subcommands. Tests
in `server/tests/*.test.js`.

**Renderer** (`src/`): the layout Quasar's CLI creates (§Q.1) — `App.vue`, `boot/`,
`layouts/MainLayout.vue`, `pages/`, `components/`, `router/`, `stores/`, `css/` — plus `services/`
(+ `composables/` and `i18n/` where the app has them) · `css/tokens.css` + `css/app.scss` ·
`pages/HomePage.vue` · `components/KeyboardCheatsheet.vue` where the feature exists (JW + JV) ·
`stores/ui.js` exporting `useUiStore`, prefs SERVER-backed via the kit client · tests BESIDE
their files (no `__tests__/` dirs) with `boot.smoke.test.js` riding the kit's
`registerBootSmoke` · `services/helpDocs.js` riding `makeDocsHelpAdapter`.

**Config layer**: dev ports JW 1420 · JV 1430/1431 · docgen 1450/1451 (`quasar.config.js`
`devServer`, §3) · ONE `biome.json`, byte-identical among the apps, CLI exact-pinned (no
ranges), lint script `biome check .` so the includes actually gate · the `@renderer` alias in
`quasar.config.js` AND `vitest.config.js` · `.gitattributes` ×4 (`* text=auto`, `.bat/.cmd`
CRLF, `.sh` LF).

## 15 · Validation, errors and logging — one contract from the server to the form

Decided 2026-10-18 — the user: "all gui should have standar erorr msg and contract rqured min lenght
and so on, make sure our app uses best standards from server to form validation and error hadnling
and loggin" (the plan: `plans/2026-10-18-complete-template-and-standards.md` §1). The template's
`notes` area is the reference for every rule below.

**Every error answer is problem+json** (RFC 9457 — rfc-editor.org/rfc/rfc9457, which obsoletes 7807
with the same members): `type` (`<typeBase><slug>`), `title`, `status`, `detail`, `instance`, and the
request's `requestId`. A 422 adds `errors: [{loc, msg, type, ctx?}]` — `loc` the part and field
(`["body", "title"]`), `msg` the server's English words, `type` the kind (`missing`,
`string_too_short`, …), `ctx` the limit it broke (`{min_length: 3}`). The kit's `createServer` does
all of it: Hono's `requestId()` middleware gives each request an id (the `X-Request-Id` header; an
incoming one is kept), the error handlers put it in the body and in the log line, and an unhandled
exception answers the family's problem+json 500 (`unhandledEnvelope`) — an app passes no
`onUnhandled` of its own. A refusal the app decides is the kit's `ApiError` (or `badRequest`,
`notFound`, `conflict`, … in `platform/errors`) — never a hand-built JSON error.

**Validation is the route's schema, shared with its form.**
- A request schema is TypeBox (JSON Schema) in the server package, `server/src/schemas/<area>.js`,
  importing only the kit's browser-safe `@delebash/core/platform/schema` (`T`, `opt`, `nullable`,
  `literal`, `strictObject`). The route checks it with the kit's `input({ body, querystring, params
  })` and reads `c.req.valid("json")`. Every route that takes input has a schema; limits a user
  meets (lengths, ranges) are in it, not in code after it.
- An upload (a multipart form, a binary body) has no schema to carry its size: the route takes the
  kit's `uploadLimit(maxBytes, { slug, title })` (`@delebash/core/platform`, on hono/body-limit) —
  checked while the body streams in, before `parseBody()` or `arrayBuffer()` holds it whole; past it,
  a 413 problem. `maxBytes` may be a function read on each request (a setting). The template's
  example is Notes' **Import a file** (`POST /v1/notes/import`, `server/src/api/notes_api.js`, its
  limit the seeded `notes.maxImportKilobytes`): the size as it streams in, then what the file holds
  — 415 for a file that isn't text, a 422 under `file` for one longer than a note — tested in
  `server/tests/notes.test.js` and `src/pages/NotesPage.test.js`; just-house-paint's photo, palette
  and outline uploads follow it.
- The server package exports its schemas (`"exports": { "./schemas/*.js": "./src/schemas/*.js" }` — the
  `.js` on both sides; `"./schemas/*"` resolves `notes.js` to `notes.js.js`) and
  the renderer imports the same object (`import { NoteIn } from "<app>-server/schemas/notes.js"`).
- A form is Quasar's `QForm` with the kit's inputs, `lazy-rules`, and `:rules` from the kit's
  `schemaRules(NoteIn)` — required, min/max length (counted in characters, as the server counts),
  pattern, email/uri formats, number, whole number, min/max, choices — worded from the kit's
  catalog (`kit.validation.*`) in the app's language. The submit button is disabled while the save
  runs; the form never trims or rewrites what the user typed behind their back.
- What only the server can know comes back as a 422 or a refusal: the form shows
  `fieldErrors(err)` — each field's message under its field, in the app's words (from `type` +
  `ctx`) — and anything not tied to a field through `reportError`.

**One way to show a failure.** The kit's `reportError(err)` — a Quasar Notify toast through
`pushToast`: the server's own title and detail for a refusal (4xx), "The server couldn't finish
this" plus `Reference <requestId>` for a server fault (5xx), "Can't reach the server" when the
request never arrived; a cancel shows nothing. A screen's empty / loading / failed states are §17's.
The kit's transports put the parts on every Error they throw — `status`, `problem`, `errors`,
`requestId` — beside the message they always built.

**Renderer errors reach the server's log.** The boot file calls the kit's
`installErrorReporting(app)`: Vue's `app.config.errorHandler` and the window's `error` /
`unhandledrejection` post each failure to the kit's `POST /v1/logs/client` (deduped, ≤ 20 a minute
on both sides) and tell the user once per distinct message. Settings → Logs shows them beside the
server's lines (logger `renderer`).

**The logging policy** — the kit's `getLogger(<area>)` (`platform/log`); levels follow RFC 5424:
- **error** — a failure the user didn't cause (a 5xx, a crash, an engine that died), with the stack;
- **warning** — a refused request (the error handler logs every 4xx) or a degraded fallback;
- **info** — lifecycle: start, stop, a model loaded, a download, a migration, a setting changed;
- **debug** — per-request detail; off by default (`serve --log-level debug`).
Never log a secret (API keys, tokens, `Authorization`, passwords) or the user's content (their
texts, photos, file contents) at info or above. Every error line for a request names its id.

## 16 · Data — SQLite, schema changes, seeds and ids

One database per app: `<dataDir>/<app>.db`, opened with the kit's `openDatabase` (better-sqlite3 —
github.com/WiseLibs/better-sqlite3; one synchronous connection; say `foreignKeys: true`), only by
the server (family rule 2). The template's `server/src/database/` is the reference:
- `schema.js` — the `MIGRATIONS` list, newest last. Version 1 creates the tables; every later change
  is a new migration, never an edit to an applied one. `index.js` opens the database and runs the
  kit's `migrate(db, MIGRATIONS)` — keyed on SQLite's own counter, `PRAGMA user_version`
  (sqlite.org/pragma.html#pragma_user_version), each migration in one transaction with the counter,
  so a failure leaves the file as it was; a database newer than the code is refused.
- **Ids** are random text (`crypto.randomUUID()`) — never `AUTOINCREMENT` for a table that may sync
  (just-sqlite-sync's rule). **Times** are ISO-8601 UTC text. **Columns** are typed and queryable —
  a JSON column only for an opaque blob nothing filters on.
- **Seeds** (`seed.js`) are idempotent insert-if-missing and ship facts and defaults the user can
  change (family rule 1); a re-run never overwrites the user's edit.
- **Settings** — the app's own (thresholds, names, presets) are rows of its `settings` table, read
  and written through `/v1/settings` with a schema per key; the renderer's preferences are the kit's
  `/v1/prefs` (`makePrefsRouter`). Backups are the kit's `makeDataRouter` over the same file.
- The stores (`server/src/<area>_store.js` or `database/<area>.js`) are the only code with SQL; a
  route calls a store, never `db` itself.
JustWrite and JustVoice drop and reseed instead of migrating (an open deviation, below).

## 17 · Screens and forms

- A page is `q-page` with the kit's `pageFill` / `pageFlow` (§Q.1); its header is the kit's
  `PaneHeader`; a list is `UiTable` (QTable) or `q-list`; a dialog is `AppModal` (QDialog); a menu
  `UiMenu`. Nothing hand-rolled that Quasar or the kit ships (family rule 3).
- **States, every screen that loads:** loading — `q-inner-loading` (or Quasar's `QSkeleton` for a
  first paint); empty — the kit's `EmptyState` with the one action that fills it; failed — the kit's
  `UiBanner` with the reason and Retry. A list never shows "nothing here" while it is still loading.
- **Forms** — §15. One primary button per form, on the right of the button row; Cancel beside it.
- **Destructive actions:** an irreversible one asks first through the kit's `confirmDialog` (naming
  what is lost); a reversible one acts at once and offers Undo in its toast.
- **Closing a modal or a panel** (the kit's code, `ui/common/components/AppModal.vue`, `HelpDrawer.vue`,
  `ui/components/AiStatusPanel.vue`): a **modal** (`AppModal`) closes with Esc and its ✕, never with a click
  outside it (`dismissable` opts a light picker in); one whose work is under way and can't be left takes
  `closable: false`, which blocks Esc and hides the ✕. A **panel** (the help drawer, the AI status panel — a QDialog
  at an edge, no dim) closes with Esc or a click outside, and the focus goes back to what opened it.
- **Dragging a modal:** by its header, on by default; it opens centred every time (the dragged place is not kept);
  a panel fixed to an edge takes `draggable: false`.
- **A switch says what it is** (the labeling law, 2026-07-16): a row on a switches surface is a real launch switch,
  or it says it isn't — a per-request value carries the kit's note under its row (`KnobGrid`'s `perRequest`:
  "sent with every request …, not a launch flag").
- **Sizes** (the user's global rule): every control is sized to its content — a row ends where its
  content ends, nothing stretches to the page width; prose fields are about 60 characters wide
  (`--w-prose`); a button on a row of labelled fields aligns with the inputs. Type, spacing and
  colors come from `tokens.css` — no literal colors or pixel font sizes in a page.
- **Words** — every word is a vue-i18n key (§Q.11), in the user's terms (§11's copy law).
- A long task (an AI call, a download, an export) runs through a kit runner and shows on the task
  strip (§8's AI-call convention); its trigger button is disabled while it runs.
- **Accessibility — WCAG 2.2 AA** (w3.org/TR/WCAG22, the user, 2026-10-29), from what the kit measured (the kit's
  RESEARCH §10): every control, link and image has a name (the kit's controls take a label; a `title` never repeats
  an `aria-label`); news a user must hear goes through the kit's live regions (`common/services/announce.js` —
  every toast and AI task already does); colors come from the tokens, whose contrast is measured at every hue
  (text 4.5:1, a field's edge and other parts 3:1); a focus ring shows on every control; a drag has a
  single-pointer way too (2.5.7). Checked by axe-core on every page, light and dark (§18); the keyboard path
  through a screen and its reading order are a person's review before a release.

## 18 · Tests — every level, in every app

| Level | What | Where · tool |
|---|---|---|
| Server routes | every route: its happy path, one 422 from its schema, one refusal; through `app.request` | `server/tests/<area>.test.js` · Vitest (hono.dev/docs/guides/testing) |
| Server, real socket | the CORS answer to an `Origin:` header through the real listener (§Q.3), the logs-content test (§11) | `server/tests/` · Vitest + the kit's server |
| Stores and services | the domain logic without HTTP | beside the file · Vitest |
| Renderer units | stores, services, components (mounted with `@vue/test-utils` and Quasar) | beside the file (`*.test.js`) · Vitest (vuejs.org/guide/scaling-up/testing) |
| Boot smoke | the boot steps by hand (`registerBootSmoke`) | `src/boot.smoke.test.js` |
| Desktop e2e | the unpackaged app through Playwright's `_electron`, hermetic (§10) | `e2e/` · playwright-core |
| Accessibility | every page against WCAG 2.2 AA, light and dark (§17) | `e2e/tests/a11y.test.js` · `@axe-core/playwright` (playwright.dev/docs/accessibility-testing) |

Every test is hermetic: a temp data folder, `JUST_AI_HOME` pointed there, no network, no real model
unless an env flag asks for one (`<APP>_REAL_*=1`). **Must pass before a commit:** `npm run lint &&
npm run test:server && npm run test:unit` and the guard, run by hand — **no commit hooks, family-wide** (the user,
2026-10-29: "i dont want tests just running or things just running on commit in gituhb unless we need it often").
`npm run test:coverage` (Vitest's v8) reports coverage, with no gate. No performance budgets (the user,
2026-10-29).
A bug fix lands with the test that would have caught it.

A mounted test clicks the way Vue Test Utils does — `await wrapper.find(…).trigger("click")` — not with
a bare `element.click()`: Vue drops an event whose `Date.now()` stamp is no later than its listener's
attachment (vuejs/core runtime-dom `createInvoker`), so a bare click right after a re-render that
swapped the listener can land in that millisecond and vanish at random; `trigger` stamps the event a
millisecond on (vuejs/test-utils#1854). An element outside a wrapper (a dialog teleported to the body) is clicked
through VTU's own `DOMWrapper`: `await new DOMWrapper(el).trigger("click")`. (Found 2026-10-27 in the kit's own
runtime-screen test; the guard's check 24 fails a bare click since 2026-10-28.)

## 19 · One way per job — the kit's table (2026-10-27)

Before designing anything, find its job here and use what it names; a plan names the row. Not here →
search the kit by what the job does, not by a name; still nothing → it is new, and its row goes into
this table in the same change. **A second way to do a job the kit already does is a bug** (the user's
rule, 2026-10-27: K10b's per-build "slow" flag and RAM columns were a second speed rating and memory
fit — folded back into the rows below). Paths are under `packages/core/src/` unless they say `ui/`
(`packages/ui/src/`).

| Job | Use | Never |
|---|---|---|
| **AI engines and models** | | |
| Run a chat feature | `llm/prompts.js` `runAction` (server) · `ui/services/aiFeature.js` `runAiFeature` inside `ui/services/appTask.js` `withAiTask` (screen) | the task store directly |
| Run an image feature, and what it needs first | `llm/image_dispatch.js` `runImageFeature`, `imageFeatureReadiness` | spawning an engine in the app |
| A feature's model and settings | the feature catalog + an engine preset of its kind (`installLlm` `featureCatalog`/`enginePresets`/`featurePresets`); a kind's settings `llm/preset_params.js` `PARAM_RULES`, `presetParams` | a constant, an app setting |
| The Lab's test input from an app's own data | `ui/common/services/testData.js` `configureTestData` — the app's sources and, per action, its pickers (`fill` → the prompt's variables), a compose button and which samples fit (JustWrite's and docgen's `src/services/labTestData.js`); `installLlm` `testSamples` — the seeded rows the Lab's Sample button cycles | a Lab input the app draws itself, variables matched by name |
| llama.cpp's engine | `runner/lifecycle.js` `RunnerService.installEngine`, its rows `runner_binary` (`llm/seed.js` `seedDefaultRunnerBinaries`) | — |
| Another engine (sd.cpp, …) | `runner/runtimes.js` `RUNTIMES` + `runner/runtime_service.js` `RuntimeService` (install, removal, its server, jobs); its rows `runtime_binary` (`llm/seed.js` `seedRuntimeBinaries`); the app turns it on with `installLlm({ runtimes, runtimeModels })` | an app's own engine code |
| What a build needs from this computer | `runner/runtime_service.js` `unmetNeed` (`runner/hardware.js` `missingDlls`, `versionAtLeast`) | — |
| A runtime's model files | `runner/models.js` `acquireFileSet` (HF cache: blob by SHA-256, `linkSnapshot`); a chat GGUF `acquireModel` | a folder of the app's own |
| Files already on this computer, into the cache | `runner/models.js` `adoptFileSet` · `RuntimeService.adoptModel` | copying beside the cache |
| An update replaces the old build | llama.cpp: `RunnerService.installEngine`'s sweep; a runtime: `RuntimeService._sweepStaleBuilds` (after its install) | — |
| Start a server process, find a port | `runner/process.js` `startServerProcess`, `findFreePort` | `child_process` in the app |
| The graphics card's memory | `runner/arbiter.js` `getArbiter` (reserve, release, makeRoom, busyBegin/End) — a runtime books through `RuntimeService.runJob` | stopping another engine by hand |
| What this computer has | `runner/hardware.js` `detected`, `memArch`, `maxVramMb`, `machineKey`, `snapRamGb` | — |
| **Whether a model fits** | `runner/fit.js` `coarseFit` on its declared needs (chat rows `runner/api.js` `modelFit`: `minRamMb`, `recommendedFor.minVramMb`; a runtime's model `RuntimeService._rating`: `peakVramMb`, `minRamMb`) → ok · tight · cpu · no | a "low memory" flag |
| **How fast a model runs here** | `runner/fit.js` `rateSpeed` (`speedBand`, `inBandDeadzone`) → fast · fine · slow · painful, measured beating predicted; each kind in its own unit — tok/s (`runner/config.js` `DEFAULT_BAND_*_TOKS`), seconds per image (`DEFAULT_RUNTIME_BANDS`, rows `band_*:<kind>`), the speech and video real-time factors | a per-build "slow" flag |
| **What was measured on this computer** | `llm/stores.js` `ModelMeasurementStore.record`, `list` (`kind`, `tokens_per_sec`, `realtime_x`, `sec_per_image`, `ram_model_mb`, `vram_model_mb`); a runtime's jobs record through `RuntimeService.recordSpeed` | a table of the app's own |
| Clear the models cache | `runner/lifecycle.js` `RunnerService.clearModelsCache` (never a busy file) | deleting folders |
| Stop the engines (reset, restore) | `lifecycle.getService().stop()` + `runner/runtime_service.js` `stopRuntimeServers` | — |
| A cache shared by the family's apps | `runner/cache_registry.js` `register`, `summarize`; `llm/install.js` `resolveCacheRoots` | — |
| **Files and drives** | | |
| Download a file | `runner/download.js` `streamDownload` (resumable, several connections; `DiskFullError`) | `fetch` to a file |
| Room on the drive before a download | `platform/disk_room.js` `lacksRoom`, `freeBytes`, `partBytes` | `statfs` in the app |
| A rename another program holds a moment | `platform/rename_held.js` `renameHeld` | a bare `rename` |
| Backup, restore, reset | `platform/data_api.js` `makeDataRouter` | — |
| Sync between devices (a cloud folder, pairing, a file by hand; removing a device from the folder) | `just-sqlite-sync` `createAppSync` (its routes, `restoreHooks`) · `ui/components/SyncPanel.vue` | a sync of the app's own; deleting a device's folder files by hand |
| What the data folder holds (Storage) | `platform/disk_api.js` `makeDiskRouter` | — |
| **Server** | | |
| A refusal | `platform/errors.js` `ApiError`, `notFound` | hand-built JSON |
| A route's input | `platform/server.js` `input` with `platform/models.js` `T` | checks by hand |
| Settings that change between versions | `platform/settings_upgrade.js` `upgradeSettings`, `defaultsFingerprints`; a setting moved into the kit (a preset's param, a runner setting) `retireSettings` | a one-off copy at start |
| An app's AI seed revised between versions (a catalog row's text, a prompt) | `installLlm` `modelCatalogHeals` `{rowId: {field: [old values]}}` · `featurePromptHeals` `{key: [old system texts]}` (`llm/seed.js`, the kit's own QC-43a rule): swapped only while the row still holds an exact old seed | overwriting the row whatever it holds, a data reset |
| Another window changed something | `platform/window_changes.js` `ChangeCounter`, `makeSyncRevRouter` · `ui/common/services/otherWindows.js` `watchOtherWindows` | — |
| A write made on what another window already changed | `platform/versions.js` `etagOf` (a resource's version from its rows — every answer carries it) + `checkIfMatch` (the write's If-Match: another version is a 412 in the app's own words; none sent — a toggle — lands); the screen sends the version it read and, on 412, `reportError` and reads again (the template's notes: `notes_api.js`, `stores/notes.js`, `NoteDialog.vue`) — RFC 9110 §13.1.1 | a counter in memory (a restart refused every window), last-write-wins on a form |
| Names and text | `platform/text.js` `cleanName`, `nameProblem`, `cutToLength`, `visibleText` | — |
| The log | `platform/log.js` `getLogger` | `console` |
| HTTP out (proxies honoured) | `platform/http.js` `fetch` | Node's own `fetch` |
| **Screens** | | |
| Controls | the `Ui*` controls (`ui/common/index.js`), Quasar's under them | a hand-made control |
| A long job's bar (download, install) | `ui/composables/useDownloadTask.js` `createDownloadTask` + `DownloadBar` | a bar of the screen's own |
| A long server job (202, polled or followed, Cancel) | `platform/jobs.js` `JobRegistry` (its work's `update` and `emit`, `subscribe`, `list`) + `platform/jobs_api.js` `makeJobsRouter` (`/v1/jobs` what runs, `/v1/jobs/:id` GET and DELETE — 410 once ended and forgotten —, `/v1/jobs/:id/events`) · `ui/services/serverJob.js` `runServerJob` inside `withAiTask` (the screen; `onEvent` follows its events, polling again if they drop) | an app's own registry, poll loop or event stream |
| Another server's stream, read by the server (an AI provider's answer, llama-server's `/models/sse`) | `platform/lines.js` `iterLines` — lines end at CR, LF or CRLF only (WHATWG SSE; NDJSON); llm/base.js re-exports it with the adapters' TransportError | a splitter of the caller's own, `str.splitlines()`'s rules |
| A live event stream, server → screen | server-sent events: `platform/server.js` `stream` with `text/event-stream`, each frame `data: <json>` (`llm/prompts.js` a run, `platform/jobs_api.js` a job's events) · `ui/common/services/sseFrames.js` `readSseFrames` over the server transport (`client.js` `requestStream`, `runServerJob`) | EventSource (it can't send the access token), a reader of the screen's own |
| An AI provider's failure, worded (an adapter's) | `llm/base.js` `adapterHttpError` (`{stream}`, `{kind: "embeddings"}`, the transport failure as `cause` — `unreachable`, a run's 502) | a message built in the adapter |
| A failure, a field's refusal | `ui/common/services/reportError.js` `reportError` · `ui/common/services/forms.js` `fieldErrors` | `alert`, hand-made words |
| The server's audio or video played in the window | `<audio crossorigin="anonymous" :src="…">` (or `<video>`) at the server's address — the request carries the app's Origin, so the server's `resourceIsolation` passes it, and it still streams with a Range (measured, Electron 44.10, 2026-10-29); a file the window holds whole (an image) is `ui/…/useServerImage` | a plain `<audio src>` (no Origin: refused, or the server left unguarded); a `mediaPaths` hole in the guard |
| Another window of the app (a page beside the one in use) | `window.open(router.resolve(to).href, "_blank", "noopener")` — the kit's shell opens the app's own page as a window of the app (its preload, sandbox, menu and unsaved-work box; `shell/main.js` `guardPage`), a browser opens a tab; `noopener` so the new page starts fresh (no copy of this one's sessionStorage). Closing the main window closes the others, each asking about its unsaved work; on the phone there are no windows — hide the item there | an IPC command, a `BrowserWindow` in the app |
| A toast · a confirm | `ui/common/services/toastBridge.js` `pushToast` · `ui/common/services/dialog.js` `confirmDialog` | — |
| A modal (Esc and ✕ close it, a click outside doesn't; drag by its header) | `ui/common/components/AppModal.vue` (`closable`, `dismissable`, `draggable` — §17) | a QDialog of the screen's own |
| A panel at the window's edge (Esc or a click outside closes it) | Quasar's `QDialog` with `position`, as `AiStatusPanel` and `HelpDrawer` (no dim, the focus back to its opener) | a hand-made overlay, document listeners |
| Engine switches, a row each | `ui/components/KnobGrid.vue` (a `perRequest` row carries the per-request note — §17's labeling law) | a switch with no note that isn't a launch flag |
| A size in bytes | `ui/common/services/downloadRate.js` `fmtBytes` | — |
| A model's fit and speed, in words | `ui/common/services/modelPick.js` `fitLabel`, `speedBandLabel`, `fitWarning` + the `.lu-fit` chip (`ui/common/styles.css`) | notes of a screen's own |
| A runtime's screens | `LuRuntimeTab` (the AI page), `LuEngineNeeded` (in place), `LuRuntimePresetPane` (Routing: an image or a vision feature's preset) | an app's install card |
| Page looks | `ui/common/app.css` + the page tokens (`tokens.contract.css`) | a copy of a kit class |
| A help page (the app's `docs/*.md`) | `ui/common/services/helpMarkdown.js` `renderHelpMarkdown` (its H1 and a leading front-matter block skipped — the `front-matter` package, a kit peer; a doc's `lede:` there is its one-line summary, which docgen's extract reads) in the kit's HelpDrawer; `docs/toc.json` the order | a page's own Markdown renderer; a doc's words copied into the app by hand |
| A model's answer shown as Markdown | `ui/common/services/aiMarkdown.js` `renderAiMarkdown` (marked, then DOMPurify — a kit peer; raw HTML in the answer shown as text, web links opened outside) into `v-html` | marked's output unsanitized, `renderHelpMarkdown` (trusted docs only), the answer as plain text |
| **Shipping** | | |
| The packaged app's acceptance start on your real data | `node scripts/start-packaged.js --data-dir data` after `npm run build:unpacked` — the build on the checkout's own data folder (what `npm run dev` and `npm run server` use): it must draw its window and answer; it writes no test data and never removes the folder (stop the app on that folder first). The e2e suite stays on its own temp data | the e2e suite on real data (it writes); `--default-data` (a fresh folder beside the build's copy on Windows) |
| A release (installers, the update feed, the user docs) | `template/.github/workflows/release.yml` (manual only; each build started before it is attached; `docs.tar.gz` — `docs/*.md` + `docs/toc.json` — with the installers) + `template/scripts/release.js`, `bump.js`, `start-packaged.js`; the guard's release checks | a release started by a push or a tag |
| An app's website | its own repository (`<app>-website`), Astro + Starlight on GitHub Pages, with the kit's `website/` files as they are: `scripts/sync-docs.js` (the docs of the app's latest release — its `docs.tar.gz`, or the tag's source), `scripts/deploy.js` (`npm run deploy`: names the release, asks, runs the site's own workflow on the user's `gh` login) and `.github/workflows/deploy.yml` (`workflow_dispatch` only); `package.json` `justSite` { appRepo, appDir, siteRepo }; the guard's check 26. The app's release attaches `docs.tar.gz` and starts nothing else (the user, 2026-10-28: "other github workflows shouldnt be running other workflows") | a release or a push rebuilding the site; a token to start another repository's workflow; the docs copied into the site by hand |

## Open deviations

- **JustWrite's `/v1/settings`** still mixes operator rows with the renderer document behind the
  mapped `/v1/prefs` door (recorded 2026-08-08, not re-checked).
- **§15–§18 in JustWrite, JustVoice and docgen** (recorded 2026-10-18): the kit gives all three the
  request ids, the 422 limits and the family 500 at once; their forms predate `schemaRules` /
  `fieldErrors`. JustWrite's and docgen's boot files call `installErrorReporting`; JustVoice's doesn't yet
  (re-checked 2026-10-29; docgen answers with the kit's problem+json through `createServer`).
- **§16 in JustWrite and JustVoice** (recorded 2026-10-18): both drop and reseed rather than migrate
  (JW `docs/dev/ARCHITECTURE.md` "Storage policy"; JV `database/session.js`).
