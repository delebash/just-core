// SPDX-License-Identifier: MIT
// audio.cpp, the kit's speech runtime (round E, 2026-10-29 — JustVoice's engines/audiocpp/runtime.js moved into the kit,
// docs/plans/2026-10-24-engines-the-llama-way.md J1; the user: "One runtime, two kinds", "Yes, the fork's API").
//
// One server process per PLACEMENT and KIND — up to four. Placement: "gpu" runs the installed build on its own backend
// (CUDA, Vulkan, Metal); "cpu" runs the SAME build with `backend: cpu` for the models placed on the CPU (measured at 0 MB
// of graphics memory); a CPU-only build runs only "cpu". Kind: speech ("tts") and speech recognition ("stt") each get
// their own process, so a process's measured memory is its one model's and a crash or restart in one never takes the
// other's model.
//
// A build with the fork's `model_management` starts with no models and `register()`s each one as it loads — so nothing
// downloaded or deleted ever restarts it; an older build's config lists its kind's installed models (`lazy_load`), and a
// change to that list restarts that process on its next use. The servers run headless (`--no-ui`). Programs start only
// through the kit's spawn seam (process.spawnChild: a kill-on-close Job Object on Windows; the leftover sweep elsewhere).
//
// What is the app's, injected by RuntimeService: where its config and logs go, its settings (threads, timeouts), and the
// environment its side programs need (eSpeak NG's library and data, the Japanese dictionary — round E's extras).

import { closeSync, mkdirSync, openSync, readdirSync, readFileSync, readSync, renameSync, statSync, writeFileSync } from "node:fs";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { Mutex, sleep } from "../platform/asyncutil.js";
import * as http from "../platform/http.js";
import { getLogger } from "../platform/log.js";
import * as procs from "../platform/procs.js";
import { isJsonObject, RuntimeError, splitlines, ValueError } from "../platform/py.js";
import { pyJson } from "../platform/pyjson.js";
import * as kitProcess from "./process.js";

const log = getLogger("llm_runner.runner.audiocpp");

export const PLACEMENTS = Object.freeze(["gpu", "cpu"]);
export const KINDS = Object.freeze(["tts", "stt"]);
export const LOG_ROTATE_BYTES = 10 * 1024 * 1024;

// A staged build must start before it replaces a working one: headless, no models, and --version LAST (arguments parse in
// order and it exits there — JustVoice's runtime.install probe).
export const AUDIOCPP_PROBE_ARGVS = Object.freeze([Object.freeze(["--no-ui", "--max-loaded-models", "0", "--version"])]);

// The variables the runtime's environment sets for its side programs — part of a process's signature, so installing or
// removing one starts it again with them. An inherited value is never passed on.
export const RUNTIME_ENV = Object.freeze(["AUDIOCPP_ESPEAK_LIBRARY", "AUDIOCPP_ESPEAK_DATA", "AUDIOCPP_UNIDIC_DIR"]);

/** The process environment: this one's, minus any inherited runtime variable, plus `extra` (`envFn()`'s). */
export function childEnv(extra = {}) {
  const env = { ...process.env };
  for (const key of RUNTIME_ENV) {
    for (const k of Object.keys(env)) if (k.toUpperCase() === key) delete env[k];
  }
  for (const [k, v] of Object.entries(extra || {})) if (v != null && v !== "") env[k] = String(v);
  return env;
}

let cores = null;
/** This machine's physical core count — the CPU process's default thread count (the logical count when it can't
 *  tell). Detected once: Windows' processors' NumberOfCores, macOS `hw.physicalcpu`, Linux /proc/cpuinfo's cores. */
