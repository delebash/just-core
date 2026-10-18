// SPDX-License-Identifier: MIT
// Test helpers shared by the server's suites — docgen's server/tests/helpers.js, the family's
// smallest donor (app-structure §8, §18).
//
// HERMETICITY: createApp boots the whole kit, which mutates process singletons — the runner
// service, the seed registration, the usage ledger, the hardware memo — and installLlm awaits
// hardware detection and records this app's cache in the family registry. `useHermeticKit()`
// snapshots and restores those, answers detection with a fake machine (no nvidia-smi), answers the
// memory-bandwidth probe "unmeasurable", and points JUST_AI_HOME and the user cache at a temp
// folder — nothing reads or writes the real registry (the kit's tests/install_llm.test.js does the
// same).
//
// `testClient(app)` requests through Hono's `app.request` from a non-loopback address (so the
// bearer guard bites) with `Host: testserver` (so `Origin: http://testserver` is the server's own).
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import * as seed from "@delebash/core/llm/seed";
import { getLedger, setLedger } from "@delebash/core/llm/usage";
import { model } from "@delebash/core/platform/models";
import * as bandwidth from "@delebash/core/runner/bandwidth";
import * as hardware from "@delebash/core/runner/hardware";
import * as lifecycle from "@delebash/core/runner/lifecycle";
import { HardwareInfo } from "@delebash/core/runner/schema";
import { afterEach, beforeEach, vi } from "vitest";

export const tmpDir = (prefix = "family-template-test-") => mkdtempSync(join(tmpdir(), prefix));

export const fakeHw = () =>
  model(HardwareInfo, {
    os: "Linux",
    platform: "linux",
    cpuCores: 8,
    ramMb: 32000,
    gpus: [{ vendor: "nvidia", name: "Test", vramMb: 8192 }],
    runtimes: { cuda: true },
  });

/** Register beforeEach/afterEach that keep the kit's singletons per test. */
export function useHermeticKit() {
  let saved;
  beforeEach(() => {
    saved = {
      service: lifecycle.state.service,
      app: seed.cfg._APP,
      ledger: getLedger(),
      hw: hardware.memo.hw,
    };
    lifecycle.state.service = null;
    seed.cfg._APP = { ...seed.cfg._APP };
    const t = tmpDir("family-template-kit-");
    vi.stubEnv("JUST_AI_HOME", join(t, "family"));
    vi.stubEnv("LLM_RUNNER_CACHE", join(t, "user-cache"));
    const box = fakeHw();
    hardware.setDetected(box);
    vi.spyOn(hardware, "detect").mockImplementation(async () => box);
    vi.spyOn(bandwidth, "probeRamCopyGbps").mockResolvedValue(null);
  });
  afterEach(() => {
    lifecycle.state.service = saved.service;
    seed.cfg._APP = saved.app;
    setLedger(saved.ledger);
    hardware.memo.hw = saved.hw;
  });
}

/**
 * The answer as the suites read it: `statusCode`, `headers` (a plain object, lowercase names),
 * `body` (the text), `rawPayload` (a Buffer) and a synchronous `json()` — the body is read once.
 */
async function answer(res) {
  const rawPayload = Buffer.from(await res.arrayBuffer());
  const body = rawPayload.toString("utf8");
  return {
    statusCode: res.status,
    headers: Object.fromEntries(res.headers),
    body,
    rawPayload,
    json: () => JSON.parse(body),
  };
}

/** A body as JSON with `content-type: application/json` (a caller's own content type wins). */
function withBody(init, json) {
  if (json === undefined) return init;
  return { ...init, body: JSON.stringify(json), headers: { "content-type": "application/json", ...init.headers } };
}

/**
 * Requests to `app` through `app.request`. Each verb takes (url, {json, params, headers, from}):
 * `from` is the client's address — another machine by default; "127.0.0.1" is this machine.
 */
export function testClient(app) {
  const call =
    (method) =>
    async (url, { json, params, headers, from = "192.0.2.10" } = {}) => {
      const qs = params ? `?${new URLSearchParams(params)}` : "";
      const init = withBody({ method, headers: { host: "testserver", ...(headers || {}) } }, json);
      // The client address rides on the Node request (`c.env.incoming`), where the kit's
      // clientHost reads it.
      const res = await app.request(`http://testserver${url}${qs}`, init, {
        incoming: { socket: { remoteAddress: from } },
      });
      return answer(res);
    };
  return {
    app,
    get: call("GET"),
    post: call("POST"),
    put: call("PUT"),
    patch: call("PATCH"),
    delete: call("DELETE"),
    request: (method, url, opts) => call(method)(url, opts),
  };
}
