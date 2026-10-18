// SPDX-License-Identifier: MIT
// A family app's own server as a promptfoo provider (the custom provider,
// https://www.promptfoo.dev/docs/providers/custom-api/; added 2026-10-16 with JustWrite's
// real-model eval). Each test runs ONE action through the app's POST /v1/ai/stream — the route the
// app's own AI calls take: the stored prompt, the action's engine preset and the dispatch — with
// the test's `vars.action` and `vars.variables` (a Lab sample's, from lab-samples.js). The prompt
// promptfoo renders is ignored: the server renders the stored one. (Not /v1/ai/run: it waits for
// the whole reply before sending anything, so a long local generation outlasts the provider's
// timeout — measured 2026-10-16, gemma-4-12b's marketing pack at the 60 s default.)
//
// `config.providerId` / `config.model` pin the model this run uses (empty → the action's own
// route; EVAL_PROVIDER_ID / EVAL_MODEL fill them when the config doesn't). The server is
// `config.server`, else EVAL_SERVER. A reply cut off by the token cap or a full context comes
// back with `metadata.finishReason` "length", for the app's checks to fail.
//
//   providers:
//     - id: file://../../just-core/scripts/evals/app-provider.js
//       config: { providerId: local-llamacpp, model: gemma-4-26b-a4b-qat }

export default class AppServerProvider {
  constructor(options = {}) {
    this.config = options.config || {};
    this.label = options.label;
  }

  get pin() {
    return {
      server: this.config.server || process.env.EVAL_SERVER || "",
      providerId: this.config.providerId || process.env.EVAL_PROVIDER_ID || "",
      model: this.config.model || process.env.EVAL_MODEL || "",
    };
  }

  id() {
    const { providerId, model } = this.pin;
    return `app-server:${[providerId, model].filter(Boolean).join("/") || "routed"}`;
  }

  async callApi(_prompt, context) {
    const { server, providerId, model } = this.pin;
    if (!server) return { error: "No server: set EVAL_SERVER (or config.server)." };
    const { action, variables } = context?.vars || {};
    const body = {
      action,
      variables: typeof variables === "string" ? JSON.parse(variables) : variables || {},
      providerId,
      model,
    };
    const started = Date.now();
    let text;
    try {
      const res = await fetch(`${server}/v1/ai/stream`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout((this.config.timeoutS || 1800) * 1000),
      });
      text = await res.text();
      if (!res.ok) return { error: `${server}/v1/ai/stream → HTTP ${res.status}: ${text.slice(0, 600)}` };
    } catch (e) {
      return { error: `${server}/v1/ai/stream: ${e?.message || e}` };
    }
    // The kit's SSE frames: {delta} · {thinking} · {progress} · {done, …} · {error} · [DONE].
    let output = "";
    let done = {};
    for (const line of text.split("\n")) {
      if (!line.startsWith("data: ")) continue;
      const data = line.slice(6).trim();
      if (data === "[DONE]") break;
      let frame;
      try {
        frame = JSON.parse(data);
      } catch {
        continue;
      }
      if (frame.error) return { error: `${action}: ${frame.error}` };
      if (typeof frame.delta === "string") output += frame.delta;
      if (frame.done) done = frame;
    }
    return {
      output,
      tokenUsage: { prompt: done.promptTokens || 0, completion: done.completionTokens || 0, total: (done.promptTokens || 0) + (done.completionTokens || 0) },
      cost: done.cost || 0,
      metadata: { model: done.model || "", finishReason: done.finishReason || "", seconds: Math.round((Date.now() - started) / 100) / 10 },
    };
  }
}