export async function physicalCores() {
  if (cores !== null) return cores;
  let n = null;
  try {
    if (process.platform === "win32") {
      const r = await procs.run(
        ["powershell", "-NoProfile", "-NonInteractive", "-Command", "(Get-CimInstance Win32_Processor | Measure-Object -Property NumberOfCores -Sum).Sum"],
        { timeout: 20 },
      );
      n = Number.parseInt(String(r.stdout).trim(), 10);
    } else if (process.platform === "darwin") {
      n = Number.parseInt(String((await procs.run(["sysctl", "-n", "hw.physicalcpu"], { timeout: 10 })).stdout).trim(), 10);
    } else {
      const seen = new Set();
      let phys = "";
      for (const line of readFileSync("/proc/cpuinfo", "utf8").split("\n")) {
        const [k, v] = line.split(":").map((x) => (x ?? "").trim());
        if (k === "physical id") phys = v;
        else if (k === "core id") seen.add(`${phys}/${v}`);
      }
      n = seen.size;
    }
  } catch {
    n = null;
  }
  cores = n > 0 ? n : Math.max(1, os.availableParallelism?.() || os.cpus().length || 1);
  return cores;
}

/** eSpeak NG's `[library, dataFolder]` in its folder (an extra unpacked beside the build), or null. */
export function espeakPaths(dir) {
  let names;
  try {
    names = readdirSync(dir);
  } catch {
    return null;
  }
  const lib = names.find((n) => [".dll", ".so", ".dylib"].includes(path.extname(n)) || n.includes(".so."));
  const data = path.join(dir, "espeak-ng-data");
  try {
    if (lib && statSync(data).isDirectory()) return [path.join(dir, lib), data];
  } catch {
    // no data folder
  }
  return null;
}

/** The environment audio.cpp's side programs need, from what is installed: eSpeak NG (`espeakDir`) — Kokoro reads its
 *  library and data ONLY from these variables — and the Japanese dictionary (`unidicDir`, MeCab's). */
export function sideEnv({ espeakDir = null, unidicDir = null } = {}) {
  const env = {};
  const found = espeakDir ? espeakPaths(espeakDir) : null;
  if (found) [env.AUDIOCPP_ESPEAK_LIBRARY, env.AUDIOCPP_ESPEAK_DATA] = found;
  if (unidicDir) env.AUDIOCPP_UNIDIC_DIR = unidicDir;
  return env;
}

/** The backend a build runs: its folder's gpu name (`…/<build>/<gpu>/audiocpp_server`) as audio.cpp names backends. */
/** A WAV's length in seconds from its header (its data chunk over the fmt chunk's byte rate), or null when it isn't
 *  one (JustVoice's manager.js _wavSeconds). */
export function wavSeconds(data) {
  const b = Buffer.from(data ?? []);
  if (b.length < 12 || b.toString("latin1", 0, 4) !== "RIFF" || b.toString("latin1", 8, 12) !== "WAVE") return null;
  let i = 12;
  let rate = null;
  let size = null;
  while (i + 8 <= b.length) {
    const cid = b.toString("latin1", i, i + 4);
    const n = b.readUInt32LE(i + 4);
    if (cid === "fmt " && i + 20 <= b.length) rate = b.readUInt32LE(i + 16);
    else if (cid === "data") {
      size = Math.min(n, b.length - i - 8);
      break;
    }
    i += 8 + n + (n & 1);
  }
  return rate && size ? size / rate : null;
}

/** A transcription request's audio length in seconds — its `wav_b64` or its `audio_path` — or null. */
export function inputSeconds(body) {
  try {
    if (body?.audio_path) return wavSeconds(readFileSync(body.audio_path));
    if (body?.wav_b64) return wavSeconds(Buffer.from(String(body.wav_b64), "base64"));
  } catch {
    return null;
  }
  return null;
}

export function backendOf(exe) {
  const gpu = path.basename(path.dirname(String(exe))).toLowerCase();
  if (gpu.startsWith("cuda")) return "cuda";
  if (["vulkan", "metal", "cpu"].includes(gpu)) return gpu;
  return "cpu";
}

