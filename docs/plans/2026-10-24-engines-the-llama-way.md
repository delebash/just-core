# Every engine the llama.cpp way — llama.cpp, audio.cpp, stable-diffusion.cpp (and the part finder)

Status: PLAN, waiting for the user's go (2026-10-24, revised the same day after Fable's review and a second
round of attack). Nothing here is built.

## Why

The user, 2026-10-24: "the speech engine audio cpp and the stable diffusion cpp should be integrated the
same way as the llama cpp, we started off with llama added audio now we add stable diffusion" and "you
should have added stable diffusion to the kit then build this app using the updated kit".

What went wrong: the template research (`docs/dev/RESEARCH.md` ~1222, `plans/2026-10-17-complete-template-
research.md`:109-110) rated image/vision models **N — no standard**. Instead of filling that gap in the kit
first (family rule: "a gap is filled in the kit so every app gets it"), just-house-paint's AI photo and part
finder were built inside the app, and its v1 plan called them "the family's engine pattern" — a resemblance,
not a kit file. The family guard passed throughout: it has no engine checks. audio.cpp is half in:
JustVoice runs it on the kit's install/spawn/arbiter pieces but keeps its own pins, model store, settings
and screens.

## The standard = how the kit runs llama.cpp today (each row: the kit code that is the standard)

| # | Part | llama.cpp (the reference) |
|---|---|---|
| S1 | Engine builds are DATA | `runner_binary` rows + `runner_setting pinned_build`, seeded insert-if-missing (`llm/seed.js`:1047-1076, 412), editable at `/v1/ai/engine-config` (`llm/runner_config_api.js`) |
| S2 | Install | `POST /v1/llm-runner/engine/install` → download → stage → probe → atomic swap into `<cacheRoot>/llamacpp/<build>/<gpu>` (`runner/binary.js`:882-963); generic twin `acquireRuntime` (:985-1055) |
| S3 | Models are catalog rows | `model_catalog` (`llm/db_schema.js`:121), app rows via `installLlm({modelCatalogExtra})` (`llm/seed.js`:816-835) — the kit ships no models; downloads by `/v1/llm-runner/download` + `streamDownload` into the HF cache layout `<cacheRoot>/hf` (`runner/models.js`) |
| S4 | A resident server | llama-server spawned by `spawnChild` on a `findFreePort` port, `/health`, load/unload, idle sleep 900 s (seeded), restart (`runner/lifecycle.js`, `runner/process.js`) |
| S5 | One GPU ledger | `VramArbiter` reserve/evict/makeRoom/busy by kind (`runner/arbiter.js`) |
| S6 | Feature routing | feature catalog + prompt rows + engine presets → `preset_resolve` → `resolveRoute` → a provider adapter, local or cloud (`llm/prompts.js`, `llm/dispatch.js`, `llm/registry.js`) |
| S7 | One cache, shared or not | `<dataDir>/ai-cache`, the family registry `caches.json` (`runner/cache_registry.js`) |
| S8 | Screens | AI page (`AiModelsArea`), catalog (`LuModelCatalog`), engine row (`LuRunnerEngine`), `DownloadBar` + `createDownloadTask`, `BootModelLoad`, `StoragePanel` |
| S9 | App wiring | `installLlm({dataDir, modelCatalogExtra, featureCatalog, …})` (`template/server/src/app.js`:95-111) |

## Where each engine stands

| | S1 data | S2 install | S3 catalog | S4 server | S5 arbiter | S6 routing | S7 cache | S8 screens |
|---|---|---|---|---|---|---|---|---|
| llama.cpp (kit) | yes | yes | yes | yes | yes | yes | yes | yes |
| audio.cpp (JustVoice) | no — code constants (`engines/audiocpp/release.js`:27-97) | yes (`acquireRuntime`) | no — own `catalog.json` + `<data>/speech-cache` | yes (`--config --no-ui`, `/health`) | yes (tts/stt) | no — settings defaults (`models.js`:403-502) | no | own tab (`SpeechEnginesTab.vue`, 1221 lines) |
| sd.cpp (house-paint) | no — `ENGINE_RELEASES`, `MODEL_FILES` constants (`aiphoto/engine.js`:30, 432) | no — hand-rolled download/verify/unzip | no — own folders | no — `sd-cli` per render, progress parsed from its log | no — `stopLocalModel()` + a 409 | no | no | own card |
| SAM 3 finder (house-paint, in-process ONNX) | no — `segment/models.js` constants | n/a (npm package) | no — own folder | n/a | no — own idle timer | no | no | own card |

## One vocabulary

- **runtime**: `llamacpp` · `audiocpp` · `sdcpp` · `onnx` (in-process, no server).
- **kind** (the same word in catalog rows, providers, features, presets and the arbiter): `llm` · `tts` ·
  `stt` · `image` · `vision`. The arbiter already uses llm/tts/stt (`arbiter.js`:22).

## The design — the kit grows what llama.cpp has into every runtime

**The kit owns each runtime the way it owns llama.cpp**: its default build rows and pin live in the kit
(`runner/config.js`, like `DEFAULT_PINNED_BUILD`), seeded into the app's database and editable there. An
app turns a runtime on (`installLlm({runtimes: ["sdcpp"]})`) and brings its MODELS as catalog rows — the
kit ships no models, as today.

