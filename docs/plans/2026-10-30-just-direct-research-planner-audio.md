# JustDirect research: local film planner and local music and sound effects

Date: 2026-10-30. Items 7, 8 and 11 of feasibility section J.

**Nothing was run.** No model, no download of weights, no use of the card. Every speed or memory figure below comes from a named source. Every 8 GB outlook for audio is reasoned, not measured.

Proof labels used throughout:
- **measured-here**: already measured on this PC, read from the family's records.
- **code**: read in the source (llama.cpp master 5047748 of 2026-10-30, audio.cpp fork at 71543544). The three parser files that matter are byte-identical at the kit's pinned b11960.
- **API**: returned by the Hugging Face API (file sizes, GGUF metadata, chat template).
- **card**: stated by the maker, not independent.
- **report**: a measurement in a repo's docs or a PR, on someone else's hardware.
- **user**: a user report in an issue.
- **secondary**: a third party reporting someone else's result.
- **unverified**: no source I could check.

Machine target: 8 GB card is the floor; each option also says what 12, 16, 24 GB and up get. Sections E to H are treated as settled. Sections A and B claims I rely on are re-checked in section 6.

---

## 1. What changed the picture

1. **`tools` cannot force a valid plan on this family's best 8 GB model. `response_format` can.** In llama.cpp, Gemma 4's tool arguments get a syntax-only grammar; the tool's schema is not applied (code: `common/parsers/gemma4.cpp`, the line reading "TODO ... need to extend json-schema-to-grammar", `const auto & params` commented out; PR #23247 to fix it is still open). Its `response_format` path does apply the schema.
2. **`tool_choice: "required"` does not force a call on Qwen 3.5, 3.6, 3.8 or Ornith.** The grammar is reasoning, then free content, then tool calls, so the model can write prose until `max_tokens` (code: `common/parsers/qwen3-coder.cpp`; user: #27767 and #27217, both closed as stale, not fixed).
3. **`response_format` is the one path that forces the schema across every parser I read**, and it holds with thinking on. So the kit's law "llama.cpp drops JSON-schema enforcement when thinking is on" is out of date for `response_format` (code; #20345 closed 2026-03-10). It still holds for the raw `grammar` field (#22537).
4. **Consistency can be enforced by the grammar instead of checked afterwards.** Build each pass's schema from the previous pass's output: `anchorIds` becomes an `enum` of saved card ids, and a revision's target becomes an `enum` that leaves out locked shots. A model then cannot name a card that does not exist or touch a shot the user locked. This is my design from reading the code; it has not been run.
5. **BF16 weights are a slow path on this card.** ggml's `supports_bf16` needs compute capability at Ampere or newer; the RTX 2070 SUPER is Turing (code: `ggml-cuda.cu:1757`). A 2080 Ti user reports MiniMax Music 3 ran over an hour on 60 s with no result, and the maintainer points at this gate (#255). This affects which audio packages to pick here.
6. **audio.cpp keeps all weights on the card and has no CPU offload** (maintainer, #103). So the official "<4 GB" for ACE-Step does not carry over; that figure relies on Python offload and INT8.
7. **The ranked music result that exists:** Artificial Analysis Music Arena v1.1 (37,000+ blind votes) puts MiniMax Music 3.0 as top open-weights (Elo 1000) and Stable Audio 3 Medium at 998 on instrumentals (secondary). ACE-Step is not mentioned there.

---

## 2. Planner

### 2.1 What llama.cpp enforces, by format (all code, pinned b11960)

| Format family | Models | `response_format` schema forced? | Tool args under schema? | `required` forces a call? |
|---|---|---|---|---|
| Gemma 4 handler | Gemma 4 all sizes, Nemotron 3.5 Bolt E4B | Yes, fenced ```json; thought channel allowed before it | **No**, syntax only | Yes, after the thought |
| Qwen3-Coder handler (`<function=`, `<parameter=`) | Qwen 3.5, 3.6, 3.8, Ornith, Granite 4.2, Nemotron 3.5 Bolt 74B, LFM3 | Yes | Non-string args yes; string args are free text | **No**, free content allowed first |
| Ministral 3 handler | Ministral 3, Magistral | Yes, fenced | **Yes**, the whole args object | No, content until `[TOOL_CALLS]` |
| Autoparser, tagged args (`<arg_key>`) | GLM 4.7 and 5.3, Hy, Spark, Laguna, flint | Yes, fence optional | Non-string yes, strings free | Not read to the end |
| Ling 3 handler | Ling 3.0, 3.1 | Yes (#29813) | Non-string yes | Grammar not lazy when required |

Open bugs that touch this path:
- **#30256, open:** on Gemma 4 the `response_format` grammar allows a thought channel even with `enable_thinking: false`. With long prompts the thought may never close and the request ends on `finish_reason: length`. Reported on E2B. Unknown on 26B-A4B. The kit's run here (nested schema, think off, 10 of 10 requests through the router) was short. Guard: `reasoning_budget_tokens`, which is per-request (code: `server-common.cpp:1519`).
- **#29655 and #25986:** Gemma 4 tool calls carrying long multi-line strings fail to parse. A shot list is exactly that shape. Another reason to use `response_format`.
- **#27733, open:** on Qwen 3.8 a trailing `<think>` discards a finished generation (about twice a day under heavy agent use, tools path).
- **#31328:** LFM3 with `response_format` plus `enable_thinking: false` failed; closed today, cause under discussion as a template issue. Not relevant to the picks.
- **#27279 (35 to 40% HTTP 500 on `response_format`):** do not carry this forward. It was a parser spacing bug, fixed by #24835 on 2026-06-20 and included in the pin.

### 2.2 How large a schema the grammar handles (code)

There is no size limit in bytes. The limits are structural:

| Limit | Value | Where | What it means for us |
|---|---|---|---|
| Schema nesting | 128 levels | `COMMON_RECURSIVE_LIMIT`, `common.h:34` | Far above Nomi's depth |
| Grammar recursion | 256 | `llama-grammar.cpp:15` | Fine |
| Repetition | 2000 | `MAX_REPETITION_THRESHOLD` | `maxLength: 2000` or more, or `maxItems` that high, is refused or was broken (#25746, #25923). Leave `maxLength` off prompt strings |
| Rules × repetition | 2000 | `llama-grammar.cpp:503` | Item rules are one reference, so `maxItems: 24` costs 24 |
| Regex `pattern` | must be anchored `^...$` | `_pattern_to_rule` | Unanchored patterns are dropped to "any string" with a warning |
| One bad tool schema | fails the whole request | #25923 | Keep every schema in a test |

Unsupported features are skipped silently (`grammars/README.md`), so a schema must be checked after decoding too. The kit's law "keep schemas flat" stands. Nomi's own note records 0 of 18 success when the model was not told the 25 field names, which is a prompting failure, not a grammar one (`canvasModelShapes.ts`). A user report says a 51-tool request with a 48-field tool became "extremely slow" but still compiled (#28522, whose real cause was a proxy dropping fields). Nobody reports a limit near Nomi's size. The real ceiling is untested; the ladder in 2.6 measures it. `llguidance` exists but is off by default (`LLAMA_LLGUIDANCE OFF`), so the pinned Windows build should not have it; not checked in the binary.

### 2.3 Ranked for the 8 GB floor (best first; quality first, then proof)

| # | Model | What it is | Proof | Weights, size, licence | 8 GB outlook and why | Engine path |
|---|---|---|---|---|---|---|
| 1 | **Qwen3.8-27B GSQ-RCO IQ3_S** | Newest strong 27B with a 2026 non-uniform quant | card only: IFBench 79.5 vs Qwen3.6-27B 69.1; IQ3_S "task-lossless" within 0.51 on GPQA-D. API sizes | ISTA-DASLab, 11.77 GB. IQ3_XXS 10.09, IQ2_XS 8.42. Apache-2.0 | Runs but spills. Dense, so expect the cliff: Bonsai 27B dense here gave 2.65 tok/s at 38 of 65 layers (measured-here). Estimate 2 to 4 tok/s, about 20 to 30 minutes per pass. Breaks no rule since speed is not pass or fail. Revision would feel slow | llama-server. Types IQ2_XS, IQ3_XXS, IQ3_S exist in mainline (code `ggml.h`). Qwen3-Coder handler. Use `response_format` |
| 2 | **Gemma 4 26B-A4B UD-Q4_K_XL** | Family's flagship MoE, 4B active | **measured-here**: 33.3 tok/s, 36.3 with draft, b11960; 6,844 MB on card; nested schema, think off, answered under draft-mtp, 10 of 10 requests | unsloth, 14.25 GB, **already on disk**. Apache-2.0 | Good, the only option proven on this card. Needs RAM headroom (kit: 21.5 GB leg peak) | llama-server. Gemma 4 handler. `response_format` only, and watch #30256 |
| 3 | **Ornith-1.5-9B Q4_K_M** | 9B dense, self-improved from Qwen 3.5 and Gemma 4 lineage | card only: SWE-bench Verified 70.6 vs Qwen3.5-9B 53.2, ClawEval 66.5 vs 53.2; five-run averages; coding-heavy. 5.3M downloads (API). One user reports tool loops on GitHub tools (#28522 comment) | ornith-ai, 5.78 GB. Q5 6.64, Q6 7.56. MIT | Fits fully on the card with room for 16K context. Expect around 40 tok/s by analogy with Gemma 12B at 39 to 41 (measured-here, different model). Kit rule: a community model needs a measured win before seeding | llama-server. Qwen3-Coder handler. `response_format` |
| 4 | Qwen3.6-35B-A3B UD-Q4_K_XL | Official MoE, 3B active | report in kit: 33 to 36 tok/s at ~7 GB on a 12 GB 3060. JustWrite: 2× slower than flagship here (measured-here, trimmed). Tops Ornith's table on most rows (card) | unsloth, 22.36 GB. Apache-2.0 | Fits by placing experts in RAM. Needs 32 GB RAM. `required` bug #27767 reproduced on this exact family | llama-server. `response_format` |
| 5 | Qwen-AgentWorld-35B-A3B | Qwen's agent-tuned 35B | card; 22.32 GB Q4 (API) | unsloth GGUF. Apache-2.0 | Same as row 4. Quality for planning not checked | llama-server |
| 6 | Qwen3.5-9B Q4 | Official 9B, the control for Ornith | Most-cited for 8 GB (SEO lists only). Its sibling Qwen3.5-4B leads NVIDIA's same-harness Q4 table on BFCL-v3 70.56, Tau2 61.74, RULER 95.37 (card, vendor harness) | unsloth, 5.97 GB UD-Q4_K_XL. Apache-2.0 | Fits fully | llama-server |
| 7 | Gemma 4 12B UD-Q4_K_XL | Kit's seed for 8 GB + 16 GB RAM | **measured-here**: 39.1 to 41 tok/s with `--fit off`; `--fit` alone gives 21 tok/s | 6.72 GB, on disk. Apache-2.0 | Fits with `--fit off`. Context tight | llama-server, Gemma 4 handler |
| 8 | Nemotron 3.5 Bolt E4B UD-Q4_K_XL | NVIDIA's post-trained Gemma 4 E4B | card, NVIDIA NeMo Gym harness, Q4: StructEval-T 79.99 vs Gemma E4B 77.28; Tau2 52.32 vs 38.72; IFBench 64.0 vs 42.67. Built for voice assistants | 5.06 GB. openmdw-1.1 | Fits fully. Same handler limits as Gemma | llama-server |
| 9 | Granite 4.2 8B Q4_K_M | IBM, native reasoning | card, no tool scores found | 5.35 GB. Apache-2.0 | Fits fully | llama-server, Qwen3-Coder handler |
| 10 | Ministral 3 8B Q4_K_M | Mistral, Dec 2025 | Only native tool path with the whole args object under schema (code) | 5.20 GB; 14B 8.24 GB. Apache-2.0 | 8B fits; 14B spills | llama-server, Ministral handler |
| - | Older: Qwen3-8B Q4 | Docker eval: F1 0.919 (14B 0.971), old study | bench, 15 months old | 5.03 GB | Fits, superseded. "Qwen3 7B": no official model found, only community re-uploads and 1.7B | llama-server |
| - | Too small for film plans | LFM3-1.7B, Spark-X2.6-4B, Dory 4B, Ling-3.0-tiny | API sizes only | 1.1 to 4.8 GB | Fit; not ranked, not read for quality | llama-server |

**Not on 8 GB + 32 GB RAM** (API sizes): Mistral Small 4 119B (smallest 32.31 GB), GLM-5.3-Flash 320B (93.09 GB), Qwen3.8-Flash-Next (66.42 GB), DeepSeek V4.1 Flash, Ling-3.0-flash (77.01 GB), Ornith-1.5-122B (40.36 GB), Mistral Large 4.

**Attack on this ranking.** "A spilling model at #1 contradicts 'runs well'." The user's own words in section J put quality first and time last, so it stays, but only if the test shows a visible quality gain over #2. If not, #2 wins on cost. The attack changed one thing: Qwen3.8 runs 5 seeds, not 20. The second attack: all quality evidence above is maker-reported and on coding or agent tasks, none on film planning. So this order is a test order, not a result.

### 2.4 Best per machine

| Tier | Best pick | Size and VRAM source | What it buys |
|---|---|---|---|
| 8 GB, 16 GB RAM | Ornith-1.5-9B Q4 or Gemma 4 12B | 5.78 GB (API); 12B 6.7 GB on card (measured-here) | No RAM dependence; MoE is RAM-gated (kit law) |
| 8 GB, 32 GB RAM | Gemma 4 26B-A4B; Qwen3.8-27B IQ3_S if slow is accepted | 6,844 MB on card (measured-here) | Larger model through RAM |
| 12 GB | **Qwen3.8-27B GSQ-RCO IQ3_XXS** 10.09 GB, or IQ3_S 11.77 GB with short context | API; card says IQ3_S is task-lossless. Kit's seed here is Gemma 12B at ~10.7 GB resident | The newest 27B almost fully resident, so normal speed |
| 16 GB | Qwen3.8-27B GSQ-RCO IQ3_S 11.77 GB, 32K context | KV at q8 about 2.3 GB, derived from the kit's 133,120 bytes per token for Qwen3.6-27B; estimate, not measured | Fully resident with room for long stories |
| 24 GB | Qwen3.8-27B UD-Q5_K_XL 20.88 GB, or Q4 17.56 GB. Alternative: Nemotron 3.5 Bolt 74B-A9B-24GB 22.02 GB | API. Kit's estimate for the same-size Qwen3.6-27B Q4 is 18,752 MB. NVIDIA names 24 GB in the repo; not measured here | Top quantization, or a 74B MoE |
| 48 GB, or 24 GB with 64 GB+ RAM | Qwen3.8-Flash-Next GSQ-RCO Q2_0 | 37.6 GB must be resident, 28.8 GB can stay on disk (card) | 125B model, 262K context |
| Workstation | GLM-5.3-Flash, DeepSeek V4.1 Flash | 93 GB and up (API) | Beyond this app's need |

### 2.5 The method to test

Three schema-forced passes, shaped on Nomi's `storyboardPlanParamsSchema` (anchors with `kind` character, scene, prop, style; shots with `anchorIds`, `prompt`, `dialogue`, `transition`):

1. **Cards.** Story in, anchors out.
2. **Shots.** Cards in. `anchorIds` and `sceneId` are enums of the saved ids.
3. **Revision.** Plan plus the user's edit in. `index` is an enum of all shots except the locked one.

Then validate again in the client, as Nomi does with `superRefine`. A tools mode runs the same passes so the two can be compared, since the app will want an agent loop in the end.

Standard check: `response_format` is llama-server's documented API (`tools/server/README.md`); Ajv is the standard validator. **NOT STANDARD, for your word:** the three-pass split with enums generated at runtime. The standard option is one big tool call as Nomi does, which 2.1 shows is not enforceable on Gemma 4. If this goes in the app, the job belongs in the kit's feature and prompt system, and its row goes in the table at `app-structure.md` §19.

### 2.6 Exact test (runs on this PC)

**Server.** Pinned binary. Only one at a time. `-c 16384`, kit-style flags, `--fit` left on.

```powershell
$srv = "E:\Dev\Web\justwrite-app\data\ai-cache\llamacpp\b11960\cuda12\llama-server.exe"

# A: Gemma 4 26B-A4B, on disk
$m = "E:\Dev\Web\justwrite-app\data\ai-cache\hf\models--unsloth--gemma-4-26B-A4B-it-qat-GGUF\snapshots\7b92b5b28818151e8669af2e45e88d6086f490dd\gemma-4-26B-A4B-it-qat-UD-Q4_K_XL.gguf"
& $srv -m $m --host 127.0.0.1 --port 18180 -c 16384 -fa on -ctk q8_0 -ctv q8_0 --parallel 1

# B: Qwen3.8-27B IQ3_S, download 11.77 GB to E: first, same flags
#    ISTA-DASLab/Qwen3.8-27B-GSQ-RCO-GGUF  Qwen3.8-27B-GSQ-RCO-IQ3_S.gguf
# C: Ornith-1.5-9B Q4_K_M, download 5.78 GB, same flags
#    ornith-ai/Ornith-1.5-9B-GGUF  Ornith-1.5-9B-Q4_K_M.gguf
```

**Runs.** From a folder on E: with `"type": "module"` and `npm i ajv`:

```powershell
node planner-test.js --ladder --tag A                                  # schema sizes first
node planner-test.js --tag A --think off --mode schema --runs 20
node planner-test.js --tag A --think on  --mode schema --runs 20
node planner-test.js --tag A --think off --mode tools  --runs 10       # to measure the tool path
node planner-test.js --tag B --think off --mode schema --runs 5        # spills, so fewer runs
node planner-test.js --tag C --think off --mode schema --runs 20
```

**Pass criteria.**

| Check | Pass bar | How measured |
|---|---|---|
| Valid every time | 100% of runs: HTTP 200, `finish_reason: stop`, JSON parses, Ajv passes, on all three passes | Script |
| No runaway thought | 0 runs end on `length` | Script, tests #30256 |
| Cards hold the story | All named facts found: Mara with yellow and grey, Teo with red hat, grandfather, three settings, ticket, thermos | Script |
| Characters consistent | Every shot naming Mara or Teo lists that card; settings run in story order; ticket in at least 2 shots; no invented names | Script |
| Revision respects the edit | Locked shot byte-identical; shots before it unchanged; no thermos after it; coat follows Teo; no red hat after the user made it blue; at most 60% of later shots changed | Script |
| Reads like a director's plan | Your eye on 3 plans per model: coverage, shot variety, a visible story arc | You. This is the bar that decides |
| Grammar ceiling | L1 to L5 all compile. Record the time and first failure | `--ladder` |
| Tools mode | Recorded only: how many calls fail schema. A failure here is the expected Gemma result | Script |

Record: tok/s, pass time, peak card memory (`nvidia-smi -l 1`), peak RAM.

**The harness** (syntax-checked with `node --check`, never run against a model):

```js
// planner-test.js: ES module. npm i ajv
import { appendFileSync, mkdirSync, writeFileSync } from "node:fs";
import Ajv from "ajv";

const arg = (n, d) => { const i = process.argv.indexOf(`--${n}`); return i > 0 ? process.argv[i + 1] : d; };
const flag = (n) => process.argv.includes(`--${n}`);
const BASE = arg("url", "http://127.0.0.1:18180");
const TAG = arg("tag", "x"), THINK = arg("think", "off"), MODE = arg("mode", "schema");
const RUNS = Number(arg("runs", 20)), BUDGET = Number(arg("budget", 1500));
const ajv = new Ajv({ strict: false, allErrors: true });
mkdirSync("out", { recursive: true });

export const STORY = `THE LAST FERRY
Mara Voss, sixty-one, small and wiry, grey braid, yellow oilskin coat, runs the last ferry on Lake Orsa. Tonight the ferry stops for good. At dusk on the dock at Hollow Pier she paints over the boat's name while rain starts. A boy, Teo, eleven, thin, red wool hat, oversized backpack, arrives late and out of breath and holds up a brass ticket from 1974, his grandfather's. Mara stares: it is the last ticket she ever punched for someone she loved. She takes him aboard without a word.
In the wheelhouse of the ferry the storm comes on, the lamp swings, Teo is seasick. Mara gives him her thermos and tells him that his grandfather proposed to her on this crossing and she said no.
At the far shore, Saint Anne's Landing, in the blue hour, the rain has stopped. An old man in a wheelchair, Teo's grandfather, waits under a lamp post. Teo runs to him. Mara stays on board, lifts the brass ticket, and punches it a second time. The old man raises one hand. She sounds the horn once and turns the boat around.`;

const anchorsSchema = { type: "object", additionalProperties: false, required: ["title", "anchors"], properties: {
  title: { type: "string" },
  anchors: { type: "array", minItems: 4, maxItems: 24, items: { type: "object", additionalProperties: false,
    required: ["id", "kind", "name", "description", "carrier"], properties: {
      id: { type: "string", pattern: "^[a-z][a-z0-9_]*$" },
      kind: { enum: ["character", "scene", "prop", "style"] },
      name: { type: "string" },
      description: { type: "string" },
      carrier: { enum: ["visual", "text"] } } } } } };

const shotItem = (ids, scenes) => ({ type: "object", additionalProperties: false,
  required: ["index", "sceneId", "shotKind", "durationSec", "anchorIds", "prompt", "dialogue", "transition"],
  properties: {
    index: { type: "integer", minimum: 1, maximum: 24 },
    sceneId: { enum: scenes },
    shotKind: { enum: ["image", "video"] },
    durationSec: { type: "integer", minimum: 2, maximum: 10 },
    anchorIds: { type: "array", minItems: 1, maxItems: 6, items: { enum: ids } },
    prompt: { type: "string" },
    dialogue: { type: "string" },
    transition: { enum: ["cut", "dissolve", "fade", "match_cut", "whip_pan"] } } });

const shotsSchema = (ids, scenes) => ({ type: "object", additionalProperties: false, required: ["shots"], properties: {
  shots: { type: "array", minItems: 8, maxItems: 24, items: shotItem(ids, scenes) } } });

const reviseSchema = (ids, scenes, editable) => ({ type: "object", additionalProperties: false,
  required: ["why", "shotEdits", "anchorEdits"], properties: {
    why: { type: "string" },
    shotEdits: { type: "array", maxItems: 24, items: { type: "object", additionalProperties: false,
      required: ["index", "shot"], properties: { index: { enum: editable }, shot: shotItem(ids, scenes) } } },
    anchorEdits: { type: "array", maxItems: 8, items: { type: "object", additionalProperties: false,
      required: ["id", "description"], properties: { id: { enum: ids }, description: { type: "string" } } } } } });

// The schema ladder, Nomi's shot shape at growing strictness.
const nomiShot = (optional, maxLen) => {
  const val = { anyOf: [{ type: "string" }, { type: "number" }, { type: "boolean" }] };
  const props = {
    index: { type: "integer" }, sceneId: { type: "string", minLength: 1 }, shotKind: { enum: ["image", "video"] },
    durationSec: { type: "number" }, anchorIds: { type: "array", items: { type: "string" } },
    prompt: maxLen ? { type: "string", maxLength: maxLen } : { type: "string" },
    modelKey: { type: "string" }, modeId: { type: "string" },
    params: { type: "object", additionalProperties: val },
    subtitle: { type: "string" }, dialogue: { type: "string" },
    transition: { type: "object", additionalProperties: false, required: ["type"], properties: {
      type: { enum: ["cut", "dissolve", "fade", "match_cut", "whip_pan"] }, durationFrames: { type: "integer", minimum: 1 } } },
    keyframe: { type: "object", additionalProperties: false, properties: {
      enabled: { type: "boolean" }, prompt: { type: "string" }, modelKey: { type: "string" }, modeId: { type: "string" },
      params: { type: "object", additionalProperties: val } } } };
  return { type: "object", additionalProperties: false, properties: props,
    required: optional ? ["index", "durationSec", "anchorIds", "prompt"] : Object.keys(props) };
};
const nomiPlan = (optional, maxLen) => ({ type: "object", additionalProperties: false, required: ["title", "anchors", "shots"], properties: {
  title: { type: "string" }, anchors: anchorsSchema.properties.anchors,
  shots: { type: "array", minItems: 1, maxItems: 24, items: nomiShot(optional, maxLen) } } });
const LADDER = {
  L1_flat: shotsSchema(["char_a", "char_b", "set_a"], ["set_a"]),
  L2_nomi_required: nomiPlan(false),
  L3_nomi_optional: nomiPlan(true),
  L4_maxLength_1500: nomiPlan(true, 1500),
  L5_200_enum: shotsSchema(Array.from({ length: 200 }, (_, i) => `anchor_${i}`), ["set_a", "set_b"]),
};

async function chat(messages, schema, maxTokens, seed) {
  const body = { messages, max_tokens: maxTokens, temperature: 0.7, top_p: 0.95, seed, stream: false, cache_prompt: false,
    chat_template_kwargs: { enable_thinking: THINK === "on" } };
  if (THINK === "on") body.reasoning_budget_tokens = BUDGET;
  if (MODE === "tools") {
    body.tools = [{ type: "function", function: { name: "save", description: "Save the result.", parameters: schema } }];
    body.tool_choice = "required";
    body.parallel_tool_calls = false;
  } else {
    body.response_format = { type: "json_schema", json_schema: { name: "plan", strict: true, schema } };
  }
  const t0 = performance.now();
  const r = await fetch(`${BASE}/v1/chat/completions`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  const text = await r.text();
  const out = { status: r.status, ms: Math.round(performance.now() - t0), raw: text.slice(0, 4000) };
  if (r.status !== 200) return { ...out, error: "http" };
  const d = JSON.parse(text), c = d.choices[0];
  out.finish = c.finish_reason; out.tps = d.timings?.predicted_per_second; out.tokens = d.usage?.completion_tokens;
  const payload = MODE === "tools" ? c.message.tool_calls?.[0]?.function?.arguments : c.message.content;
  if (!payload) return { ...out, error: "empty" };
  try { out.value = JSON.parse(String(payload).replace(/^```json\s*|\s*```$/g, "")); }
  catch { return { ...out, error: "json", content: String(payload).slice(0, 2000) }; }
  const validate = ajv.compile(schema);
  if (!validate(out.value)) return { ...out, error: "schema", detail: ajv.errorsText(validate.errors) };
  if (out.finish === "length") return { ...out, error: "length" };
  return out;
}

const SYS = "You are a film director's first assistant. Use only what the story gives. Never invent characters, places or plot.";
const cardsMsg = () => [{ role: "system", content: `${SYS} Make one card for each character, each setting (kind "scene") and each important object (kind "prop"). A description holds every look detail the story gives, so an image can be made from it alone.` },
  { role: "user", content: STORY }];
const shotsMsg = (cards) => [{ role: "system", content: `${SYS} Break the whole story into shots in story order, 8 to 16 shots. Number index from 1 with no gaps. List in anchorIds every card seen in the shot. In prompt write action and camera only, and never repeat a card's look. Put spoken lines in dialogue, or "" if none.` },
  { role: "user", content: `STORY:\n${STORY}\n\nCARDS:\n${JSON.stringify(cards.anchors)}` }];
const reviseMsg = (cards, shots, lock, edit) => [{ role: "system", content: `${SYS} The user edited the plan. Change only what must change to stay consistent with the edit. Keep everything else exactly as it is. Return only the shots and cards you change. index must be the shot's own number.` },
  { role: "user", content: `CARDS:\n${JSON.stringify(cards.anchors)}\n\nSHOTS:\n${JSON.stringify(shots)}\n\nUSER EDIT (shot ${lock} is now locked and final):\n${edit}` }];

function checkCards(p) {
  const f = [], find = (k, re) => p.anchors.find((a) => a.kind === k && re.test(`${a.name} ${a.id}`));
  const m = { mara: find("character", /mara/i), teo: find("character", /teo/i), old: find("character", /grand|old/i),
    pier: find("scene", /pier|dock/i), wheel: find("scene", /wheelhouse/i), landing: find("scene", /landing/i),
    ticket: find("prop", /ticket/i), thermos: find("prop", /thermos/i) };
  for (const [k, v] of Object.entries(m)) if (!v) f.push(`missing:${k}`);
  if (new Set(p.anchors.map((a) => a.id)).size !== p.anchors.length) f.push("duplicate-ids");
  if (m.mara && !/yellow/i.test(m.mara.description)) f.push("mara-no-yellow");
  if (m.mara && !/gr[ea]y/i.test(m.mara.description)) f.push("mara-no-grey");
  if (m.teo && !(/red/i.test(m.teo.description) && /hat/i.test(m.teo.description))) f.push("teo-no-red-hat");
  return { fails: f, m };
}
function checkShots(shots, m) {
  const f = [];
  shots.forEach((s, i) => { if (s.index !== i + 1) f.push(`index:${i + 1}`); });
  const order = [m.pier?.id, m.wheel?.id, m.landing?.id];
  let last = -1;
  for (const s of shots) { const at = order.indexOf(s.sceneId); if (at >= 0) { if (at < last) f.push(`scene-order:${s.index}`); last = Math.max(last, at); } }
  for (const s of shots) {
    if (/\bmara\b/i.test(s.prompt) && !s.anchorIds.includes(m.mara?.id)) f.push(`mara-card:${s.index}`);
    if (/\bteo\b/i.test(s.prompt) && !s.anchorIds.includes(m.teo?.id)) f.push(`teo-card:${s.index}`);
  }
  if (shots.filter((s) => s.anchorIds.includes(m.ticket?.id)).length < 2) f.push("ticket-under-2-shots");
  const allow = /^(Mara|Voss|Teo|Hollow|Pier|Lake|Orsa|Saint|Anne|Landing|The|She|He|It|In|At|On|A|An)$/;
  const names = [...new Set(shots.flatMap((s) => s.prompt.match(/(?<=[a-z,] )[A-Z][a-z]{2,}/g) ?? []))].filter((n) => !allow.test(n));
  if (names.length) f.push(`names:${names.join(",")}`);
  return f;
}
function applyRevision(cards, shots, rev, lock) {
  const next = shots.map((s) => ({ ...s })), c = cards.anchors.map((a) => ({ ...a }));
  for (const e of rev.shotEdits) { const at = next.findIndex((s) => s.index === e.index); if (at >= 0 && e.index !== lock) next[at] = { ...e.shot, index: e.index }; }
  for (const e of rev.anchorEdits) { const a = c.find((x) => x.id === e.id); if (a) a.description = e.description; }
  return { shots: next, anchors: c };
}
function checkRevision(before, after, lock, m) {
  const f = [], later = after.shots.filter((s) => s.index > lock);
  if (JSON.stringify(before.find((s) => s.index === lock)) !== JSON.stringify(after.shots.find((s) => s.index === lock))) f.push("locked-changed");
  before.filter((s) => s.index < lock).forEach((s) => { if (JSON.stringify(s) !== JSON.stringify(after.shots.find((x) => x.index === s.index))) f.push(`earlier-changed:${s.index}`); });
  if (later.some((s) => /thermos/i.test(s.prompt))) f.push("thermos-after-edit");
  if (!later.some((s) => /coat/i.test(s.prompt) && s.anchorIds.includes(m.teo?.id))) f.push("coat-not-carried");
  if (after.shots.some((s) => /red (wool )?hat/i.test(s.prompt))) f.push("red-hat-left");
  const changed = later.filter((s) => JSON.stringify(s) !== JSON.stringify(before.find((x) => x.index === s.index))).length;
  if (later.length && changed / later.length > 0.6) f.push(`rewrote:${changed}/${later.length}`);
  return f;
}

async function one(seed) {
  const log = { tag: TAG, think: THINK, mode: MODE, seed, passes: {}, fails: [] };
  const a = await chat(cardsMsg(), anchorsSchema, 1500, seed);
  log.passes.cards = a; if (a.error) { log.fails.push(`cards:${a.error}`); return log; }
  const { fails, m } = checkCards(a.value); log.fails.push(...fails);
  const ids = a.value.anchors.map((x) => x.id), scenes = a.value.anchors.filter((x) => x.kind === "scene").map((x) => x.id);
  if (!scenes.length) { log.fails.push("no-scenes"); return log; }
  const b = await chat(shotsMsg(a.value), shotsSchema(ids, scenes), 6000, seed);
  log.passes.shots = b; if (b.error) { log.fails.push(`shots:${b.error}`); return log; }
  log.fails.push(...checkShots(b.value.shots, m));
  const shots = b.value.shots;
  const target = shots.find((s) => s.sceneId === m.wheel?.id && /thermos/i.test(s.prompt)) ?? shots.find((s) => s.sceneId === m.wheel?.id) ?? shots[Math.floor(shots.length / 2)];
  const lock = target.index;
  const edited = shots.map((s) => (s.index === lock ? { ...s, prompt: "Mara takes off her yellow oilskin coat and wraps it around the shaking Teo. Close, handheld." } : s));
  const editText = `Shot ${lock} now reads: "Mara takes off her yellow oilskin coat and wraps it around the shaking Teo. Close, handheld." There is no thermos. Teo keeps the coat from here on. Also, Teo's hat is now blue, not red.`;
  const cardsNow = { anchors: a.value.anchors.map((x) => (x.id === m.teo?.id ? { ...x, description: x.description.replace(/red/gi, "blue") } : x)) };
  const editable = edited.map((s) => s.index).filter((i) => i !== lock);
  const c = await chat(reviseMsg(cardsNow, edited, lock, editText), reviseSchema(ids, scenes, editable), 4000, seed);
  log.passes.revise = c; if (c.error) { log.fails.push(`revise:${c.error}`); return log; }
  log.fails.push(...checkRevision(edited, applyRevision(cardsNow, edited, c.value, lock), lock, m));
  return log;
}

if (flag("ladder")) {
  for (const [name, schema] of Object.entries(LADDER)) {
    const t0 = performance.now();
    const r = await fetch(`${BASE}/v1/chat/completions`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({
      messages: [{ role: "user", content: "Say ok." }], max_tokens: 1, cache_prompt: false,
      chat_template_kwargs: { enable_thinking: false },
      response_format: { type: "json_schema", json_schema: { name: "x", strict: true, schema } } }) });
    console.log(name, `schema ${JSON.stringify(schema).length} bytes`, r.status, `${Math.round(performance.now() - t0)} ms`, r.status === 200 ? "" : (await r.text()).slice(0, 300));
  }
} else {
  let clean = 0;
  for (let seed = 1; seed <= RUNS; seed++) {
    const log = await one(seed);
    writeFileSync(`out/${TAG}-${THINK}-${MODE}-${seed}.json`, JSON.stringify(log, null, 1));
    const line = { seed, fails: log.fails, ms: Object.fromEntries(Object.entries(log.passes).map(([k, v]) => [k, v.ms])), tps: Object.fromEntries(Object.entries(log.passes).map(([k, v]) => [k, v.tps])) };
    appendFileSync(`out/${TAG}-summary.jsonl`, `${JSON.stringify({ tag: TAG, think: THINK, mode: MODE, ...line })}\n`);
    console.log(JSON.stringify(line));
    if (!log.fails.length) clean++;
  }
  console.log(`${TAG} think=${THINK} mode=${MODE}: ${clean}/${RUNS} clean`);
}
```

---

## 3. Music

Film use is mostly instrumental underscore, so instrumental quality decides; vocals are a bonus.

### 3.1 Ranked for the 8 GB floor

| # | Model | What it is | Proof | Weights, size, licence | 8 GB outlook and why | Engine path |
|---|---|---|---|---|---|---|
| 1 | **Stable Audio 3 Medium Q8_0** | Instrumental and textures; inpainting | Elo 998 on instrumentals, 2 points below the top open model (secondary). Peak 10,324 to 10,440 MiB at 120 s, native weights, RTF 0.032 (report) | `audio-cpp/audio.cpp-gguf`, 3.58 GB; F16 5.83 GB. Stability Community: free under USD 1M, register commercial use, show "Powered by Stability AI"; Gemma encoder under Gemma terms | Likely fits at 30 to 60 s. Q8 cuts weights by 2.25 GB from the 120 s figure, and shorter audio cuts the diffusion graph. Reasoned, not measured. No BF16, so no Turing slow path. Default package in the spec | audio.cpp `stable_audio`, status supported, `mem_saver` |
| 2 | **ACE-Step 1.5 Turbo Q8_0, direct mode** | Full songs and editing: repaint, cover, extend, stems, LoRA | Direct Q8: 0.846 GiB over idle for 5 s, 0.915 s (report, RTX 3090). Not on the Elo boards I could read | 6.19 GB. MIT | Tight. Weights stay on the card (#103), so about 6.2 GB plus a graph that grows with length. Full Q8 is graded "planner sampling can fail" (`gguf.md`) and changes the song, but with `enable_thinking=false` and CoT off `run()` skips the planner (code). The BF16 package is 10.09 GB, over the card, and hits the Turing gate | audio.cpp `ace_step`, status supported |
| 3 | MiniMax Music 3 Q4_0 | Top open-weights music model | Elo 1000, #11 vocals, #13 instrumentals (secondary). Q8 peak 17,412 MiB, RTF 0.63 on RTX 5090 (report, PR #1077) | Files: LM 6.01, flow 1.40, depth 0.71, vocoder 0.22 GB. MiniMax Community: show the name in the UI, disclose as machine-generated, USD 20M cap | Doubtful. Stages load one at a time by default, so the 6 GB LM may fit, but a **2080 Ti hung over an hour on 60 s** (#255), same Turing generation. Official 8 GB relies on Python layer streaming | audio.cpp `minimax_music3`, experimental |
| 4 | Stable Audio 3 Small Music F16 | Fast, small | Peak 3,070 to 3,658 MiB at 120 s, RTF 0.012 (report) | 2.36 GB, Q8 1.68 GB. Stability Community | Fits with room. Quality unknown; test as the fallback | audio.cpp, supported |
| 5 | Magenta RealTime 2 Base Q8 | Instrumental, streaming, MIDI control | code only | 3.67 GB; Small 1.33 GB. CC-BY-4.0 | Should fit. Unknown quality | audio.cpp, experimental |
| 6 | YuE2-3B Q8 | Songs, score planning | code only; no peak figure found | 4.26 GB + VAE. CC-BY-NC-4.0 | Unknown. `attention` falls back on Turing (docs) | audio.cpp, supported |
| 7 | HeartMuLa | Songs | Peak 25,600 MiB at 120 s, native (report). §B's 3060 figure not re-verified | 7.66 GB Q8. Apache-2.0 | No at song length. Lyrics required | audio.cpp, supported |
| - | LeVo 2 | Tencent songs | user claims in audio.cpp #723; maintainer could not get it working and repos were pulled; 10 GB minimum | Licence unclear | No path | none, request closed |
| - | MusicGen | Old | Last on the board at Elo 864 (secondary) | Not in audio.cpp | Skip | none |

### 3.2 Best per machine

| Tier | Pick | VRAM source |
|---|---|---|
| 8 GB | Stable Audio 3 Medium Q8 at 60 s or under; ACE-Step Turbo Q8 direct for editing | Reasoned from the audio.cpp report; test needed |
| 12 GB | Stable Audio 3 Medium F16 at 120 s | 10,440 MiB (report) |
| 16 GB | Add ACE-Step XL Turbo Q8 DiT (9.97 GiB file) | Sequence peak 12.7 to 14.4 GiB on Vulkan (report); official XL needs 16 GB with offload |
| 24 GB | **MiniMax Music 3 Q8**, the top open model; ACE-Step Base at 120 s with long lyrics | 17,412 MiB (report PR #1077); 20,098 MiB (report) |
| 32 GB+ | HeartMuLa; ACE-Step 4B planner | 25,600 MiB (report); ACE official ≥24 GB tier |

**Attack.** "Elo is from a secondary report and may not match audio.cpp's settings." True, so the Elo is a reason to test, not a result. The attack also dropped MiniMax Music 3 from the top two here despite its rank, because of the Turing hang; it stays as a timed stretch test.

### 3.3 Exact test

Before anything: family rule, fork up to date. The merge is done (2026-10-29), but `build\jv-dev` is dated 10-15 and `build\windows-cuda12-local` 10-03. Rebuild, test in JustVoice, and use that binary as `$cli`. Keep models on E:.

```powershell
cd E:\Dev\Web\audio.cpp
python tools\model_manager_v2.py install stable_audio_3_medium_q8_0
python tools\model_manager_v2.py install ace_step_turbo_q8_0
$cli = "<fresh build>\audiocpp_cli.exe"
nvidia-smi --query-gpu=memory.used --format=csv,noheader -l 1 > out\vram.log   # second window

# Cues come from the same story. Three seeds each: 11, 22, 33.
$pier  = "sparse solo piano and low cello, melancholy film score, slow 60 bpm, intimate, no drums, no vocals"
$storm = "tense orchestral underscore, low string ostinato, timpani swells, rising dread, 96 bpm, no vocals"
$home  = "warm string quartet resolving to major, gentle french horn, bittersweet ending, 70 bpm, no vocals"

# Stable Audio 3 Medium. Memory ladder first: 30, then 60, 90, 120 s.
& $cli --task gen --family stable_audio --model models\Stable-Audio-3-Medium-GGUF --backend cuda --text $pier --duration-seconds 30 --num-inference-steps 8 --guidance-scale 1.0 --seed 11 --session-option stable_audio.mem_saver=true --out out\sa3m-pier-30-11.wav
# Then the same at 20 steps to hear what steps buy.

# ACE-Step Turbo Q8, direct, no planner
& $cli --task gen --family ace_step --model models\ACE-Step1.5-GGUF\turbo --backend cuda --task-route text2music --text $pier --duration-seconds 60 --num-inference-steps 8 --guidance-scale 1.0 --seed 11 --request-option enable_thinking=false --request-option use_cot_metas=false --request-option use_cot_caption=false --request-option use_cot_language=false --session-option ace_step.mem_saver=true --out out\ace-pier-60-11.wav

# ACE repaint: the edit case. Replace the last 15 s, keep the rest.
& $cli --task gen --family ace_step --model models\ACE-Step1.5-GGUF\turbo --backend cuda --task-route repaint --audio out\ace-pier-60-11.wav --text "same piano and cello, ending on a single held note" --request-option repainting_start=45 --request-option repainting_end=60 --request-option enable_thinking=false --session-option ace_step.mem_saver=true --out out\ace-pier-repaint.wav

# Stretch, last, with a 20 minute kill timer because of #255
& $cli --task gen --family minimax_music3 --model models\MiniMax-Music3-GGUF --backend cuda --text $pier --request-option "lyrics=[Instrumental]" --request-option duration_sec=30 --request-option num_inference_steps=30 --out out\mm3-pier-30.wav
```

The `use_cot_*` and repaint option names come from the parser and spec; the CLI may reject one, in which case use the server route the reports use (`/v1/tasks/run`).

**What to listen for.**
- Fits the mood of the scene; would you leave it under the shot?
- No vocals or speech-like garble, even with "no vocals" in the prompt.
- Tempo holds and the ending resolves rather than cuts off.
- No looping phrase; instruments sound played; low end is clean.
- Under dialogue at -18 dB it stays out of the way.
- Repaint: the join at 45 s cannot be heard, and the first 45 s matches the source.

**Pass:** at least one cue per scene you would keep, peak card memory under 7.8 GB, no crash on a second generation in one process. Record RTF and peak memory per duration.

---

## 4. Sound effects

### 4.1 Ranked for the 8 GB floor

| # | Model | What it is | Proof | Weights, size, licence | 8 GB outlook and why | Engine path |
|---|---|---|---|---|---|---|
| 1 | **Stable Audio 3 Small SFX F16** | Text to SFX | Peak 2,980 to 3,652 MiB at 120 s, RTF 0.012 (report). A wrapper says SFX come out as music without an SFX prefix (user, unverified). No independent listening review found | 2.36 GB; Q8 1.68 GB. Stability Community | Fits easily | audio.cpp, supported |
| 2 | **MiDashengLM-Gen Q8_0** | One prompt mixes speech, music, SFX and ambience | code; paper arXiv 2605.27838 on its base model; no numbers read | 3.38 GB; F32 11.55 GB. Apache-2.0 | Should fit, no peak figure | audio.cpp, experimental |
| 3 | ControlFoley Q8_0 | **Video-synced foley**, text, video or both, 44 kHz | code; accepted ACM MM 2026 (card) | 12.56 GB; F32 19.97 GB. CC-BY-NC-4.0 | Over the card if all parts load, since audio.cpp keeps weights on the card (#103). Whether one mode loads only its parts was not traced | audio.cpp, experimental, recommended Q8 |
| 4 | LTX-2.3's own audio track | Free with every clip | **Checked: clips on disk carry an AAC track** (4.3). Not judged by ear in the records | Already generated | Nothing extra to run | sd.cpp, already works |
| 5 | MOSS-SoundEffect v2 | Text to SFX, up to 30 s | One footstep CLAP 0.94 (card of a GGUF conversion). 100 steps by default | Safetensors 11.8 GB in total; BF16 GGUF. Apache-2.0 | Unknown. BF16 is the Turing slow path | **Not in audio.cpp.** A second C++ engine, `pwilkin/openmoss`, or a port. NOT STANDARD |
| 6 | Woosh DFlow and DVFlow | Sony: distilled text and video to audio, 8 s video | Paper claims it beats Stable Audio Open and TangoFlux, no numbers read | About 3.4 GB for T2A parts (release assets). Code MIT and Apache; **weights CC-BY-NC** | Likely fits; no figure | PyTorch only. Port needed. NOT STANDARD |
| 7 | HunyuanVideo-Foley XL | Video to audio | Official: 16 GB, 8 GB with offload | Tencent terms, GitHub says NOASSERTION; repo idle since 2025-09 | Python offload only | PyTorch, Linux-first, no ggml port found. NOT STANDARD |
| 8 | LTX-2.3 Foley V2A LoRA | Adds foley to a video, removes music | Official repo gated, not read; community `FuzzPuppy/LTX-2.3-Foley-LoRA` card read | LoRA on LTX-2.3. LTX Community | Same LTX on the card, but sd.cpp has no video-to-audio pipeline (the `video_to_audio_attn` block exists, a V2A mode does not; PR #1676 is the opposite direction, A2V, draft) | sd.cpp addition, kit gap |
| 9 | Foley-Omni | Speech, SFX and music from video | card; arXiv 2606.03672 | 5.5B. MIT, pulls MMAudio parts | Unknown | PyTorch. NOT STANDARD |

### 4.2 Best per machine

| Tier | Pick | VRAM source |
|---|---|---|
| 8 GB | Stable Audio 3 Small SFX; MiDashengLM-Gen for ambience | 2,980 MiB (report); 3.38 GB file (API) |
| 12 GB | Same; Hunyuan XXL with offload only in Python | 12 GB (official) |
| 16 GB | **ControlFoley Q8**, video-synced | 12.56 GB file (API); peak not measured |
| 24 GB | ControlFoley F32 | 19.97 GB file (API) |

**Attack.** "Text SFX will not sync to picture." Correct, and it is the real gap at 8 GB. ControlFoley on this card is the first thing to try, and it changed the test below to include one run with a kill timer. The second attack: LTX may already make good enough foley for free, so that is listened to first.

### 4.3 Exact test

**Step 0, free.** `ffprobe` shows AAC audio at 48 kHz on `ltx23-2stage-1280x704-woman.mp4` and `i2v-720p-cafe.mp4`, and at 32 kHz on `h3-ref2va-480p.mp4`, all in `E:\Dev\Web\test-just-direct\out\`. Listen to those first: real foley, music, or silence?

```powershell
python tools\model_manager_v2.py install stable_audio_3_small_sfx_f16
python tools\model_manager_v2.py install midashenglm_gen_q8_0

$sfx = @{
  rain   = "steady rain on wooden dock boards, close, no music"
  ticket = "metal ticket punch clicking through thick brass-edged card, one sharp click, close, dry room, no music"
  horn   = "single long ship horn across still water, distant echo, no music"
  lamp   = "old ship lamp creaking on a chain, slow swing, storm wind outside, no music"
  steps  = "child running on wet concrete, fast footsteps approaching, no music"
}
# Five prompts, seeds 11, 22, 33, at 8 and 20 steps; each with and without an "SFX: " prefix
& $cli --task gen --family stable_audio --model models\Stable-Audio-3-Small-SFX-GGUF --backend cuda --text $sfx.rain --duration-seconds 10 --num-inference-steps 8 --seed 11 --session-option stable_audio.mem_saver=true --out out\sfx-rain-11.wav

# Layered ambience, one prompt
& $cli --task gen --family midashenglm_gen --model models\MiDashengLM-Gen-GGUF\midashenglm-gen-q8_0.gguf --backend cuda --text "<|caption|> Night storm inside a small ferry wheelhouse. <|sfx|> lamp creaking on a chain, rain on glass <|env|> wind and engine rumble" --request-option duration_sec=20 --request-option guidance_scale=2.0 --request-option seed=11 --out out\mid-wheelhouse-11.wav

# Stretch: video-synced foley on the real clip, with a kill timer
python tools\model_manager_v2.py install controlfoley_large_44k_q8_0
& $cli --task gen --family controlfoley --model models\ControlFoley-GGUF\controlfoley-large-44k-q8_0.gguf --backend cuda --text "footsteps, cloth, cup on a table" --request-option video_file=E:\Dev\Web\test-just-direct\out\i2v-720p-cafe.mp4 --request-option duration_sec=5 --request-option num_inference_steps=25 --request-option guidance_scale=4.5 --request-option seed=11 --out out\foley-cafe.wav
```

**What to listen for.** The prompted sound and only that; no music bed or speech-like voices; a sharp attack on the punch and horn start; a natural tail with no cut or clip; rain and wind that could loop; in ControlFoley, sounds landing on the picture's actions.

**Pass:** four of five SFX usable without editing, on any seed, and clean memory. For sync: ControlFoley completes on the card, or the record shows the exact allocation failure.

---

## 5. What the tests decide next

- Planner: which of A, B, C wins by your eye, and whether `--mode tools` is usable at all on it. If not, the app's "tools" become schema-forced turns.
- Audio: if Stable Audio holds up, music and SFX are both done on one engine family at 8 GB, and the licence is the choice left for you.
- If ControlFoley fails on 8 GB, synced foley on this card needs LTX's own audio or a port of Woosh's distilled V2A.

---

## 6. Sections A and B claims re-checked

| Claim | Status now |
|---|---|
| audio.cpp covers ACE-Step, HeartMuLa, YuE2, Stable Audio 3, ControlFoley | Confirmed in code; it also has MiniMax Music 3, Magenta RT2, MiDashengLM-Gen, MiniMax-H3 |
| ACE-Step official "<4 GB" | Confirmed on the card, but it is Python with offload and INT8, no LM. audio.cpp's real figures are in section 3 |
| HeartMuLa 60 s in ~80 s on a 3060 | Not re-verified. Sits badly with 25.6 GB peak at 120 s in audio.cpp; different runtime |
| YuE2 and ControlFoley CC-BY-NC | Confirmed |
| Stable Audio 3 free under USD 1M | Confirmed in `docs/model_licenses.md`. HF cards are gated, not read |
| "No commercially licensed local foley model" | **Outdated.** MOSS-SoundEffect v2 Apache-2.0; Foley-Omni MIT with MMAudio parts. Licences are labels anyway |
| "sd.cpp, llama.cpp, audio.cpp don't hit" the Turing problems | **Partly wrong.** BF16 matmul is gated to Ampere (code); audio.cpp docs say several families drop flash attention on Volta and Turing, while §B says ggml has it from Turing. Unresolved; watch the logs |
| Section J query 7, "Qwen3 7B on 8 GB, Qwen 3.6 27B, Mistral Small 3.1" | Superseded by the tables above |

Kit doc that may need a correction (not edited, research only): `model-research.md` on JSON enforcement with thinking.

---

## 7. Not verified

- **Reddit: nothing read.** reddit.com's API returned 403, WebSearch refuses the domain, and an RSS and mirror attempt was denied by the permission system and not retried. GitHub issues and HF cards stand in as user reports, so community impressions are missing. This is a gap in the search, not proof of absence.
- **BFCL:** the official V4 page (updated 2026-04-12) gave no table to the fetcher, and I did not dig through the `HuanzhiMao/BFCL-Result` archive (newest folder 2025-12-16). Aggregator numbers conflict, so none are used. The best same-harness numbers are NVIDIA's, for small models only.
- **Artificial Analysis primary page:** 404 to the fetcher. Elo comes from AlphaSignal's report; the benchmarklist snapshot of 2026-09-02 predates v1.1.
- All maker benchmarks are self-reported, mostly coding and agent tasks. **No film-planning benchmark exists** that I could find; searches returned vendor pages.
- Every audio 8 GB outlook, and Qwen3.8-27B's speed on this card, are estimates.
- Whether #30256 hits 26B-A4B on the plan prompts.
- Whether `prepare()` uploads ACE-Step's planner weights when the planner will not run. `run()` skips it; `prepare()` constructs it. Not traced further.
- Whether ControlFoley loads all parts for one mode.
- Whether #255 was fixed. Closed; no fix seen.
- Stable Audio 3 and Lightricks V2A cards are gated.
- The test commands and harness have not been run. CLI option names for `use_cot_*` are from the parser, not the spec.
- Whether the AAC tracks on the clips hold real sound; only the stream's presence was checked.

---

## 8. Query log

Web (WebSearch unless noted):
1. "best local LLM for tool calling October 2026 8GB VRAM": SEO lists, Qwen 3.5 9B most cited, Phi-4-mini; no measured tool numbers.
2. "BFCL function calling benchmark results 2026 open models leaderboard Qwen Gemma GLM": aggregators, conflicting.
3. "r/LocalLLaMA tool calling comparison Gemma 4 Qwen 3.6 Qwen 3.8 llama.cpp structured output": guides, no threads.
4. Fetch gorilla.cs.berkeley.edu/leaderboard.html: V4 dated 2026-04-12, table not in the text.
5. Fetch unsloth.ai tool-calling guide: flags and sampling; no structured-output advice.
6. Fetch presenc.ai open-weight function calling: approximated BFCL v3 table, no per-score source; not used.
7. "function calling benchmark local LLM quantized GGUF tool call accuracy 2026 results small models": Docker 21 models, 3,570 tests; Unsloth warns 1-bit quants break tool calling.
8. "LLM screenplay to storyboard shot list structured output character consistency research 2026": vendor pages, no measured research.
9. Reddit, two site-limited searches: refused. See section 7.
10. "best small local model agentic tool use Nemotron 3.5 Bolt E4B review vs Gemma 4 E4B Qwen 3.5 9B": NVIDIA's table; then the card and research page read.
11. "best open source AI music generator local 2026 latest model": Stable Audio 3, YuE, ACE-Step, MusicGen; vendor pages.
12. "latest open source sound effects generation model 2026 text to SFX foley video to audio": Woosh, Stable Audio, AudioGen, closed products.
13. "video to audio foley open model 2026 HunyuanVideo-Foley LTX Foley ControlFoley comparison VRAM": Hunyuan official VRAM.
14. "Music Arena leaderboard text-to-music open weights ACE-Step HeartMuLa YuE human preference 2026": AA Music Arena v1.1.
15. "LeVo 2 SongGeneration 2 open source song model VRAM license Tencent 2026 compared ACE-Step 1.5 XL": 10 GB minimum, licence unclear.
16. "Stable Audio 3 Medium small SFX review quality local VRAM sound effects generated test": no listening test; estimates only.
17. Fetch arXiv 2604.01929 (Woosh), 2605.17991 (Stable Audio 3), alphasignal, benchmarklist, aivideosensei; stability.ai/news/stable-audio-3 and artificialanalysis.ai/music/models returned 404.

Hugging Face API: `/api/models` search by name with `filter=gguf` for qwen3.5, 3.6, 3.8, gemma-4, mistral-small, ministral, glm-4, glm-5, granite-4, granite-5, lfm3, nemotron, smallthinker, hunyuan, exaone, deepseek-v4, phi-5, minimax-m3, kimi, laguna, solar, ling-3; newest by author for 20 orgs; GGUF trending; `pipeline_tag=text-to-audio` newest and by likes; ace-step, stable-audio-3, heartmula, musicgen, audiogen, foley, sound-effects, tangoflux, sfx; repo trees with `expand[]=gguf` for sizes and chat templates of every model in the tables. Raw results: `F:\ClaudeCode\tmp\claude\E--Dev-Web\c6773446-0ddf-4d1c-b8d4-a350607697fc\scratchpad\hf-api\`.

GitHub (`gh`): llama.cpp issues "tool call grammar json schema", "response_format thinking grammar", "gemma 4 tool calls", "Nemotron 3.5 Bolt tool"; PRs "tool_choice required grammar thinking", "gemma4 tool schema grammar", "response_format grammar"; read #20178, #20345, #22537, #25746, #25923, #25986, #27217, #27279, #27733, #27767, #28522, #29089, #29655, #30256, #31328, PR #23247. audio.cpp issues "ace-step vram", "stable audio", "foley", "soundeffect", OOM; read #103, #255, #263, #723, PRs #321, #1077. stable-diffusion.cpp "foley", "V2A", "init-audio". Repos read: SonyResearch/Woosh, Tencent-Hunyuan/HunyuanVideo-Foley, ace-step/ACE-Step-1.5 `GPU_COMPATIBILITY.md`, HuanzhiMao/BFCL-Result listing, pwilkin/openmoss.

Local, read only: feasibility sections B, H, J; kit `RESEARCH.md`, `model-research.md`; JustWrite `seed_presets.js`, `measured-performance.md`; Nomi `directorPlanSchema.ts`, `canvasModelShapes.ts`; audio.cpp README, `docs/`, `model_specs/`, `src/models/ace_step/`, `external/ggml`; shallow llama.cpp clone at `research-clones\planner\llama.cpp`, nothing run from it.
