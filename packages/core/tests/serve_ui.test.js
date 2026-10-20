// SPDX-License-Identifier: MIT
// The built UI's serving (platform/serve_ui.js — the twentieth review): a write to the UI's address is 405 with its
// Allow, one to an unknown API path stays the API's 404; every file a validator and a 304 for it; Vite's hashed
// files kept for good, the rest asked again each time (an update's index.html is never the old one).
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, expect, test } from "vitest";
import { createServer } from "../src/platform/server.js";
import { serveUi } from "../src/platform/serve_ui.js";

const root = mkdtempSync(path.join(os.tmpdir(), "serve-ui-"));
afterAll(() => rmSync(root, { recursive: true, force: true }));
writeFileSync(path.join(root, "index.html"), "<!doctype html>the UI");
writeFileSync(path.join(root, "favicon.ico"), "icon");
mkdirSync(path.join(root, "assets"));
writeFileSync(path.join(root, "assets", "index-B1x2y3z4.js"), "console.log(1)");

function app() {
  const a = createServer({ typeBase: "t/" });
  a.get("/v1/things", (c) => c.json({ ok: true }));
  serveUi(a, root);
  return a;
}
const call = (a, url, init = {}) => a.request(`http://127.0.0.1:17499${url}`, init);

test("a write to the UI's address is 405 naming GET and HEAD; one to an unknown API path stays a 404", async () => {
  const a = app();
  for (const method of ["POST", "PUT", "PATCH", "DELETE"]) {
    const r = await call(a, "/", { method });
    expect(r.status, method).toBe(405);
    expect(r.headers.get("allow")).toBe("GET, HEAD");
    expect(r.headers.get("content-type")).toBe("application/problem+json");
  }
  expect((await call(a, "/v1/nothing", { method: "POST" })).status).toBe(404);
  expect((await call(a, "/v1", { method: "DELETE" })).status).toBe(404);
  expect((await call(a, "/v1/things")).status).toBe(200);
  // a path that only starts like the API is the UI's
  expect((await call(a, "/v1x", { method: "POST" })).status).toBe(405);
});

test("every file carries a validator and answers 304 to it; hashed files kept for good, the rest asked again", async () => {
  const a = app();
  const page = await call(a, "/");
  expect(page.status).toBe(200);
  expect(await page.text()).toBe("<!doctype html>the UI");
  expect(page.headers.get("cache-control")).toBe("no-cache");
  const tag = page.headers.get("etag");
  expect(tag).toMatch(/^W\/"[0-9a-f]+-[0-9a-f]+"$/);
  const again = await call(a, "/", { headers: { "If-None-Match": tag } });
  expect(again.status).toBe(304);
  expect(await again.text()).toBe("");

  const hashed = await call(a, "/assets/index-B1x2y3z4.js");
  expect(hashed.headers.get("cache-control")).toBe("public, max-age=31536000, immutable");
  expect((await call(a, "/favicon.ico")).headers.get("cache-control")).toBe("no-cache");
  // HEAD answers as GET does, without the body
  const head = await call(a, "/assets/index-B1x2y3z4.js", { method: "HEAD" });
  expect(head.status).toBe(200);
  expect(head.headers.get("etag")).toBe(hashed.headers.get("etag"));

  // a file that changes gets a new tag
  writeFileSync(path.join(root, "favicon.ico"), "icon, longer");
  const before = (await call(a, "/favicon.ico")).headers.get("etag");
  expect(before).not.toBe(tag);
  expect((await call(a, "/favicon.ico", { headers: { "If-None-Match": tag } })).status).toBe(200);
});

test("a file that isn't there is a 404", async () => {
  const a = app();
  expect((await call(a, "/nope.js")).status).toBe(404);
});
