// SPDX-License-Identifier: MIT
// Settings → Backups' server half (data_admin.js over the kit's makeDataRouter): a backup is a ZIP
// of the database, a restore puts its rows back, a reset returns the first-run state — keeping the
// access tokens, so a reset never opens an exposed server.
import { beforeEach, expect, test } from "vitest";
import { createApp } from "../src/app.js";
import { getDb } from "../src/app_state.js";
import { seedWorkspace } from "../src/database/seed.js";
import { getSetting } from "../src/database/settings.js";
import { testClient, tmpDir, useHermeticKit } from "./helpers.js";

useHermeticKit();

let client;
beforeEach(async () => {
  client = testClient(await createApp(tmpDir()));
  seedWorkspace(getDb());
});

const titles = async () => (await client.get("/v1/notes")).json().items.map((n) => n.title);

test("backup, change, restore: the backup's rows come back", async () => {
  await client.post("/v1/notes", { json: { title: "Before the backup" } });
  const backup = await client.get("/v1/data/backup");
  expect(backup.statusCode).toBe(200);
  expect(backup.headers["content-type"]).toBe("application/zip");
  expect(backup.rawPayload.subarray(0, 2).toString()).toBe("PK");

  await client.post("/v1/notes", { json: { title: "After the backup" } });
  expect(await titles()).toEqual(["After the backup", "Before the backup"]);

  const form = new FormData();
  form.append("file", new Blob([backup.rawPayload], { type: "application/zip" }), "backup.zip");
  const restored = await client.app.request("http://testserver/v1/data/restore", { method: "POST", body: form, headers: { host: "testserver" } });
  expect(restored.status).toBe(200);
  expect(await titles()).toEqual(["Before the backup"]);
});

test("reset returns the first-run state but keeps the access tokens", async () => {
  await client.post("/v1/notes", { json: { title: "Gone after reset" } });
  await client.patch("/v1/settings", { json: { "notes.pageSize": 60 } });
  await client.patch("/v1/prefs", { json: { aiOfferShown: true } });
  await client.put("/v1/server-auth", { json: { tokens: ["still-here"] } });
  const auth = { headers: { authorization: "Bearer still-here" } };

  expect((await client.post("/v1/data/reset", auth)).statusCode).toBe(200);
  expect((await client.get("/v1/notes", auth)).json().items).toEqual([]);
  expect((await client.get("/v1/settings", auth)).json()["notes.pageSize"]).toBe(25); // reseeded
  expect((await client.get("/v1/prefs", auth)).json()).toEqual({});
  expect(getSetting(getDb(), "auth").tokens).toEqual(["still-here"]);
  // the AI stack was reseeded too
  expect((await client.get("/v1/llm-providers", auth)).json().providers.length).toBeGreaterThan(0);
});

test("a restore of something that isn't a backup is refused", async () => {
  const form = new FormData();
  form.append("file", new Blob(["not a zip"]), "backup.zip");
  const r = await client.app.request("http://testserver/v1/data/restore", { method: "POST", body: form, headers: { host: "testserver" } });
  expect(r.status).toBe(400);
});
