// SPDX-License-Identifier: MIT
// An image feature run as a job over HTTP (JustStage's Blender extension on a family host, 2026-10-29): refused at once
// in the kit's words when it can't run yet; else 202 with the job, its progress and cancel on /v1/jobs, and the picture
// fetched once from /v1/ai/image/jobs/:id/result — then the job and its file go.
import { existsSync, mkdtempSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, expect, test } from "vitest";
import { IMAGE_ADAPTERS } from "../src/llm/image_dispatch.js";
import { makeImageJobsRouter } from "../src/llm/image_jobs_api.js";
import { FeatureCatalogEntry } from "../src/llm/routing_api.js";
import * as seed from "../src/llm/seed.js";
import { JobRegistry } from "../src/platform/jobs.js";
import { makeJobsRouter } from "../src/platform/jobs_api.js";
import { createServer } from "../src/platform/server.js";
import { configureRuntimeServices } from "../src/runner/runtime_service.js";
import { freshDb } from "./helpers.js";

const realAdapter = IMAGE_ADAPTERS["local-sdcpp"];
const PNG = Buffer.from("\x89PNG\r\n\x1a\nthe picture", "latin1");
let engine;
let models;
beforeEach(() => {
  freshDb();
  seed.configureAppSeed({
    featureCatalog: [FeatureCatalogEntry({ key: "chat", label: "Chat" }), FeatureCatalogEntry({ key: "stage.render", label: "Stage render", kind: "image" })],
    featurePrompts: {},
    enginePresets: [
      { id: "talk", name: "Talk", provider_id: "local-llamacpp", model: "gemma" },
      { id: "render", name: "Render", provider_id: "local-sdcpp", model: "flux2-klein-4b", kind: "image", params: { steps: 4, cfg: 1, seed: 42 } },
    ],
    featurePresets: { "stage.render": "render" },
    defaultPresetId: "talk",
    runtimes: ["sdcpp"],
  });
  seed.seedLlm();
  engine = { installed: true, need: null };
  models = [{ id: "flux2-klein-4b", onDisk: true }];
  configureRuntimeServices([["sdcpp", { status: () => ({ id: "sdcpp", ...engine }), modelsStatus: () => models }]]);
});
afterEach(() => {
  IMAGE_ADAPTERS["local-sdcpp"] = realAdapter;
  configureRuntimeServices([]);
});

