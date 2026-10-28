// SPDX-License-Identifier: MIT
// /v1/jobs/:id — what a long job is doing (the screen polls it: the ui package's runServerJob, inside withAiTask)
// and DELETE to stop it; the engines plan's K9, moved from just-house-paint's api/jobs_api.js. A job's own start is
// the app's route (202 with the job's snapshot); a list of what runs for one of the app's things (a house's jobs)
// is the app's too, from JobRegistry.runningFor.

import { Hono } from "hono";
import { ApiError, notFound } from "./errors.js";
import { T } from "./models.js";
import { input } from "./server.js";

const IdParams = T.Object({ id: T.String({ minLength: 1, maxLength: 64, pattern: "^[A-Za-z0-9_-]+$" }) });

/** The jobs routes over `jobs` — the app's JobRegistry, or a function answering it (read on every request). */
export function makeJobsRouter(jobs) {
  const registry = typeof jobs === "function" ? jobs : () => jobs;
  const app = new Hono();
  app.get("/v1/jobs/:id", input({ params: IdParams }), (c) => {
    const id = c.req.valid("param").id;
    const job = registry().get(id);
    if (job) return c.json(job);
    // ended a while ago and forgotten: 410 Gone (RFC 9110 §15.5.11) with how it ended — the window reads what it
    // left; unknown (the server started again since): 404
    const ended = registry().ended?.get(id);
    if (ended) throw new ApiError(410, "job-ended", "This work ended a while ago", `it ended as ${ended.state}`, { state: ended.state, kind: ended.kind });
    throw notFound(`no job ${id}`);
  });
  app.delete("/v1/jobs/:id", input({ params: IdParams }), (c) => {
    const id = c.req.valid("param").id;
    const job = registry().get(id);
    if (!job) throw notFound(`no job ${id}`);
    registry().cancel(job.id);
    return c.json(registry().get(job.id));
  });
  return app;
}
