// SPDX-License-Identifier: MIT
// The desktop shell's right-click menu in the interface's language (2026-10-18). The kit's shell
// draws the menu (electron-context-menu — packages/core/src/shell/main.js) and holds only its
// English until the app sends its words, the way the tray's come (setTrayLabels): an app passes
// these to its native.js `setContextMenuLabels` at boot and on every language switch. The keys are
// electron-context-menu's item ids, the ones the shell shows.
//
//   watch(locale, () => setContextMenuLabels(shellMenuLabels(t)), { immediate: true });

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
