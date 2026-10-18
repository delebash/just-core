// SPDX-License-Identifier: MIT
// Product, version and port — one source for the server (app-structure §14). The version is the
// server package's own (`readPackageVersion`, the kit's): set once in package.json, read by
// /v1/health and the About section, never typed into code. The guard checks the root and the
// server package.json versions agree.

import { readPackageVersion } from "@delebash/core/platform";

/** The name the desktop shell knows this app's server by: GET /v1/health answers it, and a
 * listener on the app's port is stopped only when it does (src-electron/electron-main.js
 * `productName`). */
export const PRODUCT = "Family Template";
export const VERSION = readPackageVersion(import.meta.url);
export const API_VERSION = "v1";
/** The family port registry (app-structure §1): JW 17495 · JV 17494 · docgen 8742 · template 17490. */
export const DEFAULT_PORT = 17490;
