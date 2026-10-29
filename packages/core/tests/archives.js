// SPDX-License-Identifier: MIT
// Archive writers for the tests (zipfile.writestr / tarfile.addfile, as the Python fakes used) — binary.test.js's,
// shared with the runtime extras' test (2026-10-29).
import { crc32, deflateRawSync, gzipSync } from "node:zlib";

/** A zip of [name, bytes] entries — stored (method 0) unless `deflate`. */
export function zipBytes(entries, { deflate = false } = {}) {
  const locals = [];
  const cds = [];
  let off = 0;
  for (const [name, raw] of entries) {
    const data = Buffer.from(raw);
    const nb = Buffer.from(name, "utf8");
    const body = deflate ? deflateRawSync(data) : data;
    const crc = crc32(data) >>> 0;
    const lh = Buffer.alloc(30);
    lh.writeUInt32LE(0x04034b50, 0);
    lh.writeUInt16LE(20, 4);
    lh.writeUInt16LE(deflate ? 8 : 0, 8);
    lh.writeUInt32LE(crc, 14);
    lh.writeUInt32LE(body.length, 18);
    lh.writeUInt32LE(data.length, 22);
    lh.writeUInt16LE(nb.length, 26);
    const cd = Buffer.alloc(46);
    cd.writeUInt32LE(0x02014b50, 0);
    cd.writeUInt16LE(20, 4);
    cd.writeUInt16LE(20, 6);
    cd.writeUInt16LE(deflate ? 8 : 0, 10);
    cd.writeUInt32LE(crc, 16);
    cd.writeUInt32LE(body.length, 20);
    cd.writeUInt32LE(data.length, 24);
    cd.writeUInt16LE(nb.length, 28);
    cd.writeUInt32LE(off, 42);
    locals.push(lh, nb, body);
    cds.push(cd, nb);
    off += 30 + nb.length + body.length;
  }
  const cdBuf = Buffer.concat(cds);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(entries.length, 8);
  eocd.writeUInt16LE(entries.length, 10);
  eocd.writeUInt32LE(cdBuf.length, 12);
  eocd.writeUInt32LE(off, 16);
  return Buffer.concat([...locals, cdBuf, eocd]);
}

/** A gzipped ustar archive of [name, bytes, {type, mode, linkname}] members. */
export function tarGzBytes(members) {
  const blocks = [];
  for (const [name, raw, opt = {}] of members) {
    const data = Buffer.from(raw);
    const h = Buffer.alloc(512);
    h.write(name, 0, 100, "utf8");
    h.write(`${(opt.mode ?? 0o644).toString(8).padStart(7, "0")}\0`, 100, "ascii");
    h.write("0000000\0", 108, "ascii");
    h.write("0000000\0", 116, "ascii");
    h.write(`${data.length.toString(8).padStart(11, "0")}\0`, 124, "ascii");
    h.write("00000000000\0", 136, "ascii");
    h.write("        ", 148, "ascii");
    h.write(opt.type ?? "0", 156, "ascii");
    if (opt.linkname) h.write(opt.linkname, 157, 100, "utf8");
    h.write("ustar\0", 257, "ascii");
    h.write("00", 263, "ascii");
    let sum = 0;
    for (const b of h) sum += b;
    h.write(`${sum.toString(8).padStart(6, "0")}\0 `, 148, "ascii");
    blocks.push(h, data, Buffer.alloc((512 - (data.length % 512)) % 512));
  }
  blocks.push(Buffer.alloc(1024));
  return gzipSync(Buffer.concat(blocks));
}
