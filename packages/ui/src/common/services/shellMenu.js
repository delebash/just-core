// SPDX-License-Identifier: MIT
// The desktop shell's two menus in the interface's language: the right-click menu (2026-10-18) and
// the tray's (2026-10-19). The kit's shell draws both (electron-context-menu and the tray —
// packages/core/src/shell/main.js) and holds only their English until the app sends its words: an
// app passes these to its native.js `setContextMenuLabels` and `setTrayLabels` at boot and on every
// language switch. The right-click menu's keys are electron-context-menu's item ids; the tray's are
// the shell's (DEFAULT_TRAY_LABELS), the same in every app — the menu is JustVoice's, whole (§11).
//
//   watch(locale, () => {
//     setTrayLabels(shellTrayLabels(t, t("app.name")));
//     setContextMenuLabels(shellMenuLabels(t));
//   }, { immediate: true });

/** @param {(key: string) => string} t  vue-i18n's t */
export function shellMenuLabels(t) {
  return {
    learnSpelling: t("kit.shellMenu.addToDictionary"),
    dictionarySuggestions: t("kit.shellMenu.noSuggestions"),
    cut: t("kit.shellMenu.cut"),
    copy: t("kit.shellMenu.copy"),
    paste: t("kit.shellMenu.paste"),
    selectAll: t("kit.shellMenu.selectAll"),
    copyImage: t("kit.shellMenu.copyImage"),
    copyLink: t("kit.shellMenu.copyLink"),
  };
}

/**
 * @param {(key: string, params?: object) => string} t  vue-i18n's t
 * @param {string} app  the app's name, in the About and Quit rows
 */
export function shellTrayLabels(t, app) {
  return {
    show: t("kit.shellTray.show"),
    hide: t("kit.shellTray.hide"),
    serverStart: t("kit.shellTray.serverStart"),
    serverStop: t("kit.shellTray.serverStop"),
    serverRestart: t("kit.shellTray.serverRestart"),
    openSettings: t("kit.shellTray.openSettings"),
    copyUrl: t("kit.shellTray.copyUrl"),
    openLogs: t("kit.shellTray.openLogs"),
    about: t("kit.shellTray.about", { app }),
    quit: t("kit.shellTray.quit", { app }),
    // the shell's "unsaved work" box (2026-10-20: a page's beforeunload kept → Electron's will-prevent-unload), sent
    // with the tray's words — the shell's one channel for its own words
    unloadTitle: t("kit.shellUnload.title"),
    unloadDetail: t("kit.shellUnload.detail"),
    unloadLeave: t("kit.shellUnload.leave"),
    unloadStay: t("kit.shellUnload.stay"),
  };
}
