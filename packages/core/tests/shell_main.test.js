// SPDX-License-Identifier: MIT
// shell/main.js driven for real on a stand-in for Electron (vi.mock): main.js is Electron's main process, so every
// Electron API it calls is faked here and records what the shell asked of it. The fourteenth review's findings
// (2026-10-20): one Change folder at a time — a second refused in words, the server not started while the data
// copies, the tray's server items off (Electron's MenuItem `enabled`); "Use the default folder" for this start
// only; the window kept off its port whenever its own server failed to listen there, until it does.
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import net from "node:net";
import { tmpdir } from "node:os";
import path from "node:path";
import { beforeEach, expect, test, vi } from "vitest";

const fake = vi.hoisted(() => {
  class Emitter {
    constructor() {
      this.handlers = {};
    }
    on(ev, fn) {
      (this.handlers[ev] ||= []).push(fn);
      return this;
    }
    once(ev, fn) {
      const once = (...a) => {
        this.off(ev, once);
        fn(...a);
      };
      return this.on(ev, once);
    }
    off(ev, fn) {
      this.handlers[ev] = (this.handlers[ev] || []).filter((f) => f !== fn);
      return this;
    }
    emit(ev, ...a) {
      for (const fn of [...(this.handlers[ev] || [])]) fn(...a);
    }
  }
  // what the shell asked of Electron
  const rec = { forks: [], menus: [], dialogs: [], webRequest: [], relaunched: 0, exited: [], ipc: {}, answer: 0 };
  const app = Object.assign(new Emitter(), {
    isPackaged: false,
    setPath() {},
    setAppUserModelId() {},
    requestSingleInstanceLock: () => true,
    quit() {},
    relaunch() {
      rec.relaunched++;
    },
    exit(code) {
      rec.exited.push(code);
    },
    whenReady: () => Promise.resolve(),
    getPath: () => "downloads",
  });
  class BrowserWindow extends Emitter {
    constructor(options) {
      super();
      this.options = options;
      this.webContents = Object.assign(new Emitter(), { setWindowOpenHandler() {}, send() {}, executeJavaScript: async () => true });
    }
    maximize() {}
    loadURL() {}
    show() {}
    focus() {}
    hide() {}
    isDestroyed() {
      return false;
    }
    isVisible() {
      return true;
    }
    getNormalBounds() {
      return {};
    }
    isMaximized() {
      return false;
    }
  }
  class Tray extends Emitter {
    setToolTip() {}
    setContextMenu(menu) {
      rec.menus.push(menu);
    }
  }
  const area = { workAreaSize: { width: 1920, height: 1080 } };
  const utilityProcess = {
    fork(entry, args, options) {
      const child = Object.assign(new Emitter(), {
        stdout: null,
        stderr: null,
        postMessage(m) {
          if (m?.type === "stop") setImmediate(() => child.emit("exit", 0));
        },
        kill() {
          child.emit("exit", 1);
        },
      });
      rec.forks.push({ entry, args, options, child });
      return child;
    },
  };
  const electron = {
    app,
    BrowserWindow,
    dialog: {
      showMessageBox: async (options) => {
        rec.dialogs.push(options);
        return { response: rec.answer };
      },
    },
    ipcMain: {
      handle: (name, fn) => {
        rec.ipc[name] = fn;
      },
    },
    Menu: { buildFromTemplate: (items) => items },
    nativeImage: { createFromPath: () => ({}) },
    net: { fetch: async () => new Response("") },
    powerMonitor: new Emitter(),
    protocol: { registerSchemesAsPrivileged() {}, handle() {} },
    screen: { getPrimaryDisplay: () => area, getDisplayMatching: () => area, getAllDisplays: () => [] },
    session: {
      defaultSession: {
        resolveProxy: async () => "DIRECT",
        setPermissionRequestHandler() {},
        setPermissionCheckHandler() {},
        webRequest: { onBeforeRequest: (...args) => rec.webRequest.push(args) },
      },
    },
    shell: { openExternal() {}, openPath: async () => "" },
    Tray,
    utilityProcess,
  };
  return { rec, electron };
});

vi.mock("electron", () => fake.electron);
vi.mock("electron-context-menu", () => ({ default: () => () => {} }));
// Change folder's copy, held open by a test (the real one otherwise)
vi.mock("../src/shell/dataRoot.js", async (importOriginal) => {
  const real = await importOriginal();
  return { ...real, relocate: vi.fn(real.relocate) };
});

const { runDesktopApp } = await import("../src/shell/main.js");
const dataRoot = await import("../src/shell/dataRoot.js");
const relocate = vi.mocked(dataRoot.relocate);
const { rec } = fake;

const tmp = () => mkdtempSync(path.join(tmpdir(), "shell-"));

beforeEach(() => {
  Object.assign(rec, { forks: [], menus: [], dialogs: [], webRequest: [], relaunched: 0, exited: [], ipc: {}, answer: 0 });
  relocate.mockClear();
});

async function freePort() {
  const s = net.createServer();
  await new Promise((r) => s.listen(0, "127.0.0.1", r));
  const { port } = s.address();
  await new Promise((r) => s.close(r));
  return port;
}

/** The desktop app of a checkout `repo`, up to its server's first start. */
async function startShell(repo = tmp()) {
  const port = await freePort();
  const shell = runDesktopApp({ id: "demo", appName: "Demo", productName: "Demo", port, serverEntry: "server.js", dataDirEnv: "DEMO_DATA_DIR", repoRoot: repo, distDir: repo, window: {} });
  await vi.waitFor(() => expect(rec.forks.length).toBe(1));
  return { shell, port, repo };
}

