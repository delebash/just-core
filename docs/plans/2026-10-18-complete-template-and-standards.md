<!-- SPDX-License-Identifier: MIT -->
# The complete template, a written standard for every part, and the kit pieces they need (2026-10-18)

**Go:** the user, 2026-10-18 — "keep going finihs it all i want all this done and a complete working
app for just-house-paint, dont stop but always rethink your decisions and recs adverserially go on
coding your recs dont stop do it all" (TASKS, "A standard start for every new just app"). Earlier
direction, verbatim in the same TASKS item: a COMPLETE template; a written standard for every part;
sameness by construction; and "all gui should have standar erorr msg and contract rqured min lenght
and so on, make sure our app uses best standards from server to form validation and error hadnling
and loggin".

Inputs: RESEARCH §2, "The complete template" (the apps' shared pieces, the standards coverage map and
its 14 gaps, industry practice) — the reports verbatim in `2026-10-17-complete-template-research.md`.

Each rec names the standard it follows, or is marked **NOT STANDARD** with the standard option, the
evidence and the trade-off. "Attacked:" says what the adversarial pass changed.

## 1 · Validation, errors and logging — one contract from the server to the form (new §15)

| # | Rec | Standard |
|---|---|---|
| 1.1 | Every error answer is problem+json, as today (`type`, `title`, `status`, `detail`, `instance`), plus `requestId`; a 422 adds `errors: [{loc, msg, type, ctx?}]` — `ctx` (the limit) is new, so the GUI can word the message in the user's language. | RFC 9457 (rfc-editor.org/rfc/rfc9457, obsoletes 7807 — same members) |
| 1.2 | Every request gets an id: Hono's `requestId()` middleware in the kit's `createServer`; the id rides the `X-Request-Id` header, every problem body and every log line the request writes. | hono.dev/docs/middleware/builtin/request-id |
| 1.3 | The unhandled-exception answer moves into the kit: `createServer`'s default `onUnhandled` becomes the family envelope (all three apps hand-copy the same `{title, detail}` 500) — now problem+json with `requestId`; the apps drop their copies. | the kit's own (sameness) |
| 1.4 | Request validation stays the kit's `input({ body, querystring, params })` with TypeBox schemas (JSON Schema). The schema a form also needs lives in the server package, `server/src/schemas/<area>.js`, importing only `typebox` and the kit's browser-safe `@delebash/core/platform/schema` (`T`, `opt`, `nullable`, `literal` move there; `models.js` re-exports them); the server package exports `./schemas/*`, and the renderer imports the same schema. | JSON Schema (json-schema.org) · TypeBox · §Q.3's "code both sides need lives in the server package" |
| 1.5 | Forms: Quasar's `QForm` + the kit's inputs with `rules` built by the kit's `schemaRules(schema)` (required, min/max length, pattern, min/max, integer, enum, email/uri formats) — messages from the kit's catalog (`kit.validation.*`); `lazy-rules`, validation on blur and on submit; the submit button disabled while saving. A 422 from the server lands under its field through the kit's `fieldErrors(err)` (by `loc`); anything else goes to `reportError`. | quasar.dev/vue-components/form · quasar.dev/vue-components/input (internal validation) |
| 1.6 | The client's error object carries `status`, `problem` (the parsed body), `errors` and `requestId` beside today's message (additive — callers keying on "409 …" keep working). | — (kit transport) |
| 1.7 | One way to show a failure: the kit's `reportError(err, {context})` → a Quasar Notify toast through `pushToast` with the human message; a 5xx adds "Reference: <requestId>" so the log line can be found. Field errors never toast. Empty / loading / error states use the kit's `EmptyState` / `UiBanner` (with Retry). | quasar.dev/quasar-plugins/notify |
| 1.8 | Renderer errors reach the server log: the kit's `installErrorReporting(app)` (boot file) hooks Vue's `app.config.errorHandler`, `window` `error` and `unhandledrejection`, and posts each (deduped, at most 20 a minute) to `POST /v1/logs/client`, a new route in the kit's `makeLogsRouter`; Settings → Logs shows them with the server's. | vuejs.org/api/application.html#app-config-errorhandler · MDN `unhandledrejection` |
| 1.9 | The logging policy: `getLogger(<area>)`; **error** — a failure the user didn't cause (5xx, crash, engine failure), with the stack; **warn** — a refused request (4xx) or a degraded fallback; **info** — lifecycle (start, stop, model load, download, a setting changed); **debug** — per-request detail, off by default. Never log secrets (keys, tokens, `Authorization`) or user content (texts, photos) at info or above. | RFC 5424 severities |

