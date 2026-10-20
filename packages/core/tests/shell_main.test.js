// SPDX-License-Identifier: MIT
// shell/main.js driven for real on a stand-in for Electron (vi.mock): main.js is Electron's main process, so every
// Electron API it calls is faked here and records what the shell asked of it. The fourteenth review's findings
// (2026-10-20): one Change folder at a time — a second refused in words, the server not started while the data
// copies, the tray's server items off (Electron's MenuItem `enabled`); "Use the default folder" for this start
// only; the window kept off its port whenever its own server failed to listen there, until it does.
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
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
  const rec = { forks: [], menus: [], dialogs: [], webRequest: [], relaunched: 0, exited: [], ipc: {}, answer: 0, loaded: [], reloads: 0, quits: 0, lock: true, pageToken: null, order: [], pageHolds: false, unloadAnswer: 1 };
  const app = Object.assign(new Emitter(), {
    isPackaged: false,
    setPath() {},
    setAppUserModelId() {},
    requestSingleInstanceLock: () => rec.lock,
    quit() {
      rec.quits++;
    },
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
      rec.order.push("window");
      this.options = options;
      this.webContents = Object.assign(new Emitter(), {
        setWindowOpenHandler() {},
        send() {},
        // the page's answers: the token the kit's sign-in keeps (localStorage), else the drawn-layout probe's true
        executeJavaScript: async (code) => (String(code).includes("localStorage") ? rec.pageToken : true),
        reload() {
          rec.reloads++;
        },
      });
    }
    maximize() {}
    loadURL(url) {
      rec.loaded.push(url);
    }
    show() {}
    focus() {}
    hide() {}
    isDestroyed() {
      return !!this.destroyed;
    }
    // close(): the window's close, then — when the page keeps its beforeunload (rec.pageHolds) — Electron's
    // will-prevent-unload; the window goes only when nothing kept it
    close() {
      const ev = { prevented: false, preventDefault() { this.prevented = true; } };
      this.emit("close", ev);
      if (ev.prevented) return;
      if (rec.pageHolds) {
        const u = { prevented: false, preventDefault() { this.prevented = true; } };
        this.webContents.emit("will-prevent-unload", u);
        if (!u.prevented) return;
      }
      this.destroyed = true;
      this.emit("closed");
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
      rec.order.push("fork");
      return child;
    },
  };
  const electron = {
    app,
    BrowserWindow,
    dialog: {
      // (a window first, or the options alone)
      showMessageBox: async (...args) => {
        rec.dialogs.push(args.at(-1));
        return { response: rec.answer };
      },
      showMessageBoxSync: (...args) => {
        rec.dialogs.push(args.at(-1));
        return rec.unloadAnswer;
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
  return { ...real, relocate: vi.fn(real.relocate), sweepUnfinishedMove: vi.fn(real.sweepUnfinishedMove) };
});

const { runDesktopApp, QUIT_WHILE_MOVING, WINDOW_TOKEN_KEY } = await import("../src/shell/main.js");
const dataRoot = await import("../src/shell/dataRoot.js");
const relocate = vi.mocked(dataRoot.relocate);
const sweep = vi.mocked(dataRoot.sweepUnfinishedMove);
const { rec } = fake;

const tmp = () => mkdtempSync(path.join(tmpdir(), "shell-"));

beforeEach(() => {
  Object.assign(rec, { forks: [], menus: [], dialogs: [], webRequest: [], relaunched: 0, exited: [], ipc: {}, answer: 0, loaded: [], reloads: 0, quits: 0, lock: true, pageToken: null, order: [], pageHolds: false, unloadAnswer: 1 });
  sweep.mockClear();
  fake.electron.session.defaultSession.resolveProxy = async () => "DIRECT";
  relocate.mockReset(); // the real relocate again, no answer queued by another test
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
  const { shell, repo, port } = await startShell();
  rec.forks[0].child.emit("message", { type: "ready", host: "127.0.0.1", port });
  relocate.mockResolvedValueOnce(null);
  expect(await invoke("storageRelocate", { newRoot: repo })).toBe(null);
  expect(shell.state.moving).toBe(false);
  expect(rec.forks.length).toBe(2);
  rec.forks[1].child.emit("message", { type: "ready", host: "127.0.0.1", port });
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
  // Storage says so, and offers "Use the default folder from now on" (the fifteenth review: a drive gone for good
  // asked at every start, with no way to stop)
  expect(await invoke("storageGetRoot")).toEqual({
    root: def,
    default: def,
    portable: true,
    atDefault: true,
    folderName: "Demo",
    defaultThisStart: { folder: blocked, connected: false, problem: "a file has that name" },
    setBy: null,
    oldCopyOf: null,
  });
  // no move from here: the data is in the folder that can't be used now (the sixteenth review: a move from the
  // default this time left the newest data known nowhere)
  const elsewhere = `Your data is in ${blocked}, which can't be used now: a file has that name.`;
  await expect(invoke("storageRelocate", { newRoot: tmp() })).rejects.toThrow(elsewhere);
  expect(relocate).not.toHaveBeenCalled();
  await invoke("storageUseDefault");
  expect(existsSync(path.join(repo, "dataroot.txt"))).toBe(false);
  expect((await invoke("storageGetRoot")).defaultThisStart).toBe(null);
});

// ── the fifteenth review's attack on the shell (2026-10-20) ───────────────────

test("the reviewer's race.test.mjs: a start already waiting when Change folder begins never forks mid-copy; the move waits for it", async () => {
  const { shell, port } = await startShell();
  rec.forks[0].child.emit("message", { type: "ready", host: "127.0.0.1", port });
  // the tray's Restart: the next start waits on the system's proxy (Chromium's PAC answer — up to 5 s)
  let releaseProxy;
  fake.electron.session.defaultSession.resolveProxy = () => new Promise((r) => (releaseProxy = () => r("DIRECT")));
  const restart = trayItem("🔄 Restart server").click();
  await vi.waitFor(() => expect(releaseProxy).toBeTypeOf("function"));
  // meanwhile Change folder: the copy held open
  let finish;
  relocate.mockImplementationOnce(() => new Promise((resolve) => (finish = resolve)));
  const move = invoke("storageRelocate", { newRoot: tmp() });
  await vi.waitFor(() => expect(shell.state.moving).toBe(true));
  await new Promise((r) => setTimeout(r, 50));
  expect(relocate).not.toHaveBeenCalled(); // waiting for the start under way to end
  releaseProxy();
  await restart;
  await vi.waitFor(() => expect(relocate).toHaveBeenCalledTimes(1));
  expect(rec.forks.length).toBe(1); // the start checked `moving` again before its fork: no server mid-copy
  expect(shell.state.serverPhase).toBe("off");
  finish(null);
  await move;
  expect(rec.forks.length).toBe(2); // nothing moved: the server back on the folder
});

test("Quit while the data copies is held — said in a box, the app goes on; the move's relaunch ends it", async () => {
  const { shell, port } = await startShell();
  rec.forks[0].child.emit("message", { type: "ready", host: "127.0.0.1", port });
  let finish;
  relocate.mockImplementationOnce(() => new Promise((resolve) => (finish = resolve)));
  const move = invoke("storageRelocate", { newRoot: tmp(), token: "s3cr3t" });
  await vi.waitFor(() => expect(relocate).toHaveBeenCalledTimes(1));
  expect(relocate.mock.calls[0][0]).toMatchObject({ token: "s3cr3t" }); // the window's token goes with the data
  await shell.quitApp();
  expect(rec.dialogs.at(-1)).toMatchObject({ message: QUIT_WHILE_MOVING });
  expect(QUIT_WHILE_MOVING).toBe("The data is being moved — quit when it's done.");
  await trayItem("🚪 Quit Demo").click();
  const before = { preventDefault: vi.fn() };
  fake.electron.app.emit("before-quit", before);
  expect(before.preventDefault).toHaveBeenCalled();
  const close = { preventDefault: vi.fn() };
  shell.state.win.emit("close", close);
  expect(close.preventDefault).toHaveBeenCalled();
  expect(rec.quits).toBe(0);
  expect(shell.state.quitting).toBe(false);
  finish(path.join(tmp(), "Demo"));
  await move;
  expect(rec.relaunched).toBe(1);
});

test("a server stopped by a lost lock reloads the window, whose boot shows why before trying again", async () => {
  const { shell, port } = await startShell();
  rec.forks[0].child.emit("message", { type: "ready", host: "127.0.0.1", port });
  rec.forks[0].child.emit("message", { type: "data-folder-locked", dataDir: "D:\\data" });
  await vi.waitFor(() => expect(rec.reloads).toBe(1));
  expect(shell.state.server).toBe(null);
  // the reloaded window's boot: no start that would only meet the other server's lock — the page shows the reason
  await invoke("serverUrl");
  expect(rec.forks.length).toBe(1);
  expect((await invoke("serverStatus")).dataFolderInUse).toBe("Another Demo server is using this data folder (D:\\data) — stop it first.");
  // its Retry (the next boot) tries again; a start that meets the lock is no reason to reload
  void invoke("serverUrl");
  await vi.waitFor(() => expect(rec.forks.length).toBe(2));
  rec.forks[1].child.emit("message", { type: "data-folder-locked", dataDir: "D:\\data" });
  await vi.waitFor(() => expect(shell.state.server).toBe(null));
  await new Promise((r) => setTimeout(r, 20));
  expect(rec.reloads).toBe(1);
});

// 2026-10-20: with the data-dir variable naming the folder the next start ignores any pointer — a move would copy the
// data where the app never looks. Refused in the shell too (a peer app calling the command directly).
test("the data-dir variable names the folder: Change folder and the default folder from now on refused, in words", async () => {
  const chosen = tmp();
  vi.stubEnv("DEMO_DATA_DIR", chosen);
  try {
    const { shell, port } = await startShell();
    rec.forks[0].child.emit("message", { type: "ready", host: "127.0.0.1", port });
    expect(shell.state.root).toBe(chosen);
    expect(await invoke("storageGetRoot")).toMatchObject({ root: chosen, setBy: "DEMO_DATA_DIR" });
    await expect(invoke("storageRelocate", { newRoot: tmp() })).rejects.toThrow("This data folder is set by DEMO_DATA_DIR — change it there.");
    await expect(invoke("storageUseDefault")).rejects.toThrow("This data folder is set by DEMO_DATA_DIR — change it there.");
    expect(relocate).not.toHaveBeenCalled();
    expect(shell.state.moving).toBe(false);
    expect(shell.state.server).toBe(rec.forks[0].child); // never stopped
  } finally {
    vi.unstubAllEnvs();
  }
});

test("a start on the old copy a move left: Storage is told where the data is", async () => {
  const repo = tmp();
  const root = path.join(repo, "data");
  mkdirSync(path.join(root, "electron"), { recursive: true });
  const moved = path.join(tmp(), "Demo");
  writeFileSync(path.join(root, "electron", "moved-to.json"), JSON.stringify({ root: moved, movedAt: 1_700_000_000_000 }));
  mkdirSync(moved, { recursive: true });
  await startShell(repo);
  expect((await invoke("storageGetRoot")).oldCopyOf).toEqual({ root: moved, movedAt: 1_700_000_000_000, connected: true, problem: null });
  // no move from the old copy (it would leave the newer data known nowhere) — the newer folder is there: a restart
  // takes the app to it; "from now on" makes this one the data folder
  await expect(invoke("storageRelocate", { newRoot: tmp() })).rejects.toThrow(`Your data is in ${moved} — restart the app to use it.`);
  await invoke("storageUseDefault");
  expect(existsSync(path.join(root, "electron", "moved-to.json"))).toBe(false);
  expect((await invoke("storageGetRoot")).oldCopyOf).toBe(null);
});

test("the variable's folder missing, the start on the default: the data is elsewhere — no move, no 'from now on'", async () => {
  const gone = path.join(tmp(), "gone");
  vi.stubEnv("DEMO_DATA_DIR", gone);
  try {
    rec.answer = 1; // "Use the default folder"
    const repo = tmp();
    await startShell(repo);
    expect(await invoke("storageGetRoot")).toMatchObject({ setBy: "DEMO_DATA_DIR", defaultThisStart: { folder: gone, connected: false, problem: null } });
    await expect(invoke("storageRelocate", { newRoot: tmp() })).rejects.toThrow(`Your data is in ${gone}: connect it and restart.`);
    await expect(invoke("storageUseDefault")).rejects.toThrow("This data folder is set by DEMO_DATA_DIR — change it there.");
  } finally {
    vi.unstubAllEnvs();
  }
});

// s1: the sweep and the token's pickup ran before the single-instance lock — a second launch during Change folder
// swept the copy under way
// the seventeenth review's e1 (real Electron): the sweep was awaited before the window; a second launch during a long
// sweep made a window of its own through "second-instance", then the start made another — two windows
test("the window and the tray first, then the sweep, then the server; a second launch only shows a window that exists", async () => {
  let release;
  sweep.mockImplementationOnce(async () => {
    rec.order.push("sweep");
    await new Promise((r) => (release = r));
  });
  const port = await freePort();
  const repo = tmp();
  runDesktopApp({ id: "demo", appName: "Demo", productName: "Demo", port, serverEntry: "server.js", dataDirEnv: "DEMO_DATA_DIR", repoRoot: repo, distDir: repo, window: {} });
  await vi.waitFor(() => expect(rec.order).toContain("sweep"));
  expect(rec.order).toEqual(["window", "sweep"]);
  // a second launch while the sweep runs: the window that exists is shown — never another made
  fake.electron.app.emit("second-instance");
  expect(rec.order.filter((x) => x === "window")).toHaveLength(1);
  release();
  await vi.waitFor(() => expect(rec.forks.length).toBe(1));
  expect(rec.order).toEqual(["window", "sweep", "fork"]);
});

// the eighteenth review's e3/e4 (real Electron): during a long sweep the page gave up on the server (6.7 s) and the
// tray's Start server ran a server on the half copy being removed
test("while the start's sweep runs the start is busy: the page waits, the tray's server items are off, nothing starts, no move", async () => {
  let release;
  sweep.mockImplementationOnce(async () => {
    rec.order.push("sweep");
    await new Promise((r) => (release = r));
  });
  const port = await freePort();
  const repo = tmp();
  const shell = runDesktopApp({ id: "demo", appName: "Demo", productName: "Demo", port, serverEntry: "server.js", dataDirEnv: "DEMO_DATA_DIR", repoRoot: repo, distDir: repo, window: {} });
  await vi.waitFor(() => expect(rec.order).toContain("sweep"));
  expect(shell.state.sweeping).toBe(true);
  // the page asks for the server's address: it waits (its starting state), never told "no server"
  let url = "pending";
  invoke("serverUrl").then((u) => (url = u));
  for (const label of SERVER_ITEMS) expect(trayItem(label).enabled).toBe(false);
  await trayItem("▶️ Start server").click();
  await shell.startServer();
  await expect(invoke("storageRelocate", { newRoot: tmp() })).rejects.toThrow("The app is still clearing what a stopped move left — try again in a moment.");
  await new Promise((r) => setTimeout(r, 30));
  expect(rec.forks.length).toBe(0);
  expect(url).toBe("pending");
  release();
  await vi.waitFor(() => expect(rec.forks.length).toBe(1));
  rec.forks[0].child.emit("message", { type: "ready", host: "127.0.0.1", port });
  await vi.waitFor(() => expect(url).toBe(`http://127.0.0.1:${port}`));
  for (const label of SERVER_ITEMS) expect(trayItem(label).enabled).toBe(true);
});

// the eighteenth review's fresh angle: closing the window, a reload or Quit dropped a house's unsaved colors silently
test("unsaved work: the page's beforeunload kept → the shell's box; Stay keeps the window and the app, Leave lets them go", async () => {
  const { shell, port } = await startShell();
  rec.forks[0].child.emit("message", { type: "ready", host: "127.0.0.1", port });
  // the box's words in the app's language, as the kit's shellTrayLabels sends them
  await invoke("setTrayLabels", { labels: { unloadTitle: "¿Salir sin guardar?", unloadLeave: "Salir", unloadStay: "Quedarse" } });
  rec.pageHolds = true;
  // a reload (or a navigation) the page keeps: the box, in the app's words; Stay
  const reload = { prevented: false, preventDefault() { this.prevented = true; } };
  rec.unloadAnswer = 1;
  shell.state.win.webContents.emit("will-prevent-unload", reload);
  expect(rec.dialogs.at(-1)).toMatchObject({ message: "¿Salir sin guardar?", buttons: ["Salir", "Quedarse"], defaultId: 1, cancelId: 1 });
  expect(reload.prevented).toBe(false); // the page stays
  // Quit (the tray's), Stay: the window, the server and the app stay
  await trayItem("🚪 Quit Demo").click();
  expect(rec.quits).toBe(0);
  expect(shell.state.win.isDestroyed()).toBe(false);
  expect(shell.state.server).toBe(rec.forks[0].child);
  // Quit again, Leave: the window goes, then the server, then the app
  rec.unloadAnswer = 0;
  await shell.quitApp();
  expect(shell.state.win.isDestroyed()).toBe(true);
  expect(shell.state.server).toBe(null);
  expect(rec.quits).toBe(1);
});

test("Storage's Forget drops an old copy's record — nothing on any drive is touched", async () => {
  const repo = tmp();
  const root = path.join(repo, "data");
  const gone = path.join(tmp(), "Gone", "Demo");
  mkdirSync(path.join(root, "electron"), { recursive: true });
  writeFileSync(path.join(root, "electron", "old-root.txt"), JSON.stringify({ copies: [{ root: gone, entries: ["app.db"], movedAt: 1, moveId: "m1" }] }));
  await startShell(repo);
  expect(await invoke("storageOldCopies")).toEqual([{ root: gone, bytes: null, movedAt: 1, changedAt: null, connected: false }]);
  expect(await invoke("storageForgetOldCopy", { root: gone })).toEqual([]);
  expect(existsSync(path.join(root, "electron", "old-root.txt"))).toBe(false);
});

test("a second launch (the single-instance lock refused) never looks at what a move left, nor takes its token", async () => {
  const repo = tmp();
  const root = path.join(repo, "data");
  mkdirSync(path.join(root, "electron"), { recursive: true });
  writeFileSync(path.join(root, "electron", "carried.json"), JSON.stringify({ token: "s3cr3t" }));
  const half = path.join(tmp(), "Demo");
  mkdirSync(half);
  writeFileSync(path.join(half, "app.db"), "copying");
  writeFileSync(path.join(half, ".moving"), JSON.stringify({ root, entries: ["app.db"], made: true, pid: 99999999, committed: false }));
  writeFileSync(path.join(root, "electron", "moving-to.json"), JSON.stringify({ target: half, pid: 99999999 }));
  rec.lock = false;
  const port = await freePort();
  const shell = runDesktopApp({ id: "demo", appName: "Demo", productName: "Demo", port, serverEntry: "server.js", dataDirEnv: "DEMO_DATA_DIR", repoRoot: repo, distDir: repo, window: {} });
  expect(shell).toBe(null);
  await new Promise((r) => setTimeout(r, 50));
  expect(existsSync(path.join(root, "electron", "carried.json"))).toBe(true);
  expect(readFileSync(path.join(half, "app.db"), "utf8")).toBe("copying");
});

test("Change folder carries the window's token itself — read from the page, under the kit's sign-in key", async () => {
  // the kit's UI keeps it under this key (serverToken.js) — the two must stay one
  const ui = readFileSync(path.resolve(import.meta.dirname, "../../ui/src/common/services/serverToken.js"), "utf8");
  expect(ui).toContain(`const KEY = ${JSON.stringify(WINDOW_TOKEN_KEY)};`);
  const { port } = await startShell();
  rec.forks[0].child.emit("message", { type: "ready", host: "127.0.0.1", port });
  rec.pageToken = "from-the-page";
  relocate.mockResolvedValueOnce(null);
  await invoke("storageRelocate", { newRoot: tmp() });
  expect(relocate.mock.calls[0][0]).toMatchObject({ token: "from-the-page" });
  // an app that passes one: that one
  rec.forks.at(-1).child.emit("message", { type: "ready", host: "127.0.0.1", port });
  relocate.mockResolvedValueOnce(null);
  await invoke("storageRelocate", { newRoot: tmp(), token: "passed" });
  expect(relocate.mock.calls[1][0]).toMatchObject({ token: "passed" });
});

test("the token a move carried signs the window's first page in, once", async () => {
  const repo = tmp();
  const root = path.join(repo, "data");
  mkdirSync(path.join(root, "electron"), { recursive: true });
  writeFileSync(path.join(root, "electron", "carried.json"), JSON.stringify({ token: "s3cr3t" }));
  await startShell(repo);
  expect(rec.loaded).toEqual(["app://demo/index.html?token=s3cr3t"]);
  expect(existsSync(path.join(root, "electron", "carried.json"))).toBe(false);
});

test("Storage: the old copy with its size, removed when asked — only what the move copied", async () => {
  const repo = tmp();
  const root = path.join(repo, "data");
  const old = tmp();
  writeFileSync(path.join(old, "app.db"), "12345");
  writeFileSync(path.join(old, "mine.txt"), "the user's");
  mkdirSync(path.join(root, "electron"), { recursive: true });
  writeFileSync(path.join(root, "electron", "old-root.txt"), JSON.stringify({ copies: [{ root: old, entries: ["app.db", "electron", "server.lock"] }] }));
  await startShell(repo);
  expect(await invoke("storageOldCopies")).toEqual([{ root: old, bytes: 5, movedAt: null, changedAt: null, connected: true }]);
  expect(await invoke("storageRemoveOldCopy", { root: old })).toEqual([]);
  expect(existsSync(path.join(old, "app.db"))).toBe(false);
  expect(readFileSync(path.join(old, "mine.txt"), "utf8")).toBe("the user's");
});