/** One model as a server config's (or a registration's) row; `sessionOptions` sorted `[key, value]` pairs. */
export class ModelEntry {
  constructor(id, family, task, filePath, sessionOptions = []) {
    this.id = id;
    this.family = family; // audio.cpp's family ("qwen3_tts", "chatterbox", …)
    this.task = task; // "tts" | "clon" | "vdes" | "asr" | "align"
    this.path = filePath;
    this.sessionOptions = sessionOptions;
    Object.freeze(this);
  }

  toConfig() {
    const row = { id: this.id, family: this.family, task: this.task, mode: "offline", path: this.path };
    if (this.sessionOptions.length) row.session_options = Object.fromEntries(this.sessionOptions);
    return row;
  }
}

/** An audio.cpp request failed; the message is the server's own words. `status`: its HTTP status — 503 for out of
 *  memory or busy, 400 for a bad request, 500 otherwise — and 503 when the process stopped answering. */
export class AudioCppError extends RuntimeError {
  constructor(message, status = 500) {
    super(message);
    this.name = "AudioCppError";
    this.status = status;
  }
}

/** A free loopback port. */
export function freePort() {
  return new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.unref();
    srv.on("error", reject);
    srv.listen(0, "127.0.0.1", () => {
      const { port } = srv.address();
      srv.close(() => resolve(port));
    });
  });
}

/** A response read whole: `{status, headers (lower-case keys), content (Buffer), text, json()}`. */
export function responseOf(status, content = Buffer.alloc(0), headers = {}) {
  const buf = Buffer.isBuffer(content) ? content : Buffer.from(content);
  return {
    status,
    headers,
    content: buf,
    get text() {
      return buf.toString("utf8");
    },
    json() {
      return JSON.parse(buf.toString("utf8"));
    },
  };
}

// The request keys always sent as floats (`1.0`, not `1`) — audio.cpp's specs read them as numbers with a point.
export const FLOAT_KEYS = Object.freeze(
  new Set([
    "speed", "temperature", "top_p", "repetition_penalty", "subtalker_temperature", "subtalker_top_p",
    "exaggeration", "guidance_scale", "min_p", "s3gen_cfg_rate", "retry_badcase_ratio_threshold",
  ]),
);
/** A JSON body: compact, UTF-8, floats where the speech spec wants them. */
export const jsonBody = (v) => Buffer.from(pyJson(v, { separators: [",", ":"], ensureAscii: false, floats: FLOAT_KEYS }), "utf8");

const isTimeout = (e) =>
  e?.name === "TimeoutError" || e?.name === "AbortError" || e?.cause?.name === "TimeoutError" || /timeout/i.test(String(e?.cause?.code ?? ""));

/** A log over 10 MB becomes `<name>.1.log` (replacing the one before) as its process starts; a log another process
 *  still holds is left for the next start. */
export function rotateLog(logPath, limit = LOG_ROTATE_BYTES) {
  try {
    if (statSync(logPath).isFile() && statSync(logPath).size > limit) {
      const p = String(logPath);
      const ext = path.extname(p);
      renameSync(p, `${ext ? p.slice(0, -ext.length) : p}.1.log`);
    }
  } catch {
    // missing, or held by another process — next start
  }
}

/**
 * One server process — a placement ("gpu" | "cpu") for one kind of model ("tts" | "stt"). Every method may start it;
 * one start at a time. `dirs`: `{configDir, logDir}`; `settingsFn()` → the runtime's settings (`gpu_threads`,
 * `cpu_threads`, `start_timeout_s`, `request_timeout_s`); `envFn()` → the side programs' variables (RUNTIME_ENV).
 */
export class AudioCppServer {
  constructor({ placement = "gpu", kind = "tts", configDir, logDir, settingsFn = () => ({}), envFn = () => ({}), spawn = kitProcess.spawnChild }) {
    if (!PLACEMENTS.includes(placement)) throw new ValueError(`unknown placement '${placement}'`);
    if (!KINDS.includes(kind)) throw new ValueError(`unknown kind '${kind}'`);
    this.placement = placement;
    this.kind = kind;
    this._configDir = configDir;
    this._logDir = logDir;
    this._settingsFn = settingsFn;
    this._envFn = envFn;
    this._spawn = spawn;
    this._lock = new Mutex();
    this._run = null;
  }

