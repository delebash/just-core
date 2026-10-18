// SPDX-License-Identifier: MIT
// platform/cors.js — the family's CORS on hono/cors (hono.dev/docs/middleware/builtin/cors).
// The expected headers are hono/cors's documented answers for the apps' settings.
import { expect, test } from "vitest";
import { starletteCors } from "../src/platform/cors.js";
import { createServer } from "../src/platform/server.js";

function client(opts) {
  const app = createServer({ typeBase: "https://example.test/errors/" });
  app.use("*", starletteCors(opts));
  app.on(["GET", "PUT"], "/v1/health", (c) => c.json({ ok: true }));
  app.get("/v1/boom", () => {
    throw new Error("boom");
  });
  return app;
}

const cors = (r) => Object.fromEntries([...r.headers].filter(([k]) => k.startsWith("access-control") || k === "vary"));

const SETTINGS = {
  allowOrigins: ["http://ok.example"],
  allowOriginRegex: "https://.*\\.trusted\\.dev",
  allowCredentials: true,
  allowMethods: ["*"],
  allowHeaders: ["*"],
};
const ALLOW_ALL = { allowOrigins: ["*"], allowMethods: ["*"], allowHeaders: ["*"] };

test("allow_all_stamps_a_star", async () => {
  const r = await client(ALLOW_ALL).request("/v1/health", { method: "GET", headers: { origin: "app://justwrite" } });
  expect(r.status).toBe(200);
  expect(cors(r)).toEqual({ "access-control-allow-origin": "*" });
});

test("listed_origins_are_mirrored_with_credentials", async () => {
  const app = client(SETTINGS);
  let r = await app.request("/v1/health", { method: "GET", headers: { origin: "http://ok.example" } });
  expect(cors(r)).toEqual({
    "access-control-allow-credentials": "true",
    "access-control-allow-origin": "http://ok.example",
    vary: "Origin",
  });
  // The regex must match the whole origin (Python's re.fullmatch).
  r = await app.request("/v1/health", { method: "GET", headers: { origin: "https://a.trusted.dev" } });
  expect(r.headers.get("access-control-allow-origin")).toBe("https://a.trusted.dev");
  r = await app.request("/v1/health", { method: "GET", headers: { origin: "https://a.trusted.dev.evil.example" } });
  expect(r.headers.get("access-control-allow-origin")).toBeNull();
  // Not allowed: no Allow-Origin (a header that is absent reads as null on a web Response).
  r = await app.request("/v1/health", { method: "GET", headers: { origin: "http://evil.example" } });
  expect(r.headers.get("access-control-allow-origin")).toBeNull();
  // No Origin at all: nothing to mirror.
  r = await app.request("/v1/health", { method: "GET" });
  expect(r.headers.get("access-control-allow-origin")).toBeNull();
});

test("an_error_answer_keeps_the_cors_headers", async () => {
  const r = await client(SETTINGS).request("/v1/boom", { method: "GET", headers: { origin: "http://ok.example" } });
  expect(r.status).toBe(500);
  expect(r.headers.get("access-control-allow-origin")).toBe("http://ok.example");
});

test("preflight_answers_204", async () => {
  const app = client(SETTINGS);
  let r = await app.request("/v1/health", {
    method: "OPTIONS",
    headers: {
      origin: "http://ok.example",
      "access-control-request-method": "PUT",
      "access-control-request-headers": "Content-Type, X-Custom",
    },
  });
  expect(r.status).toBe(204);
  expect(await r.text()).toBe("");
  const h = cors(r);
  expect(h["access-control-allow-origin"]).toBe("http://ok.example");
  expect(h["access-control-allow-credentials"]).toBe("true");
  expect(h["access-control-max-age"]).toBe("600");
  expect(h["access-control-allow-methods"].split(",")).toContain("PUT");
  // allowHeaders ["*"]: the requested headers are allowed back.
  expect(h["access-control-allow-headers"]).toBe("Content-Type,X-Custom");
  // A refused origin: 204 with no Allow-Origin — the browser refuses the request.
  r = await app.request("/v1/health", {
    method: "OPTIONS",
    headers: { origin: "http://evil.example", "access-control-request-method": "PUT" },
  });
  expect(r.status).toBe(204);
  expect(r.headers.get("access-control-allow-origin")).toBeNull();
});

test("allow_all_with_credentials_mirrors_the_origin", async () => {
  const r = await client({ ...ALLOW_ALL, allowCredentials: true }).request("/v1/health", {
    method: "GET",
    headers: { origin: "http://any.example" },
  });
  expect(r.headers.get("access-control-allow-origin")).toBe("http://any.example");
  expect(r.headers.get("access-control-allow-credentials")).toBe("true");
});