function host() {
  const jobs = new JobRegistry();
  const resultDir = path.join(mkdtempSync(path.join(tmpdir(), "kit-image-jobs-")), "image-jobs");
  const app = createServer({ typeBase: "t/" });
  app.route("/", makeJobsRouter(jobs));
  app.route("/", makeImageJobsRouter(jobs, { resultDir }));
  const post = (body) => app.request("/v1/ai/image/jobs", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  return { app, jobs, resultDir, post };
}
const until = async (check) => {
  for (let i = 0; i < 200 && !(await check()); i++) await new Promise((r) => setTimeout(r, 5));
};

test("a feature that can't run yet is refused at once, in the kit's words; nothing starts", async () => {
  const { post, jobs } = host();
  engine.installed = false;
  const r = await post({ feature: "stage.render", request: { prompt: "a stage" } });
  expect(r.status).toBe(409);
  expect(await r.json()).toMatchObject({ need: "engine-not-installed" });
  models = [{ id: "flux2-klein-4b", onDisk: false }];
  engine.installed = true;
  expect(await (await post({ feature: "stage.render", request: {} })).json()).toMatchObject({ need: "model-not-downloaded" });
  expect(jobs.list()).toEqual([]);
});

test("202 with the job; its progress on /v1/jobs; the picture fetched once, then the job and its file go", async () => {
  const seen = [];
  IMAGE_ADAPTERS["local-sdcpp"] = async ({ request, onProgress }) => {
    seen.push(request);
    onProgress?.({ step: 2, steps: 4, fraction: 0.5 });
    return PNG;
  };
  const { app, post, resultDir } = host();
  const init = Buffer.from("the init picture").toString("base64");
  const r = await post({ feature: "stage.render", request: { prompt: "a stage at dusk", width: 512, height: 512, seed: 7, init } });
  expect(r.status).toBe(202);
  const job = await r.json();
  expect(job).toMatchObject({ kind: "image", label: "stage.render", state: "running" });
  await until(async () => (await (await app.request(`/v1/jobs/${job.id}`)).json()).state === "done");
  // the request reached the feature with its pictures as bytes
  expect(seen[0]).toMatchObject({ prompt: "a stage at dusk", width: 512, height: 512, seed: 7 });
  expect(Buffer.isBuffer(seen[0].init) && seen[0].init.toString()).toBe("the init picture");
  expect((await (await app.request(`/v1/jobs/${job.id}`)).json()).result).toEqual({ contentType: "image/png", bytes: PNG.length });

  const res = await app.request(`/v1/ai/image/jobs/${job.id}/result`);
  expect(res.status).toBe(200);
  expect(res.headers.get("content-type")).toBe("image/png");
  expect(Buffer.from(await res.arrayBuffer()).equals(PNG)).toBe(true);
  // fetched once: the job is forgotten (410 with how it ended) and its file is gone
  expect((await app.request(`/v1/ai/image/jobs/${job.id}/result`)).status).toBe(410);
  expect(existsSync(resultDir) ? readdirSync(resultDir) : []).toEqual([]);
});

test("a running job's picture isn't ready (409); a cancelled one made none; DELETE /v1/jobs/:id cancels it", async () => {
  let release;
  IMAGE_ADAPTERS["local-sdcpp"] = ({ signal }) =>
    new Promise((resolve, reject) => {
      release = () => resolve(PNG);
      signal?.addEventListener("abort", () => reject(Object.assign(new Error("aborted"), { name: "AbortError" })));
    });
  const { app, post } = host();
  const job = await (await post({ feature: "stage.render", request: { prompt: "x" } })).json();
  await until(() => !!release);
  const early = await app.request(`/v1/ai/image/jobs/${job.id}/result`);
  expect(early.status).toBe(409);
  expect(await early.json()).toMatchObject({ type: expect.stringMatching(/job-running$/) });
  await app.request(`/v1/jobs/${job.id}`, { method: "DELETE" });
  await until(async () => (await (await app.request(`/v1/jobs/${job.id}`)).json()).state === "cancelled");
  const none = await app.request(`/v1/ai/image/jobs/${job.id}/result`);
  expect(none.status).toBe(409);
  expect(await none.json()).toMatchObject({ type: expect.stringMatching(/job-cancelled$/) });
});

// JustStage, 2026-10-29: a second job, accepted while one ran, ended at once "the graphics card is busy". They queue:
// the second waits (and says so), runs when the first ends; a Cancel while it waits ends it at once.
test("image jobs run one after the other: the second waits its turn; a queued one cancels at once", async () => {
  const gates = [];
  const ran = [];
  IMAGE_ADAPTERS["local-sdcpp"] = ({ request }) => {
    ran.push(request.prompt);
    return new Promise((resolve) => gates.push(() => resolve(PNG)));
  };
  const { app, post } = host();
  const state = async (id) => (await (await app.request(`/v1/jobs/${id}`)).json());
  const a = await (await post({ feature: "stage.render", request: { prompt: "first" } })).json();
  const b = await (await post({ feature: "stage.render", request: { prompt: "second" } })).json();
  const c3 = await (await post({ feature: "stage.render", request: { prompt: "third" } })).json();
  await until(() => gates.length === 1);
  expect(ran).toEqual(["first"]); // the others wait — none refused as busy
  expect(await state(b.id)).toMatchObject({ state: "running", message: "waiting for the picture before it" });
  // the third, cancelled while it waits: ended now, the first still running
  await app.request(`/v1/jobs/${c3.id}`, { method: "DELETE" });
  await until(async () => (await state(c3.id)).state === "cancelled");
  expect((await state(a.id)).state).toBe("running");
  gates[0]();
  await until(async () => (await state(a.id)).state === "done");
  await until(() => gates.length === 2);
  expect(ran).toEqual(["first", "second"]); // the cancelled third never ran
  gates[1]();
  await until(async () => (await state(b.id)).state === "done");
  expect(ran).toEqual(["first", "second"]);
});
