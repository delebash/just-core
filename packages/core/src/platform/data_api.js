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

import { closeSync, createReadStream, createWriteStream, existsSync, mkdtempSync, openSync, rmSync, statfsSync, statSync } from "node:fs";
import { cp, readdir, rename, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import Busboy from "@fastify/busboy";
import { Hono } from "hono";
import { HttpError, RequestValidationError } from "./errors.js";
import { openDatabase } from "./sql.js";
import { BadZipFile, ZipReader, ZipWriter } from "./zip.js";

const DB_ARCNAME = "db.sqlite";

// ── table order (SQLAlchemy's MetaData.sorted_tables) ────────────────────────

const tablesOf = (metadata) => {
  const list = Array.isArray(metadata) ? metadata : [metadata];
  return list.length && list.every(Array.isArray) ? list : [list];
};

/** The runner's own tables — this computer's engine builds and settings: a restore keeps them (makeDataRouter
 *  `keepTables`). */
export const RUNNER_MACHINE_TABLES = Object.freeze(["runner_binary", "runner_setting"]);

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

/** A rename, retried while Windows holds a file in the folder (a scanner reading files just written —
 *  Node's rename doesn't retry as its rm does): about five seconds, then its error. */
async function renameHeld(from, to) {
  for (let i = 1; ; i++) {
    try {
      return await rename(from, to);
    } catch (e) {
      if (!HELD.has(e?.code) || i > 10) throw e;
      await new Promise((r) => setTimeout(r, 100 * i));
    }
  }
}

/** Every file and folder under `dir` that the same tree at `keep` doesn't have, removed (best effort). */
async function prune(dir, keep) {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const there = path.join(keep, entry.name);
    const here = path.join(dir, entry.name);
    if (!existsSync(there)) await rm(here, RETRIES).catch(() => {});
    else if (entry.isDirectory()) await prune(here, there);
  }
}

/** Put the backup's copy `from` in place of the asset folder `dir` (see the restore route). Both are on the
 *  data drive for a moment (the old one until the new is swapped in); a drive too full for that falls back
 *  to removing the old one first. A rename Windows holds is retried; one that still fails never leaves the
 *  folder missing: the old one goes back, or the backup is copied in place. */
