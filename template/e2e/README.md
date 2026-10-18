# e2e — the real desktop app, driven

Automation over the REAL desktop app — Electron, the built UI from `app://` — through Playwright's
Electron driver (`playwright-core`: no browser download, no driver binary), app-structure §10. It
drives Quasar's desktop build before packaging, `dist/electron/UnPackaged`, with the checkout's
Electron (`src-electron/node_modules`). The packaged app can't be driven: its fuses turn off the
inspector Playwright attaches through.

## Prereqs

```bash
npm install                 # once, here in e2e/ (playwright-core)
npm run build:unpacked      # from the app's root — the harness drives the BUILT app
```

## Hermetic

Every run gets a temp folder: the data folder lives there and `JUST_AI_HOME` points there, so
nothing reads or writes your data or the family's cache registry. The harness starts the app's own
server on that folder (from source, on Electron's Node) and stops it after; the app runs with
`FAMILYTEMPLATE_DEV_NO_SERVER=1`, so its shell starts no server of its own. The window looks for its
server on the registered port, **17490**: a run refuses to start while something listens there
(your dev server, say) rather than touch it.

## Scripts (from the app's root)

- `npm test` — the contract scans and the smoke suite: the shell mounts, the nav works, the AI
  status button and the AI-tasks toggle behave, a note is created through the window and reaches
  the server, the once-ever AI offer comes once, Settings has its sections in order.
- `npm run screenshots` — every surface as a PNG in `e2e/shots/` (gitignored), on a temp folder
  with one example note.

## Gotchas

- The harness drives whatever `dist/electron/UnPackaged` was last built — rebuild after a renderer
  or shell change.
- One copy at a time: the tests share one launch, in order (`--test-concurrency=1`).
