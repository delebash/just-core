// SPDX-License-Identifier: MIT
// Shared provider-connect — the ONE source of the known-provider PRESETS + the connect
// endpoints (probe-models · create · list-models), consumed by ProviderForm (add/edit a
// provider — the one place providers are set up; QuickSetup is LOCAL-ONLY per the 2026-07-06
// user decision and no longer connects providers) and by useProviderModels (listModels).
// RULE #7: extract, don't copy — a hand-rolled probe/create would drift (ProviderForm's own
// probe already diverged internally once). Lives in the kit's llm layer composables/ (moved
// at C6, 2026-07-06 — llm-endpoint code; the common/ charter bans upward imports).
// (detectLocal — the well-known-local-servers probe over /v1/llm-providers/detect-local —
// was pruned 2026-07-06 when the QuickSetup connect flow, its only consumer, was removed;
// the server endpoint remains for a future ProviderForm affordance.)
import { request } from "../client.js";

// Known providers, as start-from-a-preset chips: { name, baseUrl, providerType, local }. The names
// are product names, except the local engine's, which is a word: it carries its catalog key
// (`labelKey`) instead, and the form translates it.
const preset = (name, baseUrl, providerType, local) => ({ name, baseUrl, providerType, local });
export const PROVIDER_PRESETS = [
  { labelKey: "kit.provider.presetLocalEngine", baseUrl: "http://localhost:8080/v1", providerType: "openai-compat", local: true },
  preset("Ollama", "http://localhost:11434", "ollama", true),
  preset("LM Studio", "http://localhost:1234/v1", "openai-compat", true),
  // Unsloth Studio speaks OpenAI-compatible; port from its own docs' curl example
  // (8888), which is the one it prints — see the seed row's comment for why it is
  // NOT in detect-local (it requires a Bearer key on every request).
  preset("Unsloth Studio", "http://localhost:8888/v1", "openai-compat", true),
  // The person's installed Claude Code on their own Claude plan — a word label (the proposed label the user's go
  // covered, 2026-11-07), no URL.
  { labelKey: "kit.provider.claudeCode.name", baseUrl: "", providerType: "claude-code", local: false },
  preset("OpenAI", "https://api.openai.com/v1", "openai", false),
  preset("Anthropic", "https://api.anthropic.com", "anthropic", false),
  preset("Gemini", "https://generativelanguage.googleapis.com", "gemini", false),
  preset("OpenRouter", "https://openrouter.ai/api/v1", "openrouter", false),
  preset("xAI (Grok)", "https://api.x.ai/v1", "xai", false),
  preset("Mistral", "https://api.mistral.ai/v1", "mistral", false),
];

// Provider types that are ALWAYS a metered cloud API — there is no local
// Anthropic/Gemini/OpenAI/DeepSeek/OpenRouter server, so where-it-runs is not a
// choice for them. `openai-compat` and `ollama` are deliberately absent: both
// genuinely run local (LM Studio, a self-hosted box) or remote (OpenRouter-style
// gateways) — see the presets above carrying both flavors of openai-compat.
// claude-code is the person's own Claude Code: it runs on this computer, but the text goes to Anthropic on their plan.
export const ONLINE_ONLY_TYPES = new Set(["anthropic", "gemini", "openai", "deepseek", "openrouter", "xai", "mistral", "claude-code"]);

// Provider types that run a program the person installed (the server's llm/programs.js): no address, no key.
export const PROGRAM_TYPES = new Set(["claude-code"]);

// The AI programs installed on this computer (Claude Code), each `{providerType, name, models, alreadyRegistered,
// program: {path, signedIn, plan, detail}}` — the server's detect probe with `programs=1` (a file lookup, then the
// program's own sign-in status). Asked by the AI settings screen only: each look costs a second or two.
export async function detectPrograms() {
  const r = await request("/v1/llm-providers/detect-local?programs=1");
  return (r?.detected || []).filter((d) => d.program);
}

// A saved provider's plan and how much of it is used → `{plan: {plan, used, window, resetsAt} | null, program: {…} | null}`.
export async function providerPlan(providerId) {
  return request(`/v1/llm-providers/${encodeURIComponent(providerId)}/plan`);
}

// Sign in with ChatGPT on a saved OpenAI provider: start → `{authorizeUrl}` (open it in the browser on this computer);
// status → `{signin: {method, email, signedIn} | null, progress: {status: "none"|"waiting"|"done"|"error", error}}`;
// sign out → `{signin}`.
export async function startChatgptSignin(providerId, appName = "") {
  return request(`/v1/llm-providers/${encodeURIComponent(providerId)}/signin`, { method: "POST", body: { appName } });
}
export async function chatgptSigninStatus(providerId) {
  return request(`/v1/llm-providers/${encodeURIComponent(providerId)}/signin`);
}
export async function signOutChatgpt(providerId) {
  return request(`/v1/llm-providers/${encodeURIComponent(providerId)}/signin`, { method: "DELETE" });
}

// List a (draft) provider's models BEFORE it's saved — the shared draft-probe. Returns
// the cleaned split { models: chat ids, embeddings: string[], hiddenCount: N, error? }
// (#8; the server applies the provider TYPE's model-list rules). `all: true` bypasses the
// rules (the form's "show all"). `apiKey` empty → null (a local provider needs none).
export async function probeModels({ providerType, baseUrl, apiKey, defaultModel, all } = {}) {
  return request("/v1/llm-providers/probe-models", {
    method: "POST",
    body: {
      providerType,
      baseUrl,
      apiKey: apiKey || null,
      ...(defaultModel ? { defaultModel } : {}),
      ...(all ? { all: true } : {}),
    },
  });
}

// Create a provider (the id is derived server-side from the name). `body` is the full
// UpsertLLMProviderRequest shape; returns the created provider (LLMProviderResponse).
export async function createProvider(body) {
  return request("/v1/llm-providers", { method: "POST", body });
}

// List a SAVED/registered provider's models — uses the adapter's STORED key server-side
// (GET /v1/llm-providers/{id}/models → { models: chat ids, embeddings: string[],
// hiddenCount: N, error? }; the server applies the provider TYPE's model-list rules, #8;
// the error is returned as DATA, not raised, so callers must surface it). `all: true`
// (→ ?all=1) bypasses the rules and returns the raw unfiltered list. Unlike probeModels
// (the pre-save DRAFT probe, which needs a client-supplied key), this serves an
// already-persisted provider whose key is write-only.
export async function listModels(providerId, { all = false } = {}) {
  const q = all ? "?all=1" : "";
  return request(`/v1/llm-providers/${encodeURIComponent(providerId)}/models${q}`);
}

// Reveal a SAVED provider's plaintext key so the form can pre-fill a masked, editable
// field (#12 C6). POST — a GET would be world-readable; the endpoint is opt-in server-side
// (the host mounts it only behind an origin-check middleware). Returns the key string, or
// "" when none is stored. Never log or persist the result.
export async function revealKey(providerId) {
  const r = await request(`/v1/llm-providers/${encodeURIComponent(providerId)}/key/reveal`, {
    method: "POST",
  });
  return r?.apiKey || "";
}

/** The shared provider-connect surface. Every consumer gets the SAME presets + endpoints. */
export function useProviderConnect() {
  return { PROVIDER_PRESETS, probeModels, createProvider, listModels, revealKey, detectPrograms, providerPlan, startChatgptSignin, chatgptSigninStatus, signOutChatgpt };
}
