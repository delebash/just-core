# llama.cpp upstream watch — review ledger

**Purpose.** A durable anchor + running log so "check llama.cpp since our last
update" has a precise starting point and a place to record findings. This is the
*adoption* watch — "what changed upstream that's worth pulling into our adapter /
config / knob code" — NOT the in-app binary-bump check, which already exists
(see below). Manual by design (2026-07-14 decision: ledger-only, user-driven).

## How to use

Say **"check llama.cpp since our last update"**. The reviewer (me) then:
1. Reads the **Last reviewed** tag below (the `since` anchor).
2. Pulls the release notes between that tag and the latest upstream tag.
3. Runs the **Review checklist** against them and flags anything worth adopting.
4. Appends a row to the **Review log** and bumps **Last reviewed**.

**How the reviewer reaches upstream (verified 2026-07-14).** The block is GitHub
**repo-scoping**, not the network policy: `curl`, the `api.github.com` REST path,
and the scoped GitHub MCP all return **403** for `ggml-org` (the proxy injects a
token scoped to the delebash repos — `api.github.com` root is 200, the ggml-org
path is 403; `_fetch_latest_llamacpp_tag` in `llm_runner/runner/lifecycle.py` predates this finding). **But the
WebFetch tool reads the releases page fine** — it routes through Anthropic's fetch
infra, bypassing that github proxy — so the review CAN run from this environment:
- `WebFetch https://github.com/ggml-org/llama.cpp/releases` — newest ~10 builds;
  page older windows with `?page=2`, `?page=3`, … back to the `since` tag.
- `.../compare/<since>...<latest>` lists raw commits (finer-grained, much longer).
- The runner's *own* in-app check (`_fetch_latest_llamacpp_tag`, plain `requests`) still needs
  the user's box — it goes through the local proxy, so it 403s here.

**On the author's Windows box (verified 2026-09-19) everything is reachable directly** — the
403 above is the dev container's proxy, not GitHub. The method that reviewed 1,064 commits in
one sitting:
- `gh api repos/ggml-org/llama.cpp/releases/latest` and `…/releases?per_page=100&page=N` (the
  `gh` login gives 5,000 requests/hour; unauthenticated is 60).
- **Every commit title in the window, with its build tag:** a treeless clone (commits only, a
  few MB) in a scratch dir —
  `git clone --filter=tree:0 --no-checkout --single-branch --branch master https://github.com/ggml-org/llama.cpp`
  then `git log --reverse --format='%D|%ad|%s' --date=short <since>..HEAD`. Build number =
  commit count, so `bNNNN` decorates the commit. Read them ALL; titles such as "various bug
  fixes" hide things, so open the PR for anything near our surfaces.
- **Any file at any tag:** `curl -sfL https://raw.githubusercontent.com/ggml-org/llama.cpp/<tag>/<path>`.
  The files this review leaned on: `common/arg.cpp` (every flag), `common/preset.cpp`
  (`models.ini` keys), `tools/server/server-common.cpp` (request parsing),
  `tools/server/server-models.cpp` (router), `src/llama-model-loader.cpp`, `src/llama-model.cpp`,
  `src/llama-kv-cache-iswa.cpp`, `common/common.h`.
- `gh api repos/ggml-org/llama.cpp/pulls/<n> --jq '.title, .merged_at, .body'` for a PR's own
  words; `…/releases/tags/<tag> --jq '.assets[].name'` for the real download names.
- Upstream now writes **curated notes** on each stable release (`v0.4.0`, `v0.4.1`: API
  changes · New models · Core · Server). Read them, but they are not a substitute for the
  commit list — the flag removal that breaks us was one line in them.

## Current state

