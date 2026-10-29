# IDEAS — the backlog (just-core: kit + shared server)

The holding pen for unscheduled ideas about the shared stack — same charter as JW's
`docs/dev/IDEAS.md`. Adding an idea is never starting it. Committed work lives in
`docs/dev/TASKS.md`. Newest at the top; date each one.

---

- **2026-10-28 · A vision model's speed on its chip, and the runtimes' band lines on the AI page.** The kit rates
  a runtime model by `fit.coarseFit` + `fit.rateSpeed` in its kind's unit, from the ledger or its `ref_speed`
  (`DEFAULT_RUNTIME_BANDS` has `image` only: seconds per image). A vision model (SAM 3) has no unit, no bands and
  records no measurement, so its chip says "Fits" and no speed. A unit (seconds per photo encoded?), its bands,
  `RuntimeService.withModel` recording through `recordSpeed`, and the seeded `band_*:image` / `band_*:vision` rows
  editable on the AI page (the chat bands are, on the engine settings) would give it one. Seen while checking round C.

- **2026-10-20 · Several windows in the template.** just-house-paint now counts each window's changes
  apart (its server/src/changes.js, `X-Client-Id` — installLlmUi `sendClientId`), answers `GET
  /v1/sync/rev` so the kit's watchSync re-reads the open page, and versions what two windows could save
  over each other (ETag / If-Match / 412, JSON Merge Patch for per-part maps). The template's notes have
  the same lost update (two windows saving one note). The counter is the kit's since 2026-10-24
  (`platform/window_changes.js`, the UI kit's `watchOtherWindows` — the engines plan's F1; the template
  wires it); what is left is giving the template's notes an If-Match.

- **2026-10-19 · The kit's leftover-engine sweep (JustVoice's `engines/leftovers.js` for llama-server).**
  A failed warm start now offers the app's Troubleshooting page (BootModelLoad's default `#failed`).
  JustVoice also finds and stops ITS engines left by an earlier server. For the kit's llama-server:
  on Windows the kill-on-close job ends it with its server however the server dies (process.js), so a
  leftover there has a live parent and must not be touched; on macOS and Linux a server killed hard
  leaves its llama-server running. The sweep would find llama-server processes whose command line
  names THIS app's runtime root (`--models-preset <root>/models.ini` — the binary's path is the
  shared cache's, the same for every app) and whose server is gone, at start and from the splash.
  ~400 lines of process-table code per platform (CIM, /proc, ps) — worth it once a Mac or Linux
  user hits it.

- **2026-08-04 · Unadopted llama.cpp adoption candidates** from the 2026-07-14
  review (`docs/llama-cpp-watch.md` review log): b9986 reasoning-leak fix · b9974
  CUDA no-free-VRAM query · b9905 quantized KV for DeepSeek-V4 · b9967 null
  sampling params · b9910/b9964 spec-decode fixes. None forces a change; adopt
  opportunistically at the next pin bump.
- **2026-08-04 · `_ENGINE_UNSUPPORTED_ARCHS` is an append-list ritual**
  (`llm_runner/runner/models.py:190-197`) — "add a line when a new unsupported arch
  surfaces" has no reminder anywhere; consider a check that flags catalog rows whose
  arch the pinned engine can't load.

- **2026-08-13 · The MTP-variant repo steer** — from the fit checkpoint: when an
  inspected repo's header carries NO MTP heads but the SAME publisher ships a
  `<name>-MTP-GGUF` sibling whose files do (the unsloth two-variant convention,
  verified by header walks), the Add form should SAY SO and offer the sibling
  repo — "this repo ships MTP-stripped files; the same publisher ships an
  MTP-preserved variant" — instead of the tier-C borrow treating the sibling as
  a drafter source (now size-guarded to prevent the 18 GB-draft footgun). Needs
  one extra header probe at inspect + a panel line + the swap affordance.

