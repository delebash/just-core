// SPDX-License-Identifier: MIT
// /v1/jobs — long jobs over the app's JobRegistry (the engines plan's K9, moved from just-house-paint's
// api/jobs_api.js; round D2's list and events for docgen's run):
//   GET    /v1/jobs?kind=&key=     the running ones (a reloaded page rejoins what runs);
//   GET    /v1/jobs/:id            what one is doing (the screen polls it: the ui package's runServerJob) — 410 once
//                                  ended and forgotten, 404 unknown;
//   GET    /v1/jobs/:id/events     its events as server-sent events (html.spec.whatwg.org/multipage/server-sent-events
//                                  .html): the snapshot first, each event a `data: <json>` frame, a 15 s keepalive
//                                  comment, closed after `end` — the way the kit streams a run (llm/prompts.js);
//   DELETE /v1/jobs/:id            stop it.
// A job's own start is the app's route (202 with the job's snapshot); a list of what runs for one of the app's things
// (a house's jobs) may be the app's too, from JobRegistry.runningFor.

import { Hono } from "hono";
import { ApiError, notFound } from "./errors.js";
import { T } from "./models.js";
import { input, stream } from "./server.js";

const IdParams = T.Object({ id: T.String({ minLength: 1, maxLength: 64, pattern: "^[A-Za-z0-9_-]+$" }) });
const ListQuery = T.Object({ kind: T.Optional(T.String({ maxLength: 64 })), key: T.Optional(T.String({ maxLength: 200 })) });
/** How long an idle event stream waits before a keepalive comment (a proxy or a laptop's network drops a silent one). */
export const KEEPALIVE_MS = 15_000;
const frame = (event) => `data: ${JSON.stringify(event)}\n\n`;

/** The jobs routes over `jobs` — the app's JobRegistry, or a function answering it (read on every request). */
export function makeJobsRouter(jobs, { keepaliveMs = KEEPALIVE_MS } = {}) {
  const registry = typeof jobs === "function" ? jobs : () => jobs;
  const app = new Hono();
  app.get("/v1/jobs", input({ querystring: ListQuery }), (c) => {
    const { kind, key } = c.req.valid("query");
    return c.json({ jobs: registry().list({ kind: kind ?? null, key: key ?? null }) });
  });
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
  app.get("/v1/jobs/:id/events", input({ params: IdParams }), (c) => {
    const id = c.req.valid("param").id;
    const jobs = registry();
    const first = jobs.get(id);
    if (!first) {
      const ended = jobs.ended?.get(id);
      if (ended) throw new ApiError(410, "job-ended", "This work ended a while ago", `it ended as ${ended.state}`, { state: ended.state, kind: ended.kind });
      throw notFound(`no job ${id}`);
    }
    c.header("Content-Type", "text/event-stream; charset=utf-8");
    c.header("Cache-Control", "no-cache");
    return stream(
      c,
      (s) =>
        new Promise((resolve) => {
          let closed = false;
          let keepalive = null;
          let off = null;
          const finish = () => {
            if (closed) return;
            closed = true;
            clearTimeout(keepalive);
            off?.();
            resolve();
          };
          const arm = () => {
            clearTimeout(keepalive);
            keepalive = setTimeout(() => {
              if (closed) return;
              s.write(": keepalive\n\n");
              arm();
            }, keepaliveMs);
          };
          const send = (event) => {
            if (closed) return;
            s.write(frame(event));
            arm();
            if (event.type === "end") finish();
          };
          s.onAbort(finish);
          // the snapshot first; a job already ended answers its end at once
          send({ type: "job", job: first });
          if (first.state !== "running") return send({ type: "end", job: first });
          off = jobs.subscribe(id, send);
          // it ended between the read and the subscription: its end, as it is now
          if (!off) send({ type: "end", job: jobs.get(id) ?? first });
        }),
    );
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
