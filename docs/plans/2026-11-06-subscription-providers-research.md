# Subscriptions as providers — research (2026-11-06)

The question (the user, 2026-11-06): can the family's apps run on an AI the person already pays for or has installed —
Claude Code, Codex and the like — instead of an API key, auto-detecting what is installed, the way Craft Anything
does? Distilled into `docs/dev/RESEARCH.md` §7, "Subscriptions as providers". The user said go on 2026-11-07; items
1, 2, 4, 5, 7, 9 and 10 are built (kit TASKS, "The person's own plans as providers"); item 3 waits for the user's
word by name. The recommendations as approved, verbatim, are at the end of this page.

## Standards for the pieces (built 2026-11-07, but the NOT STANDARD row)

| Piece | Standard it follows | Kit code |
|---|---|---|
| ChatGPT plan requests (Sign in with ChatGPT) | developers.openai.com/siwc/token-sharing-open-source/models-and-inference; the official `openai` SDK the kit already uses | `packages/core/src/llm/openai_sdk.js` (`planKwargs`) |
| ChatGPT sign-in and its own token table | OpenID Connect discovery at auth.openai.com with `openid-client` (MIT, github.com/panva/openid-client) — a new dependency, not an ML package | `packages/core/src/llm/chatgpt_signin.js`, `packages/core/src/llm/signins.js`, `packages/core/src/llm/provider_api.js`, `packages/core/src/llm/db_schema.js` |
| The Claude Code provider type | code.claude.com/docs/en/headless (`claude -p`, stream-json, `--safe-mode`) | `packages/core/src/llm/claude_code.js`, `packages/core/src/llm/registry.js` (`construct`) |
| Starting Claude Code with no console | the kit's own door for every program it starts | `packages/core/src/platform/procs.js` (`popenProgram`) |
| Which plan a provider draws on; plan calls at no cost in the ledger | the kit's usage ledger and run responses | `packages/core/src/llm/plans.js` (`providerPlan`), `packages/core/src/llm/usage_sink.js` |
| One Claude Code process kept ready | NOT STANDARD — the standard option is a fresh `claude -p` per call as Anthropic documents it; the trade-off: the first word 0.69 s after the prompt instead of 6.7–7.2 s, for 221 MB held while the route is in use | NOT STANDARD — declined, not built (the user, 2026-11-07: "1 no"); each call starts its own process |
| Detecting installed programs | the kit's "detected → Connect" probe, extended; `which` (ISC, github.com/npm/node-which) plus seeded known-folder rows (Craft Anything's list, Apache-2.0, credited) | `packages/core/src/llm/programs.js`, `packages/core/src/llm/provider_api.js`, `packages/ui/src/composables/useProviderConnect.js` |
| npm `.cmd` launchers on Windows | `cross-spawn` (MIT, github.com/moxystudio/node-cross-spawn); prompt on stdin, system prompt by file | `packages/core/src/platform/procs.js` |
| JustVoice's price question on a plan route | — | app — JustVoice's book-run price ask shows plan use instead of dollars (on the kit's `providerPlan`) |

Evidence marks: **read** — the vendor's own page, a repo file or a CLI's help · **measured** — run on this machine
(Windows 11 26300, Node 26.5, Claude Code 2.1.319 signed in on Max 20x, codex-cli 0.147.0 signed in with ChatGPT) ·
**snippet** — a search summary or third-party page only, unread.

## 1. Measured on this machine

| Run | Wall time | Prompt tokens for "Reply with exactly: ok" | Notes |
|---|---|---|---|
| `claude -p … --output-format stream-json --verbose --include-partial-messages --tools "" --no-session-persistence --system-prompt "You are a test." --model claude-haiku-5-5` | 16.9 s | 14,822 | the user's SessionStart hook ran; `tools` still listed 16 MCP tools (`--tools ""` drops built-ins only); CLAUDE.md, skills and plugins loaded |
| same + `--safe-mode` (twice) | 6.7 s, 7.2 s | 767 | no MCP, no hooks, `tools: []`; API time 1.4–1.5 s; still on the subscription (`apiKeySource: none`, `authMethod: claude.ai`) |
| a pre-started process: `claude -p --input-format stream-json --output-format stream-json --verbose --include-partial-messages --tools "" --safe-mode --no-session-persistence …`, prompt written 8 s after start | first output at 1.0 s; first text 0.69 s after the prompt; result 0.71 s | 684 | 221 MB working set while idle (process + children); exit ~1.5 s after stdin closed |
| `codex exec --json --skip-git-repo-check --ephemeral --sandbox read-only --ignore-user-config -` | 13.0 s | 12,794 | no text deltas: `item.completed` carries the whole answer; cannot turn tools off |
| `claude auth status --json` | 0.76 s | — | `loggedIn`, `authMethod`, `subscriptionType: "max"`, `planTier: "max_20x"`, `configDirectory` (here `F:\ClaudeCode\config` — `CLAUDE_CONFIG_DIR` moves it, so `~/.claude` is absent) |
| `claude --version` | 0.7–2.0 s | — | |
| `codex login status` | 52–166 ms (native exe) | — | "Logged in using ChatGPT", exit 0 (stderr) |
| `codex app-server` (agent) | `initialize` 0.3–0.5 s; `account/read` +8–23 ms; `model/list` 0.3–0.9 s | — | documented "Experimental" |
| spawning npm's `codex` from Node | `spawn("codex")` ENOENT; `spawn("…codex.cmd")` EINVAL; `shell:true` works (~1.0 s, DEP0190 warning); native `codex.exe` 55–88 ms | — | CVE-2024-27980 change |

Claude Code's stream also carries a `rate_limit_event` (`seven_day.utilization: 0.3` here — the weekly plan used) and
a `total_cost_usd` the docs call a "client-side estimate". Probe scripts: the session scratchpad (`probe.sh`,
`warm_probe.js`, the agent's `probes/`).

## 2. The routes

### 2.1 Agent programs run headless on a subscription sign-in

| Program | Plain-text headless call | Sign-in check | Terms (quoted) | Mark |
|---|---|---|---|---|
| Claude Code | `claude -p --output-format stream-json --verbose --include-partial-messages --tools "" --safe-mode --no-session-persistence --system-prompt[-file] … --model …`; JSON features `--output-format json --json-schema …` (headless docs) | `claude auth status --json` → `loggedIn` (exit 0/1) | below, §3 | read + measured |
| Codex | `codex exec --json --skip-git-repo-check --ephemeral -s read-only [-m] -`, or `codex app-server --listen stdio://` | `codex login status` | "Use API key authentication for programmatic Codex CLI workflows, such as CI/CD jobs" (learn.chatgpt.com/docs/auth) — a recommendation | read + measured |
| GitHub Copilot CLI / Copilot SDK | `copilot -p "…" -s --output-format json --available-tools …`; SDK `@github/copilot-sdk` (MIT) bundles the CLI, `streaming:true`, tools on by default | no status command found; token order `COPILOT_GITHUB_TOKEN`, `GH_TOKEN`, `GITHUB_TOKEN`, keychain `copilot-cli`, `~/.copilot/config.json`, `gh auth token` | CLI licence: "the right to reproduce and redistribute unmodified copies of the Software as part of an application or service … Nothing in this License restricts your choice of license for your application or service, including distribution under an open source license" (github/copilot-cli LICENSE.md, read); "Copilot usage is billed to each user's subscription" (docs.github.com copilot-sdk github-oauth) | read |
| Cursor CLI / Cursor SDK | `agent -p … --output-format stream-json --stream-partial-output`; SDK `@cursor/sdk` "`tools: []` offers no built-in tools" | `agent status` | "User API keys bill to that user's plan" (cursor.com/docs/sdk/typescript); ToS §1.5 no renting/selling the Service | read |
| Gemini CLI | `gemini -p … --output-format stream-json` | none | "On June 18, 2026, Gemini CLI and Gemini Code Assist IDE extensions will stop serving requests for Google AI Pro and Ultra" and free users (developers.googleblog.com); "using third-party software, tools, or services (for example, using OpenClaw with Gemini CLI OAuth) is a violation" (geminicli.com tos-privacy) | read |
| Antigravity (`agy`) | `agy -p … --output-format stream-json` | none | §6: "using the Service in connection with products not provided by us … Using third party software, tools, or services to access the Service … may be grounds for suspension or termination of your Antigravity and/or Gemini CLI accounts" (antigravity.google/terms, read) | read |
| Qwen Code | `qwen -p … --output-format stream-json` | none | Qwen OAuth free tier ended 2026-04-15 | snippet |
| Kimi Code CLI | `kimi --print -p … --output-format stream-json` (print mode auto-approves tools) | none | membership "专为编程场景设计" (for programming); changing the User-Agent counts as a violation (kimi.com membership guide) | read |
| Mistral Vibe | `vibe -p … --output streaming` | none | "Each Mistral plan includes monthly usage that is shared across Studio, the API, and Vibe Code" (docs.mistral.ai subscriptions) | read |
| Kiro CLI | headless needs `KIRO_API_KEY` (Pro tiers) | — | terms unread | read |
| xAI Grok Build | `grok -p … --output-format streaming-json` | `grok login` | no xAI developer OAuth doc; Hermes users report 403s | read / snippet |
| Amp, Factory Droid, Junie, Auggie, Crush, Goose, OpenCode, Muse | see the agent's table (session record) | mostly none | mostly unread | read / snippet |
| iFlow CLI | shut down 2026-04-17 | — | — | snippet |

### 2.2 Official "use your plan in other apps"

- **OpenAI Sign in with ChatGPT (SIWC)** — read: developers.openai.com/siwc (quickstart, request-client-id,
  token-sharing-open-source and its pages sign-in, token-reference, preview-limitations, models-and-inference,
  codex-app-server, profiles-and-sessions), the cookbook article, learn.chatgpt.com/docs/sign-in-with-chatgpt.
  - Who: "ChatGPT plan usage is available to all open-source partners and selected private clients"; "These docs
    explain ChatGPT plan usage for open-source and locally hosted apps"; paid or remotely hosted apps use the interest
    form. Plans named: "Eligible ChatGPT Plus and Pro users" (Go per news only, snippet).
  - Flow: OIDC discovery `https://auth.openai.com/.well-known/openid-configuration` (measured); authorize
    `https://auth.openai.com/api/accounts/authorize`, token `…/oauth/token`, PKCE S256, no client secret ("This direct
    flow needs neither a client secret nor a partner API key"); redirect `http://127.0.0.1:<port>/auth/callback`
    ("Do not substitute with `localhost`"); first sign-in sends `client_id=dynamic_agent_client` and the issued
    `client_id` comes back in the callback, used for the code exchange and saved; scopes `openid profile email
    offline_access resource.invoke chatgpt.tokens.use.direct`, `resource=https://api.openai.com/v1`. "Access tokens are
    valid for one hour"; "Refresh tokens are valid for 30 days", each refresh returns a new one.
  - Requests: `POST https://api.openai.com/v1/responses` with the token as Bearer; `store:false`, `stream:true`; use
    `instructions` (system-role items rejected); omit `background, conversation, max_output_tokens, max_tool_calls,
    metadata, moderation, multi_agent, prompt, prompt_cache_retention, safety_identifier, temperature, top_logprobs,
    top_p, truncation, user`; no `previous_response_id` (history in `input`); no hosted tools, audio, video, Files or
    transcription; `GET /v1/models` keeping `visibility:"list"`; usage errors
    `subscription_sharing_usage_limit_exceeded`, `subscription_sharing_usage_unavailable`. The OpenAI Python example
    is the plain SDK with `api_key` = the token.
  - The user sets a per-app weekly cap of 10–100 % in ChatGPT Settings > Usage > App limits ("a cap, not a separate
    allowance").
  - Reference code: github.com/openai/sign-in-with-chatgpt-devkit (`@siwc/local` `oauth.ts`), **"Sign-in with
    ChatGPT DevKit Noncommercial License v1.0 … solely for Noncommercial Purposes"** (LICENSE, read) — copying it
    carries that licence; code written from the public docs does not ("Independently authored software does not
    become a Modified Work merely by calling, linking to, or communicating with the Work through an interface").
  - Apps using it with plan usage: Amp Code, Conductor, Devin, Hermes Agent, Kilo Code, Notion, Vercel, Warp and
    others; open source: OpenClaw, OpenCode, Pi, T3.
- **GitHub Copilot SDK** — official, MIT, billed to the user's Copilot plan (Free tier exists, auto model only).
- **Cursor SDK** — `Cursor.auth.login()` mints a user key billed to the plan; public beta, licence unread.
- **Mistral** — plan usage is shared with the API, so a Mistral key on a plan account runs on the plan.
- **Google AI Pro/Ultra** — monthly Google Cloud credits usable on the Gemini API (blog.google, 2026-01-27); no
  OAuth plan API (discuss.ai.google.dev/t/175577, unanswered).
- **Anthropic** — no plan API; Max, Ultra and Team now include monthly API credits for API-key use.
- **xAI SuperGrok OAuth** — used by Warp, Kilo, Hermes; no xAI developer doc found.

### 2.3 Flat-rate coding-plan keys (all limit use)

Z.ai GLM Coding Plan: "strictly limited to use within officially supported tools and products" (docs.z.ai FAQ).
Alibaba Coding Plan: "Do not use the plan's API key for automated scripts, application backends, or other
non-interactive scenarios … may result in subscription suspension". Kimi Code and OpenCode Go: for coding agents.
MiniMax M Plan (text, image, audio): no clause found, terms unread. Volcengine Ark: personal development only
(snippet).

### 2.4 Unofficial bridges

CLIProxyAPI (MIT, reuses OAuth tokens for Claude Code, Codex, Antigravity and others), VibeProxy (on CLIProxyAPI; its
README warns of "account risks from using OAuth tokens directly"), OmniRoute, copilot-api ("may trigger GitHub's
abuse-detection systems"). claude-max-api-proxy runs `claude -p` per request (snippet). Token reuse is what
Anthropic ("may not collect, store, or intermediate Claude.ai credentials or session tokens") and Google (§6 above)
forbid by name.

## 3. Anthropic's clauses (read 2026-11-06)

- legal-and-compliance, "Can customers offer Claude Code in their products?": "Unless we've mutually agreed otherwise,
  preinstalling or running Claude Code in your products or services (e.g. in hosted sandboxes or other agent
  infrastructure) requires agreeing to our Commercial Terms of Service and complying with the conditions below: The
  Claude Code binary must not be modified … Customers may not pay for, resell, or intermediate Claude usage on their
  end users' behalf. Each end user must authenticate with their own Anthropic API key, Claude subscription plan
  credentials, or 3P inference provider credential".
- Same page, "Authentication and credential use": "Developers building products or services that interact with
  Claude's capabilities, including those using the Agent SDK, should use API key authentication … Anthropic does not
  permit third-party developers to offer Claude.ai login into their own applications, or to route requests through
  Free, Pro, Max, or Ultra plan credentials on behalf of their users … Nor does it prevent an end user from signing in
  to the unmodified Claude Code binary with their own Claude subscription, including where a platform hosts Claude
  Code as described under *Can customers offer Claude Code in their products?*" — and "Anthropic reserves the right to
  take measures to enforce these restrictions and may do so without prior notice."
- agent-sdk/overview: "Unless previously approved, Anthropic does not allow third party developers to offer claude.ai
  login or rate limits for their products, including agents built on the Claude Agent SDK."
- headless: the page presents `claude -p` as "using the Agent SDK via the CLI"; "`--bare` is the recommended mode for
  scripted and SDK calls, and will become the default for `-p` in a future release"; "In bare mode, Claude Code never
  reads OAuth credentials or the system keychain"; "bare mode doesn't use your subscription login".
- `--safe-mode` (cli help): "Start with all customizations … disabled — useful for troubleshooting a broken
  configuration … Auth, model selection, built-in tools and plugins, and permissions work normally."
- How others read it: JetBrains Air allows the Claude subscription only in its terminal ("The chat relies on an SDK
  integration, and Anthropic terms do not allow subscriptions to be used this way"); Raycast (commercial) runs the
  user's installed Claude Code and Codex ("never sees or stores your Claude or ChatGPT credentials"); Craft Anything
  (Apache-2.0) does the same and lists confirming large-scale use with Anthropic as open before a paid tier.

## 4. Protocol and detection

- **Agent Client Protocol** (agentclientprotocol.com, stable `protocolVersion: 1`, v2 draft): JSON-RPC over stdio,
  `initialize` → `session/new {cwd, mcpServers: []}` → `session/prompt`; text in `session/update`
  `agent_message_chunk`; no "no tools" switch (agents MAY request permission; built-in tools need agent-specific
  switches); client system prompt stable since 2026-11-06. SDK `@agentclientprotocol/sdk` 2.4.0, Apache-2.0, ESM,
  64 releases (2.0.2 → 2.4.0 in ten days), deps `zod`, `@modelcontextprotocol/server`.
- **ACP Registry** (cdn.agentclientprotocol.com/registry/v1/latest/registry.json, Apache-2.0, 45 agents): install
  recipes (npx / uvx / binary archives), no auth or detection data. Zed installs its own copies; it does not detect.
- **Adapters**: `@agentclientprotocol/claude-agent-acp` "implements an ACP agent by using the official Claude Agent
  SDK" and runs the SDK's bundled `claude.exe` (win32 package 344.8 MB), not the user's; `@agentclientprotocol/codex-acp`
  runs the Codex app-server with a bundled Codex (501 MB).
- **Detection** — Craft Anything (`crates/platform/src/which.rs`, `crates/ai/src/detect.rs`, `cli_agents/mod.rs`):
  "Installed" is a file lookup only (PATH with PATHEXT, then known folders — Windows `.local\bin`,
  `AppData\Roaming\npm`, `AppData\Local\Microsoft\WinGet\Links`, `.bun\bin`, `.cargo\bin`, nvm-for-Windows folders, the
  npm prefix, `%LOCALAPPDATA%\agy\bin`; unix `.local/bin`, `.claude/local`, `.npm-global/bin`, `.bun/bin`,
  `.volta/bin`, `/opt/homebrew/bin`, `/usr/local/bin`), scan capped ~1.5 s; skips the Claude desktop app's
  `claude.exe`; re-finds a moved binary; signed-in only for Claude (`claude auth status --json`). Obsidian "Agent
  Client" rebuilds PATH from the Windows registry because "Electron apps launched from shortcuts don't inherit the full
  user PATH". OmniRoute runs `--version` (5 s timeout, cached 60 s) and notes "Finding an installed binary does not
  prove its authentication". Open WebUI shows ready / not found / "Auth unknown". Config folders are not proof
  (measured: `~/.copilot` exists with no `copilot` program).
- **Windows spawning**: Node: ".bat and .cmd files are not executable on their own without a terminal";
  CVE-2024-27980 makes `spawn` of a `.cmd` without `shell` an `EINVAL`; `shell:true` with args is deprecated
  (DEP0190). Packages: `cross-spawn` 7.0.6 (MIT; PATHEXT, shims, escaping; goes through cmd.exe, so arguments are held
  to 8191 characters and no newlines), `which` 7.0.0 (ISC, npm org). Craft Anything parses npm shims and runs
  `node <target.js>` (its own code).

## 5. Query log

The session's own searches (2026-11-06): listed in RESEARCH.md §7 ("Searches run"), plus "use my ChatGPT Claude Gemini
Copilot subscription in other apps instead of API key 2026" (→ SIWC news, VibeProxy; nothing official for Claude,
Gemini, Copilot), "app auto-detect installed AI coding agents Claude Code Codex Gemini CLI ACP registry" (→ OmniRoute,
JetBrains ACP, klasp/skill crates). Pages fetched by the session: code.claude.com legal-and-compliance, headless,
agent-sdk/overview; support.claude.com 15036540; developers.openai.com siwc quickstart, token-sharing-open-source,
models-and-inference, preview-limitations; the cookbook SIWC article; learn.chatgpt.com docs/auth and docs/codex-sdk;
antigravity.google/terms; gh: storytold/craft-anything (docs, `cli_agents/*`), openai/sign-in-with-chatgpt-devkit
LICENSE, github/copilot-cli LICENSE.md, github/copilot-sdk metadata.

**Survey agent** — 70 searches, each with its result: (1) "use my Gemini subscription in other apps" → forum 175577,
no sanctioned path; (2) "can I use Copilot subscription in my own app" → GitHub docs, no direct answer; (3) "best way
to use claude subscription in an app 2026" → SEO pages, April 2026 ban news (unread); (4) "use AI subscription instead
of API key in third-party app 2026" → SIWC news; (5) "gemini cli headless mode output-format stream-json" → headless
docs; (6) "gemini cli terms of service third-party software use Google account login" → tos-privacy; (7) "Antigravity
CLI headless mode print prompt json output" → headless docs, issues #76/#318; (8) "Gemini CLI replaced by Antigravity
CLI June 2026 Google AI Pro" → news; (9) "Antigravity CLI terms of service third-party tools OAuth suspension Google
AI Pro" → suspension threads, forum 187241; (10) "antigravity cli agy acp agent client protocol zed" → community
adapters; (11) "GitHub Copilot SDK use in your own application subscription authentication" → SDK auth docs; (12)
"copilot cli programmatic mode -p output-format json allow-all-tools" → programmatic reference; (13) "GitHub Copilot
third-party agents OpenCode official partnership use Copilot subscription" → changelog 2026-01-16; (14) "GitHub Copilot
terms third-party clients using Copilot token unofficial API copilot-api acceptable use" → copies, nothing official;
(15) "cursor cli agent status login command windows install" → guides; (16) "cursor terms of service automated access
third-party use of cursor agent cli subscription" → ToS, forum; (17) "Cursor SDK agent typescript docs authentication
user API key subscription usage" → SDK docs; (18) "qwen code headless mode … qwen oauth free" → headless docs; (19)
"kimi cli print mode non-interactive kimi code subscription login" → kimi-cli docs; (20) "mistral vibe cli programmatic
mode --prompt le chat pro subscription" → Vibe docs; (21) "Qwen OAuth free tier discontinued qwen code 2026
authentication" → 2026-04-15 end; (22) "Mistral Vibe included in Le Chat Pro plan usage API key vibe setup login" →
api-keys page; (23) "Kiro CLI headless mode non-interactive chat --no-interactive subscription login" → kiro.dev;
(24) "Grok CLI xAI official headless SuperGrok subscription login" → guides; (25) `"Mistral plans include monthly
usage" Studio API Vibe` → subscriptions doc; (26) "grok build cli docs.x.ai headless -p output-format login SuperGrok"
→ docs.x.ai; (27) "Grok Build CLI which subscription SuperGrok Heavy X Premium access usage limits" → pricing pages;
(28) "amp cli execute mode amp -x stream-json sign in with ChatGPT subscription" → Amp docs; (29) "factory droid exec
headless output-format subscription ChatGPT Claude login" → Factory docs; (30) "opencode run --format json headless
providers Claude Pro ChatGPT Plus Copilot login" → OpenCode docs; (31) "goose cli run headless … cursor-agent gemini
cli subscription" → goose PR; (32) "iflow cli free models headless -p shutdown 2026" → shutdown; (33) "auggie cli
--print --quiet augment subscription login session" → Augment docs; (34) "junie cli headless mode jetbrains ai
subscription login non-interactive" → Junie docs; (35) "charmbracelet crush run non-interactive providers subscription
login copilot" → mirrors; (36) "Perplexity Pro subscription monthly API credits Sonar use in my own app" → perk removed;
(37) "use SuperGrok subscription in other apps xAI API credits included OAuth third-party" → Hermes, Warp, Kilo;
(38) `Anthropic "sign in with Claude" third-party apps OAuth 2026` → news, no program; (39) `docs.x.ai OAuth
third-party apps use Grok subscription "sign in with" xAI developers` → none; (40) "GLM Coding Plan z.ai can I use
outside coding tools API restriction FAQ" → docs.z.ai; (41) "GLM Coding Plan 智谱 编程套餐 使用范围 仅限编程工具 API 调用
违规" → bigmodel tool list; (42) "MiniMax token plan coding plan price API key use in any app terms" → plan docs;
(43) "Alibaba Cloud Model Studio Coding Plan price endpoint restrictions only coding tools" → Alibaba help; (44)
`MiniMax "M Plan" Go Explore Build price speech TTS included` → third-party prices; (45) "火山方舟 Coding Plan 价格 使用范围
仅限编程工具" → comparisons; (46) "OpenCode Go subscription price models API key use in other tools" → Go docs; (47)
"CLIProxyAPI how it works OAuth Claude Code Codex Gemini OpenAI compatible" → forks; (48) "claude-max-api-proxy spawns
claude cli OpenAI compatible" → repos; (49) "OmniRoute subscriptions OpenAI-compatible gateway Claude Codex Copilot how
it works" → wiki; (50) "OpenAI allows ChatGPT subscription Codex OAuth in third-party harnesses OpenClaw OpenCode
statement" → tutorials; (51) `Cline provider "Claude Code" subscription ChatGPT Plus OpenAI Codex sign in docs` →
docs.cline.bot; (52) "Zed editor use ChatGPT subscription Claude subscription Copilot sign in external agents ACP" →
Zed docs; (53) "JetBrains AI Assistant sign in with ChatGPT Claude subscription Codex agent ACP registry" → JetBrains
help; (54) "Obsidian plugin use Claude Code subscription ChatGPT subscription no API key writing" → plugins; (55)
"Raycast AI use ChatGPT subscription sign in with ChatGPT bring your own subscription" → Raycast manual; (56) "Ollama
Cloud Pro subscription API key use in any app usage limits price" → third-party; (57) "flat rate LLM subscription API
key general use not only coding Synthetic NanoGPT Chutes 2026" → comparisons; (58) "Xiaomi MiMo Token Plan price tp-
key usage scope third-party apps" → news; (59) "火山方舟 Coding Plan 官方文档 使用限制 不得用于 API 自动化 应用后端" → no
clause; (60) "Antigravity SDK Google build agents use Google AI Pro subscription sign in" → no SDK; (61) "Microsoft 365
Copilot Chat API third-party app call Copilot on behalf of user license" → Learn overview (snippet); (62) "Meta Muse
Code CLI headless subscription login" → unofficial crate; (63) `Muse Code docs "muse exec" output json flags Meta
developer` → same; (64) "ampcode.com ChatGPT subscription Amp use your ChatGPT plan OpenAI models" → Amp pricing;
(65) "is there anything better than running claude -p from my app to use Claude subscription" → wrappers, JetBrains
Air; (66) "how do desktop apps detect installed AI coding agents claude codex gemini copilot cursor auth status" →
car-external-agents crate; (67) "Google AI Pro Ultra includes Google Developer Program premium monthly Google Cloud
credits Gemini API" → Google blog; (68) "Antigravity free plan individual quota Google AI Pro Ultra limits
antigravity.google pricing" → plans snippet; (69) "is there anything better than Sign in with ChatGPT for using
ChatGPT plan in my open source app codex app-server" → SIWC codex-app-server page; (70) "Continue.dev use ChatGPT
subscription or Claude subscription or Copilot instead of API key" → none.

**Protocol/detection agent** — 20 searches: "agent client protocol"; "acp typescript sdk"; "agent client protocol
registry"; "how to detect installed claude code"; "codex login status command exit code"; "gemini cli check if logged
in command"; "github copilot cli check authentication status command"; "cursor-agent status command logged in"; "is
there anything better than agent client protocol for using claude code and codex from my app"; "codex app-server
JSON-RPC protocol documentation"; "claude -p startup time slow headless latency measured"; "JetBrains AI Assistant ACP
agents install from registry documentation"; "OmniRoute detectInstalledAgents github"; "obsidian plugin agent client
protocol claude code gemini codex"; "gemini cli terms of service third-party software use Code Assist login OAuth not
permitted"; `docs.github.com copilot cli authenticate "copilot login" GH_TOKEN COPILOT_GITHUB_TOKEN`; `cursor cli
authentication docs "cursor-agent status"`; `copilot cli acp server "--acp" docs.github.com`; "jetbrains acp.json
agent_servers command claude-code-acp configuration documentation"; "claude-agent-acp slow startup new session time
seconds". Read: the ACP spec pages, registry README/FORMAT/AUTHENTICATION and the CDN registry, the Claude legal,
agent-sdk, headless, cli-reference and setup pages, learn.chatgpt.com app-server and CLI reference, nodejs.org
child_process and the April 2024 security release, Zed external-agents docs and `agent_registry_store.rs` /
`agent_server_store.rs`, JetBrains acp help, geminicli.com, docs.github.com Copilot authenticate/install/acp-server,
cursor.com CLI auth and install, craft-anything `which.rs`, `detect.rs`, `cli_agents/*`, claude-agent-acp sources,
codex-acp README, openai/codex app-server README, TypeScript SDK `exec.ts`, `codex-rs/cli/src/login.rs`, OmniRoute
`registry.ts`, Obsidian Agent Client `platform.ts`/`paths.ts`, gemini-cli `storage.ts`, opencode `auth/list.ts`.

Gaps (searched, not found or not read): a signed-in check for Gemini, Copilot, Qwen, Goose, Antigravity; Cursor's
Windows folder; how JetBrains detects installed agents; whether `codex exec` can drop its shell tool; Copilot's ToS
Section J; free-plan access for Claude Code and Codex; Factory, Auggie and Crush terms; an xAI developer OAuth doc;
whether `--json-schema` works with stream-json output; whether `openid-client` can carry SIWC's callback-issued
`client_id` (untested).

## The recommendations as approved (verbatim, this session's reply of 2026-11-06; the user's go 2026-11-07)

> **1. ChatGPT plan: add "Sign in with ChatGPT" to the existing OpenAI provider.**
> - **What it is:** OpenAI's own way for open-source, locally run apps to use your Plus or Pro plan. You sign in once in your browser, and the app then calls the normal OpenAI API with a token instead of a key. Usage counts against your plan, and you can cap the app at 10–100% of your weekly usage in ChatGPT's settings.
> - **What it reuses:** our `openai` provider already uses the right API, with `store:false` as required. The token gets its own small table, not the API-key column.
> - **Standard:** [OpenAI's sign-in docs](https://developers.openai.com/siwc/token-sharing-open-source) and `openid-client` (MIT, [panva/openid-client](https://github.com/panva/openid-client)) for the sign-in. That's a new dependency, though not an ML package.
> - **Attack:**
>   - OpenAI's sample sign-in code is noncommercial-only, so we write our own from the public docs.
>   - These requests must leave out temperature, top_p and the reply-length limit, so presets lose those settings on this route.
>   - Whether `openid-client` handles OpenAI's one non-standard step is untested. The first build step proves it with a real sign-in; the fallback is about 100 lines written from the docs.
>   - Desktop only at first. Sign-in needs your browser on the same machine as the server.
> - **What the attack changed:** I dropped going through Codex for ChatGPT. Measured here, it took 13 s and 12,794 prompt tokens to answer "ok", sent the answer all at once, and can't turn its tools off.
>
> **2. Claude plan: a new "Claude Code" provider type that runs your own installed Claude Code.**
> - **How it runs:** `claude -p … --tools "" --safe-mode --no-session-persistence`, started through the kit's `procs.js` in an empty folder. Features that need JSON use `--output-format json --json-schema`.
> - **What you'd see:** "30% of your weekly plan used" (from Claude Code's own stream) and an API-price estimate marked "not billed".
> - **Standard:** [Anthropic's headless mode](https://code.claude.com/docs/en/headless).
> - **Attack:**
>   - **Your settings leak in without `--safe-mode`.** Measured: 14,822 prompt tokens with your CLAUDE.md, hooks and MCP tools, against 767 with it.
>   - **The terms are ambiguous.** The legal page allows "an end user … signing in to the unmodified Claude Code binary with their own Claude subscription". But the SDK page says no "claude.ai login or rate limits" for third-party products "unless previously approved", and it calls `claude -p` "the Agent SDK via the CLI". JetBrains reads this strictly. Raycast and Craft Anything ship this route anyway. Anthropic may enforce "without prior notice", and the risk falls on your account.
>   - **It could stop working.** Anthropic says `--bare` "will become the default for `-p`", and bare mode never uses the subscription. The provider will spot that and say so plainly rather than fail silently.
>   - **It's slow per call:** 6.7–7.2 s for a fresh call (item 3 fixes this).
>   - **Not for long batch jobs.** Plan limits "assume ordinary, individual usage", so it's never a default route; you pick it per feature.
>   - Not on the phone.
>
> **3. Keep one Claude Code process ready while that route is in use. NOT STANDARD, so it needs your word on this item by name.**
> - **Measured:** a pre-started process starts its reply 0.69 s after the prompt, against 6.7–7.2 s for a fresh `claude -p`. It holds 221 MB while waiting.
> - **How it works:** each process answers one request, then exits, so one request's history never reaches another. The spare is closed after a seeded, editable idle time.
> - **The standard option** is a fresh process per call, as Anthropic documents it. That's simpler but slower.
> - **Attack:** 221 MB matters on a box where JustVoice's local models are tight on memory, so the spare only exists while you're using Claude Code. JSON features still start a fresh process, because whether JSON output works with a pre-started process is unverified.
>
> **4. Auto-detect by extending the existing "Ollama detected → Connect" check** (`provider_api.js:263`, `useProviderConnect.js`).
> - **What it does:** looks for the program on PATH and in known install folders (Craft Anything's list, Apache-2.0, credited in NOTICE.md), skipping the Claude desktop app's `claude.exe`. Then `claude auth status --json` gives "signed in, Max plan".
> - **Standard:** `which` (ISC, [npm/node-which](https://github.com/npm/node-which)). The program names and folders are seeded data, following the kit's rule that defaults live in the database.
> - **Attack:** a settings folder isn't proof of an install (`~/.copilot` exists here with no `copilot` program), so only the file lookup counts. Each check costs 0.7–2 s, so it runs only on the AI settings screen and is cached.
> - **What the attack changed:** I dropped re-reading PATH from the Windows registry, because the known folders already cover installs made after the app started. ChatGPT has nothing to detect; it's always a "Sign in with ChatGPT" button.
>
> **5. Start npm-installed programs with `cross-spawn`** (MIT, [moxystudio/node-cross-spawn](https://github.com/moxystudio/node-cross-spawn)).
> - Node refuses npm's `.cmd` launchers without a shell (measured).
> - **Attack:** cross-spawn runs through cmd.exe, so arguments can't contain newlines or exceed 8191 characters. The prompt therefore goes on stdin and the system prompt through `--system-prompt-file`.
>
> **6. Copilot: not now.** You don't have the `copilot` program installed. It's official: the SDK is MIT, the program's licence allows shipping it inside open-source apps, and usage is billed to your Copilot plan. If you start using Copilot, it fits item 2's shape.
>
> **7. Google: just a hint.** Gemini CLI stopped serving AI Pro, Ultra and free sign-ins on 2026-06-18. Antigravity's terms call use from other tools grounds for "suspension or termination". What does work: AI Pro/Ultra include monthly Cloud credits for the Gemini API, so our existing Gemini provider plus a one-line hint in its form covers it.
>
> **8. Leave out:**
> - **Codex as a provider:** item 1 covers the same plan better.
> - **Cursor SDK:** only if you use Cursor.
> - **Coding-plan keys (Z.ai, Alibaba, Kimi, OpenCode Go):** their terms limit them to coding tools.
> - **xAI SuperGrok sign-in:** no xAI developer doc, and users report errors.
> - **Unofficial bridges (CLIProxyAPI and others):** they reuse sign-in tokens, which Anthropic and Google forbid by name.
> - **The agent protocol, ACP:** its Claude adapter runs a bundled 345 MB copy of Claude on the SDK route, and it has no "no tools" switch. It's worth it only if we later add many agents at once.
>
> **9. Labels: your call.** Anthropic allows plain text like "runs Claude Code" but not "Claude Code" as a feature name. My proposals are "Your Claude plan (through Claude Code)" and "Sign in with ChatGPT". I need your wording.
>
> **10. JustVoice's price question before a book run:** on a plan route, show "uses your Claude plan — 30% of this week used" instead of a dollar price. The usage ledger keeps counting tokens.

## Closed 2026-11-07

Built (items 1, 2, 4, 5, 7, 9, 10; 6 and 8 by design nothing; 3 not built — the user: "1 no"): kit 673b8f83,
3be3a654, 1aeb0d90, 5d8c5676; JustVoice bb95904d, 2590fa13; user docs — JustWrite ea3bb7b3, house-paint 6c3d11e, docgen
93ec638, JustVoice de91fb23. The tracker's record of what was built and checked: `git log -S "The person's own plans as
providers" -- docs/dev/TASKS.md`.

Checked once at the end:
- Suites: kit core 1691 (13 skipped), both lints, the pickers check, the family guard; JustVoice server 1299 and unit
  308; JustWrite server 197, unit 881 + 5 timeouts under load (9/9 alone); house-paint server 397, unit 195 + its speed
  test under load (18/18 alone); docgen 223 and 52; template 63 and 141.
- Desktop builds (`npm run build`): JustWrite, JustVoice, docgen, house-paint, the template — all pass.
- Phone builds (`npm run build:android`): JustWrite, house-paint, the template — all pass (BUILD SUCCESSFUL), once
  `NoDefaultCurrentDirectoryInExePath` was unset for the build (RESEARCH.md §5).
- e2e (`npm test`, the built desktop app on each app's real data folder): JustWrite 9/9, JustVoice 10/10, docgen 19/19,
  house-paint 18/18, the template 15/15.
- A real call through the adapter to the installed Claude Code (2.1.319, Max): signed in, answered in 3.6 s, 39 % of
  the week used, a JSON schema answered.

Not done, by the user's choice (2026-11-07: "1-2 not doing"): a real Sign in with ChatGPT at OpenAI's page — so the
authorize request's parameters and whether `openid-client` carries the callback's issued client id are still unproven
(RESEARCH.md §7) — and a look at the new settings parts rendered.