/** The renderer's call to a shell command, from the app's own page. */
const invoke = (name, args = {}) => rec.ipc[`shell:${name}`]({ senderFrame: { url: "app://demo/index.html" } }, args);

const SERVER_ITEMS = ["▶️ Start server", "⏹ Stop server", "🔄 Restart server"];
const trayItem = (label) => rec.menus.at(-1).find((i) => i.label === label);

test("Change folder: one move at a time — a second refused in words, the server not started, the tray's server items off", async () => {
  const { shell } = await startShell();
  rec.forks[0].child.emit("message", { type: "ready", host: "127.0.0.1", port: 1 });
  let finish;
  relocate.mockImplementationOnce(
    () =>
      new Promise((resolve, reject) => {
        finish = { resolve, reject };
      }),
  );
  const picked = tmp();
  const first = invoke("storageRelocate", { newRoot: picked });
  await vi.waitFor(() => expect(relocate).toHaveBeenCalledTimes(1));
  expect(relocate.mock.calls[0][0]).toMatchObject({ newRoot: picked, folderName: "Demo" }); // into <picked>\Demo
  expect(shell.state.moving).toBe(true);
  // a second Change folder (the window's button re-enabled by a remount): refused in words, nothing else moves
  await expect(invoke("storageRelocate", { newRoot: picked })).rejects.toThrow("The data folder is already being moved — wait for that move to finish.");
  expect(relocate).toHaveBeenCalledTimes(1);
  // the server isn't started mid-copy — not by the window's boot, the tray's Start or Restart
  for (const label of SERVER_ITEMS) expect(trayItem(label).enabled).toBe(false);
  expect(trayItem("📺 Show window").enabled).toBe(undefined);
  await shell.startServer();
  await trayItem("▶️ Start server").click();
  await trayItem("🔄 Restart server").click();
  await invoke("serverUrl");
  expect(rec.forks.length).toBe(1);
  // the move fails: the server is back on the old folder, the tray's items on again
  finish.reject(new Error("copy failed: EIO: i/o error, write"));
  await expect(first).rejects.toThrow("copy failed: EIO: i/o error, write");
  expect(shell.state.moving).toBe(false);
  expect(rec.forks.length).toBe(2);
  for (const label of SERVER_ITEMS) expect(trayItem(label).enabled).toBe(true);
});

test("Change folder that finishes relaunches the app; one to where the data already is starts the server again", async () => {
  const { shell, repo } = await startShell();
  relocate.mockResolvedValueOnce(null);
  expect(await invoke("storageRelocate", { newRoot: repo })).toBe(null);
  expect(shell.state.moving).toBe(false);
  expect(rec.forks.length).toBe(2);
  relocate.mockResolvedValueOnce(path.join(tmp(), "Demo"));
  await invoke("storageRelocate", { newRoot: tmp() });
  expect(rec.relaunched).toBe(1);
  expect(rec.exited).toEqual([0]);
});

test("the window is kept off its port whenever its own server failed to listen there, until its own server listens", async () => {
  // the reviewer's case: a busy server of another OS user's copy missed the 500 ms probe and read as "port taken"
  // — the window booted on that user's data
  const { shell, port } = await startShell();
  rec.forks[0].child.emit("message", { type: "listen-failed", host: "127.0.0.1", port, code: "EADDRINUSE" });
  await vi.waitFor(() => expect(rec.webRequest.length).toBe(1));
  const [filter, listener] = rec.webRequest[0];
  expect(filter).toEqual({ urls: ["http://*/*"] });
  const cancelled = (url) => {
    let cancel;
    listener({ url }, (r) => {
      cancel = r.cancel;
    });
    return cancel;
  };
  expect(cancelled(`http://127.0.0.1:${port}/v1/health`)).toBe(true);
  expect(cancelled(`http://localhost:${port}/v1/houses`)).toBe(true);
  expect(cancelled(`http://127.0.0.1:${port + 1}/`)).toBe(false);
  // nothing answered the probe: said as another program's port
  await vi.waitFor(() => expect(shell.state.portTaken).toBe(port));
  await vi.waitFor(() => expect(shell.state.server).toBe(null));
  // our own server listens at last: the window may use its port
  await shell.startServer();
  rec.forks[1].child.emit("message", { type: "ready", host: "127.0.0.1", port });
  expect(rec.webRequest.at(-1)).toEqual([null]);
});

test("Use the default folder: this start only — the pointer kept, the box says where the data stays and that it asks again", async () => {
  const repo = tmp();
  const blocked = path.join(tmp(), "blocked");
  writeFileSync(blocked, "a file where the folder goes");
  writeFileSync(path.join(repo, "dataroot.txt"), blocked);
  rec.answer = 1; // "Use the default folder"
  const { shell } = await startShell(repo);
  const def = path.join(repo, "data");
  expect(rec.dialogs.length).toBe(1);
  const box = rec.dialogs[0];
  expect(box.buttons).toEqual(["Try again", "Use the default folder", "Quit"]);
  expect(box.message).toBe(`The data folder ${blocked} can't be used: a file has that name`);
  expect(box.detail).toBe(`"Use the default folder" opens the app on ${def} for this time only. Your data stays in ${blocked}, and the app asks again at its next start.`);
  expect(shell.state.root).toBe(def);
  expect(rec.forks[0].options.env.DEMO_DATA_DIR).toBe(def);
  // the pointer is kept: the next start looks for the data there again
  expect(readFileSync(path.join(repo, "dataroot.txt"), "utf8")).toBe(blocked);
});
