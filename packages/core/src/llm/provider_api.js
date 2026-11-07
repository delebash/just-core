// SPDX-License-Identifier: MIT
// The shared provider-CRUD router behind a host-supplied storage boundary — the port of
// llm/provider_api.py.
//
// Unlike api.js (storage-free endpoints over the shared registry/ledger), the provider list
// is persisted per app. So this is a **router factory**: the host passes a ProviderStore (a
// genuine persistence boundary that does real work, not a forwarding shim) and gets a ready
// `/v1/llm-providers*` router that every app mounts identically. The CRUD logic, validation,
// adapter-registry sync and local-server detection live here ONCE; only persistence differs.

import { Hono } from "hono";
import * as http from "../platform/http.js";
import { HttpError } from "../platform/errors.js";
import { getLogger } from "../platform/log.js";
import { model, nullable, opt, T } from "../platform/models.js";
import { errText, isJsonObject, strip, strRepr, truthy } from "../platform/py.js";
import { input } from "../platform/server.js";
import { providerPlan } from "./plans.js";
import { programFor, programStatus, programTypes } from "./programs.js";
import { construct, getLlmRegistry } from "./registry.js";
import { LLMProviderConfig } from "./schema.js";
import { DEFAULT_PROVIDERS } from "./seed.js";
import { deleteSignin, signinSummary } from "./signins.js";

const log = getLogger("llm_runner.llm.provider_api");

export const PROVIDER_TYPES = [
  "anthropic",
  "openai",
  "openai-compat",
  "gemini",
  "ollama",
  "deepseek",
  "openrouter",
  "xai",
  "mistral",
  // The person's installed Claude Code on their own Claude plan (claude_code.js) — no key, no address.
  "claude-code",
  // The bundled llama.cpp runner. Not offered as a user-pickable type in the UI (the
  // built-in provider is seeded), but allowed here so that seeded provider round-trips
  // through PATCH instead of 400-ing on save.
  "local-llamacpp",
];

// The host boundary (Python's ProviderStore Protocol): list() → LLMProviderConfig[],
// get(id) → config | null, add(cfg), replace(id, cfg), remove(id).

export const LLMProviderResponse = T.Object({
  id: T.String(),
  name: T.String(),
  providerType: T.String(),
  baseUrl: opt(T.String(), ""),
  defaultModel: opt(T.String(), ""),
  embeddingModel: opt(T.String(), ""),
  hasApiKey: T.Boolean(),
  registered: T.Boolean(), // true if the adapter is live in the registry
  timeoutSeconds: opt(T.Integer(), 60),
  local: opt(T.Boolean(), true), // the stored Local/Online choice — drives UI grouping
  // The kit's catalog key for a seeded provider still under its seeded name — a screen shows the
  // name in its own language; null once renamed, or for a brand name (seededNameKey).
  nameKey: opt(nullable(T.String()), null),
  // The person's own plan the provider draws on ("claude" | "chatgpt"), else null — nothing billed per call (plans.js)
  plan: opt(nullable(T.String()), null),
  // Sign in with ChatGPT on an OpenAI provider: `{method, email, signedIn}`, or null (signins.js)
  signin: opt(nullable(T.Object({ method: T.String(), email: T.String(), signedIn: T.Boolean() })), null),
});

export const LLMProviderList = T.Object({
  providers: T.Array(LLMProviderResponse),
  providerTypes: opt(T.Array(T.String()), PROVIDER_TYPES),
});

export const UpsertLLMProviderRequest = T.Object({
  // Optional on create: when blank, the server derives a slug id from `name` (one name to
  // type, not two). On PATCH the path param identifies the row, so the body id is ignored.
  id: opt(T.String({ maxLength: 80 }), ""),
  name: T.String({ minLength: 1, maxLength: 120 }),
  providerType: T.String(),
  baseUrl: opt(T.String(), ""),
  // `apiKey` is write-only — list responses never echo it. PATCH with an empty string means
  // "leave the existing key in place"; PATCH with null clears it.
  apiKey: opt(nullable(T.String()), null),
  defaultModel: opt(T.String(), ""),
  embeddingModel: opt(T.String(), ""),
  timeoutSeconds: opt(T.Integer(), 60),
  local: opt(T.Boolean(), true), // Local (on this machine) vs Online (metered cloud)
});

