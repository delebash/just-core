# Getting started

Family Template is the family's reference app: the desktop window, its own server, the AI
setup, settings, help and backups that every app in the family starts with — plus one small
example area, [Notes](notes.md), that shows how the pieces fit together.

## Where your data lives

Everything the app keeps — your notes, your settings, the AI engine and downloaded models, and
the logs — lives in **one data folder**. By default it is a `data` folder beside the app, so
moving the app's folder moves everything with it. **Settings → Storage** shows the folder and can
move it; a headless server takes `--data-dir` or `FAMILY_TEMPLATE_DATA_DIR`. Only when the app's
own folder can't be written to (Program Files, read-only media) does it fall back to the standard
per-user folder.

## Two ways to run it

- **The desktop app** — the window this page lives in. It starts its own server and stops it
  when you quit (unless **Settings → Server → Keep server running** is on: then closing the
  window hides the app to the tray).
- **Headless** — the same server without a window: run `family-template-server serve` (from a
  source checkout, `npm run server`) and open its address (`http://127.0.0.1:17490`) in a
  browser. The server hosts the whole app.

## First launch

1. The start-up picture may show a model bar — the app is loading your default local AI model
   so the first AI request doesn't wait for it. **Continue** goes straight into the app; the load
   finishes in the background.
2. If the window shows *"Can't reach the server"*, the server didn't start. See
   [Troubleshooting](troubleshooting.md).
3. Open **Notes** and write your first note. When you save it, the app offers once to set up AI
   — see [Set up the AI](ai-providers.md).

## Getting around

The sidebar has **Home**, **Notes**, **AI Settings**, **App Settings** and **AI tasks**, which
opens the panel of running and recent AI work. The **?** beside a page's title opens its help
page.
