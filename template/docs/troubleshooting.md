# Troubleshooting

**"Can't reach the server".** The app's server isn't running, or its port (17490) is taken by
another program — the screen says which when it knows. The desktop app starts the server itself:
the tray's **Restart server** starts it again and **Open log file** shows why it stopped.
Headless, start it with `family-template-server serve` (`npm run server` from a source checkout).
The app won't open without its server: there is no offline mode to lose work in.

**Another copy is already running.** One server per data folder: a second one says that another
Family Template server is using this data folder. Quit the other copy (the tray's **Quit**), or
give the second one its own `--data-dir`.

**"Suggest a title" fails.** No AI is set up yet: open **AI Settings** and run Quick Setup, or add
an online provider and make it the default. The **AI tasks** panel keeps the failed request with
its reason and **Retry**.

**A model won't load.** Its bar on AI Settings shows why. Usually the model needs more memory than
the computer has free — pick a smaller one, or unload another model first. **Settings → Logs**
has the engine's own words.

**A message showed a reference.** The reference finds the matching line in **Settings → Logs**:
the server writes every failure there under the same reference, and this window's own errors land
there too.

**Where are the logs?** **Settings → Logs** shows them live; the files are in the data folder's
`logs` folder, one per day.
