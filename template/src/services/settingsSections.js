// SPDX-License-Identifier: MIT
// This app's Settings sections, in the order they show — ONE list the page renders and the canon
// test asserts (settingsCanon.test.js). The family's seven keep the kit's relative order
// (SETTINGS_SECTION_ORDER: Appearance · Backups · Storage · Server · Logs · Updates · About,
// app-structure §11); an app's own sections may lead, trail or sit between them — General, the
// app's own settings (/v1/settings), leads, as JustVoice's does.
export const SETTINGS_SECTION_IDS = ["general", "appearance", "backups", "storage", "server", "logs", "updates", "about"];
