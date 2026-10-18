// SPDX-License-Identifier: MIT
// Through a real socket (app-structure §Q.3, §18): `app.request` can't see a missing CORS answer —
// the 2026-08-02 i18n rewrite shipped 126 green tests and zero working browser requests — so this
// runs the app on the kit's real server (runServer on @hono/node-server, as the desktop app and the
// headless path run it) and asks it with Node's own client, Origin header and all.
import http from "node:http";
import { runServer } from "@delebash/core/platform";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { createApp } from "../src/app.js";
import { tmpDir, useHermeticKit } from "./helpers.js";

useHermeticKit();

let served;
beforeEach(async () => {
  const app = await createApp(tmpDir());
  // runServer's stop ends the process; a test keeps it
  vi.spyOn(process, "exit").mockImplementation(() => undefined);
  served = await runServer({
    argv: ["serve"],
    envPrefix: null,
    log: { error() {}, info() {} },
    build: async () => ({ app, host: "127.0.0.1", port: 0 }),
  });
});
afterEach(async () => {
  await served.stop("test over");
});

/** One request with Node's own HTTP client. */
function send(method, path, { headers = {}, body } = {}) {
  return new Promise((resolve, reject) => {
    const req = http.request({ host: "127.0.0.1", port: served.port, path, method, headers }, (res) => {
      let text = "";
      res.on("data", (b) => {
        text += b;
      });
      res.on("end", () => resolve({ status: res.statusCode, headers: res.headers, text }));
    });
    req.on("error", reject);
    if (body !== undefined) req.write(body);
    req.end();
  });
}

test("a read from the dev server's origin gets its CORS answer", async () => {
  const r = await send("GET", "/v1/notes", { headers: { origin: "http://localhost:9000" } });
  expect(r.status).toBe(200);
  expect(r.headers["access-control-allow-origin"]).toBe("*");
});

test("the desktop window's preflight and JSON write go through", async () => {
  const origin = "app://familytemplate";
  const pre = await send("OPTIONS", "/v1/notes", {
    headers: { origin, "access-control-request-method": "POST", "access-control-request-headers": "content-type" },
  });
  expect(pre.status).toBeLessThan(300);
  expect(pre.headers["access-control-allow-origin"]).toBeTruthy();
  expect(String(pre.headers["access-control-allow-methods"])).toMatch(/POST/);

  const body = JSON.stringify({ title: "Through the socket" });
  const r = await send("POST", "/v1/notes", { headers: { origin, "content-type": "application/json", "content-length": Buffer.byteLength(body) }, body });
  expect(r.status).toBe(201);
  expect(r.headers["access-control-allow-origin"]).toBe("*");
  expect(JSON.parse(r.text).title).toBe("Through the socket");
});

test("an error answer carries CORS too, so the browser sees the error and not a CORS block", async () => {
  const body = JSON.stringify({});
  const r = await send("POST", "/v1/notes", {
    headers: { origin: "http://127.0.0.1:9000", "content-type": "application/json", "content-length": Buffer.byteLength(body) },
    body,
  });
  expect(r.status).toBe(422);
  expect(r.headers["access-control-allow-origin"]).toBe("*");
  expect(JSON.parse(r.text).requestId).toBe(r.headers["x-request-id"]);
});
