// SPDX-License-Identifier: MIT
// A preset's own settings by the kind of model it runs (docs/plans/2026-10-24-engines-the-llama-way.md, K8b): a chat
// preset's are its fields (temperature, top-p, max tokens, think, samplers); an image preset's live in `params` —
// sd-server's native job settings (github.com/leejet/stable-diffusion.cpp/blob/master/examples/server/api.md:
// sample_params.sample_method / sample_steps / guidance.txt_cfg, strength, seed). Each is bounded here, so a value
// out of range is refused in words instead of reaching the engine.
import { RequestValidationError } from "../platform/errors.js";

/** sd-server's samplers (`sample_method`). */
export const IMAGE_SAMPLERS = Object.freeze(["euler", "euler_a", "heun", "dpm2", "dpm++2s_a", "dpm++2m", "dpm++2mv2", "ipndm", "ipndm_v", "lcm", "ddim_trailing", "tcd"]);

/** Each kind's settings: name → [type, min, max] or a list of allowed values; the default when it's missing. */
export const PARAM_RULES = Object.freeze({
  image: Object.freeze({
    steps: { type: "int", min: 1, max: 150, default: 4 },
    cfg: { type: "number", min: 0, max: 30, default: 1 },
    strength: { type: "number", min: 0, max: 1, default: 1 },
    sampler: { values: IMAGE_SAMPLERS, default: "euler" },
    seed: { type: "int", min: -1, max: 2 ** 31 - 1, default: 42 },
  }),
  // a vision model in-process (ONNX Runtime — the plan's K6): where it runs — "auto" puts what the app's adapter
  // sends to a GPU on one (DirectML on Windows), "cpu" keeps all of it on the processor (runner/onnx.js)
  vision: Object.freeze({
    executionProvider: { values: Object.freeze(["auto", "cpu"]), default: "auto" },
  }),
  // transcription (audio.cpp — round E, 2026-10-29): where its model runs — "auto" lets the runtime decide (the card when
  // it fits, the CPU when it's fast enough there), "gpu" / "cpu" pin it. Speech (tts) has no preset: the voice chooses.
  stt: Object.freeze({
    placement: { values: Object.freeze(["auto", "gpu", "cpu"]), default: "auto" },
  }),
});

/** `params` for a preset of `kind`, checked against its rules and filled with the defaults; a chat preset's are `{}`. */
export function presetParams(kind, params) {
  const rules = PARAM_RULES[kind];
  if (!rules) return {};
  const given = params && typeof params === "object" ? params : {};
  const out = {};
  const errors = [];
  for (const [name, rule] of Object.entries(rules)) {
    const v = given[name] ?? rule.default;
    if (rule.values) {
      if (!rule.values.includes(v)) errors.push({ type: "enum", loc: ["body", "params", name], msg: `Input should be one of ${rule.values.join(", ")}`, input: v });
      else out[name] = v;
      continue;
    }
    const n = Number(v);
    const whole = rule.type === "int" ? Number.isInteger(n) : Number.isFinite(n);
    if (!whole) errors.push({ type: rule.type === "int" ? "int_type" : "float_type", loc: ["body", "params", name], msg: `Input should be a valid ${rule.type === "int" ? "integer" : "number"}`, input: v });
    else if (n < rule.min) errors.push({ type: "greater_than_equal", loc: ["body", "params", name], msg: `Input should be greater than or equal to ${rule.min}`, input: v, ctx: { ge: rule.min } });
    else if (n > rule.max) errors.push({ type: "less_than_equal", loc: ["body", "params", name], msg: `Input should be less than or equal to ${rule.max}`, input: v, ctx: { le: rule.max } });
    else out[name] = n;
  }
  if (errors.length) throw new RequestValidationError(errors);
  return out;
}
