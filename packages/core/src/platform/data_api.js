// SPDX-License-Identifier: MIT
// The shared data-management router — backup / restore / reset over a host's SQLite
// database + asset directories (the port of llm_runner/platform/data_api.py).
//
// Same machinery for every same-stack app; only the host hooks differ — the DB path, the
// table list, a reset callback, and any extra asset dirs to bundle. The mechanism is
// schema-agnostic, so a new app gets backup/restore/reset for free.
//
// Endpoints (mounted under `prefix`, default `/v1/data`):
//   GET  /backup  → a ZIP: a clean DB copy (SQLite `VACUUM INTO`, WAL-safe) plus each
//                   declared asset dir.
//   POST /restore → replace data from an uploaded backup ZIP by **table-copy** (no
//                   live-file swap → no cross-platform file-lock issue): for every known
//                   table, the live rows are deleted and re-inserted from the backup DB
//                   (column-aware, so an older/newer backup with a drifted column still
//                   loads). Declared asset dirs are replaced too.
//   POST /reset   → first-run state via the host's reset callback (delete all rows +
//                   reseed).
//
// Python's `metadata` (SQLAlchemy MetaData) is the captured TABLES list here
// (scripts/capture-schema.py — `[{name, ddl, …}]`), or a list of them when the app has
// more than one base on the same DB (the domain base + the shared LLM tables). Tables run
// in `metadata.sorted_tables` order: by name, then parents before children (the FKs read
// from each table's DDL).
//
// The ZIP is platform/zip.js — what Python's zipfile writes and reads, so Python-made
// backups restore. Uploads are streamed to a temp file rather than held in memory.

