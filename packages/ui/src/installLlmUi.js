// SPDX-License-Identifier: MIT
// The UI twin of the server's `install_llm` — one call that wires the whole shared
// LLM front end into a host app.
//
// WHY IT EXISTS. The Python half has had one installer since 2026-08-01; the UI half
// had none, and that asymmetry is not cosmetic — it is where every silent breakage
// landed. Measured on just_ai_i18n_docgen (2026-08-03): four separate `configure*()`
// calls, `<Toast>` and `<AppDialog>` mounted by hand, and a nav row that had to carry
// an exact `data-panel-toggle` attribute. Each was a step someone had to KNOW about,
// and forgetting one failed quietly:
//   • `<AppDialog/>` unmounted → `confirmDialog()`'s promise never settles, so every
//     confirmed action in the app was a button that did nothing at all.
//   • `configureLlmUi({})` with no baseUrl → defaults to `window.location.origin`,
//     which in the production webview (Tauri's, then) was `tauri.localhost`, so every
//     kit LLM view rendered EMPTY — in production only.
//   • the missing `data-panel-toggle` → the AI-tasks panel opened and instantly
//     closed, because the click that opened it counted as the outside-click.
//
// So this installer's job is not to save typing. It is to make those three states
// unreachable: ONE base URL feeds both transports, the hosts arrive as a single
// component, and the nav row's required attribute comes from the composable.

import { configureExternal, isDesktopShell } from "./common/services/external.js";
import { configureServerApi, makeOriginAwareResolver } from "./common/services/serverApi.js";
import { configureLlmUi } from "./client.js";
import { setKitI18n } from "./common/services/kitI18n.js";
import { setQuickSetupApplied } from "./services/quickSetupApplied.js";
import { registerFeaturePanels, registerLabAdapters, registerSectionedFeatures } from "./services/labAdapters.js";
import LlmUiHosts from "./components/LlmUiHosts.vue";
import { installQuasarTheme } from "./quasar/install.js";

// What this app's LLM stack can do. Declared by the host, read by the kit — an app
// that has no embedding features, or no local engine, says so ONCE here, instead of
// switching off each surface that would have shown one.
//   embeddings: false  — no embedding features (docgen; JustWrite's phone): the catalog's
//                        embedding slot, the Set-as-default dialog's embed
//                        block and Quick Setup's embed step hide.
//   localEngine: false — online providers only (JustWrite's phone, whose in-app server has
//                        no llama.cpp runner): the AI page's Local scope, its Quick Setup,
//                        the machine strip and the engine console hide, the first-run offer
//                        keeps only "connect a provider", and warm-on-boot never runs — so
//                        nothing asks for the runner's or the hardware probe's routes.
const _capabilities = { embeddings: true, localEngine: true };

/** What the host declared — a kit surface asks here rather than take another copy flag. */
export function llmUiCapabilities() {
  return { ..._capabilities };
}

/** A desktop shell that wires no opener at all: `external.js` still falls back to
 *  window.open for links, but Open folder has no fallback, so it is silently dead.
 *  Say so instead of pretending. (The openers stay the APP's: only its
 *  `services/native.js` reads the shell's bridge.)
 *
 *  The second copy of the "are we in the desktop shell?" test lived here until 2026-08-14
 *  and tested something else (protocol/hostname); external.js owns the one test now. */
function warnNoOpener() {
  if (isDesktopShell()) {
    console.warn(
      "[llm-ui] Open folder will do nothing in this window: pass " +
      "installLlmUi(app, { external: { open: openUrl, openPath } }) from the app's services/native.js.",
    );
  }
}

