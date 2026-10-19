// SPDX-License-Identifier: MIT
// The desktop shell's two menus in the app's language (common/services/shellMenu.js): the words an
// app sends with setTrayLabels and setContextMenuLabels. The shell only takes keys it knows, so the
// tray's must be its DEFAULT_TRAY_LABELS keys, every one; the app's name fills About and Quit.
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, test } from "vitest";
import { createI18n } from "vue-i18n";

import en from "../src/i18n/locales/en.json";
import { shellMenuLabels, shellTrayLabels } from "../src/common/services/shellMenu.js";

const { t } = createI18n({ legacy: false, locale: "en", messages: { en } }).global;
// the shell's tray keys, read from its source (main.js is Electron's main process, not importable here)
const main = readFileSync(resolve(import.meta.dirname, "../../core/src/shell/main.js"), "utf8");
const trayKeys = [...main.match(/const DEFAULT_TRAY_LABELS = \{([^}]*)\}/)[1].matchAll(/^\s*(\w+):/gm)].map((m) => m[1]);

describe("the shell's menus", () => {
  test("the tray's words cover every row the shell draws, with the app's name in About and Quit", () => {
    const labels = shellTrayLabels(t, "JustWrite");
    expect(Object.keys(labels).sort()).toEqual([...trayKeys].sort());
    expect(labels.about).toBe("ℹ️ About JustWrite");
    expect(labels.quit).toBe("🚪 Quit JustWrite");
    for (const [k, v] of Object.entries(labels)) expect(v, k).not.toMatch(/^kit\./);
  });

  test("the right-click menu's words are all in the catalog", () => {
    for (const [k, v] of Object.entries(shellMenuLabels(t))) expect(v, k).not.toMatch(/^kit\./);
  });
});
