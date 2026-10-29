---
name: new-just-app
description: Start a new just-family app (just-<name>) from the kit's complete template — asks the few questions that matter (name, what it's for, outside data, departures, which parts), writes its PRD, generates and registers the app, and proves it green. Use when the user wants a new family app or project, not for changing an existing one.
---

# /new-just-app — a new family app, the same way every time

The family's apps are written 100% by AI; this skill is how every one of them starts. It follows the
kit's standard — `../just-core/docs/app-structure.md` (§1 names and ports, §12 definition of done,
§13 docs, §15–§18) — and the decisions recorded in the kit's `docs/dev/TASKS.md` ("A standard start
for every new just app"). Read §1 and §12 before starting.

## Never asked (decided for every family app)

Quasar with its web, desktop (Electron) and phone (Capacitor) modes · plain JavaScript · the Node
(Hono) server as its own package · one SQLite database · the kit (`@delebash/core`, `@delebash/ui`)
with its AI stack (local and cloud through one runner) · Biome · the MIT licence · the template's
chrome, settings, help, logs, backups and tests.

## The questions — one at a time, in plain words

1. **The name.** Every app is `just-<name>` (`just-house-paint`). Confirm the product name shown in
   the window (default "Just <Name>"). The generator derives the rest.
2. **What it does** — the PRD interview, written to `docs/dev/PRD.md` in the template's shape:
   what it is for and who uses it; its features, each with how it will be proven; **"will it use
   outside data, accounts or paid services?"**; what's out of scope. Keep the user's own words.
3. **Anything that departs from the family standard?** Each one is listed under the standard's Open
   deviations with the user's word — or dropped.
4. **The parts** — yes/no, default yes: **AI features** (no = an empty feature catalog; the AI area
   stays — §11 chrome is in every app) · **Help pages** (the user: "all apps need help"). The
   desktop app is always generated — the dev loop and the headless launcher run on it. **No phone
   app** is offered (2026-10-19): the template's `src-capacitor/` has no in-app server yet, so the
   generator leaves it out; say so if the user asks for one.

If the user says "your rec" or doesn't want an interview, write the PRD from what they did say and
mark every assumption "(assumed)" for them to correct.

## Before planning or building any piece

- **The kit and template first.** Anything they have — AI engines (llama.cpp, stable-diffusion.cpp and the
  onnx runtime; audio.cpp when the engines plan's round E lands), feature routing, jobs, looks, controls — is used
  from there. Anything they lack is a kit gap: it goes into the kit first (or the user signs it off as NOT
  STANDARD), and the app is built on the kit after. Never inside the app.
- **The area with no standard yet** (the kit's `docs/dev/RESEARCH.md`, the template research's **N** list):
  client-side form validation. A piece in it is not planned until the kit has it or the user signs it off by
  name. (Decided since: accessibility — app-structure §17, WCAG 2.2 AA; signing — installers are unsigned,
  §Q.2; performance budgets — none, §18; image and vision models — the kit's engines, rounds B and C.)
- **Every plan carries a standards table** with a "Kit code" column: each row names the kit file or export it
  uses (`acquireRuntime`, `packages/core/src/runner/binary.js`), or says "app — why" for the app's own logic,
  or "NOT STANDARD — the standard option and the trade-off" (it waits for the user's word on that row).
  `node ../just-core/scripts/check-plan.js docs/plans/<plan>.md` checks it; the guard runs it on every new
  plan. "Follows the family's pattern" is not a kit file — the AI photo was built inside house-paint behind
  exactly that line.
- **Reports name the repo** of every engine, stack or shared piece: "in the kit: `packages/core/src/…`" or
  "in the app: `server/src/…`".
- **ES modules everywhere** — `.js` with standard `import`; no `require`, `createRequire`, `.mjs`, `.cjs`
  (the family rules; the guard's check 20).

## The steps

1. Read the kit's `docs/dev/TASKS.md` item above and app-structure §1, §12, §13.
2. Run the generator from the kit (it prints every step; `--dry-run` first if the folder exists):
   ```bash
   node ../just-core/scripts/new-app.js --name <name> [--product "<Product>"]
   ```
   It copies the template's tracked files (keeping any file that already exists — say which),
   renames ids, names and ports, re-points the kit paths, `git init`s, installs, runs lint and the
   tests, and registers the app in the guard (`APPS`, `APP_PORTS`, `DEV_PORTS`) and runs the guard.
3. Write `docs/dev/PRD.md` from the interview; replace the template's "what it is" lines in
   `README.md` and `AGENTS.md` with the app's (one paragraph, from the PRD); start `docs/dev/TASKS.md`
   with the user's words that started the app; link every plan in `docs/plans/` from
   `docs/dev/RESEARCH.md` (the guard's check 15).
4. The example `notes` area is the reference for the first domain area: rename or replace it with
   the app's first real area, keeping its shape — schema, store, route, page, tests at every level.
5. Prove it: `npm run lint && npm run test:server && npm run test:unit`, `npm run build:spa`,
   `npm run server` and `/v1/health`, `node ../just-core/scripts/check-family.js`. Paste the output.
6. The first commit (message ending with the session's attribution line).
7. **Ask before creating the GitHub repository** (it is public by default): `gh repo create
   delebash/just-<name> --public --source . --push` only after the user says yes.

## What bites

- The template's own files are the source; copy nothing from a sibling app by hand — if the
  template lacks something an app needs, the template (or the kit) grows first.
- Ports come from the guard's registries; never reuse one (17496 and 1440 are reserved).
- The id has no hyphens (Android allows only `[a-zA-Z0-9_]`).
- The skill's source is the kit's `skills/new-just-app/`; `node ../just-core/scripts/install-skills.js`
  copies it to `~/.claude/skills/new-just-app/`, and the guard warns when the installed copy differs.
