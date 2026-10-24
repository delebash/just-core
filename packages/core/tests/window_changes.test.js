// SPDX-License-Identifier: MIT
// Other windows' changes, the server half (platform/window_changes.js — moved from just-house-paint's changes.js,
// docs/plans/2026-10-24-engines-the-llama-way.md F1): each window's writes counted apart, GET /v1/sync/rev answering
// each the others' count, the data's epoch kept in the app's settings and renewed by a restore or a reset, a window id
// taken only when it is up to 64 visible ASCII characters and at most 500 windows remembered.
import { expect, test } from "vitest";
import { createServer } from "../src/platform/server.js";
import { ChangeCounter, clientIdOf, makeSyncRevRouter } from "../src/platform/window_changes.js";

/** The app's settings store, as the template's database/settings.js answers (`h` is the database). */
const settingsStore = () => {
  const rows = new Map();
  return { rows, getSetting: (h, key) => rows.get(key), setSetting: (h, key, value) => rows.set(key, value) };
};

test("a window id is up to 64 visible ASCII characters — anything else counts as no window's", () => {
  expect(clientIdOf("6f1c0f8e-0b5e-4a8e-9a3e-1d2c3b4a5f6e")).toBe("6f1c0f8e-0b5e-4a8e-9a3e-1d2c3b4a5f6e");
  for (const bad of ["", "x".repeat(65), "a b", "café", "tab\there", null, 42]) expect(clientIdOf(bad), String(bad)).toBe(null);
  const c = new ChangeCounter();
  c.note("x".repeat(10_000));
  expect(c.windows).toBe(0);
  expect(c.revFor("x".repeat(10_000))).toBe(1); // everyone's change — no window of its own remembered
});

test("at most 500 windows are remembered: the one heard from longest ago goes first", () => {
  const c = new ChangeCounter();
  c.note("first");
  for (let i = 0; i < 600; i++) c.note(`w${i}`);
  expect(c.windows).toBe(500);
  // "first" was forgotten: its own change counts as another's now; the newest window still knows its own
  expect(c.revFor("w599")).toBe(600);
  // asking again keeps a window: heard from now, it is the newest
  c.revFor("w100");
  for (let i = 600; i < 900; i++) c.note(`w${i}`);
  expect(c.revFor("w100")).toBe(c.revFor("nobody") - 1);
});

test("a window's own data writes never move its counter; another's do; a refused write, a read and a path that isn't data don't", async () => {
  const store = settingsStore();
  const changes = new ChangeCounter({ writes: /^\/v1\/notes(\/|$)/, ...store, db: {} });
  const app = createServer({ typeBase: "t/" });
  app.use("*", changes.middleware());
  app.post("/v1/notes", (c) => c.json({}, 201));
  app.post("/v1/notes/bad", (c) => c.json({}, 422));
  app.post("/v1/schemes/harmony", (c) => c.json({}));
  app.route("/", makeSyncRevRouter(changes, { pollSeconds: () => 3 }));
  const as = (who, method, url) => app.request(url, { method, headers: { "x-client-id": who } });
  const rev = async (who) => (await (await as(who, "GET", "/v1/sync/rev")).json()).rev;

  const [a0, b0] = [await rev("a"), await rev("b")];
  expect(a0).toBe(`${changes.boot}:0`);
  await as("a", "POST", "/v1/notes");
  expect(await rev("a")).toBe(a0);
  expect(await rev("b")).toBe(`${changes.boot}:1`);
  await as("a", "POST", "/v1/notes/bad");
  await as("a", "POST", "/v1/schemes/harmony");
  await as("a", "GET", "/v1/notes");
  expect(await rev("b")).toBe(`${changes.boot}:1`);
  const answer = await (await as("b", "GET", "/v1/sync/rev")).json();
  expect(answer).toEqual({ rev: `${changes.boot}:1`, epoch: store.rows.get("dataEpoch"), pollSeconds: 3 });
});

test("the data's epoch: made once in the settings, the same for a server started again, new after renewEpoch", () => {
  const store = settingsStore();
  const db = {};
  const first = new ChangeCounter({ ...store, db });
  const epoch = first.epoch;
  expect(typeof epoch).toBe("string");
  expect(store.rows.get("dataEpoch")).toBe(epoch);
  const again = new ChangeCounter({ ...store });
  again.useDatabase(db);
  expect(again.epoch).toBe(epoch); // a restart keeps the series
  expect(again.boot).not.toBe(first.boot); // but is a change to the windows (the rev carries the boot)
  again.renewEpoch(db); // a restore or a reset
  expect(again.epoch).not.toBe(epoch);
  // no settings store (a test's server): the epoch is the process's boot id
  const bare = new ChangeCounter();
  expect(bare.epoch).toBe(bare.boot);
});
