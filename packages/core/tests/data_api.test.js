// SPDX-License-Identifier: MIT
// Port of tests/test_data_api.py — makeDataRouter: backup → mutate → restore round-trips
// data + assets; reset wipes to the host's seed. Schema-agnostic over a tiny SQLite app.
// Python's SQLAlchemy `MetaData` + `Table("notes", …)` is a one-table TABLES list here;
// the zip is read back with the module's own reader (its Python interop was checked by
// hand, 2026-10-07: Python's zipfile reads these backups and these read Python's).
import { closeSync, existsSync, mkdirSync, mkdtempSync, openSync, readdirSync, readFileSync, rmSync, statfsSync, utimesSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, test } from "vitest";
import { checkUnpackedFits, finishInterruptedRestore, makeDataRouter, sortedTables } from "../src/platform/data_api.js";
import { ApiError } from "../src/platform/errors.js";
import { MaintenanceGate } from "../src/platform/maintenance.js";
import { createServer } from "../src/platform/server.js";
import { openDatabase } from "../src/platform/sql.js";
import { ZipReader, ZipWriter } from "../src/platform/zip.js";

const NOTES = {
  name: "notes",
  ddl: "CREATE TABLE notes (\n\tid INTEGER NOT NULL, \n\tbody VARCHAR, \n\tPRIMARY KEY (id)\n)",
};