Attacked: (a) "share Zod schemas instead" — the most popular choice, but the kit's whole request
pipeline is TypeBox + ajv and Zod would be a second schema language: rejected. (b) "validate in the
browser with ajv" — 120 KB more and its messages are English; `schemaRules` reads only the keywords
forms use: kept. (c) A client-log route can be flooded — dedupe + rate limit + size cap added. (d)
Changing the default 500 to problem+json breaks no client: every reader takes `title`/`detail`.

## 2 · Health and version — one router (kit)

`makeHealthRouter({ product, version, extras })` answers `GET /v1/health` with the family's base wire
`{status, product, version, apiVersion}` plus the app's extras (JW `dataDir`/`dbReady`, JV
`engines`…); the version is the server package's, read as a JSON import (`import pkg from "../package.json" with { type: "json" }` — JustVoice's way; it works in the phone's bundle too, where a file read doesn't; a kit `readPackageVersion` was added and removed the same day for that reason). Each app's
`api/health_api.js` becomes one call; the guard checks every app mounts it and that the root and
server `package.json` versions match (JW's server says 0.0.1 while its app is 1.0.0).
Attacked: a "health check standard" exists (the IETF draft `application/health+json`, never
finished); the family wire is older and three apps' clients read it — kept.

## 3 · Data — SQLite, schema changes, seeds, ids (new §16)

One database file per app (`<dataDir>/<app>.db`, the kit's `openDatabase`: better-sqlite3, WAL,
foreign keys on). The schema is SQL in `server/src/database/schema.js`; every later change is a
numbered migration run by the kit's `migrate(db, MIGRATIONS)`, keyed on SQLite's `PRAGMA
user_version`, each in one transaction. Ids: random text (`crypto.randomUUID()`), never
AUTOINCREMENT for a table that may sync (just-sqlite-sync's rule). Times: ISO-8601 UTC text. JSON
columns only for opaque blobs. Seeds: idempotent insert-if-missing, shipping facts and defaults the
user can edit (family rule 1); an app's own settings are rows in its `settings` table behind
`/v1/settings`; the renderer's preferences are `/v1/prefs` (the kit's `makePrefsRouter`).
Standard: sqlite.org/pragma.html#pragma_user_version · github.com/WiseLibs/better-sqlite3.
Attacked: (a) "use a migration library (umzug, knex)" — both are ORM-shaped and bring a second
schema language; `user_version` is SQLite's own documented counter and the helper is ~20 lines in the
kit (one copy, tested). (b) JustWrite and JustVoice drop-and-reseed today — they keep it; the
standard binds new apps and is listed as an open deviation for the two.

## 4 · Screens and forms (new §17)

Pages are `q-page` with `pageFill`/`pageFlow` (§Q.1); a page header is the kit's `PaneHeader`; lists
are `UiTable` (QTable) or `q-list`; a form is §1.5's; empty/loading/error are `EmptyState` /
`q-inner-loading` / `UiBanner`; an irreversible action asks through the kit's `confirmDialog`, a
reversible one acts and offers Undo in its toast; every control is sized to its content, prose
fields ~60ch, a button on a row of labelled fields aligns with the inputs (the user's global rule);
type and spacing come from `tokens.css`. Standard: Quasar's components (quasar.dev/vue-components).

## 5 · Tests — every level (new §18)

| Level | What | Tool |
|---|---|---|
| server routes | every route: its happy path, one 422, one refusal; `app.request` | Vitest (hono.dev/docs/guides/testing) |
| server, real socket | one test through the real listener with an `Origin:` header (CORS) | Vitest + the kit's server |
| renderer units | stores, services, components | Vitest + `@vue/test-utils` (vuejs.org/guide/scaling-up/testing) |
| boot smoke | the boot steps by hand (`registerBootSmoke`) | Vitest |
| desktop e2e | the unpackaged app through Playwright's `_electron`, hermetic (`<ID>_DEV_NO_SERVER=1`) | playwright-core |

"Must pass before a commit": `npm run lint && npm run test:server && npm run test:unit` and the guard;
Husky + lint-staged runs Biome on the staged files (decided 2026-10-17). Coverage: `test:coverage`
(v8), no gate. Attacked: axe accessibility scans need the user's word on MPL-2.0 (test-only) — left
out until then; Vitest Browser Mode — skipped, Vue's and Quasar's docs use a simulated DOM.

## 6 · The complete template

`template/` becomes a working family app, checked by the guard as a product (its exemptions go):
the server's family surface (log ring + file, logs/disk/data/prefs/server-auth/shutdown routers,
health, the error envelope, `locateUiDir`, app_state/paths/version/auth), the AI half (`installLlm`,
the runner router, seeds, a feature catalog), the database layer of §3 with a small example domain
(`notes`: list, create, edit, delete — the schema, the form, the table, the tests at every level),
the §11 chrome (MainLayout, TitleBar with `AiStatusButton`, the AI-tasks row, the tray handlers,
keep-running, `/ai`, Settings with the seven family sections, `/offline`, the boot plate and splash),
help (`helpDocs.js`, the five required pages, `toc.json`, whats-new → Updates), the renderer tests,
`e2e/`, `docs/dev` (README, TASKS, IDEAS, RESEARCH, PRD), the desktop packaging block (fuses, nsis,
icons). Donors: docgen (the smallest — server surface, chrome, settings, e2e), JustWrite (the
database layer, the Storage and Server sections). Scaffold leftovers go (EssentialLink, the example
store, IndexPage, pnpm-workspace files, the ssr/ssg/pwa/cordova/bex blocks).
Attacked: the example domain is code every new app deletes — but without it nothing in the template
proves the database, the schema-shared form and the tests work together; the skill renames it into
the app's first domain area instead of deleting it.

## 7 · The `/new-just-app` skill

Source `just-core/skills/new-just-app/SKILL.md` + the generator `just-core/scripts/new-app.js`
(copies `git ls-files template`, renames ids/names/ports, regenerates lockfiles, `git init`, Husky +
lint-staged, first commit) + `scripts/install-skills.js` (copies the skill to
`~/.claude/skills/new-just-app/`; the guard warns when the installed copy differs). The questions are
the eight decisions of 2026-10-17; the parts (AI, Help, Desktop, Phone) are yes/no, default yes.

## 8 · Blast radius (greps, 2026-10-18)

```
$ git grep -n -E "createServer\(|errorEnvelope|health_api|makeLogsRouter\(" -- server/src   # per app
justwrite-app/server/src/app.js:157:  const app = createServer({ typeBase: TYPE_BASE, onUnhandled: errorEnvelope });
justwrite-app/server/src/phone.js:80:  const app = createServer({ typeBase: TYPE_BASE, onUnhandled: errorEnvelope });
justwrite-app/server/src/app_errors.js:17:export function errorEnvelope(err, c) {
justwrite-app/server/src/app.js:32:import { router as healthRouter } from "./api/health_api.js";
justwrite-app/server/src/phone.js:27:import { router as healthRouter } from "./api/health_api.js";
JustVioce/server/src/app.js:127:function errorEnvelope(err, c) {
JustVioce/server/src/app.js:277:  const app = createServer({ typeBase: TYPE_BASE, onUnhandled: errorEnvelope, pyFloats: … });
JustVioce/server/src/app.js:53:import { router as healthRouter } from "./api/health_api.js";
just_ai_i18n_docgen/server/src/app.js:458:function errorEnvelope(err, c) {
just_ai_i18n_docgen/server/src/app.js:474:  const app = createServer({ errors: "fastapi", onUnhandled: errorEnvelope });
just_ai_i18n_docgen/server/src/app.js:55:import { router as healthRouter } from "./api/health_api.js";
just-core/template/server/src/app.js:24:  const app = createServer({ typeBase: TYPE_BASE });
```

Every change to an existing app is additive or a one-line swap to the kit's copy of code the app
already runs; each app's lint, server tests, unit tests, build and health are re-run after it.
