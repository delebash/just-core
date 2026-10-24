// SPDX-License-Identifier: MIT
// Several windows on one server — the kit's ChangeCounter as this app wires it (app.js, data_admin.js): each
// window's writes to the notes and the settings counted apart, so GET /v1/sync/rev answers each window the OTHERS'
// changes (the kit's watchOtherWindows then reads the page again); the data's epoch is new after a reset and a
// restore, so every window reloads; how often a window asks is the app's setting.
import { beforeEach, expect, test } from "vitest";
import { createApp } from "../src/app.js";
import { getDb } from "../src/app_state.js";
import { seedWorkspace } from "../src/database/seed.js";
import { testClient, tmpDir, useHermeticKit } from "./helpers.js";

useHermeticKit();

let client;
beforeEach(async () => {
  client = testClient(await createApp(tmpDir()));
  seedWorkspace(getDb());
});

const A = { "x-client-id": "window-a" };
const B = { "x-client-id": "window-b" };
const ask = async (who) => (await client.get("/v1/sync/rev", { headers: who })).json();
// the count in the opaque rev ("<series>:<count>")
const count = async (who) => Number((await ask(who)).rev.split(":")[1]);

test("a window's own writes never move its counter; another window's do; a read, a refused write and a pref don't", async () => {
  const [a0, b0] = [await count(A), await count(B)];
  expect((await client.post("/v1/notes", { json: { title: "Mine" }, headers: A })).statusCode).toBe(201);
  expect(await count(A)).toBe(a0);
  expect(await count(B)).toBe(b0 + 1);
  await client.post("/v1/notes", { json: { title: "" }, headers: A }); // refused (422): no change
  await client.get("/v1/notes", { headers: A });
  await client.patch("/v1/prefs", { json: { aiOfferShown: true }, headers: A }); // a window's own pref
  expect(await count(B)).toBe(b0 + 1);
  await client.patch("/v1/settings", { json: { "windows.checkSeconds": 7 }, headers: B });
  expect(await count(A)).toBe(a0 + 1);
  expect(await ask(A)).toMatchObject({ pollSeconds: 7 });
});

test("a reset and a restore renew the data's epoch — every window reloads", async () => {
  const first = (await ask(A)).epoch;
  expect(typeof first).toBe("string");
  expect((await client.post("/v1/data/reset")).statusCode).toBe(200);
  const afterReset = (await ask(A)).epoch;
  expect(afterReset).not.toBe(first);
  expect(await ask(B)).toMatchObject({ pollSeconds: 3 }); // the seeded default

  const backup = await client.get("/v1/data/backup");
  const form = new FormData();
  form.append("file", new Blob([backup.rawPayload], { type: "application/zip" }), "backup.zip");
  const n = await count(B);
  expect((await client.app.request("http://testserver/v1/data/restore", { method: "POST", body: form, headers: { host: "testserver" } })).status).toBe(200);
  const afterRestore = await ask(B);
  expect(afterRestore.epoch).not.toBe(afterReset); // not the backup's own row either
  expect(Number(afterRestore.rev.split(":")[1])).toBe(n + 1);
});
