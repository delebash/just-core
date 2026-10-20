// SPDX-License-Identifier: MIT
// The CSRF origin guard (the kit's csrfOrigin, wired in app.js) — docgen's tests/csrf.test.js is the
// donor. Framed as "the guard did / did not block" (403 vs anything else), so it stays true whatever
// the route itself answers.
import { expect, test } from "vitest";
import { createApp } from "../src/app.js";
import { testClient, tmpDir, useHermeticKit } from "./helpers.js";

useHermeticKit();

const client = async () => testClient(await createApp(tmpDir()));
const NOTE = { title: "CSRF probe" };

test("a cross-site write is refused before routing, without CORS headers", async () => {
  const c = await client();
  const r = await c.post("/v1/notes", { json: NOTE, headers: { origin: "http://evil.example" } });
  expect(r.statusCode).toBe(403);
  expect(r.json().type.endsWith("/cross-origin")).toBe(true);
  // CSRF runs outside CORS: its 403 carries no CORS headers
  expect(r.headers["access-control-allow-origin"]).toBeUndefined();
});

test("no Origin, the app's own origins and the phone's webview are let through", async () => {
  const c = await client();
  for (const origin of [undefined, "http://localhost:9000", "http://127.0.0.1:9000", "app://familytemplate", "https://localhost"]) {
    const r = await c.post("/v1/notes", { json: NOTE, headers: origin ? { origin } : {} });
    expect(r.statusCode, `origin ${origin}`).not.toBe(403);
  }
});

test("the server-hosted UI writes same-origin", async () => {
  // Browsers send Origin on a same-origin write too (JustWrite hit it, 2026-07-15); the guard
  // derives the server's own origin per request.
  const c = await client();
  expect((await c.post("/v1/notes", { json: NOTE, headers: { origin: "http://testserver" } })).statusCode).not.toBe(403);
});

test("a cross-site read is not the CSRF vector", async () => {
  const c = await client();
  expect((await c.get("/v1/health", { headers: { origin: "http://evil.example" } })).statusCode).toBe(200);
});

// the nineteenth review: a cross-site <img src=".../v1/data/backup"> made full backups (a GET has no CSRF check) —
// the kit's resourceIsolation (Fetch Metadata), wired beside the CSRF guard
const META = (site, mode, dest, more = {}) => ({ "sec-fetch-site": site, "sec-fetch-mode": mode, "sec-fetch-dest": dest, ...more });

test("a read the browser marks cross-site is refused: no backup is made for another site's <img>", async () => {
  const c = await client();
  const r = await c.get("/v1/data/backup", { headers: META("cross-site", "no-cors", "image") });
  expect(r.statusCode).toBe(403);
  expect(r.json().type.endsWith("/cross-site")).toBe(true);
  expect((await c.get("/v1/settings", { headers: META("cross-site", "cors", "empty", { origin: "http://evil.example" }) })).statusCode).toBe(403);
  // a link elsewhere straight to the API
  expect((await c.get("/v1/data/backup", { headers: META("cross-site", "navigate", "document") })).statusCode).toBe(403);
});

test("the app's own windows, the UI's own pages, a navigation to them and a request with no Fetch Metadata pass", async () => {
  const c = await client();
  // the desktop window fetches its server cross-site, with its Origin (measured in Electron 44)
  expect((await c.get("/v1/settings", { headers: META("cross-site", "cors", "empty", { origin: "app://familytemplate" }) })).statusCode).toBe(200);
  for (const site of ["same-origin", "none"]) expect((await c.get("/v1/settings", { headers: META(site, "cors", "empty") })).statusCode, site).toBe(200);
  // same-site is held as cross-site (the twentieth review: a page on another loopback port is same-site) — refused
  // without an allowed Origin
  expect((await c.get("/v1/settings", { headers: META("same-site", "no-cors", "image") })).statusCode).toBe(403);
  expect((await c.get("/v1/settings")).statusCode).toBe(200);
  // a link from another site to the app's page: past the guard (the page itself may not be built here)
  expect((await c.get("/", { headers: META("cross-site", "navigate", "document") })).statusCode).not.toBe(403);
});
