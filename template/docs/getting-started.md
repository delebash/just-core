# Getting started

Family Template is the family's reference app: the desktop window, its own server, the AI
setup, settings, help and backups that every app in the family starts with — plus one small
example area, [Notes](notes.md), that shows how the pieces fit together.

## Where your data lives

Everything the app keeps — your notes, your settings, the AI engine and downloaded models, and
the logs — lives in **one data folder**. By default it is a `data` folder beside the app, so
moving the app's folder moves everything with it. **Settings → Storage** shows the folder and can
move it: **Change folder…** copies the data into a new **Family Template** folder inside the one you
pick (never into the app's own folder, which an update replaces) and restarts the app on it. The old
folder keeps its copy until **Remove the old copy…** deletes what the move copied there (Storage says
when the app ran on the old copy after the move). An old copy the app can't find — its drive isn't plugged
in, another drive is in its place, or it was deleted by hand — is **Not found**: it is never removed then,
and stays listed until you connect its drive or press **Forget…**, which only stops the app listing it
(nothing on any drive is touched). **Move back to the default folder…** brings the data back once any old
copy there is removed. While the app runs on an old copy, or on the default folder this time, Storage says
where your data is and, when that folder can't be used, why — fix that and restart, or **Use the default
folder from now on…**; once that folder can be used again, restart the app to use it; when the variable names
the old copy, change it to the folder Storage names — and **Change folder…** isn't shown. A headless server takes `--data-dir` or
`FAMILY_TEMPLATE_DATA_DIR` (a folder that already exists); while the variable names the desktop app's
folder, **Change folder…** isn't shown — change the variable instead. Only when the app's own folder can't be
written to (Program Files, read-only media) does it fall back to the standard per-user folder.

## Two ways to run it

- **The desktop app** — the window this page lives in. It starts its own server and stops it
  when you quit (unless **Settings → Server → Keep server running** is on: then closing the
  window hides the app to the tray).
- **Headless** — the same server without a window: run `family-template-server serve` (from a
  source checkout, `npm run server`) and open its address (`http://127.0.0.1:17490`) in a
  browser. The server hosts the whole app. The command is beside the app on Windows (in its
  folder: `.\family-template-server serve` in PowerShell) and Linux (an AppImage: after
  `--appimage-extract`, in `squashfs-root/`), and in the Mac app's `Contents/Resources`. The server
  answers only on its own computer; for other computers, start it with `--host 0.0.0.0` and use
  that computer's network address. Add an access token first in **Settings → Server**: a browser
  elsewhere then asks for it once — or open the address **Copy the address with this token** gives
  (with the network address in place of `127.0.0.1`), and it signs in by itself. The desktop app
  and a headless server share the data folder one at a time: quit the desktop app first; opening it
  stops a headless server on its port. Behind a reverse proxy on the same computer, name its public
  address in `FAMILY_TEMPLATE_ALLOWED_HOSTS` (the server answers its own computer only under its
  own names) and keep a token on: requests through a proxy always need one.

## Backups

**Settings → Backups** saves everything in one file, your AI providers' keys included — keep it like
a password. The access tokens aren't in it, and a restore keeps this computer's own (and its
downloaded engines' settings).

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
