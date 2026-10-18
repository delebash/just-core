// SPDX-License-Identifier: MIT
// createTables' additive columns: an existing database gains a column added after it was made,
// once, even when the column's name is an SQL keyword (JustWrite's scenes."when").
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, test } from "vitest";
import { openDatabase } from "../src/platform/sql.js";

const SCENES_OLD = { name: "scenes", ddl: "CREATE TABLE scenes (\n\tid VARCHAR NOT NULL, \n\tPRIMARY KEY (id)\n)" };
const ADDED = [
  ["scenes", "pov", "VARCHAR"],
  ["scenes", "when", "VARCHAR NOT NULL DEFAULT ''"],
];

test("added_columns_reach_an_existing_table_once_even_a_keyword", () => {
  const h = openDatabase(join(mkdtempSync(join(tmpdir(), "kit-sql-")), "app.db"), { foreignKeys: false });
  h.createTables([SCENES_OLD]);
  h.exec("INSERT INTO scenes (id) VALUES ('s1')");
  h.createTables([SCENES_OLD], ADDED);
  h.createTables([SCENES_OLD], ADDED); // a second boot finds them and adds nothing
  expect(h.columnNames("scenes")).toEqual(["id", "pov", "when"]);
  expect(h.all('SELECT id, pov, "when" FROM scenes')).toEqual([{ id: "s1", pov: null, when: "" }]);
});