  /** The process's file names — the gpu speech process keeps the names it always had in JustVoice. */
  fileStem() {
    const stem = this.placement === "gpu" ? "audiocpp-server" : `audiocpp-server-${this.placement}`;
    return this.kind === "tts" ? stem : `${stem}-${this.kind}`;
  }

  _setting(name, dflt) {
    const v = Number(this._settingsFn()?.[name]);
    return Number.isFinite(v) && v > 0 ? v : dflt;
  }

  /** How long a start may take, and one request (a line, a model load), in seconds. */
  startTimeout() {
    return this._setting("start_timeout_s", 60);
  }

  requestTimeout() {
    return this._setting("request_timeout_s", 900);
  }

  /**
   * Running with this configuration (restarted if it changed). `managed`: the build registers models at run time
   * (`model_management`), so the config lists none and `register` adds each as it loads. Otherwise the config lists
   * `models` and a change to the list restarts it. `backend` overrides the build's own (the "cpu" process runs a GPU
   * build on the CPU); `device` the card; `threads` the process's CPU threads.
   */
  async ensure(exe, models, { device = 0, threads = 4, backend = null, managed = false } = {}) {
    const sorted = [...models].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
    const conf = {
      host: "127.0.0.1",
      backend: backend || backendOf(exe),
      device,
      threads,
      lazy_load: true,
      max_loaded_models: 0,
      models: managed ? [] : sorted.map((m) => m.toConfig()),
    };
    if (managed) conf.model_management = true;
    const env = childEnv(this._envFn());
    const signature = pyJson({ exe: String(exe), ...conf, env: Object.fromEntries(RUNTIME_ENV.map((k) => [k, env[k] ?? null])) }, { sortKeys: true });
    await this._lock.run(async () => {
      if (this._run && this._run.signature === signature && kitProcess.pollProc(this._run.proc) === null) return;
      await this._stopUnlocked();
      const port = await freePort();
      mkdirSync(this._configDir, { recursive: true });
      const confPath = path.join(this._configDir, `${this.fileStem()}.json`);
      writeFileSync(confPath, pyJson({ ...conf, port }, { indent: 1 }).replaceAll("\n", os.EOL), "utf8");
      const logPath = path.join(this._logDir, `${this.fileStem()}.log`);
      mkdirSync(path.dirname(logPath), { recursive: true });
      rotateLog(logPath);
      // its working folder is the build's own (its DLLs beside it), its environment the side programs'
      const popen = (argv, opts) => procs.popen(argv, { ...opts, cwd: path.dirname(String(exe)), env });
      const [proc, job] = await this._spawn(popen, [String(exe), "--config", confPath, "--no-ui"], logPath);
      this._run = { proc, port, signature, logPath, models: managed ? new Map() : new Map(models.map((m) => [m.id, m])), job, managed };
      try {
        await this._waitHealthy();
      } catch (e) {
        // a process that didn't come up is never recorded as running — the next `ensure` would take it for healthy
        if (e instanceof AudioCppError) await this._stopUnlocked();
        throw e;
      }
      log.info(
        `audio.cpp (${this.placement} ${this.kind}) up on :${port} (pid ${proc.pid}, ${conf.backend}, ${threads} threads, ` +
          `${managed ? "models registered as they load" : `${models.length} models`})`,
      );
    });
  }

