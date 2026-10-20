// SPDX-License-Identifier: MIT
// The app factory, proven working from a fresh data folder — the family surface every app's server
// carries (app-structure §8, §11, §14, §18; docgen's server/tests/app.test.js is the donor): the AI
// stack booted, seeded and wired; the logs ring by its CONTENT; the disk route; health's wire; the
// bearer guard and its lockout escape; CORS answering an Origin.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { getLogger } from "@delebash/core/platform/log";
import { pyPath } from "@delebash/core/runner/cache_registry";
import * as lifecycle from "@delebash/core/runner/lifecycle";
import { beforeEach, expect, test, vi } from "vitest";
import { createApp } from "../src/app.js";
import { getDb } from "../src/app_state.js";
import { seedWorkspace } from "../src/database/seed.js";
import { FEATURE_CATALOG } from "../src/feature_catalog.js";
import { PRODUCT } from "../src/version.js";
import { testClient, tmpDir, useHermeticKit } from "./helpers.js";

useHermeticKit();

let client;
let dataDir;
beforeEach(async () => {
  dataDir = tmpDir();
  const app = await createApp(dataDir);
  // serve.js's own sequence: createApp, then the seed pass
  seedWorkspace(getDb());
  client = testClient(app);
});

test("the AI stack boots seeded and wired", async () => {
  const providers = await client.get("/v1/llm-providers");
  expect(providers.statusCode).toBe(200);
  expect(providers.json().providers.length, "seedLlm should have seeded providers").toBeGreaterThan(0);

  const models = await client.get("/v1/llm-runner/models");
  expect(models.statusCode).toBe(200);
  const body = models.json();
  expect(body.catalogWired).toBe(true);
  expect(body.models.map((m) => m.id)).toEqual(expect.arrayContaining(["gemma-4-26b-a4b-qat", "gemma-4-12b-qat", "gemma-4-e4b-qat"]));

  expect((await client.get("/v1/ai-usage")).statusCode).toBe(200);
});

test("routing by feature lists exactly this app's features, each on its preset", async () => {
  const routing = await client.get("/v1/ai/routing");
  expect(routing.statusCode).toBe(200);
  const keys = (routing.json().features || []).map((f) => f.key);
  expect(keys).toEqual(FEATURE_CATALOG.map((f) => f.key));
  expect(keys).toEqual(["notes.suggestTitle"]);
});

test("the runner's cache lands in the app's data folder", () => {
  // Delete the app's folder, delete the models with it: dataDir was passed to installLlm.
  expect(String(lifecycle.getService().cacheRoot)).toBe(pyPath(join(dataDir, "ai-cache")));
});

test("the logs ring serves what the server logged — content, not just a 200", async () => {
  getLogger("family_template.test").warning("RING-PROOF abc123");
  const r = await client.get("/v1/logs/tail");
  expect(r.statusCode).toBe(200);
  expect(r.json().text).toContain("RING-PROOF abc123");
});

test("a renderer error posted to /v1/logs/client lands in the same log", async () => {
  const r = await client.post("/v1/logs/client", { json: { level: "error", message: "CLIENT-PROOF def456", context: "test" } });
  expect(r.statusCode).toBeLessThan(300);
  expect((await client.get("/v1/logs/tail")).json().text).toContain("CLIENT-PROOF def456");
});

test("the disk route reports the data folder", async () => {
  const r = await client.get("/v1/disk/usage");
  expect(r.statusCode).toBe(200);
  expect(r.json().database).toBeGreaterThan(0); // the app's database file is measured
});

test("health answers the family's base wire plus this app's extras", async () => {
  const r = await client.get("/v1/health");
  expect(r.statusCode).toBe(200);
  const pkg = (rel) => JSON.parse(readFileSync(new URL(rel, import.meta.url), "utf8"));
  // one version: the server package's, the same as the app's
  expect(pkg("../../package.json").version).toBe(pkg("../package.json").version);
  expect(r.json()).toEqual({
    status: "ok",
    product: PRODUCT,
    version: pkg("../package.json").version,
    apiVersion: "v1",
    dataDir,
    // whose server this is (a hash of the OS user — the shell never stops another user's)
    owner: expect.stringMatching(/^[0-9a-f]{12}$/),
    dbReady: true,
  });
});

test("bearer auth gates /v1 only once a token exists", async () => {
  expect((await client.get("/v1/notes")).statusCode).toBe(200); // off by default

  const r = await client.put("/v1/server-auth", { json: { tokens: ["s3cret"] } });
  expect(r.statusCode).toBe(200);
  try {
    expect((await client.get("/v1/notes")).statusCode, "no header → 401").toBe(401);
    expect((await client.get("/v1/notes", { headers: { authorization: "Bearer wrong" } })).statusCode, "bad token → 403").toBe(403);
    expect((await client.get("/v1/notes", { headers: { authorization: "Bearer s3cret" } })).statusCode, "good token").toBe(200);
  } finally {
    await client.put("/v1/server-auth", { json: { tokens: [] }, headers: { authorization: "Bearer s3cret" } });
  }
  expect((await client.get("/v1/notes")).statusCode).toBe(200);
});

