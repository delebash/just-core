// SPDX-License-Identifier: MIT
// audio.cpp's server processes in the kit (round E, 2026-10-29 — JustVoice's engines/audiocpp/runtime.js moved in): one
// process per placement and kind, started from a generated config (`--config <file> --no-ui`) in its build's folder with
// the side programs' environment, restarted when that changes, models registered into it (the fork's model_management).
// The spawn is faked: a tiny server reads the config it was given and answers on its port, as audio.cpp does.
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import http from "node:http";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, expect, test } from "vitest";
import { AudioCppError, AudioCppPool, AudioCppServer, backendOf, childEnv, ModelEntry, rotateLog } from "../src/runner/audiocpp.js";

const started = [];
afterEach(async () => {
  for (const s of started.splice(0)) await new Promise((r) => s.close(() => r()));
});

/** A spawn that stands in for audiocpp_server: it reads `--config`, listens on its port, answers /health and the
 *  registration route, and records what it was started with. */
function fakeSpawn(record) {
  return async (popen, argv, logPath) => {
    const conf = JSON.parse(readFileSync(argv[argv.indexOf("--config") + 1], "utf8"));
    const calls = [];
    const srv = http.createServer((req, res) => {
      let body = "";
      req.on("data", (d) => {
        body += d;
      });
      req.on("end", () => {
        calls.push([req.method, req.url, body]);
        if (req.url === "/v1/models/load" && JSON.parse(body).id === "broken") {
          res.writeHead(503, { "content-type": "application/json" });
          return res.end(JSON.stringify({ error: { message: "out of memory" } }));
        }
        res.writeHead(200, { "content-type": "application/json" });
        res.end("{}");
      });
    });
    await new Promise((r) => srv.listen(conf.port, "127.0.0.1", r));
    started.push(srv);
    const proc = {
      pid: 4000 + record.length,
      exitCode: null,
      kill: () => {
        proc.exitCode = 0;
        srv.close();
      },
      once: (ev, fn) => (ev === "exit" ? setTimeout(fn, 0) : null),
    };
    record.push({ argv, conf, logPath, calls, cwdEnv: popen });
    return [proc, null];
  };
}

test("a model's config row; the backend a build runs; the environment carries only the side programs' own values", () => {
  expect(new ModelEntry("kokoro", "kokoro", "tts", "/c/k.gguf", [["kokoro.voice", "af"]]).toConfig()).toEqual({
    id: "kokoro", family: "kokoro", task: "tts", mode: "offline", path: "/c/k.gguf", session_options: { "kokoro.voice": "af" },
  });
  expect(backendOf("/cache/audiocpp/v0.9.2-jv.6/cuda12/audiocpp_server.exe")).toBe("cuda");
  expect(backendOf("/cache/audiocpp/v0.9.2-jv.6/vulkan/audiocpp_server")).toBe("vulkan");
  expect(backendOf("/cache/audiocpp/v0.9.2-jv.6/cpu/audiocpp_server")).toBe("cpu");
  process.env.AUDIOCPP_ESPEAK_DATA = "/inherited"; // an inherited value is never passed on
  const env = childEnv({ AUDIOCPP_ESPEAK_LIBRARY: "/x/libespeak-ng.dll", AUDIOCPP_UNIDIC_DIR: "" });
  delete process.env.AUDIOCPP_ESPEAK_DATA;
  expect(env.AUDIOCPP_ESPEAK_LIBRARY).toBe("/x/libespeak-ng.dll");
  expect("AUDIOCPP_ESPEAK_DATA" in env).toBe(false);
  expect("AUDIOCPP_UNIDIC_DIR" in env).toBe(false);
});

test("a log over its limit becomes <name>.1.log as its process starts", () => {
  const dir = mkdtempSync(path.join(tmpdir(), "kit-ac-log-"));
  const p = path.join(dir, "audiocpp-server.log");
  writeFileSync(p, "x".repeat(20));
  rotateLog(p, 10);
  expect(readFileSync(path.join(dir, "audiocpp-server.1.log"), "utf8")).toHaveLength(20);
});

