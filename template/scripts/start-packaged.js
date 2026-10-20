// SPDX-License-Identifier: MIT
// The packaged app, started as a user starts it on a fresh data folder, must load its window's page
// (the shell's "[shell] window loaded") and answer on its own port with its own version — the release run's check on every runner, before anything is attached (the
// macOS and Linux builds are never opened by hand; just-house-paint RESEARCH §12). Run after
// `quasar build -m electron` (dist/electron/Packaged/<platform>-unpacked); on Linux under a display
// (`xvfb-run -a node scripts/start-packaged.js` — the release workflow does).
// The port and the data folder's variable are read from src-electron/electron-main.js (runDesktopApp's
// `port` and `dataDirEnv`), the version from package.json. Paths given as arguments are asked after
// /v1/health answers and must answer 2xx too — an app's own checks (just-house-paint: its part
// finder's runtime loads, `node scripts/start-packaged.js v1/segment/runtime`; written without the
// leading slash, which Git Bash on Windows turns into a file path). `--appimage` (Linux)
// runs the .AppImage file itself with no flags, as a user opens it — the sandbox and FUSE as they are on
// that machine — instead of the unpacked folder. Exit 0 = it answered; 1 = it didn't.
import { spawn, spawnSync } from "node:child_process";
import { mkdtempSync, readdirSync, readFileSync, rmSync, statSync } from "node:fs";
import os from "node:os";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const pkg = JSON.parse(readFileSync(path.join(root, "package.json"), "utf8"));
const main = readFileSync(path.join(root, "src-electron", "electron-main.js"), "utf8");
const port = Number(main.match(/\bport:\s*(\d+)/)?.[1]);
const dataDirEnv = main.match(/\bdataDirEnv:\s*"([A-Z0-9_]+)"/)?.[1];
if (!port || !dataDirEnv) throw new Error("src-electron/electron-main.js names no `port` or `dataDirEnv`");
const out = path.join(root, "dist", "electron", "Packaged");
const TIMEOUT_MS = 120_000;
const asUser = process.argv.includes("--appimage");
const extraPaths = process.argv
  .slice(2)
  .filter((a) => !a.startsWith("--"))
  .map((a) => `/${a.replace(/^\/+/, "")}`);

/** The packaged app's own executable in electron-builder's unpacked folder for this platform. */
function findExecutable(dir = out, platform = process.platform) {
  const sub = readdirSync(dir).find((d) => (platform === "darwin" ? /^mac/.test(d) : d === `${platform === "win32" ? "win" : "linux"}-unpacked`));
  if (!sub) throw new Error(`no unpacked ${platform} build in ${dir}`);
  const at = path.join(dir, sub);
  if (platform === "darwin") {
    const app = readdirSync(at).find((f) => f.endsWith(".app"));
    if (!app) throw new Error(`no .app in ${at}`);
    return path.join(at, app, "Contents", "MacOS", app.slice(0, -4));
  }
  if (platform === "win32") {
    const exe = readdirSync(at).find((f) => f.endsWith(".exe") && !/^uninstall/i.test(f));
    if (!exe) throw new Error(`no .exe in ${at}`);
    return path.join(at, exe);
  }
  // Linux: the one executable file that isn't Chromium's helpers or a library
  const helpers = new Set(["chrome-sandbox", "chrome_crashpad_handler"]);
  const exe = readdirSync(at).find((f) => !helpers.has(f) && !f.includes(".") && statSync(path.join(at, f)).isFile() && statSync(path.join(at, f)).mode & 0o111);
  if (!exe) throw new Error(`no executable in ${at}`);
  return path.join(at, exe);
}

async function health() {
  try {
    const r = await fetch(`http://127.0.0.1:${port}/v1/health`, { signal: AbortSignal.timeout(2000) });
    return r.ok ? await r.json() : null;
  } catch {
    return null;
  }
}

function stop(child) {
  if (child.exitCode != null) return;
  if (process.platform === "win32") spawnSync("taskkill", ["/pid", String(child.pid), "/T", "/F"], { stdio: "ignore" });
  else {
    try {
      process.kill(-child.pid, "SIGKILL"); // its whole group: the window, the server, their helpers
    } catch {
      child.kill("SIGKILL");
    }
  }
}

async function run() {
  if (await health()) throw new Error(`something already answers on port ${port} — stop it first`);
  const appImage = asUser ? readdirSync(out).find((f) => f.endsWith(".AppImage")) : null;
  if (asUser && !appImage) throw new Error(`no .AppImage in ${out}`);
  const exe = appImage ? path.join(out, appImage) : findExecutable();
  const dataDir = mkdtempSync(path.join(os.tmpdir(), "start-packaged-"));
  // the unpacked folder on Linux: chrome-sandbox isn't setuid there, so Chromium's sandbox can't start;
  // the AppImage runs exactly as a user's double-click runs it
  const args = process.platform === "linux" && !appImage ? ["--no-sandbox"] : [];
  console.log(`starting ${exe} (data folder ${dataDir}, port ${port})`);
  const t0 = Date.now();
  const child = spawn(exe, args, { env: { ...process.env, [dataDirEnv]: dataDir }, stdio: ["ignore", "pipe", "inherit"], detached: process.platform !== "win32" });
  // the shell says when its window's page loaded (the kit's runDesktopApp): the window, not only the server
  let windowLoaded = false;
  child.stdout.on("data", (chunk) => {
    process.stdout.write(chunk);
    if (String(chunk).includes("[shell] window loaded")) windowLoaded = true;
  });
  let exited = null;
  child.on("exit", (code, signal) => {
    exited = { code, signal };
  });
  child.on("error", (e) => {
    exited = { code: e.code || e.message, signal: null }; // it couldn't be started at all
  });
  try {
    for (;;) {
      if (exited) throw new Error(`the app quit before it answered (exit ${exited.code ?? exited.signal})`);
      const h = await health();
      if (h && windowLoaded) {
        if (h.version !== pkg.version) throw new Error(`it answered as version ${h.version}, not ${pkg.version}`);
        console.log(`it answered in ${((Date.now() - t0) / 1000).toFixed(1)} s: ${h.product} ${h.version}`);
        for (const p of extraPaths) {
          const r = await fetch(`http://127.0.0.1:${port}${p}`, { signal: AbortSignal.timeout(60_000) });
          const body = await r.text();
          if (!r.ok) throw new Error(`${p} answered ${r.status}: ${body.slice(0, 400)}`);
          console.log(`${p}: ${r.status} ${body.slice(0, 200)}`);
        }
        return;
      }
      if (Date.now() - t0 > TIMEOUT_MS) throw new Error(h ? `the server answered, but the window never loaded its page in ${TIMEOUT_MS / 1000} s` : `no answer on port ${port} in ${TIMEOUT_MS / 1000} s`);
      await new Promise((r) => setTimeout(r, 500));
    }
  } finally {
    stop(child);
    await new Promise((r) => setTimeout(r, 1500)); // let the files go before the folder is removed
    try {
      rmSync(dataDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 500 });
    } catch (e) {
      console.warn(`the data folder ${dataDir} stays (${e.code || e.message})`); // the check's answer stands
    }
  }
}

run().catch((e) => {
  console.error(`the packaged app didn't start: ${e.message}`);
  process.exit(1);
});