function makeApp(opts = {}) {
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
  if (opts.gate) app.use("*", opts.gate.middleware());
  if (opts.routes) opts.routes(app);
  app.route("/", makeDataRouter({ getDbPath: () => db, metadata: [NOTES], runReset, assetDirs: () => ({ images: assets }), ...(opts.gate ? { gate: opts.gate } : {}), ...opts.router }));
  return { app, engine, assets, tmp, db };
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

test("restore_into_a_folder_windows_holds_lands_every_file_and_drops_the_rest_for_an_app_without_the_gate", async () => {
  // an app that hasn't taken the gate keeps the restore before it: a file in the folder held open (a scanner, its
  // own audio being played): on Windows the folder can't be renamed, so the backup is copied over it — every
  // backed-up file lands, what the backup hasn't is removed
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

test("restore_refuses_a_folder_another_program_holds_with_nothing_changed_then_works_once_it_is_let_go", async () => {
  // with the gate (the all-or-nothing restore): a file in the folder held open past the retries (a viewer, a sync
  // tool) — on Windows the folder can't be renamed: the restore is refused and nothing changed, never the old folder
  // half overwritten under restored tables (2026-10-20, the eleventh review); elsewhere a held file never stops a
  // rename, and it just works
  const { app, engine, assets, tmp } = makeApp({ gate: new MaintenanceGate(), router: {} });
  engine.run("INSERT INTO notes (id, body) VALUES (1, 'backed up')");
  writeFileSync(join(assets, "a.txt"), "backed up");
  const blob = await bytes(await app.request("/v1/data/backup", { method: "GET" }));
  engine.run("UPDATE notes SET body = 'changed later' WHERE id = 1");
  writeFileSync(join(assets, "a.txt"), "changed later");
  writeFileSync(join(assets, "stale.png"), "not in the backup");
  const held = openSync(join(assets, "a.txt"), "r");
  let r;
  try {
    r = await upload(app, blob);
  } finally {
    closeSync(held);
  }
  if (process.platform === "win32") {
    expect(r.status).toBe(409);
    expect(await r.json()).toMatchObject({ title: "A file in the app's data is open in another program" });
    expect(rows(engine)).toEqual({ 1: "changed later" });
    expect(readFileSync(join(assets, "a.txt"), "utf8")).toBe("changed later");
    expect(readdirSync(assets).sort()).toEqual(["a.txt", "stale.png"]);
    expect(readdirSync(tmp).filter((n) => n.startsWith("images.") || n.endsWith(".restoring"))).toEqual([]);
    r = await upload(app, blob);
  }
  expect(r.status).toBe(200);
  expect(rows(engine)).toEqual({ 1: "backed up" });
  expect(readFileSync(join(assets, "a.txt"), "utf8")).toBe("backed up");
  expect(readdirSync(assets)).toEqual(["a.txt"]);
}, 60000);

test("a_restore_whose_tables_fail_puts_the_folders_back", async () => {
  let refuse = false;
  // the table copy itself failing (a hook's own refusal only in the copy, not in the dry run before it)
  let dry = true;
  const { app, engine, assets } = makeApp({
    gate: new MaintenanceGate(),
    router: {
      beforeCopy: () => {
        dry = !dry;
        if (refuse && dry) throw new ApiError(409, "restore-other-library", "Sync refused", "another library");
      },
    },
  });
  engine.run("INSERT INTO notes (id, body) VALUES (1, 'backed up')");
  writeFileSync(join(assets, "a.txt"), "backed up");
  const blob = await bytes(await app.request("/v1/data/backup", { method: "GET" }));
  refuse = true;
  dry = true;
  writeFileSync(join(assets, "a.txt"), "now");
  writeFileSync(join(assets, "b.txt"), "now too");
  expect((await upload(app, blob)).status).toBe(409);
  expect(readdirSync(assets).sort()).toEqual(["a.txt", "b.txt"]);
  expect(readFileSync(join(assets, "a.txt"), "utf8")).toBe("now");
});

// the seventeenth review's s5: the undo awaited a removal between putting folders back — for 2 s the folders were the
// backup's while the tables were the old ones (a request served then saw them disagree)
test("a_restore_s_undo_puts_every_folder_back_in_one_step_before_anything_is_removed", async () => {
  const tmp = mkdtempSync(join(tmpdir(), "kit-data-journal-"));
  const db = join(tmp, "app.db");
  const houses = join(tmp, "houses");
  const old = `${houses}.replaced-9`;
  const extra = join(tmp, "audio");
  mkdirSync(houses);
  writeFileSync(join(houses, "WHO"), "the backup's copy");
  mkdirSync(old);
  writeFileSync(join(old, "WHO"), "the live data");
  mkdirSync(extra);
  for (let i = 0; i < 200; i++) writeFileSync(join(extra, `f${i}`), "x");
  writeFileSync(`${db}.restoring`, JSON.stringify({ stamp: 9, dirs: [{ dir: houses, old }, { dir: extra, old: null }] }));
  const done = finishInterruptedRestore(db);
  // before the first turn of the event loop: every folder is back, the backup's extra folder out of the way
  expect(readFileSync(join(houses, "WHO"), "utf8")).toBe("the live data");
  expect(existsSync(extra)).toBe(false);
  expect(existsSync(`${db}.restoring`)).toBe(false);
  expect(await done).toBe("back");
  expect(existsSync(`${extra}.restoring-9`)).toBe(false);
});

test("a_restore_stopped_between_its_folders_and_its_tables_is_undone_at_the_next_start", async () => {
  // the record a restore leaves beside the database while its folders are swapped: the next start puts the old
  // folders back (the tables were never replaced) and moves the backup's copy out of the way
  const tmp = mkdtempSync(join(tmpdir(), "kit-data-journal-"));
  const db = join(tmp, "app.db");
  const dir = join(tmp, "images");
  const old = `${dir}.replaced-5`;
  mkdirSync(dir);
  writeFileSync(join(dir, "from-backup.txt"), "b");
  mkdirSync(old);
  writeFileSync(join(old, "mine.txt"), "m");
  writeFileSync(`${db}.restoring`, JSON.stringify({ stamp: 5, dirs: [{ dir, old }] }));
  expect(await finishInterruptedRestore(db)).toBe("back");
  expect(readdirSync(dir)).toEqual(["mine.txt"]);
  expect(existsSync(old)).toBe(false);
  expect(readdirSync(join(tmp, "images.restoring-5"))).toEqual(["from-backup.txt"]);
  expect(existsSync(`${db}.restoring`)).toBe(false);
  // nothing recorded: nothing done
  expect(await finishInterruptedRestore(db)).toBe(null);
  // stopped after recording, before moving anything: the folder stays
  writeFileSync(`${db}.restoring`, JSON.stringify({ stamp: 6, dirs: [{ dir, old: `${dir}.replaced-6` }] }));
  expect(await finishInterruptedRestore(db)).toBe("back");
  expect(readdirSync(dir)).toEqual(["mine.txt"]);
  // stopped after its tables committed (their commit record holds its stamp): finished — the old folder goes
  mkdirSync(`${dir}.replaced-7`);
  const h = openDatabase(db, { foreignKeys: false });
  h.exec("CREATE TABLE _kit_restore (stamp INTEGER NOT NULL)");
  h.run("INSERT INTO _kit_restore (stamp) VALUES (7)");
  h.close();
  writeFileSync(`${db}.restoring`, JSON.stringify({ stamp: 7, dirs: [{ dir, old: `${dir}.replaced-7` }] }));
  expect(await finishInterruptedRestore(db)).toBe("forward");
  expect(readdirSync(dir)).toEqual(["mine.txt"]);
  expect(existsSync(`${dir}.replaced-7`)).toBe(false);
  expect(existsSync(`${db}.restoring`)).toBe(false);
  // there was no folder before the restore (a first restore): the backup's copy goes, never left to be put back
  const fresh = join(tmp, "audio");
  mkdirSync(fresh);
  writeFileSync(join(fresh, "from-backup.wav"), "b");
  writeFileSync(`${db}.restoring`, JSON.stringify({ stamp: 8, dirs: [{ dir: fresh, old: null }] }));
  expect(await finishInterruptedRestore(db)).toBe("back");
  expect(existsSync(fresh)).toBe(false);
  expect(readdirSync(tmp).filter((n) => n.startsWith("audio"))).toEqual([]);
});

test("a_restore_whose_record_is_still_there_refuses_the_next_restore_and_a_reset_and_its_commit_is_recorded", async () => {
  const { app, engine, assets, db } = makeApp({ gate: new MaintenanceGate(), router: {} });
  engine.run("INSERT INTO notes (id, body) VALUES (1, 'x')");
  writeFileSync(join(assets, "a.txt"), "x");
  const blob = await bytes(await app.request("/v1/data/backup", { method: "GET" }));
  expect((await upload(app, blob)).status).toBe(200);
  // its commit is recorded inside the restored database
  expect(engine.value("SELECT count(*) FROM _kit_restore")).toBe(1);
  // a record left (a restore that couldn't put the folders back): nothing restores or resets on top of it
  writeFileSync(`${db}.restoring`, JSON.stringify({ stamp: 1, dirs: [] }));
  const r = await upload(app, blob);
  expect(r.status).toBe(500);
  expect(await r.json()).toMatchObject({ title: "The restore couldn't put your data back" });
  expect((await app.request("/v1/data/reset", { method: "POST" })).status).toBe(500);
});

test("the_gate_refuses_a_restore_when_a_write_runs_past_the_drain_and_shuts_until_a_restart", async () => {
  const gate = new MaintenanceGate();
  let release;
  const stuck = new Promise((r) => {
    release = r;
  });
  const write = gate.middleware()({ req: { method: "POST", path: "/v1/x" } }, () => stuck);
  await expect(gate.closeFor("restore", async () => "replaced", { drainMs: 30 })).rejects.toMatchObject({ statusCode: 409, title: "A change is still being saved" });
  expect(gate.reason).toBe(null); // open again
  release();
  await write;
  expect(await gate.closeFor("restore", async () => "replaced")).toBe("replaced");
  gate.closeUntilRestart();
  // shut until a restart: its own words everywhere — never "try again when it's done"
  await expect(gate.closeFor("restore", async () => "replaced")).rejects.toMatchObject({ statusCode: 503, title: "The app needs a restart" });
  await expect(gate.middleware()({ req: { method: "POST", path: "/v1/x" } }, async () => {})).rejects.toMatchObject({ statusCode: 503, title: "The app needs a restart" });
  expect(gate.refusal("try the backup again in a moment").detail).toMatch(/restart the app/);
});

test("a gate given the app's data writes shuts out and waits for those only", async () => {
  // a slow AI run or a brand's download is no reason to hold or refuse a restore (the thirteenth review)
  const gate = new MaintenanceGate({ isDataWrite: (c) => c.req.path.startsWith("/v1/houses") });
  let release;
  const slowAi = gate.middleware()({ req: { method: "POST", path: "/v1/schemes/ai" } }, () => new Promise((r) => (release = r)));
  expect(await gate.closeFor("restore", async () => "replaced", { drainMs: 30 })).toBe("replaced");
  await gate.closeFor("restore", async () => {
    await expect(gate.middleware()({ req: { method: "POST", path: "/v1/houses" } }, async () => {})).rejects.toMatchObject({ statusCode: 503 });
    await gate.middleware()({ req: { method: "POST", path: "/v1/schemes/ai" } }, async () => {}); // passes
  });
  release();
  await slowAi;
});

test("the_gate_refuses_other_writes_while_a_restore_replaces_the_data_after_the_running_ones_end", async () => {
  // 2026-10-20, the eleventh review: a design saved during a restore answered 200 and vanished, and jobs were
  // stopped only after the data was replaced
  const gate = new MaintenanceGate();
  const order = [];
  let releaseSlow;
  const slowWrite = new Promise((r) => {
    releaseSlow = r;
  });
  let during = null;
  let app;
  ({ app } = makeApp({
    gate,
    routes: (a) => {
      a.post("/v1/slow", async (c) => {
        await slowWrite;
        order.push("slow write ended");
        return c.json({ ok: true });
      });
      a.post("/v1/write", (c) => c.json({ ok: true }));
    },
    router: {
      gate,
      beforeReplace: async () => {
        order.push("beforeReplace");
        during = await app.request("/v1/write", { method: "POST" });
        order.push(`backup during: ${(await app.request("/v1/data/backup", { method: "GET" })).status}`);
      },
      afterTables: () => order.push("afterTables"),
      onReplaced: () => order.push("onReplaced"),
    },
  }));
  const blob = await bytes(await app.request("/v1/data/backup", { method: "GET" }));
  const slow = app.request("/v1/slow", { method: "POST" });
  await new Promise((r) => setTimeout(r, 20));
  const restoring = upload(app, blob);
  await new Promise((r) => setTimeout(r, 100));
  expect(order).toEqual([]); // the restore waits for the write in flight
  releaseSlow();
  expect((await slow).status).toBe(200);
  expect((await restoring).status).toBe(200);
  expect(order).toEqual(["slow write ended", "beforeReplace", "backup during: 503", "afterTables", "onReplaced"]);
  expect(during.status).toBe(503);
  expect(during.headers.get("retry-after")).toBe("5");
  expect(await during.json()).toMatchObject({ title: "A backup is being restored" });
  // open again
  expect((await app.request("/v1/write", { method: "POST" })).status).toBe(200);
});

test("a_backup_is_the_database_and_the_files_at_one_moment", async () => {
  // the files are linked in the same synchronous step as the database copy: a file removed after it (here by the
  // scrub hook, which runs between the copy and the zip) is still in the backup, as the database it goes with
  const { app, assets, tmp, engine } = makeApp({
    router: {
      scrubBackup: () => {
        rmSync(join(assets, "photo.jpg"));
      },
    },
  });
  engine.run("INSERT INTO notes (id, body) VALUES (1, 'house')");
  mkdirSync(join(assets, "h1"));
  writeFileSync(join(assets, "photo.jpg"), "pixels");
  writeFileSync(join(assets, "h1", "mask.png"), "outline");
  const r = await app.request("/v1/data/backup", { method: "GET" });
  expect(r.status).toBe(200);
  const names = await zipNames(await bytes(r), tmp);
  expect(names).toEqual(expect.arrayContaining(["db.sqlite", "images/photo.jpg", "images/h1/mask.png"]));
  // the links went with the backup
  await new Promise((r2) => setTimeout(r2, 50));
  expect(readdirSync(tmp).filter((n) => n.startsWith(".backup-"))).toEqual([]);
});

// 2026-10-19, the security review (just-house-paint): a backup's engine rows name the executables the next
// engine install runs; a backup carries what the app scrubs out of it; a zip can lie about its sizes.
test("restore_keeps_this_computers_engine_tables_and_a_backup_leaves_out_what_the_app_scrubs", async () => {
  const tmp = mkdtempSync(join(tmpdir(), "kit-data-"));
  const RB = { name: "runner_binary", ddl: "CREATE TABLE runner_binary (platform VARCHAR NOT NULL, asset_url VARCHAR, PRIMARY KEY (platform))" };
  const RS = { name: "runner_setting", ddl: "CREATE TABLE runner_setting (\"key\" VARCHAR NOT NULL, value VARCHAR NOT NULL, PRIMARY KEY (\"key\"))" };
  const make = (file, url, note, build = "b100", preset = "mine") => {
    const h = openDatabase(file, { foreignKeys: false });
    h.exec(NOTES.ddl);
    h.exec(RB.ddl);
    h.exec(RS.ddl);
    h.run("INSERT INTO runner_setting VALUES ('pinned_build', ?), ('default_preset_id', ?)", [build, preset]);
    h.run("INSERT INTO runner_binary VALUES ('windows', ?)", [url]);
    h.run("INSERT INTO notes (id, body) VALUES (1, ?)", [note]);
    return h;
  };
  const db = join(tmp, "app.db");
  const engine = make(db, "https://github.com/ggml-org/llama.cpp/releases/x.zip", "a token");
  const app = createServer({ typeBase: "https://example.test/errors/" });
  const scrubBackup = (h) => h.run("UPDATE notes SET body = 'scrubbed'");
  app.route("/", makeDataRouter({ getDbPath: () => db, metadata: [NOTES, RB, RS], runReset: () => {}, scrubBackup }));
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
  const evil = make(join(tmp, "evil.db"), "https://evil.example/llama.zip", "from the backup", "b99999", "theirs");
  evil.close();
  const zip = new ZipWriter();
  await zip.addFile(join(tmp, "evil.db"), "db.sqlite");
  expect((await upload(app, Buffer.concat(zip.finish()))).status).toBe(200);
  expect(rows(engine)).toEqual({ 1: "from the backup" });
  expect(engine.all("SELECT asset_url FROM runner_binary")).toEqual([{ asset_url: "https://github.com/ggml-org/llama.cpp/releases/x.zip" }]);
  // the runner settings: this computer's pinned build stays; the user's own choice (the default preset) comes back
  const setting = (key) => engine.all("SELECT value FROM runner_setting WHERE \"key\" = ?", [key])[0]?.value;
  expect(setting("pinned_build")).toBe("b100");
  expect(setting("default_preset_id")).toBe("theirs");
});

test("backup_and_restore_work_beside_the_database_and_leave_nothing_there", async () => {
  // the data's own drive, not the system's temp (2026-10-20); an hour-old leftover of a killed process goes
  const { app, tmp } = makeApp();
  mkdirSync(join(tmp, ".backup-old"));
  const hourAgo = (Date.now() - 2 * 3600_000) / 1000;
  utimesSync(join(tmp, ".backup-old"), hourAgo, hourAgo);
  const blob = await bytes(await app.request("/v1/data/backup", { method: "GET" }));
  expect((await upload(app, blob)).status).toBe(200);
  await new Promise((r) => setTimeout(r, 50)); // the backup's folder goes once its answer is read
  expect(readdirSync(tmp).filter((n) => n.startsWith("."))).toEqual([]);
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
  // the hook first in a dry run (rolled back) — a refusal comes before anything is shut out or moved
  expect(calls).toEqual([
    ["beforeCopy", "original", "changed"],
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
  expect(calls.map((c) => c[0])).toEqual(["beforeCopy"]); // the dry run's: refused there
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
