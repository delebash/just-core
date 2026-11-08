// SPDX-License-Identifier: MIT
// Where this app's FFmpeg is (JustDirect, 2026-11-06 — the kit's TASKS, "JustDirect's six decisions", item 5): the user's
// own when the FFmpeg runtime's `path` setting names one that is there, else the kit's pinned build (runtimes.js
// `ffmpeg`, installed, updated and removed as an engine is — config.js DEFAULT_FFMPEG_BINARIES), else none yet; and a run
// of it (runFfmpeg) through the kit's one spawn seam, so an app never starts a process itself (the family check 21).
import { existsSync } from "node:fs";
import path from "node:path";
import { ApiError } from "../platform/errors.js";
import * as processMod from "./process.js";
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

/**
 * Run this app's FFmpeg with `args` (FFmpeg's own arguments) through the kit's spawn seam (process.js spawnChild: the
 * kill-on-close job, the virus-scanner retry), its output captured (the last 1 MiB). Resolves `{output}` when it exits 0;
 * rejects with its last lines when it doesn't, when `signal` aborts (an AbortError) or after `timeoutMs`. No FFmpeg yet:
 * a 409 `engine-not-installed` (the screens' install offer). `spawn` is a seam for tests (spawnChild's shape).
 * JustDirect, 2026-11-07: a guide video's frames, the film joined.
 */
export async function runFfmpeg(args, { signal = null, timeoutMs = 10 * 60_000, spawn = processMod.spawnChild } = {}) {
  const at = ffmpegExe();
  if (!at) throw new ApiError(409, "engine-not-installed", "FFmpeg isn't installed", "Install FFmpeg on the AI page — the app reads and joins video with it.");
  signal?.throwIfAborted();
  const [proc, job] = await spawn(null, [at.exe, "-hide_banner", "-nostdin", ...args.map(String)], null);
  return new Promise((resolve, reject) => {
    let done = false;
    const end = (fn) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      signal?.removeEventListener("abort", onAbort);
      processMod.closeJob(job);
      fn();
    };
    const stop = () => {
      try {
        proc.kill();
      } catch {
        // gone already
      }
    };
    const onAbort = () => {
      stop();
      end(() => reject(Object.assign(new Error("FFmpeg was stopped"), { name: "AbortError" })));
    };
    const timer = setTimeout(() => {
      stop();
      end(() => reject(new Error(`FFmpeg ran past ${Math.round(timeoutMs / 1000)} s and was stopped`)));
    }, timeoutMs);
    signal?.addEventListener("abort", onAbort, { once: true });
    proc.once("error", (e) => end(() => reject(e)));
    proc.once("close", (code) => {
      const output = String(proc.capturedOutput ?? "");
      end(() =>
        code === 0
          ? resolve({ output })
          : reject(new Error(`FFmpeg failed (exit ${code}): ${output.trim().split(/\r?\n/).slice(-4).join(" · ") || "no output"}`)),
      );
    });
  });
}

/** What FFmpeg needs before the app can run it: "engine-not-on" (the app didn't turn the runtime on),
 *  "engine-not-installed", or "" — with the runtime's status() for the screens' install offer. */
export function ffmpegReadiness() {
  const svc = getRuntimeService("ffmpeg");
  if (!svc) return { ready: false, need: "engine-not-on", engine: null };
  const at = ffmpegExe();
  return { ready: Boolean(at), need: at ? "" : "engine-not-installed", engine: svc.status(), ...(at ? { source: at.source, ownPathMissing: at.ownPathMissing } : {}) };
}
