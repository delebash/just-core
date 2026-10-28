// SPDX-License-Identifier: MIT
// A long server job (the engines plan's K9, moved from just-house-paint): the registry's states and the route's
// answers — one job per kind and key, a failure named, a Cancel during the commit not called a cancel, a job ended
// and forgotten said as 410 with how it ended, an unknown one 404, DELETE stopping one.
import { expect, test } from "vitest";
import { ApiError } from "../src/platform/errors.js";
import { JobRegistry } from "../src/platform/jobs.js";
import { makeJobsRouter } from "../src/platform/jobs_api.js";
import { createServer } from "../src/platform/server.js";

const settle = async (jobs, id) => {
  for (let i = 0; i < 100 && jobs.get(id).state === "running"; i++) await new Promise((r) => setTimeout(r, 5));
  return jobs.get(id);
};
const tick = () => new Promise((r) => setTimeout(r, 0));
/** Work that stops when its signal aborts (also when it was aborted before the work began). */
const stopsOnSignal = ({ signal }) =>
  new Promise((_, no) => {
    const stop = () => no(Object.assign(new Error("x"), { name: "AbortError" }));
    if (signal.aborted) stop();
    else signal.addEventListener("abort", stop);
  });

test("one job per kind and key: a second start answers the running one; its progress only goes up", async () => {
  const jobs = new JobRegistry();
  let progress;
  let release;
  const a = jobs.start({ kind: "find-parts", key: "h1", label: "Main street" }, (j) => {
    progress = j.progress;
    return new Promise((r) => (release = r));
  });
  expect(jobs.start({ kind: "find-parts", key: "h1" }, async () => "never").id).toBe(a.id);
  const other = jobs.start({ kind: "find-parts", key: "h2" }, async () => 2);
  expect(other.id).not.toBe(a.id);
  await tick();
  progress(0.5, "Trim");
  progress(0.3);
  expect(jobs.get(a.id)).toMatchObject({ state: "running", progress: 0.5, message: "Trim", label: "Main street" });
  expect(jobs.runningFor("h1").map((j) => j.id)).toEqual([a.id]);
  expect(jobs.busy(["find-parts"])?.id).toBe(a.id);
  release({ parts: 3 });
  expect(await settle(jobs, a.id)).toMatchObject({ state: "done", progress: 1, result: { parts: 3 } });
  expect(jobs.runningFor("h1")).toEqual([]);
});

test("a failed job names what failed: the refusal's own title, else the job's", async () => {
  const jobs = new JobRegistry();
  const raw = jobs.start({ kind: "aiphoto", key: "h1", failTitle: "The AI photo didn't finish" }, async () => {
    throw new Error("sd-cli failed (exit 3)");
  });
  expect((await settle(jobs, raw.id)).error).toEqual({ message: "sd-cli failed (exit 3)", status: null, title: "The AI photo didn't finish" });
  const refused = jobs.start({ kind: "aiphoto", key: "h2", failTitle: "The AI photo didn't finish" }, async () => {
    throw new ApiError(409, "models-missing", "The AI photo isn't installed", "install it first");
  });
  expect((await settle(jobs, refused.id)).error).toMatchObject({ status: 409, title: "The AI photo isn't installed" });
});

test("work that returned is done — a Cancel that came while it was saving doesn't call it cancelled", async () => {
  const jobs = new JobRegistry();
  let release;
  const job = jobs.start({ kind: "find-parts", key: "h1" }, () => new Promise((r) => (release = r)));
  await tick(); // the work starts on the next turn
  jobs.cancel(job.id);
  release({ parts: 3 });
  expect(await settle(jobs, job.id)).toMatchObject({ state: "done", result: { parts: 3 } });
  // work that stops on the signal is cancelled
  const stops = jobs.start({ kind: "find-parts", key: "h2" }, stopsOnSignal);
  jobs.cancel(stops.id);
  expect((await settle(jobs, stops.id)).state).toBe("cancelled");
});

test("a job's end is its window's change; cancelAll stops every running one and waits for them", async () => {
  const ends = [];
  const jobs = new JobRegistry({ onFinish: (j) => ends.push([j.clientId, j.state]) });
  jobs.start({ kind: "load", key: "behr", clientId: "w1" }, stopsOnSignal);
  jobs.start({ kind: "load", key: "valspar", clientId: "w2" }, stopsOnSignal);
  await tick();
  await jobs.cancelAll({ waitMs: 1000 });
  expect(ends.sort()).toEqual([
    ["w1", "cancelled"],
    ["w2", "cancelled"],
  ]);
});

test("the route: a job read and stopped; ended and forgotten is 410 with how it ended; unknown is 404", async () => {
  const jobs = new JobRegistry({ keepMs: 0 });
  const app = createServer({ typeBase: "https://example.test/errors/" });
  app.route("/", makeJobsRouter(() => jobs));
  const running = jobs.start({ kind: "find-parts", key: "h1" }, stopsOnSignal);
  await tick();
  const got = await app.request(`/v1/jobs/${running.id}`);
  expect(got.status).toBe(200);
  expect(await got.json()).toMatchObject({ id: running.id, kind: "find-parts", key: "h1", state: "running" });
  // DELETE asks it to stop, and answers the job as it is then
  const del = await app.request(`/v1/jobs/${running.id}`, { method: "DELETE" });
  expect(del.status).toBe(200);
  expect((await settle(jobs, running.id)).state).toBe("cancelled");
  // finished past keepMs: forgotten at the next start's sweep, its end kept
  await new Promise((r) => setTimeout(r, 2));
  jobs.start({ kind: "other", key: "" }, async () => null);
  const gone = await app.request(`/v1/jobs/${running.id}`);
  expect(gone.status).toBe(410);
  expect(await gone.json()).toMatchObject({ title: "This work ended a while ago", state: "cancelled", kind: "find-parts" });
  expect((await app.request("/v1/jobs/no-such-job")).status).toBe(404);
  expect((await app.request("/v1/jobs/no-such-job", { method: "DELETE" })).status).toBe(404);
  expect((await app.request("/v1/jobs/not%20an%20id")).status).toBe(422);
});
