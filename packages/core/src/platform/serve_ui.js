// SPDX-License-Identifier: MIT
// The built UI, served for the headless path — a browser at the server's address is the whole app.
// The family's one copy: every app had its own block, and the twentieth review of Just House Paint
// found them all short — a write to an unknown /v1 path answered 405 (not the 404 the API gives),
// the 405 named no Allow, and no file carried a validator or a cache rule, so a browser fetched every
// file again on each load and could keep an index.html past an update by heuristic freshness
// (RFC 9111 §4.2.2: a tenth of its age since Last-Modified).
//
//   - a write to the UI's address: 405 with `Allow: GET, HEAD` (RFC 9110 §15.5.6); one under an API
//     prefix falls through to the API's own 404
//   - every file a weak ETag of its size and time (what Express's serve-static sends, the `etag`
//     package's stat form) and a 304 for an If-None-Match naming it (hono/etag)
//   - Vite's hashed files (`assets/`) kept a year, immutable; every other file `no-cache` — kept but
//     asked again each time, so a new version's index.html is never the old one (Vite's "Deploying a
//     Static Site", web.dev's "Love your cache")
//
// Mount it after every API route: Hono runs routes in the order added.

import { statSync } from "node:fs";
import path from "node:path";
import { serveStatic } from "@hono/node-server/serve-static";
import { etag } from "hono/etag";
import { HttpError } from "./errors.js";

const KEEP_HASHED = "public, max-age=31536000, immutable";

/**
 * Serve the built UI in `root` on `app`. `apiPrefixes`: the API's paths, whose unknown writes stay
 * the API's 404; `hashedDir`: the build's folder of content-hashed files (Vite's `build.assetsDir`).
 */
export function serveUi(app, root, { apiPrefixes = ["/v1"], hashedDir = "assets" } = {}) {
  const underApi = (p) => apiPrefixes.some((pre) => p === pre || p.startsWith(`${pre}/`));
  app.on(["POST", "PUT", "PATCH", "DELETE", "OPTIONS"], "/*", (c, next) => {
    if (underApi(c.req.path)) return next();
    throw new HttpError(405, "Method Not Allowed", { Allow: "GET, HEAD" });
  });
  app.get(
    "/*",
    etag(),
    async (c, next) => {
      await next();
      const file = c.get("uiFile");
      if (!file || !c.res.ok) return;
      const stat = statSync(file, { throwIfNoEntry: false });
      if (!stat) return;
      c.res.headers.set("ETag", `W/"${stat.size.toString(16)}-${Math.floor(stat.mtimeMs).toString(16)}"`);
      const hashed = path.relative(root, file).split(/[\\/]/)[0] === hashedDir;
      c.res.headers.set("Cache-Control", hashed ? KEEP_HASHED : "no-cache");
    },
    serveStatic({ root, onFound: (file, c) => c.set("uiFile", file) }),
  );
}
