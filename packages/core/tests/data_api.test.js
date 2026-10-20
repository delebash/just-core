// SPDX-License-Identifier: MIT
// Port of tests/test_data_api.py — makeDataRouter: backup → mutate → restore round-trips
// data + assets; reset wipes to the host's seed. Schema-agnostic over a tiny SQLite app.
// Python's SQLAlchemy `MetaData` + `Table("notes", …)` is a one-table TABLES list here;
// the zip is read back with the module's own reader (its Python interop was checked by
// hand, 2026-10-07: Python's zipfile reads these backups and these read Python's).
import { closeSync, existsSync, mkdirSync, mkdtempSync, openSync, readdirSync, readFileSync, statfsSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, test } from "vitest";
import { checkUnpackedFits, makeDataRouter, sortedTables } from "../src/platform/data_api.js";
import { ApiError } from "../src/platform/errors.js";
import { createServer } from "../src/platform/server.js";
import { openDatabase } from "../src/platform/sql.js";
import { ZipReader, ZipWriter } from "../src/platform/zip.js";

const NOTES = {
  name: "notes",
  ddl: "CREATE TABLE notes (\n\tid INTEGER NOT NULL, \n\tbody VARCHAR, \n\tPRIMARY KEY (id)\n)",
};

function makeApp() {
  const tmp = mkdtempSync(join(tmpdir(), "kit-data-"));
  const db = join(tmp, "app.db");
  const engine = openDatabase(db, { foreignKeys: false });
  engine.exec(NOTES.ddl);
  const runReset = () =>
    engine.tx(() => {
      engine.run("DELETE FROM notes");
      engine.run("INSERT INTO notes (id, body) VALUES (1, 'seed')");
    });
  const assets = join(tmp, "images");
  mkdirSync(assets);
  const app = createServer({ typeBase: "https://example.test/errors/" });
  app.route("/", makeDataRouter({ getDbPath: () => db, metadata: [NOTES], runReset, assetDirs: () => ({ images: assets }) }));
  return { app, engine, assets, tmp };
}

const rows = (engine) => Object.fromEntries(engine.all("SELECT id, body FROM notes").map((r) => [r.id, r.body]));

async function zipNames(buf, tmp) {
  const f = join(tmp, `read-${Math.random()}.zip`);
  writeFileSync(f, buf);
  return (await ZipReader.open(f)).names();
}

function upload(app, blob, field = "file") {
  const form = new FormData();
  form.append(field, new Blob([blob], { type: "application/zip" }), "backup.zip");
  return app.request("/v1/data/restore", { method: "POST", body: form });
}

/** The answer's body as bytes. */
const bytes = async (r) => Buffer.from(await r.arrayBuffer());

test("backup_restore_reset_roundtrip", async () => {
  const { app, engine, assets, tmp } = makeApp();
  engine.run("INSERT INTO notes (id, body) VALUES (1, 'original')");
  engine.run("INSERT INTO notes (id, body) VALUES (2, 'second')");
  writeFileSync(join(assets, "a.txt"), "hello");

  // Backup: a zip with the DB + the asset dir.
  const r = await app.request("/v1/data/backup", { method: "GET" });
  expect(r.status).toBe(200);
  const length = Number(r.headers.get("content-length")); // streamed from a file, its size known — never held whole
  const blob = await bytes(r);
  expect(blob.length).toBe(length);
  const names = await zipNames(blob, tmp);
  expect(names).toContain("db.sqlite");
  expect(names).toContain("images/a.txt");

  // Mutate after the backup.
  engine.run("DELETE FROM notes");
  engine.run("INSERT INTO notes (id, body) VALUES (99, 'changed')");
  writeFileSync(join(assets, "a.txt"), "CHANGED");

  // Restore brings rows AND assets back.
  const rr = await upload(app, blob);
  expect(rr.status).toBe(200);
  expect(rows(engine)).toEqual({ 1: "original", 2: "second" });
  expect(readFileSync(join(assets, "a.txt"), "utf8")).toBe("hello");

  // Reset wipes to the host seed.
  expect((await app.request("/v1/data/reset", { method: "POST" })).status).toBe(200);
  expect(rows(engine)).toEqual({ 1: "seed" });
});

