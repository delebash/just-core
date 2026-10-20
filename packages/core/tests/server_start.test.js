// SPDX-License-Identifier: MIT
// shell/server_start.js and its use in main.js (2026-10-20): the server the shell starts trusts the OS's
// certificates (NODE_USE_SYSTEM_CA) and gets the system's proxy, a server that dies before it can say why still
// says it on the connection page, and a port Windows reserved or another OS user's copy holds is named.
// main.js is Electron's main process, not importable here, so its wiring is read from its source.
import { readFileSync } from "node:fs";
import http from "node:http";
import { resolve } from "node:path";
import { EnvHttpProxyAgent, fetch } from "undici";
import { expect, test } from "vitest";
import { firstErrorLine, listenFailure, proxyFromPac, serverEnv } from "../src/shell/server_start.js";

const main = readFileSync(resolve(import.meta.dirname, "../src/shell/main.js"), "utf8");

test("the system's proxy, from Chromium's PAC answer", () => {
  expect(proxyFromPac("PROXY proxy.corp:8080")).toBe("http://proxy.corp:8080");
  expect(proxyFromPac("PROXY proxy.corp:8080; DIRECT")).toBe("http://proxy.corp:8080");
  expect(proxyFromPac("HTTPS secure.corp:443")).toBe("https://secure.corp:443");
  expect(proxyFromPac("DIRECT")).toBe(null);
  expect(proxyFromPac("SOCKS5 socks.corp:1080")).toBe(null);
  expect(proxyFromPac("")).toBe(null);
});

test("the server's environment: the data root, the OS's certificates, the system's proxy off this computer", () => {
  const env = serverEnv({ env: { PATH: "x" }, dataDirEnv: "DEMO_DATA_DIR", root: "D:\\data", proxy: "http://proxy.corp:8080" });
  expect(env).toEqual({
    PATH: "x",
    DEMO_DATA_DIR: "D:\\data",
    NODE_USE_SYSTEM_CA: "1",
    HTTPS_PROXY: "http://proxy.corp:8080",
    HTTP_PROXY: "http://proxy.corp:8080",
    NO_PROXY: "localhost,127.0.0.1,::1",
  });
  // no system proxy: nothing set
  expect(serverEnv({ env: {}, dataDirEnv: "D", root: "r" })).toEqual({ D: "r", NODE_USE_SYSTEM_CA: "1" });
});

test("the user's own settings win: their proxy, their NO_PROXY kept, their NODE_USE_SYSTEM_CA", () => {
  const theirs = serverEnv({ env: { https_proxy: "http://mine:3128" }, dataDirEnv: "D", root: "r", proxy: "http://proxy.corp:8080" });
  expect(theirs.https_proxy).toBe("http://mine:3128");
  expect(theirs.HTTPS_PROXY).toBe(undefined);
  expect(theirs.HTTP_PROXY).toBe(undefined);
  const noProxy = serverEnv({ env: { no_proxy: "intranet.corp" }, dataDirEnv: "D", root: "r", proxy: "http://p:1" });
  expect(noProxy.no_proxy).toBe("intranet.corp,localhost,127.0.0.1,::1");
  expect(noProxy.NO_PROXY).toBe(undefined);
  expect(serverEnv({ env: { NODE_USE_SYSTEM_CA: "0" }, dataDirEnv: "D", root: "r" }).NODE_USE_SYSTEM_CA).toBe("0");
});

// 2026-10-20 (the fourteenth review, proxy_env.mjs): loopback was kept off only the proxy the shell set — a user's
// own HTTP_PROXY sent the server's calls to its local AI engines to the proxy
test("whenever any proxy is set — the user's own too — this computer's addresses stay off it", () => {
  for (const env of [{ HTTP_PROXY: "http://mine:3128" }, { https_proxy: "http://mine:3128" }]) {
    expect(serverEnv({ env, dataDirEnv: "D", root: "r" }).NO_PROXY).toBe("localhost,127.0.0.1,::1");
    expect(serverEnv({ env, dataDirEnv: "D", root: "r", proxy: "http://proxy.corp:8080" }).NO_PROXY).toBe("localhost,127.0.0.1,::1");
  }
  const theirs = serverEnv({ env: { HTTP_PROXY: "http://mine:3128", no_proxy: "intranet.corp,127.0.0.1" }, dataDirEnv: "D", root: "r" });
  expect(theirs.no_proxy).toBe("intranet.corp,127.0.0.1,localhost,::1");
  expect(theirs.NO_PROXY).toBe(undefined);
  expect(theirs.HTTP_PROXY).toBe("http://mine:3128");
});

