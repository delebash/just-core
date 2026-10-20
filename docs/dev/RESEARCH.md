<!-- SPDX-License-Identifier: MIT -->
# Research register — what we already know, and where the proof is (just-core)

**Read the section for your subject before researching anything** — before reading code to
answer a question, before measuring, before briefing an agent. Then grep `docs/plans` for
anything newer. This repo's register holds the shared AI stack's facts (the kit, the shared
server, llama.cpp, the memory arbiter); each app's own register holds its domain:
[JustVoice](../../../JustVioce/docs/dev/RESEARCH.md) ·
[JustWrite](../../../justwrite-app/docs/dev/RESEARCH.md) ·
[docgen](../../../just_ai_i18n_docgen/docs/dev/RESEARCH.md).

## The rule (family-wide, decided 2026-10-04)

The user: *"why do we keep re researching stuff, we need a primary research doc that we point to
so we dont keep duplicating or forgeting what we have done in the past"* — approved "your rec on
all go". JustVoice's register tells the story that prompted it.

- **One register per repo** (`docs/dev/RESEARCH.md`), organised by subject.
- **Before research:** read the subject's section and grep `docs/plans`. An agent's brief
  carries that section and the line *"don't re-derive these; re-check one only if the code it
  cites changed after its date"*.
- **After research:** its facts land in the register in the same change. A research doc with
  no entry is not done. `scripts/check-family.js` check 15 fails any `docs/plans/YYYY-MM-DD-*.md`
  dated 2026-10-04 or later that its repo's register does not link, and any register link that
  points nowhere. (It can check the link, not that the facts came with it — that part is the
  rule.)
- **Filled as each subject comes up.** Until then a subject's records are indexed under
  "Records not yet distilled", so they can at least be found.

How it differs from its neighbours: `TASKS.md` says what is OPEN; the distilled records
(`model-research.md`, `serving-design.md`) and `../app-structure.md` say what was DECIDED or
ruled; this page says what is TRUE and where the proof lives. Plan docs stay as the evidence.

## How an entry reads

One fact per bullet, then *how it was checked and when*, then where the proof is.

- **measured** — run on a machine (which one is in the proof) · **code** — read in source ·
  **web** — checked against an upstream page · **git** — read from history · **record** —
  carried from a record and not re-checked since · **agent** — found by a review agent reading
  code and not re-checked by the session that recorded it.
- A fact that turns out wrong is **rewritten**, ending "(was: … until <date>)". Never leave a
  fact standing beside its correction.
- A fact cites code by `file:line`. If that file changed after the fact's date, re-check that
  one fact — don't redo the research.
- **Entries dated before 2026-10-18 use the kit's old names:** the repo `just-llm-runner` is now
  `just-core`, its `server/` (`@delebash/llm-runner`) is `packages/core/` (`@delebash/core`), its
  `ui/` (`@delebash/llm-ui`) is `packages/ui/` (`@delebash/ui`) — §2, "The kit renamed just-core".
  Read an old path through that map; the files themselves didn't change in the move.