test("restore_swaps_the_asset_folder_whole_and_takes_an_earlier_restores_leftovers", async () => {
  const { app, assets, tmp } = makeApp();
  writeFileSync(join(assets, "a.txt"), "backed up");
  const blob = await bytes(await app.request("/v1/data/backup", { method: "GET" }));
  // after the backup: a file the backup doesn't have, and an earlier restore's held leftover beside it
  writeFileSync(join(assets, "later.txt"), "not in the backup");
  mkdirSync(join(tmp, "images.replaced-1700000000000"));
  expect((await upload(app, blob)).status).toBe(200);
  // the folder is the backup's, whole — not the old one with the backup copied over it
  expect(readdirSync(assets)).toEqual(["a.txt"]);
  expect(readFileSync(join(assets, "a.txt"), "utf8")).toBe("backed up");
  // nothing staged or replaced is left beside it
  expect(readdirSync(tmp).filter((n) => n.startsWith("images."))).toEqual([]);
  expect(existsSync(assets)).toBe(true);
});

test("restore_into_a_folder_windows_holds_lands_every_file_and_drops_the_rest", async () => {
  // a file in the folder held open (a scanner, a viewer): on Windows the folder can't be renamed, so the
  // backup is copied over it — every backed-up file lands, what the backup hasn't is removed
  const { app, assets } = makeApp();
  writeFileSync(join(assets, "a.txt"), "backed up");
  const blob = await bytes(await app.request("/v1/data/backup", { method: "GET" }));
  writeFileSync(join(assets, "a.txt"), "changed later");
  writeFileSync(join(assets, "stale.png"), "not in the backup");
  const held = openSync(join(assets, "a.txt"), "r");
  try {
    expect((await upload(app, blob)).status).toBe(200);
  } finally {
    closeSync(held);
  }
  expect(readFileSync(join(assets, "a.txt"), "utf8")).toBe("backed up");
  expect(readdirSync(assets)).toEqual(["a.txt"]);
}, 30000);

// 2026-10-19, the security review (just-house-paint): a backup's engine rows name the executables the next
// engine install runs; a backup carries what the app scrubs out of it; a zip can lie about its sizes.
test("restore_keeps_this_computers_engine_tables_and_a_backup_leaves_out_what_the_app_scrubs", async () => {
  const tmp = mkdtempSync(join(tmpdir(), "kit-data-"));
  const RB = { name: "runner_binary", ddl: "CREATE TABLE runner_binary (platform VARCHAR NOT NULL, asset_url VARCHAR, PRIMARY KEY (platform))" };
  const make = (file, url, note) => {
    const h = openDatabase(file, { foreignKeys: false });
    h.exec(NOTES.ddl);
    h.exec(RB.ddl);
    h.run("INSERT INTO runner_binary VALUES ('windows', ?)", [url]);
    h.run("INSERT INTO notes (id, body) VALUES (1, ?)", [note]);
    return h;
  };
  const db = join(tmp, "app.db");
  const engine = make(db, "https://github.com/ggml-org/llama.cpp/releases/x.zip", "a token");
  const app = createServer({ typeBase: "https://example.test/errors/" });
  const scrubBackup = (h) => h.run("UPDATE notes SET body = 'scrubbed'");
  app.route("/", makeDataRouter({ getDbPath: () => db, metadata: [NOTES, RB], runReset: () => {}, scrubBackup }));
  // the backup's own database copy is scrubbed; the live one isn't
  const backup = join(tmp, "backup.zip");
  writeFileSync(backup, await bytes(await app.request("/v1/data/backup", { method: "GET" })));
  const out = join(tmp, "out");
  await (await ZipReader.open(backup)).extractAll(out);
  const copy = openDatabase(join(out, "db.sqlite"), { foreignKeys: false });
  expect(copy.all("SELECT body FROM notes")).toEqual([{ body: "scrubbed" }]);
  copy.close();
  expect(rows(engine)).toEqual({ 1: "a token" });
  // a malicious backup naming another executable: its notes come back, this computer's engine rows stay
  const evil = make(join(tmp, "evil.db"), "https://evil.example/llama.zip", "from the backup");
  evil.close();
  const zip = new ZipWriter();
  await zip.addFile(join(tmp, "evil.db"), "db.sqlite");
  expect((await upload(app, Buffer.concat(zip.finish()))).status).toBe(200);
  expect(rows(engine)).toEqual({ 1: "from the backup" });
  expect(engine.all("SELECT asset_url FROM runner_binary")).toEqual([{ asset_url: "https://github.com/ggml-org/llama.cpp/releases/x.zip" }]);
});

