// SPDX-License-Identifier: MIT
// The server's entry — `serve [--host H] [--port P] [--data-dir D] [--log-level L]`, run three ways
// through the kit's runServer (app-structure §Q.3): by the desktop app in a utilityProcess (it
// reads the `ready` message runServer posts), headless as `family-template-server serve` (the
// app's own exe run as Node — build/launcher/), and `npm run server` in a checkout.
//
// Defaults: host 127.0.0.1, port 17490 (the registry's), the data folder `--data-dir`, else
// FAMILY_TEMPLATE_DATA_DIR, else the family ladder (paths.js; a checkout's is <repo>/data).
// runServer also reads FAMILY_TEMPLATE_HOST / _PORT / _LOG_LEVEL.
//
// The seed pass runs HERE, after createApp, never inside it: a test's createApp(tmp) starts from
// an empty database (the family's call-site).

import path from "node:path";
import { pathToFileURL } from "node:url";
import { runServer } from "@delebash/core/platform";
import { setLevel } from "@delebash/core/platform/log";
import { createApp } from "./app.js";
import { getDb } from "./app_state.js";
import { seedWorkspace } from "./database/seed.js";
import { defaultDataDir } from "./paths.js";
import { DEFAULT_PORT, PRODUCT, VERSION } from "./version.js";

export async function main(argv = process.argv.slice(2)) {
  return runServer({
    argv,
    envPrefix: "FAMILY_TEMPLATE",
    // One server per data folder (the kit's platform/data_lock.js): the folder — the family ladder
    // when none is named — is locked before `build` opens it, and a second server there says so.
    productName: PRODUCT,
    defaultDataDir,
    build: async ({ dataDir, host, port, logLevel }) => {
      setLevel(logLevel);
      const app = await createApp(dataDir);
      seedWorkspace(getDb());
      const h = host || "127.0.0.1";
      const p = port ?? DEFAULT_PORT;
      return { app, host: h, port: p, banner: `${PRODUCT} ${VERSION} server listening on http://${h}:${p}` };
    },
  });
}

// Run when started as a program — by the desktop app (a utilityProcess has `parentPort`) or as
// `node …/serve.js` — not when a test imports it.
const entry = process.argv[1] ? pathToFileURL(path.resolve(process.argv[1])).href : "";
if (process.parentPort || entry === import.meta.url) await main();
