# The KV/context surface — parked (the kit's tracker entry, moved here 2026-10-29)

Removed from `docs/dev/TASKS.md` on 2026-10-29 by the user's word on the finish list ("the KV/context surface (record
in its plans)"): it wakes only on a second machine's evidence and errs fat, which is safe. The entry as it stood:

### THE KV/CONTEXT SURFACE — three faults, fix them TOGETHER or not at all [verified 2026-09-19]
###   (1) KV ~400 MiB thin · (2) the CUDA overhead seed fatter than that · (3) hybrid-attention priced as full KV

STATE:  DECIDED 2026-09-19 — PARKED, not built. User: *"think on this again
        and give me your rec"* → the rec below → *"go"* (the go covers THIS
        tracker rewrite only — no code). The rec as shown and approved:
        "Do not build the KV fix now — building it alone makes the
        new-install case worse, and the VRAM manager is not at risk as
        things stand." · "Don't touch the launch flags. Four shared slots is
        the engine's design; forcing `--parallel 1` changes app behaviour."
        · "Don't ship the KV fix alone. It must land together with a
        corrected seed." · "Don't re-seed from one box. … you already ruled
        on the sister constant: re-seed only with multi-box evidence. Same
        rule here." · "Do rewrite the tracker item so nobody later does the
        KV-only fix."