test("the pool: one server per placement and kind, cpu before gpu, speech first; their files keep JustVoice's names", () => {
  const pool = new AudioCppPool({ configDir: "/c", logDir: "/l" });
  pool.get("gpu", "stt");
  pool.get("gpu", "tts");
  pool.get("cpu", "tts");
  expect(pool.servers().map((s) => `${s.placement}/${s.kind}`)).toEqual(["cpu/tts", "gpu/tts", "gpu/stt"]);
  expect(pool.get("gpu", "tts")).toBe(pool.get("gpu", "tts"));
  expect(pool.servers().map((s) => s.fileStem())).toEqual(["audiocpp-server-cpu", "audiocpp-server", "audiocpp-server-stt"]);
  expect(() => pool.get("npu", "tts")).toThrow(/placement/);
});

test("a managed start: its config, folder and environment; the same start again keeps it; a changed environment restarts it; a model registers", async () => {
  const dir = mkdtempSync(path.join(tmpdir(), "kit-ac-run-"));
  const record = [];
  let env = { AUDIOCPP_ESPEAK_LIBRARY: "/espeak/lib" };
  const srv = new AudioCppServer({
    placement: "cpu",
    kind: "tts",
    configDir: path.join(dir, "config"),
    logDir: path.join(dir, "logs"),
    settingsFn: () => ({ start_timeout_s: 10, request_timeout_s: 10 }),
    envFn: () => env,
    spawn: fakeSpawn(record),
  });
  const exe = path.join(dir, "audiocpp", "v0.9.2-jv.6", "cuda12", "audiocpp_server.exe");
  await srv.ensure(exe, [], { device: 0, threads: 8, backend: "cpu", managed: true });
  expect(srv.isRunning()).toBe(true);
  expect(record).toHaveLength(1);
  expect(record[0].argv.slice(-3)).toEqual(["--config", path.join(dir, "config", "audiocpp-server-cpu.json"), "--no-ui"]);
  expect(record[0].conf).toMatchObject({ host: "127.0.0.1", backend: "cpu", threads: 8, models: [], model_management: true, max_loaded_models: 0 });
  expect(record[0].logPath).toBe(path.join(dir, "logs", "audiocpp-server-cpu.log"));

  await srv.ensure(exe, [], { device: 0, threads: 8, backend: "cpu", managed: true });
  expect(record).toHaveLength(1); // the same signature: kept

  env = { AUDIOCPP_ESPEAK_LIBRARY: "/espeak/lib", AUDIOCPP_UNIDIC_DIR: "/unidic" }; // the dictionary installed
  await srv.ensure(exe, [], { device: 0, threads: 8, backend: "cpu", managed: true });
  expect(record).toHaveLength(2);

  await srv.register(new ModelEntry("kokoro", "kokoro", "tts", "/m/k.gguf"));
  expect(srv.hasModel("kokoro")).toBe(true);
  expect(record[1].calls.find(([, u]) => u === "/v1/models/load")[2]).toContain('"id":"kokoro"');
  await expect(srv.register(new ModelEntry("broken", "kokoro", "tts", "/m/b.gguf"))).rejects.toMatchObject({ name: "AudioCppError", status: 503, message: "out of memory" });
  expect(srv.hasModel("broken")).toBe(false);
  await srv.stop();
  expect(srv.isRunning()).toBe(false);
  expect(new AudioCppError("x")).toBeInstanceOf(Error);
});

