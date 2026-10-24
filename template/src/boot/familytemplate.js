// SPDX-License-Identifier: MIT
// The renderer's start-up, as a Quasar boot file (app-structure §Q.4; docgen's boot/docgen.js and
// JustWrite's boot/jw.js are the donors). Quasar creates the app (App.vue), Pinia (stores/index.js)
// and the router (router/index.js), runs the boot files in quasar.config.js's order (i18n.js, then
// this one) and awaits them, then installs the router and mounts.
//
//   1. where the server is: the desktop shell knows once its server listens (JustWrite's and
//      JustVoice's race — the wait is the server check's own, so a start that hangs still ends on
//      the connection-error page); in a browser, the page's own origin or the registered port;
//   2. the kit's whole UI half in one call (installLlmUi — the UI twin of the server's installLlm);
//   3. renderer errors to the server's log (installErrorReporting, §15), the tooltip directive the
//      kit's controls use, the native save dialog for files the app makes, Help over docs/;
//   4. the server check: down → every route goes to /offline (outside the layout), and back to the
//      page it came from once it answers; up → the kit's watcher of other windows' changes;
//   5. the preferences before the ui store's first read, the theme before mount;
//   6. the warm start, awaited before mount, so the splash is up on the first paint (§11).
import { defineBoot } from "#q-app";
import {
  bootPrefs,
  CHECK_SERVER_MS,
  checkServer,
  configureFileSave,
  configureHelp,
  installErrorReporting,
  installLlmUi,
  startWarmOnBoot,
  tooltipDirective,
  watchOtherWindows,
} from "@delebash/ui";
import { i18n } from "../i18n/index.js";
import { hasDoc, loadDoc, titleForSlug } from "../services/helpDocs.js";
import { hasShell, openPath, openUrl, saveFile, saveFromUrl, shellServerUrl } from "../services/native.js";
import { useUiStore } from "../stores/ui.js";

// The registered ports (app-structure §1): the dev server's — the same number as quasar.config.js
// `devServer` and the server's APP_ORIGINS — and the server's default.
const DEV_PORTS = ["9000"];
const SERVER_FALLBACK = "http://127.0.0.1:17490";

async function boot({ app, router, store: pinia }) {
  const shellBase = await Promise.race([shellServerUrl(), new Promise((resolve) => setTimeout(() => resolve(null), CHECK_SERVER_MS))]);

  installLlmUi(app, {
    // the kit's words in this app's language (i18n/index.js starts from the kit's catalog)
    i18n,
    devPorts: DEV_PORTS,
    fallbackBase: shellBase || SERVER_FALLBACK,
    // the openers, through services/native.js — the same line in every app; the kit decides when
    // they can be used (desktop or browser)
    external: { open: openUrl, openPath },
    // the window signs in at the kit's token page (its Server panel keeps a token) when the server requires one
    // even on this computer
    askTokenOnThisComputer: true,
    // every request carries this window's id: the server counts the changes other windows make (the kit's
    // watchOtherWindows)
    sendClientId: true,
    // no embedding features in this app
    capabilities: { embeddings: false },
  });

  installErrorReporting(app);
  app.directive("tooltip", tooltipDirective);
  // Every file the app makes (Settings → Backups) goes through the kit's saveBlob: the shell's
  // Save-as dialog in the desktop app, a browser download elsewhere (§5, door 3).
  configureFileSave({
    save: (blob, { filename, title, filterName, filterExt, defaultDir }) =>
      saveFile({ blob, suggestedName: filename, title, filterName, filterExt, defaultDir }),
    saveUrl: (url, { filename, headers, title, filterName, filterExt, defaultDir }) =>
      saveFromUrl({ url, headers, suggestedName: filename, title, filterName, filterExt, defaultDir }),
    available: hasShell,
  });
  configureHelp({ loadDoc, hasDoc, titleForSlug });

  // The renderer holds no data of its own: with no server, every route shows the connection-error
  // page (pages/ConnectionErrorPage.vue) instead of empty screens that silently fail to save. Its
  // Retry reloads the window; once the server answers, /offline returns to the page it came from.
  if (!(await checkServer())) {
    router.beforeEach((to) => (to.path === "/offline" ? true : { path: "/offline", query: { from: to.fullPath } }));
    return;
  }
  router.beforeEach((to) => (to.path === "/offline" ? to.query.from || "/" : true));
  // another window's changes on this server: the pages read again (a restore or a reset reloads the window)
  watchOtherWindows();

  await bootPrefs();
  useUiStore(pinia).boot();
  // Only the decision and the load's start are awaited; the load runs on, shown by <BootModelLoad/>.
  await startWarmOnBoot();
  // Resolve the first (lazy) route before mount so the first paint is the real page: Quasar installs
  // the router after the boot files, and isReady() waits on the navigation that installing starts.
  await router.replace(router.options.history.location);
}

export default defineBoot(async (ctx) => {
  try {
    await boot(ctx);
  } catch (e) {
    // A start-up that throws must never strand the boot plate (docgen, 2026-08-05): take it down
    // and say what happened in its place — Quasar mounts nothing after a boot error.
    document.getElementById("app-boot")?.remove();
    const el = document.getElementById("q-app");
    if (el && !el.childElementCount) el.textContent = i18n.global.t("app.couldNotStart", { error: e?.message || String(e) });
    throw e;
  }
});