test("undici's proxy agent, given what the server gets, reaches the local engine directly past a user's proxy", async () => {
  const engine = http.createServer((_q, r) => r.end("local ok")).listen(0, "127.0.0.1");
  await new Promise((r) => engine.once("listening", r));
  try {
    const env = serverEnv({ env: { HTTP_PROXY: "http://127.0.0.1:9" }, dataDirEnv: "D", root: "r" }); // a proxy that isn't there
    const agent = new EnvHttpProxyAgent({ httpProxy: env.HTTP_PROXY, noProxy: env.NO_PROXY });
    const r = await fetch(`http://127.0.0.1:${engine.address().port}/`, { dispatcher: agent, signal: AbortSignal.timeout(5000) });
    expect(await r.text()).toBe("local ok");
    await agent.close();
  } finally {
    await new Promise((r) => engine.close(r));
  }
});

test("a server that died before it could say why: the first line that reads as an error", () => {
  const uncaught = [
    "file:///E:/app/server/src/database/sql.js:12",
    'throw new Error("x")',
    "^",
    "",
    "Error: The specified module could not be found.",
    "\\\\?\\C:\\app\\better_sqlite3.node",
    "    at Module._extensions..node (node:internal/modules/cjs/loader:1)",
  ].join("\r\n");
  expect(firstErrorLine(uncaught)).toBe("The specified module could not be found.");
  expect(firstErrorLine("Error [ERR_MODULE_NOT_FOUND]: Cannot find package 'x'")).toBe("Cannot find package 'x'");
  expect(firstErrorLine("SqliteError: unable to open database file")).toBe("unable to open database file");
  expect(firstErrorLine("[server] starting\nall fine")).toBe(null);
});

test("why the server couldn't listen: another user's copy, a port Windows reserved, another program", () => {
  expect(listenFailure("EADDRINUSE", 17499, "other-user")).toEqual({ portOtherUser: 17499 });
  expect(listenFailure("EACCES", 17499, null)).toEqual({ portReserved: 17499 });
  expect(listenFailure("EADDRINUSE", 17499, null)).toEqual({ portTaken: 17499 });
});

test("main.js: the server starts with serverEnv, the system's proxy asked through Electron's session", () => {
  expect(main).toMatch(/utilityProcess\.fork\([^)]*\{\s*env: serverEnv\(\{ env: process\.env, dataDirEnv: config\.dataDirEnv, root: state\.root, proxy \}\)/);
  expect(main).toMatch(/session\.defaultSession\.resolveProxy\(PROXY_PROBE_URL\)/);
});

test("main.js: only this user's own server is stopped; the reasons reach serverStatus", () => {
  expect(main).toMatch(/\(await whoAnswers\(config\.port\)\) === "mine"\) \{\s*await evictListener\(config\.port\);/);
  expect(main).not.toMatch(/answersAsThisApp/);
  for (const k of ["portOtherUser", "portReserved", "serverError"]) expect(main).toMatch(new RegExp(`${k}: state\\.${k}`));
  expect(main).toMatch(/m\?\.type === "start-failed"/);
  // the window kept off its port whenever its own server failed to listen there, until our own listens
  // (behaviour: shell_main.test.js)
  expect(main).toMatch(/state\.serverPhase = "ready";\s*guardPort\(null\);/);
  expect(main).toMatch(/webRequest\.onBeforeRequest\(\{ urls: \["http:\/\/\*\/\*"\] \}/);
});

test("main.js: the data root is checked before Chromium's folder is made in it", () => {
  const check = main.indexOf("let rootProblem = dataRootProblem(state.root);");
  const mkdir = main.indexOf("fs.mkdirSync(chromeDir, { recursive: true });");
  expect(check).toBeGreaterThan(0);
  expect(check).toBeLessThan(mkdir);
  expect(main).toMatch(/const chromeDir = path\.join\(chromeHome, CHROME_DIR\);/);
  expect(main).toMatch(/\["Try again", "Use the default folder", "Quit"\]/);
  expect(main).toMatch(/if \(rootProblem && !\(await settleDataRoot\(\)\)\) return;/);
});