/**
 * Wire the shared LLM UI into `app`.
 *
 * @param app                Vue application instance
 * @param opts.i18n          REQUIRED — the app's vue-i18n instance, created from the kit's
 *                           catalog (`kitMessages()`) with the app's own merged after it:
 *                           the kit's words are its `kit.*` keys in the app's language,
 *                           and an app rewords one (its model catalog's or Quick Setup's
 *                           voice) by setting the same key in its own catalog
 * @param opts.onQuickSetupApplied called when Quick Setup finishes (`{ modelId }`)
 * @param opts.devPorts      Vite dev ports that must NOT be treated as same-origin
 * @param opts.fallbackBase  loopback base for dev + the desktop window (app://<id>)
 * @param opts.serverOverrideKey localStorage key that, when set, points the app at
 *                           a remote server and beats the origin-aware default
 * @param opts.resolveBase   supply a resolver instead of devPorts/fallbackBase
 * @param opts.capabilities  e.g. `{ embeddings: false, localEngine: false }` (above)
 * @param opts.labAdapters   per-FEATURE Lab adapters `{ featureKey: { run, render,
 *                           configExtra } }` — the app's real pipeline behind that
 *                           feature's Lab columns (see services/labAdapters.js)
 * @param opts.sectionedFeatures array of FEATURE keys whose prompt rows compose
 *                           into ONE call (the `<key>.base` row is the template,
 *                           its `{{section}}` markers fill from the other rows):
 *                           one nav card, every text edited on the pane, the Lab
 *                           over the app's prompt-preview (decided 2026-08-08 —
 *                           retires the 2026-08-06 pieces concept)
 * @param opts.featurePanels `{ featureKey: Component }` — an app control mounted on
 *                           that feature's routing pane (JV's reading-style dial)
 * @param opts.external      your openers, from the app's `services/native.js`:
 *                           `{ open: openUrl, openPath }` — the identical line in
 *                           all three apps. `(url) => …` is the older links-only
 *                           form; `false` skips wiring. Both are gated on being in
 *                           the desktop window by `common/services/external.js`, so a
 *                           browser keeps window.open for links and reports "can't"
 *                           for folders rather than firing a dead menu item.
 * @param opts.askTokenOnThisComputer true when the app's window signs in at the kit's token page
 *                           (it keeps the kit's token storage and uses its Server panel): the boot
 *                           check stops there when the server requires a token even on this computer
 *                           (configureServerApi). Off by default — the window loads as before.
 */
export function installLlmUi(app, {
  i18n,
  onQuickSetupApplied,
  devPorts = [],
  fallbackBase = "",
  serverOverrideKey = "",
  resolveBase,
  capabilities,
  labAdapters,
  sectionedFeatures,
  featurePanels,
  external = true,
  askTokenOnThisComputer = false,
} = {}) {
  if (!i18n?.global) {
    throw new Error("installLlmUi needs the app's vue-i18n instance: installLlmUi(app, { i18n }) — see app-structure §Q.");
  }
  setKitI18n(i18n);
  const resolve = resolveBase
    || makeOriginAwareResolver({ devPorts, fallback: fallbackBase, overrideKey: serverOverrideKey });

  // THE invariant: the app transport and the kit's LLM views resolve to the SAME
  // base. They were two calls, and the day they disagreed the kit views 404'd into
  // empty lists in the production webview only. One resolver, called once, both fed.
  configureServerApi({ resolveBase: resolve, askTokenOnThisComputer });
  const base = resolve();
  configureLlmUi({ baseUrl: base });
  setQuickSetupApplied(onQuickSetupApplied);

  if (capabilities) Object.assign(_capabilities, capabilities);
  if (labAdapters) registerLabAdapters(labAdapters);
  if (sectionedFeatures) registerSectionedFeatures(sectionedFeatures);
  if (featurePanels) registerFeaturePanels(featurePanels);
  if (external !== false) {
    // `{ open, openPath }` is the shape all three apps pass (both from the app's
    // services/native.js). A bare function is the older links-only form and still
    // works. external.js gates both on being in the desktop window, so nothing
    // here has to ask what kind of host this is.
    const open = typeof external === "function" ? external : (external && external.open) || null;
    const openPath = (typeof external === "object" && external && external.openPath) || null;
    if (!open) warnNoOpener();
    configureExternal({ open, openPath });
  }

  // The kit's controls are Quasar components (docs/plans/2026-10-09-kit-controls-on-quasar.md):
  // Quasar draws its own icons with the kit's line icons.
  installQuasarTheme();

  // Registered, not imported: an app that forgets `<LlmUiHosts />` in its shell has
  // one thing missing rather than three, and that one thing is named after the job.
  app.component("LlmUiHosts", LlmUiHosts);
  return { resolveBase: resolve, base };
}
