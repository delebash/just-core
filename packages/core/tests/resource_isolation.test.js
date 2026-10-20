// SPDX-License-Identifier: MIT
// Fetch Metadata resource isolation (csrf.js resourceIsolation — web.dev's Resource Isolation Policy, 2026-10-20, the
// nineteenth review: a cross-site <img src=".../v1/data/backup"> made full backups). Each case the policy names: a
// cross-site read refused; the app's own windows (the desktop window's app://<id>, measured cross-site in Electron 44),
// the dev server and the phone pass by their Origin; a top-level navigation to the UI's pages passes, to the API not;
// same-origin, same-site and "none" pass; a request without the header (curl, another app) passes; writes are
// csrfOrigin's, untouched here.
import { expect, test } from "vitest";
import { resourceIsolation } from "../src/platform/csrf.js";
import { createServer } from "../src/platform/server.js";

function app() {
  const a = createServer({ typeBase: "t/" });
  a.use("*", resourceIsolation({ appOrigins: ["app://demo", "http://localhost:1460"], extraOrigins: ["https://paint.example.com"], typeBase: "t/" }));
  a.get("/v1/data/backup", (c) => c.json({ made: true }));
  a.post("/v1/notes", (c) => c.json({ wrote: true }));
  a.get("/*", (c) => c.text("<!doctype html>the UI"));
  return a;
}
const meta = (site, mode, dest, more = {}) => ({ "sec-fetch-site": site, "sec-fetch-mode": mode, "sec-fetch-dest": dest, ...more });
const get = (a, url, headers, method = "GET") => a.request(`http://127.0.0.1:17499${url}`, { method, headers });

test("a read the browser marks cross-site is refused — an <img>, a script, a fetch from another site, a HEAD", async () => {
  const a = app();
  for (const headers of [
    meta("cross-site", "no-cors", "image"), // <img src=…/v1/data/backup> on any page
    meta("cross-site", "no-cors", "script"),
    meta("cross-site", "cors", "empty", { origin: "https://evil.example" }),
    meta("cross-site", "no-cors", "iframe"),
  ]) {
    const r = await get(a, "/v1/data/backup", headers);
    expect(r.status, JSON.stringify(headers)).toBe(403);
    expect(r.headers.get("content-type")).toBe("application/problem+json");
    expect(await r.json()).toEqual({ type: "t/cross-site", title: "Forbidden", status: 403, detail: "cross-site request rejected", instance: "/v1/data/backup" });
  }
  expect((await get(a, "/v1/data/backup", meta("cross-site", "no-cors", "image"), "HEAD")).status).toBe(403);
  // the UI's files too, but by a top-level navigation (below)
  expect((await get(a, "/assets/index.js", meta("cross-site", "no-cors", "script"))).status).toBe(403);
  // an unknown value isn't one of the passing ones
  expect((await get(a, "/v1/data/backup", meta("cross-site-ish", "no-cors", "image"))).status).toBe(403);
});

test("the app's own windows pass by their Origin: the desktop window (app://), the dev server, the phone, a proxy's name", async () => {
  const a = app();
  for (const origin of ["app://demo", "http://localhost:1460", "https://localhost", "capacitor://localhost", "https://paint.example.com", "http://127.0.0.1:17499"]) {
    const r = await get(a, "/v1/data/backup", meta("cross-site", "cors", "empty", { origin }));
    expect(r.status, origin).toBe(200);
  }
});

test("a top-level navigation passes to the UI's pages, never to the API", async () => {
  const a = app();
  expect((await get(a, "/", meta("cross-site", "navigate", "document"))).status).toBe(200);
  expect((await get(a, "/houses/abc", meta("cross-site", "navigate", "document"))).status).toBe(200);
  // a link elsewhere to the backup
  expect((await get(a, "/v1/data/backup", meta("cross-site", "navigate", "document"))).status).toBe(403);
  // framed by another site, or a navigation into an <object>
  expect((await get(a, "/", meta("cross-site", "navigate", "iframe"))).status).toBe(403);
  expect((await get(a, "/", meta("cross-site", "navigate", "object"))).status).toBe(403);
});

test("same-origin, same-site, none and no header pass; writes are left to csrfOrigin", async () => {
  const a = app();
  for (const site of ["same-origin", "same-site", "none"]) {
    expect((await get(a, "/v1/data/backup", meta(site, "no-cors", "image"))).status, site).toBe(200);
  }
  expect((await get(a, "/v1/data/backup", {})).status).toBe(200); // curl, another app, a browser over plain http elsewhere
  const w = await a.request("http://127.0.0.1:17499/v1/notes", { method: "POST", headers: meta("cross-site", "cors", "empty", { origin: "https://evil.example" }) });
  expect(w.status).toBe(200); // (csrfOrigin refuses it, wired beside this one)
});
