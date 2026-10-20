// SPDX-License-Identifier: MIT
// A restore under broken and hostile input (the nineteenth review: read in the code — a broken multipart answered
// 500, the upload was unbounded and could fill the drive before the room check, any zip error but a bad zip answered
// 500, and nothing let an app refuse a backup by its own rules). Each answers in words, and nothing is replaced.
import { existsSync, mkdirSync, mkdtempSync, readdirSync, writeFileSync } from "node:fs";
import http from "node:http";
import net from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, test, vi } from "vitest";
import { drive, makeDataRouter } from "../src/platform/data_api.js";
import { runServer } from "../src/platform/serve.js";
import { createServer } from "../src/platform/server.js";
import { openDatabase } from "../src/platform/sql.js";
import { ZipWriter } from "../src/platform/zip.js";

const NOTES = { name: "notes", ddl: "CREATE TABLE notes (\n\tid INTEGER NOT NULL, \n\tbody VARCHAR, \n\tPRIMARY KEY (id)\n)" };

function makeApp(router = {}) {
  const tmp = mkdtempSync(join(tmpdir(), "kit-restore-"));
  const db = join(tmp, "app.db");
  const engine = openDatabase(db, { foreignKeys: false });
  engine.exec(NOTES.ddl);
  engine.run("INSERT INTO notes (id, body) VALUES (1, 'live')");
  const assets = join(tmp, "images");
  mkdirSync(assets);
  writeFileSync(join(assets, "live.txt"), "live");
  const app = createServer({ typeBase: "t/" });
  app.route("/", makeDataRouter({ getDbPath: () => db, metadata: [NOTES], runReset: () => {}, assetDirs: () => ({ images: assets }), ...router }));
  return { app, engine, tmp, assets };
}
const rows = (engine) => engine.all("SELECT id, body FROM notes").map((r) => r.body);
/** Only the database and its own files beside it: no work folder left. */
const workLeft = (tmp) => readdirSync(tmp).filter((n) => n.startsWith("."));

/** A backup of `tmp`'s database (the body 'backup') with `files` ({arcname: text}), stored or deflated. */
async function backup(tmp, files = {}, compression = "stored") {
  const src = join(tmp, `src-${Math.random()}.db`);
  const h = openDatabase(src, { foreignKeys: false });
  h.exec(NOTES.ddl);
  h.run("INSERT INTO notes (id, body) VALUES (1, 'backup')");
  h.close();
  const zip = new ZipWriter({ compression });
  await zip.addFile(src, "db.sqlite");
  for (const [name, text] of Object.entries(files)) zip.writestr(name, text);
  return Buffer.concat(zip.finish());
}

/** Each header (local and central) of the member `name`: [offset of the local one, offset of the central one]. */
function headersOf(buf, name) {
  const n = Buffer.from(name);
  const out = { local: [], central: [] };
  for (let at = buf.indexOf(Buffer.from([0x50, 0x4b, 0x03, 0x04])); at >= 0; at = buf.indexOf(Buffer.from([0x50, 0x4b, 0x03, 0x04]), at + 4)) {
    if (buf.subarray(at + 30, at + 30 + n.length).equals(n)) out.local.push(at);
  }
  for (let at = buf.indexOf(Buffer.from([0x50, 0x4b, 0x01, 0x02])); at >= 0; at = buf.indexOf(Buffer.from([0x50, 0x4b, 0x01, 0x02]), at + 4)) {
    if (buf.subarray(at + 46, at + 46 + n.length).equals(n)) out.central.push(at);
  }
  return out;
}

function upload(app, blob) {
  const form = new FormData();
  form.append("file", new Blob([blob], { type: "application/zip" }), "backup.zip");
  return app.request("/v1/data/restore", { method: "POST", body: form });
}

const realFree = drive.freeBytes;
afterEach(() => {
  drive.freeBytes = realFree;
});

