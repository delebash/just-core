// SPDX-License-Identifier: MIT
// An engine's development build in place of the installed one — the family's one way an app's `npm run dev` runs a
// checkout of our fork (moved here 2026-11-08 from JustVoice's engines/audiocpp/dev_build.js and JustDirect's
// dev_builds.js, the same job twice), handed to installLlm's `runtimeExeOverrides`:
//
//   installLlm({ …, runtimeExeOverrides: devBuildOverrides({ sdcpp: "JUST_DIRECT_SDCPP_BUILD" }) })
//
// The app names the build's bin folder in a variable of its own; the kit knows each engine's server program and the
// CMake switches that say its backend (the build's own CMakeCache.txt, one folder up from bin). Its version: the build
// script's info file when the app names one (JustVoice's scripts/audiocpp-dev.js writes jv-dev-build.json: commit,
// dirty, source), else the checkout's git files — read, never run (no process here: the guard's check 21). A packaged
// app ignores the variable (data_paths' `frozen`).
import { existsSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { runtime as dataRuntime } from "../platform/data_paths.js";
import { getLogger } from "../platform/log.js";

const log = getLogger("llm_runner.runner.dev_build");
const warned = new Set();
const exe = (name) => (process.platform === "win32" ? `${name}.exe` : name);

/** Each engine a development build can stand in for: its server program and its CMake cache's backend switches (the
 *  first one ON wins; none: the CPU). */
export const DEV_ENGINES = Object.freeze({
  sdcpp: { server: exe("sd-server"), backends: [["SD_CUDA", "cuda"], ["SD_VULKAN", "vulkan"], ["SD_METAL", "metal"], ["SD_HIPBLAS", "rocm"]] },
  audiocpp: {
    server: exe("audiocpp_server"),
    backends: [["ENGINE_ENABLE_CUDA", "cuda"], ["ENGINE_ENABLE_VULKAN", "vulkan"], ["ENGINE_ENABLE_METAL", "metal"], ["GGML_METAL", "metal"]],
  },
});

const isFile = (p) => {
  try {
    return statSync(p).isFile();
  } catch {
    return false;
  }
};
const read = (p) => {
  try {
    return readFileSync(p, "utf8");
  } catch {
    return "";
  }
};

/** The backend a build was made for, from its CMake cache's ON switches; "cpu" when none. */
export function backendOf(cacheText, backends) {
  const on = new Set(
    String(cacheText || "")
      .split(/\r?\n/)
      .filter((l) => l.endsWith(":BOOL=ON"))
      .map((l) => l.split(":", 1)[0]),
  );
  return backends.find(([key]) => on.has(key))?.[1] ?? "cpu";
}

/** The checkout's commit (short) from its git files — HEAD, its branch's ref or packed-refs — or "". */
export function commitOf(repo) {
  const git = path.join(repo, ".git");
  const head = read(path.join(git, "HEAD")).trim();
  if (/^[0-9a-f]{40}$/.test(head)) return head.slice(0, 7);
  const ref = head.match(/^ref: (.+)$/)?.[1];
  if (!ref) return "";
  const loose = read(path.join(git, ...ref.split("/"))).trim();
  if (/^[0-9a-f]{40}$/.test(loose)) return loose.slice(0, 7);
  const packed = read(path.join(git, "packed-refs"))
    .split(/\r?\n/)
    .find((l) => l.endsWith(` ${ref}`));
  return packed ? packed.slice(0, 7) : "";
}

/**
 * The development build `variable` names for engine `id`, or null: `{binDir, exe, backend, commit, dirty, source,
 * version}` — what the runtime takes (exe, backend, version) and what an app may show beside it. `infoFile`: the name
 * of a file its build script writes beside the server ({commit, dirty, source}); without one, the checkout one or two
 * folders above the build folder is read (build-jd\bin → its parent; build\jv-dev\bin → two up).
 */
export function devBuild(id, variable, { env = process.env, infoFile = "" } = {}) {
  const spec = DEV_ENGINES[id];
  const raw = String(env[variable] ?? "").trim();
  if (!spec || !variable || !raw || dataRuntime.frozen) return null;
  const binDir = path.normalize(raw);
  const server = path.join(binDir, spec.server);
  if (!isFile(server)) {
    // said once per folder: the runtime asks on every status read
    if (!warned.has(server)) log.warning(`${variable} names ${binDir}, which has no ${spec.server} — running the installed build`);
    warned.add(server);
    return null;
  }
  const buildDir = path.dirname(binDir);
  let info = null;
  if (infoFile) {
    try {
      const parsed = JSON.parse(read(path.join(binDir, infoFile)) || "null");
      info = parsed && typeof parsed === "object" ? parsed : null;
    } catch {
      info = null;
    }
  }
  const repo = [path.dirname(buildDir), path.dirname(path.dirname(buildDir))].find((d) => existsSync(path.join(d, ".git"))) ?? "";
  // the commit as its source writes it (a build script's `git rev-parse --short=8`, git's own 7 from its files)
  const commit = info ? String(info.commit || "") : repo ? commitOf(repo) : "";
  const dirty = Boolean(info?.dirty);
  const version = `${commit ? `dev · ${commit}` : "dev"}${dirty ? " + local changes" : ""}`;
  return Object.freeze({
    binDir,
    exe: server,
    backend: backendOf(read(path.join(buildDir, "CMakeCache.txt")), spec.backends),
    commit,
    dirty,
    source: String(info?.source || repo),
    version,
  });
}

/** installLlm's `runtimeExeOverrides` for `variables` ({engine id: the app's variable}): each read when the runtime asks. */
export function devBuildOverrides(variables, { env = process.env, infoFiles = {} } = {}) {
  return Object.fromEntries(Object.entries(variables).map(([id, variable]) => [id, () => devBuild(id, variable, { env, infoFile: infoFiles[id] ?? "" })]));
}