import {
  closeSync,
  copyFileSync,
  createReadStream,
  createWriteStream,
  existsSync,
  linkSync,
  mkdirSync,
  mkdtempSync,
  openSync,
  readdirSync,
  readFileSync,
  renameSync,
  rmSync,
  statfsSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { cp, readdir, rename, rm } from "node:fs/promises";
import path from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import Busboy from "@fastify/busboy";
import { Hono } from "hono";
import { ApiError, HttpError, RequestValidationError } from "./errors.js";
import { getLogger } from "./log.js";
import { MaintenanceGate } from "./maintenance.js";
import { openDatabase } from "./sql.js";
import { BadZipFile, ZipReader, ZipWriter } from "./zip.js";

const DB_ARCNAME = "db.sqlite";

const log = getLogger("llm_runner.platform.data_api");

// ── table order (SQLAlchemy's MetaData.sorted_tables) ────────────────────────

const tablesOf = (metadata) => {
  const list = Array.isArray(metadata) ? metadata : [metadata];
  return list.length && list.every(Array.isArray) ? list : [list];
};

/** The runner's own table of this computer's engine builds (their download URLs): a restore keeps it
 *  (makeDataRouter `keepTables`). */
export const RUNNER_MACHINE_TABLES = Object.freeze(["runner_binary"]);

/** The runner settings that are this computer's, not the user's choices: the pinned engine build, the
 *  calibration model it downloads (URL, hash, size) and where the models are kept — a restore keeps these rows
 *  (`keepRows`) and restores the rest of the table (the default preset, the model-list rules, the update
 *  policy: a backup moved to a new computer brings them — 2026-10-20). */
export const RUNNER_MACHINE_ROWS = Object.freeze({
  runner_setting: Object.freeze({ column: "key", values: Object.freeze(["pinned_build", "calib_model_url", "calib_model_sha256", "calib_model_size_bytes", "cache_root"]) }),
});

/** A backup's or a restore's work folder, beside the database — on the data's own drive, not the system's
 *  temp (a backup of gigabytes on a nearly full system drive failed while the data lived on another, and a
 *  restore's unpacked copy then moves into place by a rename, not a copy); one an ended process left goes once
 *  it is an hour old (2026-10-20). */
function workFolder(dbPath, kind) {
  const parent = path.dirname(dbPath);
  for (const name of existsSync(parent) ? readdirSync(parent) : []) {
    if (!name.startsWith(`.${kind}-`)) continue;
    try {
      const old = path.join(parent, name);
      if (Date.now() - statSync(old).mtimeMs > 3600_000) rmSync(old, { recursive: true, force: true });
    } catch {
      // held or gone: the next one tries again
    }
  }
  return mkdtempSync(path.join(parent, `.${kind}-`));
}

/** The rows `keep` names in tables a restore replaces, read before it (put back after: restoreRows). */
function heldRows(h, keep, tables) {
  const held = [];
  for (const [table, { column, values }] of Object.entries(keep || {})) {
    if (!tables.includes(table) || !values.length) continue;
    const marks = values.map(() => "?").join(", ");
    held.push({ table, column, values, marks, rows: h.all(`SELECT * FROM main."${table}" WHERE "${column}" IN (${marks})`, values) });
  }
  return held;
}

/** This computer's rows back, in place of the backup's. */
function restoreRows(h, held) {
  for (const { table, column, values, marks, rows } of held) {
    h.run(`DELETE FROM main."${table}" WHERE "${column}" IN (${marks})`, values);
    for (const row of rows) {
      const cols = Object.keys(row);
      h.run(`INSERT INTO main."${table}" (${cols.map((c) => `"${c}"`).join(", ")}) VALUES (${cols.map(() => "?").join(", ")})`, cols.map((c) => row[c]));
    }
  }
}

/** Room the drive keeps beyond what a restore unpacks (the database's own copy, the logs). */
const UNPACK_MARGIN = 256 * 1024 * 1024;

/** A backup unpacks to what its entries say (ZipReader.extract stops an entry that inflates past its size):
 *  refused when that won't fit the drive with room to spare — never a full disk. */
export function checkUnpackedFits(zf, dir) {
  const total = zf.names().reduce((n, name) => n + (zf.info(name).size || 0), 0);
  let free = Number.POSITIVE_INFINITY;
  try {
    const drive = statfsSync(dir);
    free = drive.bavail * drive.bsize;
  } catch {
    // no answer from the drive: the extract's own checks still stand
  }
  if (total + UNPACK_MARGIN > free) {
    const gb = (n) => (n / 1e9).toFixed(1);
    throw new HttpError(413, `the backup unpacks to ${gb(total)} GB; the drive has ${gb(free)} GB free`);
  }
}

const RETRIES = { recursive: true, force: true, maxRetries: 10, retryDelay: 100 };
const HELD = new Set(["EPERM", "EACCES", "EBUSY"]);

/** A rename, retried while Windows holds a file in the folder (a scanner reading files just written, the
 *  indexer — Node's rename doesn't retry as its rm does): about ten seconds, then its error. */
async function renameHeld(from, to) {
  for (let i = 1; ; i++) {
    try {
      return await rename(from, to);
    } catch (e) {
      if (!HELD.has(e?.code) || i > 15) throw e;
      await new Promise((r) => setTimeout(r, Math.min(100 * i, 1000)));
    }
  }
}

/** A restore's record of the asset folders it is swapping, beside the database, until its tables are in: a
 *  server stopped between the two (the window closed mid-restore) finds it at its next start and puts the old
 *  folders back (finishInterruptedRestore) — the folders and the tables always from the same side. */
const journalOf = (dbPath) => `${dbPath}.restoring`;

/**
 * At start, before anything reads the asset folders: a restore that stopped before its tables were in (its
 * record still beside the database) is undone — each folder it moved aside put back, the backup's copy moved
 * out of the way (`<dir>.restoring-<time>`, removed by the next restore or the app's own start-up sweep).
 * Synchronous; true when something was put back. makeDataRouter runs it as it is made.
 */
export function finishInterruptedRestore(dbPath) {
  const journal = journalOf(String(dbPath));
  if (!existsSync(journal)) return false;
  let record;
  try {
    record = JSON.parse(readFileSync(journal, "utf8"));
  } catch {
    rmSync(journal, { force: true }); // cut short as it was written: nothing was moved yet
    return false;
  }
  for (const { dir, old } of [...(record.dirs || [])].reverse()) {
    if (old && !existsSync(old)) continue; // never moved, or already back
    if (existsSync(dir)) renameSync(dir, `${dir}.restoring-${record.stamp}`);
    if (old) renameSync(old, dir);
  }
  rmSync(journal, { force: true });
  return true;
}

/** A restore that can't swap a folder: nothing was changed. */
function swapRefusal(e, dir) {
  if (HELD.has(e?.code)) {
    return new ApiError(409, "files-in-use", "A file in the app's data is open in another program", `nothing was changed — close the program using ${dir} (an image viewer, a backup or sync tool) and restore again`);
  }
  if (e?.code === "ENOSPC") return new ApiError(507, "disk-full", "Not enough room to restore", `nothing was changed — the backup's copy of ${dir} doesn't fit beside it`);
  return e;
}

/**
 * Swap each asset folder for the backup's unpacked copy (`pairs`: [[copy, folder]]) — all or nothing, and before
 * the tables, the one step that can't be undone (2026-10-20, the eleventh review: a file held past the retries
 * left a folder half the backup's and half the old under restored tables). Each folder is renamed aside and the
 * copy renamed into its place (copied when it is on another drive); a folder that can't be moved refuses the
 * restore with every folder put back. Returns { undo, commit }: undo puts the old folders back (the tables
 * failed), commit forgets the record and removes the old folders (a held one stays beside, as
 * `<dir>.replaced-<time>`, for the next restore or the app's start-up sweep).
 */
async function swapAssetDirs(pairs, journal) {
  const stamp = Date.now();
  const steps = []; // { dir, old (null: there was none), moved, placed }
  const record = () => writeFileSync(journal, JSON.stringify({ stamp, dirs: steps.map(({ dir, old }) => ({ dir, old })) }));
  const undo = async () => {
    for (const step of [...steps].reverse()) {
      if (step.placed) await renameHeld(step.dir, `${step.dir}.restoring-${stamp}`);
      if (step.moved) await renameHeld(step.old, step.dir);
      step.placed = step.moved = false;
    }
    rmSync(journal, { force: true });
    for (const { dir } of steps) await rm(`${dir}.restoring-${stamp}`, RETRIES).catch(() => {});
  };
  let current = null;
  try {
    for (const [from, dir] of pairs) {
      current = dir;
      // an earlier restore's leftovers beside it (held then)
      const parent = path.dirname(dir);
      const base = path.basename(dir);
      for (const name of existsSync(parent) ? await readdir(parent) : []) {
        if (name.startsWith(`${base}.replaced-`) || name.startsWith(`${base}.restoring-`)) await rm(path.join(parent, name), RETRIES).catch(() => {});
      }
      const step = { dir, old: existsSync(dir) ? `${dir}.replaced-${stamp}` : null, moved: false, placed: false };
      steps.push(step);
      record(); // before the first rename: a stop anywhere after it is undone at the next start
      if (step.old) {
        await renameHeld(dir, step.old);
        step.moved = true;
      }
      try {
        await rename(from, dir);
      } catch (e) {
        if (e?.code !== "EXDEV") throw e;
        await cp(from, dir, { recursive: true, preserveTimestamps: true }).catch(async (err) => {
          await rm(dir, RETRIES).catch(() => {});
          throw err;
        });
      }
      step.placed = true;
    }
  } catch (e) {
    try {
      await undo();
    } catch (err) {
      // the record stays: the next start puts the old folders back
      throw new HttpError(500, `restore failed and its folders couldn't all be put back (${err?.code || err?.message}); the app puts them back when it starts again`);
    }
    throw swapRefusal(e, current);
  }
  const commit = () => {
    rmSync(journal, { force: true });
    return Promise.all(steps.filter((s) => s.old).map((s) => rm(s.old, RETRIES).catch(() => {})));
  };
  return { undo, commit };
}

/** A point-in-time copy of the folder `d` at `to`: every file hard-linked (no bytes copied — a link keeps the
 *  file as it was even when the app replaces or removes it after) and made synchronously, so nothing else the
 *  server does runs while it is made. Throws where links can't be made (FAT, exFAT, another drive). */
function linkTree(d, to) {
  mkdirSync(to, { recursive: true });
  for (const e of readdirSync(d, { withFileTypes: true })) {
    const from = path.join(d, e.name);
    const dest = path.join(to, e.name);
    if (e.isDirectory()) linkTree(from, dest);
    else if (e.isFile()) linkSync(from, dest);
    else if (e.isSymbolicLink() && statSync(from, { throwIfNoEntry: false })?.isFile()) copyFileSync(from, dest);
  }
}

/** One metadata's tables: by name, then layered so every parent precedes its children
 * (sqlalchemy.util.topological.sort with deterministic order; self-references ignored). */
export function sortedTables(tables) {
  const byName = new Map();
  for (const t of tables) {
    const name = typeof t === "string" ? t : t.name;
    const ddl = typeof t === "string" ? "" : t.ddl || "";
    byName.set(name, ddl);
  }
  const names = [...byName.keys()].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
  const parents = new Map();
  for (const n of names) {
    const deps = new Set();
    for (const m of byName.get(n).matchAll(/REFERENCES\s+(?:"([^"]+)"|([^\s(]+))/gi)) {
      const ref = m[1] ?? m[2];
      if (ref !== n && byName.has(ref)) deps.add(ref);
    }
    parents.set(n, deps);
  }
  const out = [];
  let todo = names;
  const todoSet = new Set(names);
  while (todoSet.size) {
    const layer = todo.filter((n) => [...parents.get(n)].every((p) => !todoSet.has(p)));
    if (!layer.length) {
      // A cycle: SQLAlchemy drops the cycle's edges and sorts again; name order here.
      out.push(...todo);
      break;
    }
    for (const n of layer) todoSet.delete(n);
    out.push(...layer);
    todo = todo.filter((n) => todoSet.has(n));
  }
  return out;
}

// ── the router ───────────────────────────────────────────────────────────────

const entriesOf = (x) => (x instanceof Map ? [...x.entries()] : Object.entries(x || {}));

/** `_add_dir`: every file under `d` (rglob order: a folder's entries, then its subfolders
 * depth-first), stored as `<arcname>/<relative posix path>`. Symlinked files are read;
 * symlinked folders are not entered. */
async function addDir(zip, arcname, d, rel = "") {
  let entries;
  try {
    if (!statSync(d).isDirectory()) return;
    entries = await readdir(path.join(d, rel), { withFileTypes: true });
  } catch {
    return;
  }
  const subdirs = [];
  for (const e of entries) {
    const full = path.join(d, rel, e.name);
    const relPosix = rel ? `${rel.split(path.sep).join("/")}/${e.name}` : e.name;
    if (e.isDirectory()) subdirs.push(e.name);
    else if (e.isFile() || (e.isSymbolicLink() && statSync(full, { throwIfNoEntry: false })?.isFile())) {
      try {
        await zip.addFile(full, `${arcname}/${relPosix}`);
      } catch (err) {
        if (err?.code !== "ENOENT") throw err; // removed while a backup read the live folder (no snapshot there)
      }
    }
  }
  for (const s of subdirs) await addDir(zip, arcname, d, rel ? path.join(rel, s) : s);
}

const MISSING_FILE = () =>
  new RequestValidationError([{ loc: ["body", "file"], msg: "Field required", type: "missing" }]);
const FILE_NOT_UPLOAD = () =>
  new RequestValidationError([
    { loc: ["body", "file"], msg: "Value error, Expected UploadFile, received: <class 'str'>", type: "value_error" },
  ]);

/** FastAPI's `file: UploadFile`: the form's last `file` part, streamed to `dest` (busboy over the
 * request's own body stream — never held in memory); a missing one, or a plain field in its
 * place, is pydantic's 422 (measured answers). */
async function receiveUpload(c, dest) {
  let kind = null; // "file" | "field"
  const type = c.req.header("content-type") || "";
  if (/^multipart\//i.test(type) && c.req.raw.body) {
    const bb = new Busboy({ headers: { "content-type": type } });
    // Parts arrive in order; each `file` part is written after the one before, so the last wins.
    let writes = Promise.resolve();
    bb.on("file", (fieldname, file) => {
      if (fieldname === "file") {
        kind = "file";
        writes = writes.then(() => pipeline(file, createWriteStream(dest)));
      } else {
        file.resume();
      }
    });
    bb.on("field", (fieldname) => {
      if (fieldname === "file") kind = "field";
    });
    await pipeline(Readable.fromWeb(c.req.raw.body), bb);
    await writes;
  } else if (/^application\/x-www-form-urlencoded/i.test(type)) {
    if (new URLSearchParams(await c.req.text()).has("file")) kind = "field";
  }
  if (kind === null) throw MISSING_FILE();
  if (kind === "field") throw FILE_NOT_UPLOAD();
}

/**
 * Build the shared data backup/restore/reset router over host hooks (sync or async).
 *   - `getDbPath()`  → the live SQLite file path.
 *   - `metadata`     → the app's captured TABLES list, OR a list of them when the app has
 *                      more than one base on the same DB (the domain base + the shared LLM
 *                      tables). Tables across all of them are covered (no cross-base FKs).
 *   - `runReset()`   → wipe to first-run state (delete all rows + reseed). The host owns
 *                      it (it knows its storage + seed); a callback so reset and the app's
 *                      own seeding stay one implementation.
 *   - `assetDirs()`  → `{arcname: dir}` extra directories to include in a backup and
 *                      replace on restore (e.g. JustVoice `audio/`).
 *   - `onReplaced()` → called after a successful RESTORE replaced the data under a live
 *                      app (2026-07-11): the host tears down anything derived from the old
 *                      data (e.g. the LLM runner's resident models + VRAM ledger). Reset
 *                      covers itself inside `runReset`.
 *   - `beforeReplace()` → called once the RESTORE's writes are shut out (the gate) and before
 *                      anything is replaced: the host stops what would write into the data being
 *                      replaced — its running jobs (a job that commits after the swap writes into
 *                      the restored folders, or its outlines over the backup's).
 *   - `gate`         → the app's MaintenanceGate (maintenance.js), whose middleware the app puts
 *                      before its routes: while a restore or a reset replaces the data, every other
 *                      write is refused (503, Retry-After) and the writes in flight finish first.
 *                      Without one the router keeps its own: restores and resets one at a time.
 *   - `beforeCopy(h)` / `afterCopy(h)` → run inside the RESTORE's transaction, on its
 *                      connection with the backup attached as `src`, around the table copy — for
 *                      a synced app's own restore steps (its sync engine's state must follow the
 *                      restored rows; JustVoice's narrowings review P16). An error a hook throws
 *                      with a `statusCode` is the answer (the sync app layer's refusal of a backup
 *                      from another sync library: 409, `error: "restore-other-library"`); the
 *                      sync package's `appSync.restoreHooks` is all three.
 *   - `afterTables()` → right after the RESTORE's table copy commits (the asset folders were
 *                      swapped just before — all or nothing, put back if the tables fail): a synced
 *                      app runs its sync engine's step here, so nothing comes between the restored
 *                      rows and that step.
 *   - `keepTables`   → tables a RESTORE leaves as they are: this computer's, not the data's. By
 *                      default the runner's engine builds (`runner_binary`): a backup's rows there name
 *                      the executables the next engine install downloads and runs — a malicious
 *                      backup's run its code (the security review, 2026-10-19).
 *   - `keepRows`     → `{table: {column, values}}`: rows of a restored table that stay this computer's —
 *                      by default the runner settings naming its build, its calibration download and its
 *                      model cache (RUNNER_MACHINE_ROWS); the user's own settings in that table restore.
 *   - `scrubBackup(h)` → runs on the BACKUP's own copy of the database before it is zipped, to drop
 *                      what must not leave this computer (the template: the access tokens, which a
 *                      restore keeps from the server anyway).
 */
export function makeDataRouter({
  getDbPath,
  metadata,
  runReset,
  assetDirs = null,
  prefix = "/v1/data",
  onReplaced = null,
  beforeCopy = null,
  afterCopy = null,
  afterTables = null,
  keepTables = RUNNER_MACHINE_TABLES,
  keepRows = RUNNER_MACHINE_ROWS,
  scrubBackup = null,
  beforeReplace = null,
  gate = new MaintenanceGate(),
}) {
  const assets = async () => entriesOf(assetDirs ? await assetDirs() : {});
  /** Every table across all metadatas, FK-ordered within each (parents first). */
  const orderedTables = () => tablesOf(metadata).flatMap(sortedTables);
  const kept = new Set(keepTables || []);
  gate.exempt(`${prefix}/restore`);
  gate.exempt(`${prefix}/reset`);
  // a restore the server stopped in the middle of: its old folders back before anything reads them
  const recovered = Promise.resolve()
    .then(() => getDbPath())
    .then((p) => finishInterruptedRestore(String(p)))
    .then((back) => back && log.warning("a restore stopped before its tables were in: the folders it had moved are back"))
    .catch((e) => log.error(`an interrupted restore couldn't be undone (${e?.code || e?.message}); tried again at the next start`));

  // FastAPI has no upload limit; a backup with audio is easily over 1 GiB — the restore streams
  // its upload to disk (receiveUpload); what it unpacks to must fit the drive (checkUnpackedFits).
  const app = new Hono();

  app.get(`${prefix}/backup`, async (c) => {
    // `exclude` = comma-separated asset-dir ARCNAMES to leave out of this backup (the
    // kit DataManagement's per-app options seam — decision ①, family parity batch
    // 2026-08-05: JV skips its generated audio). Unknown names are ignored; the DB is
    // never excludable. A restore of a backup missing a declared dir leaves the live
    // copy of that dir untouched (the `isDirectory` guard in restore).
    const excludes = c.req.queries("exclude") ?? [];
    const exclude = excludes.length ? excludes[excludes.length - 1] : ""; // the last, as Starlette
    const skip = new Set(
      String(exclude)
        .split(",")
        .map((k) => k.trim())
        .filter(Boolean),
    );
    await recovered;
    if (gate.reason) throw gate.refusal("try the backup again in a moment");
    const dbPath = String(await getDbPath());
    if (!existsSync(dbPath)) throw new HttpError(404, "no database to back up");
    const dirs = (await assets()).filter(([arcname]) => !skip.has(arcname)).map(([arcname, d]) => [arcname, String(d)]);
    const tmp = workFolder(dbPath, "backup");
    // the archive is written to a file as it is made and streamed from it — never held whole in memory
    // (gigabytes of photos); the folder goes once the answer has been read, or cut off
    const archive = path.join(tmp, "backup.zip");
    try {
      const clean = path.join(tmp, DB_ARCNAME);
      // The database and the files at one moment (2026-10-20, the eleventh review: a house deleted while the
      // backup read the folders left a zip whose database lists it with none of its files). Everything from the
      // database copy to the last link is synchronous — no other request, and no job's step, runs in between.
      const h = openDatabase(dbPath, { foreignKeys: false, timeoutMs: 5000 });
      try {
        // WAL-safe consistent copy without locking the live DB out.
        h.run("VACUUM INTO ?", [clean]);
      } finally {
        h.close();
      }
      const sources = dirs.map(([arcname, d], i) => {
        if (!statSync(d, { throwIfNoEntry: false })?.isDirectory()) return [arcname, d];
        const snap = path.join(tmp, `files-${i}`);
        try {
          linkTree(d, snap);
          return [arcname, snap];
        } catch {
          // no links on this drive: the live folder, a file removed meanwhile skipped
          rmSync(snap, { recursive: true, force: true });
          return [arcname, d];
        }
      });
      if (scrubBackup) {
        const copy = openDatabase(clean, { foreignKeys: false, timeoutMs: 5000 });
        try {
          await scrubBackup(copy);
          copy.run("VACUUM"); // what was dropped leaves no trace in the file's free pages
        } finally {
          copy.close();
        }
      }
      const fd = openSync(archive, "w");
      try {
        const zip = new ZipWriter({ fd });
        await zip.addFile(clean, DB_ARCNAME);
        for (const [arcname, d] of sources) await addDir(zip, arcname, d);
        zip.finish();
      } finally {
        closeSync(fd);
      }
      rmSync(clean, { force: true });
      // the links go now: a house removed meanwhile frees its space once the backup has read it
      for (const [, d] of sources) if (d.startsWith(tmp)) await rm(d, RETRIES).catch(() => {});
    } catch (e) {
      await rm(tmp, { recursive: true, force: true });
      throw e;
    }
    const size = statSync(archive).size;
    const stream = createReadStream(archive);
    stream.once("close", () => rm(tmp, { recursive: true, force: true }).catch(() => {}));
    return c.body(Readable.toWeb(stream), 200, {
      "Content-Type": "application/zip",
      "Content-Length": String(size),
      "Content-Disposition": 'attachment; filename="backup.zip"',
    });
  });

  /** The backup's rows in place of the live ones, every table in one transaction (the hooks inside it). */
  const copyTables = (liveDb, srcDb) => {
    const h = openDatabase(liveDb, { foreignKeys: false, timeoutMs: 5000 });
    try {
      h.run("ATTACH ? AS src", [srcDb]);
      // this computer's own tables stay as they are (`keepTables`)
      const tables = orderedTables().filter((t) => !kept.has(t));
      const srcTables = new Set(h.all("SELECT name FROM src.sqlite_master WHERE type='table'").map((r) => r.name));
      h.tx(() => {
        if (beforeCopy) beforeCopy(h);
        const held = heldRows(h, keepRows, tables);
        // Clear children → parents, refill parents → children.
        for (const t of [...tables].reverse()) h.exec(`DELETE FROM main."${t}"`);
        for (const t of tables) {
          if (!srcTables.has(t)) continue;
          const mainCols = h.all(`PRAGMA table_info("${t}")`).map((r) => r.name);
          const srcCols = new Set(h.all(`PRAGMA src.table_info("${t}")`).map((r) => r.name));
          const cols = mainCols.filter((col) => srcCols.has(col));
          if (!cols.length) continue;
          const colSql = cols.map((col) => `"${col}"`).join(", ");
          h.exec(`INSERT INTO main."${t}" (${colSql}) SELECT ${colSql} FROM src."${t}"`);
        }
        restoreRows(h, held);
        if (afterCopy) afterCopy(h);
      });
      h.exec("DETACH src");
    } catch (e) {
      // a hook's own answer reaches the client as it is (a synced app refusing a backup from
      // another sync library: 409 with its code); anything else is a failed restore — either way
      // the transaction rolled back
      if (Number.isInteger(e?.statusCode)) throw e;
      throw new HttpError(400, `restore failed: ${String(e?.message ?? e).slice(0, 300)}`);
    } finally {
      h.close();
    }
  };

  app.post(`${prefix}/restore`, async (c) => {
    await recovered;
    // another restore or a reset running: refused before an upload of gigabytes
    if (gate.reason) throw new ApiError(409, "maintenance-busy", gate.refusal().title, "try again when it's done");
    const liveDb = String(await getDbPath());
    const upDir = workFolder(liveDb, "upload");
    const tmp = workFolder(liveDb, "restore");
    try {
      const upload = path.join(upDir, "backup.zip");
      await receiveUpload(c, upload);
      let zf;
      try {
        zf = await ZipReader.open(upload);
      } catch (e) {
        if (e instanceof BadZipFile || e.code === "ERR_OUT_OF_RANGE") throw new HttpError(400, "not a valid backup zip");
        throw e;
      }
      if (!zf.names().includes(DB_ARCNAME)) throw new HttpError(400, `backup is missing ${DB_ARCNAME}`);
      checkUnpackedFits(zf, tmp);
      try {
        await zf.extractAll(tmp);
      } catch (e) {
        if (e instanceof BadZipFile) throw new HttpError(400, `not a valid backup zip: ${e.message}`);
        throw e;
      }
      const srcDb = path.join(tmp, DB_ARCNAME);
      // each declared asset folder the backup has (one it leaves out stays as it is)
      const pairs = (await assets()).map(([arcname, d]) => [path.join(tmp, arcname), String(d)]).filter(([b]) => existsSync(b) && statSync(b).isDirectory());
      await gate.closeFor("restore", async () => {
        if (beforeReplace) await beforeReplace();
        // the folders first, all or nothing; then the tables in one transaction — the folders put back if it fails
        const swap = await swapAssetDirs(pairs, journalOf(liveDb));
        try {
          copyTables(liveDb, srcDb);
        } catch (e) {
          await swap.undo().catch(() => {}); // a folder still held: the record puts it back at the next start
          throw e;
        }
        await swap.commit();
        if (afterTables) await afterTables();
        if (onReplaced) await onReplaced();
      });
    } finally {
      await rm(upDir, { recursive: true, force: true });
      await rm(tmp, { recursive: true, force: true });
    }
    return c.json({ ok: true });
  });

  app.post(`${prefix}/reset`, async (c) => {
    await recovered;
    await gate.closeFor("reset", () => runReset());
    return c.json({ ok: true });
  });
  return app;
}