  async _waitHealthy(timeout = null) {
    timeout = timeout == null ? this.startTimeout() : timeout;
    const run = this._run;
    const deadline = performance.now() / 1000 + timeout;
    while (performance.now() / 1000 < deadline) {
      const rc = kitProcess.pollProc(run.proc);
      if (rc !== null) throw new AudioCppError(`audio.cpp exited with ${rc}: ${this.logTail()}`);
      try {
        const r = await http.fetch(`http://127.0.0.1:${run.port}/health`, { timeoutMs: 2000 });
        await r.arrayBuffer().catch(() => {});
        if (r.status === 200) return;
      } catch {
        // not up yet
      }
      await sleep(250);
    }
    throw new AudioCppError(`audio.cpp did not answer within ${timeout.toFixed(0)}s: ${this.logTail()}`);
  }

  /** Stop the process (waits for a start in progress). */
  async stop() {
    await this._lock.run(() => this._stopUnlocked());
  }

  async _stopUnlocked() {
    const run = this._run;
    this._run = null;
    if (run === null) return;
    if (kitProcess.pollProc(run.proc) === null) {
      try {
        run.proc.kill();
      } catch {
        // already gone
      }
      if ((await kitProcess.waitExit(run.proc, 10)) === null) {
        try {
          run.proc.kill("SIGKILL");
        } catch {
          // already gone
        }
        await kitProcess.waitExit(run.proc, 10);
      }
    }
    kitProcess.closeJob(run.job);
  }

  /** Kill without waiting — the process-exit last resort. */
  killSync() {
    const run = this._run;
    if (run && kitProcess.pollProc(run.proc) === null) {
      try {
        run.proc.kill("SIGKILL");
      } catch {
        // already gone
      }
    }
  }

  isRunning() {
    return this._run !== null && kitProcess.pollProc(this._run.proc) === null;
  }

  get pid() {
    return this.isRunning() ? this._run.proc.pid : null;
  }

  /** Listed in the config, or registered with a managed process. */
  hasModel(modelId) {
    return this._run !== null && this._run.models.has(modelId);
  }

  get managed() {
    return this._run !== null && this._run.managed;
  }

  /** Register `entry` with a managed process and load it now (`POST /v1/models/load` — the fork's model_management). A
   *  registered model is loaded again if it was unloaded, and reloaded with its new options if they changed. */
  async register(entry, timeout = null) {
    await this._post("/v1/models/load", { json: entry.toConfig(), timeout: timeout || this.requestTimeout() });
    if (this._run !== null) this._run.models.set(entry.id, entry);
  }

  /** The log's last lines (its debug and timing lines left out). */
  logTail(lines = 12) {
    if (this._run === null) return "";
    let text;
    try {
      const fd = openSync(this._run.logPath, "r");
      try {
        const size = statSync(this._run.logPath).size;
        const start = Math.max(0, size - 65536);
        const buf = Buffer.alloc(size - start);
        let got = 0;
        while (got < buf.length) {
          const n = readSync(fd, buf, got, buf.length - got, start + got);
          if (n === 0) break;
          got += n;
        }
        text = buf.subarray(0, got).toString("utf8");
      } finally {
        closeSync(fd);
      }
    } catch {
      return "";
    }
    return splitlines(text)
      .filter((ln) => !ln.includes("SERVER_HTTP_DEBUG") && !ln.includes("TIMING"))
      .slice(-lines)
      .join("\n");
  }

  _url(p) {
    if (!this.isRunning()) throw new AudioCppError("audio.cpp is not running");
    return `http://127.0.0.1:${this._run.port}${p}`;
  }

  /** Throw the server's own words, with its status, for a ≥ 400 answer. */
  static raiseFor(r) {
    if (r.status < 400) return;
    let body;
    try {
      body = r.json();
    } catch {
      body = null;
    }
    const err = isJsonObject(body) ? body.error : undefined;
    const msg = (isJsonObject(err) ? err.message : err) || r.text;
    throw new AudioCppError(String(msg).slice(0, 500), r.status);
  }