export const DetectedLocalProvider = T.Object({
  providerType: T.String(), // "ollama" | "openai-compat" | "claude-code" — a canonical PROVIDER_TYPES value
  name: T.String(),
  baseUrl: T.String(),
  models: T.Array(T.String()),
  alreadyRegistered: T.Boolean(),
  // an installed program (Claude Code): where it is and whether it's signed in (programs.js); null for a local server
  program: opt(nullable(T.Object({ path: T.String(), signedIn: T.Boolean(), plan: nullable(T.String()), detail: nullable(T.String()) })), null),
});

export const DetectLocalResponse = T.Object({
  detected: T.Array(DetectedLocalProvider),
});

// Seeded providers whose names are words, not brands (the seeded-words plan, 2026-10-18). The
// stored name stays the seed's English — what syncs and what a renamed row is compared with.
const SEEDED_NAME_KEYS = {
  "local-llamacpp": "kit.provider.seeded.builtIn",
  "openai-compat-local": "kit.provider.seeded.ollama",
  lmstudio: "kit.provider.seeded.lmStudio",
  unsloth: "kit.provider.seeded.unsloth",
  openrouter: "kit.provider.seeded.openRouter",
};
const SEEDED_NAMES = new Map(DEFAULT_PROVIDERS.map((p) => [p.id, p.name]));

/** The catalog key for a provider's name while it is still the seeded one, else null. */
export function seededNameKey(cfg) {
  const key = SEEDED_NAME_KEYS[cfg.id];
  return key && SEEDED_NAMES.get(cfg.id) === cfg.name ? key : null;
}

function toResponse(cfg, registered) {
  return model(LLMProviderResponse, {
    id: cfg.id,
    name: cfg.name,
    nameKey: seededNameKey(cfg),
    providerType: cfg.providerType,
    baseUrl: cfg.baseUrl,
    defaultModel: cfg.defaultModel,
    embeddingModel: cfg.embeddingModel,
    hasApiKey: truthy(cfg.apiKey),
    registered,
    timeoutSeconds: cfg.timeoutSeconds,
    local: cfg.local,
    plan: providerPlan(cfg)?.plan ?? null,
    signin: signinSummary(cfg.id),
  });
}

/** A URL-safe provider id from a display name ("My Local LLM" → "my-local-llm"), capped at
 * 80 chars to match the request id limit. */
function slugify(name) {
  // The result is ASCII, so slicing by UTF-16 unit is slicing by character, as Python does.
  const slug = strip(name)
    .toLowerCase()
    .replace(/[^a-z0-9]+/gu, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80)
    .replace(/-+$/, "");
  return slug || "provider";
}

/** `base`, or `base-2`, `base-3`, … — the first id not already taken. */
function uniqueId(store, base) {
  const existing = new Set(store.list().map((p) => p.id));
  if (!existing.has(base)) return base;
  let n = 2;
  while (existing.has(`${base}-${n}`)) n += 1;
  return `${base}-${n}`;
}

function checkType(providerType) {
  if (!PROVIDER_TYPES.includes(providerType)) {
    throw new HttpError(400, `unknown providerType ${strRepr(providerType)}. Allowed: ${PROVIDER_TYPES.join(", ")}`);
  }
}

/** Construct + register the adapter so the change takes effect live. A bad config is
 * persisted but logged-not-fatal (matches the prior JV behavior). */
function syncRegister(cfg) {
  try {
    getLlmRegistry().register(construct(cfg));
    return true;
  } catch (e) {
    log.warning(`LLM provider ${cfg.id} persisted but not registered: ${errText(e)}`);
    return false;
  }
}

/** Python's `d.get(k, dflt)` on parsed JSON: a non-dict raises (AttributeError), as it did. */
function dictGet(d, k, dflt) {
  if (!isJsonObject(d)) throw new TypeError(`'${Array.isArray(d) ? "list" : typeof d}' object has no attribute 'get'`);
  return Object.hasOwn(d, k) ? d[k] : dflt;
}

const PARAMS = T.Object({ provider_id: T.String() });

/**
 * Build the /v1/llm-providers router over a host-supplied ProviderStore.
 *
 * `allowKeyReveal` (default OFF, #12 C6): mounts POST `/v1/llm-providers/{id}/key/reveal`,
 * which returns a saved provider's plaintext key (so the UI can pre-fill a masked field the
 * user can edit). A credential-returning endpoint, so its safety is a per-mounting-app
 * property: the HOST must guard mutating `/v1` requests with an origin check (JW's
 * CsrfOriginMiddleware). JW opts IN; an app with no such guard (JustVoice — conditional
 * CORS + bearer auth only, verified 2026-07-17) keeps the SAFE default, so the route is
 * simply absent there. NEVER log the key.
 */
