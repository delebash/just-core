// SPDX-License-Identifier: MIT
// POST /v1/shutdown — the kit's route, mounted so the desktop shell can ask a server of this app it
// finds on its port to stop before it would kill it (electron-main.js `shutdownPath`; JustWrite's
// tests/shutdown.test.js is the donor).
import { expect, test } from "vitest";
import { createApp } from "../src/app.js";
import { testClient, tmpDir, useHermeticKit } from "./helpers.js";

useHermeticKit();

test("shutdown is refused from another machine", async () => {
  const c = testClient(await createApp(tmpDir()));
  expect((await c.post("/v1/shutdown")).statusCode).toBe(403);
});

test("shutdown from this machine needs no token, even when tokens are required there", async () => {
  const c = testClient(await createApp(tmpDir()));
  await c.put("/v1/server-auth", { json: { tokens: ["s3cret"], requireForLoopback: true }, from: "127.0.0.1" });
  expect((await c.get("/v1/notes", { from: "127.0.0.1" })).statusCode).toBe(401);
  const r = await c.post("/v1/shutdown", { from: "127.0.0.1" });
  expect(r.statusCode).toBe(200);
  expect(r.json()).toEqual({ ok: true, exiting: false }); // no running server in a test
});
