// SPDX-License-Identifier: MIT
// /v1/prefs — the renderer's preferences door (the kit's router over `pref.*` rows; docgen's
// tests/prefs.test.js is the donor): the document round-trips, PATCH is wholesale per key, DELETE
// drops the preferences but never the app's settings or the access tokens in the same table.
import { expect, test } from "vitest";
import { createApp } from "../src/app.js";
import { getDb } from "../src/app_state.js";
import { getSetting } from "../src/database/settings.js";
import { seedSettings } from "../src/database/seed.js";
import { testClient, tmpDir, useHermeticKit } from "./helpers.js";

useHermeticKit();

const c = async () => testClient(await createApp(tmpDir()));

test("the document round-trips", async () => {
  const client = await c();
  expect((await client.get("/v1/prefs")).json()).toEqual({});
  const merged = (
    await client.patch("/v1/prefs", { json: { appearance: { appearance: { mode: "dark" } }, keepServerRunning: true } })
  ).json();
  expect(merged).toEqual({ appearance: { appearance: { mode: "dark" } }, keepServerRunning: true });
  expect((await client.get("/v1/prefs")).json()).toEqual(merged);
});

test("PATCH is wholesale per key", async () => {
  const client = await c();
  await client.patch("/v1/prefs", { json: { appearance: { appearance: { mode: "dark", accentHue: 200 } } } });
  await client.patch("/v1/prefs", { json: { appearance: { appearance: { mode: "light" } } } });
  expect((await client.get("/v1/prefs")).json().appearance).toEqual({ appearance: { mode: "light" } });
});

test("a body that isn't an object is a 422", async () => {
  const client = await c();
  const r = await client.patch("/v1/prefs", { json: ["not", "a", "document"] });
  expect(r.statusCode).toBe(422);
});

test("DELETE clears the preferences but never the settings or the access tokens", async () => {
  const client = await c();
  seedSettings(getDb());
  await client.put("/v1/server-auth", { json: { tokens: ["keep-me"] } });
  await client.patch("/v1/prefs", { json: { aiOfferShown: true } });
  expect((await client.delete("/v1/prefs", { headers: { authorization: "Bearer keep-me" } })).statusCode).toBe(204);
  expect((await client.get("/v1/prefs", { headers: { authorization: "Bearer keep-me" } })).json()).toEqual({});
  expect(getSetting(getDb(), "notes.pageSize")).toBe(25);
  expect(getSetting(getDb(), "auth").tokens).toEqual(["keep-me"]);
});
