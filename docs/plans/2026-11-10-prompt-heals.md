# Prompt heals in every app (2026-11-10) — read this FIRST after any compaction

**The job.** A seeded AI prompt row is inserted only if missing (`packages/core/src/llm/seed.js`), so a prompt an app
revises never reaches a database seeded before it — unless the app lists the old text in `featurePromptHeals`
{key: [old exact system texts]} (seed.js configureAppSeed / installLlm), and then only a row still holding an old text
(never one its owner edited). JustWrite and JustDirect pass it; the template, house-paint, docgen and JustVoice don't,
and nothing stops a prompt's text changing without its old text kept. Kit TASKS: "A revised prompt never reaches an
existing database" (found 2026-11-08 by JustDirect's session).

**The user's words:** "finihs any open itmes go" (2026-11-10), after the session's list whose one open item was this.

**Standard:** the kit's `featurePromptHeals` (kit code: `packages/core/src/llm/seed.js`, `installLlm`), as JustDirect
built it (just-direct `server/src/seed_feature_prompts.js` FEATURE_PROMPT_HEALS, `server/tests/prompts.test.js`): the
app's heals beside its prompts, passed to installLlm, and a test that holds every prompt's system-text fingerprint
(the kit's `fingerprint`, `@delebash/core/platform`) so a changed prompt fails until its old text is listed — plus a
heal run through the app's own seed.

## Standards for the pieces

| Piece | Standard it follows | Kit code |
|---|---|---|
| A revised prompt reaches a seeded database | the kit's heal: a row still byte-equal to a listed old text takes today's, an edited one is never touched | `packages/core/src/llm/seed.js` (`configureAppSeed`) |
| A prompt can't change without its old text kept | a test holding each prompt's system-text fingerprint, as settings_upgrade.test.js does for settings | `fingerprint` |
| The app's heals beside its prompts | the template's `seed_feature_prompts.js` and `tests/prompts.test.js` | app — each app's own prompt words and their history |
| No app passes prompts without heals | the family guard | `scripts/check-family.js` |

Checklist — **done 2026-11-10** (the kit TASKS item deleted as done; its record is this file):
- [x] Each app's prompts and seed path read: the template, house-paint and JustDirect seed through `seedWorkspace(db)`
      (the kit's seedLlm); docgen through `seedLlmStack()` (its state holds no db — the test sets rows as the AI Lab
      does, PUT /v1/ai/prompts/:key); JustVoice through `seedWorkspace()`.
- [x] No prompt changed since its app's first release, so every list starts empty — measured: house-paint's schemes
      prompt has one fingerprint at v0.1.0, v0.2.0 and HEAD (c0f39d46e9dbc51d); docgen's seed_feature_prompts.js has no
      diff since v0.1.0; JustVoice's v0.1.0 is today's, and before it the user reset (its AGENTS.md).
- [x] The template (kit), house-paint (fb41529), docgen (62f4d87), JustVoice (1ce3a7e1): FEATURE_PROMPT_HEALS beside the
      prompts, passed as featurePromptHeals, and two tests — every prompt's fingerprint (template 1, house-paint 1,
      docgen 3, JustVoice 21 prompts), and a heal run through the app's own seed with a made-up earlier text (the real
      list is empty), an edited prompt left alone. Shown to bite: the template's heal test failed with the app's
      featurePromptHeals line taken out ("expected 'You suggest a title for a note. (an e…' to be …"), passed with it.
- [x] The guard (check-family.js `checkPromptHeals`): a server file passing featurePrompts without featurePromptHeals
      fails, every app. Before the change house-paint, docgen and JustVoice would have failed it (their app.js at HEAD:
      featurePrompts 1, featurePromptHeals 0).
- [x] Docs: app-structure's installLlm sketch and its prompt-rows passage; RESEARCH's records index links this file.
- [x] The end run: lint and server suites — template 66 (+2), house-paint 400 (+16 skipped; +2), docgen 227 (+2),
      JustVoice 1316 (+2); the guard "✓ no violations"; the plan check 3 ✓ + 1 app row.
- [x] The report (in the session).