test("restore_refuses_an_entry_that_unpacks_past_its_stated_size_and_a_backup_too_big_for_the_drive", async () => {
  const { app, engine, tmp } = makeApp();
  engine.run("INSERT INTO notes (id, body) VALUES (1, 'kept')");
  const zip = new ZipWriter();
  await zip.addFile(join(tmp, "app.db"), "db.sqlite");
  writeFileSync(join(tmp, "big.txt"), "a".repeat(200_000));
  await zip.addFile(join(tmp, "big.txt"), "images/big.txt");
  const buf = Buffer.concat(zip.finish());
  // the central directory says images/big.txt is 10 bytes (a zip bomb lies the same way)
  const name = Buffer.from("images/big.txt");
  for (let at = buf.indexOf(Buffer.from([0x50, 0x4b, 0x01, 0x02])); at >= 0; at = buf.indexOf(Buffer.from([0x50, 0x4b, 0x01, 0x02]), at + 4)) {
    if (buf.subarray(at + 46, at + 46 + name.length).equals(name)) buf.writeUInt32LE(10, at + 24);
  }
  const r = await upload(app, buf);
  expect(r.status).toBe(400);
  expect((await r.json()).detail).toMatch(/unpacks past its stated size/);
  expect(rows(engine)).toEqual({ 1: "kept" }); // nothing restored
  // stated sizes past the drive's free space: refused before anything is unpacked
  const drive = statfsSync(tmp);
  const huge = { names: () => ["db.sqlite"], info: () => ({ size: drive.bavail * drive.bsize * 2 }) };
  expect(() => checkUnpackedFits(huge, tmp)).toThrow(/the drive has/);
});

test("restore_rejects_bad_zip", async () => {
  const { app } = makeApp();
  const r = await upload(app, Buffer.from("not a zip"));
  expect(r.status).toBe(400);
});

test("backup_exclude_skips_named_asset_dirs_and_restore_leaves_live_copy", async () => {
  // ?exclude=<arcnames> (the DataManagement per-app options seam — decision ①, family
  // parity batch 2026-08-05: JV's include-audio toggle rides it). The named asset dirs
  // stay out of the zip; the DB always ships; restoring such a backup leaves the live copy
  // of the excluded content untouched.
  const { app, engine, assets, tmp } = makeApp();
  engine.run("INSERT INTO notes (id, body) VALUES (1, 'original')");
  writeFileSync(join(assets, "a.txt"), "keep me");

  const r = await app.request("/v1/data/backup?exclude=images,unknown-name", { method: "GET" });
  expect(r.status).toBe(200);
  const blob = await bytes(r);
  const names = await zipNames(blob, tmp);
  expect(names).toContain("db.sqlite");
  expect(names.some((n) => n.startsWith("images/"))).toBe(false);

  // Mutate, then restore the audio-less backup: rows come back, the excluded dir's live
  // content stays exactly as it is (never deleted for being absent).
  engine.run("DELETE FROM notes");
  writeFileSync(join(assets, "a.txt"), "still here after restore");
  const rr = await upload(app, blob);
  expect(rr.status).toBe(200);
  expect(rows(engine)).toEqual({ 1: "original" });
  expect(readFileSync(join(assets, "a.txt"), "utf8")).toBe("still here after restore");
});

