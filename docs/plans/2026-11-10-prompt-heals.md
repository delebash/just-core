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

Checklist (each line updated as it lands):
- [ ] Each app's prompts and seed path read (template, house-paint, docgen, JustVoice): where DEFAULT_FEATURE_PROMPTS
      lives, how installLlm is called, how a test seeds.
- [ ] The template: FEATURE_PROMPT_HEALS, featurePromptHeals, server/tests/prompts.test.js.
- [ ] house-paint, docgen, JustVoice: the same, each with its own prompts.
- [ ] The guard: an app that passes featurePrompts passes featurePromptHeals too.
- [ ] Docs: the template's and the kit's notes where a prompt is added (app-structure, the template's AGENTS/README).
- [ ] The end run: each changed repo's lint and server suite, the guard; commit and push.
- [ ] The report.
