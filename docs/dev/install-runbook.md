# Installing the shared LLM stack — the runbook

> Ruled by the user, 2026-08-08: *"do we have a contract for how to install
> llmrunner both server and client side that a human and ai can understand, so
> in a new project both ai and human can read doc and understand how to
> install."* This is that contract: the SEQUENCE, with every function name and
> argument verified against the code the day it was written. Depth lives in
> `docs/app-structure.md` — each step cites its section. If a step here stops
> matching the code, the code is right and this file has a bug.

The stack has exactly two installers, one per half. Each is ONE call, and each
exists because the à-la-carte version shipped silent breakage (four configure
calls, hand-mounted hosts, a missing attribute — all measured failures,
recorded in `ui/src/installLlmUi.js`'s header).

## The server half — Node (Hono)

The kit's server is plain JavaScript on Node 24 (Electron's) since the family's move off Python
(2026-10-07); its recipe is the kit's `server/README.md` "Consume it", and app-structure §8 is
the depth. In order:

1. **Depend on the package** — `"@delebash/llm-runner": "file:../just-llm-runner/server"` in the
   app's `server/package.json` (and in `src-electron/package.json`, which packages it); no
   publish step, no pin (app-structure §Q.3).
2. **Mount and install, once** — inside `runServer({ envPrefix, build })`: `createServer()`,
   `openDatabase(...)`, `app.route("/", runnerRouter())` (the host's `/v1/llm-runner/*`), then
   `await installLlm(app, { db, dataDir, product, featureCatalog, … })`. Always pass `dataDir`
   (the kit's CLAUDE.md, "What bites"); every route is under `/v1`; the router port is allocated,
   never 8080 (app-structure §8).
3. **One Hono** — import `Hono`, `stream` and `serveStatic` from
   `@delebash/llm-runner/platform`, never `hono` itself (the guard's `checkOneHono`).
4. **AI calls** go through `runAiFeature` / `withAiTask`, never `tasks.start` (app-structure §8,
   "The AI-call convention").
5. **Tests** stay hermetic: point `JUST_AI_HOME` at a scratch folder so the machine-wide cache
   registry isn't written (the kit's CLAUDE.md, "What bites").

## The client half — Vue

1. **Consume the kit as SOURCE** via the vite alias — all apps do; kit edits
   are live in every app's dev build immediately (app-structure §3):

   ```js
   // vite.config.js
   resolve: { alias: { "@delebash/llm-ui": fileURLToPath(new URL("../just-llm-runner/ui/src", import.meta.url)) } }
   ```

2. **Call `installLlmUi` in `main.js`** — one call, both transports, all hosts:

   ```js
   import { installLlmUi } from "@delebash/llm-ui";

   installLlmUi(app, {
     devPorts: [1430],            // your vite dev port(s) → origin-aware resolver
     fallbackBase: "http://127.0.0.1:17494",  // the Tauri-webview fallback — REQUIRED
     i18n,                        // your vue-i18n instance — REQUIRED; your voice is kit.* keys in its catalog
     capabilities: { embeddings: true },
     labAdapters, sectionedFeatures, featurePanels,  // Lab wiring (optional)
   });
   ```

   The installer feeds ONE resolved base URL to both the app transport
   (`configureServerApi`) and the kit client (`configureLlmUi`) — the invariant
   that, when broken, made every kit view render empty in the production
   webview only. Signature: `ui/src/installLlmUi.js:91`.

3. **Mount the two pieces of chrome** the installer cannot place for you:
   `<LlmUiHosts />` once in the app shell (toasts, dialogs, boot overlay —
   without it `confirmDialog()` never settles), and the `/ai` route rendering
   the kit `AiModelsArea` plus `AiStatusButton` in the title bar and the
   AI-tasks nav row from `useAiTasksNav()`. (app-structure §11)

4. **Call AI the ONE sanctioned way** (app-structure §8, the AI-call
   convention; check-family check 11 enforces it):
   - variables in the renderer's hand → `runAiFeature` / `runAiFeatureStream`;
   - your own server-composed endpoint → `runAiEndpoint` (JSON + usage) or
     `runAiEndpointStream` (family SSE frames);
   - anything long (TTS, installs, batches, polls) → `withAiTask`.
   App code never calls `useAiTasksStore().start()` itself; every AI response
   carries usage; one task indicator per run; trigger buttons disable, never
   spin.

## Done when

Every §12 box in `docs/app-structure.md` checks — including the three AI-call
boxes: no task-store starts outside the runners, tokens visible on a real LLM
run, one indicator per run. `node scripts/check-family.js` from this repo is
the machine's version of this page; a clean run plus §12 is "installed".
