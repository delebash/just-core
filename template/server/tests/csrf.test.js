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