Subjects: [1 · Memory: the arbiter and the probes](#1--memory-the-arbiter-and-the-probes) ·
[2 · The family stack: Electron, Node, phones](#2--the-family-stack-electron-node-phones) ·
[3 · AI tasks and the stream frames](#3--ai-tasks-and-the-stream-frames) ·
[4 · The AI cache](#4--the-ai-cache-shared-between-apps) ·
[5 · Starting other programs](#5--starting-other-programs) ·
[6 · Claude Code: instructions and memory](#6--claude-code-instructions-and-memory) ·
[7 · Cloud model adapters](#7--cloud-model-adapters) ·
[8 · Words and translation](#8--words-and-translation) ·
[9 · Downloads](#9--downloads) ·
[Records not yet distilled](#records-not-yet-distilled)

---

## 1 · Memory: the arbiter and the probes

**Records:** [`serving-design.md`](serving-design.md) (router, arbiter, cancel — distilled) ·
[`2026-09-19-vram-truth-exact-bytes-units-offload.md`](../plans/2026-09-19-vram-truth-exact-bytes-units-offload.md) ·
[`2026-08-09-fit-redesign.md`](../plans/2026-08-09-fit-redesign.md) and its
[debate ledger](../plans/2026-08-09-fit-redesign-debate.md).
What a speech model costs, measured, is in JustVoice's register §2.

- `make_room(needed, exclude=key)` never evicts the excluded key, and never evicts a kind that
  is protected or busy. So a booking left behind under the key being loaded can only be cleared
  by releasing it — no admission removes it. — *code, 2026-10-04* ·
  `llm_runner/runner/arbiter.py:326-370` (the candidate filter at 362, protected and busy kinds
  at 358).
- `process_tree_device_mem_mb(pid)` measures the dedicated graphics memory of a process **and
  its children** (Windows venv pythons are launcher shims whose child holds the memory). It asks
  nvidia-smi first; on Windows' WDDM driver model, where nvidia-smi answers N/A per process, it
  reads the "GPU Process Memory" counter per pid. None = no per-process reading worked. —
  *code, 2026-10-04* · `llm_runner/runner/hardware.py:719-736`.
- `used_pool_mb()` is the family's one cached reading of used pool memory; `fresh=True` skips
  the cache (the load door must). None = unmeasurable, and callers fall back to the ledger
  rather than guess. — *code, 2026-10-04* · `llm_runner/runner/hardware.py:468-480`.
- **What `otherGpuHolders` leaves out** (2026-10-19, just-house-paint's machine, Windows 11, the counter set's
  "Local Usage"): Windows' Desktop Window Manager `dwm.exe` held **317 MB** — past the 200 MB floor that kept it
  out at 162 MB on 2026-09-29 — and a desktop app's own window process (the Electron shell, the server's PARENT,
  so outside `processTreePids(process.pid)`) counted as another program. Now the system's compositors (dwm, csrss;
  Xorg, Xwayland, gnome-shell, kwin_x11, kwin_wayland; WindowServer — the Linux and macOS names only in case a probe
  ever lists them: nvidia-smi lists compute processes) are never named, and a server in an Electron utility process
  (`process.parentPort` set) counts its parent's tree as its own. — *measured + code, 2026-10-19* ·
  `packages/core/src/runner/hardware.js` `_shellTreePids`, `SYSTEM_GPU_PROCESSES`.

---

## 2 · The family stack: Electron, Node, phones

**Records:** JustVoice's
[`2026-10-05-electron-node-study.md`](../../../JustVioce/docs/plans/2026-10-05-electron-node-study.md)
(the study — direction decided 2026-10-05: Electron + a Node server, Tauri and Python go, the
whole family; tracked in JustVoice's TASKS). JustVoice's own facts are in its register §6.
Agent findings were checked against code or upstream pages on 2026-10-05 by the agents; the
ones this session re-checked are marked ✓ in the study.

**Electron and Node** (*web + measured, 2026-10-05*):

- Electron 44.5.1 (2026-09-29) ships Chromium 152.0.7977.130 and Node 24.21.0; the latest
  three majors are supported, 45 goes stable 2026-10-20 — about six months of life per major.
  WebView2 on the dev machine is already 154.0.4258.53.
- `ELECTRON_RUN_AS_NODE=1` runs the app's own exe as plain Node (no display), if the `runAsNode`
  fuse is left on — one binary can serve headless.
- `globalShortcut` fires on press only: no key-up, no left/right modifiers, no modifier-only
  chords. `uiohook-napi` compiles in libuiohook, LGPL-3.0-or-later — fails the licence rule.
- System-audio loopback is built in on Windows (`setDisplayMediaRequestHandler`, `audio:
  'loopback'`); macOS has open bug electron#52738 on the custom-handler path; Linux has no
  backend.
- electron-builder (MIT) covers NSIS, AppImage, deb/rpm, dmg; `electron-updater` updates all
  three OSes. Electron Forge has no NSIS or AppImage.
- An Electron NSIS installer of a small Vue app is 111.7 MB, 370 MB installed (*measured*).
- **electron-updater** (*npm registry + code + measured*, 2026-10-09): the stable line is 6.8.9 beside
  electron-builder 26.15.3 (7.0 and 27.0 are alpha — they rename `autoInstallOnAppQuit` to
  `autoInstallEvent` and require signed update manifests). With a `publish` config, electron-builder
  26.15.3 writes `app-update.yml` into the app and `latest.yml` / `latest-mac.yml` /
  `latest-linux.yml` beside the installers even under `-P never` (`app-builder-lib/out/publish/
  PublishManager.js`: "file should be generated regardless of publish state"); a DMG writes its
  update info too (`dmg-builder/out/dmg.js`). `MacUpdater` installs only a zip, through
  Squirrel.Mac, which needs a signed app. `quitAndInstall()` starts the installer, then quits; with
  `autoInstallOnAppQuit` a downloaded update installs on any quit. The downloaded installer waits
  in the OS cache folder — `%LOCALAPPDATA%\<app>-updater\pending` on Windows, `~/.cache` on Linux
  (`AppAdapter.getAppCacheDir`) — with no option to move it. In development, `setFeedURL` alone
  checks but fails the download (ENOENT on `dev-app-update.yml`); a written `dev-app-update.yml`
  with `forceDevUpdateConfig` and `updateConfigPath` does both. *Measured* on JustVoice's
  development window against a local feed: the start-up check found 9.9.9, Download fetched it
  (falling back to a full download when the feed had no blockmap) and verified its sha512.
  *Measured* on an installed app (just-house-paint 0.1.0 → 0.1.1, 2026-10-19, its GitHub release): the
  start-up check found 0.1.1 and Download took 6 s (the blockmap's differential download), but
  `quitAndInstall(false, true)` runs the installer as `--updated --force-run` (NsisUpdater.js), and
  the family's ASSISTED NSIS installer (`oneClick: false`) then shows its whole wizard — "Who should
  this application be installed for?" — and waits. With `/S` (`quitAndInstall(true, true)`) the same
  downloaded installer upgraded in place and started the app again in 15.8 s, the data folder beside
  the exe untouched. The install on quit is silent already (BaseUpdater: `install(true, false)`).
- **Electron's spellchecker works on Windows — a probe that scripts its input can't see it**
  (*measured 2026-10-19, Electron 44.7.0*; corrects the same day's "marks nothing since Electron 41").
  Real typing underlines misspellings (Just House Paint, 44.7.0), and a bare window clicked into with a
  synthesized mouse click, or typed with full keyDown/char/keyUp events, gives `misspelledWord` and
  Windows' suggestions in `context-menu` — so the shell's spelling menu (electron-context-menu) has
  them. **The trap:** a box focused by script (`el.focus()`) and fed only `char` events through
  `sendInputEvent` is never checked on Electron 41+ (on 40.10.6 it is) — it reads exactly like a
  Windows regression, and electron/electron#54729 most likely measured that. Test spelling with a
  real click or real key events, or ask for a look in an installed app. JustWrite built its own
  spellchecker on the false reading and removed it the same day (its RESEARCH and
  `docs/plans/archive/2026-10-19-spelling.md`).

**SQLite in Node** (*web + measured*):

- `node:sqlite` is "Release candidate (1.2)" in Node 24 and 26, not Stable. It works with no
  flag in Electron 44.5.1's main process, a `utilityProcess` and under `ELECTRON_RUN_AS_NODE`,
  including `VACUUM INTO` and `ATTACH` (*measured*).
- better-sqlite3 13 is Node-API with prebuilt binaries in the package: 13.0.3 loads unchanged in
  Electron 44.5.1 and Node 26.5.0 — no per-Electron rebuild (*measured*).

**The step-0 spikes** (*measured 2026-10-07*, Windows 11, Electron 44.7.0 and 45.0.0-alpha.16 —
the same on both; JustVoice's
[`2026-10-07-electron-node-plan.md`](../../../JustVioce/docs/plans/2026-10-07-electron-node-plan.md)
§1):

- On 2026-10-07 npm had only alphas of Electron 45 (45.0.0-alpha.16, no beta), against its
  schedule of beta 2026-10-01 and stable 2026-10-20. 45 ships Chromium 156 and Node 24.21.0.
- A `utilityProcess` ends when main is hard-killed. The programs the server started survive
  through their own children unless the server put them in a kill-on-close job (koffi). With
  the job, the whole tree dies on a hard kill of main, a hard kill of the server, `app.quit()`
  and a hard kill of the headless server. A job held by main adds nothing.
- A Node process shows libuv's job (flags `0x3c00`) only after its first `spawn`. Electron's
  main isn't in a job when launched outside one.
- `app://`, registered `standard`, `secure`, `supportFetchAPI`, `corsEnabled` and `stream`:
  - reaches `http://127.0.0.1` with `fetch` and SSE, with `Origin: app://<host>`, cross-site;
  - a JSON `POST` sends a CORS preflight;
  - no Local Network Access block.
- The boot race: the server listened ~170 ms after main started and the page began loading at
  ~60 ms. The page's first request can come before the server listens — it did on 45.
- better-sqlite3 13.0.3 and `node:sqlite` read all 17,374 cells of JustVoice's real database
  exactly as Python's `sqlite3` does.
  - better-sqlite3 is about twice as fast as `node:sqlite`.
  - Kysely 0.29.6 runs over both (`node:sqlite` through a 15-line adapter) and its core is
    browser-safe. But it deadlocks when a query goes through the database handle while a
    transaction is open — one connection behind a lock.
  - `kysely-capacitor-sqlite` was unpublished from npm on 2023-10-31.
- Electron 46 (stable 2027-01-05 per its schedule): `utilityProcess` `child.kill()` no longer
  force-kills two seconds later (electron `docs/breaking-changes.md`).

**The query layer** (*measured 2026-10-07*, the plan's §1.5; *code* where a file is cited):

- **Drizzle 0.45.3 on better-sqlite3 is synchronous.** Its transaction is better-sqlite3's own,
  and nested ones use savepoints (`better-sqlite3/session.js:37-54`).
- **Drizzle against plain SQL** (better-sqlite3 plus a small helper), on JustVoice's real
  database:
  - both read 17,374 cells exactly as SQLAlchemy returns them, and wrote 714 cells
    byte-identical to SQLAlchemy's;
  - both ran the real `LexiconStore`'s ten steps with identical answers and identical tables;
  - in both, a query through the database handle inside a transaction finishes and sees the
    transaction's row;
  - both refuse an `async` transaction function ("Transaction function cannot return a
    promise"), and roll back a write made before its first `await`;
  - speed: reads ~6% slower on Drizzle; 5,000 inserts took 90 ms plain against 193 ms Drizzle.
- **Knex 3.3.0** gives SQLite a one-connection pool (`dialects/sqlite3/index.js:228-229`) and
  waits 60 s for a connection by default (`client.js:253`).
- **Prisma 7's** default generator (`prisma-client`) writes TypeScript; the JavaScript one
  (`prisma-client-js`) is deprecated (prisma.io generators docs). On 2026-10-07 npm's
  `prisma` "latest" was 8.0.0-rc.21, and `@prisma/client` 7.10.0.
- **Foreign keys:** better-sqlite3 13 and `node:sqlite` turn them on by default; Python's
  `sqlite3` doesn't.
- **JSON text and floats.** Python's `json.dumps` writes a whole-number float as `1.0`, which
  JavaScript can't tell from `1`. That's the only difference a faithful `json.dumps` port showed
  across 355 stored JSON cells, so float-ness has to come from field types.

**Step 2's first pieces** (*measured 2026-10-07*, Electron 44.7.0 / Node 24.21.0; the build
sheet `docs/plans/2026-10-07-kit-in-javascript.md`):

- The shared shell (`server/src/shell/main.js`, `runDesktopApp`) on a test app: the page on
  `app://<id>` reached the server with a GET and a preflighted JSON POST (the server answering
  CORS for `app://<id>`); the server got its data root through the env variable and posted
  `ready` over `parentPort`; quitting asked it to stop — its close hook ran, Electron exited 0,
  the port was freed. Chromium's `userData` / `sessionData` landed under `<root>/electron`;
  nothing was written to `%APPDATA%` or `%LOCALAPPDATA%`.
- The JavaScript runner on the real card (*measured 2026-10-08*, RTX 2070 SUPER 8 GB, llama.cpp
  b11239, `gemma-4-26b-a4b-qat`): load → 7.3 GB; `stop()` → back to the 437 MB baseline, the
  model child exiting ~1 s after the router; a hard kill of the Node process owning the router
  (`taskkill /F`) → baseline, no llama-server left — the koffi job takes the tree
  (`server/scripts/router-check/`).
- `vi.spyOn(namespace, "fn")` (vitest 4.1.11) reaches calls made through a module namespace —
  from other modules, and from inside the module through `import * as self` — but not a direct
  call inside the module. That is the port's monkeypatch rule.
- TypeBox 1.3 keeps its markers as non-enumerable properties; spreading a schema
  (`{...schema}`) turns `~optional` into a real key, which ajv's strict mode rejects.
- FastAPI 0.139 keeps included routers behind a lazy `_IncludedRouter`, so `app.routes` does
  not list their routes; the OpenAPI document does. The kit mounts **118 routes** (GET 45,
  POST 39, PUT 17, DELETE 15, PATCH 2) — `server/scripts/route-table.json`.
- The kit's Python tables have no Python-side callable column defaults (the schema capture
  lists none).
- How FastAPI reads a request, which the JavaScript server copies (*measured 2026-10-07* by the
  ports, against the Python routers through TestClient):
  - a pydantic query bool accepts `1/0/t/f/y/n/yes/no/on/off/true/false` in any case, untrimmed;
    `""` and `" true"` answer 422 `bool_parsing`; an int accepts `"5"`, `"5.0"`, `" 7 "`,
    `"1_000"`, not `"5.5"`;
  - a repeated query key gives a scalar parameter its LAST value;
  - a `{p}` path parameter is one non-empty segment matched after decoding: `a%2Fb` and an
    empty segment both answer 404;
  - a route nobody serves answers `{"detail": "Not Found"}`, not problem+json (Starlette's own
    404 never reaches the kit's handler).
- better-sqlite3 binds every JavaScript number as REAL; Python's sqlite3 binds an int as
  INTEGER, so the same 5 lands in a TEXT column as '5.0' vs '5'. The kit's SQL helper binds
  whole numbers as BigInt. ajv's type coercion turns null into "" / 0 inside a nullable union;
  the kit's server does pydantic's lax conversion itself instead. (*measured*, the build sheet §6.)

**The kit in JavaScript** (*code + measured*, study §3):

- `llm_runner`: 70 files / 25,941 lines, 61 test files / 19,215 lines, 1,019 test functions,
  119 routes, 26 tables; ~100 ORM query sites; the kit's wire format is camelCase
  (`llm/schema.py:11-17`, `runner/schema.py:20-26`).
- **Process trees on Windows**: Node's `child_process` puts children in libuv's kill-on-close
  job, but that job sets SILENT_BREAKAWAY_OK — a **grandchild survived** a hard kill of the
  server; with our own Job Object through `koffi` (MIT) it died too (*measured*). llama-server's
  router mode starts per-model children (`runner/arbiter.py:4`, `process.py:382`), so the kit's
  spawn needs that job (today: ctypes, `runner/process.py:831-907`).
- undici's header and body timeouts default to 300 s; `fetch` ignores `HTTP(S)_PROXY` unless
  `NODE_USE_ENV_PROXY=1`.
- JavaScript's `\w`/`\b` are ASCII-only and it has no `casefold` — a naive regex port gives
  wrong results on non-English text silently.
- The official `openai`, `@anthropic-ai/sdk` and `@google/genai` JS SDKs carry every call the
  kit's adapters use; the MCP SDK mounts in Fastify as an ordinary route.

**The data-dir ladder** (*agent*, study §4.1): the Rust shells and `platform/data_paths.py`
disagree today — the OS fallback folder (Tauri's `%APPDATA%\<id>` vs platformdirs'
`%LOCALAPPDATA%\<App>\<App>`), the `dataroot.txt` pointer (only Rust reads it) and the dev root
(`target/debug` vs the checkout). Tauri also writes `.window-state.json` and `EBWebView` outside
the chosen root.

**The shared model cache lives in JustWrite's dev root** (*measured 2026-10-07*, the three dev
databases read-only, plus the registry):
- `…\justwrite-app\src-tauri\target\debug\data\ai-cache` is JustVoice's and docgen's saved
  cache folder — `runner_setting` row `cache_root`, written at `llm/stores.py:897`;
- saved model measurements hold model paths inside it: JustVoice 3, JustWrite 2 —
  `measurement_switches.flag_value`, written at `llm/stores.py:1406`;
- `%LOCALAPPDATA%\just-ai\caches.json` lists JustWrite and JustVoice with it as `cacheRoot`.

Renaming JustWrite's dev root breaks all of these unless they are rewritten (the plan's §10 Q9).

**docgen on Electron** (*measured 2026-10-08*, this machine, docgen's step 3; the JustVoice
plan §5 and its TASKS entry):
- electron-builder 26.15.3's NSIS uninstaller ends with `RMDir /r $INSTDIR`, and an update runs
  the old uninstaller first — with the family's data folder beside the exe, a silent uninstall
  left only `resources\`. The kit's `server/src/shell/installer.nsh` (`customRemoveFiles`, each
  app's `nsis.include`) keeps `data\` and `dataroot.txt`; a marker file in `data\` then survived
  an update and an uninstall.
- better-sqlite3 ships its build leftovers (sources, object files, PDBs) inside the package; in a
  long install path they hit MAX_PATH and the uninstall left empty folders. Leaving them out of
  `build.files` fixed it; the unpacked app still opened its database. docgen's installer: 124 MB.
- Headless runs the installed exe as Node: `ELECTRON_RUN_AS_NODE=1` and the server's entry inside
  `resources\app.asar` (`build/launcher/*.cmd`); it served on a second port beside the window.
- Playwright's Electron driver (`playwright-core` 1.63.0, `_electron.launch`) drives the dev app
  and the installed exe; docgen's e2e ran 20/20 in about 10 s.
- docgen's Python server answered errors in FastAPI's default shape (`{"detail": …}`, 422 items
  with `input`/`ctx`), not problem+json — found by the route diff, not by reading. The kit's
  `createServer({ errors: "fastapi" })` reproduces it.
- The route diff's app mode (`server/scripts/route-diff/route-diff.js --app docgen`) compared
  docgen's whole server, Python vs Node, on copies of its real database: 83 reads (70 identical,
  13 volatile — times, ids, the backup file), 37/37 writes, 1,910 database cells, 0 different.

**JustWrite on Electron** (*measured 2026-10-08*, this machine, step 4; JustWrite's register
has its app-side facts):
- electron-builder packages every `dependencies` entry into the app; a renderer library listed
  there ships twice (Vite already bundled it). Moving the renderer's libraries to
  devDependencies took JustWrite's installer from 170 MB to 134 MB; docgen's got the same split.
  `dependencies` now holds only what the server and shell load: the kit and `@fastify/static`.
- better-sqlite3 13 and koffi ship per-platform N-API prebuilds, so neither needs a rebuild for
  Electron's ABI — locally or on CI.
- The shell stops a listener on the server's port only when it is this app's own server: the
  server picks its port from its own settings and reports it taken (`listen-failed`); the
  shell then stops the listener only if it answers `GET /v1/health` with the app's `product`
  (within 500 ms) and starts the server once more — any other program keeps the port
  (`shell/main.js` `listenFailed`). An app that names its port before it is built
  (`runServer`'s `resolvePort` — JustVoice) has the port probed before any of its code opens
  the database, so it never opens the database while another server of the app holds that port.
  Before any server starts, the shell also checks the app's usual port (its config `port`) and
  stops this app's own server there. Not covered: a second server of the app on another port with
  the same data folder (a data-folder lock would cover it — for the user's word).
  *code, 2026-10-13; not run in Electron.* (Was, until 2026-10-13: the shell evicted any
  listener on the app's port before starting the server, so a second copy of an app — or a
  headless server on the same port — was stopped, as the Tauri shells did.)
- The probe is a connection to 127.0.0.1, not a trial bind: on Windows a listener on
  `0.0.0.0:<port>` doesn't stop another from binding `127.0.0.1:<port>`, nor the other way
  round, while a connection to 127.0.0.1 reaches either (`platform/port.js` `portInUse`).
  *measured 2026-10-13, this machine, Node 26.5.0: both binds succeeded.*
- The kit's CSP default forbids eval; an app adds sources per directive with `cspAdd`.

**JustVoice's server port** (*measured 2026-10-08*; JustVoice's register has its app-side facts):
- `runner/binary.js` `extractTarGz` left the archive open for the life of the process when it
  stopped at the end marker (the gunzip stream was destroyed, the file stream under it never):
  one open handle per extraction, counted. It now closes the file before returning
  (`binary.test.js` `extract_tar_gz_closes_the_archive` fails on the old code).
- `platform/http.js` runs its own undici copy, so a `FormData` made by another copy (an app's,
  or Node's global) is sent as the text "[object FormData]". Multipart bodies are written out
  with `http.multipart(parts)` instead (`http_multipart.test.js`).
- Extra arguments after `node -e "<code>"` must follow `--`, or Node reads them as its own
  options.
- **One ZIP module, `platform/zip.js`** (2026-10-08), replacing four copies (the backup routes',
  the runner's `extractZip`, JustWrite's book transfer, JustVoice's voice bundles) under the
  family-sameness law. It writes and reads what CPython 3.12's zipfile does: `ZipWriter`
  (`writestr` in memory, `addFile` streamed; ZIP64 at CPython's thresholds), `ZipReader`
  (`open(file)` / `fromBuffer(buf)`, `read`, `extract`, `extractAll`), `extractZip`. Where the
  copies disagreed CPython won: one timestamp per `writestr` call, strict UTF-8 for a flagged
  name and cp437 otherwise, CPython's end-record search (the copies looked one byte too far or
  scanned their own way), the central directory walked by size, prepended data handled, the
  member checks in CPython's order, `ntpath.splitdrive`'s drive rules. With the clock pinned the
  old and new writers give identical bytes for the backup, JustWrite's book export and
  JustVoice's bundle and voice-line export, and Python's `testzip()` reads all of them clean.
  (*measured 2026-10-08*, an agent's byte check; `server/tests/zip.test.js` reads an archive
  CPython 3.12.9 made, `tests/fixtures/python-zipfile.zip`.) Not covered, as before: bzip2/lzma
  members, the 0x7075 Unicode-path field, 3.12's overlapped-entries check.
- `NotImplementedError` lives in `platform/py.js` with the other Python error classes (the
  runner, the ZIP reader and JustVoice's blending each had their own).
- **One copy of the Python helpers** (2026-10-08, the family-sameness sweep — JustVoice's TASKS
  step-5 rec 3). `platform/py.js` gained isDict (a Map or a plain object) and isJsonObject (any
  non-array object, what JSON.parse makes — the copies that tested only that keep it), pyGet,
  pyIter, pyTypeName, setdefault, pyOr, errText, strRepr, cpLen/cpSlice/cpIndex, splitlines,
  pyTitle/pyIsUpper/pyCapitalize, END, reEscape, pyEscapedLen, digitValue/digitsToInt/
  asciiDigits, pyIntOfStr, decodeUtf8 + UnicodeDecodeError, b64decode + Base64Error and the
  Attribute/Index/Overflow/AssertionError classes; `platform/pyjson.js` gained pyRepr, pyStrOf,
  pyStrScalar, isNumber, pyFloatOf, pyIntOfNumber, pyIntOf, unwrap, pyFixed, pyFormatG (now exact
  below 2^-20 too), pyJsonParse, jsonLoads / jsonLoadsExact / jsonRawDecode + JSONDecodeError (one
  scanner, two shapes: plain objects and numbers, or Maps and BigInts); `platform/models.js`
  branchOf and unwrapTyped; `createServer({pyFloats: {routes}})` is JustVoice's request-body
  float opt-in; `extractTarGz(archive, dest, {members})` is tarfile's extractfile walk (JustVoice's
  Japanese dictionary). JustVoice's `py_compat.js` is gone. Proof, before the copies went: each
  new function against every copy it replaced on 20,000–200,000 generated inputs, 0 different
  where merged; CPython 3.12.9's own answers in `tests/fixtures/python-text.json`
  (`py_text.test.js`); the real UniDic sdist through the old walker and `{members}`: 21 files,
  260,469,742 bytes, identical. (*measured 2026-10-08*.)
- **Copies left apart, because merging changes what they answer** (each is an approximation of
  the same CPython function; the user decides whether to converge): repr of a str — strRepr
  escapes the control characters (C0, DEL, C1); `seed.js` pyReprStr, `runner/models.js` pyRepr
  and JustVoice's `persona_render` pyReprStr leave U+0080–U+009F raw; docgen's jsonio `reprStr`
  (and its `pyStr` / `pyRepr`) is CPython-exact (U+00A0, U+00AD, U+200B, U+2028, U+3000, U+FEFF
  escaped too); JustVoice's slot `pyRepr`, html_parser `pyReprStr`, book_prose `reprStr`,
  voice_bundle `reprOf` and JustWrite's book_io `pyRepr` / `pyStrOf` escape less still. str() —
  py.js `pyStr` (String() for floats: `1e-7`), prompts.js `pyStrAny` (a PyFloat as `{'v': 1.0}`,
  NaN as `NaN`). format(x, "g") — JustVoice's pipeline `formatG` and persona_render `fmtG` round
  an exact tie up (123456.5 → "123457"; CPython "123456"). float() — py.js `pyFloatParse` (ASCII
  digits, JavaScript's trim) beside pyjson's CPython `pyFloatOf`. dict.get — JustWrite's
  `pyGet` / `pyItems` (TypeError), JustVoice's projects/extraction `dget` and justwrite adapter
  `pyGet` (their own type words). JustWrite's `setdefault` (a `__proto__` key stays data).
  model_catalog's `excStr` (str() of a thrown non-Error). (*code*, the sweep's fuzz.)
- Two gaps from CPython the fixture found, kept as they were: `pyFloatOf` / `pyIntOfStr` strip
  U+001C–U+001F (str.isspace() counts them; CPython's float() and int() refuse them); JustVoice's
  `pronunciation.js` escapes `-` into a `u`-flag pattern, so a lexicon entry holding a space and
  a hyphen ("Jean-Luc Picard") throws "Invalid escape" where Python matched. (*measured*.)
- **An LLM request body is the text httpx writes** (2026-10-08). httpx 0.28.1 encodes `json=` as
  `json.dumps(ensure_ascii=False, separators=(",", ":"), allow_nan=False)`; `llm/base.js`
  `httpxRequest` / `httpxStream` sent `JSON.stringify`, so a preset's `temperature` 0.0 went out
  as `0` (104 of 243 requests in JustVoice's extraction check) and a NaN as `null` where Python
  raises. They now write `httpxBody(json)` — `pyJson` with those options and the new
  `allowNan: false` (Python's ValueError, thrown before anything is sent, not a transport
  error). The values Python holds as floats are `PyFloat`s: `temperature` in the
  openai-compat and Ollama adapters, `top_p` and float-parsed samplers in `_plane2Extra`.
  After the fix all 243 requests are byte-identical (`httpx_body.test.js`; JustVoice's
  `compare-extraction.js`). The Anthropic, Gemini and OpenAI SDK adapters serialize through
  their SDKs and still write a whole-number float as an integer — JSON-equal.
- **The shell against Electron's security checklist** (2026-10-08,
  electronjs.org/docs/latest/tutorial/security, 20 items, *read against `src/shell/main.js`*).
  Already met: context isolation, the sandbox, no Node in the renderer, web security, a
  written CSP on app://, the custom protocol (`protocol.handle`, no file://), navigation
  (`will-navigate`) and new windows (`setWindowOpenHandler`) refused, `shell.openExternal` only
  for http(s)/mailto, one preload object (no raw ipcRenderer), the server in a
  `utilityProcess`. Missing, added the same day: a permission request + check handler (the
  app's own origin only; clipboard write/read, plus the app's `permissions` — JustVoice's
  "media" for the microphone); the IPC sender check (`senderFrame` origin = the window's home
  origin); `will-attach-webview` refused; `requestSingleInstanceLock` (a second launch on the
  same data folder evicted the first copy's server from the port; it now focuses the first);
  fuses per app (`build.electronFuses`: cookie encryption on, NODE_OPTIONS and --inspect off,
  embedded asar integrity + only-load-from-asar on, file:// extra privileges off — `runAsNode`
  stays ON because each app's headless launcher runs its exe with ELECTRON_RUN_AS_NODE=1).
  electron-builder 26.15.3 takes `electronFuses` (`app-builder-lib/out/configuration.d.ts`).
- **A sandboxed preload is a plain `.js`** (electronjs.org/docs/latest/tutorial/esm):
  sandboxed preloads "are run as plain JavaScript without an ESM context" and "ignore
  "type": "module" fields", so `preload.js` with `require("electron")` works in a module-type
  package; only an ESM preload (`import` syntax, sandbox off) needs `.mjs`. The kit's
  `preload.cjs` became `preload.js` (2026-10-08, the user's no-.mjs/.cjs ruling).
- **A download's name: `platform/server.js` `attachment(filename)`** (2026-10-08). A header
  carries latin-1 only (Starlette encoded it so and raised UnicodeEncodeError; Node rejects
  anything past 0xFF), so JustWrite's export of a book titled in Japanese was a 500 in both
  servers. A name outside printable ASCII now travels as RFC 5987's `filename*=UTF-8''…` beside
  an ASCII fallback (RFC 6266 §4.3; `'()*` percent-encoded too, encodeURIComponent leaves
  them); a plain ASCII name gives the exact `attachment; filename="<name>"` the routes wrote
  before. (`attachment_header.test.js`; JustWrite's `book_transfer.test.js`.)

**Phones** (*web*, study §5):

- Tauri 2's sidecar works on desktop only. iOS apps may not spawn child processes, so the
  kit's runner (download a llama.cpp binary, spawn it) cannot exist on iOS.
- Capacitor (Ionic, MIT, 8.5.2) runs a plain Vue build — Ionic Framework (a UI toolkit) isn't
  needed. Capawesome sells its SQLite and some other plugins (Insiders: $99/month); its
  Capacitor-Electron platform is MIT, v0.1.1, three months old. `@capacitor-community/electron`
  is unmaintained. `@capacitor-community/sqlite` 8.1.1 is MIT.
- CapacitorHttp buffers whole responses and has no SSE; the kit's client streams with
  `res.body.getReader()` (`ui/src/client.js:157-169`). No maintained MIT llama.cpp plugin for
  Capacitor exists.
- **Node on a phone stops at 18.20.4** (end of life): nodejs-mobile's newest release, which
  Capawesome's Capacitor Node.js plugin calls "the latest version available". Native add-ons
  only as Android prebuilds; iOS runs it without JIT. The kit needs Node ≥ 24
  (`server/package.json` `engines`). — *web + code, 2026-10-08* ·
  github.com/nodejs-mobile/nodejs-mobile/releases, capawesome.io/docs/sdks/capacitor/nodejs/.
- **A test build on a real iPhone, with no Mac and no money** (*web*, 2026-10-09 — JustWrite's
  TASKS, "The phone's cloud folder through the Files app", OPEN 1): Xcode with a free Apple ID
  installs on a device but needs a Mac (the app runs 7 days, then re-install); TestFlight needs
  the paid Apple Developer Program ($99/year). Free and Mac-less: an unsigned build from GitHub's
  macOS runner (free minutes for a public repo), installed from Windows with a free Apple ID
  through AltStore's AltServer (re-signs over the same Wi-Fi while it runs) or Sideloadly (by
  hand, over USB; wants Apple's own iTunes); 7-day expiry, at most 3 sideloaded apps at once,
  Developer Mode and "trust" the profile on the phone; the tool signs in with the Apple ID (a
  throwaway ID works). · 9to5mac.com (Xcode 7 free sideloading), faq.altstore.io,
  xda-developers.com (AltStore guide), igeeksblog.com (TestFlight).
- **Screenshots of an Android WebView come from the screen, not DevTools** (*measured*, 2026-10-09,
  Android 16 emulator, WebView 133, the emulator's software GPU): `Page.captureScreenshot` over the
  WebView's DevTools painted `position: sticky` layers squashed (JustWrite's AI page tab row, the
  editor toolbar's last rows) while their boxes measured right and the emulator's own display
  (`adb exec-out screencap -p`) showed them right. Pictures for review are taken with screencap.
- **JustWrite on the iOS simulator** (*measured*, 2026-10-09, JustWrite's
  `.github/workflows/phone-ios.yml` + `e2e/phone-ios.js`, GitHub macos-15 runner, Xcode 16.4 / iOS
  SDK 18.5, an iPhone on iOS 18.6, WKWebView "AppleWebKit/605.1.15", Capacitor 8.5.3 on Swift
  Package Manager): built by Quasar (`build -m capacitor -T ios --skip-pkg`) and `xcodebuild -sdk
  iphonesimulator CODE_SIGNING_ALLOWED=NO`, driven by Appium 3.8.0 + the XCUITest driver 12.13.2
  (WebdriverIO 9.32.0) — PASS: a fresh install shows the welcome screen from the in-app server; the
  tutorial book is made; Chapters, a scene in the editor, Characters, AI and Settings → Sync open;
  the book is still there after the app is quit and reopened; no page or console errors. Found:
  the web view runs under the status bar, the Dynamic Island and the home indicator (Capacitor's
  iOS default), and Quasar pads only a `QToolbar` first in the header — the kit's theme pads the
  header and the page container on Quasar's own safe-area classes (Android measures 0 there: its
  web view starts below the status bar). Appium on the runner: the booted, window-less simulator
  needs `isHeadless` (otherwise Appium restarts it under Simulator.app and times out at 120 s);
  the simulator has to run an iOS of the active Xcode's SDK major (the image carries iOS 26
  runtimes beside Xcode 16.4, and a text sort of runtime names picked 26.2); the simulator's web
  inspector lists the app as `process-App` (`additionalWebviewBundleIds`); Appium's reset, a
  `terminate` of the not-yet-installed app, hung 6 min (`noReset` — the script uninstalls first);
  WebDriverAgent builds in about 3 min; a whole run takes about 13 min. Quasar's own `npm install
  @capacitor/ios` fails under npm 11's allow-scripts (`EALLOWSCRIPTS`): install it and run `cap add
  ios` by hand, once, and commit `src-capacitor/ios`.
- **A live SQLite file in a sync folder is a corruption risk:** SQLite's own page lists broken
  locking on network filesystems, background copies taken mid-transaction, and copying a
  database without its `-wal`/`-journal`. Joplin syncs desktop and phones through Dropbox,
  OneDrive, Nextcloud, WebDAV, S3 or a folder by moving items, not the database; a note changed on
  two devices keeps the local copy in a Conflicts notebook. — *web, 2026-10-08* ·
  sqlite.org/howtocorrupt.html, joplinapp.org/help/apps/sync/, …/apps/conflict/.
- **sqlite-sync (sqliteai) is Elastic License 2.0, not MIT** — "contact SQLite Cloud, Inc for a
  commercial license" for production or managed-service use. A SQLite extension
  (`cloudsync_init()` per table) with CRDTs (Causal-Length Set, Delete-Wins, Add-Wins, Grow-Only
  Set) and opt-in line-level merge for text columns; syncs through SQLite Cloud, or self-hosted
  PostgreSQL or Supabase (a custom network layer can replace its libcurl); builds for Linux,
  macOS, Windows, iOS, Android, WASM, with packages for Swift, Android, Flutter, Expo, React
  Native, WASM — Capacitor and Node not named. Every device needs the same tables (the server
  checks a schema hash). — *web, 2026-10-08* · github.com/sqliteai/sqlite-sync (README). Turso's
  sync and the rest of the field were checked the same day: "Sync", below.

**Vue UI libraries** (*web + npm registry*, 2026-10-08):

- Quasar 2.35.0 (MIT, 2026-10-07), `@quasar/app-vite` 3.10.2, `@quasar/vite-plugin` 2.0.2 (needs
  Vite 8+, `@vitejs/plugin-vue` 6+, Quasar 2.24+; without its CLI, cross-platform builds are
  "community plugins"). Its Electron mode keeps its own `src-electron/electron-main.js` and
  `electron-preload.js`. **No iOS theme** — the 2.35.0 package has only `QSpinnerIos`; the iOS
  theme was in the 0.x docs. Its look is Material, restyled through Sass variables (most are
  build-time), props and CSS. `QDrawer` has a `breakpoint` phone mode.
- Element Plus 2.14.7 (MIT): "css variables to reconstruct the style system of almost all
  components" — the look changes at runtime. No breakpoint-driven layout component.
- **PrimeVue 5 is not MIT:** 5.0.2 ships a PrimeUI licence with a license key, free only for
  organisations under $1M revenue / 5 developers, renewed yearly; 4.5.5 was the last MIT.
- Reka UI 2.11.0 (MIT) is the Vue port of Radix UI Primitives — the kit already builds
  `AppModal`, `HelpDrawer`, `UiSelect`, `UiMultiSelect` on it.
- Vue Lynx (`vue-lynx` 0.5.1, Apache-2.0) renders native elements, not the DOM — libraries that
  need `document`/`window` must be adapted (TipTap among them); its site still says pre-alpha.
- Also current: Vuetify 4.2.4 (MIT, Material), `@ionic/vue` 9.0.7, Konsta 5.5.0, electron-vite
  5.0.0, `@capacitor/core` 8.5.3, `@tauri-apps/cli` 2.12.1.
- Measured on JustWrite's Locations screen — both Quasar and Element Plus carry the family look
  and follow the appearance engine live: JustWrite's register, "The phone app".

**Quasar as the family framework** (*web*, 2026-10-08 — quasar.dev `.md` pages, npm registry,
published tarballs read not run, GitHub API; full record with every source:
[`docs/plans/2026-10-08-quasar-framework-research.md`](../plans/2026-10-08-quasar-framework-research.md)):

- Versions: `quasar` 2.35.0 and `@quasar/app-vite` 3.10.2 (both 2026-10-07), `create-quasar`
  5.0.32, `@quasar/cli` 5.0.9, `@quasar/mcp` 1.1.0, the Vitest extension
  `@quasar/quasar-app-extension-testing-unit-vitest` 3.0.0 — all MIT. app-vite needs Vite ^8.3,
  `@vitejs/plugin-vue` ^6, `vue-router` ≥ 5, Node ^22.22 / 24 / 26+.
- A new app: `npm init quasar@latest` (the docs show `pnpm create quasar@latest`). app-vite is the
  only engine. Features: TypeScript · Sass · linting (ticked by default; can be unticked) ·
  filename routing · Pinia · i18n. The generated `package.json` is `"type": "module"`;
  `quasar.config` is `.js` or `.ts` only. There is no `main.js` and no `vite.config.js`: start-up
  code goes in boot files (`src/boot/*.js`, `defineBoot` from `#q-app`), Vite through
  `build.extendViteConf`. The generated `index.html` CSP has no `connect-src` for another origin.
- Electron mode (`quasar mode add electron`): `src-electron/electron-main.js` +
  `electron-preload.js` (ESM `.js`; the preload is BUILT to `.cjs` because sandboxed preloads
  can't be ESM) + its own `package.json` (`"type": "module"`, `electron` installed `latest` then
  written `^<version>` — not pinned). The window sets only `contextIsolation: true` and leans on
  Electron's sandbox and nodeIntegration defaults; the packaged window loads `file://`
  (`loadFile`). A custom protocol is one checklist line ("Prefer a custom protocol over
  `file://`"), no how-to. Starting a server, a `utilityProcess` or a tray is not documented.
  `@electron/packager` is the default; electron-builder is `bundler: 'builder'`. Main-process
  dependencies go in `src-electron/package.json`; a `file:` range is copied unchanged into
  `dist/electron/UnPackaged`. Router mode is always `hash` for Electron and Capacitor.
- Capacitor mode (`quasar mode add capacitor`): `src-capacitor/`, Capacitor v5+ supported (the
  template installs ^8.0.0); **`capacitor.config.js` is CommonJS on purpose** ("Capacitor's `.js`
  config loader doesn't yet handle ESM exports correctly") and `src-capacitor/package.json` has no
  `"type": "module"` — the only documented alternative is `capacitor.config.ts`.
- **App Extensions are Quasar's documented way to share across apps**: "App Extensions replace the
  need to create custom starter kits"; one can add boot files, CSS, components, `quasar.config`
  and Vite hooks, Electron main/preload hooks, CLI commands, templates and prompts. Quasar CLI only
  (not the Vite plugin). Building one is pnpm-only (the scaffold is a pnpm workspace); the local
  route is install-it-yourself then `quasar ext invoke <id>` (a `file:` install is untested). Any
  shared package importing `quasar` needs `optimizeDeps.exclude` or a second Quasar copy loads.
- Own controls in Quasar style: QField's `control` slot, `useFormChild`, `useSplitAttrs` (public);
  `useField` and `useDark` are private (`private.use-*`). Theming: Sass variables in
  `src/css/quasar.variables.scss` (build time), `--q-*` brand colours with `setCssVar` at runtime,
  the Dark plugin (`body--dark`), `globalNodes` for portalled popups, `iconSet` / `iconMapFn`.
- Lint: the docs offer oxlint + oxfmt (the scaffold default) or ESLint + Prettier; **Biome isn't
  mentioned**. Vitest through `quasar ext add @quasar/testing-unit-vitest`.
- `@quasar/mcp` serves the installed versions' docs and component API offline — tools
  `list_pages`, `search_docs`, `get_page`, `list_api`, `get_api`, `check_updates`; on Windows
  `claude mcp add quasar -- cmd /c npx -y --fetch-retries=0 @quasar/mcp@latest` (added at user
  scope 2026-10-08). `https://quasar.dev/llms.txt` exists; every docs page has a `.md` sibling.
- Forking: one MIT pnpm monorepo `quasarframework/quasar` (branch `dev`; `ui`, `app-vite`, `cli`,
  `extras`, `create-quasar`, `mcp`, `vite-plugin`, …); build with Node 22.22+ and pnpm 12+, `pnpm
  i && pnpm build`; `dist` is never committed. How a project consumes a fork: not stated.
- Not verified (the template build tests these first): `app://` with Quasar's build; a `file:` kit
  dependency in the packaged Electron app; an App Extension installed via `file:` with npm; Biome
  with Quasar; the CSP vs the renderer's calls to the local server.

**Sync** (*web* and *measured*, 2026-10-08 — for the family's sync decision; the design
discussion is JustWrite's `docs/plans/2026-10-08-sync-design.md`; full records with every source:
[`docs/plans/2026-10-08-sync-research-platforms.md`](../plans/2026-10-08-sync-research-platforms.md)
and [`docs/plans/2026-10-08-sync-research-building-blocks.md`](../plans/2026-10-08-sync-research-building-blocks.md)):

- **SQLite's session extension** records row changes by primary key (tables with a declared,
  non-NULL key only; no virtual tables; DDL not stated) into a binary changeset; applying one
  calls a conflict handler with DATA / NOTFOUND / CONFLICT / CONSTRAINT / FOREIGN_KEY and takes
  OMIT / REPLACE / ABORT. It never merges inside a text cell and has no transport or clock. —
  sqlite.org/sessionintro.html and the session C API pages.
- **better-sqlite3 13.0.3 has no sessions** (no build flags, no API; issue #468 "no plans" since
  2020) — *measured* in Node 26.5 and Electron 44.7. **`node:sqlite` has them**
  (`createSession`, `applyChangeset` with `onConflict`, since Node 22.12 / 23.3; "Release
  candidate (1.2)" in Node 24.21 and 26.11; no rebase or changeset iteration) — *measured* in
  Electron 44.7.0's Node 24.21.0, a conflict resolved with REPLACE. **The official SQLite WASM**
  (`@sqlite.org/sqlite-wasm` 3.53.4-build2, Apache-2.0) has the full session API — *measured*;
  its `opfs-sahpool` storage needs no COOP/COEP; OPFS inside Android WebView / WKWebView is
  unverified (needs a device). `@capacitor-community/sqlite` 8.1.1 (MIT) has no sessions — its
  "sync" is a JSON export of rows changed since a date, with no conflict handling.
- **Yjs 13.6.33 (MIT)** merges offline edits from any number of devices "without merge
  conflicts" (updates commute and are idempotent), storable as BLOBs in our own SQLite;
  **`@tiptap/extension-collaboration` 3.31.4 is MIT** and TipTap Cloud is not required (the paid
  plans are hosted collaboration). Hocuspocus 4.7.0 (MIT, self-hosted) is the optional live
  server; its SQLite extension pins better-sqlite3 ^12.6.2.
- **No ready-made platform fits "our own SQLite schema, self-hosted, MIT, Node and Capacitor":**
  Turso Sync (MIT, 0.8.2, pre-1.0; "last push wins"; its own engine replaces better-sqlite3; the
  self-hosted sync server is documented for dev/test; Turso "joining Supabase", 2026-10-02) ·
  PowerSync (needs a Postgres/MongoDB/MySQL/SQL Server backend; self-hosted Service FSL-1.1-ALv2;
  Capacitor SDK beta) · ElectricSQL (Postgres, read path only) · Zero (Postgres, "does not support
  offline writes") · Replicache (maintenance mode) · RxDB (its own JSON documents; SQLite storage
  paid) · Evolu (its own schema; TypeScript 7) · Jazz (2.0 alpha) · Triplit (AGPL-3.0, site down)
  · InstantDB (sunsetting 2027-08-31) · PouchDB (last release 2024-06) · sqlite-sync (Elastic
  License 2.0; 1.2.0, 2026-09-28) · cr-sqlite (last release 2024-01; the author is on Zero "for at
  least 1-2 years").
- **Litestream** (Apache-2.0, v0.5.17, active) is one-way WAL backup of one writer to S3 and the
  like — it fits backing up a cloud-hosted server, not device sync. LiteFS needs FUSE and is
  unsupported beta. libSQL `sqld` self-hosts one write primary plus replicas; pointing embedded
  replicas at a self-hosted one is not documented.
- No maintained hybrid-logical-clock package exists on npm (the top one has 44 downloads a week).

**Sync, round 2** (*web*, *measured* and *tested*, 2026-10-08 — under the user's "your rec on all go
do the testing"; the decisions so far and the tests' detail are JustWrite's
`docs/plans/2026-10-08-sync-design.md` "Round 2"; full records with every source:
[`…-round2-sqlite-tools.md`](../plans/2026-10-08-sync-research-round2-sqlite-tools.md),
[`…-round2-non-sqlite.md`](../plans/2026-10-08-sync-research-round2-non-sqlite.md),
[`…-round2-reachability.md`](../plans/2026-10-08-sync-research-round2-reachability.md)):

- **cr-sqlite, tested** (*measured*): vlcn-io v0.16.3 and the Fly.io fork's
  v0.18.0-v2-migration-alpha23 (win-x86_64) both load into better-sqlite3 13.0.3 (Node 26.5) and
  both refuse JustWrite's schema as it is — "checked foreign key constraints" on every book table,
  "a NOT NULL column without a DEFAULT VALUE" on `projects`/`image_blobs`; the fork first demands
  `crsql_set_ts()`. With FKs off and defaults added, merges are right (per field; same field →
  one wins; delete beats edit; inserts kept; converged); 2,000 saves of a 7.5 KB row: 336 ms vs
  132 ms plain (WAL). The Fly.io fork is active (pre-releases 2026-09-22 → 10-07), is Corrosion's
  engine, ships no WASM build, and leaves gap tracking to the app (its README).
- **Our own trigger change log, tested** (*measured*, a throwaway script): works on JustWrite's
  schema unchanged — FKs with `ON DELETE CASCADE` on, NOT NULL kept; SQLite's cascade fires the
  child tables' delete triggers; same four results as cr-sqlite; a relay through a third device
  converges.
- **The phone can keep SQLite in the app — Android, tested** (*measured*, a Capacitor 8.5.3 test
  app on an Android 16 emulator, WebView 133.0.6943.137): origin `https://localhost`, secure
  context; OPFS and `createSyncAccessHandle` in a module worker; `@sqlite.org/sqlite-wasm`
  3.53.4-build2 on `opfs-sahpool` through its synchronous API, session API present; the database
  survives a force-stop and an app update (reinstall); `navigator.storage.persist()` returns false;
  2,000 single 7.5 KB saves 14–27 s (7–13 ms a save, emulator), 15 MB in one transaction
  0.23–0.9 s. iOS: tested since on GitHub's macOS runner — the iOS 18.7 simulator (just-sqlite-sync's
  RESEARCH, 2026-10-08) and JustWrite on iOS 18.6 ("JustWrite on the iOS simulator", above).
- **…but webview storage is best-effort** (*web*,
  [`…-round2-phone-storage-onedrive.md`](../plans/2026-10-08-sync-research-round2-phone-storage-onedrive.md)
  §A.3): Android WebView's code always denies `persist()` (`aw_permission_manager.cc`; a WebView
  engineer, 2025-09-04: "nothing has changed here"); Capacitor's docs say the OS reclaims webview
  storage when the device runs low; a Capacitor Android app reported total data loss at ~3 % free
  space (eviction suspected, not confirmed). iOS: no Apple statement on WKWebView persistence or the
  7-day cap. Native SQLite plugins are Promise-only ("all asynchronous", Capacitor docs); wa-sqlite's
  calls return Promises too. No public report of `@sqlite.org/sqlite-wasm` on OPFS inside Capacitor
  was found (Trilium's in-repo app, above, is unreleased).
- **OneDrive from the phone** (*web*, same record §B): picking a cloud *folder* through the system
  picker isn't reliable — no source shows OneDrive/Google Drive/Dropbox supporting Android's folder
  picking; on iOS, Dropbox added folder access by 2024, OneDrive is moving to Apple's newer
  file-provider API (rollout to early November 2026); the only free Capacitor plugin that keeps a
  folder grant is `@daniele-rolli/capacitor-scoped-storage` (MIT, 0.1.0). The cloud APIs work:
  OneDrive's app folder (`/me/drive/special/approot`, `Files.ReadWrite.AppFolder`; sign-in in the
  system browser with PKCE), Dropbox's App Folder (PKCE + refresh tokens), Google's hidden app-data
  folder (native authorization on Android). On Windows, reading an online-only OneDrive file
  downloads it while the client runs; `.tmp` files are not synced.
- **Field (*web*):** no open-source tool syncs our own SQLite tables over a file, a folder and a
  server on Node plus a webview. Closest: Syncular (Apache-2.0, pre-1.0, single maintainer; its own
  server on `node:sqlite`; schema declared in its manifest; Yjs columns; no file/folder) ·
  backless-core (MIT in its tarball, repo 404; one changeset folder per device on Google
  Drive/OneDrive — our folder design, on 2023 cr-sqlite WASM) · TinyBase (MIT; replaces the data
  layer, saved to SQLite as one JSON blob). The old SQLite-client `electric-sql` package is
  deprecated (last 0.12.1, 2024-06-19: "We've rebuilt the sync engine").
- **How open-source apps sync (*web*):** none syncs the SQLite file; last write wins by timestamp
  is the default. **Actual Budget** (MIT) — per-cell messages stamped with an HLC applied to its
  own SQLite tables (better-sqlite3 on desktop), a merkle trie to find divergence, a thin
  store-and-forward server (`@actual-app/sync-server`); `@actual-app/crdt` 3.1.3 is MIT but "at your
  own risk" outside Actual. **Trilium** (AGPL — design only) runs its whole server in a web worker
  on the official SQLite WASM over `opfs-sahpool` in an in-repo, unreleased Capacitor app — our
  planned phone shape.
- **Non-SQLite databases (*web*):** none beats SQLite + our own change log for an existing
  relational schema; each serious one (TinyBase, RxDB free, CouchDB/PouchDB, PGlite, LiveStore,
  Automerge-repo) means rewriting the schema, every query and the data layer, and most make it
  async. RxDB's free tier caps open collections at 13; Realm's Device Sync ended 2025-09-30;
  SurrealDB's engine is BUSL; Couchbase's source is BSL.
- **Phone → laptop over the internet (*web*):** every zero-setup path needs a public machine
  someone runs (a rendezvous and a relay). Built-in, open source: mDNS + a QR code on the same
  Wi-Fi; WebRTC data channels with our own signalling and coturn (werift in Node, MIT); iroh (native
  plugins). Separate programs: Syncthing (MPL-2.0) as a folder transport; Headscale (BSD-3).
  Excluded as closed services: ngrok, Cloudflare Tunnel, Tailscale's own coordination, ZeroTier's
  controller.

**The sync product, built** (2026-10-08 — the design:
[`docs/plans/2026-10-08-sync-product-design.md`](../plans/2026-10-08-sync-product-design.md); the
order of work and its status:
[`docs/plans/2026-10-08-sync-and-quasar-program.md`](../plans/2026-10-08-sync-and-quasar-program.md)):
the engine is its own repo, `../just-sqlite-sync` (`@delebash/sqlite-sync`), and its facts —
convergence runs, the change file, both SQLite adapters, the Android 16 emulator and iOS 18.7
simulator runs — live in that repo's `docs/dev/RESEARCH.md`; JustWrite's side in JustWrite's
register, "Sync".

**The phone's in-app server, measured** (*measured*, 2026-10-08/09 — the plan:
[`docs/plans/2026-10-08-the-phone.md`](../plans/2026-10-08-the-phone.md)):
- Real Fastify 5 runs in a browser worker, answering through `inject`, when bundled with esbuild,
  `esbuild-plugins-node-modules-polyfill` and these stand-ins (`server/src/platform/worker/shims/`):
  `http.ServerResponse` as an old-style constructor (light-my-request calls
  `ServerResponse.call(this)`; unenv's is a class), `serverFactory` returning a never-listening
  EventEmitter (Fastify builds an http server at construction), `diagnostics_channel.tracingChannel`,
  `async_hooks.AsyncResource`, `setImmediate`, `assert` as the CommonJS `assert` package (find-my-way
  calls it through require), `perf_hooks` as the platform's own `performance` (the polyfill copies
  `now` unbound: "Illegal invocation" in reply timing), `crypto` from Web Crypto (the polyfill is
  3.8 MB). `inject`'s `signal` needs `stream.addAbortSignal`, which the polyfill lacks — the runtime
  ends the response stream instead.
- JustWrite's phone bundle: 9.5 MB with sync and the online AI stack; boot to the first answer
  ≈ 0.3 s in Chrome.
- linkedom 0.18.13 answers `getAttribute("class")` with `""` for a missing attribute (the DOM says
  null; TipTap reads null) and lists attributes in another order than happy-dom; with the first
  fixed, TipTap's conversion gives the same documents on every tutorial scene.
- A partial WebView's DevTools: Playwright's connectOverCDP fails ("Browser context management is not
  supported"); plain CDP over the page's socket works, and a dedicated worker is reached through the
  page's session (`Target.setAutoAttach`, flatten), not its own /json entry (that hangs).
- Android: a worker's plain-HTTP call from `https://localhost` needs `allowMixedContent` and a network
  config allowing cleartext (it can't name private ranges); `@capacitor/barcode-scanner` 3.1 needs
  minSdk 26.

**Quasar for the family, measured** (*measured*, 2026-10-08 — the template, `template/`, built and
run on this machine; the rules it led to are `docs/app-structure.md` §Q). This answers the "Not
verified" line above:
- `app://` works with Quasar's Electron build: the packaged app loaded `app://familytemplate`
  through the kit's `runDesktopApp`, Quasar's UI rendered, `window.appShell` was present, a fetch
  to the server answered, zero console errors. Dev mode ran the server from source on
  `<repo>/data`.
- A `file:` kit dependency in the packaged app works once `extendElectronPackageJson` makes the
  `file:` paths absolute (Quasar copies them unchanged two folders down) and
  `unPackagedInstallParams: ['install', '--install-links']` installs real copies.
- Biome lints a Quasar app with a `**/*.vue` override (`noUnusedImports` and
  `noUndeclaredVariables` off — template-blind).
- Quasar's default CSP `<meta>` blocks the renderer → server path; `connect-src 'self' http:
  https:` fixes it.
- npm 11.17 with an `allow-scripts` line in `~/.npmrc`: a project install without `allowScripts`
  in its `package.json` fails `EALLOWSCRIPTS`; `npm run` passes the setting to children as
  `npm_config_allow_scripts`, so `npm run build` failed at Quasar's `UnPackaged` install until
  `quasar.config.js` deleted that variable (then the installer built).
- The template's Android build (`quasar build -m capacitor -T android`) ran on the Android 16
  emulator. An App Extension installed through `file:` was not tested (the family doesn't use one).

**The kit's controls on Quasar** (*code* — Quasar 2.35.0's `dist/api/*.json` and
`dist/quasar.client.js`; *measured* where said; 2026-10-09 — the plan:
[`docs/plans/2026-10-09-kit-controls-on-quasar.md`](../plans/2026-10-09-kit-controls-on-quasar.md),
step Q3):
- Every kit control has a Quasar counterpart whose slots and events cover it: `QBtn`, `QBadge`,
  `QChip`, `QInput`/`QField`, `QSelect` (`emit-value` + `map-options` give the kit's value
  semantics, `multiple` + `use-chips` + `use-input` the multi-select), `QCheckbox`, `QToggle`,
  `QSlider`, `QBtnToggle`, `QTabs`, `QLinearProgress`, `QColor`, `QTable` (`table-row-class-fn`,
  `filter` + `filter-method`, `binary-state-sort`, `body-cell-[name]`/`header-cell-[name]` slots),
  `QDialog` (`no-esc-dismiss`, `no-backdrop-dismiss`, `persistent`), the `Notify` plugin.
- `QBtn` has no `tag` prop: it renders a `<button>`, or an `<a>` (`href`, `to`, `type="a"`) —
  never a `<label>`, the element the kit's file-picker buttons use today.
- A custom icon set can't be named in `quasar.config.js` (`framework.iconSet` takes a built-in
  set's name); `IconSet.set(object)` sets one at runtime. An SVG icon is `"path@@style|viewBox"`.
- `quasar`'s `package.json` exports resolve `node` before `import`: `node` →
  `dist/quasar.server.prod.js`, `import` → `dist/quasar.client.js`. The apps' Vitest runs (node
  environment) pass with the kit importing `IconSet` (*measured*: JustWrite 594, JustVoice 183,
  docgen 3).
- The kit is consumed by alias from outside each app, so `quasar` joins the apps' `dedupe` list
  (one copy, from the app's `node_modules`), as the kit's other peers do.
- Slice 0 (the theme wired, no control on Quasar yet) leaves all 30 screens of the three apps
  identical to the build before it — at most 0.025 % of pixels, all live values (a memory reading,
  the pulsing status dot) (*measured*, 1440 × 900, data snapshots).
- **The kit's CSS can load before Quasar's** in a built app (*measured*, JustVoice's `dist/spa`:
  the page links the kit's chunk `api-*.css`, then `index-*.css` with Quasar's stylesheet and the
  app's own), so the kit's theme wins by specificity, never by order.
- **Composited text loses sub-pixel smoothing in Chrome** (*measured*, JustVoice's Captures): a
  `position: relative` element painted after an element with a running transform animation is
  composited for overlap (CDP `LayerTree`: "Overlap"), and its text is drawn grey-smoothed; an
  unpositioned one is not. `-webkit-font-smoothing` has no effect on Windows.
- **A cascade layer puts a library's CSS under the page's** (*measured*): with Quasar's stylesheet
  wrapped in `@layer quasar` (PostCSS, on the file from `node_modules/quasar`), the kit's and the
  apps' unlayered rules win wherever they set a property, and the 30 screens of the three apps
  stay identical. An `!important` in a layer outranks an unlayered `!important` (CSS Cascade 5),
  so a library's `!important` rules keep winning — QBtn's `.q-btn.disabled { opacity: .7
  !important }` among them.
- **Vitest and Quasar** (*measured*, Vitest 4.1): installing Quasar under jsdom needs its browser
  build — the SSR build a bare `quasar` resolves to in Node throws "The SSR server build was
  installed without an ssrContext" — while the browser build throws `window is not defined`
  when a Node-environment test imports it. Quasar's own fixes (an alias, or `@quasar/vite-plugin`,
  whose alias applies while serving) are global; a `resolveId` hook that checks
  `this.environment.config.consumer === "client"` gives jsdom tests the browser build and the
  rest the SSR build.
- **Quasar's controls, measured against the native ones** (*measured*, 2026-10-09):
  QCheckbox/QToggle end with an empty focusable `<span class="no-outline">` (it takes a flex
  gap); they render their hidden native `<input type="checkbox">` only with a `name`, and a
  `<label>`'s click reaches the control only through it; their roots carry the utilities
  `row`, `cursor-pointer` and `no-outline` (the last two `!important`); an icon name that doesn't
  start with an SVG path command (`M`/`m` + digit) is a font ligature, rendered as text; QCheckbox
  and QToggle flip on Enter as well as Space (a native checkbox doesn't on Enter); QChip shows a
  check icon whenever its `selected` is set; QBadge marks itself `role="status"`.
- **QInput** (*code* + *measured*, 2026-10-09): its root is a `<label class="q-field">` around
  three wrapper `<div>`s and the native element; `class`/`style` go to the root, other attributes
  and listeners to the native element — but its own `input`, `paste`, `change`, `blur`, `focus` and
  composition handlers replace a caller's (spread after them), and it emits `change` with the
  value, not the event. It emits strings for every type, `number` included, and waits for an
  IME composition to end. The control wrapper is coloured with the brand colour. Chrome centres
  an `<input>`'s text 1px differently when its height comes from a flex layout than from a
  `height` value. Vue's `useAttrs()` object isn't reactive — a `computed` over it keeps the
  first value.
- **QSelect** (*code* + *measured*, 2026-10-09): it mounts its menu inside `.q-field__control`, and
  QMenu anchors to its parent element (`display: contents` there opens the menu off screen); the
  menu is placed at fractional pixels. Without `use-input` its focus target is a hidden read-only
  `<input>` (role combobox, the field's id). It drops `before-options` when there are no options;
  a multiple select opens scrolled to its first chosen option, and the virtual scroll re-anchors
  once (~65ms) after the first scroll; `toggleOption` moves focus to the trigger. Its root is a
  `<label>`, so a click on a non-interactive element inside it also activates the focus input.
- **QBtnToggle, QTabs, QSlider, QLinearProgress, QMenu** (*code* + *measured*, 2026-10-09):
  - QBtnToggle spreads each option's `attrs` into its QBtn's props (after its own `aria-pressed`)
    and calls an option's `slot` with no props; it emits nothing for a click on the chosen option
    unless `clearable` (then `update:modelValue(null)` and `clear`); `.q-btn-toggle` is
    `position: relative`. QBtn calls a `keydown` listener before its own Enter/Space handling and
    skips that handling when the listener prevented the default.
  - QTab is a `<div role="tab" tabindex>` (`.q-focusable` sets `outline: 0`); QTabs keeps one tab
    stop and moves focus with the arrows, Home and End. QTabs never wraps: when its tabs' widths
    add up past its own it scrolls sideways with arrow icons; `align` defaults to `center` and a
    strip narrower than `breakpoint` (600px) stretches its tabs.
  - QSlider maps a pointer against its root's box (`(x − left) / width`) and draws the thumb at
    that fraction of its track; its default thumb is a ringed 12px circle in a 20px box; its key
    steps are one step (arrows) and ten (Page Up/Down) — the native range's too.
  - QLinearProgress draws the fill as a full-width bar scaled to the value (`scaleX`); its
    `animation-speed` (default 2100ms) also times the determinate fill's transition; its root is
    `transform: scale(1)`.
  - QMenu (2.35) places itself with CSS anchor positioning (`position-anchor`, `anchor()`), at
    fractional pixels; it focuses the menu when it opens and gives focus back to its target when
    it closes; Esc closes it wherever the focus is. A QMenu opened from inside a QDialog is
    mounted inside the dialog's root, after its inner wrapper.
- **QDialog and Notify** (*code* + *measured*, 2026-10-09):
  - QDialog renders a root (`role="dialog"`, `aria-modal`, the caller's attributes and listeners;
    `.fullscreen`, z-index 6000) holding a backdrop (`mousedown` → hide unless
    `no-backdrop-dismiss`/`persistent`, else shake unless `no-shake`) and an inner wrapper (tabindex
    -1) around the content. It caps the content (`max-width: 560px` from 600px up,
    `max-height: calc(100dvh - 48px)`, `will-change: scroll-position`). On show it focuses the
    wrapper unless something inside has focus or `[autofocus]`; on hide it gives focus back. Its
    trap is a `focusin` listener that pulls an outside focus back to the first
    `[tabindex]:not([tabindex="-1"])` inside, so Tab past the last control leaves the page for one
    press (no `focusin` on `<body>`) and the next lands on the first control with a tabindex
    attribute. Its transitions are classes `q-transition--<name>-*` on the wrapper; `hide` comes
    `transition-duration` ms after hiding starts. It closes on a route change unless
    `no-route-dismiss`. Its scroll lock is `<html>` classes (`overflow: hidden`, `overscroll-behavior:
    none`).
  - Notify needs `framework.plugins: ['Notify']`; `Notify.create` returns a dismiss function. It
    dismisses at `timeout + 1000` ms on a plain timer (no hover pause), groups identical toasts
    unless `group: false`, colours text white unless `textColor` is given as undefined, gives each
    toast `role="alert"` unless `attrs` say otherwise, and stacks a position's toasts in a column
    (bottom: the newest last).
- **Reka UI's popups, and QMenu, against the pointer** (*code* + *measured*, 2026-10-09): Reka's
  DropdownMenu and Select are modal — `pointer-events: none` on `<body>` while open, the list
  taking it back — so the first outside click only closes them and the page shows no hover
  meanwhile; Reka's Popover (the old multi-select) is not. QMenu (and QSelect's list) leave the
  page live: a click outside a row's ⋯ menu on JustVoice's Personas also opened the row. Quasar's
  click-outside still fires when `<body>` takes no pointer (the target is then `<html>`). In
  JustVoice's row menus Reka's keyboard did little: opened from the keyboard the focus stayed on
  the trigger, ↑ didn't open, and Enter on an item after ↓ did nothing. A scoped rule on Reka's
  SelectContent root never applied (no scope id there): JustWrite's status menu showed with no
  box, see-through over the page. QSelect gives its value text `letter-spacing: 0.00937em` and its
  own line height (`.q-field__native`).
- **vue-sonner 2.0.9's look** (*code*, `lib/index.css`; *measured* against the kit's Notify toasts,
  0 pixels apart): 356px toasts, 16px padding, 1px border, radius 8, `0 4px 12px rgba(0,0,0,.1)`,
  13px in the system font stack, 6px gaps; light palette normal `#fff`/`hsl(0,0%,93%)`/
  `hsl(0,0%,9%)` and rich colours per kind (success, info, warning, error — the theme's
  `--ui-toast-*`); a 20px round ✕ at the top-left, translated −35%; the action button 24px high in
  the normal colours; the kinds' icons are Heroicons. The Toaster puts its palette on its own list,
  so a host's custom properties on an ancestor never reach the toasts.
- **A toast's long action label squeezed its message** (*measured*, JustWrite's AI page in Spanish,
  2026-10-18): the toast is one 356px flex row — icon, message, action (Notify's wrappers are
  `display: contents`) — so "Ejecutar configuración rápida" (190px) left the message 110px. With
  the row wrapping and the message at `flex: 1 1 180px`, the Spanish action sits on its own line
  under a 303px message; English "Run Quick Setup" (115px) stays beside a 182px one, and an Undo
  toast keeps its button beside a one-line message ("Undo" 53px, "Deshacer" 77px; 50px high). And `pushToast` shows `message ?? title` as the bold line and `description` as the
  caption, so a call passing `title` and `message` lost its title — the hardware-changed notice
  was the one such call (`AiModelsArea.vue`).
- **Chrome's native range with `accent-color`** (*measured*, Playwright's Chromium 149.0.7827, 2026-10-09 — the
  look `UiSlider` keeps): the track is an 8px pill with a 1px edge, inset 1px from the input's
  ends; the 16px thumb's centre travels from 8px inside one end to 8px inside the other; a click
  puts the thumb's centre at the pointer. Two palettes, chosen by the accent alone (not by
  `color-scheme`): the dark one when the accent's contrast against white is below about 3.4
  (between 3.36, dark, and 3.47, light, over 40 accents of oklch lightness 0.538–0.7) — the
  family's light-theme accent (L 0.538) is always light, its dark-theme one (L 0.673) always dark.
  Light: the track #efefef, the edge #767676 at half strength over the fill (#b2b2b2 on the track);
  hovering the input darkens the accent to × 0.7 and the track to #e5e5e5 (edge from #4f4f4f);
  pressing lightens the accent to × 1.3 and the track to #f5f5f5 (edge from #8d8d8d). Dark: the
  track #3b3b3b and a solid edge #858585 (hover #acacac, pressed #6e6e6e); hovering mixes the
  accent 22% with white, pressing 22% with black. Either way the thumb takes the hover colour
  only when it is hovered itself.
- **QTable, and the order TanStack Table gave the rows** (*code* — Quasar 2.35.0's
  `src/components/table/*`, TanStack table-core 8's `sortingFns`, `RowSorting`, `getSortedRowModel`,
  `GlobalFiltering`; *measured* on the three apps, 2026-10-09):
  - QTable's `table-class` goes on the scrolling wrapper `div.q-table__middle.scroll` (tabindex 0, a
    Tab stop of its own), not on the `<table>`, whose only class is `q-table`. What a `body` slot
    returns is flattened into `<tbody>`, so a slot can draw its own keyed `<tr>`s. Its stylesheet
    gives rows 48px, cells `7px 16px` padding, every `td` `position: relative` with the hover and
    selection overlays on `td::before`/`::after`, `border-collapse: separate`, the card a white
    background, and `q-table--no-wrap` unless `wrap-cells`.
  - A table wider than its box, and a pinned header (*docs + code + measured*, 2026-10-15): Quasar's
    "Sticky header" (quasar.dev/vue-components/table#sticky-header-column) gives the table a height
    or max-height ("height or max-height is important"), so `.q-table__middle.scroll` scrolls both
    ways and the sticky header pins inside it. A sticky `th` pins to its nearest scroll container,
    and any `overflow` but `visible`/`clip` makes one — so a wrapper that scrolls sideways always
    takes the pin from an outer scroller, and no CSS can scroll it only while the table overflows
    (a `scroll-state()` query needs a scroll container already). QTable's root is
    `q-table__container column no-wrap` and `.q-table__card .q-table__middle` is `flex: 1 1 auto`:
    a bounded UiTable needs only `min-height: 0` down to the wrapper. Chrome makes a scroller with
    nothing keyboard-focusable inside a Tab stop itself (announced in the Chrome 118 beta; rolled out
    in 124–125, developer.chrome.com/release-notes/124). Measured on JustWrite at a 1000 px window:
    Characters' table 784 px in 642, Chapters' 766, Worldbuilding's 848, Analysis's 682 in 596 —
    until 2026-10-15 they pushed their page sideways. The model catalog sized to its content needs
    936 px (Model's widest tag 219 · Type 77 · License 136 · Bench 70 · Fit 146 · Status 103 ·
    Actions 184): it fits from a ~1,330 px window; at 1280 its box is 886. With Model's tags
    wrapping between words (`white-space: normal`) it needs 833 and fits from ~1,227 (1264 and 1280
    measured). QBadge's own `multi-line` prop is `word-break: break-all` — a break mid-word — so it
    is not the way to let a tag wrap (Quasar 2.35.0's QBadge.sass).
  - QTable's own sort differs from TanStack's: null and undefined sort first ascending (TanStack:
    undefined last either way); other values compare as numbers, dates, booleans, or else as
    lower-cased strings — so "Zed 10" sorts before "Zed 9" (TanStack's automatic choice compares
    digit runs as numbers when a column's strings hold digits); every column's first click is
    ascending (`column-sort-order="ad"`; TanStack: descending for a column whose first value isn't a
    string). Its default filter matches the term in every column's displayed value; TanStack's global
    filter searches only the columns whose FIRST row's value is a string or a number.
  - TanStack's automatic sort function is chosen from the filtered rows' values from the eleventh on
    (its own `slice(10)`): a Date → datetime; a string holding digits → alphanumeric; any string →
    text (lower-cased); else basic. Equal values keep the data order. The click cycle is the first
    direction, the other, then no sort (unless removal is off). The page goes back to the first on a
    change of data, filter or sort.

**The CLI's layout, and the dependencies' latest** (*web* — npm registry, quasar.dev `.md` pages,
release notes; *measured* — a project generated, the family's suites run; 2026-10-09 — the plan:
[`docs/plans/2026-10-09-apps-on-the-quasar-cli-layout.md`](../plans/2026-10-09-apps-on-the-quasar-cli-layout.md)):
- Quasar is current at `quasar` 2.35.0, `@quasar/app-vite` 3.10.2, `@quasar/extras` 2.1.0,
  `create-quasar` 5.0.32, `@quasar/cli` 5.0.9 (npm, 2026-10-09). Electron 44.7.0, electron-builder
  26.15.3 and Capacitor 8.5.3 are current too.
- `npm init quasar@5.0.32 <dir> -- --template app --preset sass --preset pinia --defaults` creates
  `src/App.vue` (`<router-view />`), `layouts/MainLayout.vue` (`q-layout view="lHh Lpr lFf"` >
  `q-header` + `q-drawer show-if-above bordered` + `q-page-container` > `router-view`), `pages/`
  (`IndexPage.vue` and `SecondPage.vue` rooted in `q-page`; `ErrorNotFound.vue`), `router/routes.js`
  (one layout route with children, then `/:catchAll(.*)*` → ErrorNotFound), `css/app.scss` +
  `quasar.variables.scss`, `boot/`, `components/`, `stores/` (`index.js` = `defineStore` →
  `createPinia`), and `.vscode/mcp.json` naming `@quasar/mcp@latest`. `--preset i18n` adds
  `boot/i18n.js` (`createI18n({ locale: 'en-US', globalInjection: true, messages })` +
  `app.use`), `i18n/index.js` and `i18n/en-US/index.js`, and `@intlify/unplugin-vue-i18n`.
- **QPage** sets `min-height` by default through `style-fn(offset, height)` ("Override default CSS
  style applied to the component"; `offset` = header + footer px, `height` = the window's or the
  container's px), renders the `<main>` landmark (so none goes around or inside it), and must sit in
  a `QPageContainer` inside a `QLayout`. **QDrawer**: `width` (default 300), `mini` /
  `mini-width` (no mini in mobile behaviour), `breakpoint` (mobile behaviour up to that layout
  width), `show-if-above`, `behavior` desktop/mobile to pin one, `overlay`; it exposes
  `--q-drawer-width`; classes `q-drawer--standard|mini|mobile`, `q-mini-drawer-hide|only`.
  **QLayout** `view` is 11 characters in three rows (`h/H` header, `l/L` and `r/R` drawers, `p`
  page, `f/F` footer; upper case = fixed); `container` needs an explicit height. **Boot files** get
  `{ app, router, store, urlPath, publicPath, redirect }`; the router is created before them;
  `redirect` takes a URL or a router location (no `#` in hash mode) and the boot should return
  right after it; `router.beforeEach` in a boot file is the documented way to guard routes.
  (quasar.dev `layout/page.md`, `layout/drawer.md`, `layout/layout.md`,
  `quasar-cli-vite/boot-files.md`.)
- The Quasar docs MCP (`@quasar/mcp`) answered "No documentation pages are installed" from this
  machine on 2026-10-09; quasar.dev's `.md` pages were read instead.
- **Pinia 4.0** is "only technically breaking": ESM only, and `@vue/devtools-api` (`^8.1.5`) is a
  required peer — npm 11 installs it on its own (the kit's `ui/` install did). **Vitest 5.0** needs
  Vite ≥ 6.4 and Node ≥ 22.12; `clearMocks` is on by default; `vi.mock`/`vi.unmock`/`vi.hoisted`
  throw away from the top level; unawaited `resolves`/`rejects` fail the test; `toHaveTextContent`
  matches exactly; config files are no longer searched in parent folders. **@vueuse/core 15** drops
  `templateRef`, Node 20 and the timer options (`scheduler` replaces them) and makes
  `useThrottleFn` trail by default; the family uses only `useDraggable`. **@anthropic-ai/sdk
  0.132** adds API fields and fixes a client check — nothing the kit calls changed. (Release notes
  and the Vitest migration guide.)
- Measured on the new versions: the kit's server suite 1136 passed (2 expected failures, 12
  skipped), just-sqlite-sync 47/47, the template's lint and browser build.
- **Drag to reorder a list** (*npm registry*, 2026-10-09): no family repo has one — JustVoice's
  effects chain reorders with ↑/↓, JustWrite hand-rolls HTML5 drag events (chapters, plot board),
  the kit has only a `DragHandle` icon and AppModal's `useDraggable` (moving a window, not a
  list), and Quasar ships no sortable list. The standard on the family's stack: VueUse's
  `useSortable` in `@vueuse/integrations` 15.0.0 (MIT, 2026-09-16 — the same project and version
  line as the family's `@vueuse/core` 15), a wrapper over SortableJS 1.15.7 (MIT, 2026-02-11, its
  peer). `vuedraggable` is unmaintained (4.1.0, 2021); `vue-draggable-plus` 0.6.1 (2026-01) is a
  third-party wrapper of the same library.
- **Quasar's layout in a family app** (*measured* on JustWrite, 2026-10-09, Chrome via Playwright):
  QLayout (not a container) sets an inline `min-height` of the window's height in unzoomed pixels,
  and QPage's default style a `min-height` the same way — with `zoom` on `<html>` (the appearance
  engine's UI size) both are wrong above zoom 1 (a page 135px past the window at 1.15); a page
  `height: 100%` of a page container that fills a window-fixed layout is right at every zoom. A
  fixed, clipped layout root is the layer Chrome paints the app in (DevTools LayerTree: "Viewport");
  with the document as the scroller, a fixed overlay (`position: fixed` panel) is its own layer
  ("OverflowScrolling", "Overlap") and its text is grey-smoothed instead of sub-pixel. A fixed
  QDrawer (`view` with `L`) carries `transform: translateX(0)` inline and its content Quasar's
  `scroll` (`will-change: scroll-position`); fixed, its SVG icons antialiased up to 49/255 apart
  from the same icons painted in the root layer; not fixed (`l`), identical. QDrawer animates only
  a `mini` change (`q-drawer--mini-animate`, 0.15s timer), not a `width` change. app-vite imports
  `quasar.config.js > css` in the client entry before the app's modules (a `~`-prefixed entry is
  imported as written, so an alias resolves) — moving stylesheets there from a boot file changes the
  cascade order against stylesheets the modules import.
- **The same layout on JustVoice and docgen** (*measured*, 2026-10-09, the same way): a fixed layout
  root that is *transparent* is still a layer of its own, and Chrome draws its text grey-smoothed —
  the root must paint (the kit's rule paints `var(--bg)`; docgen, which has no `--bg`, paints
  `--surface-2` on its root class). A lazily loaded layout route puts its components' styles in a
  later chunk, after the app's, where they win ties (the kit TitleBar's scoped gap beat JustVoice's:
  16px → 6px); imported, they stay in the entry stylesheet. QLayout pads the page container by the
  header's `offsetHeight` (whole pixels): under a UI zoom where the header's height is fractional,
  the content sits up to 1px off; at zoom 1 nothing moves. QDrawer's `width` is applied in layout
  pixels, so a content-sized rail is measured with `getComputedStyle(el).width` (the zoomed
  `getBoundingClientRect` would be wrong).
- **A PostCSS plugin's `parse()` without `from` makes Vite warn** ("A PostCSS plugin did not pass
  the `from` option to `postcss.parse`") — the kit's `dropQuasarDisabledRule()` added its one rule
  that way; passing the stylesheet's file as `from` ends it (measured, the template's build).

**Hono and the offline-first shape** (*web* + *code*, 2026-10-09 — npm registry and download API,
GitHub API and raw files, unpkg; the plan:
[`docs/plans/2026-10-09-hono-standard.md`](../plans/2026-10-09-hono-standard.md)):
- **Hono 4.13.13** (MIT, 0 dependencies, 73.1M downloads/week): "Web framework built on Web
  Standards"; "It works on any JavaScript runtime … The same code runs on all platforms" (hono.dev);
  a route takes a `Request` and returns a `Response`; hono.dev has a Service Worker page (Hono in the
  browser). `@hono/node-server` 2.1.4 (MIT, 67.7M/week); its `serveStatic` handles `Range` (its
  source has `RANGE_PATTERN`). `@hono/mcp` 0.3.2 (MIT, 417k/week) runs the official MCP SDK over
  Streamable HTTP; the SDK 1.32.1 ships `dist/esm/server/webStandardStreamableHttp.js`.
  `@hono/standard-validator` 0.4.0 (1.44M/week); `@hono/typebox-validator` 1.1.0 (18.6k/week, peer
  `typebox ^1.0.30`) compiles the schema and reports `Errors`, with an optional `Clean` — no
  `Convert`, no `Default`; `@hono/ajv-validator` 0.0.2 (3/week).
- **Fastify 5.12.5** ("for Node.js", 15 dependencies, 15.2M/week) and **Express 5.3.0** (28
  dependencies) sit on Node's `http`. Fastify's ajv defaults (`@fastify/ajv-compiler` 4.0.6):
  `coerceTypes: 'array'`, `useDefaults: true`, `removeAdditional: true`, `allErrors: false`.
- Also current: oRPC (`@orpc/server` 1.15.5, MIT, 1.49M/week), Comlink 4.4.2 (Apache-2.0,
  2.7M/week), Drizzle 0.45.4 (Apache-2.0, 26.8M/week), `@fastify/busboy` 3.2.2 (MIT, 36.7M/week).
- **Actual Budget** (MIT, 29.4k stars; `actualbudget/actual`, read 2026-10-09) ships one web app on
  Electron (`desktop-electron`, its core started with `utilityProcess.fork(…/server.js)`), Capacitor 8
  for iOS and Android (`mobile-client/package.json`), the browser, and Node. Its core `loot-core`
  (`@actual-app/core`) picks a file per platform (`platform/server/sqlite/index.electron.ts` on
  better-sqlite3, `index.ts` on sql.js WASM, `index.api.ts`; the same for `fs`), imported as
  `#platform/server/…`; in the browser it runs in a web worker (`platform/client/backend-worker.ts`);
  the UI and scripts call it with `send('name', args)` over a per-platform `connection`.
  `@actual-app/api` 26.10.0 is that core in a Node process (`init()` from
  `@actual-app/core/server/main`; each method a `send('api/…')`), with `@actual-app/cli` on top.
  Its headless server `actual-server` (`@actual-app/sync-server`, Express + better-sqlite3) serves
  `@actual-app/web`, stores budget files, passes sync messages (`@actual-app/crdt` 3.1.3) and does
  sign-in and bank connections — **it does not run the core**: a browser runs its own copy and
  syncs. No thin client.
- **Others on Electron + Capacitor:** AFFiNE — Electron 39 desktop and Capacitor 8 iOS/Android
  (`packages/frontend/apps/*/package.json`), Yjs for its data, storage implementations `idb`,
  `sqlite`, `cloud`, `broadcast-channel` (`packages/common/nbstore/src/impls`), its own `nbstore`
  Capacitor plugin on iOS. Logseq — Capacitor 8 (`package.json`). Obsidian — Capacitor on phones,
  Electron on desktop (forum replies only).
- **Yjs 13.6.33** (MIT, 9.88M downloads/week, 22.9k stars) — depended on by `@tiptap/y-tiptap`,
  `@lexical/yjs`, `@blocknote/core`, `@jupyter/ydoc`. `y-indexeddb` 9.0.12, last release
  2023-11-02. Hocuspocus 4.7.0 (MIT, 2026-09-09; its SQLite extension on better-sqlite3 since v4).
  TipTap's offline guide pairs `y-indexeddb` with Hocuspocus; Hocuspocus issue #84 reports corrupted
  data in clients' IndexedDB after a Hocuspocus change. Downloads/week: `@automerge/automerge` 64k,
  `rxdb` 93k, `@powersync/web` 106k, `tinybase` 18k.
- **The newest sync engines:** Zero (`@rocicorp/zero` 1.10.0, 2026-10-09, Apache-2.0, 192k/week),
  `@electric-sql/client` 1.5.28 (1.52M/week), LiveStore 0.4.0 (2026-06-02, Apache-2.0, 17k/week),
  `@powersync/capacitor` 0.9.3, `@powersync/node` 1.1.1.
- **The conversion, measured** (*code* — hono 4.13.13, @hono/node-server 2.1.4, fastify 5.12.5,
  avvio, @fastify/ajv-compiler 4.0.6 read in node_modules; *measured* — the suites and the phone
  checks, 2026-10-09):
  - **One Hono or none:** `app.route(path, sub)` keeps a sub-app's routes bare only when
    `sub.errorHandler === errorHandler` — the module's own default (`hono-base.js` `route()`); a
    sub-app built from another copy of Hono gets wrapped with ITS default handler, which answers
    the family's errors as plain 500s. The kit is linked into each app (`file:`), so an app's own
    `hono` would be that second copy — the kit re-exports `Hono`, `stream` and `serveStatic`.
  - `validator("json")` parses only a JSON content type (anything else → `{}`) and answers bad
    JSON with a 400 HTTPException; `c.req.json()` caches the TEXT and parses it, so `c.req.text()`
    after it still gets the bytes as sent. `c.req.addValidatedData(target, data)` is public; the
    family's `input()` uses it so routes read `c.req.valid(...)`.
  - `c.json()` sends `application/json` (Fastify: `application/json; charset=utf-8`); the family's
    clients test the type with `includes` — no difference to them.
  - HEAD runs the GET route with no body (`hono-base.js`); a route's path is matched in the order
    routes were added (Fastify preferred a fixed segment over a `:param` by itself).
  - Headers set on `c` before `next()` are copied onto whatever response follows, error answers
    included (`context.js` `set res`) — Fastify's reply headers from a hook behaved the same.
  - `hono/cors` (*code* — 4.13.13 `middleware/cors/index.js`, read 2026-10-13; the family's CORS
    since then, `platform/cors.js`): it answers EVERY `OPTIONS` itself, 204 with no body; a
    refused origin gets the same 204 without `Access-Control-Allow-Origin` (Starlette: 400
    "Disallowed CORS origin"); it never refuses a method or header — it lists the allowed ones
    and the browser decides. `credentials: true` stamps Allow-Credentials on every answer, an
    allowed origin or not; `origin` as a function adds `Vary: Origin`; `"*"` stamps `*` even with
    no Origin header; no `maxAge` unless given (Starlette: 600); no Private Network Access header.
  - `hono/body-limit` (*code* — 4.13.13 `middleware/body-limit/index.js`, read 2026-10-13): with a
    `Content-Length` (and no `Transfer-Encoding`) it decides by the header alone; otherwise it
    reads the whole stream, counting, and hands the route a new Request over the buffered chunks.
    Mounted on a route, it would refuse a big upload before the route runs — the family runs it
    only where a JSON body is read (`platform/server.js` `readBody`).
  - `@hono/node-server`'s `serveStatic` takes an absolute root, answers `Range`, sends no
    `ETag`, and serves a file for ANY method (OPTIONS like HEAD) — mount it with `app.get` or put
    a 405 route before it. Its `serve()` replaces the global Request/Response unless
    `overrideGlobalObjects: false`. Keep the default. The adapter hands the app a lightweight
    request, and only the adapter's own `Request` subclass will build a new Request from it.
    hono/body-limit builds one (`new Request(c.req.raw, …)`) for a body with no
    Content-Length, chunked or empty. With the platform's globals kept, Node's undici rejects it:
    "Cannot read private member #state from an object whose class did not declare it", a 500
    on any JSON route. `app.request` hands the app a platform Request, so only a test through
    the real server finds it (`tests/body_limit.test.js`). No upstream fix as of
    @hono/node-server 2.1.5 and hono 4.13.13. — *measured 2026-10-17: `curl -X POST` with no
    data to docgen's `/v1/llm-runner/stop` answered 500; with the default, 200.*
  - Node's own server defaults `requestTimeout` to 300 s (Fastify set 0) — kept at 0 so a large
    restore upload isn't cut off; Fastify's `keepAliveTimeout` 72 s kept.
  - Fastify validated a route's parts in the order params, body, querystring, headers and
    stopped at the first that failed (`lib/validation.js`); its onClose hooks ran last-added
    first (avvio `_closeQ.unshift`). The kit's `input()` and `closeApp()` keep both.
  - Tests through `app.request`: a string body gets `text/plain;charset=UTF-8` from `new Request`
    by itself (inject sent none), so a test sends bytes; there is no socket, so the client address
    is "" unless the test passes `{ incoming: { socket: { remoteAddress } } }` (inject defaulted to
    127.0.0.1).
  - esbuild resolves a package's `"imports"` with a `"browser"` condition for `platform:
    "browser"` (`#app_state` → `app_state.phone.js`) — the phone versions no longer need the
    kit's twin-swapping plugin.
  - JustWrite's phone bundle: 9.5 MB → 8.0 MB, no Fastify inside; of the kit's stand-ins only
    `crypto`, `undici` and the injected `globals` are still imported (http, https, url,
    async_hooks, diagnostics_channel, perf_hooks and the npm `assert` served Fastify). In Chrome
    (`dist/spa-in-app`): the tutorial book opens, an inserted image is stored by path
    (`/v1/images/<id>`), and an AI answer streams frame by frame (+13, +175, +336 ms … `[DONE]`).
  - Suites on Hono: the kit 1,136 passed (2 expected fail, 12 skipped), just-sqlite-sync 47/47,
    JustWrite 148/148, docgen 161/161, JustVoice 1,061/1,061. JustWrite's phone on the Android 16
    emulator (debug APK): the tutorial book made through the UI, kept across a force-stop, an AI
    answer from a provider that refuses a webview's call carried by native HTTP.
  - **MCP:** `@modelcontextprotocol/sdk` 1.32.1's Node `StreamableHTTPServerTransport` is "a thin
    wrapper around `WebStandardStreamableHTTPServerTransport`" through `@hono/node-server`'s
    `getRequestListener` (`dist/esm/server/streamableHttp.js`); the SDK depends on `hono` and
    `@hono/node-server`, so a Hono copy sits in an app's `node_modules` even when the app never
    imports it. JustVoice uses the web-standard class directly with `c.req.raw`.
- **Secrets:** Electron's `safeStorage` — Keychain on macOS, DPAPI on Windows; on Linux unprotected
  ("a hardcoded plaintext password") without a secret store; the async API is recommended
  (electronjs.org). `@aparajita/capacitor-secure-storage` 8.0.0 — Keychain on iOS, Keystore on
  Android (~166 stars); Capawesome's Secure Preferences is an Insiders (paid) plugin.
- Node's global `fetch` (Node 26.5) sends no `Origin` header on a POST, so the shell's
  `POST /v1/shutdown` to a stale server passes the CSRF guard. — *measured, 2026-10-15* (kit
  a1ddee9, `server/src/shell/stale_server.js`).
- `proper-lockfile` 4.1.2 (MIT; brings `signal-exit` 3.0.7 ISC and `retry` 0.12.0 MIT): an
  `mkdir` lock, stale after 10 s by default and refreshed every 5 s, survives a system sleep,
  released on process exit except SIGKILL or a fatal crash; `onCompromised` throws by default.
  The kit locks each app's data folder at start (`server/src/platform/data_lock.js`, the folder
  `server.lock` inside it; a start retries for 11 s to outlast a crashed server's stale lock).
  — *code + test, 2026-10-15* (kit a1ddee9) · the package's README.

- **A Linux user opening the AppImage** (2026-10-19, just-house-paint's release dry run 39341716579: the AppImage
  itself on GitHub's ubuntu-24.04 runner, no flags): `kernel.apparmor_restrict_unprivileged_userns` = 1 (Ubuntu
  24.04's default) and no `libfuse.so.2` — the AppImage stopped at once: "dlopen(): error loading libfuse.so.2 /
  AppImages require FUSE to run". electron-builder 26.15's default (legacy) AppImage toolset needs FUSE 2;
  `toolsets.appimage: "1.0.3"` builds on the AppImage project's static runtime (type2-runtime 20251108), which
  doesn't (electron-builder marks it beta) — the template carries it. Next on that machine: Chromium's sandbox
  can't start in an AppImage (no setuid helper on its read-only mount, user namespaces restricted — Ubuntu MATE
  and Launchpad #2046844 reports; chromium.googlesource.com/chromium/src/+/main/docs/security/apparmor-userns-restrictions.md).
  **electron-builder handles it**: the AppImage's launcher (`AppRun`, app-builder-lib `appImageUtil.js`
  generateAppRunScript, on the static runtime too) adds `--no-sandbox` when `unshare -Ur true` fails — so the kit
  does nothing of its own (a shell switch added for it, bb10b45, was removed: Chromium decides its sandbox before the
  app's JavaScript runs, and the launcher already passes the flag). GitHub's 24.04 runners have the restriction
  (Playwright had to lift it to run Electron there). — *measured + code, 2026-10-19*.

---

**Starting a new app — what the standard and the guard actually require** (*agent (read-only audit of
the kit, the template and the three apps), 2026-10-17; the guard's app list, the port registry, the
template's missing files and the biome.json difference re-checked by this session*):

- The guard checks a hard-coded list: `APPS` = JustWrite, JustVoice, docgen (`scripts/check-family.js:43-47`)
  plus `TEMPLATE` (:50); server ports in `APP_PORTS` (:57: JW 17495 · JV 17494 · docgen 8742 · template
  17490). **A new app isn't checked until it's added to both.** Dev ports have no registry in code — only
  prose (app-structure §3:479, §14:961: JW 1420 · JV 1430/1431 · docgen 1450/1451); 17496 is JW's smoke
  scratch port and JV uses 1440 for a second renderer.
- The template has no `docs/`, server tests, vitest configs, `@renderer` alias, kit peers (`marked`,
  `@vueuse/core`, `@floating-ui/dom`, `qrcode`), `installLlmUi` boot, AI stack, or §11 chrome (was: also no
  LICENSE or `.gitattributes`, and a `biome.json` different from the apps' — until 2026-10-17, 5dfc3ab).
  Copy only `git ls-files template` (the working tree holds node_modules, dist, generated Android files)
  and regenerate the three lockfiles rather than copy them (they name `family-template` and `../../server`).
- Contradictions in app-structure.md: §Q.2:97 says the `id` is "the kebab name … `com.<id>.app`", but an
  Android applicationId allows only `[a-zA-Z0-9_]` (developer.android.com) and the template uses
  `familytemplate`; §2 says copy a sibling's biome.json while the template's differs; §2's .gitignore list
  has `src/phone/worker-bundle/`, the template's lacks it; §3's sample doesn't match the template
  (`open: true`, port 9000, `@/` imports); §8 and §11 still show Fastify's `app.register(...)` and
  install-runbook.md:16-65 the Python server half (the current recipe is `server/README.md:16-43`, Hono);
  §Q.9 lists `test:server`, which the template lacks; §Q.10 omits the `quasarBaseLayer()` / `ripple: false`
  checks the guard runs (check-family.js:436-446).
- No repo has a git hook (no `.husky`, no `hooksPath`). Only JustWrite has an `AGENTS.md` (stale: "No
  formatter or linter"). JustWrite commits a `.claude/settings.json` allowing scripts that don't exist
  (`build:vite`, `dev:vite`) and its `settings.local.json`. CI: JV `ci.yml` by hand (0a0f6f8c), JV `codeql.yml`
  weekly, JV `release.yml` on `v*` tags; just-sqlite-sync `ci.yml` on push and pull requests.
- `claude-config` doesn't sync to `~/.claude` (its README: "Nothing here provisions itself any more"); its
  CLAUDE.md (22 lines, 2026-07-29) has drifted from the live one (66 lines).
- External (*web via the agent, 2026-10-17*): agents.md — one Markdown file at the repo root (nested ones
  per package, closest wins), no import syntax. Claude Code (memory docs) reads AGENTS.md natively since
  v2.1.277 (installed: 2.1.302) **only when no CLAUDE.md exists**; the documented single-source pattern is
  a CLAUDE.md containing `@AGENTS.md` plus Claude-only lines (on Windows, the import rather than a symlink).
  A user skill (`~/.claude/skills/<name>/SKILL.md`) works in every project on the machine but not in cloud
  sessions; a plugin marketplace shares skills across machines but namespaces them (`/<plugin>:<skill>`).
  Husky 9.1.7 + lint-staged 17.6.0 is the standard pre-commit pair; Biome's recipe runs `biome check
  --staged`. create-quasar 5.0.34, quasar 2.35.1, @quasar/app-vite 3.10.3, electron 44.9.0 (2026-10-15/17).

---

**The complete template — what the apps share, what is written down, and industry practice** (*agent ×3,
read-only, 2026-10-17; the reports verbatim in
[`../plans/2026-10-17-complete-template-research.md`](../plans/2026-10-17-complete-template-research.md); not
re-checked by the session that saved them; paths are from before the just-core rename*):

- **Shared by all three apps and missing from the template**, ranked: the server's AI half (§8: a SQLite
  handle, `installLlm` + `runnerRouter`, seeding at start, a feature catalog and presets); the server's
  family surface (log ring + file log; the logs, disk, data, prefs and server-auth routers; the health base
  fields; the error envelope; app_state, paths, version, auth; `locateUiDir`; `defaultDataDir`); server
  tests (csrf, prefs, CORS with an `Origin:` header, logs content); `boot/<app>.js` + `services/native.js`;
  the §11 chrome (MainLayout, the TitleBar with `AiStatusButton`, the AI-tasks row spreading `navAttrs`, the
  tray handlers, keep-running); pages (Home, `/ai`, Settings with 7 sections + `settingsSections.js` +
  `settingsCanon.test.js`, `/offline`); `stores/ui.js`, `services/appearance.js`; help (`helpDocs.js`, the
  5 required docs, `toc.json`, whats-new feeding Updates); renderer tests (`vitest.config.js`,
  `boot.smoke.test.js`); `e2e/` with §10's `test`/`screenshots`; `docs/dev`; the `#app-boot` plate; desktop
  (tray.png, icon.ico, `electronFuses`, the nsis include, `perMachine:false`, the better-sqlite3 excludes).
  The smallest donors are docgen's (serve.js, app.js:357-437, MainLayout, SettingsPage.vue:205-397, `e2e/`,
  server/tests/app.test.js:32-140).
- **The template carries what no app has:** a lazily loaded layout route, Quasar's scaffold pages and its
  roboto/material-icons extras, the ssr/ssg/pwa/cordova/bex blocks, two pnpm-workspace.yaml files,
  `engines`, and a `/v1/health` of `{ok, app, product}` (all three apps answer `{status, product, version,
  apiVersion}`).
- **Common pieces each app still writes itself** (no kit factory): health (`api/health_api.js`), the Storage,
  Server and About settings sections, and the app version (JW `VITE_APP_VERSION`, its server saying 0.0.1
  against package.json's 1.0.0; JV reads package.json through `/v1/health`; docgen hard-codes 0.1.0).
- **Deviations found:** JW has no logs-content test (§11) and a non-hermetic e2e; JV has no `e2e/` (unlisted)
  and no `/settings/:section?`; JW's Appearance section is hand-built; docgen's id has hyphens (§Q.2) and it
  has no `/v1/shutdown`; JW sets no devServer host; JW's alias is `#phone` (§Q.7: `#in-app-server`); JV
  gitignores its native phone projects; the shell sends three tray events where §11 says four; no app has
  `PRD.md`.
- **Written standards, per part** (C complete · P partial · A one app only · N none): **C** — layout,
  auth/CSRF/CORS, backups, headless/CLI, installing the AI stack, features → presets, the AI-call convention,
  the model cache, shell/tray, the phone worker, definition of done, lint, the guard. **P** — tokens/theme,
  components, page patterns, navigation, forms, dialogs/toasts, help docs, routes and wire format, the error
  envelope, validation, seeds, settings/prefs, background jobs, logging, the data folder, adopting sync, API
  key storage, the memory arbiter, updates, installers, testing, security, the docs convention,
  AGENTS.md, commits/CI. **A** — keyboard shortcuts, database and migrations, releases. **N** —
  accessibility, client-side form validation, image/vision models, performance budgets, signing.
- **Validation, errors and logging today:** the error envelope is written down only in the header of
  `server/src/platform/errors.js` (RFC 7807 problem+json, a pydantic-style 422, a FastAPI-style 404), in two
  shapes (`errors: "problem" | "fastapi"`; docgen uses fastapi, a listed deviation). Server validation is
  described only in the Hono plan §5/§9/§10 (`input()`, TypeBox schemas via `platform/models.js`, ajv with
  Fastify's options). No doc says how a form validates input or shows errors. Logging: the wiring is §11;
  `errors.js` sets the level from the status code; no policy on levels or on what to log.
- **Stale docs found:** the kit's `ui/README.md` (Python core, tells hosts to call `configureLlmUi`) and
  `docs/dev/README.md` (venv, `.py` checks); `feature-model-system.md` (12 of 13 code pointers are `.py`);
  `serving-design.md` and §1 here (`llm_runner/runner/*.py`); install-runbook's client half (vite.config.js,
  main.js, Tauri); the Hono plan's header ("Nothing is coded yet"); `scripts/capture-schema.py`, cited but
  tracked in no repo; JV's design-decisions §2 and code-map (77 `.py` lines); JW's AGENTS §2 (`runAiStream`)
  and §4 (`_toast()`); the global CLAUDE.md's `styles.css` and "Biome for lint and format" (every biome.json
  turns the formatter off).
- **Industry practice** (*web via the agent, 2026-10-17*): components on Vitest + `@vue/test-utils`
  (vuejs.org/guide/scaling-up/testing); `@quasar/testing-unit-vitest` 3.0.0 (happy-dom,
  `installQuasarPlugin()`); Hono routes through `app.request` (hono.dev/docs/guides/testing) plus one test
  through the real server; Playwright's `_electron` is "experimental" and can't launch an app whose
  `EnableNodeCliInspectArguments` fuse is off, so e2e drives the unfused `dist/electron/UnPackaged` with
  `workers: 1`; `@axe-core/playwright` 4.14.0 (MPL-2.0, test-only); v8 coverage needs `coverage.include`.
  Current: vitest 5.0.5, @vue/test-utils 2.5.1, playwright 1.64.1, electron 44.9.0 (45 in beta), Capacitor
  8.5.3 (keep its https scheme; cleartext and mixed content off). npm 12.2.0 blocks install scripts by
  default; `engines` is advisory, `devEngines` enforced; Node 24 enters maintenance 2026-10-20, Node 26
  becomes LTS 2026-10-28. Husky inside `template/` (no `.git`) prints ".git can't be found" and exits 0, so it
  installs on the first `npm install` after `git init`. Biome 2.5's `html.experimentalFullSupportEnabled`
  lints Vue templates (accessibility rules fire; the template's 13 files lint clean). No type-check gate for
  plain JS (TypeScript 7 has no API for Vue's tooling yet). The kit's logger (`platform/log.js`, ring + daily
  files) is not pino, the standard Node logger (10.4.0).
- **Put to the user by that report** (not decided): an update bot (Renovate in approval mode, Dependabot, or
  none); Biome's full Vue support (it changes the family biome.json); axe's MPL-2.0; the app-id domain
  (`com.<id>.app` names a domain we may not own, permanent once on Play); JV's weekly CodeQL against the
  by-hand ruling.

---

**The template against the family standards** (*agent, 2026-10-18*; evidence and the agent's report verbatim:
[`../plans/2026-10-18-template-audit.md`](../plans/2026-10-18-template-audit.md); asked for by just-house-paint's user
after two standards the template never carried — the AI progress bar, the hue slider's colour):

- A standard reaches a generated app only as kit code or template code; prose in app-structure, or one older app's
  code, doesn't. Found as prose-only or one-app-only: the font picker's fonts (only JustWrite ships font files —
  elsewhere every choice falls back to the system font), the AI status button's look (only JustWrite styles it),
  self-update (JustWrite, JustVoice), the phone's in-app server (JustWrite), dates and numbers in the app's language,
  help on a failed warm start (JustVoice). Untested in the template: the connection page, the tray listeners, the
  Settings Storage/Server/About copies, the boot wiring, the chrome's mounts, help-key → doc. A kit bug: LuCombobox's
  Fetch button uses classes nothing defines. Fixes: the kit's TASKS ("THE TEMPLATE AUDIT").

---

**The error and validation contract, in the kit** (*code + test, 2026-10-18*; the plan
[`../plans/2026-10-18-complete-template-and-standards.md`](../plans/2026-10-18-complete-template-and-standards.md),
the standard app-structure §15):

- Every error answer carries `requestId` (Hono 4.13.13's `hono/request-id`, added first in
  `createServer`; an incoming `X-Request-Id` is kept) and a 422's errors carry `ctx` (the limit —
  `{min_length: 3}`, `{le: 5}`); an unhandled exception answers problem+json 500 (`unhandledEnvelope`)
  in both error modes. Only the kit's own tests compared whole error bodies (9 updated); no app test
  did (`git grep` for `instance:` in the apps' server tests: 0 files).
- `platform/schema.js` (`T`, `opt`, `nullable`, `literal`, `strictObject`) imports only `typebox`, so a
  form can load the route's schema in the browser; `models.js` re-exports it.
- New: `makeHealthRouter`, `migrate`/`schemaVersion` (PRAGMA user_version),
  `POST /v1/logs/client` (≤ 20 a minute); in the UI kit `parseProblem`/`attachProblem`,
  `schemaRules`/`fieldErrors`, `reportError`, `installErrorReporting`, and `kit.validation.*` /
  `kit.errors.*` words. `packages/ui` gained `test` (Vitest) and the family Biome pin.

---

**The complete template, built** (*agent (measured on this machine), 2026-10-18*; commits 6ab99da · 7e212f8 ·
e5c2cfb · cc8d672 · e53dc21; not re-run by this session):

- Checks: lint (68 files), i18n:lint 0, i18n:report (only 3 dynamic kit keys), test:server 46, test:unit 18,
  build:spa, the server's health / 405 / a 422 with `ctx` and `requestId` / shutdown, build:unpacked + the e2e
  smoke 12 pass (5 contract, 7 smoke), screenshots 13, coverage renderer 46.6 % / server 92.4 % lines, `npm run
  dev` (the shell started the server from source), `npm run build` (nsis, oneClick false, perMachine false,
  fuses applied) and the packaged `family-template-server.cmd serve` serving the UI from the asar. The guard's
  product checks pass on it (run from a scratch copy with the template in `APPS`).
- **`build:unpacked` (`--skip-pkg`) leaves `dist/electron/UnPackaged` with no `node_modules`**: the unpacked app
  finds the kit's shell in the checkout's, but its own server can't start from there — JustWrite's note
  ("use `npm run build`" for a shell-started server) is right (research B's open question, settled).
- A package's `"exports": { "./schemas/*": "./src/schemas/*.js" }` resolves `notes.js` to `notes.js.js` — the
  working pattern is `"./schemas/*.js": "./src/schemas/*.js"` (Node's subpath pattern).
- Vite dev serves the shared schema through `server.fs.allow` including the kit's `packages/core` (measured with
  it; not tried without): `/server/src/schemas/notes.js` → `/@fs/…/packages/core/src/platform/schema.js` →
  pre-bundled `typebox`.
- Vitest with `@vue/test-utils` doesn't auto-import Quasar's components (`q-page`, `q-form` render unresolved);
  the kit's `createTestApp` registers none — the template registers every `Q*` export itself.
- Husky 9 inside `template/` (no `.git`) prints ".git can't be found" and exits 0. Vite inlines the SVG boot plate
  as a `data:` URI. The kit's `UiToggle` drops `label` (a toggle's text isn't clickable); `.ui-field { margin:
  10px 0 }` pushes a row's button off its input. The kit's CORS preflight answers 204 (Starlette: 200).

---

**The kit renamed just-core** (*measured + git, 2026-10-18*; the decision is TASKS, "The kit is renamed
`just-core`"):

- The repo `delebash/just-llm-runner` is `delebash/just-core` (`gh repo rename`; GitHub redirects the old
  URL — the `calib-v1` release asset in `runner/config.js` answers 302 under the new name); the folder is
  `E:\Dev\Web\just-core`; Claude's project folder `E--Dev-Web-just-llm-runner` moved to
  `E--Dev-Web-just-core`.
- `server/` is `packages/core/` (`@delebash/core`) and `ui/` is `packages/ui/` (`@delebash/ui`). The
  package root (`.`) is gone: its two exports live in `@delebash/core/llm`, which now also exports
  `runnerRouter` (the old `router` alias is dropped). Apps import `/platform`, `/llm`, `/shell`,
  `/shell/preload` and the `llm/*`, `runner/*`, `platform/*`, `shell/*` subpaths.
- **Not renamed — runtime names:** the default model cache `~/.cache/just-llm-runner` and
  `LLM_RUNNER_CACHE` (renaming would orphan downloaded models), the runner's routes `/v1/llm-runner/*`,
  the logger names `llm_runner.*`. Dated plan docs, archives and quoted user words keep the old names.
- **Every app's `node_modules/@delebash/core` is a junction with an absolute target**
  (`/e/Dev/Web/just-core/packages/core`), so moving the kit's folder breaks every app until `npm install`
  runs in the app root and in `src-electron`. The regenerated lockfiles changed by the name and path, plus
  dependencies they hadn't recorded yet (the kit's `electron-updater` and `proper-lockfile`; JustVoice's
  server's `diff` and `lru-cache`).
- The kit root is not an npm workspaces root: each package keeps its own install and lockfile, as before.
- `packages/ui`'s `npm run lint` finds no Biome — the package never listed it (pre-existing); core's
  Biome lints `packages/ui/src` clean (146 files).
- Checked after the move: kit tests 1,199 passed (2 expected failures, 12 skipped), core lint clean,
  `check:pickers`; the template's lint, `quasar build` and server health; docgen lint, 162 server tests,
  3 unit, `build:spa`, health; JustWrite 166 server, 713 unit, `build:spa`, health on its real data folder
  (its lint has one error that predates the rename: `src/services/aiDiff.test.js:37`, from c8914db);
  JustVoice lint, 1,359 server (1 skipped), 259 unit, `build:spa`, health; just-sqlite-sync lint and 70
  tests; the guard: no violations, 29 advisory findings (29 before).

**The window drew the app — what "[shell] window loaded" means** (*code*, 2026-10-19; just-house-paint's
sixth review):

- Electron's `did-finish-load` says the document finished loading, not that the app is on screen: a
  bundle whose script throws leaves an empty `#q-app` and the event still fires. So the shell prints
  `[shell] window loaded` only once `#q-app .q-layout` exists (Quasar's layout, which every family app
  and the template render — checked 2026-10-19), polled every 500 ms for up to a minute, and
  `[shell] window failed: <why>` for a failed load (`did-fail-load`, except -3 ERR_ABORTED, a load
  replaced by another), a crashed page (`render-process-gone`) or a layout never drawn —
  `packages/core/src/shell/main.js:455-468`. The template's `scripts/start-packaged.js` (each app's
  release check on every runner) waits for one line or the other, reading the output as one running text
  so a line split across two reads still counts, and stops at once on "window failed".
- (was: printed on `did-finish-load` alone, until 2026-10-19 — just-house-paint's sixth review.)

**A restore's asset folder on Windows: a held rename** (*measured + code*, 2026-10-19, this machine):

- Renaming a folder fails (EPERM) while a file inside it is open — Windows holds a just-written file a
  moment (a scanner, the indexer). The restore's `replaceAssetDir` stages the backup's copy beside the
  folder, then swaps by renames, each retried up to 10 times (100·n ms) on EPERM/EACCES/EBUSY; a rename
  that still fails never leaves the folder missing: the old one goes back, or the backup's copy is copied
  over the folder and what the backup lacks is pruned. `packages/core/tests/data_api.test.js:102` holds a file with `openSync` and every backup file lands;
  `packages/core/src/platform/data_api.js:51-133`. An app's own start-up sweep can find the staged copy
  (`<dir>.restoring-<time>`) with no folder beside it if the process died between the two renames —
  just-house-paint puts it back (its database is restored first, so the staged copy is the matching one).
- A backup carries files only: `addDir` (`packages/core/src/platform/data_api.js:178`) adds no entry for a
  folder, so an empty folder inside an asset root doesn't come back after a restore — an app's code that
  writes into a folder it made earlier must make it again (just-house-paint's masks and AI photos of a house
  restored before its first ones: Find the parts and the AI photo failed with ENOENT, 2026-10-19). *code + test*.
- The restore copies every app table, the settings table with it — and the template's apps keep their access
  tokens there (the `auth` row): a backup from before a token was set restored onto an exposed headless server
  turned its auth off; one with another token locked every client out. The template's `data_admin.js` `keepAuth`
  (`beforeCopy` / `afterCopy`) keeps the server's own, and `afterTables` runs the seed and settings upgrade (an
  older backup's settings were only upgraded at the next start). The guard checks it where tokens live in settings
  (required for the template and just-house-paint; JustWrite's and docgen's restores are advisory findings until
  they take it). *code + test* (`template/server/tests/data.test.js`), 2026-10-19.

**The servers' guards, attacked** (*measured + code*, 2026-10-19; just-house-paint's eighth review — an agent's
probes through `app.request` with a faked loopback peer reproduced 1–3, each then pinned by a test):

- **CORS for every origin + loopback skipping auth = any web page reads this computer's server.** The template's
  (and just-house-paint's) `app.js` allowed `*`; a page the user visits fetched `/v1/data/backup` (every photo and
  `llm_providers.api_key` in plain text) and `/v1/server-auth` (the tokens). Now CORS answers the app's own origins
  and the Capacitor ones only (`APP_ORIGINS`, `CAPACITOR_ORIGINS`); the UI the server hosts is its own origin.
  Chrome 142+ also asks before a public page reaches a local address (Local Network Access); other browsers don't.
- **DNS rebinding passed the CSRF check**: `csrf.js` takes an Origin equal to the request's own Host as same-origin,
  and nothing checked the Host — a rebinding page (`Host: rebind.evil.example`) wrote engine-config binary URLs
  with no hash, which the next engine install downloads and runs. Now `bearerAuth` refuses a request from this
  computer whose Host isn't this computer's (localhost, *.localhost, an IP literal, its own hostname) or an app's
  `allowedHosts` (`<APP>_ALLOWED_HOSTS`, a reverse proxy's public name) — before tokens, with or without them
  (`packages/core/src/platform/auth.js` `hostAllowed`). The standard defense (Vite's `server.allowedHosts`, Django's
  `ALLOWED_HOSTS`).
- **A malicious backup restored engine rows** (`runner_binary`, `runner_setting`) — code at the next engine install.
  The restore now keeps this computer's (`makeDataRouter` `keepTables`, default `RUNNER_MACHINE_TABLES`).
- **A reverse proxy on the machine made every client loopback** (tokens skipped, `/v1/server-auth` open). A request
  with `Forwarded` / `X-Forwarded-For` / `X-Real-IP` is never the loopback door now (`isDirectLoopback`; the
  shutdown route too).
- **Backups carried the tokens** — now scrubbed from the backup's own copy (`scrubBackup`, the template's
  `keepAuth`); the AI providers' keys stay (a restore on a new computer needs them: the help says to keep the
  file like a password).
- **A restore's zip inflated with no cap** — an entry that inflates past its stated size stops (`zip.js`), and a
  backup whose stated sizes don't fit the drive is refused before unpacking (`checkUnpackedFits`).
- Clean (checked by the same agent): zip-slip (`..`, roots and drive letters dropped), triggers/views in a backup's
  database (never fire on `main`; views aren't copied), path inputs (`safeName`, `basename`), the static UI,
  uploads (streamed limits, JPEG/PNG/WebP only, sharp's pixel limit), pinned SHA-256 model and engine downloads,
  `?token=` kept out of logs and history, no `v-html` with user data.

**Where the data lives off Windows; a token on this computer; a proxy's origin** (*code + test*, 2026-10-20;
just-house-paint's ninth review, a reading of its help against the code):

- The ladder's default was `data/` beside the executable whenever that is writable. On macOS the executable is
  inside the app bundle (`Contents/MacOS`), and a user-owned app in Applications is writable: the data would live
  inside the bundle, gone with the next drag-in update (and a signed bundle must not change). On Linux an
  extracted AppImage (`squashfs-root/`, the headless launcher's way in) is writable while the AppImage's own mount
  isn't: the launcher's server took a new empty `data/` while the window used the XDG folder. Now
  `data_paths.bundledInstall` keeps a Mac bundle and an AppImage (mounted — `APPIMAGE` set — or extracted —
  `AppRun` beside the executable) out of the ladder: their default is the OS folder (Apple's
  `~/Library/Application Support/<App>`, the XDG data folder), the Change-folder pointer goes beside it, and a data
  folder an earlier version left in a Mac bundle moves out once. The release checks it: `start-packaged.js
  --default-data` names no folder and fails when the one used is inside the app; macOS compares the window's with
  its launcher's, Ubuntu 24.04 the AppImage's with its extracted launcher's. *Measured* (just-house-paint's dry run
  39372563942, kit 54583fe): macOS both `~/Library/Application Support/JustHousePaint`; the AppImage and its
  extracted launcher both `~/.local/share/JustHousePaint`.
- "Require a token on this computer too" left the desktop window useless: `/v1/health` stays open from this
  computer (the lockout escape), so the boot check passed, and every other call answered 401. Now `bearerAuth` marks
  an open request from a client without a token it takes, `makeHealthRouter` answers `tokenRequired: true`, and
  the UI's `checkServer` asks for a token (ConnectionError) instead of loading; the Server panel's window keeps one
  of the tokens when it turns the setting on.
- Behind an HTTPS reverse proxy every save was a CSRF 403: the browser's Origin (`https://paint.example.com`) isn't
  the scheme and Host the server sees (`@hono/node-server` takes the scheme from the socket). The template passes the
  `<APP>_ALLOWED_HOSTS` names' origins as `csrfOrigin`'s `extraOrigins` — the operator's declared public names.

**Today's changes as the other apps meet them** (*code + test*, 2026-10-20; just-house-paint's tenth review, an
agent reading JustWrite, JustVoice and docgen against the kit):

- The health answer's `tokenRequired` stopped every app's window at the token page when "require a token on this
  computer" is on — but only the template's apps sign in there: JustVoice keeps its token under `jt:token`,
  JustWrite's and docgen's Settings keep none, and their way out (Settings → Server, open from this computer) was
  behind the page. Now `checkServer` stops there only for an app that opts in (`installLlmUi({
  askTokenOnThisComputer: true })` — the template and just-house-paint); the others load as before.
- The restore kept the whole `runner_setting` table, which also holds the user's default preset, model-list rules
  and update policy (a backup moved to a new computer lost them, or left the default pointing at a preset that's
  gone). Now `keepTables` is `runner_binary` alone and `keepRows` keeps only this computer's settings in it:
  `pinned_build`, the calibration model's URL, hash and size, and `cache_root`.
- The `:focus-visible` ring matched JustWrite's TipTap editor (tabindex 0, contenteditable — focus-visible even on a
  click): a ring round the whole writing area. Editable areas are left out.
- `bundledInstall` counted any Linux run with `APPIMAGE` set — a dev checkout started from a terminal an AppImage
  launched would have moved its `data/` out. Now only a packaged app, and only `AppRun` beside its executable.
- A backup or restore worked in the system's temp: on a nearly full system drive it failed while the data lived on
  another. Their work folders are now beside the database (`.backup-*`, `.restore-*`, `.upload-*`, swept after
  an hour), and a restore's unpacked copy moves into place by a rename.
- The shell's `.part` save could fail where the old in-place write worked (a viewer holding the last export):
  `save_place.js` retries the rename, then copies over in place.
- Not changed, for those apps to decide: JustVoice's `/mcp` from Docker (`host.docker.internal`) is refused by the
  Host guard unless the app passes `allowedHosts`; JustVoice's `mcp/context.js` still trusts a raw loopback peer
  (a proxy's clients too).

**Several windows on one server, and replacing the data under them** (*measured* and *tested*, 2026-10-20;
just-house-paint's eleventh review — an agent driving two clients by fetch against the real server and against
`createApp` with a fake part finder):

- With nothing checking versions and no page reading again, the second window's save overwrote the first's every
  time: a whole-map PATCH of a design's colors, a whole outline PUT from a page opened earlier (another window's
  Box undone, two parts claiming the same 60000 px), a Find started elsewhere unseen. The standards used: JSON
  Merge Patch (RFC 7396) for per-part maps, ETag / If-Match / 412 (RFC 9110 §13.1.1) for whole outlines, and the
  kit's `watchSync` (its `GET /v1/sync/rev` contract) on a counter of the OTHER windows' changes — each window sends
  an id (`X-Client-Id`; `installLlmUi({ sendClientId: true })`, transport.js), so its own saves never move its counter.
  `watchSync` takes `waitWhile()` (the app's own reason to hold a change — a stroke in flight) and hands `onChange`
  the server's answer.
- A restore had no write gate: a save during it answered 200 and was gone; the app's jobs were stopped only after
  the data was replaced. `MaintenanceGate` (platform/maintenance.js): `makeDataRouter({ gate, beforeReplace })`
  closes it around a restore's and a reset's replacement — other writes 503 with Retry-After (RFC 9110 §15.6.4),
  the ones in flight finished first (a drain, at most 60 s), `beforeReplace` (the app's teardown) before anything
  moves. The kit's error handler now sends an `ApiError`'s own headers (it dropped them; only `HttpError` kept
  them).
- A restore with a file held past the retries answered 500 after its tables had committed: `houses/` half the
  backup's, half the old (the copy-over fallback hit EBUSY on a read-only-share handle), or — held share-all —
  pruned a house added meanwhile. Now the folders are swapped first, all or nothing (a folder that can't be moved
  refuses the restore, 409 `files-in-use`, nothing changed; the copy-over path is gone), then the tables in one
  transaction, the folders put back if it fails. A record beside the database (`<db>.restoring`) lives from the
  first rename to the commit: a server stopped in between finds it as `makeDataRouter` is made and puts the old
  folders back (`finishInterruptedRestore`). On Windows a folder with a file open in it (Node's own handles share
  delete) can't be renamed: `renameHeld` retries about ten seconds (*tested*).
- A backup taken while another window deleted a house: 500 ENOENT, or a zip whose database lists the house with
  none of its files. Now the database copy (`VACUUM INTO`) and hard links to every asset file are made in one
  synchronous step — nothing else in the server runs between them — and the zip is read from the links (a link
  keeps a file as it was when the app replaces it by rename or removes it). Where links can't be made (FAT/exFAT,
  another drive) the live folder is read and a vanished file skipped.

**Today's restore and windows, attacked; long sessions** (*measured* and *tested*, 2026-10-20; just-house-paint's
twelfth review — two agents, scratch servers, real Edge and Playwright):

- The restore's commit point was the journal's removal, not the database COMMIT: now the restored tables carry the
  restore's stamp in `_kit_restore` (inside the same transaction — a commit record), and `finishInterruptedRestore`
  rolls forward (removes the old folders) when it finds it, back otherwise. Its renames retry like the runtime's
  (`renameHeldSync`, `Atomics.wait`); failing, the router shuts writes until a restart
  (`MaintenanceGate.closeUntilRestart`), and nothing restores or resets on top of a record (`restoreUnfinished`) —
  an app's start-up sweep mustn't touch the folders one names either (a failed recovery plus just-house-paint's
  sweep removed the user's own houses in a scratch run). A failed undo at runtime shuts writes until a restart too.
- The backup's database is checked before the gate closes (`PRAGMA quick_check`, the app's `beforeCopy` in a
  rolled-back dry run); a write still running when the drain times out refuses the restore (409); the unpacked
  copy's rename retries (a scanner); `beforeReplace` must stop the app's jobs AND wait for them (a find past its last
  abort check deleted masks from the just-placed copy in the attack's trace).
- *Measured*: a handle open inside a folder makes its rename fail (EPERM) on Windows — so an app whose own server
  streams files from an asset folder (JustVoice's audio) would get "files-in-use" on every restore during playback.
  The all-or-nothing swap is therefore the gate's: a router made without `gate` keeps the restore before it (tables,
  then each folder replaced with the copy-over fallback). A read handle on a backup's hard link doesn't block
  renaming the folder (*measured*). `linkTree` costs ~0.33 ms a file on the event loop (1 500 files 478 ms, 10 000
  files 3.3 s — *measured*).
- A hidden window's poll (a fetch, then a setTimeout) escapes Chromium's intensive throttling: 15 a minute, all day
  (*measured*, Edge minimized). `common/services/visibility.js` (the Page Visibility API, `online`): watchSync, the
  connection page (2 → 60 s backoff) and the AI tasks clock ask nothing while hidden and at once when shown.
- `configureServerApi({ onTokenNeeded })`: a 401 "unauthorized" or 403 "forbidden" from bearerAuth sets
  `serverNeedsToken` and calls the app once (a token removed while a tab was open left it alive on 403s).
- The shell checks for updates every six hours and on `powerMonitor` `resume` (a copy left running for weeks never
  heard of a release). EmptyState is centred (`margin-inline: auto`) where its narrowing left it at the left.

**On a computer that isn't the developer's** (*measured* and *tested*, 2026-10-20; just-house-paint's thirteenth
review and its fixes — this machine has LongPathsEnabled, Defender off, the VC++ runtime installed and only NTFS,
which hid several of these):

- Windows refuses to rename a folder onto an existing one, even empty (EPERM): Change folder's staged
  `<picked>.moving` → `<picked>` always failed, the picker only returning existing folders. `relocate` now copies
  into the picked empty folder (`fs.promises.cp` — `cpSync` froze the window), marked by a `.moving` file until whole.
- proper-lockfile's default `onCompromised` throws: a FAT32 folder (2-second mtimes) died uncaught at 10–15 s, a
  network share waking from sleep (EIO) at 12 s. `lockDataDir` passes its documented `onCompromised`: logged, the
  lock taken again (every 30 s until it is) — never a crash.
- Node's TLS uses its own 121 certificates; with `NODE_USE_SYSTEM_CA=1` Electron 44.7's utilityProcess (and a run as
  Node) sees 269, the OS store's too — behind TLS inspection every download failed "fetch failed". The shell sets it
  for its server, and the system proxy from `session.resolveProxy` as HTTPS_PROXY/HTTP_PROXY when the user's env has
  none; undici's EnvHttpProxyAgent (8.11.2) proxies loopback too, so NO_PROXY gets `localhost,127.0.0.1,::1`.
- The health answer's `owner` (sha256 of the OS user name and home, 12 hex — platform/port.js `serverOwner`): the
  shell stops a server on its port only when it is this user's (no owner — an older version — counts as this
  user's); another user's is said (`serverStatus.portOtherUser`) and the window's requests to it are blocked until
  its own server listens (it loaded the other user's data otherwise).
- A data folder that can't be used is found before anything (a probe file): the shell's message box (Try again /
  Use the default folder / Quit), the headless start one line and exit 3; the server's first error reaches the
  connection page (`serverStatus.serverError`). A named folder over 180 characters or ending in "." or " " is refused
  (native code isn't longPathAware — the AI photo broke past ~190, the finder ~220, SQLite ~245; Windows strips a
  trailing dot: Node made "data.", SQLite opened "data"). A Hyper-V/WSL reserved port answers listen with EACCES
  (`serverStatus.portReserved`). The remedy the help gives (troubleshooting): a restart usually frees it; to keep
  it, as administrator `net stop winnat`, `netsh int ipv4 add excludedportrange protocol=tcp startport=<port>
  numberofports=1 store=persistent`, `net start winnat`, restart — an administered exclusion keeps the dynamic pool
  off the port and leaves it free for the app to bind (NetBird's Windows guide,
  docs.netbird.io/help/troubleshooting-client/windows; Microsoft KB 3039044 has a *second* bind to an excluded port
  fail — the app binds once). Not tried here (it needs an administrator). — *docs, 2026-10-20*. An Electron invoke's error carries "Error invoking remote method '…': Error: " —
  the preload strips it.
- The renderer: Konva 10.9 reads devicePixelRatio once (a move to another screen blurred the photo — a matchMedia
  resolution listener sets each layer's pixel ratio); Konva's pointercancel also sends pointerup; a decimal comma
  read "0,05" as 5 in UiNumber (now read where it can only be a decimal — numberBox.js `parseLocaleNumber`);
  `isolate` (FSI/PDI) and `localDate` are the kit's; a backup is named by the local date.
- The fourteenth review's attack on that (*measured* with the kit's own code): two Change folder moves at once lost
  the data (the panel's lock was the panel's; a picked folder's `.moving` wiped while its move ran) and the tray
  restarted the server on the old folder mid-copy — now one move at a time in the shell (`state.moving`; the
  server not started, the tray's items off), the marker `{root, entries}` ours only when it names this folder; the
  data moves into `<picked>/<productName>` (a known folder like Documents, only desktop.ini in it, counted as empty
  and was deleted whole by the next start's cleanup), room checked first (`statfs` vs `dirSize` + 256 MB), times
  kept (`preserveTimestamps` — to the millisecond only, so it did NOT spare the re-hash: the fifteenth review
  below), and the next start removes only the entries it copied (plus the old folder's own Chromium folder and
  lock), then the folder only if empty (that cleanup is gone since the fifteenth: the old copy is the user's to remove). A lost lock is taken back only after
  retrying past `stale` (so only a free or our own stale one) — another server holding it fresh ends this one by
  the folder-in-use path (proper-lockfile keeps ONE lock table per process: two lockers in one process can't test
  it — a second process can). "Use the default folder" is this start's only (the pointer kept); the path rule holds
  a folder being chosen, an existing pointer is used and logged; a folder the user named that isn't there is said
  missing, never made (the default may be). The owner is the OS account (the Windows domain and user name; uid and
  user name on POSIX) — HOME moved it. NO_PROXY gets loopback whenever any proxy is set (the user's own too).
- The engines' needs (*measured*, PE import tables): onnxruntime.dll imports MSVCP140, MSVCP140_1,
  MSVCP140_ATOMIC_WAIT (2019+ runtimes only), VCRUNTIME140, VCRUNTIME140_1; sd-cli and ggml import MSVCP140,
  VCRUNTIME140, VCRUNTIME140_1, VCOMP140 — the Visual C++ 2015–2022 runtime, unshipped (its licence is Visual
  Studio's): `hardware.js` `missingDlls` looks where Windows' loader looks and the app names Microsoft's download
  (`VC_REDIST_URL`). Windows 11 ships its own System32\onnxruntime.dll (1.17.1) — loaded when the app's was
  quarantined, then a crash mid-Find: `loadedModulePath` (GetModuleHandleW + GetModuleFileNameW) says which one
  loaded. 0xC0000135 is a missing DLL, 0xC0000139 an entry point (a runtime too old), 0xC0000106 a name too long.
  The pinned macOS sd-cli has minos 26.0 (LC_BUILD_VERSION), the Linux one needs GLIBC_2.38 / GLIBCXX_3.4.32
  (Ubuntu 24.04); the AppImage's better-sqlite3 GLIBC_2.34 (Ubuntu 22.04). ONNX Runtime's DirectML `deviceId` is
  DXGI's EnumAdapters1 index (`dxgiAdapters`, koffi) — the registry's adapter list isn't in that order. The
  engine zips' unpacked sizes (central directories, ranged reads) are 1.1–4.9× their download. `rename_held.js`
  (`renameHeld`, `renameHeldSync`) is the kit's one retrying rename — downloads, unpacks, saves, the restore.

**Change folder's third round; the lock on FAT; loopback headless** (*measured* and *tested*, 2026-10-20;
just-house-paint's fifteenth review — an agent's scratch scripts on Electron's Node against the kit's own code — and
its fixes):

- Node 24's `fs.promises.cp` with `preserveTimestamps` sets a file's times to the millisecond; NTFS keeps 100 ns, so
  0 of 20 copied files read back their time (1792495822578.5093 → …579; *measured*, `adv4/mtime_cp.mjs`). The apps'
  engines compared `mtimeMs` exactly and hashed 12 GB again after every move. `platform/file_time.js` `sameFileTime`
  compares within 2 s — rsync's `--modify-window` ("treat timestamps as being equal if they differ by no more
  than" it), FAT's resolution.
- `fs.cp` turns a relative symlink absolute, into the old folder (Node's `verbatimSymlinks`, off by default):
  the move passes `verbatimSymlinks: true`. Not run here — this Windows has no symlink right (EPERM); the option is
  asserted, the link test skips itself without it.
- The old folder is never removed by the app on its own any more: the next start's cleanup deleted the copied names
  whenever it ran — after a start on the old folder (the data-dir variable, "Use the default folder") it deleted a
  week of new work (*measured*, `adv4/sweep_late.mjs`); a kill while emptying the old folder kept it for good. Now a
  move copies, checks (each file its source's size, fsync'd), commits the pointer (written, fsync'd,
  `renameHeldSync`, its folder fsync'd off Windows) and switches; the new root's `electron/old-root.txt` lists the old
  copies (`{copies: [{root, entries}]}` — carried from move to move), and Storage removes one when asked — only its
  listed names, never the folder in use or one a server holds (`data_lock.js` `dataFolderHeld`). A pointer that
  can't be written removes the copy and says so in words (the reviewer's case: a raw EPERM and the full copy left).
  Each record keeps the move's time; a start on the old copy ("Use the default folder" with the new folder's drive
  out, the variable) is found from the copy's own `electron/moved-to.json` and said, and work done there is found
  before a removal — the newest time of the copied entries, the entries right inside them, and the database's files
  (`*.db`, its -wal/-shm), past the move by more than 2 s (Chromium's folder and the lock left out: the app wrote them
  until the relaunch). While the data-dir variable names the folder, the next start ignores any pointer, so Change
  folder, Move back and "Use the default folder from now on" are off in Storage and refused by the shell.
- A target in the app's own folder is refused: the next update's NSIS uninstall keeps only `data\` and
  `dataroot.txt` there (*measured*, the installer's removal ported — `adv4/move_crash.mjs`); the default folder
  itself is allowed ("Move back to the default folder"; its pointer removed). A Mac app's own folder is its `.app`.
- A server start already waiting (the proxy lookup, the port probe) forked on the old folder mid-copy (*measured*,
  `adv4/vt/race.test.mjs`): `startServer` checks `state.moving` again right before `utilityProcess.fork`, and the move
  waits (≤ 60 s) for a start under way to end. Quit (the window, the tray, `before-quit`, "Restart now") is held
  while the copy runs; a half copy a stop left is found from the old root's `electron/moving-to.json` at the next
  start and removed — only the names its `.moving` lists, and never when the pointer names that folder.
- The window's access token lives in the old root's Chromium profile (localStorage): the move leaves it in the new
  root's `electron/carried.json`; the relaunch reads and removes it and opens the first page at `?token=` — the kit's
  own sign-in address (serverToken.js `adoptTokenFromAddress`, taken once and removed from the address).
- proper-lockfile tells a millisecond drive from a whole-second one (lib/mtime-precision.js) but not FAT's 2 s: on
  FAT32 its own defaults lost the lock every ~20 s, taken back 5–7 s later (*measured*, `adv4/fat_lock.mjs`: 3 lost,
  3 retaken in 70 s). `data_lock.js` probes the folder's drive (an odd second plus 5 ms set, read back) and, when
  neither the millisecond nor the second comes back, keeps the lock in `<temp>/just-locks/<sha256 of the folder's
  real path>.lock` — 0 lost in 70 s (*measured*, the same FAT stat on the data folder only). A fresh lock an earlier
  version left inside the folder still counts as held.
- A preallocated `<file>.part` (`fh.truncate`) takes its whole size on NTFS (*measured*: a 2 GiB truncate took
  2.000 GiB of free space; `st.blocks × 512` equals the size there too) but is sparse on macOS and Linux — the free
  space check now counts `st.blocks × 512` off Windows, and only the `.part` of a file the install fetches.
- undici's EnvHttpProxyAgent (8.11.2) reads NO_PROXY from the environment, and with the user's own HTTP_PROXY and no
  NO_PROXY a headless server's call to 127.0.0.1 went to the proxy ("502 via proxy", `adv4/proxy_loopback.mjs`). Its
  documented `noProxy` option (it replaces NO_PROXY) is given the environment's list plus `localhost,127.0.0.1,::1`
  in http.js and llm/base.js (`platform/no_proxy.js`): "200 direct" with the same environment.

**The fifteenth's Change folder, attacked** (*measured* and *tested*, 2026-10-20; just-house-paint's sixteenth review —
scripts in the scratchpad's adv16/shell — and its fixes):

- **Node 24.21's `fs.rmSync(dir, {recursive: true})` follows an NTFS junction and empties the folder it points to**
  — on the junction itself and on a folder holding one; `fs.promises.rm` (and `fs.rm`) removes the link alone
  (*measured*, `adv16/shell/s3c_rmsync_junction.mjs`, Electron 44.7). Every recursive remove in the kit is now on
  `fs.promises.rm`: dataRoot.js (the move's undo, the sweep, Remove the old copy), runner/lifecycle.js `rmTree`
  (Clear models, a model's removal), runner/binary.js `rmtree` (an engine's swap), data_api.js (the work folders'
  sweep, a stopped restore's recovery — a folder moved aside first where the next step needs it gone), data_paths.js
  `_adoptBundledData`, vitest_tmp.js (vitest awaits an async teardown). `tests/junction_removers.test.js` holds a
  link to an outside folder under each; its files stay.
- A junction needs no symbolic-link right on Windows (`fs.symlinkSync(target, path, "junction")`, `mklink /J`); a
  symbolic link does (Developer Mode) — `fs.cp` with `verbatimSymlinks` recreates a junction as a symbolic link and
  failed every move with a junction in the data folder (EPERM, "not allowed to write there"). The move now finds the
  links first (Windows), copies the rest with `cp`'s `filter`, and makes each folder's link again as a junction (to
  the same folder; one pointing inside the data to the same place in the copy); a file's link is refused, named.
- A second launch during a move ran the start's sweep before Electron's `requestSingleInstanceLock` (*measured*,
  `s1`): the lock is now taken first, the sweep runs once the app is ready, and the move's record carries its pid —
  a process that answers `process.kill(pid, 0)` is moving still (*measured with two processes*,
  fix16/s1_two_processes.mjs: the copy kept, the move committed). The new root's records (the old copies, the
  token) are written before the pointer's step and the marker marked `committed` then: a sweep at or after the
  commit never empties the new folder.
- "Used after the move" from folder times flagged Finder's `.DS_Store` and Explorer's `Thumbs.db` (`s2`): only the
  database's files count now. An old copy or a half copy on a drive that isn't there was forgotten for good (`s5`,
  `s6`): a path whose parent folder is missing is "not connected" and kept. A start on the default folder this time,
  or on an old copy, offers no move (a move from there left the newest folder known nowhere — `s2`); "from now on"
  removes the default's moved-to record.
- The window's token is read by the shell from the page (`webContents.executeJavaScript` of `localStorage`, the
  kit's `just.serverToken`): docgen's Settings passes none.
- The guard's peer check passed a peer only the kit's own node_modules held (`s4`): a peer now counts when Node
  resolves it from the package that needs it, to a package the tree packs.

**The sixteenth's Change folder, attacked** (*measured* and *tested*, 2026-10-20; just-house-paint's seventeenth
review — scripts in the scratchpad's adv17/shell — and its fixes; proofs in fix17/):

- `subst` drive letters (no admin needed) reproduce a drive letter's other drives: "connected" read as "its parent
  folder exists" made another stick's `Q:\TestApp` the old copy — Remove the old copy removed that stick's data — and
  an empty stick forgot the real one (`s3`). An old copy is now known by its volume and by its own `moved-to.json`
  naming the folder in use: the volume id is `stat().dev` (on Windows the volume's serial number) plus, on Windows, the
  drive root's file id (`subst` folders share one volume; their roots are different folders). Rerun: another stick
  reads "not connected" and Remove refuses; the empty stick keeps the record; the real stick back reads connected.
- A missing drive is told from a deleted folder by that volume id at the nearest folder that exists (a deleted
  parent read as a missing drive for good — `s3c`; rerun: forgotten).
- **`fs.realpathSync.native` and `existsSync` on an offline share hold the calling thread ~21 s** (`s6`): every look
  at an old copy's or a moved-to folder now goes through `fs.promises` with a 3 s limit (each path looked at once —
  where it stands first, its real path only when it is there). Measured (fix17/unc_time.mjs, an unreachable
  192.0.2.x share): `oldCopyOf` and `oldCopiesInfo` answer in 3.0 s, the event loop running meanwhile.
- Real Electron (`e1`, a 60 000-file half copy): with the sweep awaited before the window, a second launch made a
  second window. Now the window and the tray first, the sweep, then the server, and "second-instance" only shows a
  window that exists — rerun: one window. `e2` (the move and relaunch, the token carried) unchanged.
- A move is done when its pointer says so (the pointer names the target, or there is none and the target is the
  default): a stop inside the pointer's write left a copy marked committed, never swept, its token in plain text (`s7`;
  rerun: swept, no token left). The pid check went (the single-instance lock covers a second launch). A "Use the default
  folder" start clears a half copy of a move into its own folder before the server starts (`s2`; rerun: Move back
  works again); Chromium's own folder in a target is no data (kept, never a refusal).
- `finishInterruptedRestore`'s undo awaited a removal between two renames — the folders were the backup's for 2.1 s
  while the tables were the old ones (`s5`): every folder now moves in one synchronous step, the backup's extra folder
  aside, removed after (rerun: 0 ms).
- Clear models and a model's Delete through a junction removed the link and freed nothing (`s8`): a linked folder is
  now emptied and its link kept (`tests/junction_removers.test.js`).

**The screens at real sizes, fixed** (*measured*, 2026-10-20; just-house-paint's tenth review, an agent on the
built app at 960/1366/1920, light and dark):

- QTabs decides it overflows from the SUM of its tabs' widths (QTabs.js `updateContainer`): a `gap` between tabs
  isn't counted, so with 2px gaps a strip up to (tabs − 1) × 2px too narrow clipped its last tab with no arrows.
  UiTabStrip is now one row with QTabs' own outside arrows (Quasar's default and Material's scrollable tabs; it
  wrapped before), the gap moved into each tab's padding.
- An SVG shown as an `<img>` takes its `prefers-color-scheme` from the img element's `color-scheme`, not the
  system's alone (Chromium): `color-scheme: light dark` on the img and a dark style inside the SVG make a boot
  plate follow the app's theme.
- The toggle's off state measured 1.04–1.44:1 (a white thumb on a near-white track); drawn as Material 3's
  unselected switch (an outlined track, the thumb in the outline's colour, both `--muted`): 5.10:1 on the page and
  5.11:1 on the track in light, 6.33:1 and 6.00:1 in dark; on, the dark surface on the dark accent 5.40:1 (white
  was 2.83:1).
- Quasar's QCard is white whatever the theme (the Dark plugin is off): the kit's theme gives it the family's
  surface, ink, edge and radius at zero specificity.

**The clipboard and the headless launcher off Windows** (*code + measured*, 2026-10-19; just-house-paint's seventh
review):

- `navigator.clipboard` exists only on a secure page (https or localhost — MDN, "Clipboard API": secure contexts
  only), so every Copy failed in a browser at `http://<network address>:<port>`. Quasar's `copyToClipboard` uses it
  where it exists and the textarea copy elsewhere; the kit's ServerPanel, LogsPanel, SyncPanel, LuClassTunes and
  AiModelsArea and the template's layout use it, and the guard fails a clipboard write in the kit's UI (advisory in
  the apps — JustWrite, JustVoice and docgen have some).
- A family app's server answers on 127.0.0.1 unless started with `--host`; the desktop shell starts it without
  one. So only a server started on its own reaches another computer — and the headless launcher was a Windows
  `.cmd` alone. The template's `build/launcher/<app>-server` is its shell-script twin for macOS and Linux
  (`ELECTRON_RUN_AS_NODE=1` on the app's own executable — no display needed, where Electron's main process would
  stop without one), copied beside the Linux executable and into the Mac app's `Contents/Resources`;
  `start-packaged.js --headless` runs it on every release runner. Measured (just-house-paint's dry run
  39363747241, kit 95f63c0): Windows' .cmd 1.0 s, Linux's script beside the unpacked exe with no display 1.0 s,
  the Mac app's `Contents/Resources` script 1.0 s, the AppImage's after `--appimage-extract` on Ubuntu 24.04
  1.5 s — each answered with its version and served the page at `/`.

- **Links in a data folder moved on Windows** (Change folder, 2026-10-20): Node's lstat reports a junction and a
  folder symlink alike (isSymbolicLink), and fs.cp with verbatimSymlinks makes every folder link a symlink — which
  needs the symlink right (Developer Mode or an administrator; a standard account gets EPERM). So the move probes
  once whether it can make a symlink (one test link in the target, removed); with the right it copies every link as
  the kind it was, junctions made again as junctions; without it, folder links become junctions (no right needed)
  and a file link is refused by name before anything is copied. Which folder link is a junction is asked of
  PowerShell's documented `LinkType` (Get-Item … | LinkType: Junction / SymbolicLink) in one call per move —
  **NOT STANDARD** plumbing (no Node API or maintained package tells them apart; `fsutil reparsepoint query` needs
  an elevated prompt on some systems); without an answer, an absolute target is taken as a junction (junctions are
  always absolute). A Windows runner (administrator) ran the file-link test; a standard account here can't. —
  *measured, 2026-10-20 (dry run 39428267423)*.

## 3 · AI tasks and the stream frames

- `GET /v1/ai/resolved-route` rows carry `context` (since `1476549` + `b9ea75d`, 2026-10-11): the
  routed local model's window — `meta.n_ctx` from the router's `/v1/models` entry when it's
  loaded, else its `--ctx-size` launch argument — or `null` for a cloud provider or when the
  router can't say; the lookup never fails the route and never loads the model. JustWrite's story
  context reads it fresh per call and takes a seeded share of it (`src/services/storyContext.js`
  `storyBudgetFor`). — *code, 2026-10-11* · `server/src/llm/prompts.js` `routerContext`,
  `ResolvedRouteResponse.context`.

- An app endpoint's SSE stream speaks six frames: `{delta}` (answer tokens), `{thinking}` (a
  thinking model's reasoning, before its answer — added 2026-10-06), `{progress}` (prompt
  reading, before the first token only), `{step: {name, done, total}}` (a later pass over part
  of the work, counted — added 2026-10-06), `{done, promptTokens, completionTokens, model, …}`
  and `[DONE]`; errors as `{error}`. — *code, 2026-10-06* · `ui/src/client.js` requestStream.
- `runAiEndpointStream` puts a step on the task's count: `stepText(step)` words it,
  `stepHint(step)` is the count's tooltip (the task store's `progress.hint`), `onStep(step)`
  tells the app. Without `stepText` the count reads `done/total`. — *code, 2026-10-06* ·
  `ui/src/services/appTask.js`, `stores/aiTasks.js` `_setProgress`.
- A strip says *stuck* only on a streaming task whose last token is ≥ 25 s old (or 8× its own
  mean gap); only token deltas refresh it — a step or a count does not. — *code, 2026-10-06* ·
  `ui/src/common/services/streamFreshness.js`, `stores/aiTasks.js` `_recordDelta`.
- A task's tok/s is tokens ÷ (now − first token), shown only once that span reaches 1 s
  (`common/services/runStats.js` `taskTps`, since 2026-10-06 — before, the span was floored at
  1 ms and 3 tokens read 3000 tok/s); the strip and the status panel both read it. Tokens are
  (answer + thinking characters) ÷ 4 while running (`taskTokensSoFar`) and
  `usage.completionTokens` at done. — *code + live, 2026-10-06*.
- A model's thinking reaches the strip (since 2026-10-06): llama.cpp streams it as
  `delta.reasoning_content` (one delta per token, before the answer — live probe: 199 thinking
  deltas, first at 1.07 s); `openai_compat.stream_chat` yields `StreamDelta(reasoning=…)`, the
  kit's `/v1/ai/stream` and JustVoice's Analyze / Second look streams send `{thinking}`, and the
  task store's `_recordThinking` makes its first piece the first token and counts it
  (`thinkingChars`, `thinking` until the answer starts). The OpenAI-compatible adapter only —
  cloud providers' thinking is not carried. — *code + live, 2026-10-06* · The Keystone's Analyze:
  *thinking…* from 7.1 s (was "first token in 26.7 s") to 29 s at ~35 tok/s live (was ~28).

## 4 · The AI cache (shared between apps)

- The cache choice is a stored setting (`runner_setting` row `cache_root`, "" = the app's own
  `<data>/ai-cache`); startup takes an explicit host root, else the stored choice, else the own
  folder (`llm/install.py` `resolve_cache_roots`). No host passes an explicit root (JV
  `app.py:253`, JW `app.py:197`). — *code, 2026-10-06*.
- No row at all means never chosen (`stores.cache_root_chosen`), and since 2026-10-06 startup then
  adopts a sibling: when the own cache has no finished model, the registry's cache with the most
  models (then bytes) is used and saved (`install._sibling_cache_with_models`). A row holding ""
  ("keep my own") is a choice and is kept. A factory reset deletes the DB file and the seed writes
  no `cache_root` row, so a reset counts as never chosen; the running engine keeps its cache until
  the next start. — *code + live on JustVoice, 2026-10-06* (reset → restart → JustWrite's cache,
  saved, gemma 26B + 12B listed as downloaded).
- An app sharing a sibling's cache records that root in the registry too, so the in-use cache is
  named by the first OTHER install recorded against it (`cache_registry.product_of`, excluding this
  data dir) → `GET /v1/ai/engine-cache` `current.product` when shared. The setup offers the in-use
  shared cache first (`QuickSetup.vue` `cacheOffer`), so *Keep a separate copy* stays reachable
  after startup adopted one. — *code + live, 2026-10-06*.
- `GET /v1/ai/engine-cache` never lists the cache in use among `options`, and lists the app's own
  folder (as "this app") whenever the cache in use is not it (`llm/cache_api.py`). The setup
  recommends the first option with models — since 2026-10-06 never `ownRoot` (`QuickSetup.vue`
  `cacheOffer`). — *code, 2026-10-06*.
- A repo counts as a model in a cache only when a finished file sits in its `snapshots/`, and a
  cache's bytes leave out `.part` / `.incomplete` / `.tmp` files (`runner/cache_registry.py`
  `summarize`, 2026-10-06). Before, a `models--…` folder holding only a `.part` counted.
  — *code + measured on a scratch tree, 2026-10-06*.
- What re-downloaded gemma on JustVoice (2026-10-06): a factory reset without a restart left it on
  JustWrite's cache; its own folder held a `models--unsloth--gemma-4-26B-A4B-it-qat-GGUF` folder
  from an unfinished 2026-10-05 download, so "this app" looked like a cache with models and the
  setup's share pick chose it — 14,249,047,104 bytes fetched again. — *log + disk, 2026-10-06*.

## 5 · Starting other programs

- **Every program the kit starts goes through `llm_runner/platform/procs.py`, with no console to
  inherit (`CREATE_NO_WINDOW` on Windows, 0 elsewhere).** A child started without it inherits
  the server's console; when the shell that started the app is gone, that console has no host
  and Windows can't start the child at all — exit `0xC0000142`. Reproduced 2026-10-07 with a
  test process whose console host was killed: `hardware.detect()` → no GPU (nvidia-smi could not
  start), with a live console → the RTX 2070 SUPER; `llama-server --version` → `0xc0000142`
  plainly, exit 0 through `procs.run`. In the app, the lost GPU meant no llama.cpp build matched
  — the engine read "no llama.cpp binary configured for platform=windows", not installed — while
  the running llama-server (started before the console went) kept working. Since 2026-10-07:
  `hardware.py` (15 calls), `bandwidth.py`, `binary.py` (the launch checks), `process.py` and
  `calibrate.py` (the spawns) use it; JustVoice's mastering, export, system info and speech
  runtime import it. A test that patches `subprocess.run` / `Popen` still reaches its fake — the
  wrappers look `subprocess` up at call time. — *measured + code, 2026-10-07* · JustVoice
  `docs/dev/RESEARCH.md` §3 (the mastering failure that found it).

---

## 6 · Claude Code: instructions and memory

**Records:** this repo's TASKS, "The family standard: one short rules file every repo imports"
— the decision these facts led to ([`../family-rules.md`](../family-rules.md), imported by every
repo's CLAUDE.md).

**How Claude Code loads instructions** (*web, 2026-10-09* — code.claude.com/docs/en/memory and
code.claude.com/docs/en/best-practices):

- CLAUDE.md files at and above the working directory load at launch; one in a subdirectory loads
  when Claude reads or edits a file there. "Target under 200 lines per CLAUDE.md file. Longer
  files consume more context and reduce adherence."
- An `@path` import loads at launch with the file that names it, resolved relative to that file,
  up to four hops deep. "Imports help you organize a long file but don't reduce its context
  cost." Import parsing skips code spans and fenced code blocks; block-level HTML comments are
  stripped before the content reaches Claude.
- An import that resolves outside the working directory (a sibling repo) asks for approval once
  per project; declined, it stays off and the dialog doesn't come back. Imports in
  `~/.claude/CLAUDE.md` load without asking.
- A sentence that tells Claude to read a file works "only if it decides to open the file" (the
  docs' AGENTS.md section); an `@` import is what makes it load.
- `.claude/rules/*.md` load at launch, or — with `paths:` frontmatter — when Claude touches a
  matching file. Rules symlinked in from outside the repo load only after that same approval, and
  then only those without `paths`.
- CLAUDE.md is advisory: "Unlike CLAUDE.md instructions which are advisory, hooks are
  deterministic." A multi-step procedure, or a rule for one part of the code, belongs in a skill
  or a path-scoped rule. The test for every line: "Would removing this cause Claude to make
  mistakes?"
- `/doctor prompt-audit` (v2.1.283 or later) reports outdated or conflicting instructions and
  references to files that don't exist, and changes nothing until asked.

**Project setup, sessions and the cloud** (*agent (docs), 2026-10-17, not re-checked* —
code.claude.com/docs: skills, sub-agents, hooks, settings, mcp, chrome, plugins/install,
claude-code-on-the-web, cloud-environments, remote-control, worktrees, workflows, changelog):

- Project skills live in `.claude/skills/<name>/SKILL.md` (frontmatter optional; `description`
  decides when one loads; `disable-model-invocation: true` makes it manual-only); keep each under
  500 lines. Project subagents live in `.claude/agents/*.md`. `/skill-doctor` (2.1.261) reports
  each skill's context cost.
- On Windows a command hook runs in Git Bash when installed, otherwise PowerShell; a hook's
  `"shell"` field overrides it. The docs' auto-format recipe is PostToolUse on `Edit|Write`. A
  Stop hook exiting 2 keeps Claude working (8 consecutive continuations at most).
- Settings precedence, highest first: managed, `--settings`, `.claude/settings.local.json`,
  `.claude/settings.json`, `~/.claude/settings.json`; `permissions.allow` lists merge. Auto mode is
  the starting mode since 2.1.284 (2026-09-28); `defaultMode: "auto"` in a project file is ignored.
  Native Windows has no sandbox (macOS, Linux, WSL2 only).
- **Cloud sessions (Claude Code on the web) don't install plugins** that a repo's `enabledPlugins`
  turns on, and don't carry `~/.claude/CLAUDE.md`, user skills, agents or user MCP servers. What
  travels: the repo's `.claude/skills`, `.claude/agents`, `.claude/settings.json` hooks and
  `.mcp.json`. Environment (network, env vars, a setup script) is set in claude.ai, not the repo;
  GitHub is required. No GPU is documented for cloud VMs.
- `claude --teleport` (or `/teleport`) pulls a cloud session to the terminal (clean git state,
  branch pushed, same account); `claude --cloud "task"` sends one up.
- **Remote Control** runs the session on this machine and drives it from claude.ai/code or the
  Claude app: `claude --remote-control` / `/rc`, or `/config` → "Enable Remote Control for all
  sessions". A project's `remoteControlAtStartup` is ignored (user scope only, 2.1.222).
- Claude in Chrome needs claude.ai login and is enabled per machine (`/chrome`); a repo can't turn
  it on. Playwright MCP is not on the docs' MCP, Chrome or best-practices pages (unconfirmed).
- The docs' large-feature order: an AskUserQuestion interview → `SPEC.md` → a fresh session builds
  from it; no PRD template. `/code-review` (local, effort levels) runs as a background subagent;
  `/code-review ultra` is cloud and billed after 3 free runs.

---

## 7 · Cloud model adapters

- The Claude adapter tells model generations apart with a table (`GENERATIONS`,
  `server/src/llm/anthropic.js`): per generation, how thinking turns off (`disabled`,
  `between_tools` for Sonnet 5.5, or not at all for Fable, Mythos and Opus 5.5) and whether it
  takes samplers; a model matching no row is legacy and gets `budget_tokens`. Printed per id on
  2026-10-10: Opus 5.5 off sends no thinking field and no temperature, Sonnet 5.5 off sends
  `between_tools`, Haiku 5.5 on sends adaptive + effort; `claude-haiku-4-5` still gets
  `budget_tokens`. `CURATED_MODELS` lists the 5.x ids. — *code, 2026-10-10* · the API rules: the
  Claude Code `claude-api` skill, cached 2026-10-06 (was: substring lists that sent
  `budget_tokens` to `claude-opus-5-5` and `claude-haiku-5-5` and `{type: "disabled"}` to
  `claude-sonnet-5-5` — each a 400 — and kept `temperature` when thinking was off, until
  2026-10-10).
- The OpenAI adapter speaks the Responses API and, when a reasoning model rejects
  `temperature`, retries once without it (`server/src/llm/openai_sdk.js:240`). Whether
  `gpt-6.1-sol` needs anything else is unchecked. — *code, 2026-10-10*.
- Claude Off on Opus 5.5, Fable and Mythos (`GENERATIONS` `off: null`) sends no `thinking` field
  and `output_config.effort` "low", the lowest of low / medium / high / xhigh / max; these models
  answer 400 to `{type: "disabled"}` at every effort. The resolved route carries `alwaysThinks`,
  and the thinking control says "This model always thinks — Off makes it think less." — *code,
  2026-10-15* (kit f92c3de) · platform.claude.com/docs/en/build-with-claude/effort (fetched
  2026-10-15); the `claude-api` skill, Migrating to Claude Opus 5.5 → Breaking change 1.
- `claude-mythos-preview` (invitation-only, succeeded by `claude-mythos-5-1`) matches no
  `GENERATIONS` row, so it is sent the legacy `{type: "enabled", budget_tokens}` — which it
  accepts: the migration guide's "Before (Mythos Preview / older models)" example sends exactly
  that, and extended thinking is "accepted only on Claude 4.6 and earlier models and on Claude
  Mythos Preview". Anthropic's SDK warns the form is deprecated for it ("Use
  'thinking.type=adaptive' instead"). Whether it takes `output_config.effort` or `{type:
  "disabled"}` is not documented, so it is NOT treated like Mythos 5 (which 400s on both a
  budget and disabled); left on the legacy path. (was: "unchecked" — until 2026-10-15.) — *the
  `claude-api` skill (cached 2026-10-06): model-migration.md "Migrating to Claude Fable 5.1",
  prompt-caching.md "Rejected combinations"; `@anthropic-ai/sdk` 0.132.1
  `MODELS_TO_WARN_WITH_THINKING_ENABLED`*.

---

## 8 · Words and translation

The plan: [`../plans/2026-10-12-i18n-standard.md`](../plans/2026-10-12-i18n-standard.md). The July
research and its seven decisions are JustWrite's
`docs/plans/2026-07-26-i18n-single-source-research.md`; what JustWrite still shows in English, by
a pseudo-locale run, is JustWrite's `docs/dev/RESEARCH.md` "Translation: what still shows in
English".

- **Only JustWrite renders through vue-i18n.** JustWrite: 2,084 `$t(` calls in 79 files, 2,156
  keys in `en.json` and `es.json`. JustVoice: vue-i18n `^11.4.13` installed and booted
  (`src/boot/i18n.js`), a 46-key `en.json`, no `$t(` call. docgen: no vue-i18n. The kit: no
  `$t(` or `useI18n`. — *code, 2026-10-12, before Task 1*. Since Task 1 (steps B and C, 2026-10-12)
  docgen and JustVoice boot vue-i18n from the kit's catalog and the kit renders through it.
- **Since step C (2026-10-12) the kit's words are vue-i18n messages:** `ui/src/i18n/locales/en.json`,
  1,440 `kit.*` keys; components call `useI18n()`, kit code outside a component `kitT()`
  (`common/services/kitI18n.js`, the app's instance). An app rewords a key by setting it in its own
  catalog. — *code, 2026-10-12*. Before step C, **the kit's words reached an app's language only through the labels feed:** the reactive store
  `ui/src/common/services/familyLabels.js` over `FAMILY_LABELS` (`common/familyContract.js:26`,
  about 64 words), filled by JustWrite's `src/i18n/familyLabelsFeed.js` on every language change
  and by JustVoice's `src/boot/jv.js:150`; app wording also comes in through `catalogCopy` and
  `quickSetupCopy` (`installLlmUi.js:100`), and number formats through `setUiLocale`
  (`common/services/locale.js`). — *code, 2026-10-12*.
- **Hardcoded text by the standard lint** (`@intlify/vue-i18n/no-raw-text`, JustWrite's config,
  every `.vue` file): the kit 832 strings in 36 of 70 files (LuModelCatalog 174, QuickSetup 77,
  AiModelsArea 61, LuClassTunes 57, ConfigColumn 56, SyncPanel 48), docgen 163 in 8 of 11,
  JustVoice 1,944 in 60 of 69, JustWrite 0 in 85. Labels in JavaScript, by a rough literal scan:
  the kit ~70 in 13 files (`appearance.js` 41), JustWrite ~116 candidates in 30. — *measured
  2026-10-12*, scratch census.
- **Formatting that ignores the app's language:** `toLocaleString(` the kit 19, JustWrite 64,
  docgen 3; `Intl.*Format` the kit 6, JustWrite 3; `localeCompare(` the kit 5, JustWrite 6. No
  app sets a Quasar language pack, so Quasar's own words stay English. — *code, 2026-10-12*.
- **Quasar 2.35 ships `Lang.getClosestIsoName(locale, isoNames)`** for matching an app's locale
  to a pack (`quasar/src/plugins/lang/Lang.js:43`), as quasar.dev's language-pack page shows. —
  *code + web, 2026-10-12*.
- **vue-i18n 12 is not released** (latest 11.4.14, 2026-10-10); its migration guide keeps `$t`
  and `useI18n()` and drops only the Legacy API mode. — *web, 2026-10-12*.
- **The standard lint reads templates only:** `@intlify/vue-i18n/no-raw-text` checks template text and
  the attributes it is told about, not the strings a component's `<script>` builds (column labels,
  dialog titles, toasts, progress lines) nor plain `.js` files. A literal scan of `<script>` blocks
  (comments, imports and console lines left out) found about 550 English-looking literals in 60 of
  JustWrite's components — about 130 of them icon names — plus about 116 in its `.js` files; the kit
  about 250 in 37 components, docgen about 84 in 7. So JustWrite's "0" by the lint is templates only.
  — *measured 2026-10-12*, scratch scan; rough (bucketing-grade), each file read before converting.
- **vue-i18n merges into the objects it is given:** `createI18n({ messages })` keeps the objects, and
  `mergeLocaleMessage` writes an app's keys into them, so a shared catalog module handed straight in
  is reworded by the first app that merges over it. The kit's `kitMessages()` returns a fresh copy for
  that reason. — *measured 2026-10-12*, JustWrite's `src/i18n/kitWords.test.js` failing before the copy.
- **The model catalog's copy object was read before any app set it:** `LuModelCatalog.vue` spreads
  `catalogCopyConfig()` into a module-level constant, and the kit's index exports `AiModelsArea`
  (which imports the catalog) statically, so the constant is built when an app first imports the
  kit — before `installLlmUi` passes `catalogCopy`. docgen's and JustVoice's catalog wording
  therefore never showed. Step C replaced the copy object: the catalog's words are `kit.modelCatalog.*`
  keys read at render, and docgen's wording is its own `kit.*` keys. — *code, 2026-10-12*, not run in
  a window.
- **The template lint misses literals inside bound attributes and directives:** `no-raw-text` reads
  template text and plain attributes, not `:title="x ? 'A' : 'B'"`, `v-tooltip="'…'"` or a template
  literal in `:aria-label`. With the kit's lint at zero, a scratch sweep of bound values still found 13
  (TitleBar's back/forward, AiStatusButton's tooltip, UiTable's pager tooltips, UiColorPicker,
  UiMultiSelect, UiTag, AppModal, CompareStrip, LuModelPicker). — *measured 2026-10-12*, scratch sweep.
- **`vue-i18n-extract` sees `t(`-style calls and `<i18n-t keypath>` only:** keys reached through
  `kitT(` or a key built at run time (`kit.phase.<phase>`) are listed as unused, so its unused list is not a
  dead-key list for the kit — 253 listed, every one reached (a scratch check over the kit and the
  three apps). Its one key missing in English is `kit.quickSetup.doneBody`, which an app supplies and
  QuickSetup shows only when `te()` finds it. — *measured 2026-10-12*.
- **An emoji with a variation selector is "raw text" to the lint:** the family config's
  `ignorePattern` (`^[\\d\\s\\p{P}\\p{S}]*$`) covers `⚠` (So) but not `⚠️`, whose U+FE0F is a mark
  (Mn); ConnectionError's icon was the kit lint's one hit. Since 2026-10-13 the pattern takes
  `\p{M}` too (`^[\\d\\s\\p{P}\\p{S}\\p{M}]*$`), and the kit's lint is at zero. — *measured 2026-10-12, 2026-10-13*.
- **`eslint-plugin-i18next`'s `no-literal-string` (6.1.5, the script-string guard ruled 2026-10-13)**
  reads script and template alike with `framework: "vue", mode: "all"`, and has four blind spots
  or traps, all in its source (`lib/rules/no-literal-string.js`, `lib/helper/generateFullMatchRegExp.js`):
  (1) a pattern given as a string is compiled WITHOUT the `u` flag, so `\p{…}` classes must be
  RegExp objects; (2) everything inside a declaration whose name is UPPER_CASE is skipped, not
  configurable — a table of UI words named `MODE_OPTIONS` is invisible to it; (3) in a template it
  checks string literals, not template literals (`` :title="`Open ${name}`" `` passes); (4) options
  replace its defaults rather than extend them. Measured with a trial ignore list (ids, classes,
  keys, CSS values, icon names by shape; `t`/`kitT`/`emit`/`console`/`Error` callees; style, icon
  and class properties): the kit 3,457 hits → 37 (about 20 real English the step-C sweep missed);
  JustWrite 1,084 → 438 after converting its UI words, the rest text sent to the AI model, words
  in exported books and default names stored as data; inside UPPER_CASE tables, 848 more in
  JustWrite. — *measured 2026-10-13*, scratch probe. **Switched on 2026-10-13** in the family's
  `eslint.i18n.config.js` (its options are the trial's, plus a number-with-unit and a class-list
  shape; `data-tip` is read — tooltips use it): the kit, the template and JustWrite at zero, with
  the rulings' exemptions as reasoned `eslint-disable` comments (37 prompt, export, id and starter
  blocks in JustWrite). An `eslint-disable` for this rule in a file the rule doesn't reach is
  reported as unused, so each one sits where a hit was.
- **`Intl.RelativeTimeFormat` gives the compact English the apps wrote by hand:** `style: "narrow"`
  → "3m ago", "2h ago", "4d ago", "5s ago"; `numeric: "auto"` → "yesterday"; under a minute
  it says "now", so "just now" stays a kit word. Spanish narrow: "hace 3 min". — *measured
  2026-10-13*, Node 26.
- **A copy of translated words keeps the language it was made in:** JustWrite's SettingsPage built
  its appearance option lists once, at load (`Object.entries(SURFACE_TINTS).map(([key, t]) => ({ key,
  ...t }))`, `UI_SCALES.map(…)`), which froze the kit's getter labels in the first language. The fix is
  the standard shape: the table carries the key (`labelKey`), the list is a computed that calls
  `t()`. — *code, 2026-10-12*.
- **vue-i18n details the kit relies on** (11.4): numeric keys resolve (`kit.aiError.status.401`);
  `d(date, intlOptions)` with no format key formats through `Intl.DateTimeFormat` in the app's
  locale (`@intlify/core-base` `datetime()`, the empty-key path), so no `datetimeFormats` table is
  needed for one-off formats. — *measured 2026-10-12*.
- **A named date or number format is formatted in the language it is found in** (vue-i18n
  11.4.13, `@intlify/core-base` `datetime()` / `number()`: `resolveFormatLocale` walks the fallback
  chain, then `new Intl.DateTimeFormat(targetLocale, …)`). A format defined for `en` only, asked
  for in Spanish, is formatted in English (read in the code, not run); so JustWrite lists its named formats for every
  language (`src/i18n/index.js`, `everyLanguage()`), the same Intl options in each. With them,
  `dateTime` · `monthDay` · `time` · `oneDecimal` · `percent` read "10/13/2026, 3:05:09 PM · Oct 13 ·
  3:05 PM · 15.7 · 31%" in English and "13/10/2026, 15:05:09 · 13 oct · 15:05 · 15,7 · 31 %" in
  Spanish. Kit code passes Intl options instead: an app's named formats are not the kit's to
  assume. — *code and measured 2026-10-13*, scratch probe on the built app.
- **Spanish groups thousands only from five digits** (CLDR `minimumGroupingDigits: 2`): `n(2600)`
  is "2600", `n(105000)` is "105.000" — a four-digit word count without a separator is correct,
  not a missed `n()`. — *measured 2026-10-13*, Chrome on the built app.
- **vue-i18n's `missing` option** (11.4.13) is `(locale, key, instance, type)`, called for a missed
  message (`type` "translate") and a missed named format; a handler replaces the warning. In
  JustWrite's smoke build (D3's replacement) it reports a key missing from English as a console
  error, checked with `te(key, "en")` so a Spanish gap — the ruled fallback — stays quiet:
  `$t("probe.no.such.key")` → "[i18n] missing translate: probe.no.such.key (en)", `$t("common.save")`
  → nothing. — *measured 2026-10-15*, Chrome on the smoke's build.
- **vue-i18n picks a plural form from a named `n` or `count`** (11.4.13, `@intlify/core-base`
  `getPluralIndex`): `t(key, { n: 3 })` on "{n} fijado | {n} fijados" gives "3 fijados" with no
  plural argument. So a language can add forms its English doesn't need ("{n} found" has one;
  Spanish agrees, "1 encontrado · 3 encontrados"). It trims the spaces around `|`: a form that
  must start with a space opens with `{' '}`. A non-number `n` (a formatted string) falls back to
  the default rule as if 1. — *measured 2026-10-17*, a scratch probe on vue-i18n 11.4.13.
- **Quasar passes `QCLI_`-prefixed command-line variables to the client** as
  `import.meta.env.QCLI_…` (@quasar/app-vite 3.10.2, "Adding to import.meta.env › From command
  line") — no quasar.config change. — *docs, and measured 2026-10-15*.
- **QInput hides its clear button when read-only:** use-field.js shows it on `clearable &&
  hasValue && editable`, with `editable = !disable && !readonly` (quasar 2.35.0). Quasar's own
  word for it is `$q.lang.label.clear` — "Borrar" in its Spanish pack (UiDate's Clear uses it). —
  *code, and measured 2026-10-15*.
- **A table column is as wide as its content's intrinsic size; `min-width: 0` on a flex child in
  the cell doesn't lower it** — JustWrite's Characters list kept its name column at 398 px (the
  description's 340 px cap) with it. — *measured 2026-10-15*.
- **`npx biome` in a checkout without its own `node_modules` runs the wrong tool:** npm resolves the
  unrelated package `biome` (0.3.3), which exits 0 and prints nothing — a silent pass. The family's
  linter is `@biomejs/biome` (2.5.x); a passing check prints "Checked N files". Run it from a
  checkout that installs it, from `ui/` for the kit's files (from the kit's root it stops on the
  nested `ui/biome.json`). — *measured 2026-10-13*, the i18n worktree.
- **Four other checkouts load the kit from source** (`JustVioce-round3`, `justvoice-quasar`,
  `justwrite-quasar`, `docgen-quasar`): a change to the kit's API reaches them too. —
  *code, 2026-10-12*.
- **What a Spanish screen still shows in English, once the catalogs are complete, is seeded data
  and code tables:** statuses, worldbuilding categories, provider and engine-preset names, the AI
  page's feature and action labels, knob help, measurement labels (JustWrite, the kit, docgen);
  JustVoice's effect presets and "Narrator". The inventory with file:line, and the plan to show an
  unrenamed seeded row by key, is
  [`../plans/2026-10-18-seeded-words-in-the-users-language.md`](../plans/2026-10-18-seeded-words-in-the-users-language.md)
  (built 2026-10-18, §5). The "not renamed" test runs where the row's seed is — the server for the
  kit's providers and presets, which sends a `nameKey`; a screen never sees the seed's English.
  JustWrite's statuses and categories are book data the renderer holds, so its store tests there.
  The family already shows a seeded row by key in three places: hardware
  classes (`classKeyLabel`), the global launch bundles (`LuGlobalSwitches.vue:30-33`), JustWrite's
  Architecture documents. — *code, a read-only sweep of the four repos, 2026-10-18*.

---

## 9 · Downloads

- **Every file download in the family goes through one path:** the downloader
  (`packages/core/src/runner/download.js`, a chunk queue — 8 connections, each pulling
  fixed-size parts, resumable from `<file>.json`) on the kit's one HTTP client
  (`packages/core/src/platform/http.js`). No app calls `fetch` for a download itself (a grep of
  JustVoice, JustWrite and docgen's `server/src` finds only comments). The AI providers' calls use
  their own agent per timeout value (`llm/base.js` `agentFor`), for the stream timeouts, not for
  downloads. — *code, 2026-10-18*.
- **undici 8 speaks HTTP/2 by default, with small receive windows:** 512 KB a connection and
  256 KB a stream (`node_modules/undici/lib/dispatcher/client.js:326, 335`, undici 8.11.2), and
  every parallel part of a download to one server shares one connection. The sender waits a round
  trip for each 512 KB: JustVoice's 22 GB Fish Drama 3 download showed **one** TCP connection and
  8 MB/s. — *code + measured, 2026-10-18*.
- **Measured** on this machine against Hugging Face's file server, 8 parallel ranged parts of one
  model (192 MB, bytes discarded): HTTP/2 with undici's windows 7.7 MB/s; HTTP/1.1, 8 connections
  35.2 MB/s; HTTP/2 with 32 MB / 16 MB windows 72.6 MB/s; HTTP/2 with **Chrome's windows (15 MB a
  connection, 6 MB a stream) 74.0 MB/s** (one stream alone: 57.7 MB/s). curl, one connection:
  75 MB/s. After the fix, the kit's own `http.fetch`: 65.8 MB/s (with the old 8 MB/s download still
  running beside it). — *measured, 2026-10-18*.
- **The fix:** every agent the kit builds takes Chrome's windows (`http.H2_WINDOWS`, `http.js` and
  `llm/base.js`) — undici's documented `connectionWindowSize` / `initialWindowSize` options
  (undici.nodejs.org, Client options). Nothing for a user to set. — *code, 2026-10-18*.
- **Resume kept only finished chunks:** the request-count discipline sizes a chunk at file / 32 —
  697 MB for the 22 GB model — and `<file>.json` recorded only completed chunks, so restarting
  the app mid-download threw away every unfinished chunk's bytes (the same 18 of 32 done before
  and after ten minutes at 8 MB/s). Since 2026-10-18 it also records how far each unfinished
  chunk got (`partial`, written every 2 s and on a cancel or failure), and a chunk carries on
  from that byte, on a resume and on a retry — as aria2's control file and `curl -C -` do.
  `download.test.js` "resume_continues_each_unfinished_chunk_from_where_it_stopped". After the
  fix, the app's own download of the rest ran at 113 MB/s. — *code + measured, 2026-10-18*.
- **No download settings since 2026-10-18:** the "Faster downloads" group (on/off, connections,
  split size, retries) left AI Settings' engine panel, the engine-config API, the stored settings
  and the seed in every app — the user: "realistically a user should never need to touch download
  settings it should just work at the best possible speed". A download's connections (8) and
  retries (3) are the downloader's own (`download.CONNECTIONS`, `RETRIES`); `downloadMaxConcurrent`
  (files at once, 4) stays. Rows already in a database are ignored until its next reset. — *code,
  2026-10-18*.

## 10 · Screens: names, announcements, contrast

From just-house-paint's fifteenth review (2026-10-20: the built app on fake data at 960×700, 1366×768 and
1920×1032, light and dark, the accessibility tree over CDP) and its fixes in the kit.

- **A UiField's label never reached its input** (since a790b37): it declared `for` as a prop and rendered
  `<label :for="$attrs.for">` — a declared prop is never in `$attrs`. Every field built on it read `textbox: ""`.
  Now `props.for`, proved with dom-accessibility-api's computeAccessibleName in a mounted test. — *measured*.
- **A `title` equal to an `aria-label` is read twice**: Chromium computes the title as the description when it
  isn't the name (accname 1.2), and NVDA reads name then description. The kit's v-tooltip adds no
  `aria-describedby` equal to the element's name, and names a control, link, image or role-bearing element that
  has none (never a plain div or span). — *measured, the accessibility tree*.
- **Live regions**: a `role="status"` element inserted already filled (each Quasar Notify toast) is often not
  announced — a live region must exist before its text changes (WAI-ARIA 1.2, live regions). The kit keeps one
  polite and one assertive visually-hidden log, made at start (`common/services/announce.js`), and writes each
  toast (errors assertive) and each AI task's start and end into them. `@react-aria/live-announcer` does the same
  but depends on react-aria (React and react-dom) since 3.5.x — 3.4.4 (2025-07) was its last React-free release.
  A region that re-renders a ticking timer (AiTaskStack's seconds) is not made live: it would speak every half
  second. — *npm registry and code, 2026-10-20*.
- **Numbers typed in a field**: `@internationalized/number`'s NumberParser (3.6.9; React Spectrum's, depends only
  on @swc/helpers) reads ".7", "5.", "15.", "+15", "1 500", Spanish ",5", the Unicode minus and Arabic digits,
  says whether a half-typed text can still become a number (`isValidPartialNumber`), and keeps "1,5" in an
  English whole-number field refused. The kit's strict reading before it refused all of those and UiNumber
  cleared the box. — *kit tests, 2026-10-20*.
- **Bidi marks in names**: FSI…PDI around every name reached the accessible names; speech skips them, NVDA's
  character review and braille (liblouis) show them. A name is marked only when it holds a strong letter of the
  direction other than the page's (`<html dir>`), by Google Closure's goog.i18n.bidi ranges. — *2026-10-20*.
- **Contrast at every hue the appearance engine sets** (it moves only the hue, never the lightness; culori,
  per-channel clip and CSS Color 4 gamut mapping, the worse of the two, hues 0–359): white on the dark theme's
  accent 2.83:1 → `--on-accent: #1a1a1a` there (5.61 on the accent, 5.24 on the danger); white on the light
  accent 4.89, on the light danger 4.86; white on the light info at oklch L 0.547 4.43 at hue 192 → L 0.535
  (4.64); the danger banner's ink with no `--danger-ink` defined fell back to #b91c1c, 2.26:1 in dark → a
  defined ink per theme (5.83 light, 5.53 dark); the fields' edge `--border` 1.25–1.44:1 → `--border-field`
  3.21+ / 3.25+ (WCAG 1.4.11 asks 3:1); the chosen segment #fff on #fbfaf7 1.04:1 → accent-soft with the
  accent ink and an inset accent edge. The numbers sit beside each token in the template's tokens.css; the
  script is the review's `contrast/measure.mjs`. — *measured, 2026-10-20*.
- **QTabs clips a focus ring drawn outside the tab** (its content area hides vertical overflow and the tab
  fills it): the ring is drawn inset. — *measured, screenshots*.
- **Dragging needs a single-pointer way** (WCAG 2.5.7): a box drawn on the photo by two clicks as well as a
  drag, pan buttons while zoomed; a freehand path (brush, eraser) is 2.1.1's exception. — *2026-10-20*.

## Records not yet distilled

Indexed by subject so they can be found; their facts move into a section above when work next
touches the subject. History in [`../plans/archive/`](../plans/archive/) is not listed.

**AI tasks — the model's thinking in the strip** (its facts are distilled into §3) —
[`2026-10-06-thinking-in-the-strip.md`](../plans/2026-10-06-thinking-in-the-strip.md)

**llama.cpp — updates, the pin, the stable channel** —
[`2026-09-19-engine-update-safety-and-stable-channel.md`](../plans/2026-09-19-engine-update-safety-and-stable-channel.md) ·
[`../llama-cpp-watch.md`](../llama-cpp-watch.md) (the upstream review ledger).

**Speed** — [`2026-09-19-speed-truth-and-calibrated-pick.md`](../plans/2026-09-19-speed-truth-and-calibrated-pick.md).

**The CPU-only band** — [`2026-07-19-cpu-only-band-test.md`](../plans/2026-07-19-cpu-only-band-test.md).

**Jobs across the three apps** — [`2026-08-14-three-app-job-matrix.md`](../plans/2026-08-14-three-app-job-matrix.md).

**Models** — [`model-research.md`](model-research.md) (distilled verdicts, licensing laws).

**Features and routing** — [`../feature-model-system.md`](../feature-model-system.md).

**Family structure** — [`../app-structure.md`](../app-structure.md) (the standard) ·
[`../family-rules.md`](../family-rules.md) (the rules every repo imports). The 2026-08 audit and
target tree are in [`../plans/archive/`](../plans/archive/).

**Installing the stack** — [`install-runbook.md`](install-runbook.md).