async function replaceAssetDir(from, dir) {
  const parent = path.dirname(dir);
  const base = path.basename(dir);
  // an earlier restore's held leftovers beside it
  for (const name of existsSync(parent) ? await readdir(parent) : []) {
    if (name.startsWith(`${base}.replaced-`) || name.startsWith(`${base}.restoring-`)) await rm(path.join(parent, name), RETRIES).catch(() => {});
  }
  const stamp = Date.now();
  const staged = `${dir}.restoring-${stamp}`;
  try {
    // the unpacked backup moved beside it when it's on the same drive (no copy), else copied there
    await rename(from, staged).catch(() => cp(from, staged, { recursive: true, preserveTimestamps: true }));
  } catch (e) {
    await rm(staged, RETRIES).catch(() => {});
    if (e?.code !== "ENOSPC") throw e;
    // no room for both copies at once: the old folder goes first, as before (a held file can then leave it
    // half-replaced — only when the drive is too full for the safe way)
    if (existsSync(dir)) await rm(dir, RETRIES);
    await cp(from, dir, { recursive: true, preserveTimestamps: true });
    return;
  }
  // held: the backup copied over the folder as it is — its files all land, and what it hasn't is removed
  const copyOver = async () => {
    await cp(staged, dir, { recursive: true, force: true, preserveTimestamps: true });
    await prune(dir, staged);
    await rm(staged, RETRIES).catch(() => {});
  };
  if (!existsSync(dir)) {
    try {
      return await renameHeld(staged, dir);
    } catch {
      return copyOver();
    }
  }
  const old = `${dir}.replaced-${stamp}`;
  try {
    await renameHeld(dir, old);
  } catch {
    return copyOver();
  }
  try {
    await renameHeld(staged, dir);
  } catch {
    // the swap half done: the old folder back where it was, then the backup copied over it
    try {
      await renameHeld(old, dir);
    } catch {
      await copyOver(); // the folder is missing: the backup's copy put there (the old one waits beside it)
      return;
    }
    return copyOver();
  }
  await rm(old, RETRIES).catch(() => {}); // held: the next restore takes it
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
      await zip.addFile(full, `${arcname}/${relPosix}`);
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
 *   - `beforeCopy(h)` / `afterCopy(h)` → run inside the RESTORE's transaction, on its
 *                      connection with the backup attached as `src`, around the table copy — for
 *                      a synced app's own restore steps (its sync engine's state must follow the
 *                      restored rows; JustVoice's narrowings review P16). An error a hook throws
 *                      with a `statusCode` is the answer (the sync app layer's refusal of a backup
 *                      from another sync library: 409, `error: "restore-other-library"`); the
 *                      sync package's `appSync.restoreHooks` is all three.
 *   - `afterTables()` → right after the RESTORE's table copy commits, before the asset
 *                      folders are replaced (which can take minutes, and can fail): a synced app
 *                      runs its sync engine's step here, so no sync and no failed asset copy comes
 *                      between the restored rows and that step.
 *   - `keepTables`   → tables a RESTORE leaves as they are: this computer's, not the data's. By
 *                      default the runner's engine builds and settings (`runner_binary`,
 *                      `runner_setting`): a backup's rows there name the executables the next engine
 *                      install downloads and runs — a malicious backup's run its code (the security
 *                      review, 2026-10-19).
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
  scrubBackup = null,
}) {
  const assets = async () => entriesOf(assetDirs ? await assetDirs() : {});
  /** Every table across all metadatas, FK-ordered within each (parents first). */
  const orderedTables = () => tablesOf(metadata).flatMap(sortedTables);
  const kept = new Set(keepTables || []);

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
    const dbPath = String(await getDbPath());
    if (!existsSync(dbPath)) throw new HttpError(404, "no database to back up");
    const tmp = mkdtempSync(path.join(tmpdir(), "llm-runner-backup-"));
    // the archive is written to a file as it is made and streamed from it — never held whole in memory
    // (gigabytes of photos); the folder goes once the answer has been read, or cut off
    const archive = path.join(tmp, "backup.zip");
    try {
      const clean = path.join(tmp, DB_ARCNAME);
      const h = openDatabase(dbPath, { foreignKeys: false, timeoutMs: 5000 });
      try {
        // WAL-safe consistent copy without locking the live DB out.
        h.run("VACUUM INTO ?", [clean]);
      } finally {
        h.close();
      }
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
        for (const [arcname, d] of await assets()) {
          if (skip.has(arcname)) continue;
          await addDir(zip, arcname, String(d));
        }
        zip.finish();
      } finally {
        closeSync(fd);
      }
      rmSync(clean, { force: true });
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

  app.post(`${prefix}/restore`, async (c) => {
    const upDir = mkdtempSync(path.join(tmpdir(), "llm-runner-upload-"));
    const tmp = mkdtempSync(path.join(tmpdir(), "llm-runner-restore-"));
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
      const h = openDatabase(String(await getDbPath()), { foreignKeys: false, timeoutMs: 5000 });
      try {
        h.run("ATTACH ? AS src", [srcDb]);
        // this computer's own tables stay as they are (`keepTables`)
        const tables = orderedTables().filter((t) => !kept.has(t));
        const srcTables = new Set(h.all("SELECT name FROM src.sqlite_master WHERE type='table'").map((r) => r.name));
        h.tx(() => {
          if (beforeCopy) beforeCopy(h);
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
      if (afterTables) await afterTables();
      // Replace each declared asset dir with the backup's copy — never half: the copy is made beside it
      // first, then swapped in (renames); the old one is removed after. Windows holds a just-written
      // file a moment: a held old folder is copied over instead (the backup's files all land), and a
      // held leftover is tried again at the next restore.
      for (const [arcname, d] of await assets()) {
        const bdir = path.join(tmp, arcname);
        if (existsSync(bdir) && statSync(bdir).isDirectory()) await replaceAssetDir(bdir, String(d));
      }
    } finally {
      await rm(upDir, { recursive: true, force: true });
      await rm(tmp, { recursive: true, force: true });
    }
    if (onReplaced) await onReplaced();
    return c.json({ ok: true });
  });

  app.post(`${prefix}/reset`, async (c) => {
    await runReset();
    return c.json({ ok: true });
  });
  return app;
}