export function makeProviderRouter(getStore, allowKeyReveal = false) {
  const app = new Hono();
  app.get("/v1/llm-providers", async (c) => {
    const registeredIds = new Set(getLlmRegistry().ids());
    return c.json(
      model(LLMProviderList, {
        providers: getStore()
          .list()
          .map((cfg) => toResponse(cfg, registeredIds.has(cfg.id))),
      }),
    );
  });

  app.post("/v1/llm-providers", input({ body: UpsertLLMProviderRequest }), async (c) => {
    const body = c.req.valid("json");
    checkType(body.providerType);
    const store = getStore();
    // Derive the id from the name when the client doesn't supply one.
    const providerId = strip(body.id) || uniqueId(store, slugify(body.name));
    if (store.get(providerId) != null) {
      throw new HttpError(400, `LLM provider id ${strRepr(providerId)} already exists`);
    }
    const cfg = model(LLMProviderConfig, {
      id: providerId,
      name: body.name,
      providerType: body.providerType,
      baseUrl: body.baseUrl,
      apiKey: body.apiKey || null,
      defaultModel: body.defaultModel,
      embeddingModel: body.embeddingModel,
      timeoutSeconds: body.timeoutSeconds,
      local: body.local,
    });
    store.add(cfg);
    const registered = syncRegister(cfg);
    return c.json(toResponse(cfg, registered), 201);
  });

  app.patch(
    "/v1/llm-providers/:provider_id",
    input({ params: PARAMS, body: UpsertLLMProviderRequest }),
    async (c) => {
      const providerId = c.req.valid("param").provider_id;
      const body = c.req.valid("json");
      checkType(body.providerType);
      const store = getStore();
      const existing = store.get(providerId);
      if (existing == null) throw new HttpError(404, `LLM provider ${providerId}`);
      // empty string preserves the prior key (write-only field); null clears it.
      const apiKey = body.apiKey === "" ? existing.apiKey : body.apiKey;
      const cfg = model(LLMProviderConfig, {
        id: existing.id, // id is immutable; reassigning would orphan feature pins
        name: body.name,
        providerType: body.providerType,
        baseUrl: body.baseUrl,
        apiKey,
        defaultModel: body.defaultModel,
        embeddingModel: body.embeddingModel,
        timeoutSeconds: body.timeoutSeconds,
        local: body.local,
      });
      store.replace(providerId, cfg);
      getLlmRegistry().deregister(cfg.id);
      const registered = syncRegister(cfg);
      return c.json(toResponse(cfg, registered));
    },
  );

  app.delete("/v1/llm-providers/:provider_id", input({ params: PARAMS }), async (c) => {
    const providerId = c.req.valid("param").provider_id;
    const store = getStore();
    if (store.get(providerId) == null) throw new HttpError(404, `LLM provider ${providerId}`);
    // a ChatGPT sign-in goes with its provider: revoked at OpenAI, then its row
    if (signinSummary(providerId)?.signedIn) await (await import("./chatgpt_signin.js")).signOut(providerId);
    deleteSignin(providerId);
    store.remove(providerId);
    getLlmRegistry().deregister(providerId);
    return c.json({ deleted: true });
  });

  // ── Sign in with ChatGPT on an OpenAI provider (chatgpt_signin.js) ──
  // POST starts it → {authorizeUrl} for the person's browser on this machine; GET says where it stands; DELETE signs out.
  const signinFlow = () => import("./chatgpt_signin.js");
  const openaiProvider = (providerId) => {
    const cfg = getStore().get(providerId);
    if (cfg == null) throw new HttpError(404, `LLM provider ${providerId}`);
    if (cfg.providerType !== "openai") throw new HttpError(400, "Sign in with ChatGPT is for an OpenAI provider");
    return cfg;
  };
  app.post(
    "/v1/llm-providers/:provider_id/signin",
    input({ params: PARAMS, body: T.Object({ appName: opt(T.String({ maxLength: 120 }), "") }) }),
    async (c) => {
      const providerId = c.req.valid("param").provider_id;
      openaiProvider(providerId);
      try {
        return c.json(await (await signinFlow()).startSignin(providerId, { appName: c.req.valid("json").appName }));
      } catch (e) {
        throw new HttpError(502, `Couldn't reach OpenAI's sign-in: ${errText(e)}`);
      }
    },
  );
  app.get("/v1/llm-providers/:provider_id/signin", input({ params: PARAMS }), async (c) => {
    const providerId = c.req.valid("param").provider_id;
    openaiProvider(providerId);
    return c.json({ signin: signinSummary(providerId), progress: (await signinFlow()).signinProgress(providerId) });
  });
  app.delete("/v1/llm-providers/:provider_id/signin", input({ params: PARAMS }), async (c) => {
    const providerId = c.req.valid("param").provider_id;
    openaiProvider(providerId);
    await (await signinFlow()).signOut(providerId); // its next call uses the API key again, if it has one
    return c.json({ signin: signinSummary(providerId) });
  });

  // The plan a provider draws on and how much of it is used (plans.js) — the provider card's line. For Claude Code
  // also whether the program is installed and signed in (programs.js).
  app.get("/v1/llm-providers/:provider_id/plan", input({ params: PARAMS }), async (c) => {
    const providerId = c.req.valid("param").provider_id;
    const cfg = getStore().get(providerId);
    if (cfg == null) throw new HttpError(404, `LLM provider ${providerId}`);
    const plan = providerPlan(cfg);
    const program = programTypes().includes(cfg.providerType) ? await programStatus(cfg.providerType) : null;
    return c.json({ plan, program });
  });

  // Probe the well-known local LLM servers (Ollama :11434, LM Studio :1234) — powers the
  // first-run "Ollama detected → Connect" row. `?programs=1` also looks for the AI programs
  // installed on this computer (Claude Code — programs.js): a file lookup, then the program's
  // own sign-in status (0.7–2 s, cached briefly).
  app.get("/v1/llm-providers/detect-local", input({ querystring: T.Object({ programs: opt(T.Integer(), 0) }) }), async (c) => {
    const registeredUrls = new Set(
      getStore()
        .list()
        .map((p) => (p.baseUrl || "").replace(/\/+$/, "")),
    );
    const out = [];
    const probes = [
      [
        "ollama",
        "Ollama (local)",
        "http://127.0.0.1:11434",
        "/api/tags",
        (d) => dictGet(d, "models", []).map((m) => dictGet(m, "name", "")),
      ],
      [
        "openai-compat",
        "LM Studio (local)",
        "http://127.0.0.1:1234",
        "/v1/models",
        (d) => dictGet(d, "data", []).map((m) => dictGet(m, "id", "")),
      ],
    ];
    for (const [ptype, name, base, path, extract] of probes) {
      try {
        const r = await http.fetch(base + path, { timeoutMs: 1500 });
        if (r.status !== 200) continue;
        const models = extract(await r.json()).filter((m) => truthy(m));
        out.push(
          model(DetectedLocalProvider, {
            providerType: ptype,
            name,
            baseUrl: base,
            models,
            alreadyRegistered: registeredUrls.has(base),
          }),
        );
      } catch {
        // a down probe is just "not detected"
      }
    }
    if (c.req.valid("query").programs) {
      const types = new Set(getStore().list().map((p) => p.providerType));
      for (const ptype of programTypes()) {
        try {
          const st = await programStatus(ptype);
          if (!st.installed) continue;
          out.push(
            model(DetectedLocalProvider, {
              providerType: ptype,
              name: st.name,
              baseUrl: "",
              models: [...(programFor(ptype)?.models ?? [])],
              alreadyRegistered: types.has(ptype),
              program: { path: st.path, signedIn: st.signedIn, plan: st.plan, detail: st.detail },
            }),
          );
        } catch (e) {
          log.warning(`looking for the ${ptype} program failed: ${errText(e)}`);
        }
      }
    }
    return c.json(model(DetectLocalResponse, { detected: out }));
  });

  if (allowKeyReveal) {
    // Return a saved provider's plaintext key so the UI can pre-fill a masked, editable
    // field (#12 C6). POST (not GET — a GET is world-readable). Guarded by the host's
    // origin-check middleware; opt-in only. NEVER logged.
    app.post("/v1/llm-providers/:provider_id/key/reveal", input({ params: PARAMS }), async (c) => {
      const providerId = c.req.valid("param").provider_id;
      const cfg = getStore().get(providerId);
      if (cfg == null) throw new HttpError(404, `LLM provider ${providerId}`);
      return c.json({ apiKey: cfg.apiKey || "" });
    });
  }
  return app;
}