- **Pinned build:** `b11239` — `DEFAULT_PINNED_BUILD` in `packages/core/src/runner/config.js`
  (line anchors in this doc went stale once — cite the SYMBOL, grep for the line).
  Moved from `b10750` on **2026-09-28**. User: *"go draft the comment and close it do 1 and 3
  as well"*; item 1 = move the pin to head.
  - **Why:** a re-measure through the chat template found no MTP regression at b10751 or at
    head. The b10750 reason came from ONE raw `/completion` prompt (plan §10; the review log).
  - **Verified:** all seven filenames against `gh api releases/tags/b11239` on 2026-09-28.
    Three were renamed since b10750: win `cuda-13.3` → `13.4`, win and ubuntu `rocm-7.14` →
    `rocm-10.0`.
  - **The live DBs still pin `b10750`,** because seeding is insert-if-missing. Moving the
    running apps is a separate step.

  Previous pin, kept as the record: **`b10750`**, bumped from `b9993` on **2026-09-19**
  (user: *"go pin b10750"*) after this review, a box test and a bisect. The reasoning then:
  b10750 is the LAST BUILD
  BEFORE `b10751` broke MTP speculative decoding (the warning at the top of the watch
  list). On the flagship it runs at **1.028 ×** the author's b10437 with the MTP draft, is
  output-EXACT, and produces byte-identical text to b10437 — and unlike b10437 it has an
  asset for EVERY platform row (it is past the b10398-b10581 Linux-AMD hole, which is why
  the faster-looking b10437 could never be the pin). All seven filenames re-verified
  against `gh api releases/tags/b10750` on 2026-09-19. Earlier: `b9899` → `b9993`
  2026-07-14 (Unit 2 engine bump).
  **The build on the author's disk is `b10437`** (installed through the in-app update on
  2026-08-15, the day upstream published it, while the check still worked) — every
  September 2026 measurement (speed truth, vram truth) is on that build. Both app DBs
  held the old pin `b9993` until the user updated them both to `b10750` on 2026-09-20, so
  pin and disk now agree in both apps. (`DEFAULT_PINNED_BUILD` only ever reaches fresh
  installs and "reset to defaults", never an existing database - that is why they diverged.)
- **Upstream changed its release scheme on 2026-08-21.** Every `bNNNN` build is now a
  **prerelease**; stable versions are semver tags (`v0.2.0` → `v0.4.1`), each carrying one
  asset, `nightly-tag.txt`, that names its build (`v0.4.1` → `b10964`). Upstream: `vX.Y.Z` =
  "stable … recommended for downstream distribution"; `b[NUM]` = "bleeding edge". The binaries
  still live on the `bNNNN` release.
- **The in-app binary-bump check was DEAD from 2026-08-21 — FIXED 2026-09-19.**
  `_fetch_latest_llamacpp_tag()` (`releases/latest`) answered `"v0.4.1"`, `binary.build_num`
  stripped that to `41`, and `41 > 10437` is false — so `update_check` reported "current"
  with no error and the Update button never rendered. Reproduced with the app's own
  functions, then fixed: `_fetch_latest_llamacpp_release()` follows the stable channel
  (tag → `nightly-tag.txt` → build) and `build_num` is STRICT, so a semver tag can never
  read as a build. Verified live: `{"latest":"b10964","latestStable":"v0.4.1",
  "updateAvailable":true}`. Plan + execution record:
  `docs/plans/2026-09-19-engine-update-safety-and-stable-channel.md`. That check answers "is
  there a newer binary"; THIS ledger answers "is there anything worth adopting in our code".

## Watch list — forward-looking (not-yet-merged upstream we're tracking)

Distinct from the retrospective "Adoption candidates" below: things NOT yet in a
pinnable build that we want to be told about the moment they land.