WHY:    TWO ERRORS THAT PARTLY CANCEL, both measured on the author's box.
        (1) KV too small. Source-verified at b10437 (raw.githubusercontent
        tag `b10437`): `tools/server/server.cpp:151-154` — `--parallel`
        default −1 = auto → `n_parallel = 4`, `kv_unified = true` (a
        CONSTANT, every machine; the app never emits `--parallel`, and its
        own router log says `n_slots = 4, n_ctx_slot = 32768, kv_unified =
        'true'`); `src/llama-kv-cache-iswa.cpp:73` — `size_swa =
        GGML_PAD(min(size_base, n_swa*(unified ? n_seq_max : 1) + n_ubatch),
        256)`. So a windowed layer holds `pad256(min(ctx, window × slots +
        ubatch))` cells — NOT `min(ctx, window)` (`gguf.py` `kv_mb_at_ctx`,
        `fit.kv_mb_from_facts`). And a `q8_0` cache is 8.5 bits/value (34
        bytes per 32), not 8 (`fit.py:129` maps q8_0 → 8). Both terms
        reproduce the measured loads to the MiB (26B facts: Wb 102,400 ·
        Gb 10,240 B/token · window 1024 · ub 512 · ctx 32768): global
        10,240 × 32,768 × 8.5/8 = **340** (kit 320) · windowed 1 slot
        102,400 × 1,536 × 8.5/8 = **159.4** (measured 153 card + 6.38 CPU)
        · windowed 4 slots 102,400 × 4,608 × 8.5/8 = **478.1** (measured
        459 card + 19.12 CPU) · total **818 MiB vs the kit's 420**.
        (2) Seed too big. `fit.PHYSICS_OVERHEAD_MB["cuda"]` = `_C5` =
        1,516.5 — the oobabooga regression's fitted INTERCEPT, kept at the
        redesign and called "overhead"; never measured as overhead. The
        author's fresh DB (2026-09-19, `model_measurements`): `gemma-4-26b-
        a4b-qat` load footprint (measured) **6,774 MiB**; `__overhead__`
        `physics-overhead b10437 p2` **1,040 MiB** (the footprint is
        consistent with the MTP-draft launch, plan §10.3's 6,789 replica —
        so the draft's ~209 MiB compute buffer sits inside that 1,040; not
        separately verified).
        THE ARITHMETIC THAT DECIDES IT — computed booking for a never-loaded
        26B on a fresh box (seed, no learned row): today 6,774 − 1,040 +
        1,516 = **~7,250 (+476, the safe direction)**; after a KV-ONLY fix
        **~7,650 (+874 — worse)**: every fresh install would see the
        flagship ~870 MiB heavier than it is, pushing an extra expert block
        to RAM or flipping the Fit badge on an edge card — the opposite of
        the speed-truth goal. Under corrected KV the learned overhead would
        read ~640, i.e. the seed is ~2.4× the real figure on this box.
        WHAT IS NOT AT RISK TODAY: a loaded model's reservation is trued to
        measured; a model this box has loaded uses the measured median; the
        split solver (`process.compute_fit`) uses the SEED, never the
        learned row, so it errs fat. The one unsafe case: a box whose
        `__overhead__` was learned from a non-SWA model books a never-loaded
        Gemma ~350 MiB short, ONCE, in arbiter pre-load admission — the
        engine's back-off catches it and the measured arm takes over.
NOT:    a KV-only fix (the trap above) · forcing `--parallel 1` or emitting
        `--parallel`/`--kv-unified` from the kit (behaviour change: Compare,
        batch sweeps, overlapping requests — its own decision) · re-seeding
        `_C5` from one box · `llama-fit-params` as a live per-row oracle
        (needs the file on disk; cannot price catalog rows pre-download).
OPEN:   ONE change, all parts or none: (a) windowed cells = `pad256(min(ctx,
        window × slots + ubatch))` with slots = the `parallel` switch when
        set, else 4 (auto; re-check `server.cpp` at every pin bump — if the
        engine changes it we degrade to today's state, absorbed by the
        learned row); an EXPLICIT `parallel` turns unified OFF, which the
        same source line sizes per-stream — read `llama-kv-cache-iswa.cpp`
        `:164` on before modelling that arm · (b) q8_0 at 8.5 bits (q4_0 is
        4.5 — verify in ggml before writing it) · (c) a corrected CUDA seed
        from multi-box evidence · (d) `PHYSICS_VERSION` p2 → p3 so the
        learned rows (which CONTAIN the old gap) stop matching and re-learn
        — without it every computed booking double-counts ~400 MiB · (e)
        the slot term stays OUT of the speed path — `api.py:345`,
        `bandwidth.py:273` and `:300` call `kv_mb_from_facts(…, unit=1e6)`
        for bytes READ per token; slots are allocated, not read · (f)
        `identity.py:151-164` floors/est rise for SWA rows → seed refresh in
        all three apps · (g) `tests/test_fit_acceptance.py` must still
        reproduce ngl 99 / ncmoe 21 on the author's row; if it moves to 22
        that is a finding to show, never a re-pin.

FAULT 3 — HYBRID/RECURRENT ATTENTION IS PRICED AS FULL KV [MEASURED 2026-09-19,
        folded in here on the user's word "add hybrid att to parked kv"].
        `qwen35` is a hybrid architecture: most blocks use LINEAR attention,
        which the engine backs with a RECURRENT STATE buffer, not a KV cache.
        Its log carries no `KV self size` line at all — instead
        `llama_memory_recurrent: size = 598.50 MiB (4 cells, 64 layers, 4 seqs)`.
        Our math assumes every block holds full attention KV.
        Measured on Ternary-Bonsai-27B-Q2_g64 (64 blocks, kv-heads 4, k/v len
        256), ctx 32768, q8_0:
          our `kv_exact_mb`         → **4,096 MiB**
          the engine's real context → **1,016 MiB** on CUDA0 (+669 host)
          ≈ 4× over, and `compute_fit` booked **8,836 MiB** on an 8,192 MiB
          card while the engine ran it at 5,457 MiB self (choosing 38/65
          layers where our fit wanted 43).
        Same CLASS as iSWA before the windowed-layer facts: an attention
        family the byte model does not know. It errs FAT, so it is
        safe-but-wasteful today — fewer layers offered than the card could
        take, and an outright refusal on a smaller one.
        WHY IT BELONGS HERE: it lands on the SAME functions as faults 1-2
        (`gguf.kv_mb_at_ctx`, `fit.kv_exact_mb` / `kv_mb_from_facts`,
        `identity.py`'s stored facts, every floors/est consumer) and needs the
        same `PHYSICS_VERSION` bump and seed refresh. Three separate passes
        over that surface would re-learn `__overhead__` three times and make
        each one's numbers unreadable against the others.
        (h) read the recurrent/linear-attention facts from the header the way
        `sliding_window_pattern` is read for iSWA, and price non-KV blocks as
        recurrent state rather than KV.
        NOT urgent on its own: no catalog row uses a hybrid arch today (Bonsai 1
        was rejected on speed, not this — IDEAS). It becomes real the moment a
        Qwen3.5/Qwen3.8-family row is added; Bonsai 2 is `qwen35` too.
        WAKES ON: `__overhead__` rows from at least two more machines (or
        one more machine + a non-SWA model here) — enough to set (c). Fault 3
        needs no new evidence; it waits only so the surface is touched once.
GO:     needed — for the build. This rewrite: given 2026-09-19; fault 3 folded
        in 2026-09-20.


