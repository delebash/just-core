// SPDX-License-Identifier: MIT
// A runtime's side archives (round E, 2026-10-29 — JustVoice's engines/audiocpp/espeak.js and japanese.js moved into the
// kit, the user's word: "eSpeak an extra archive on each build row; UniDic an optional add-on"). An EXTRA rides a build
// row and installs with that build (eSpeak NG beside audio.cpp); an ADD-ON is the runtime's, installed when the user asks
// (the Japanese dictionary). Either is one archive — a zip (a Python wheel is one) or a tar.gz — at a pinned URL with
// its SHA-256: downloaded resumably, checked before anything unpacks, only the part the runtime reads kept, swapped in
// whole. Their data: `{name, url, sha256, bytes, archive: "zip"|"tar.gz", take, skipExt?, also?, into, check?}` — `take`
// the folder inside the archive whose files land at the target's root, `skipExt` file endings left behind (a wheel's
// Python wrapper), `also` single files kept beside them (a licence), `into` the target folder's name, `check` a file
// that must be there after (the dictionary's dicrc). `archive: "file"` is one file kept as it is, no unpacking (a model
// published as a single file — MediaPipe's face landmarker beside the mocap engine, 2026-11-08): it lands in the target
// folder under `file`, and `check` defaults to that name.

import { createHash } from "node:crypto";
import { cpSync, createReadStream, existsSync, mkdirSync, readdirSync, rmSync, statSync } from "node:fs";
import { rm } from "node:fs/promises";
import path from "node:path";
import { RuntimeError } from "../platform/py.js";
import { renameHeld } from "../platform/rename_held.js";
import { extractZip } from "../platform/zip.js";
import { extractTarGz } from "./binary.js";
import * as download from "./download.js";

const isDir = (p) => {
  try {
    return statSync(p).isDirectory();
  } catch {
    return false;
  }
};

async function fileSha256(p) {
  const h = createHash("sha256");
  for await (const chunk of createReadStream(p, { highWaterMark: 1 << 20 })) h.update(chunk);
  return h.digest("hex");
}

/** Whether `extra` is installed under `parent` (its `into` folder there, with its `check` file when it names one). */
export function installed(parent, extra) {
  const dir = path.join(String(parent), extra.into);
  if (!isDir(dir)) return false;
  const check = extra.check ?? (extra.archive === "file" ? extra.file : null);
  return !check || existsSync(path.join(dir, check));
}

/** One file kept as it is (`archive: "file"`): downloaded, checked, then its folder swapped in whole. */
async function installFile(parent, extra, target, { onProgress, cancelCheck }) {
  if (!extra.file || path.basename(extra.file) !== extra.file) throw new RuntimeError(`${extra.name} names no plain file to keep`);
  const staging = `${target}.staging`;
  await rm(staging, { recursive: true, force: true });
  mkdirSync(staging, { recursive: true });
  const file = path.join(staging, extra.file);
  try {
    await download.streamDownload(extra.url, file, { onProgress, cancelCheck });
    const digest = await fileSha256(file);
    if (extra.sha256 && digest !== String(extra.sha256).toLowerCase()) {
      throw new RuntimeError(`${extra.name} doesn't match its published checksum (${digest.slice(0, 12)}…) — refusing it`);
    }
  } catch (e) {
    await rm(staging, { recursive: true, force: true });
    throw e;
  }
  await rm(target, { recursive: true, force: true });
  await renameHeld(staging, target);
  return target;
}

/** Download, check and unpack `extra` into `<parent>/<into>` (nothing when it's there already). Returns that folder. */
export async function installArchive(parent, extra, { onProgress = null, cancelCheck = null } = {}) {
  const target = path.join(String(parent), extra.into);
  if (installed(parent, extra)) return target;
  mkdirSync(String(parent), { recursive: true });
  if (extra.archive === "file") return installFile(parent, extra, target, { onProgress, cancelCheck });
  const file = `${target}.${extra.archive === "tar.gz" ? "tar.gz" : "zip"}`;
  const staging = `${target}.staging`;
  const unpack = `${target}.unpack`;
  await download.streamDownload(extra.url, file, { onProgress, cancelCheck });
  const digest = await fileSha256(file);
  if (extra.sha256 && digest !== String(extra.sha256).toLowerCase()) {
    rmSync(file, { force: true });
    throw new RuntimeError(`${extra.name} doesn't match its published checksum (${digest.slice(0, 12)}…) — refusing it`);
  }
  // fs.promises.rm, never a recursive rmSync: Node 24's follows an NTFS junction (the kit's)
  await rm(staging, { recursive: true, force: true });
  await rm(unpack, { recursive: true, force: true });
  mkdirSync(staging, { recursive: true });
  const take = String(extra.take ?? "").replace(/\/+$/, "");
  const skip = new Set(extra.skipExt ?? []);
  const also = new Set(extra.also ?? []);
  try {
    if (extra.archive === "tar.gz") {
      await extractTarGz(file, staging, {
        members: (name) => {
          if (also.has(name)) return path.posix.basename(name);
          if (take && !name.startsWith(`${take}/`)) return null;
          const rel = take ? name.slice(take.length + 1) : name;
          return !rel || skip.has(path.posix.extname(rel)) ? null : rel;
        },
      });
    } else {
      await extractZip(file, unpack);
      const from = take ? path.join(unpack, ...take.split("/")) : unpack;
      const copy = (src, dst) => {
        for (const name of readdirSync(src)) {
          const a = path.join(src, name);
          const b = path.join(dst, name);
          if (isDir(a)) copy(a, b);
          else if (!skip.has(path.extname(name))) {
            mkdirSync(dst, { recursive: true });
            cpSync(a, b);
          }
        }
      };
      if (isDir(from)) copy(from, staging);
      for (const name of also) if (existsSync(path.join(unpack, ...name.split("/")))) cpSync(path.join(unpack, ...name.split("/")), path.join(staging, path.posix.basename(name)));
    }
  } finally {
    rmSync(file, { force: true });
    await rm(unpack, { recursive: true, force: true });
  }
  if (extra.check && !existsSync(path.join(staging, extra.check))) {
    await rm(staging, { recursive: true, force: true });
    throw new RuntimeError(`${extra.name} unpacked without its ${extra.check}`);
  }
  await rm(target, { recursive: true, force: true });
  await renameHeld(staging, target); // retried while an antivirus reads what was just unpacked
  return target;
}
