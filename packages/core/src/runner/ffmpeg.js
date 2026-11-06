// SPDX-License-Identifier: MIT
// Where this app's FFmpeg is (JustDirect, 2026-11-06 — the kit's TASKS, "JustDirect's six decisions", item 5): the user's
// own when the FFmpeg runtime's `path` setting names one that is there, else the kit's pinned build (runtimes.js
// `ffmpeg`, installed, updated and removed as an engine is — config.js DEFAULT_FFMPEG_BINARIES), else none yet. The app
// runs it itself; this only says where it is and what is missing.
import { existsSync } from "node:fs";
import path from "node:path";
import { getRuntimeService } from "./runtime_service.js";

const exeName = (name, exe) => (path.extname(String(exe)).toLowerCase() === ".exe" ? `${name}.exe` : name);

/**
 * `{exe, ffprobe, source, ownPathMissing}` — `source` "user" (the `path` setting) or "kit" (the pinned build), `ffprobe`
 * the ffprobe beside it when there is one (gyan.dev's Windows build has it; the macOS and Linux zips are ffmpeg alone),
 * `ownPathMissing` a set path that isn't there (the kit's build stands in) — or null: this app has no FFmpeg yet (the
 * runtime not turned on, or not installed and no path of the user's).
 */
export function ffmpegExe() {
  const svc = getRuntimeService("ffmpeg");
  if (!svc) return null;
  const own = String(svc.setting("path") ?? "").trim();
  const found = (exe, source) => {
    const probe = path.join(path.dirname(exe), exeName("ffprobe", exe));
    return { exe, ffprobe: existsSync(probe) ? probe : null, source, ownPathMissing: Boolean(own) && source !== "user" };
  };
  if (own && existsSync(own)) return found(own, "user");
  const exe = svc.installedExe();
  return exe ? found(String(exe), "kit") : null;
}

/** What FFmpeg needs before the app can run it: "engine-not-on" (the app didn't turn the runtime on),
 *  "engine-not-installed", or "" — with the runtime's status() for the screens' install offer. */
export function ffmpegReadiness() {
  const svc = getRuntimeService("ffmpeg");
  if (!svc) return { ready: false, need: "engine-not-on", engine: null };
  const at = ffmpegExe();
  return { ready: Boolean(at), need: at ? "" : "engine-not-installed", engine: svc.status(), ...(at ? { source: at.source, ownPathMissing: at.ownPathMissing } : {}) };
}