// RuntimeService for a runtime whose models are registered (round E, E2): a model and its companions go into its
// kind's server on a placement, from its row's spec and files; the kind's previous model leaves first; speech and
// transcription keep their own processes; a model moving placement leaves the old one; an older build is refused.
test("loadModel registers a model and its companions in its kind's server; one model per kind; an old build is refused", async () => {
  const { DEFAULT_AUDIOCPP_BUILD } = await import("../src/runner/config.js");
  const { RuntimeService } = await import("../src/runner/runtime_service.js");
  const dir = mkdtempSync(path.join(tmpdir(), "kit-ac-svc-"));
  let pin = DEFAULT_AUDIOCPP_BUILD;
  const svc = new RuntimeService({
    id: "audiocpp",
    cacheRoot: dir,
    configFn: () => ({ id: "audiocpp", pinnedBuild: pin, binaries: [], settings: { gpu: 0, gpu_threads: 4, cpu_threads: 6, backend: "auto", start_timeout_s: 10, request_timeout_s: 10 } }),
    hardwareFn: () => ({ platform: "windows", gpus: [], runtimes: {} }),
    logDir: path.join(dir, "logs"),
    stateDir: path.join(dir, "state"),
  });
  const record = [];
  svc._pool = new AudioCppPool({ configDir: path.join(dir, "config"), logDir: path.join(dir, "logs"), settingsFn: () => ({ start_timeout_s: 10, request_timeout_s: 10 }), envFn: () => svc.extrasEnv(), spawn: fakeSpawn(record) });
  svc.installedExe = () => path.join(dir, "audiocpp", pin, "cuda12", "audiocpp_server.exe");
  svc.extrasEnv = () => ({ AUDIOCPP_ESPEAK_LIBRARY: "/espeak/lib", AUDIOCPP_ESPEAK_DATA: "/espeak/data" });
  const rows = {
    kitten: { id: "kitten", kind: "tts", spec: { family: "kitten_tts", task: "tts", espeak: true, sessionOptions: { "kitten_tts.speed": "1" } } },
    mio: { id: "mio", kind: "tts", spec: { family: "miotts", task: "tts", sessionFiles: { "miotts.codec_path": "codec" }, companions: [{ role: "codec", family: "mio_codec", task: "tts", slot: "codec" }] } },
    parakeet: { id: "parakeet", kind: "stt", spec: { family: "parakeet_tdt", task: "asr" } },
  };
  svc._model = (id) => rows[id];
  svc.modelFor = (id) => ({ key: id, files: { model: `/m/${id}.gguf`, codec: `/m/${id}-codec.gguf` } });

  // a model with eSpeak's paths and the user's own option, on the card
  expect(await svc.loadModel("kitten", { sessionOptions: { "kitten_tts.voice": "bella" } })).toEqual({ modelId: "kitten", placement: "gpu", kind: "tts" });
  const loads = (i) => record[i].calls.filter(([, u]) => u === "/v1/models/load").map(([, , b]) => JSON.parse(b));
  expect(loads(0)[0]).toMatchObject({
    id: "kitten", family: "kitten_tts", task: "tts", path: "/m/kitten.gguf",
    session_options: { "kitten_tts.espeak_library_path": "/espeak/lib", "kitten_tts.espeak_data_path": "/espeak/data", "kitten_tts.speed": "1", "kitten_tts.voice": "bella" },
  });
  expect(record[0].conf).toMatchObject({ threads: 4, model_management: true });

  // the kind's next model: the first leaves, the new one and its companion register (a file as an option)
  await svc.loadModel("mio");
  expect(record[0].calls.some(([, u, b]) => u === "/v1/tasks/unload_models" && JSON.parse(b).model_ids.includes("kitten"))).toBe(true);
  expect(loads(0).slice(1).map((e) => e.id)).toEqual(["mio", "mio::codec"]);
  expect(loads(0)[1].session_options["miotts.codec_path"]).toBe("/m/mio-codec.gguf");

  // transcription: its own process; speech's model stays
  await svc.loadModel("parakeet", { placement: "cpu" });
  expect(record).toHaveLength(2);
  expect(record[1].conf).toMatchObject({ backend: "cpu", threads: 6 });
  expect(svc.loaded().map((l) => `${l.modelId}@${l.placement}`).sort()).toEqual(["mio@gpu", "parakeet@cpu"]);
  expect(svc.serverFor("parakeet")).toBe(svc._pool.get("cpu", "stt"));

  // moving speech's model to the CPU: it leaves the card's process first
  await svc.loadModel("mio", { placement: "cpu" });
  expect(record[0].calls.some(([, u, b]) => u === "/v1/tasks/unload_models" && JSON.parse(b).model_ids.includes("mio"))).toBe(true);
  expect(svc.loaded().find((l) => l.modelId === "mio").placement).toBe("cpu");

  expect(await svc.unloadModel("parakeet")).toBe(true);
  expect(await svc.unloadModel("parakeet")).toBe(false);
  expect(() => svc.serverFor("parakeet")).toThrow(/isn't loaded/);

  // a build without model_management can't load while it runs
  pin = "v0.9.0";
  await expect(svc.loadModel("kitten")).rejects.toMatchObject({ need: { reason: "update-engine" } });
  await svc.stopServer();
  expect(svc.loaded()).toEqual([]);
});
