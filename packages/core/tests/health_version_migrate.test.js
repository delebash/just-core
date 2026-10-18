// SPDX-License-Identifier: MIT
// The kit's shared /v1/health router and the user_version migrations (app-structure §14, §16).
import { mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, expect, test } from "vitest";
import { makeHealthRouter } from "../src/platform/health_api.js";
import { migrate, schemaVersion } from "../src/platform/migrate.js";
import { openDatabase } from "../src/platform/sql.js";

const tmp = [];
const dbs = [];
afterEach(() => {
  for (const db of dbs.splice(0)) db.raw.close(); // Windows can't delete an open file
  for (const d of tmp.splice(0)) rmSync(d, { recursive: true, force: true });
});
const open = (file) => {
  const db = openDatabase(file, { foreignKeys: true });
  dbs.push(db);
  return db;
};
const scratch = () => {
  const d = mkdtempSync(path.join(os.tmpdir(), "kit-hvm-"));
  tmp.push(d);
  return d;
};

test("health answers the family's base wire", async () => {
  const r = await makeHealthRouter({ product: "Demo", version: "1.2.3" }).request("/v1/health");
  expect(r.status).toBe(200);
  expect(await r.json()).toEqual({ status: "ok", product: "Demo", version: "1.2.3", apiVersion: "v1" });
});

test("health merges the app's extras after the base fields", async () => {
  const extras = async () => ({ dbReady: true, engines: [] });
  const r = await makeHealthRouter({ product: "Demo", version: "1", extras }).request("/v1/health");
  expect(await r.json()).toEqual({ status: "ok", product: "Demo", version: "1", apiVersion: "v1", dbReady: true, engines: [] });
});

const MIGRATIONS = [
  { version: 1, name: "notes", up: "CREATE TABLE notes (id TEXT PRIMARY KEY, title TEXT NOT NULL)" },
  { version: 2, name: "note body", up: "ALTER TABLE notes ADD COLUMN body TEXT NOT NULL DEFAULT ''" },
];

test("migrate runs each newer migration once and records the version", () => {
  const db = open(path.join(scratch(), "app.db"));
  expect(schemaVersion(db)).toBe(0);
  expect(migrate(db, MIGRATIONS)).toEqual({ from: 0, to: 2, applied: [1, 2] });
  db.run("INSERT INTO notes (id, title, body) VALUES (?, ?, ?)", ["a", "Hi", "there"]);
  expect(migrate(db, MIGRATIONS)).toEqual({ from: 2, to: 2, applied: [] });
  const more = [...MIGRATIONS, { version: 3, up: (h) => h.run("UPDATE notes SET body = upper(body)") }];
  expect(migrate(db, more).applied).toEqual([3]);
  expect(db.value("SELECT body FROM notes WHERE id = ?", ["a"])).toBe("THERE");
});

test("a failing migration leaves the database as it was", () => {
  const db = open(path.join(scratch(), "app.db"));
  migrate(db, MIGRATIONS.slice(0, 1));
  const bad = [...MIGRATIONS.slice(0, 1), { version: 2, up: "ALTER TABLE notes ADD COLUMN x TEXT; THIS IS NOT SQL" }];
  expect(() => migrate(db, bad)).toThrow();
  expect(schemaVersion(db)).toBe(1);
  expect(db.columnNames("notes")).toEqual(["id", "title"]);
});

test("migrate refuses a database newer than the code, and a malformed list", () => {
  const db = open(path.join(scratch(), "app.db"));
  migrate(db, MIGRATIONS);
  expect(() => migrate(db, MIGRATIONS.slice(0, 1))).toThrow(/newer than this app knows/);
  expect(() => migrate(db, [MIGRATIONS[0], { ...MIGRATIONS[0] }])).toThrow(/twice/);
  expect(() => migrate(db, [{ version: 0, up: "" }])).toThrow(/integer >= 1/);
});
