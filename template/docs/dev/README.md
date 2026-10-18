# Dev docs — start here

Read in this order:

1. **`../../AGENTS.md`** — what this app is, the commands, what must pass before a commit, what
   bites, where to look, and the family rules.
2. **`PRD.md`** — what the app is for: who uses it, its features and how each is proven, the
   outside data and services it uses, what's out of scope.
3. **`TASKS.md`** — the live tracker of open work. **`IDEAS.md`** — ideas not yet scheduled.
   **`RESEARCH.md`** — what is already known, by subject, with the proof; read its section before
   researching anything.
4. **The family standard** — `../../../docs/app-structure.md`: §Q the layout, §8 the AI stack,
   §11 the standard chrome, §13 these docs, §15 validation and errors, §16 data, §17 screens and
   forms, §18 tests. This app's `notes` area is the reference for §15–§18.
5. **The shared stack** — `../../../docs/dev/README.md` (the kit this app embeds) and its research
   register, `../../../docs/dev/RESEARCH.md`.

Plans and their evidence go in `../plans/YYYY-MM-DD-<subject>.md`; each one is linked from
`RESEARCH.md` (the family guard's check 15).

User-facing docs live in `../*.md`, indexed by `../toc.json` and shown in the app through the kit's
Help drawer (`src/services/helpDocs.js`); `../whats-new.md` also feeds Settings → Updates. Update
them in the SAME change that alters anything a user sees.