test("restore_hooks_run_around_the_copy_and_a_hook_refusal_is_the_answer", async () => {
  // A synced app's restore steps (the sync package's appSync.restoreHooks): beforeCopy and
  // afterCopy inside the copy's transaction, on its connection with the backup attached as `src`;
  // afterTables once it committed. A hook's own error with a status is the answer, and nothing
  // was copied.
  const tmp = mkdtempSync(join(tmpdir(), "kit-data-hooks-"));
  const db = join(tmp, "app.db");
  const engine = openDatabase(db, { foreignKeys: false });
  engine.exec(NOTES.ddl);
  engine.run("INSERT INTO notes (id, body) VALUES (1, 'original')");
  const calls = [];
  let refuse = false;
  const app = createServer({ typeBase: "https://example.test/errors/" });
  app.route(
    "/",
    makeDataRouter({
      getDbPath: () => db,
      metadata: [NOTES],
      runReset: () => {},
      beforeCopy: (h) => {
        calls.push(["beforeCopy", h.all("SELECT body FROM src.notes")[0].body, h.all("SELECT body FROM main.notes")[0].body]);
        if (refuse) throw new ApiError(409, "restore-other-library", "Sync refused", "another library", { error: "restore-other-library" });
      },
      afterCopy: (h) => calls.push(["afterCopy", h.all("SELECT body FROM main.notes")[0].body]),
      afterTables: () => calls.push(["afterTables", rows(engine)[1]]),
    }),
  );
  const blob = await bytes(await app.request("/v1/data/backup", { method: "GET" }));
  engine.run("UPDATE notes SET body = 'changed' WHERE id = 1");

  expect((await upload(app, blob)).status).toBe(200);
  expect(calls).toEqual([
    ["beforeCopy", "original", "changed"],
    ["afterCopy", "original"],
    ["afterTables", "original"],
  ]);

  engine.run("UPDATE notes SET body = 'changed again' WHERE id = 1");
  refuse = true;
  calls.length = 0;
  const r = await upload(app, blob);
  expect(r.status).toBe(409);
  expect(await r.json()).toMatchObject({ status: 409, detail: "another library", error: "restore-other-library" });
  expect(calls.map((c) => c[0])).toEqual(["beforeCopy"]);
  expect(rows(engine)).toEqual({ 1: "changed again" });
});

// Not in the Python file: the refusals as the Python router answered them (measured
// 2026-10-07), and sorted_tables' order.
test("the_answers_match_the_python_router", async () => {
  const { app, tmp } = makeApp();
  const errorsOf = async (r) => {
    expect(r.status).toBe(422);
    return (await r.json()).errors;
  };
  const missing = [{ loc: ["body", "file"], msg: "Field required", type: "missing" }];
  expect(await errorsOf(await upload(app, Buffer.from("x"), "other"))).toEqual(missing);
  const json = { "content-type": "application/json" };
  expect(await errorsOf(await app.request("/v1/data/restore", { method: "POST", headers: json, body: JSON.stringify({ a: 1 }) }))).toEqual(missing);
  expect(await errorsOf(await app.request("/v1/data/restore", { method: "POST" }))).toEqual(missing);
  const form = new FormData();
  form.append("file", "abc");
  expect(await errorsOf(await app.request("/v1/data/restore", { method: "POST", body: form }))).toEqual([
    { loc: ["body", "file"], msg: "Value error, Expected UploadFile, received: <class 'str'>", type: "value_error" },
  ]);
  let r = await upload(app, Buffer.from("nope"));
  expect(await r.json()).toMatchObject({ status: 400, detail: "not a valid backup zip", instance: "/v1/data/restore" });

  // a zip without the database
  const other = join(tmp, "other.txt");
  writeFileSync(other, "x");
  const z = new ZipWriter();
  await z.addFile(other, "other.txt");
  r = await upload(app, Buffer.concat(z.finish()));
  expect(r.status).toBe(400);
  expect((await r.json()).detail).toBe("backup is missing db.sqlite");

  r = await app.request("/v1/data/backup", { method: "GET" });
  expect(r.headers.get("content-type")).toBe("application/zip");
  expect(r.headers.get("content-disposition")).toBe('attachment; filename="backup.zip"');

  const gone = createServer({ typeBase: "https://example.test/errors/" });
  gone.route("/", makeDataRouter({ getDbPath: () => join(tmp, "nope.db"), metadata: [], runReset: () => {} }));
  r = await gone.request("/v1/data/backup", { method: "GET" });
  expect(r.status).toBe(404);
  expect((await r.json()).detail).toBe("no database to back up");

  // by name, then parents before children
  expect(
    sortedTables([
      { name: "b_child", ddl: "CREATE TABLE b_child (a_id INTEGER, FOREIGN KEY(a_id) REFERENCES z_parent (id))" },
      { name: "a", ddl: "CREATE TABLE a (id INTEGER)" },
      { name: "z_parent", ddl: "CREATE TABLE z_parent (id INTEGER, p INTEGER REFERENCES z_parent (id))" },
    ]),
  ).toEqual(["a", "z_parent", "b_child"]);
});
