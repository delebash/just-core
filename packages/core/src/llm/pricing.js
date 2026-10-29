// SPDX-License-Identifier: MIT
// Cloud pricing for the usage ledger (the port of llm/pricing.py). The AUTHORITATIVE
// source is the DB `model_pricing` table (seeded from DEFAULT_PRICING below, editable via
// /v1/ai/pricing); DEFAULT_PRICING is only the seed source + a no-DB fallback. Local
// providers have no entry → `priceFor` returns null, cost 0.

import * as stores from "./stores.js";

// [input, output, cache write, cache read] USD per 1,000,000 tokens (the cache rates only where a provider caches —
// Claude's 5-minute writes and its hits, from Anthropic's pricing page, read 2026-10-29). SEED SOURCE — the live
// values are the DB.
export const DEFAULT_PRICING = {
  // OpenAI
  "gpt-5": [1.25, 10.0],
  "gpt-5-mini": [0.25, 2.0],
  "gpt-5-nano": [0.05, 0.4],
  "gpt-4o": [2.5, 10.0],
  "gpt-4o-mini": [0.15, 0.6],
  "gpt-4.1": [2.0, 8.0],
  "gpt-4.1-mini": [0.4, 1.6],
  // OpenAI's 6.1 Sol (JustVoice RESEARCH §10.2, checked 2026-10-11)
  "gpt-6.1-sol": [2.0, 10.0],
  // Anthropic Claude — the 5.x rows from JustVoice RESEARCH §10.2 (Anthropic's prices, checked
  // 2026-10-10; Haiku 5.5's is for prompts up to 100K tokens)
  "claude-fable-5-1": [10.0, 50.0, 12.5, 0.25],
  "claude-opus-5-5": [4.0, 20.0, 5.0, 0.2],
  "claude-sonnet-5-5": [2.0, 10.0, 2.5, 0.1],
  "claude-haiku-5-5": [0.1, 0.5, 0.125, 0.01],
  "claude-fable-5": [10.0, 50.0, 12.5, 1.0],
  "claude-opus-4-8": [5.0, 25.0, 6.25, 0.5],
  "claude-opus-4-7": [5.0, 25.0, 6.25, 0.5],
  "claude-sonnet-4-6": [3.0, 15.0, 3.75, 0.3],
  "claude-haiku-4-5": [1.0, 5.0, 1.25, 0.1],
  // Google Gemini
  "gemini-2.5-pro": [1.25, 5.0],
  "gemini-2.5-flash": [0.3, 2.5],
};

/** The live price map (the DB), or DEFAULT_PRICING when the DB is unavailable/unseeded. */
function livePricing() {
  try {
    const live = stores.getPricingStore().asMap();
    return Object.keys(live).length ? live : DEFAULT_PRICING;
  } catch {
    return DEFAULT_PRICING;
  }
}

/** Exact (lowercased) match first, then prefix match (dated suffixes). null = unknown. */
export function priceFor(modelId) {
  if (!modelId) return null;
  const mid = String(modelId).toLowerCase();
  const pricing = livePricing();
  if (Object.hasOwn(pricing, mid)) return pricing[mid];
  for (const [key, p] of Object.entries(pricing)) {
    if (mid.startsWith(key)) return p;
  }
  return null;
}

/** USD for one call. `promptTokens` is the whole prompt; the part a prompt cache wrote (`cacheWrite`) or read
 *  (`cacheRead`) is priced at the model's cache rates — at its input rate where it has none (never under-reported). */
export function costFor(modelId, promptTokens, completionTokens, { cacheWrite = 0, cacheRead = 0 } = {}) {
  const p = priceFor(modelId);
  if (!p) return 0.0;
  const [inp, out, write = 0, read = 0] = p;
  const plain = Math.max(0, promptTokens - cacheWrite - cacheRead);
  return (plain * inp + cacheWrite * (write || inp) + cacheRead * (read || inp) + completionTokens * out) / 1_000_000;
}
