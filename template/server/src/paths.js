// SPDX-License-Identifier: MIT
// Where the server's files are (app-structure §Q.8, §14).
//
// The data folder is the family's ONE ladder, the kit's `resolveDataDir` (the user, 2026-08-14:
// "all that can be the same should be, this includes how data is stored"):
//   1. `--data-dir` (runServer sets the variable from it)
//   2. FAMILY_TEMPLATE_DATA_DIR — the user's choice; also how the desktop shell hands its root down
//   3. `data/` beside the app (a checkout: <repo>/data) — the default, portable
//   4. the OS app-data folder, only when the install folder can't be written
// The desktop shell resolves the same ladder before its window opens; this one governs headless
// runs.

import path from "node:path";
import { resolveDataDir } from "@delebash/core/platform";

/** The data folder's name under the OS fallback — the desktop main's `appName`. */
export const APP_NAME = "FamilyTemplate";
/** The data-folder variable — the desktop main's `dataDirEnv`. */
export const DATA_DIR_ENV = "FAMILY_TEMPLATE_DATA_DIR";

// The checkout root: server/src/paths.js → the repo. Packaged, this package is installed at
// <app>/node_modules/family-template-server, so this is <app>/node_modules (the kit uses the
// executable's own folder for the data ladder then).
export const SOURCE_ROOT = path.resolve(import.meta.dirname, "..", "..");

/** The app's data folder when nothing names one (runServer's `defaultDataDir`). */
export function defaultDataDir() {
  return resolveDataDir({ appName: APP_NAME, envVar: DATA_DIR_ENV, sourceRoot: SOURCE_ROOT });
}
