# Troubleshooting

**"Can't reach the server".** The app's server isn't running, or its port (17490) is taken — the screen
says which when it knows:

- **Another program is using port 17490** — close that program, then press **Retry**.
- **Another person signed in to this computer has the app open** — one copy runs at a time on a computer: they
  quit theirs (its tray icon, **Quit**), then press **Retry**.
- **Windows has reserved port 17490** (Hyper-V, WSL or Docker reserve ranges of ports at start) — restarting
  the computer usually frees it. `netsh int ipv4 show excludedportrange protocol=tcp` lists the reserved
  ranges. To keep the port free for the app, open a Command Prompt as administrator and run `net stop winnat`,
  then `netsh int ipv4 add excludedportrange protocol=tcp startport=17490 numberofports=1 store=persistent`,
  then `net start winnat`, and restart the computer.
- **Its server stopped as it started** — the words after it say why; **Open log file** in the tray shows the
  rest.

The desktop app starts the server itself: the tray's **Restart server** starts it again and **Open log file**
shows why it stopped.
Headless, start it with `family-template-server serve` (`npm run server` from a source checkout).
The app won't open without its server: there is no offline mode to lose work in.

**Another copy is already running.** One server per data folder: a second one says that another
Family Template server is using this data folder. Quit the other copy (the tray's **Quit Family Template**), or
give the second one its own `--data-dir` (a folder that already exists — one that isn't there is refused).

**"The data is being moved — quit when it's done".** A **Change folder…** is still copying: wait for it to
finish — the app restarts on the new folder. If the move stops ("The data couldn't be copied to …" — a FAT32
drive takes no file over 4 GB), nothing changed: the data stays where it was.

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
