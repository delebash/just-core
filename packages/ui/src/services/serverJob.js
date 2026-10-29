// SPDX-License-Identifier: MIT
// A long server job (finding parts, a brand's colors, an AI photo) seen from the screen: the start request, then
// `GET /v1/jobs/:id` until it ends — inside `withAiTask` (app-structure §8, the AI-call convention: app code never
// owns a task's lifecycle). The engines plan's K9, moved from just-house-paint's services/jobs.js; the server's side is
// the core package's platform/jobs.js (JobRegistry) and jobs_api.js (makeJobsRouter). Its progress shows where the
// user started it — that screen's AiTaskStrip, found with useSurfaceTask(feature, meta) — and in the kit's global
// stack whenever no screen shows it; either's Cancel stops it on the server too. A caller that takes the job's own
// events (`onEvent` — docgen's staged proposals as they land) follows its event stream instead of polling, and
// polls again if the stream drops (the round D2 of the engines plan).
import { authHeaders, del, get, serverUrl } from "../common/services/serverApi.js";
import { readSseFrames } from "../common/services/sseFrames.js";
import { serverFetch } from "../common/services/transport.js";
import { kitT } from "../common/services/kitI18n.js";
import { withAiTask } from "./appTask.js";

export const JOB_POLL_MS = 400;

const wait = (ms, signal) =>
  new Promise((resolve, reject) => {
    const onAbort = () => {
      clearTimeout(t);
      reject(Object.assign(new Error("cancelled"), { name: "AbortError" }));
    };
    // the listener goes with the wait: a long job polls thousands of times on one signal
    const t = setTimeout(() => {
      signal?.removeEventListener?.("abort", onAbort);
      resolve();
    }, ms);
    signal?.addEventListener?.("abort", onAbort, { once: true });
  });

/** The job isn't on the server any more — it started again (the tray's Restart, a reboot) and what it was doing
 *  stopped. The caller reads what it has now (a commit may have landed before). */
export function jobGone() {
  const message = kitT("kit.jobs.gone");
  return Object.assign(new Error(message), { name: "JobGone", status: 404, problem: { title: message, detail: "" }, errors: [], requestId: null });
}

/** A job that ended unseen without finishing — failed or cancelled while the window was away (asleep): said as
 *  that, never as "the server started again", which it didn't. */
export function jobEndedAway(state) {
  const message = kitT(state === "cancelled" ? "kit.jobs.cancelledAway" : "kit.jobs.endedAway");
  return Object.assign(new Error(message), { name: "JobEnded", state, status: 410, problem: { title: message, detail: "" }, errors: [], requestId: null });
}

/** The job ended a while ago and the server forgot it (410 — a window asleep through it): `state` says how; the
 *  caller reads what it left. */
export function jobEnded(state) {
  // failed or cancelled unseen: in words, wherever it surfaces
  if (state !== "done") return jobEndedAway(state);
  return Object.assign(new Error(`ended: ${state}`), { name: "JobEnded", state });
}

/** One look at the job — a network failure (a laptop waking, Wi-Fi coming back) is tried again with a growing wait
 *  (0.4 s → 10 s) for as long as it takes, a busy server (5xx) ten times; neither is the end of the job. A job that
 *  ended while away is jobEnded; one the server never had (it started again) is jobGone. */
async function poll(id, signal) {
  let busy = 0;
  for (let delay = JOB_POLL_MS; ; delay = Math.min(delay * 2, 10_000)) {
    try {
      return await get(`/v1/jobs/${encodeURIComponent(id)}`);
    } catch (e) {
      if (e?.status === 410) throw jobEnded(e.problem?.state || "done");
      if (e?.status === 404) throw jobGone();
      if (e?.status && (e.status < 500 || ++busy > 10)) throw e;
      await wait(delay, signal);
    }
  }
}

/** Follow job `id`'s events (GET /v1/jobs/:id/events, through the server transport — the access token rides):
 *  `onJob(snapshot)` for each snapshot, `onEvent(event)` for the job's own events. Resolves with the ended job's
 *  snapshot, or null when the stream closed before its end (it dropped: the caller polls). */
async function followEvents(id, { onJob, onEvent, signal }) {
  const res = await serverFetch(serverUrl(`/v1/jobs/${encodeURIComponent(id)}/events`), { headers: authHeaders(), signal });
  if (!res.ok || !res.body) return null;
  let ended = null;
  await readSseFrames(res, (payload) => {
    let e;
    try {
      e = JSON.parse(payload);
    } catch {
      return false;
    }
    if (e.type === "job") onJob(e.job);
    else if (e.type === "end") {
      ended = e.job;
      return true;
    } else onEvent(e);
    return false;
  });
  return ended;
}

/** The Error a failed job becomes — shaped like the kit transport's (§15), so reportError reads it: the server's
 *  title for what failed ("The AI photo didn't finish"), its words as the detail. */
export function jobError(job) {
  const message = job.error?.message || kitT("kit.jobs.failed");
  const status = job.error?.status || 500;
  return Object.assign(new Error(message), { status, problem: { title: job.error?.title || "", detail: message }, errors: [], requestId: null });
}

/**
 * Run a server job as one task. `start()` posts the request and answers the job's snapshot; `feature` and `label`
 * name the task on the strip, `meta` tells its screen which run is its own (a house's id, a brand); `describe(job,
 * percent)` words the progress from the job's own message (the part being found — "Trim · 40%"), else the percent
 * alone. `onEvent(event)` takes the job's own events (`{ type, ...payload }`, and `{ type: "cancelling" }`) and
 * `onJob(snapshot)` each snapshot (its `data`) — given either, the job's event stream is followed, polling again if
 * it drops. Resolves with the job's result; a cancel rejects with an AbortError (the strip shows it as cancelled, never
 * as a failure).
 */
export function runServerJob({ start, feature, label, meta, describe, onEvent, onJob, pollMs = JOB_POLL_MS }) {
  return withAiTask({ feature, label, meta }, async (task) => {
    let job = await start();
    task.signal.addEventListener("abort", () => del(`/v1/jobs/${encodeURIComponent(job.id)}`).catch(() => {}), { once: true });
    const shown = (j) => {
      job = j;
      const pct = Math.round((j.progress || 0) * 100);
      task.setProgress(pct, 100, describe?.(j, pct) || kitT("kit.jobs.percent", { n: pct }));
      onJob?.(j);
    };
    if ((onEvent || onJob) && job.state === "running") {
      shown(job);
      try {
        const ended = await followEvents(job.id, { onJob: shown, onEvent: (e) => onEvent?.(e), signal: task.signal });
        if (ended) job = ended;
      } catch (e) {
        if (task.signal.aborted) throw Object.assign(new Error("cancelled"), { name: "AbortError" });
        // the network failed under the stream (a proxy, a laptop waking): polling carries on from here; anything
        // else (the caller's onEvent threw) is the job's caller's error
        if (!(e instanceof TypeError)) throw e;
      }
    }
    while (job.state === "running") {
      shown(job);
      await wait(pollMs, task.signal);
      job = await poll(job.id, task.signal);
    }
    if (job.state === "cancelled") throw Object.assign(new Error("cancelled"), { name: "AbortError" });
    if (job.state === "error") throw jobError(job);
    // wrapped: the kit unwraps a bare `{ result }`, and a job's own result may have that key
    return { result: job.result };
  });
}