  /** POST to the running process; a dropped connection or a timeout is an AudioCppError (503) naming it, with the
   *  log's last lines. `json` (a body) or `form` (a multipart body); `floats` sends FLOAT_KEYS as floats. */
  async post(p, { json = undefined, form = undefined, timeout = null, floats = false } = {}) {
    const limit = timeout || this.requestTimeout();
    const init = { method: "POST", timeoutMs: limit * 1000 };
    if (form !== undefined) {
      init.body = form.body;
      init.headers = { "content-type": form.contentType };
    } else if (json !== undefined) {
      init.body = floats ? jsonBody(json) : Buffer.from(pyJson(json, { separators: [",", ":"], ensureAscii: false }), "utf8");
      init.headers = { "content-type": "application/json" };
    }
    let r;
    try {
      const res = await http.fetch(this._url(p), init);
      r = responseOf(res.status, Buffer.from(await res.arrayBuffer()), Object.fromEntries(res.headers));
    } catch (e) {
      if (e instanceof AudioCppError) throw e;
      if (isTimeout(e)) throw new AudioCppError(`the speech runtime did not answer within ${Number(limit).toFixed(0)} s`, 503);
      const tail = this.logTail(4);
      const kind = e?.cause?.code ?? e?.cause?.name ?? e?.name ?? "Error";
      throw new AudioCppError(`the speech runtime stopped answering (${kind})${tail ? `: ${tail}` : ""}`, 503);
    }
    AudioCppServer.raiseFor(r);
    return r;
  }

  // (JustVoice called it `_post`.)
  _post(p, opts) {
    return this.post(p, opts);
  }

  /** Speech: `[wavBytes, headers]`. */
  async speech(body, timeout = null) {
    const r = await this.post("/v1/audio/speech", { json: body, timeout, floats: true });
    return [r.content, { ...r.headers }];
  }

  /** Transcription with its details (segments, words). */
  async transcribe(body, timeout = null) {
    return (await this.post("/v1/audio/transcriptions/details", { json: body, timeout })).json();
  }

  /** Forced alignment of `text` against a WAV. */
  async align(model, wav, text, language, timeout = null) {
    const form = http.multipart([
      { name: "model", data: Buffer.from(String(model), "utf8") },
      { name: "text", data: Buffer.from(String(text), "utf8") },
      { name: "language", data: Buffer.from(String(language), "utf8") },
      { name: "file", filename: "audio.wav", contentType: "audio/wav", data: Buffer.from(wav) },
    ]);
    return (await this.post("/v1/audio/alignments", { form, timeout })).json();
  }

  async unload(modelIds) {
    if (!this.isRunning() || !modelIds.length) return;
    await this.post("/v1/tasks/unload_models", { json: { model_ids: modelIds }, timeout: 120 });
  }

  async unloadAll() {
    if (!this.isRunning()) return;
    await this.post("/v1/tasks/unload_all_models", { timeout: 120 });
  }
}

/** A runtime's servers, one per placement and kind, created on first use (not started). */
export class AudioCppPool {
  constructor(opts) {
    this._opts = opts; // AudioCppServer's options but placement/kind
    this._servers = new Map(); // "placement/kind" → AudioCppServer
  }

  get(placement = "gpu", kind = "tts") {
    const key = `${placement}/${kind}`;
    let srv = this._servers.get(key);
    if (srv === undefined) {
      srv = new AudioCppServer({ ...this._opts, placement, kind });
      this._servers.set(key, srv);
    }
    return srv;
  }

  /** Every server created so far for `placement` (null: all), cpu before gpu, speech first. */
  servers(placement = null) {
    return [...this._servers.values()]
      .filter((s) => placement == null || s.placement === placement)
      .sort((a, b) => (a.placement < b.placement ? -1 : a.placement > b.placement ? 1 : KINDS.indexOf(a.kind) - KINDS.indexOf(b.kind)));
  }

  /** Stop the servers of one placement and/or kind; null: every one. */
  async stop(placement = null, kind = null) {
    for (const srv of this.servers(placement)) if (kind == null || srv.kind === kind) await srv.stop();
  }

  /** Kill every running server without waiting — for process exit. */
  killAllSync() {
    for (const srv of this._servers.values()) srv.killSync();
  }
}
