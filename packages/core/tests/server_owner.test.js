// SPDX-License-Identifier: MIT
// Two OS users on one computer share its loopback ports: a second Windows account's app found the first's
// server on its port and stopped it (2026-10-20). The health answer names its `owner` — a short hash of the OS
// user, never the name — and the shell stops a server on its port only when it is its own user's (or names no
// owner: an older version, stopped as before).
import { createHash } from "node:crypto";
import os from "node:os";
import { expect, test } from "vitest";
import { makeHealthRouter } from "../src/platform/health_api.js";
import { serverOwner } from "../src/platform/port.js";
import { whoseServer } from "../src/shell/stale_server.js";

test("the health answer names its owner: sha256 of the OS user and home, 12 hex — never the name", async () => {
  const body = await (await makeHealthRouter({ product: "Demo", version: "1" }).request("/v1/health")).json();
  const expected = createHash("sha256").update(`${os.userInfo().username}\n${os.homedir()}`).digest("hex").slice(0, 12);
  expect(body.owner).toBe(expected);
  expect(body.owner).toMatch(/^[0-9a-f]{12}$/);
  expect(JSON.stringify(body)).not.toContain(os.userInfo().username);
  expect(serverOwner()).toBe(expected);
});

test("whose server: this user's is mine, another user's is never mine, an older version's is mine", () => {
  const product = "Demo";
  expect(whoseServer({ product, owner: "aaaaaaaaaaaa" }, { product, owner: "aaaaaaaaaaaa" })).toBe("mine");
  expect(whoseServer({ product, owner: "bbbbbbbbbbbb" }, { product, owner: "aaaaaaaaaaaa" })).toBe("other-user");
  expect(whoseServer({ product }, { product, owner: "aaaaaaaaaaaa" })).toBe("mine"); // before 2026-10-20: no owner
  expect(whoseServer({ product: "Other", owner: "aaaaaaaaaaaa" }, { product, owner: "aaaaaaaaaaaa" })).toBe(null);
  expect(whoseServer(null, { product })).toBe(null);
  expect(whoseServer({ product, owner: serverOwner() }, { product })).toBe("mine"); // this user's own, by default
});