test("a multipart form that breaks off, or has no boundary: 422, said as broken — never a 500", async () => {
  const { app, engine, tmp } = makeApp();
  const boundary = "----kitboundary";
  const cut = `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="backup.zip"\r\nContent-Type: application/zip\r\n\r\nPK\u0003\u0004 half a file`;
  let r = await app.request("/v1/data/restore", { method: "POST", headers: { "content-type": `multipart/form-data; boundary=${boundary}` }, body: cut });
  expect(r.status).toBe(422);
  const body = await r.json();
  expect(body).toMatchObject({ type: "t/upload-broken", title: "The upload is broken", status: 422 });
  expect(body.errors).toEqual([{ loc: ["body", "file"], msg: "The upload is broken — choose the backup file again", type: "value_error" }]);
  r = await app.request("/v1/data/restore", { method: "POST", headers: { "content-type": "multipart/form-data" }, body: "no boundary at all" });
  expect(r.status).toBe(422);
  expect(rows(engine)).toEqual(["live"]);
  expect(workLeft(tmp)).toEqual([]);
});

test("an upload past the drive's free room (less its spare) stops as it streams: 413 in words, nothing changed", async () => {
  const { app, engine, tmp, assets } = makeApp();
  const blob = await backup(tmp, { "images/big.txt": "x".repeat(50_000) });
  drive.freeBytes = () => 256 * 1024 * 1024 + 10_000; // room for 10 kB past the spare
  const r = await upload(app, blob);
  expect(r.status).toBe(413);
  expect((await r.json()).detail).toMatch(/^the backup is bigger than the drive's free room \(0\.3 GB free, 0\.3 GB of it kept spare\) — nothing was changed$/);
  expect(rows(engine)).toEqual(["live"]);
  expect(readdirSync(assets)).toEqual(["live.txt"]);
  expect(workLeft(tmp)).toEqual([]);
  // with the room, the same backup restores
  drive.freeBytes = realFree;
  expect((await upload(app, blob)).status).toBe(200);
  expect(rows(engine)).toEqual(["backup"]);
});

test("a zip the app can't read — an unsupported compression, an encrypted entry, a corrupt deflate, a file where a folder goes: 422", async () => {
  const { app, engine, tmp } = makeApp();
  const unreadable = async (blob, why) => {
    const r = await upload(app, blob);
    expect(r.status, why).toBe(422);
    const body = await r.json();
    expect(body, why).toMatchObject({ type: "t/unreadable-backup", title: "Not a backup this app can read", status: 422 });
    expect(body.detail, why).toMatch(/^not a backup this app can read: /);
    expect(body.errors[0].loc).toEqual(["body", "file"]);
    expect(rows(engine), why).toEqual(["live"]);
  };
  // bzip2 (method 12) — the member's method in both of its headers
  let blob = await backup(tmp, { "images/a.txt": "hello" });
  let h = headersOf(blob, "images/a.txt");
  blob.writeUInt16LE(12, h.local[0] + 8);
  blob.writeUInt16LE(12, h.central[0] + 10);
  await unreadable(blob, "unsupported compression");
  // encrypted (flag bit 0)
  blob = await backup(tmp, { "images/a.txt": "hello" });
  h = headersOf(blob, "images/a.txt");
  blob.writeUInt16LE(blob.readUInt16LE(h.local[0] + 6) | 1, h.local[0] + 6);
  blob.writeUInt16LE(blob.readUInt16LE(h.central[0] + 8) | 1, h.central[0] + 8);
  await unreadable(blob, "encrypted");
  // a deflate stream that isn't one (a reserved block type)
  blob = await backup(tmp, { "images/a.txt": "hello hello hello hello" }, "deflated");
  h = headersOf(blob, "images/a.txt");
  const data = h.local[0] + 30 + Buffer.byteLength("images/a.txt") + blob.readUInt16LE(h.local[0] + 28);
  blob.fill(0xff, data, data + blob.readUInt32LE(h.central[0] + 20));
  await unreadable(blob, "corrupt deflate");
  // a file where the backup also has a folder
  await unreadable(await backup(tmp, { "images/a": "a file", "images/a/b.txt": "inside it" }), "a file/folder clash");
  expect(workLeft(tmp)).toEqual([]);
});

test("an app's own rules for a backup (checkBackup) refuse it before anything is replaced, in its words", async () => {
  const seen = [];
  const { app, engine, tmp, assets } = makeApp({
    checkBackup: (h) => {
      seen.push(h.value("SELECT body FROM notes WHERE id = 1"));
      throw new Error("its notes table holds an id that isn't a safe folder name");
    },
  });
  const blob = await backup(tmp, { "images/new.txt": "from the backup" });
  const r = await upload(app, blob);
  expect(seen).toEqual(["backup"]); // run on the backup's own database
  expect(r.status).toBe(422);
  expect(await r.json()).toMatchObject({
    type: "t/backup-refused",
    title: "This backup can't be restored",
    detail: "its notes table holds an id that isn't a safe folder name",
    errors: [{ loc: ["body", "file"], msg: "its notes table holds an id that isn't a safe folder name", type: "value_error" }],
  });
  expect(rows(engine)).toEqual(["live"]);
  expect(readdirSync(assets)).toEqual(["live.txt"]);
  expect(existsSync(join(assets, "new.txt"))).toBe(false);
  // a refusal with its own status is the answer as it is
  const other = makeApp({
    checkBackup: () => {
      throw Object.assign(new Error("from another library"), { statusCode: 409 });
    },
  });
  expect((await upload(other.app, await backup(other.tmp))).status).toBe(409);
});

test("through the real server: past the room the answer comes while the client is still sending — it isn't read to the end", async () => {
  const { app, engine, tmp } = makeApp();
  drive.freeBytes = () => 256 * 1024 * 1024 + 100_000;
  const probe = net.createServer();
  await new Promise((r) => probe.listen(0, "127.0.0.1", r));
  const { port } = probe.address();
  await new Promise((r) => probe.close(r));
  const posted = [];
  const handlers = [];
  process.parentPort = { on: (_ev, fn) => handlers.push(fn), postMessage: (m) => posted.push(m) };
  const exited = new Promise((resolve) => vi.spyOn(process, "exit").mockImplementation((code) => resolve(code)));
  runServer({ argv: ["serve"], envPrefix: null, log: { error() {}, info() {} }, build: async () => ({ app, host: "127.0.0.1", port }) });
  await vi.waitFor(() => expect(posted[0]?.type).toBe("ready"));
  try {
    const boundary = "----kitboundary";
    let sent = 0;
    const answer = await new Promise((resolve, reject) => {
      const req = http.request({ host: "127.0.0.1", port, path: "/v1/data/restore", method: "POST", headers: { "content-type": `multipart/form-data; boundary=${boundary}`, "transfer-encoding": "chunked" } }, (res) => {
        let text = "";
        res.on("data", (b) => {
          text += b;
        });
        res.on("end", () => resolve({ status: res.statusCode, text, sent }));
      });
      req.on("error", (e) => (e.code === "ECONNRESET" || e.code === "EPIPE" ? null : reject(e)));
      req.write(`--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="backup.zip"\r\nContent-Type: application/zip\r\n\r\n`);
      // 64 MB, a chunk at a time, for as long as no answer has come
      const chunk = Buffer.alloc(64 * 1024, 1);
      let stopped = false;
      req.on("response", () => {
        stopped = true;
      });
      const pump = () => {
        if (stopped || req.destroyed) return;
        if (sent >= 64 * 1024 * 1024) return req.end(`\r\n--${boundary}--\r\n`);
        sent += chunk.length;
        if (req.write(chunk)) setImmediate(pump);
        else req.once("drain", pump);
      };
      pump();
    });
    expect(answer.status).toBe(413);
    expect(JSON.parse(answer.text).detail).toMatch(/bigger than the drive's free room/);
    expect(answer.sent).toBeLessThan(64 * 1024 * 1024);
    expect(rows(engine)).toEqual(["live"]);
  } finally {
    for (const fn of handlers) fn({ data: { type: "stop" } });
    await exited;
    vi.restoreAllMocks();
  }
  expect(workLeft(tmp)).toEqual([]);
}, 30_000);

test("what an app's afterCopy returns joins the restore's answer (just-house-paint names the settings it set back)", async () => {
  const { app, tmp } = makeApp({ afterCopy: () => ({ resetSettings: ["a.b"] }) });
  const r = await upload(app, await backup(tmp));
  expect(await r.json()).toEqual({ resetSettings: ["a.b"], ok: true });
  const plain = makeApp();
  expect(await (await upload(plain.app, await backup(plain.tmp))).json()).toEqual({ ok: true });
});
