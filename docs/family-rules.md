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
