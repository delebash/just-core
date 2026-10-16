// SPDX-License-Identifier: MIT
// A family app's Lab samples as promptfoo test cases (tests from a file,
// https://www.promptfoo.dev/docs/configuration/test-cases/; added 2026-10-16 with JustWrite's
// real-model eval): every seeded sample the app's server holds (GET /v1/ai/test-samples — the
// rows its Lab's Sample button shows), each with its action's reply contract from the stored
// prompt (GET /v1/ai/prompts: jsonMode, jsonSchema). One source — the app's seed — so a new
// sample is tested the moment it is seeded. The app adds its own assertions (its parsers know
// what it accepts); app-provider.js runs them.
//
// `actions` / `labels` narrow the run (EVAL_ACTIONS / EVAL_LABELS, comma-separated, when not
// passed): an action matches its key exactly, a label any sample label containing it.

const list = (s) => String(s || "").split(",").map((x) => x.trim()).filter(Boolean);

async function getJson(server, route) {
  const r = await fetch(`${server}${route}`, { signal: AbortSignal.timeout(30_000) });
  if (!r.ok) throw new Error(`${server}${route} → HTTP ${r.status}`);
  return r.json();
}

/** @returns {Promise<Array<{ description, vars: { action, variables }, metadata }>>} */
export async function labSamples({
  server = process.env.EVAL_SERVER,
  actions = list(process.env.EVAL_ACTIONS),
  labels = list(process.env.EVAL_LABELS),
} = {}) {
  if (!server) throw new Error("No server: set EVAL_SERVER.");
  const [{ rows }, { prompts }] = await Promise.all([getJson(server, "/v1/ai/test-samples"), getJson(server, "/v1/ai/prompts")]);
  const byKey = new Map(prompts.map((p) => [p.key, p]));
  const wanted = (s) =>
    (!actions.length || actions.includes(s.action)) &&
    (!labels.length || labels.some((l) => s.label.toLowerCase().includes(l.toLowerCase())));
  return rows.filter(wanted).map((s) => {
    const p = byKey.get(s.action) || {};
    let jsonSchema = null;
    try {
      jsonSchema = p.jsonSchema ? JSON.parse(p.jsonSchema) : null;
    } catch {
      /* a schema that doesn't parse is the prompt's problem; the run still checks the JSON */
    }
    return {
      description: `${s.action} · ${s.label}`,
      vars: { action: s.action, variables: s.variables || {} },
      metadata: { action: s.action, label: s.label, feature: p.feature || "", jsonMode: !!p.jsonMode, jsonSchema },
    };
  });
}