- **An opt-out for the machine-wide config file (added 2026-09-19).** Since `b10398` (#26118)
  every llama.cpp program reads `%PROGRAMDATA%\llama.cpp\config.ini` and
  `%APPDATA%\llama.cpp\config.ini` (`/etc/llama.cpp/config.ini`, `~/.config/llama.cpp/config.ini`)
  at the lowest precedence. There is **no flag or env var to disable it** (`b10437`, `b11056`
  source). Our launches inherit anything in it that we do not pass ourselves — an `api-key`
  line would 401 every request. The kit logs each one it finds when the router starts (2026-10-29,
  `process.js` `llamaConfigFiles`). **Watch for:** an opt-out; then pass it.

## Baseline — capabilities we already rely on (as of the b9899 pin)

Verified against upstream builds in code (so a reviewer knows what's already adopted):

- **b9644** — `POST /models/load` is asynchronous (2xx accepts; child loads in the
  background); per-model status is nested at `data[].status.value`; server-side
  `{"type":"json_schema","schema":…}` structured output; auto-offload of an
  over-fit model. Refs: `lifecycle.py:57,171,191,200,1722,1786`, `prompts.py:350`,
  `process.py:90,94,133`.
  **CORRECTION 2026-09-19 — the structured-output clause is WRONG for `b9993`+.** The server
  README documents that flat form, but `tools/server/server-common.cpp` (identical at `b9993`,
  `b10437`, `b10964`) reads a `json_schema` schema ONLY from the nested OpenAI form
  (`response_format.json_schema.schema`); the flat `schema` key is honoured only for
  `type: "json_object"`. **Observed** on `b10437`: flat = not enforced (the model answered with
  weather fields), nested = enforced. Our adapter (`openai_compat._adapt_response_format`)
  flattens on purpose, so every schema-carrying action runs unconstrained on the local engine
  today — one seeded action on the author's DBs (JustWrite `entitySweep`). Fix = Slice 0 of
  `docs/plans/2026-09-19-engine-update-safety-and-stable-channel.md`.
- **The loading flags moved (recorded 2026-09-19).** `--load-mode` arrived at `b10105`
  (#20834) with `none|mmap|mlock|dio`; `b10145` (#26135) added `mmap+mlock` and made `mlock`
  mean lock WITHOUT mmap; `auto` became the default around `b10369` (#26081); `b10875`
  (#28334) **deleted** `--mlock`, `--mmap`/`--no-mmap`, `--direct-io`. From `b10105` the legacy
  flags ASSIGN one mode each — beside one another "only the last flag … will take effect" —
  so on `b10437` our `--mlock --no-mmap` pair is just `none`, and `--mlock` alone is no longer
  mmap + lock. Full table + the emit mapping: that plan's §3.3.
- **b9870** — tensor-placement behavior our launch profile assumes; ctx is always
  emitted (ctx policy is ours). Refs: `openai_compat.py:108`, `process.py:112`.
- **Sampler order** — our `DEFAULT_SAMPLER_ORDER` tracks llama.cpp's 9-name set
  (penalties + `top_n_sigma` included).
- Build-tag parsing (`"b9929" → 9929`): `llm_runner/runner/binary.py:101`.
- **b9982 (adopted at the b9993 bump, 2026-07-14)** — per-request reasoning budget. The
  server chat endpoint reads request-body key **`reasoning_budget_tokens`** (alias
  `thinking_budget_tokens`), grepped from source `tools/server/server-common.cpp`
  (`int reasoning_budget = json_value(body, "reasoning_budget_tokens", …)`). Semantics
  (`common/common.h`): `-1` = unlimited/disabled, `0` = suppress thinking, `N>0` = cap at N
  tokens. The body value OVERRIDES the `--reasoning-budget` launch flag unconditionally (no
  `launch==-1` gate — `tests/test-chat.cpp::test_reasoning_budget_tokens_per_request`). This
  is the key **U2-T5** emits so the built-in runner honors low/med/high; our launch profile
  stops emitting `--reasoning-budget` (leaves the engine default -1) and sends the resolved
  number per request.

## Review checklist (run every review)

- **Samplers / params** — new or renamed sampler/penalty knobs; changes to defaults
  or to the sampler-order vocabulary (→ `DEFAULT_SAMPLER_ORDER`, knob catalog).
- **Server API** — `/models/load`, `/completion`, `/props`, `/v1/*` shape/semantics
  (esp. anything our `lifecycle.py` / `openai_compat.py` assumes: async load, nested
  status, error shapes).
- **Structured output** — `json_schema` / GBNF grammar support changes.
- **GGUF / quant / format** — new quant types, metadata keys, or format bumps that
  affect `runner/gguf_remote.py`, fit estimation, or the catalog.
- **Model architectures** — newly supported arches (catalog / detection relevance).
- **Perf / memory flags** — cache types (`--cache-type-*`), offload/`-ngl`, mmap/mlock,
  batching, speculative decode — anything that changes our switch defaults.
- **Breaking changes** — any switch we set that upstream renamed/removed/re-defaulted.
- **Placement rules the fit copies** (vram-truth plan 2026-09-19 §2.1) — on EVERY
  pin bump re-read and re-quote: `src/llama-model.cpp` `i_gpu_start = n_layer_all +
  1 − n_gpu_layers` / `act_gpu_layers` / "always keep [the input layer] on the CPU"
  (→ `fit.engine_gpu_blocks`, `process.engine_ngl_flag`); the tied-head
  `TENSOR_DUPLICATED` idiom (e.g. `src/models/gemma4.cpp`); `common/common.h`
  `LLM_FFN_EXPS_REGEX` (→ `gguf.EXPS_REGEX` — it gained `gate_up` since b6895);
  `llama-fit-params` `-fitp` output shape (the validation oracle). Then re-run the
  plan's Step 0b on one MoE + one dense model: predicted vs engine model-MiB < 1 %.
- **Binaries** — asset naming / CUDA-runtime companion changes affecting
  `DEFAULT_BINARIES` + `runtime_url` plumbing (`runner/download.py`, `runner/binary.py`).
  List the target's REAL names (`gh api …/releases/tags/<b> --jq '.assets[].name'`) and compare
  **every row**, not just the one the author's box uses: between `b9993` and `b11056` the
  Windows AMD, Linux AMD and Windows CUDA-13 names all changed and Linux AMD vanished for ~180
  builds, while the author's CUDA-12 row never moved.
- **Every flag we emit, against the target's `common/arg.cpp`** (added 2026-09-19 — the check
  that would have caught the `--mlock`/`--no-mmap` removal). The list lives in
  `process._VALUE_FLAGS` + the presence/spec branches of `process.overrides_to_pairs` + the
  router argv in `process.start_router`; grep each `"--flag"` in `arg.cpp` at the installed
  build, the target and latest. Once the plan's Slice 1 is in, `process.probe_argvs(<build>)`
  run against the real exe does this mechanically — **flags first, `--version` last**
  (`--version` first tests nothing: args parse in order and it exits on sight).
- **The release scheme itself** (added 2026-09-19) — is `releases/latest` still a `vX.Y.Z`
  tag carrying `nightly-tag.txt`? The in-app update check depends on it
  (`lifecycle._fetch_latest_llamacpp_release` once Slice 3 is in).
- **Request parsing we rely on** (added 2026-09-19) — re-read `oaicompat_chat_params_parse` in
  `tools/server/server-common.cpp` for `response_format`, `reasoning_budget_tokens` and
  `chat_template_kwargs`; trust the code over the README (they disagreed about the flat
  `json_schema` form for months). Once Slice 0 is in, run `scripts/check-structured-output.py`
  against the target build.
- **Bad build ranges** — before choosing a pin, search the window for regressions that were
  later fixed and keep the pin outside them. Known: `b10121`–`b10267` (macOS ≤ 15 binaries,
  #26375) · `b10398`–`b10581` (no Linux ROCm asset) · `b10741`–`b10748` (Gemma-4 assistant MTP
  draft, #28159 → #28183).

## Adoption candidates — open (from the 2026-09-19 review, b9993 → b11056)

None open (2026-10-29): items 1–5, 8 and 9's download check are built — the update check on the stable channel, the
loading flags, the asset names, the pin, real load progress from `/models/sse`, structured output, each download
checked against GitHub's digest; 6, 7 and 9's `--log-jsonl` and `/metrics` were dropped on the user's word. Their text
is in git.

The review behind them (1,064 commits read): `docs/plans/2026-09-19-engine-update-safety-and-stable-channel.md`.

## Review log

| Date reviewed | `since` tag | Latest tag seen | New builds | Relevant? | Action |
|---|---|---|---|---|---|
| 2026-07-14 | b9899 (pin) | b9993 | b9900–b9993 (releases pp.1–10) | Yes | Full review done via WebFetch. Candidates recorded above; nothing forces a change. Top flag: engine bump b9899→b9993 (awaits box test + your word). |
| 2026-07-14 | b9993 | b10012 | — | — | **Engine bump EXECUTED** b9899→b9993 (Unit 2, user "do the bump and do it all"): adoption candidates #1 (bump) + #2 (per-request reasoning-budget key `reasoning_budget_tokens`, grepped from source) taken; assets re-verified via `gh api releases/tags/b9993`. Upstream latest = b10012 (unreviewed; b9993 chosen deliberately). Box test (b9993 download + model load + a local High chat watching thinking stop at the cap) = the Unit-2 acceptance step. |

| 2026-09-19 | b9993 | b11056 (stable: `v0.4.1` = b10964) | b9994–b11056 — **all 1,064 commit titles read** (treeless clone) + the four stable releases' curated notes; ~40 PRs opened; source read at b9993 / b10105 / b10145 / b10437 / b10964 / b11056 | **Yes — three are defects in OUR code** | No code changed. Found: the in-app update check dead since upstream's 2026-08-21 release-scheme change (reproduced with the app's own functions) · `--mlock`/`--no-mmap` deleted at b10875 and already re-meant on b10437 · renamed release assets break updates for AMD rows · the adapter sends `json_schema` in a form the engine silently ignores (**observed** on b10437) · real load progress now on `/models/sse` (unblocks T5) · the Q2_0 watch item resolved (b10192). Two safe probes run on the author's real b10437 exe: flag acceptance before `--version` (unknown flag → exit 1) and the flat-vs-nested schema test (CPU only). Build plan written: `docs/plans/2026-09-19-engine-update-safety-and-stable-channel.md` (Opus executes, per-slice go). Pin still b9993. |
| 2026-09-19 (same day) | — | — | — | — | **Plan EXECUTED (user: "go do it all").** Items 1, 2, 3 and 8 BUILT and gated; all three apps green; verified live against real GitHub and the real engine. **Item 4 (pin → b10964) REFUSED BY ITS OWN BOX TEST** — on the flagship's MTP path b10964 runs at 0.784 of b10437 and its speculative output is no longer exact; b11056 the same. |
| 2026-09-19 (same evening) | b10437 (good) | b10964 (bad) | 8 builds probed of the 318 between them, on draft acceptance | **Yes — culprit named** | **BISECT (user: "go bisect").** **First bad build `b10751` = `cuda: fuse MoE weighted expert reduction` (#25952)** — it fuses the MoE combine tail into one CUDA kernel, reordering float accumulation across experts, so acceptance halves (0.823 → 0.481) and drafted output stops equalling greedy. CUDA-only, MoE-only. Last good = **b10750**, which BEATS b10437 (1.028 ×, exact, byte-identical output) and has every platform asset. **Pin moved b9993 → b10750** (user: "go pin b10750"). Every test build deleted; the author's disk left as found. Open: report #25952 upstream; and the Update button still offers the stable b10964, which is bad. |
| 2026-09-28 | b10750 | b11239 (stable: `v0.5.0` = b11146) | b10750 / b10751 / b11239 re-measured; no commit read | **Yes — the 2026-09-19 MTP finding was too broad** | **RE-MEASURE (user: "re-measure with a real chat prompt on b10750 vs b10751", then "go measure head with the raw prompt control").** Prompted by #29381, closed unmerged: *"can't reproduce … hallucinated"*. Through the chat template the three builds are level (acceptance ±0.02, the draft 1.10–1.32× on each) and NONE is exact. The raw control reproduces byte for byte, so the drop is real but confined to untemplated input. **Pin moved b10750 → b11239** (user: "do 1"). Three asset renames verified against the live release. Plan §10 has the tables. #29168 closed 2026-09-28; the live DBs move with the next pin (the kit's TASKS, "Finish the kit"). |

**Last reviewed:** `b11056` · 2026-09-19 (commit-log review); `b11057`–`b11239` were measured, not
reviewed (2026-09-28). **Pin: `b11239`** (moved 2026-09-28 by re-measurement: the 2026-09-19 MTP drop is confined to
untemplated input, so `b10751` and later are allowed — the review log). The `b11239` move skipped the review
checklist's re-read of the placement rules and request parsing; that re-read and the next pin move (to the latest
release) are the kit's TASKS, "Finish the kit", items 32 and the pin.