- **K1 · runtimes are registered.** `registerRuntime({id, kind, folder, serverExe, probeArgvs, …})`;
  llama.cpp is the first entry. What is the same (S1, S2, S4's spawn/port/health/restart, S5, S7) is shared
  code; llama's specifics (router mode, `models.ini`, fit, auto-tune, calibrate, MTP) stay llama's. The
  registry is written against BOTH new runtimes' real needs from the start — sd.cpp's and audio.cpp's
  (several slots per kind, GPU/CPU placement, its eSpeak side runtime, the Japanese dictionary) — with
  audio.cpp's real descriptor as a test fixture, so JustVoice's move (J1) fits without a second design.
  Runtime modules are imported lazily and get `.phone.js` stubs, so JustWrite's phone worker bundle never
  pulls them in.
- **K2 · builds as data for every runtime (S1).** A `runtime_binary` table keyed (runtime, platform, gpu),
  same columns as `runner_binary`, read and written through the same store accessor and edited at the same
  `/v1/ai/engine-config` (a runtime selector). llama.cpp's live `runner_binary` rows are NOT rebuilt:
  re-keying them would rewrite every family user's database at upgrade for no user gain; the one accessor
  keeps the code single. Pins per runtime in `runner_setting` (`pinned_build:<runtime>`). Backups include
  the new table like `runner_binary` (`platform/data_api.js`:73).
- **K3 · install the same way (S2).** `/v1/ai/runtimes/:runtime/engine/{status,install,cancel,uninstall,
  update-check}` on `acquireRuntime`; llama's `/v1/llm-runner/engine/*` stays. (`/v1/engines/*` is NOT
  used: JustVoice's server already mounts it.)
- **K4 · models of every kind are catalog rows (S3).** BUILT as a `runtime_model` table (runtime, id) beside
  the chat catalog — CHANGED 2026-10-24 while building: the chat catalog is LLM-shaped (quant-picked files,
  fit physics, MTP) and feeds the llama runner and every LLM screen, so image rows in it would have needed a
  kind filter on every one of those paths. Same mechanism as the catalog: rows the app seeds
  (`installLlm({ runtimeModels })`), each a pinned file set `[{slot, repo, revision, path, sha256, bytes}]`
  (FLUX: diffusion + text encoder + VAE; SAM 3: three ONNX + data + tokenizer), downloaded into the same HF
  cache layout (each file a blob by its SHA-256, checked), with status, Cancel and removal routes. Found on
  the way and fixed in the kit: the cache copied every file where Windows allows no symlink (each model on
  disk twice) — now a hard link.
- **K5 · the sd.cpp runtime (S4).** sd-server (`examples/server`, MIT) spawned like llama-server — as P1
  measured it (kit RESEARCH, "stable-diffusion.cpp's server, measured on this PC"): pinned at
  `master-1004-a85db96` (the first build P1 found with mid-render Cancel, `models/status` and
  `models/unload`; the old pin `master-973` has none of them); started with the catalog row's files on its
  command line (loading by recipe needs sd-server's own category folders, which the HF cache layout isn't),
  so another model = a restart (ready in ~1.3 s); its WebUI replaced by a blank page (`--serve-html-path`);
  renders through the native job API (`POST /sdcpp/v1/img_gen`, `GET /sdcpp/v1/jobs/{id}`,
  `…/cancel`) with `preview: "proj"` for step progress — no log parsing; stopped after a seeded idle time
  and on arbiter eviction (with CPU offload it holds ~8 GB of RAM and ~90 MB of the card while loaded; a
  stop frees both); a crash fails the job in words and the next render starts it again. Its memory is
  booked from a measured peak (the shared `model_measurements`, as JustVoice's speech engines do). Doc:
  github.com/leejet/stable-diffusion.cpp/blob/master/examples/server/api.md.
- **K6 · the onnx runtime (in-process models).** Kit code owns session create/dispose, the
  execution-provider order and CPU fallback, the idle release and the arbiter booking (kind `vision`).
  The `onnxruntime-node` package is the APP's: the app imports it and hands the module to the kit
  (dependency injection). Why not a kit (optional peer) dependency — measured 2026-10-24: apps link the
  kit by symlink (`node_modules/@delebash/core → just-core/packages/core`), so a kit `import()` resolves
  from the kit's own `node_modules` and would not find the app's copy in development; a real kit
  dependency would make every app (JustWrite, docgen) download ONNX Runtime's native binaries, against
  "no ML packages" (kit CLAUDE.md). Doc: onnxruntime.ai/docs/get-started/with-javascript/node.html.
- **K7 · the arbiter knows every kind (S5).** `image` and `vision` documented beside llm/tts/stt; every
  runtime books what it loads with an `evictFn`, marks busy around a job, and calls `makeRoom` before a
  load. The busy refusal keeps today's words ("The graphics card is busy…"). One ledger per app process
  (`arbiter.js`:18-19): contention between two APPS (house-paint + JustVoice on one card) stays out of
  scope, as today.
- **K8 · feature routing for every kind (S6).** Feature catalog rows get `kind` (default `llm`); providers
  use the existing `llm_providers.kind` column (always "llm" today, `llm/seed.js`:595); new provider types
  `local-sdcpp` (image), `local-onnx` (vision), `local-audiocpp` (tts/stt, for J1). `dispatch` gains
  `imageEdit()` and `segment()` resolved by the same `preset_resolve` → `resolveRoute`. A cloud image
  provider later (Gemini, OpenAI Images — the standard Images API shape) is a provider row + adapter. The
  AI page's routing list shows each feature with only the providers of its kind.
- **K8b · presets by kind (Fable's find).** The preset row and its form are chat-shaped today
  (temperature, top-p, max tokens, think — `llm/presets_api.js`:37-62). Each kind gets its own field set
  and schema: `image` — steps, cfg, strength, sampler, seed, working size; `vision` — execution provider
  (GPU or CPU); `tts`/`stt` — J1's. The preset editor renders the kind's fields; validation is per kind.
  App pipeline settings that are not the model's (house-paint's feather/paste-back/lock `aiphoto.compose`,
  the finder's parts and margins) stay app settings.
- **K9 · jobs in the kit.** house-paint's `jobs.js` + `/v1/jobs/:id` + `services/jobs.js runServerJob`, and
  JustVoice's `/v1/jobs/:job_id` + `ttsJobChannel.js` are the same contract twice (`ttsJobChannel.js`:4
  calls it "the kit's channel contract") → one kit job registry, route and renderer helper. Pattern:
  202 Accepted + a job resource to poll and DELETE (RFC 9110 §15.3.3; Microsoft REST API Guidelines,
  long-running operations).
- **K10 · screens (S8).** The AI page gets a tab per runtime kind beside "Chat models": the runtime's
  engine row (`LuRunnerEngine`'s shape) and its model rows (download, delete, status, `DownloadBar`) —
  one kit component built from the two app-local copies that have this shape (JustVoice's
  `SpeechEnginesTab`, house-paint's `EngineInstallCard`). A kit "this feature needs its engine" banner
  for in-context installs (house-paint's house page, JustVoice's capture readiness). `StoragePanel`
  counts every kind from the catalog — the app's extra buckets go.
  **BUILT 2026-10-24 (kit):** `LuRuntimeTab` (a tab per runtime the app turned on, named by its kind — "Images"
  for sd.cpp: the engine with what this computer lacks, Install/Remove with the `DownloadBar`; the models with
  Download/Delete; a page opened mid-install picks it up through the tasks' arm/apply, the catalog's way; channels
  `runtimeEngineChannel`/`runtimeModelChannel`); `LuEngineNeeded` (the banner, on
  `GET /v1/ai/features/:key/readiness` — `need`: engine-cant-run-here · engine-not-installed · model-not-downloaded ·
  no-image-model …, the next step in place, `ready` emitted); `LuImagePresetPane` (an image feature on Routing: its
  image presets only, the settings from the server's `paramRules`, Save, Reset to the app's). Found and fixed on the
  way: the preset routes looked presets up in the chat-only list (an image preset's edit was a 404, assigning it to
  its feature refused) — now by id, and a feature takes only a preset of its own kind (the chat default only a chat
  one); a factory Reset now resets an image preset's settings; `/v1/ai/routing` carries each feature's `kind`.
  Storage: sd.cpp's builds count as engine builds, its server log sits with the spawn logs. House-paint's
  `EngineInstallCard` and its extra Storage buckets go in its round B (H5).
- **K10b · what house-paint's engine card said before anything downloads, in the kit** (found reading
  house-paint's `api/engines_api.js` and `aiphoto_service.js` for round B — what round B must not lose). **BUILT
  2026-10-27:**
  - *Room on the drive* — house-paint's `freeBytes`/`partRoom`/`partBytes`/`mustFit` (fourteen reviews) moved to
    `platform/disk_room.js` (`freeBytes`, `partRoom`, `partBytes`, `lacksRoom`, `ROOM_MARGIN`) with its tests. An
    engine install asks for its zips plus what they unpack to (`runtime_binary.asset_unpacked_bytes`,
    `runtime_unpacked_bytes`, measured — RESEARCH "stable-diffusion.cpp's builds unpacked"; 5× an unmeasured zip),
    a model download for its files not here whole; what their own `.part` files hold counts. Refused 507
    "disk-full" with `needBytes`/`freeBytes`, said on the screens in the app's words.
  - *Busy* — an engine running a job isn't removed (a render of minutes would be lost — house-paint's rule; an
    install in flight is still cancelled, llama.cpp's); a model downloading or running a job isn't deleted (as Clear
    models cache refuses); nothing installs into or starts from an engine being removed. 409 "engine-busy" ·
    "model-busy".
  - *Slow here* and *less memory* — built as a per-build `fastGpus`/`slow` flag and `runtime_model.ram_gb` /
    `ram_gb_shared` with a `lowMemory` note (1394e5c): a second way to do jobs the kit already does. **Folded
    2026-10-27** (the user's go, kit TASKS "One way per job"): each runtime model is rated the way a chat row is —
    `fit` from `fit.coarseFit` on `peakVramMb` + `minRamMb` (on the CPU build both come out of the computer's
    memory), `speedBand` from `fit.rateSpeed` in its kind's unit (an image: seconds per image, lower is faster;
    `config.js` `DEFAULT_RUNTIME_BANDS`, seeded `band_*:image` rows), this box's measurement in the ledger
    (`model_measurements.sec_per_image`, recorded by `sdcpp.js` `imageEdit` through `RuntimeService.recordSpeed`)
    beating the model's reference figure for the build (`runtime_model.ref_speed` — the speech manifest's
    `cpu_realtime` precedent). The screens show the catalog's own chip (`modelPick.js`). A database made in
    between keeps the two K10b columns, unused.
  - Screens: `LuRuntimeTab` and `LuEngineNeeded` show each model's fit-and-speed chip and say the refusals in words
    (`runtimeWords.js` `refusalProblem`); template test mounted.
  - Existing databases gain the new columns at start-up (`llm/db.js` ADDED_COLUMNS — JustWrite's check).
  - Standard: existing code in our repos (house-paint's checks, moved as-is) and the kit's own patterns
    (`ApiError` problems, ADDED_COLUMNS, the download tasks). Not built: llama.cpp's own engine install and GGUF
    downloads have no room check yet (kit TASKS, open).
- **K11 · Clear models cache is kind- and busy-aware (S7).** It never deletes a file a loaded or busy
  runtime holds (the arbiter's bookings + open ONNX sessions) and it knows every kind's rows — the two
  reasons house-paint kept its own folders (its TASKS:1706-1712). In a shared cache it removes only this
  app's catalog rows' files, as the per-model delete already does (`runner/api.js`:526-529).
  **BUILT 2026-10-24 for the server runtimes** (ONNX sessions come with K6): a runtime model downloading or running a
  job refuses the clear ("models busy" — the screen's `kit.storagePanel.modelsBusy`); an idle runtime server stops
  first (its files are going) and its models' last download results are forgotten; through a linked cache only the
  runtime rows' own files go (`RuntimeService.busyModels/modelFiles/releaseModels`, `lifecycle.clearModelsCache`).
- **K12 · it can't happen again (Fable's four stops, from round A — not last).**
  1. `scripts/check-family.js` FAILS an app that: downloads from GitHub releases or Hugging Face, or
     unpacks an archive, outside the kit's runtime/model code; spawns a native engine or creates ONNX
     sessions outside it; pins model files/revisions/sha256 outside its seed files; runs an AI task whose
     feature key isn't in its feature catalog. Today's known files (house-paint's engines, JustVoice's
     audio.cpp and DSP process) are a named list the guard PRINTS on every run without failing; each
     leaves the list in the round that moves it; anything not on the list fails from day one.
  2. Plans carry a standards table with a "kit export" column; `scripts/check-plan.js` checks each named
     export exists in the kit's `index.js`/subpath exports; a row without one is NOT STANDARD and waits for
     the user's word. Prose like "follows the family's pattern" cannot pass.
  3. The `/new-just-app` skill carries the **N list** (accessibility, client form validation, performance
     budgets, signing — image/vision leaves it when round B lands): a piece in an N area is not planned
     until the kit has it or the user signs it off as NOT STANDARD.
  4. Reports name the repo for every new engine, stack or shared piece ("in the kit:
     `packages/core/src/…`" / "in the app: `server/src/…`") — saved as a standing rule.
  `app-structure.md` §8 becomes "an AI engine = a registered runtime + catalog rows + feature routing";
  `RESEARCH.md` moves image/vision from N to covered.
- **K13 · the template** wires runtimes through `installLlm` (no engine of its own — the template is not an
  image app) and tests the wiring with fakes; the guard runs on it like on every app.
  **BUILT 2026-10-24:** `runtimes: []`, `runtimeModels: []` in its `llmArgs` with the how-to; its
  `server/tests/runtimes.test.js` turns sd.cpp on through `installLlm` (a model row, an image feature and its
  preset) and reads every route the screens use; `src/components/kitRuntimes.test.js` mounts the three screens.

house-paint (on the updated kit):

- **H1 · AI photo** = feature `aiphoto.render` (kind `image`), preset local-sdcpp + catalog row
  `flux2-klein-4b` (its three files) + its prompt row (today's `aiphoto.templates`). `aiphoto/edit.js`
  keeps the app's own work (feather, paste-back, color lock — no library does the lock) and calls the
  kit's `imageEdit` instead of `runSdCli`. `aiphoto/engine.js`'s install code and `aiphoto/sdcli.js` go.
- **H2 · part finder** = feature `parts.find` (kind `vision`), preset local-onnx + catalog row `sam3` (its
  seven files). The SAM 3 pre/post-processing (our samexporter port — NOT STANDARD, kept by the user's
  earlier word, TASKS:1697-1700) is the app's adapter registered in the kit's provider registry.
  `finder.useGpu` becomes the preset's execution provider, `finder.idleMinutes` the kit's idle setting.
- **H3 · the GPU** through the arbiter: `jobs.js` `GPU_KINDS`/`assertGpuFree`/`hold("local-ai")` and
  `services.js stopLocalModel()` go; `data_admin.js` (reset/restore) stops every runtime through the kit,
  sd-server included (else Windows keeps its files locked).
- **H4 · nobody downloads twice.** On first start after the update, `data/models/flux2-klein`,
  `data/models/sam3` and `data/engines/sdcpp` are moved into the kit cache layout (a rename on the same
  drive; hashes already verified by the old markers; a copy with progress on another drive; the old files
  kept until the new ones verify; retried next start on failure). Settings keys that became presets are
  dropped with the settings-upgrade fingerprints (`previous_defaults.js`).
- **H5 · screens**: `EngineInstallCard` → the kit banner; Settings → Storage rows → the kit's; the AI page
  shows the Images and Vision tabs and the two features in routing.
- **H6 · docs**: `ai-photo.md`, `finding-parts.md`, `ai-features.md` (the AI photo IS an AI feature now —
  :17-18 says otherwise), `ai-providers.md`, `settings.md`, `troubleshooting.md`, `getting-started.md`,
  `whats-new.md`.
- **H7 · tests**: the kit's runtime tests replace `engine.test.js`/`sdcli.test.js`; `edit.test.js` runs the
  pipeline on a fake image provider; the real tests (`HP_REAL_SD=1`, `HP_REAL_SAM3=1`) run on this
  machine; e2e; then the installed 0.1.3 updates itself and uses its moved files without a download.

**Round B decisions (2026-10-27, building H1 + the image half of H3–H7; the finder's half is round C):**
- *The engine can't move as-is.* House-paint pins sd.cpp master-973-f0aac52 (sd-cli); the kit pins
  master-1004-a85db96 (D1: mid-render Cancel, unload). The old build is moved, untouched, into the kit's layout
  (`<cache>/sdcpp/master-973-f0aac52/<gpu>/` — house-paint's `data/engines/sdcpp/<tag>/<backend>/` is the same
  shape); the AI photo then needs the pinned build's one install (~907 MB on CUDA), and that install sweeps the
  stale build — llama.cpp's rule ("an UPDATE replaces the old build", the user's 2026-07-07), which the kit's
  runtimes lacked (KB3). The FLUX.2 klein files (8.7 GB) move without a download (KB1).
- *Kit gaps filled first:* **KB1** adopt files already on disk into a runtime model's HF cache layout (a rename on
  the same drive, else a copy; checked — a caller may vouch for a file it verified before, as house-paint's
  manifest does — the old file kept until the new one checks); **KB2** stop every runtime's server (a reset or a
  restore — Windows keeps a running server's files locked; the template's teardown calls it); **KB3** a runtime's
  install sweeps its other builds.
- *The GPU until round C:* the part finder isn't on the arbiter yet, so `assertGpuFree` (one GPU job at a time)
  and `finder.releaseGpu()` before a render stay; `stopLocalModel` goes (the arbiter makes room, and refuses
  while a chat runs).
- *Kept as app settings:* `aiphoto.templates` (the prompt pieces the app fills per surface — not a feature
  prompt row: the kit's prompt rows are whole prompts for runAction, these are fragments `renderPrompt` joins),
  `aiphoto.compose`, `aiphoto.workingPixels`, `aiphoto.sharedGpuNoteMb`. The recipe (`DEFAULT_SD_RECIPE`, a code
  constant until now) becomes the `aiphoto.render` preset's params — editable on the AI page.
- **BUILT 2026-10-27.** Kit: KB1–KB3 (08d2350), then sd-server start failures in words — house-paint's NTSTATUS
  table (`process.js` `START_FAILURES`, `startFailure`; `RunnerStartError.exitCode`; `RuntimeService._cantStart`:
  503 `engine-cant-start` with the Visual C++ runtime named when it's what's missing). House-paint: H1 (the feature,
  its preset, the model row in `seed_presets.js` — the guard allows a pin there; `edit.js` on an injected
  `generate`; `engine.js`/`sdcli.js` gone), the image half of H3 (`stopLocalModel` gone; `data_admin.js` stops the
  runtimes), H4 for the AI photo (`aiphoto/migrate.js` at start, in the background), H5 (the dialog's
  `LuEngineNeeded`, the engines store on the kit's readiness, Storage's row gone), H6 (ai-photo, ai-features,
  ai-providers, getting-started, settings, troubleshooting, whats-new), H7 (`edit.test.js` on a fake image feature,
  `migrate.test.js` on the kit's real RuntimeService, `real.test.js` on the kit's runtime — its output in the temp
  folder, never the data folder). Open: the real render on this PC and the screens checked by eye.

**Round C decisions (2026-10-27 — the user's "do it all go"; K6 + K8/K8b for vision, house-paint H2–H7 for the
finder):**
- *One service, two shapes.* ONNX Runtime is in-process: no build to install (the npm package is the app's — D2).
  It is `RUNTIMES.onnx` (kind `vision`, `inProcess`, its idle time a seeded `idle_seconds:onnx`) served by the same
  `RuntimeService` — its models (pinned file sets, downloads, room, adopt, delete, busy, rating, the ledger) are the
  one way every runtime has; only the engine half differs: `status()` says whether ONNX Runtime loads here (the
  Visual C++ runtime, the load, the loaded module — house-paint's check, moved), install/remove refuse ("part of the
  app"), and `stopServer()` disposes the models in memory.
- *The kit owns the sessions' life, the app its model's code.* Generic ONNX Runtime pieces move from house-paint's
  `segment/segmenter.js` into the kit's `runner/onnx.js` (`resolveProviders`, `sessionOptions` — DirectML's
  options —, `openSession` with CPU fallback, `runSession` falling back on a failed run, `serial`,
  `bestDmlAdapter`). SAM 3's pre/post-processing stays the app's adapter (NOT STANDARD, the user's earlier word):
  `registerVisionAdapter(modelId, { create({files, ort, executionProvider, dmlDeviceId, log}) → {…, dispose()} })`.
  `RuntimeService.withModel(modelId, {adapter, params}, fn)` builds it once (lazily), books it with the arbiter
  (kind `vision`: its `peakVramMb` on a GPU provider, 0 on the CPU), marks the kind busy while `fn` runs, and
  disposes it when idle, evicted, deleted, reset or restored. `runVisionFeature(featureKey, fn)` resolves the
  feature's preset (its model and params) the way `runImageFeature` does.
- *Vision presets:* `PARAM_RULES.vision` = `executionProvider`: auto · cpu (auto = the GPU where the adapter
  puts one). House-paint's `finder.useGpu` becomes the `parts.find` preset's param, `finder.idleMinutes` the kit's
  `idle_seconds:onnx`; both settings leave house-paint with the settings upgrade.
- *The GPU through the arbiter:* with SAM 3 booked, house-paint's `assertGpuFree`/`GPU_KINDS`/`hold("local-ai")`
  go — the arbiter evicts an idle holder for room and refuses ("The graphics card is busy") while one is busy.

**Round C BUILT (2026-10-28):** the kit's half (cd7c460, 4e2c434, 905bed9) and house-paint's H2–H7 (its TASKS).
Found on the way and filled in the kit: `retireSettings` (a setting an app retires into a kit preset or runner
setting, carried over at every seed — house-paint's two finder settings; JustVoice's speech defaults are next);
ONNX Runtime's needs in the screens' words (`runtimeWords.js` `engineNeedWords`: `files-missing`, `dll-too-old`,
`cant-load`); `EngineBusyError`'s words (a refusal: "try again when it's done", not "starts when it's free");
`LuRuntimePresetPane` (was `LuImagePresetPane`) for any runtime kind, and FeatureWorkbench loading each kind's
presets — a vision feature had no preset pane; the guard's check 21 reads installLlm's `onnx: { load: () =>
import("onnxruntime-node") }` as the D2 handoff.

JustVoice (by its own session, with the user's go — this session never commits there):

- **J1** audio.cpp into the kit like llama.cpp: its pins → the kit's rows (seeded); `speech-cache` → the
  kit cache; `SpeechEnginesTab` → the kit tab; speech defaults → presets for its speech features; its
  jobs → the kit's; its DSP process → a registered runtime or the kit's helper-process seam.

## Build design — what each new kit piece is made of (2026-10-24)

Every row's Kit code names the existing kit code the piece is built from (`node scripts/check-plan.js` checks
it). New modules: `runner/runtimes.js` (the registry), `runner/runtime_service.js` (install, status, server
lifecycle, idle stop and arbiter booking for any server runtime), `runner/sdcpp.js` (sd-server's argv, its
readiness, its image job — submit, `preview: "proj"` progress, cancel, result), `llm/runtimes_api.js` (the
routes), the `runtime_binary` table.

| Piece | Standard (doc link) | Kit code |
|---|---|---|
| One spawn / port / health / kill for every server runtime | llama-server's own start (the reference) | `startRouter` `findFreePort` `spawnChild` `closeJob` `packages/core/src/runner/process.js` |
| Engine builds as seeded, editable rows per runtime | llama.cpp's `runner_binary` + `pinned_build` | `seedExtraCatalog` `packages/core/src/llm/seed.js` `packages/core/src/llm/stores.js` `packages/core/src/llm/runner_config_api.js` |
| Install: pick the asset, download, stage, probe, swap | the kit's generic runtime install | `acquireRuntime` `selectRuntimeAsset` `packages/core/src/runner/binary.js` |
| What a build needs (VC++ DLLs, macOS, glibc) checked before install | house-paint's checks, moved | `missingDlls` `versionAtLeast` `systemVersions` `packages/core/src/runner/hardware.js` |
| Models as catalog rows with file sets, in the HF cache layout | huggingface.co/docs/huggingface_hub/guides/manage-cache | `streamDownload` `packages/core/src/runner/models.js` `packages/core/src/runner/download.js` |
| One GPU ledger for every kind | the kit's arbiter | `getArbiter` `packages/core/src/runner/arbiter.js` |
| sd-server's image job | github.com/leejet/stable-diffusion.cpp/blob/master/examples/server/api.md | `packages/core/src/runner/process.js` `findFreePort` |
| Feature routing by kind, presets by kind | the kit's routing | `resolveRoute` `packages/core/src/llm/dispatch.js` `packages/core/src/llm/preset_resolve.js` `packages/core/src/llm/presets_api.js` |
| Jobs: 202 + a job resource to poll and DELETE | RFC 9110 §15.3.3 · Microsoft REST API Guidelines (long-running operations) | `createDownloadTask` `withAiTask` `packages/ui/src/composables/useDownloadTask.js` |
| Engine and model screens per kind | the AI page's llama.cpp screens | `AiModelsArea` `LuRunnerEngine` `DownloadBar` `StoragePanel` |
| ONNX sessions, providers, idle release | onnxruntime.ai/docs/get-started/with-javascript/node.html | `getArbiter` `packages/core/src/runner/arbiter.js` |
| The AI photo's feather, paste-back and colour lock | no library does the lock (house-paint TASKS) | app — house-paint's `aiphoto/edit.js` and `pixels.js` stay the app's work |
| SAM 3's pre/post-processing (the samexporter port) | kept by the user's word (house-paint TASKS) | app — house-paint's adapter, registered in the kit's provider registry |

## The full standards check (2026-10-24) — house-paint and the template beyond the engines

How: every house-paint file not in the template (74) sorted into house-painting logic, engines (above) and
general-purpose code; the general-purpose ones checked against the kit's exports, the template and the
other apps; the whole app swept for direct `fetch`, polling, storage, hashing, native processes and raw
Quasar controls where the kit has one; the family guard's full advisory list read
(`node scripts/check-family.js --info`). Found (each: what the standard is, and the fix):

- **F1 · multi-window sync, the server half.** The kit ships only the screen half (`common/services/
  syncWatch.js`, its `/v1/sync/rev` contract); house-paint wrote the server half itself
  (`server/src/changes.js`, `api/sync_api.js`); no other app and not the template has one, so a new app
  gets no multi-window safety. Fix: the kit's change counter + `/v1/sync/rev` router; the template wires
  it; house-paint drops its copy.
  **BUILT 2026-10-24:** `platform/window_changes.js` (`ChangeCounter` — the app passes its data-write paths and its
  settings store, where the epoch row lives — and `makeSyncRevRouter`); its screen half was app-local too, so it
  moved with it: the UI kit's `common/services/otherWindows.js` (`watchOtherWindows`, `otherWindows`,
  `holdChangesWhile`, the words `kit.windows.replaced`). The template wires both (the counter, the route, the
  epoch on restore and reset, a `windows.checkSeconds` setting in its own Settings card, the Notes page reading
  again); house-paint's `changes.js`, `sync_api.js` and `otherWindows.js` went.
- **F2 · a better default never reaches an existing install.** house-paint upgrades an untouched setting by
  its old default's fingerprint (`database/previous_defaults.js` + `upgradeSettings`, tested by
  `settings_upgrade.test.js`); the kit's own seeding has the same hole — JustWrite's local provider keeps
  the old 60 s timeout though the seed says 900 (JustWrite's finding #7, 2026-10-24). Fix: the
  fingerprint upgrade in the kit, for an app's settings and the kit's own seeded rows; the template wires
  it with its test.
  **BUILT 2026-10-24:** `platform/settings_upgrade.js` (`fingerprint`, `defaultsFingerprints`, `upgradeSettings`);
  the kit's runner settings upgrade the same way (`PRIOR_RUNNER_SETTINGS`, beside the providers' prior names and
  timeouts — the llama.cpp pin stays out, its owner updates it); `tests/seed_defaults.test.js` holds today's kit
  defaults. The template's and house-paint's tests hold today's fingerprint of EVERY setting (house-paint's held
  only the five that had changed), so no default changes without its old value kept.
- **F3 · cutting text without splitting a character.** `server/src/shared/text.js cutToLength` (grapheme
  clusters, `Intl.Segmenter`) is general-purpose; the kit has no such helper. Fix: into the kit beside
  its other text helpers; house-paint imports it.
  **BUILT 2026-10-24:** the whole file moved — its five name helpers (`cleanName`, `nameKey`, `nameProblem`,
  `visibleText`, `controlsAsSpaces`) are general too, and moving one would have split it: `platform/text.js`
  (browser-safe, `@delebash/core/platform/text`), tested in `tests/text.test.js`.
- **F4 · a rename Windows may hold.** `server/src/files.js` uses `renameSync` (:109, :204) where the kit
  exports `renameHeldSync` (`platform/rename_held.js`:33). Fix: the kit's.
  **BUILT 2026-10-24** with the kit's async `renameHeld`, not `renameHeldSync`: both renames sit in async work (a
  reset, a restore's put-back) the server keeps answering beside, and the sync one blocks the event loop while it
  waits (the kit's own doc keeps it for code that must not yield).
- **F5 · a list row that is one button.** `.row-action` is defined in house-paint's `src/css/app.scss`:100
  and used by JustWrite (`ChaptersPage.vue`), JustVoice (`app.scss`) and the kit's own `AiModelsArea.vue`
  — the same look in several places, not in the kit's `common/styles.css`. Fix: one kit look (or
  control); the copies go.
  **CORRECTED 2026-10-24, building it:** the others are different looks with like names — JustWrite's
  `.ol-row-actions` and the kit's `.lu-prow-actions` are button containers, JustVoice's `.jv-rowact` small icon
  buttons; the stretched-link row is house-paint's alone. It is general (Bootstrap's `.stretched-link`), so it went
  into the kit's page looks with F6.
- **F6 · the template's shared looks are copies.** `.card`, `.form`, `.shell`, `.splash`, `.navlink`,
  `.muted`, `.mono`, `.hint`… live in the template's `src/css/app.scss` and are copied into every app;
  `quasar.variables.scss` is identical in all five (the guard asks "should it be shared?"); house-paint's
  `.visually-hidden` exists nowhere else. Fix: promote them to the kit's `common/styles.css`; each app's
  `app.scss` keeps only its own looks; a guard check fails a copy of a kit look.
  **BUILT 2026-10-24, in a sheet of its own:** attacked before building — `common/styles.css` loads in every app, and
  JustWrite's, JustVoice's and docgen's `.card`/`.hint` differ (titles 12.5, 14, 14.5 px; no max-width), so the
  template's rules there would have changed their screens unseen. So `@delebash/ui/common/app.css` (the base, the
  shell, pages, cards, hints, `.visually-hidden`, forms, the stretched-link row, Settings, the AI page, the splash
  with house-paint's colour-scheme fix), listed by an app right before its own `app.scss`: the template and
  house-paint now (their `app.scss` keep only the Notes and the swatch/houses looks); the guard's check 23 fails an
  app that lists it and defines one of its classes again, fails a template without it, and tells the others
  (JustWrite 5 copies, JustVoice 6, docgen 23) until their sessions move. `quasar.variables.scss` was already a
  one-line import of the kit's in all five (the hashes differed by line endings) — Quasar reads it from the app's
  path — so check 6 no longer asks to share it. Then, from the other apps' sessions: the sheet's page tokens
  (--fs-*, --sp-*, --r-card, --bg, the fonts — the template's alone) are read with the template's values as
  fallbacks (ede523c), and the card's padding and margin are tokens (--card-pad, --card-gap — 0e50f34: JustWrite
  measured its 33 screens, the 16px margin was the one visible change). just-sqlite-sync's `rev` takes the app's
  `windows` (the counter on its one route) and `flush()` answers its count (JustWrite's asks).
- **F7 · the skill that makes an app may be stale.** The guard: "the installed skill new-just-app/SKILL.md
  differs from the kit's skills/". Fix: reinstall (`node scripts/install-skills.js`); the guard FAILS on a
  stale skill instead of advising; K12's N list and plan check go into the kit's copy.
- **F8 · one slug, two titles.** The guard: "settings" is "Settings" in docgen and "App Settings" in
  house-paint ("a slug means one thing family-wide"). Needs the user's word (D5).
- Checked and standard: the error helpers (`api/refusals.js` on the kit's `ApiError`), start-up cleanup
  (the kit's `data_api` sweeps), the name dialog (the template's `NoteDialog` §15 shape), the
  other-windows watcher (the kit's `watchSync`), Undo/Redo (VueUse `useManualRefHistory`), the brand
  feeds (the kit's `http.fetch`), the raw `<q-btn>`s (the row look F5 and the color chips — shapes the
  kit has no control for, Quasar's own as the rule allows). house-painting logic (paints, colors, the
  painter, light, parts, designs, schemes, the canvas on Konva) is the app's by nature.
- Other apps' findings (the guard's advisory list — their repos, their sessions): docgen allows CORS from
  every origin (any web page could read its server), has no maintenance gate during a restore, serves its
  UI by hand, lacks the release scripts; JustVoice formats numbers in the browser's language in 24 files,
  never calls `installErrorReporting`, lacks the release scripts and AGENTS.md. Sent to their sessions
  with the user's go (D6).

## Order — vertical rounds on a shared foundation (Fable's split, reshaped)

Fable proposed (1) sd.cpp runtime + AI photo, (2) routing, (3) finder, (4) jobs and screens. Attacked:
the AI photo would be rebuilt twice (direct call in 1, routed in 2) and would ship without install screens
until 4. So each round below is a whole slice — no interim app-local code — and every app stays green
after each:

0. **P0** — the already-approved kit fixes (Cancel log, model names, sentence): all suites green
   2026-10-24; the guard's only flag is this plan file not linked from `docs/dev/RESEARCH.md` — link it,
   commit.
1. **P1 · spike, measured on this machine, data in the scratchpad (never `just-house-paint/data`):** does
   the pinned sd.cpp release ship `sd-server`; does its native API reproduce today's render (init +
   reference + mask, strength 1, 4 steps, cfg 1, euler, seed 42, CPU offload) — same image within noise,
   same ΔE after the lock; first vs second render time; VRAM/RAM loaded and after unload; recipes vs
   command-line preload; its web page off. Downloads (~9.6 GB, nothing is on this PC): the cuda12 build
   344 MB + CUDA runtime 563 MB + FLUX.2 klein Q8 4.3 GB + Qwen3-4B Q8 4.3 GB + VAE 0.17 GB. The card is
   shared with JustVoice: message its session first. If sd-server can't reproduce the render, stop and
   come back.
   **DONE 2026-10-24** (kit RESEARCH, "stable-diffusion.cpp's server, measured on this PC"): pixel-identical
   to sd-cli on both builds, warm renders 15.4 s vs 19.2 s, Cancel / unload / status only on the newest
   build (`master-1004`) → K5 pins it; the cost is RAM (~8 GB while loaded), not the card (~90 MB).
2. **Round A · the foundation:** K1 (with audio.cpp's descriptor as a fixture), K2, K4, K7, K11, K12 (all
   four stops, the guard printing today's known files), docs. llama.cpp on the shared parts; no app
   changes. Kit + every app green.
   **Round A2 · the non-engine gaps:** F1, F2, F3, F5, F6 into the kit; the template wired and tested for
   each; F7 (the skill reinstalled, the guard failing a stale skill and a copied kit look); house-paint
   adopts F1–F6 and drops its copies. Kit + every app green.
3. **Round B · images, whole:** K3, K5, K8 + K8b for `image`, K10 (the Images tab + the banner), K13; then
   house-paint H1, H3 (image part), H4 (its sd.cpp files), H5–H7 for the AI photo. Its files leave the
   guard's known list.
4. **Round C · vision, whole:** K6, K8/K8b for `vision`, the Vision tab; house-paint H2, H3, H4 (SAM 3
   files), H5–H7 for the finder. Its files leave the list.
5. **Round D · jobs:** K9; house-paint on the kit's jobs.
6. **Round E · JustVoice J1** — its session, after the user's go; its files leave the list.
7. **P7 · house-paint release** — only when nothing is open; the installed app updates itself and keeps its
   files.

## Decisions for the user's word

- **D1 · sd-server resident instead of sd-cli per render** — reverses house-paint TASKS:1701-1705. Why:
  llama.cpp and audio.cpp are both resident servers; the arbiter + an idle unload give the 8 GB card back
  (the old reason for a process per render); progress and Cancel come from its API instead of its log.
  Cost, measured in P1: ~8 GB of RAM and ~90 MB of the card while loaded (CPU offload), until idle or
  evicted. DECIDED (the user's go, 2026-10-24), on `master-1004`.
- **D2 · `onnxruntime-node` stays the app's package, handed to kit code** — measured why the standard
  alternatives fail here (K6).
- **D3 · the guard's known-file list** — today's house-paint and JustVoice files printed, not failing,
  until their round; everything else fails from round A.
- **D4 · JustVoice's move (round E)** — message its session to do J1 after round C.
- **D5 · the "settings" help page's title** — one word family-wide: "Settings" (the template, docgen) or
  "App Settings" (house-paint's help page and nav link).
- **D6 · the other apps' guard findings** — send docgen's (CORS from every origin first) and JustVoice's
  to their sessions.

## Attack log

First round (before review):
1. *The items* — a separate kit code path per runtime would be a copy that drifts → K1 shares what is the
   same and leaves llama's specifics alone.
2. *How they interact* — one in-process ledger covers llm + image + vision in house-paint; cross-app
   sharing with JustVoice stays out of scope. `/v1/engines/*` would clash with JustVoice → K3 uses
   `/v1/ai/runtimes/*`. Reset/restore must stop sd-server or Windows keeps files locked → H3.
3. *My own claims* — sd-server in the release zip, its API reproducing the recipe, the CPU-offload flag:
   unverified → P1 first. "The models are on this machine" — false → P1 lists the downloads.
4. *The checker* — a "no pins in code" check would flag the seed files that ARE the standard → pins only
   in seed files. Static checks can't catch a hand-written fetch + unzip → said plainly; the plan check
   and the N list cover the planning side.
5. *Untouched neighbors* — JustWrite/docgen's catalog view → `kind=llm` default; the phone worker bundle
   → lazy imports + `.phone.js` stubs; docgen's FastAPI route parity → new routes are opt-in; backups
   already leave the cache out; kit i18n en/es.
6. *What a user sees* — no second 12 GB download (H4); a cache on another drive copies with progress; a
   downgrade after the move downloads again (said in What's new).
7. *A more standard option?* — one multi-engine server (llama-box, LocalAI, Ollama) would replace the
   family's own llama.cpp runner, against the standing decision; rejected.
8. *Cost and sequence* — guard checks failing mid-way → (revised below).

Fable's review (2026-10-24), each point attacked:
9. *"Too big as one piece; split into rounds"* — right; its split rebuilt the AI photo twice and left it
   without install screens → vertical rounds on a shared foundation (Order).
10. *"ONNX Runtime as an optional peer dependency"* — fails here, measured (K6) → the hand-off stays,
    with the reason written down.
11. *"Presets are chat-shaped"* — right, my design missed it → K8b.
12. *"Four stops, first not last"* — right with one change: failing outright from day one would block
    every house-paint and JustVoice commit during the move → the known-file list printed, not failing.

Second round (new angles):
13. *Re-keying `runner_binary`* would rewrite every family user's database at upgrade → K2 adds a table
    instead; one accessor keeps one code path.
14. *Designing the registry around sd.cpp alone* would not fit audio.cpp (slots, placements, eSpeak) and
    JustVoice's move would need a second design → K1 written against both, audio.cpp's real descriptor as
    a fixture.
15. *Who owns sd.cpp's pin* — llama.cpp's lives in the kit; "added to the kit like llama" means the same
    for sd.cpp and audio.cpp → the kit owns runtime pins, apps own model rows.
16. *JustVoice's DSP process* is another native process the guard would flag → on the known list, moved
    in J1.
17. *P1 on the user's data folder* would break the test-data rule → scratchpad only; the card is shared
    with JustVoice → message it first.
18. *sd-server's own web page* would expose model loading to anything on the machine → off (checked in
    P1).
19. A fresh angle — the boot splash, the AI tasks strip, the updater's quit, the uninstaller, QuickSetup:
    the image runtime is lazy (no warm-boot), renders go through `withAiTask`, the Windows job object
    kills sd-server with the app, the data folder survives an uninstall as today, QuickSetup stays chat.
    Nothing new.

The user, 2026-10-24: "should you do a better standard check and update the template … no shortcuts":
20. *The guard's other blind spots* — it passed house-paint with engines it can't see; what else can't it
    see? The full standards check above (F1–F8): two kit halves missing (the sync server, settings
    upgrades), a text helper, a held rename, a shared look in four places, the template's looks copied
    into every app, a stale skill. Each gets its kit fix, its template wiring and, where it can be stated
    mechanically, a guard check (a copied kit look, a stale skill).
21. *Is the audit itself complete?* — it covered every file not in the template, the patterns that betray
    a hand-roll, and the guard's whole list; the files that ARE the template's were covered by the guard's
    copy checks. What it can't see: a hand-roll written inside a house-painting file. The plan check (K12
    stop 2) and the reports naming the repo (stop 4) cover new work; nothing more found.

## Blast radius (greps, 2026-10-24)

```
## acquireRuntime / spawnChild / closeJob callers (all repos, src only)
just-core/packages/core/src/runner/binary.js:17:// probeArgvs})`, `acquireRuntime(cacheRoot, folder, build, binaries, hardware,
just-core/packages/core/src/runner/binary.js:1020:export async function acquireRuntime(
just-core/packages/core/src/runner/calibrate.js:333:    const [proc, job] = await processMod.spawnChild(this._popen, argv, logPath);
just-core/packages/core/src/runner/calibrate.js:370:      processMod.closeJob(job);
just-core/packages/core/src/runner/process.js:1151:export function _closeJob(job) {
just-core/packages/core/src/runner/process.js:1231:export async function _spawnChild(popen, argv, logPath = null, { _sleep = sleepS } = {}) {
just-core/packages/core/src/runner/process.js:1309:    self._closeJob(this.jobHandle);
just-core/packages/core/src/runner/process.js:1416:    const [proc, job] = await self._spawnChild(popen, [String(serverExe), ...flags], logPath);
just-core/packages/core/src/runner/process.js:1426:    self._closeJob(job); // a failed spawn's job dies with its child
just-core/packages/core/src/runner/process.js:1487:  const [proc, job] = await self._spawnChild(popen, [String(serverExe), ...argv], logPath);
just-core/packages/core/src/runner/process.js:1494:  self._closeJob(job); // a failed spawn's job dies with its child
JustVioce/server/src/audio/dsp_client.js:110:      process_.closeJob(this._job);
JustVioce/server/src/audio/dsp_client.js:119:    [this._proc, this._job] = await process_.spawnChild(popen, [exe, "--port", String(this._port)], lp);
JustVioce/server/src/audio/dsp_client.js:158:      process_.closeJob(this._job);
JustVioce/server/src/engines/audiocpp/runtime.js:341:  return binary.acquireRuntime(self._runtimeRoot(), FOLDER, release.cfg.TAG, release.binaries(), self._hardware(), {
JustVioce/server/src/engines/audiocpp/runtime.js:502:      const [proc, job] = await kitProcess.spawnChild(popen, [String(exe), "--config", confPath, "--no-ui"], logPath);
JustVioce/server/src/engines/audiocpp/runtime.js:580:    kitProcess.closeJob(run.job);

## arbiter callers
just-core/packages/core/src/llm/install.js:463:    const arb = runnerArbiter.getArbiter();
just-core/packages/core/src/llm/install.js:464:    arb.busyBegin("llm");
just-core/packages/core/src/runner/arbiter.js:116: * runner's singleton via `getArbiter()`). All VRAM in MiB.
just-core/packages/core/src/runner/arbiter.js:284:  releaseKind(kind) {
just-core/packages/core/src/runner/arbiter.js:352:  busyBegin(kind) {
just-core/packages/core/src/runner/arbiter.js:384:  async makeRoom(
just-core/packages/core/src/runner/arbiter.js:518:export function getArbiter() {
just-core/packages/core/src/runner/lifecycle.js:1182:    this._arbiter = arbiter != null ? arbiter : getArbiter();
just-core/packages/core/src/runner/lifecycle.js:2307:        this._arbiter.releaseKind("llm"); // full teardown → drop the AI models' bookings, not an app's speech slots
just-core/packages/core/src/runner/lifecycle.js:2789:    const made = await arb.makeRoom(want, {
just-core/packages/core/src/runner/lifecycle.js:3406:        this._arbiter.reserve(modelId, earlyCap > 0 ? Math.min(fit.vramMb, earlyCap) : fit.vramMb, {
just-core/packages/core/src/runner/lifecycle.js:3427:        this._arbiter.reserve(modelId, truedMb, {
just-core/packages/core/src/runner/lifecycle.js:3944:      (await arb.makeRoom(Math.max(0, vramMb - own) + foreign, {
JustVioce/server/src/api/engines_api.js:206:    arb = getArbiter();
JustVioce/server/src/engines/manager.js:108:    arb = arbiter.getArbiter();
JustVioce/server/src/engines/manager.js:112:  if (arb !== null) arb.busyBegin(kind);
JustVioce/server/src/engines/manager.js:833:      snap = await arbiter.getArbiter().snapshot(hw);
JustVioce/server/src/engines/manager.js:846:      const arb = arbiter.getArbiter();
JustVioce/server/src/engines/manager.js:870:      const committed = Math.max(0, total - (await arbiter.getArbiter().remainingMb(hw)));
JustVioce/server/src/engines/manager.js:1070:      const arb = arbiter.getArbiter();
JustVioce/server/src/engines/manager.js:1077:      await arb.makeRoom(total, { protectedKinds: ["tts", "stt"], hardware: hw, reason: `loading ${engineId}` });
JustVioce/server/src/engines/manager.js:1228:      arb = arbiter.getArbiter();
JustVioce/server/src/engines/manager.js:1266:    if (await arb.makeRoom(target, { exclude: `${kind}:${engineId}`, hardware: hw, reason: `loading ${engineId}` })) {
JustVioce/server/src/engines/manager.js:1434:        ai = ((await arbiter.getArbiter().snapshot(hw)).reservations || []).filter((r) => r.kind === "llm" && !r.asleep && !r.pinned);
JustVioce/server/src/engines/manager.js:1457:      arb = arbiter.getArbiter();
JustVioce/server/src/engines/manager.js:1462:    arb.reserve(`${kind}:${m.id}`, pyInt(mb), {
JustVioce/server/src/engines/manager.js:1561:      const arb = arbiter.getArbiter();
JustVioce/server/src/engines/manager.js:1622:      return pyInt(arbiter.getArbiter().reservedMb(key) || 0);
JustVioce/server/src/engines/manager.js:1632:      arb = arbiter.getArbiter();
JustVioce/server/src/synth_scheduler.js:260:      arb = arbiter.getArbiter();
JustVioce/server/src/synth_scheduler.js:264:    if (active) arb.busyBegin("tts");

## runner_binary / pinned_build / model_catalog writers+readers (kit)
just-core/packages/core/src/llm/db.js:16:  ["model_catalog", "mtp_builtin", "BOOLEAN NOT NULL DEFAULT 0"],
just-core/packages/core/src/llm/db.js:17:  ["model_catalog", "est_vram_mb", "INTEGER"],
just-core/packages/core/src/llm/db.js:18:  ["model_catalog", "block_count", "INTEGER NOT NULL DEFAULT 0"],
just-core/packages/core/src/llm/db.js:19:  ["model_catalog", "n_kv_heads", "INTEGER NOT NULL DEFAULT 0"],
just-core/packages/core/src/llm/db.js:20:  ["model_catalog", "head_count", "INTEGER NOT NULL DEFAULT 0"],
just-core/packages/core/src/llm/db.js:21:  ["model_catalog", "embedding_length", "INTEGER NOT NULL DEFAULT 0"],
just-core/packages/core/src/llm/db.js:22:  ["model_catalog", "expert_used_count", "INTEGER NOT NULL DEFAULT 0"],
just-core/packages/core/src/llm/db.js:23:  ["model_catalog", "expert_byte_share", "REAL NOT NULL DEFAULT 0"],
just-core/packages/core/src/llm/db.js:24:  ["model_catalog", "kv_windowed_bytes_per_token", "REAL NOT NULL DEFAULT 0"],
just-core/packages/core/src/llm/db.js:25:  ["model_catalog", "kv_global_bytes_per_token", "REAL NOT NULL DEFAULT 0"],
just-core/packages/core/src/llm/db.js:26:  ["model_catalog", "sliding_window", "INTEGER NOT NULL DEFAULT 0"],
just-core/packages/core/src/llm/db.js:27:  ["model_catalog", "exps_bytes", "INTEGER NOT NULL DEFAULT 0"],
just-core/packages/core/src/llm/db.js:28:  ["model_catalog", "layers_nonexp_bytes", "INTEGER NOT NULL DEFAULT 0"],
just-core/packages/core/src/llm/db.js:29:  ["model_catalog", "output_bytes", "INTEGER NOT NULL DEFAULT 0"],
just-core/packages/core/src/llm/db_schema.js:121:    "name": "model_catalog",
just-core/packages/core/src/llm/db_schema.js:122:    "ddl": "CREATE TABLE model_catalog (\n\tid VARCHAR NOT NULL, \n\tname VARCHAR NOT NULL, \n\thf_repo VARCHAR NOT NULL, \n\tquant
just-core/packages/core/src/llm/db_schema.js:796:    "name": "runner_binary",
just-core/packages/core/src/llm/db_schema.js:797:    "ddl": "CREATE TABLE runner_binary (\n\tplatform VARCHAR NOT NULL, \n\tgpu VARCHAR NOT NULL, \n\tsource VARCHAR NOT NULL, \n\ta
just-core/packages/core/src/llm/identity.js:259: * Read `ggufPath`'s GGUF header → set `model_catalog` `type`/`mtp_builtin`/`trained_ctx` +
just-core/packages/core/src/llm/install_core.js:60:      if (modelCatalogExtra?.length) seed.seedExtraCatalog(handle, modelCatalogExtra);
just-core/packages/core/src/llm/runner_config_api.js:111: * resetToDefaults()} — the host's runner_binary + runner_setting persistence. */
just-core/packages/core/src/llm/runner_config_api.js:122:      store.setSetting("pinned_build", pb);
just-core/packages/core/src/llm/seed.js:191:// `applies_to`: `all` (every model) | `moe`/`dense` (matches `model_catalog.type`) | `mtp`
just-core/packages/core/src/llm/seed.js:320:  const catalog = new Map(h.all("select * from model_catalog", [], "model_catalog").map((r) => [r.id, r]));
just-core/packages/core/src/llm/seed.js:392:  const catalogIds = new Set(h.all("select id from model_catalog").map((r) => r.id));
just-core/packages/core/src/llm/seed.js:412:  { key: "pinned_build", value: c.DEFAULT_PINNED_BUILD },
just-core/packages/core/src/llm/seed.js:643: * One catalog seed object → a model_catalog row. Shared by the built-in seed and the
just-core/packages/core/src/llm/seed.js:644: * per-APP extra rows (`seedExtraCatalog`) so the field mapping — including the Gemma-style
just-core/packages/core/src/llm/seed.js:647:function catalogRow(cr, builtIn) {
just-core/packages/core/src/llm/seed.js:775:  if (Object.keys(set).length) h.update("model_catalog", set, { id });
just-core/packages/core/src/llm/seed.js:779:  const existing = new Map(h.all("select * from model_catalog", [], "model_catalog").map((r) => [r.id, r]));
just-core/packages/core/src/llm/seed.js:802:    h.insert("model_catalog", catalogRow(cr, true));
just-core/packages/core/src/llm/seed.js:816:export function seedExtraCatalog(h, rows) {
just-core/packages/core/src/llm/seed.js:817:  const existing = new Map(h.all("select * from model_catalog", [], "model_catalog").map((r) => [r.id, r]));
just-core/packages/core/src/llm/seed.js:830:    h.insert("model_catalog", catalogRow(cr, false));
just-core/packages/core/src/llm/seed.js:1054:    .all("select platform, gpu from runner_binary where built_in is 1")
just-core/packages/core/src/llm/seed.js:1056:  const existing = new Set(h.all("select platform, gpu from runner_binary").map((r) => `${r.platform}\u0000${r.gpu}`));
just-core/packages/core/src/llm/seed.js:1060:    h.insert("runner_binary", {
just-core/packages/core/src/llm/seed.js:1074:  for (const r of retired) h.delete("runner_binary", { platform: r.platform, gpu: r.gpu });
just-core/packages/core/src/llm/seed.js:1294:    if (truthy(app.model_catalog_extra)) seedExtraCatalog(h, app.model_catalog_extra);
just-core/packages/core/src/llm/stores.js:337:      .all("select * from model_catalog order by position, id", [], "model_catalog")
just-core/packages/core/src/llm/stores.js:384:      if (h.get("model_catalog", row.id)) h.update("model_catalog", vals, { id: row.id });
just-core/packages/core/src/llm/stores.js:385:      else h.insert("model_catalog", { id: row.id, ...vals });
just-core/packages/core/src/llm/stores.js:386:      return catalogToWire(h.get("model_catalog", row.id), samplersOf(h, row.id));
just-core/packages/core/src/llm/stores.js:393:      if (!h.get("model_catalog", modelId)) return;
just-core/packages/core/src/llm/stores.js:395:      h.delete("model_catalog", { id: modelId });
just-core/packages/core/src/llm/stores.js:404:        h.delete("model_catalog", { id: cid });
just-core/packages/core/src/llm/stores.js:417:    const existing = h.get("model_catalog", modelId);
just-core/packages/core/src/llm/stores.js:419:    h.update("model_catalog", { type: modelType }, { id: modelId });
just-core/packages/core/src/llm/stores.js:455:      const ex = h.get("model_catalog", modelId);
just-core/packages/core/src/llm/stores.js:479:      h.update("model_catalog", vals, { id: modelId });
just-core/packages/core/src/llm/stores.js:874:      if (h.get("runner_binary", key)) {
just-core/packages/core/src/llm/stores.js:875:        h.update("runner_binary", vals, key);
just-core/packages/core/src/llm/stores.js:878:      const positions = h.all("select position from runner_binary").map((r) => r.position);
just-core/packages/core/src/llm/stores.js:880:      h.insert("runner_binary", { ...key, position, ...vals });
just-core/packages/core/src/llm/stores.js:927:      for (const b of c.DEFAULT_BINARIES) h.delete("runner_binary", { platform: b.platform, gpu: b.gpu });
just-core/packages/core/src/llm/stores.js:930:        ["pinned_build", c.DEFAULT_PINNED_BUILD],
just-core/packages/core/src/llm/stores.js:1625: * Build the bundled runner's RunnerConfig from the DB (runner_binary + runner_setting) —
just-core/packages/core/src/llm/stores.js:1633:  const bins = h.all("select * from runner_binary order by position, platform", [], "runner_binary").map((b) => ({
just-core/packages/core/src/llm/stores.js:1664:    llamacpp: { pinnedBuild: get("pinned_build") || c.DEFAULT_PINNED_BUILD, binaries: bins },
just-core/packages/core/src/llm/switch_presets_api.js:9:// `appliesTo`: `all` (every model) · `moe`/`dense` (matches `model_catalog.type`) · `mtp`
just-core/packages/core/src/llm/switch_resolve.js:84:  const model = h.get("model_catalog", modelId);
just-core/packages/core/src/platform/data_api.js:73:export const RUNNER_MACHINE_TABLES = Object.freeze(["runner_binary"]);
just-core/packages/core/src/platform/data_api.js:80:  runner_setting: Object.freeze({ column: "key", values: Object.freeze(["pinned_build", "calib_model_url", "calib_model_sha256",
just-core/packages/core/src/platform/data_api.js:668: *                      default the runner's engine builds (`runner_binary`): a backup's rows there name
just-core/packages/core/src/runner/config.js:8://   * the host (`installLlm`) seeds them into the DB (`runner_binary` / `runner_setting`)
just-core/packages/core/src/runner/config.js:37:// Seeding is insert-if-missing, so an EXISTING DB keeps its old `pinned_build` row — bump it
just-core/packages/core/src/runner/config.js:154:// The rows keep Python's snake_case keys: they are seed DATA mapped onto `runner_binary`

## feature catalog / routing / presets consumers (apps + template)
just-house-paint/server/src/app.js
just-house-paint/server/src/feature_catalog.js
just-house-paint/server/src/services.js
JustVioce/server/src/api/capture_readiness_api.js
JustVioce/server/src/app.js
JustVioce/server/src/book_run.js
JustVioce/server/src/engines/llm/run.js
JustVioce/server/src/feature_catalog.js
justwrite-app/server/src/app.js
justwrite-app/server/src/feature_catalog.js
justwrite-app/server/src/phone.js
just_ai_i18n_docgen/server/src/app.js
just-core/template/server/src/app.js
just-core/template/server/src/feature_catalog.js

## house-paint engine module importers
just-house-paint/server/src/aiphoto_service.js:16:import { aiRepaint as realRepaint } from "./aiphoto/edit.js";
just-house-paint/server/src/aiphoto_service.js:17:import { ENGINE_RELEASES, engineFiles, ensureEngine as realEnsureEngine, ensureModels as realEnsureModels, MODEL_FILES, 
just-house-paint/server/src/aiphoto_service.js:18:import { SdCliError } from "./aiphoto/sdcli.js";
just-house-paint/server/src/aiphoto_service.js:90: * `ctx`: { dataDir, engineDir, modelDir, finder (releaseGpu), stopLocalModel() → frees the kit's
just-house-paint/server/src/aiphoto_service.js:189:     *  computer's engine zips (aiphoto/engine.js `ensureEngine`'s `.downloads`) while the engine isn't here. The
just-house-paint/server/src/aiphoto_service.js:229:      await ctx.finder.releaseGpu();
just-house-paint/server/src/aiphoto_service.js:230:      await ctx.stopLocalModel();
just-house-paint/server/src/api/engines_api.js:9:import { assertGpuFree } from "../jobs.js";
just-house-paint/server/src/api/engines_api.js:18:import { MODEL_FILES as FINDER_FILES } from "../segment/models.js";
just-house-paint/server/src/api/engines_api.js:191:    assertGpuFree(ctx.jobs, "aiphoto", house.id);
just-house-paint/server/src/api/parts_api.js:21:import { assertGpuFree } from "../jobs.js";
just-house-paint/server/src/api/parts_api.js:108:    assertGpuFree(ctx.jobs, "find-parts", house.id);
just-house-paint/server/src/api/parts_api.js:227:    assertGpuFree(ctx.jobs, "box");
just-house-paint/server/src/api/schemes_ai_api.js:20:import { assertGpuFree } from "../jobs.js";
just-house-paint/server/src/api/schemes_ai_api.js:47:    if (local) assertGpuFree(ctx.jobs, "local-ai");
just-house-paint/server/src/database/seed.js:15:import { DEFAULT_PART_PRIORITY } from "../finder.js";
just-house-paint/server/src/data_admin.js:117:    await Promise.race([state.finder?.releaseGpu(), new Promise((r) => setTimeout(r, 30_000).unref?.())]);
just-house-paint/server/src/finder.js:10:// before the AI photo runs (releaseGpu).
just-house-paint/server/src/finder.js:20:import { ensureModels, MODEL_FILES } from "./segment/models.js";
just-house-paint/server/src/finder.js:156:    idleTimer = setTimeout(() => releaseGpu().catch(() => {}), ctx.idleMs());
just-house-paint/server/src/finder.js:227:    const create = ctx.createSegmenter || (await import("./segment/segmenter.js")).createSegmenter;
just-house-paint/server/src/finder.js:258:  async function releaseGpu() {
just-house-paint/server/src/finder.js:282:      await releaseGpu();
just-house-paint/server/src/finder.js:324:    releaseGpu,
just-house-paint/server/src/jobs.js:33:   *  AI model to free the card, waits for it (assertGpuFree). */
just-house-paint/server/src/jobs.js:159:const GPU_KINDS = ["find-parts", "aiphoto"];
just-house-paint/server/src/jobs.js:170:export function assertGpuFree(jobs, kind, key = "") {
just-house-paint/server/src/jobs.js:175:    if (j.state !== "running" || !GPU_KINDS.includes(j.kind)) continue;
just-house-paint/server/src/services.js:19:import { bestDmlAdapter, createFinder, DEFAULT_PROVIDERS } from "./finder.js";
just-house-paint/server/src/services.js:21:import { JobRegistry } from "./jobs.js";
just-house-paint/server/src/services.js:36:async function stopLocalModel() {
just-house-paint/server/src/services.js:74:      stopLocalModel,
just-house-paint/server/src/services.js:76:        // a number: the target pixel count (aiphoto/edit.js sizes the photo to it)
just-house-paint/src/pages/ColorsPage.test.js:6:// real one's shapes (server/src/api/paints_api.js, settings_api.js, jobs.js). It proves: the seven
just-house-paint/src/pages/ColorsPage.test.js:46:// the job's snapshot (server/src/jobs.js snapshot())
just-house-paint/src/pages/ColorsPage.test.js:140:/** A server job polls every 400 ms (services/jobs.js): let the clock run. */
just-house-paint/src/pages/HousePage.test.js:212:/** A server job polls every 400 ms (services/jobs.js): let the clock run. */
just-house-paint/src/pages/HousePage.vue:7:// engine's download, the AI photo — runs as server jobs on the task strip (services/jobs.js).
just-house-paint/src/stores/engines.js:7:import { runServerJob } from "../services/jobs.js";
just-house-paint/src/stores/house.js:12:import { jobEndedAway, runServerJob } from "../services/jobs.js";
just-house-paint/src/stores/house.js:202:    /** `describe(job, percent)` words its progress (the part being found) — see services/jobs.js;
just-house-paint/src/stores/houseStores.test.js:42:const { jobError, runServerJob } = await import("../services/jobs.js");
just-house-paint/src/stores/houseStores.test.js:76:    const { jobEndedAway } = await import("../services/jobs.js");
just-house-paint/src/stores/paints.js:7:import { runServerJob } from "../services/jobs.js";

## house-paint settings keys that would move
just-house-paint/server/src/database/seed.js:45:  "finder.useGpu": true,
just-house-paint/server/src/database/seed.js:46:  "finder.idleMinutes": 10,
just-house-paint/server/src/database/seed.js:60:  "aiphoto.sharedGpuNoteMb": 1024,
just-house-paint/server/src/database/seed.js:61:  "aiphoto.templates": { ...DEFAULT_PROMPT_TEMPLATES },
just-house-paint/server/src/schemas/settings.js:57:  "finder.useGpu": T.Boolean(),
just-house-paint/server/src/schemas/settings.js:58:  "finder.idleMinutes": T.Integer({ minimum: 1, maximum: 240 }),
just-house-paint/server/src/schemas/settings.js:74:  "aiphoto.sharedGpuNoteMb": T.Integer({ minimum: 0, maximum: 1024 * 1024 }),
just-house-paint/server/src/schemas/settings.js:75:  "aiphoto.templates": T.Record(T.String({ maxLength: 40 }), T.String({ maxLength: 2000 }), { maxProperties: 40 }),
just-house-paint/server/src/services.js:55:        return { ...DEFAULT_PROVIDERS, image: setting("finder.useGpu") ? "auto" : "cpu" };
just-house-paint/server/src/services.js:61:      idleMs: () => setting("finder.idleMinutes") * 60_000,
just-house-paint/server/src/services.js:79:        templates: () => setting("aiphoto.templates"),
just-house-paint/server/src/services.js:112:        const floor = setting("aiphoto.sharedGpuNoteMb");
just-house-paint/src/components/settings/AdvancedSection.vue:17:const KEYS = ["finder.parts", "finder.priority", "schemes.roleParts", "schemes.harmony", "paints.colorOrde
just-house-paint/src/components/settings/GeneralSection.test.js:33:  "finder.useGpu": true,
just-house-paint/src/components/settings/GeneralSection.test.js:34:  "finder.idleMinutes": 10,
just-house-paint/src/components/settings/GeneralSection.test.js:38:  "aiphoto.sharedGpuNoteMb": 1024,
just-house-paint/src/components/settings/GeneralSection.test.js:43:  "aiphoto.templates": { single: "Paint the {surface}" },
just-house-paint/src/components/settings/GeneralSection.vue:22:  ["finder", [["finder.useGpu", "toggle"], ["finder.idleMinutes", "number"], ["finder.houseMargin", "number
just-house-paint/src/components/settings/GeneralSection.vue:23:  ["aiphoto", [["aiphoto.workingPixels", "number"], ["aiphoto.sharedGpuNoteMb", "number"]]],

## JustVoice job channel + /v1/jobs
JustVioce/server/src/api/engines_models_api.js:167:  app.get("/v1/jobs/:job_id", (c) => {
JustVioce/server/src/api/engines_models_api.js:175:  app.delete("/v1/jobs/:job_id", (c) => {
JustVioce/server/src/api/speech_runtime_api.js:144:  /** Start the Japanese dictionary's download; poll /v1/jobs/{job_id}. */
JustVioce/server/src/installer.js:6:// runs as a background task. Progress is observable via `GET /v1/jobs/{job_id}`.
JustVioce/server/src/installer.js:30:// DELETE /v1/jobs/{id} endpoint signal it without touching internals.
JustVioce/src/services/mock/speechEnginesMock.js:255: * install/download is a job polled at /v1/jobs/{id}; a load is one request. MOSS-TTSD's load on
JustVioce/src/services/ttsJobChannel.js:4:// GET /v1/jobs/{id} → DELETE /v1/jobs/{id} — IS the kit's channel contract
JustVioce/src/services/ttsJobChannel.js:36: *  download (gap 7) polls /v1/jobs/{id} exactly like an engine install. */
JustVioce/src/services/ttsJobChannel.js:49:    fetch: () => api.request(`/v1/jobs/${jobId}`),
JustVioce/src/services/ttsJobChannel.js:62:      if (jobId) await api.request(`/v1/jobs/${jobId}`, { method: "DELETE" });
JustVioce/src/services/ttsJobChannel.js:81:// A load is NOT a job: there is no `/v1/jobs/{id}` to poll, so the request's own
just-house-paint/server/src/api/jobs_api.js:2:// /v1/jobs/:id — what a long job is doing (the screen polls it inside the kit's withAiTask), and
just-house-paint/server/src/api/jobs_api.js:15:  app.get("/v1/jobs/:id", input({ params: IdParams }), (c) => {
just-house-paint/server/src/api/jobs_api.js:32:  app.delete("/v1/jobs/:id", input({ params: IdParams }), (c) => {
just-house-paint/server/src/jobs.js:3:// screen polls (`GET /v1/jobs/:id`) inside the kit's `withAiTask`, so the family's task strip shows
just-house-paint/src/pages/ColorsPage.test.js:5:// installs it — against a stand-in server answering /v1/brands, /v1/settings and /v1/jobs in the
just-house-paint/src/pages/HousePage.test.js:98:  if (p === "/v1/jobs/j-ai" && server.holdAi) return Promise.resolve(json({ id: "j-ai", kind: "aiphoto", key: "h1", state:
just-house-paint/src/pages/HousePage.test.js:99:  if (p === "/v1/jobs/j-ai") return Promise.resolve(json({ id: "j-ai", kind: "aiphoto", key: "h1", state: "done", progress
just-house-paint/src/pages/HousePage.test.js:144:  if (p === "/v1/jobs/j-install") {
just-house-paint/src/pages/HousePage.test.js:148:  if (p === "/v1/jobs/j-find" && server.holdFind) return Promise.resolve(json({ id: "j-find", state: "running", progress:
just-house-paint/src/pages/HousePage.test.js:149:  if (p === "/v1/jobs/j-find") {
just-house-paint/src/services/jobs.js:3:// then `GET /v1/jobs/:id` until it ends — inside the kit's `withAiTask` (app-structure §8, the
just-house-paint/src/services/jobs.js:55:      return await get(`/v1/jobs/${encodeURIComponent(id)}`);
just-house-paint/src/services/jobs.js:83:    task.signal.addEventListener("abort", () => del(`/v1/jobs/${encodeURIComponent(job.id)}`).catch(() => {}), { once: true });
just-house-paint/src/stores/house.js:197:     *  window reloaded, or in another window: [job snapshot…], as `GET /v1/jobs/:id` answers each. */
just-house-paint/src/stores/houseStores.test.js:55:    answer("GET /v1/jobs/j1", () => {
just-house-paint/src/stores/houseStores.test.js:63:    answer("GET /v1/jobs/j2", () => {
just-house-paint/src/stores/houseStores.test.js:68:    answer("GET /v1/jobs/j3", () => {
just-house-paint/src/stores/houseStores.test.js:84:    answer("GET /v1/jobs/j1", () => (++n < 4 ? { id: "j1", state: "running", progress: n / 4 } : { id: "j1", state: "do
just-house-paint/src/stores/houseStores.test.js:110:    answer("GET /v1/jobs/j1", () => (++n < 2 ? { id: "j1", state: "running", progress: 0.5 } : { id: "j1", state: "don

## kit renderer: model-catalog / engine components consumers in apps
just-house-paint/src/components/settings/settingsSections.test.js
just-house-paint/src/pages/AiPage.vue
just-house-paint/src/pages/SettingsPage.vue
JustVioce/src/boot/jv.js
JustVioce/src/components/QuickSetup.vue
JustVioce/src/components/SpeechEnginesTab.vue
JustVioce/src/composables/useAnalyzeModel.js
JustVioce/src/layouts/MainLayout.vue
JustVioce/src/pages/AiPage.vue
JustVioce/src/pages/SettingsPage.vue
JustVioce/src/services/native.js
JustVioce/src/services/ttsJobChannel.js
JustVioce/src/services/vramFeed.js
JustVioce/src/services/vramFeed.test.js
justwrite-app/src/components/providerScope.test.js
justwrite-app/src/components/useCatalogMeta.contract.test.js
justwrite-app/src/components/WritingAiSettings.vue
justwrite-app/src/pages/AiPage.vue
justwrite-app/src/pages/SettingsPage.vue
justwrite-app/src/phone/worker-bundle/server-worker.js
justwrite-app/src/services/engineGateLoad.test.js
justwrite-app/src/services/loadTaskAdapter.test.js
justwrite-app/src/services/modelApply.test.js
justwrite-app/src/services/providerBackend.js
justwrite-app/src/services/useDownloadTask.test.js
justwrite-app/src/stores/ai.js
just_ai_i18n_docgen/src/pages/AiPage.vue
just-core/template/src/components/kitControls.test.js
just-core/template/src/components/settings/settingsSections.test.js
just-core/template/src/pages/AiPage.vue
just-core/template/src/pages/SettingsPage.vue
```
