// SPDX-License-Identifier: MIT
// The database layer (app-structure §16): the migrations bring a new file to the newest schema
// and are a no-op the second time; a file newer than the code is refused; the seed is
// insert-if-missing; the stores keep times in ISO UTC and ids random.
import { rmSync } from "node:fs";
import path from "node:path";
import { schemaVersion } from "@delebash/core/platform";
import { afterEach, expect, test } from "vitest";
import { DB_FILE, openAppDatabase } from "../src/database/index.js";
import * as notes from "../src/database/notes.js";
import { MIGRATIONS } from "../src/database/schema.js";
import { SETTING_DEFAULTS, seedSettings } from "../src/database/seed.js";
import { getSetting, setSetting } from "../src/database/settings.js";
import { tmpDir } from "./helpers.js";

const open = [];
const dirs = [];
afterEach(() => {
  for (const db of open.splice(0)) db.close(); // Windows can't delete an open file
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});
const fresh = () => {
  const dir = tmpDir();
  dirs.push(dir);
  const db = openAppDatabase(dir);
  open.push(db);
  return { db, dir };
};

test("a new database is migrated to the newest schema, once", () => {
  const { db, dir } = fresh();
  const newest = MIGRATIONS[MIGRATIONS.length - 1].version;
  expect(schemaVersion(db)).toBe(newest);
  expect(db.tableNames()).toEqual(expect.arrayContaining(["notes", "settings"]));
  db.close();
  open.pop();
  const again = openAppDatabase(dir); // reopening runs nothing
  open.push(again);
  expect(schemaVersion(again)).toBe(newest);
  expect(path.basename(again.raw.name)).toBe(DB_FILE);
});

test("a database newer than the code is refused", () => {
  const { db, dir } = fresh();
  db.raw.pragma(`user_version = ${MIGRATIONS.length + 1}`);
  db.close();
  open.pop();
  expect(() => openAppDatabase(dir)).toThrow(/newer than this app knows/);
});

test("the seed adds what is missing and never overwrites the user's value", () => {
  const { db } = fresh();
  expect(seedSettings(db)).toBe(Object.keys(SETTING_DEFAULTS).length);
  setSetting(db, "notes.pageSize", 40);
  expect(seedSettings(db)).toBe(0);
  expect(getSetting(db, "notes.pageSize")).toBe(40);
});

test("the notes store keeps random ids and ISO UTC times", () => {
  const { db } = fresh();
  const a = notes.createNote(db, { title: "One" });
  const b = notes.createNote(db, { title: "Two", pinned: true });
  expect(a.id).not.toBe(b.id);
  expect(new Date(a.createdAt).toISOString()).toBe(a.createdAt);
  expect(notes.listNotes(db).map((n) => n.title)).toEqual(["Two", "One"]);
  expect(notes.updateNote(db, "missing", { title: "x" })).toBeNull();
  expect(notes.updateNote(db, a.id, {})).toEqual(a); // nothing to change → unchanged
  expect(notes.deleteNote(db, a.id)).toBe(true);
  expect(notes.getNote(db, a.id)).toBeNull();
});