test("the lockout escape: health and the token door stay open from this machine", async () => {
  // Tokens required even on this machine and the token lost: the boot check and the door that
  // fixes it must still answer, or the app could never be reached again.
  await client.put("/v1/server-auth", { json: { tokens: ["s3cret"], requireForLoopback: true }, from: "127.0.0.1" });
  try {
    expect((await client.get("/v1/health", { from: "127.0.0.1" })).statusCode).toBe(200);
    expect((await client.get("/v1/server-auth", { from: "127.0.0.1" })).statusCode).toBe(200);
    expect((await client.get("/v1/notes", { from: "127.0.0.1" })).statusCode, "the rest stays gated").toBe(401);
  } finally {
    await client.put("/v1/server-auth", { json: { tokens: [] }, from: "127.0.0.1" });
  }
});

// the nineteenth review: a padded token was stored as typed and never matched; a non-ASCII one was taken
test("a token is stored trimmed and matches; one with other characters is refused in words, at its place", async () => {
  let r = await client.put("/v1/server-auth", { json: { tokens: ["  s3cret\t", " "] } });
  expect(r.statusCode).toBe(200);
  expect(r.json().tokens).toEqual(["s3cret"]);
  try {
    expect((await client.get("/v1/notes", { headers: { authorization: "Bearer s3cret" } })).statusCode).toBe(200);
    r = await client.put("/v1/server-auth", { json: { tokens: ["ok", "café", "two words"] }, headers: { authorization: "Bearer s3cret" } });
    expect(r.statusCode).toBe(422);
    expect(r.json().errors.map((e) => e.loc)).toEqual([
      ["body", "tokens", "1"],
      ["body", "tokens", "2"],
    ]);
    expect(r.json().errors[0].msg).toMatch(/letters, digits and the signs on a keyboard only/);
    // nothing changed
    expect((await client.get("/v1/server-auth", { headers: { authorization: "Bearer s3cret" } })).json().tokens).toEqual(["s3cret"]);
  } finally {
    await client.put("/v1/server-auth", { json: { tokens: [] }, headers: { authorization: "Bearer s3cret" } });
  }
});

test("the access tokens are checked by their schema and never logged", async () => {
  const r = await client.put("/v1/server-auth", { json: { tokens: "not-a-list" } });
  expect(r.statusCode).toBe(422);
  expect(r.json().errors[0].loc).toEqual(["body", "tokens"]);
  await client.put("/v1/server-auth", { json: { tokens: ["TOKEN-NEVER-LOGGED"] } });
  try {
    expect((await client.get("/v1/logs/tail", { headers: { authorization: "Bearer TOKEN-NEVER-LOGGED" } })).json().text).not.toContain(
      "TOKEN-NEVER-LOGGED",
    );
  } finally {
    await client.put("/v1/server-auth", { json: { tokens: [] }, headers: { authorization: "Bearer TOKEN-NEVER-LOGGED" } });
  }
});

test("a browser origin gets CORS headers (the dev server and the desktop window call this port directly)", async () => {
  for (const origin of ["http://localhost:9000", "app://familytemplate"]) {
    const r = await client.get("/v1/notes", { headers: { origin } });
    expect(r.statusCode).toBe(200);
    expect(r.headers["access-control-allow-origin"]).toBe(origin); // its own origin, never every origin
  }
  const evil = await client.get("/v1/data/backup", { headers: { origin: "https://evil.example" } });
  expect(evil.headers["access-control-allow-origin"]).toBeUndefined();
});

test("an unrouted path answers 404 and still names its request id", async () => {
  const r = await client.get("/v1/nothing-here");
  expect(r.statusCode).toBe(404);
  expect(r.headers["x-request-id"]).toBeTruthy();
});

// a reverse proxy's public name (<APP>_ALLOWED_HOSTS): the browser's Origin there is the server's own, though the
// server sees another scheme and host behind the proxy — every save was refused as cross-site (2026-10-20)
test("behind a reverse proxy its public origin may write; any other origin may not", async () => {
  vi.stubEnv("FAMILY_TEMPLATE_ALLOWED_HOSTS", "testserver,paint.example.com");
  const c = testClient(await createApp(tmpDir()));
  const write = (origin) => c.post("/v1/notes", { json: {}, headers: { origin } });
  expect((await write("https://paint.example.com")).statusCode).not.toBe(403);
  expect((await write("https://evil.example")).statusCode).toBe(403);
});
