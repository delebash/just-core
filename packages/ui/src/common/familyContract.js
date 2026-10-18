// SPDX-License-Identifier: MIT
// THE FAMILY SURFACE CONTRACT (2026-08-04) — the machine-readable canon for every
// label and shape the family shares. Born from a 48-item divergence sweep
// (just_ai_i18n_docgen/docs/plans/2026-08-04-consistency-sweep.md): every drift traced
// to a surface authored fresh with no canon and no gate.
//
// The family's shared WORDS are the kit's catalog now (packages/ui/src/i18n/locales/en.json, `kit.*` —
// the i18n plan, docs/plans/2026-10-12-i18n-standard.md): one key per word, so every app that
// shows `kit.nav.appSettings` shows the same words by construction. What stays here is what is
// not a word.
//
// SHAPES (asserted by the contract tests' scans, not renderable as strings):
//   - Settings is a TOP-TAB page (no vertical rail chrome).
//   - Boot is ONE splash: static index.html plate → app overlay hosting BootModelLoad.
//   - The first-run AI offer is a ONCE-EVER modal (ruling 2026-08-04; the permanent
//     Home-button shape is retired).
//   - The headless-access + token settings live in a section named `settingsSections.server`.

// The canon RELATIVE order of the shared settings sections (parity batch slice 11); each id's words
// are `kit.settingsSections.<id>`. Each app's contract test filters its own section ids down to
// these and asserts the order holds; app-own sections (Project, General, Reviewer, the voice tail)
// sit anywhere around them.
export const SETTINGS_SECTION_ORDER = ["appearance", "backups", "storage", "server", "logs", "updates", "about"];

// THE FAMILY TASK-LINGER POLICY (ruled 2026-08-07, same in every app): how long a
// finished task's row stays visible before archiving to history. Completed lingers 5 s
// (the user sees "done" instead of a strip that flashes and disappears — the JustVoice
// complaint of 2026-06-09, whose fix now belongs to everyone), cancelled 3 s, and
// FAILED STAYS until the user dismisses it — the durable-error law (QC-37) as an
// actual row with the error text, not just a badge count that clears on panel-open.
// The aiTasks store uses this as its DEFAULT; a task may override per outcome, and an
// explicit `lingerMs: {}` opts out entirely (tests use that for archive-now behavior).
// A behavior, not a label — it lives here because it is FAMILY CANON: one line of
// truth instead of three apps' call sites agreeing by luck.
export const FAMILY_TASK_LINGER = { completed: 5000, cancelled: 3000, failed: null };
