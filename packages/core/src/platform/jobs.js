// SPDX-License-Identifier: MIT
// Long server work as a job the screen polls — 202 Accepted and a job resource to read and DELETE (RFC 9110
// §15.3.3; Microsoft REST API Guidelines, long-running operations): the engines plan's K9, moved from
// just-house-paint's jobs.js (finding a photo's parts, a brand's colors, an AI photo). One job per kind and key (a
// house, a brand) at a time: starting one that is already running answers the running one. A finished job is kept a
// while for the poller to read, then forgotten — its end remembered, so a window that slept through it is told how it
// ended (410 Gone), not that the server started again. The route is jobs_api.js; the screen's side is the ui
// package's services/serverJob.js `runServerJob`, inside `withAiTask`.

import { randomUUID } from "node:crypto";
import { getLogger } from "./log.js";

const log = getLogger("llm_runner.platform.jobs");

const isAbort = (e) => e?.name === "AbortError" || e?.code === "ABORT_ERR";

export class JobRegistry {
  /** `keepMs` how long a finished job is kept to be read; `onFinish(job)` a job ended (done, failed or cancelled) —
   *  the window that started it changed something (the kit's ChangeCounter counts it as that window's). */
  constructor({ keepMs = 10 * 60_000, onFinish = null } = {}) {
    this.keepMs = keepMs;
    this.jobs = new Map();
    // a forgotten job's end, kept for this process's life (the last 1000): a window that slept through it is told it
    // ended — not that the server started again (410 Gone)
    this.ended = new Map();
    this.onFinish = onFinish;
  }

  /** The running job of this kind and key, if any. */
  running(kind, key) {
    for (const j of this.jobs.values()) if (j.kind === kind && j.key === key && j.state === "running") return j;
    return null;
  }

  /** The running jobs for `key` (a house), as the wire shows them — a page opened or reloaded while they run
   *  attaches to them. */
  runningFor(key) {
    return [...this.jobs.values()].filter((j) => j.key === key && j.state === "running").map(snapshot);
  }

  /** A running job of any of these kinds (for any key), or null. */
  busy(kinds) {
    for (const j of this.jobs.values()) if (kinds.includes(j.kind) && j.state === "running") return j;
    return null;
  }

  /**
   * Start `fn({ signal, progress })` as a job (or answer the one already running for this kind and key).
   * `progress(fraction 0–1, message?)` reports along the way; the returned value is the job's result. `failTitle`
   * names what failed when the error has no title of its own; `clientId` the window that started it; `meta` its
   * choices (a second start reads them). Returns the job's snapshot.
   */
  start({ kind, key = "", label = "", failTitle = "", clientId = null, meta = null }, fn) {
    this.sweep();
    const existing = this.running(kind, key);
    if (existing) return snapshot(existing);
    const controller = new AbortController();
    const job = {
      id: randomUUID(),
      kind,
      key,
      label,
      state: "running",
      progress: 0,
      message: "",
      result: null,
      error: null,
      startedAt: new Date().toISOString(),
      finishedAt: null,
      controller,
      clientId,
      meta,
    };
    this.jobs.set(job.id, job);
    const progress = (fraction, message) => {
      if (job.state !== "running") return;
      job.progress = Math.max(job.progress, Math.min(1, Number(fraction) || 0));
      if (message !== undefined) job.message = String(message);
    };
    const finish = (state, fields) => {
      Object.assign(job, { state, finishedAt: new Date().toISOString() }, fields);
      try {
        this.onFinish?.(job);
      } catch {
        // a watcher's error never fails the job
      }
    };
    job.settled = Promise.resolve()
      .then(() => fn({ signal: controller.signal, progress }))
      .then(
        // the work returned: it is done (and saved), even when Cancel came while it was committing
        (result) => finish("done", { result: result ?? null, progress: 1 }),
        (err) => {
          if (controller.signal.aborted || isAbort(err)) return finish("cancelled", {});
          log.error(`${kind} ${key}: ${err?.message || err}`, err);
          // the refusal's own title (an ApiError's), else what the job was doing — the screen's heading
          const title = (typeof err?.title === "string" && err.title) || failTitle || null;
          finish("error", { error: { message: String(err?.message || err), status: err?.statusCode ?? null, title } });
        },
      );
    return snapshot(job);
  }

  get(id) {
    const j = this.jobs.get(id);
    return j ? snapshot(j) : null;
  }

  /** Ask a running job to stop; true when there was one. */
  cancel(id) {
    const j = this.jobs.get(id);
    if (!j || j.state !== "running") return false;
    j.controller.abort();
    return true;
  }

  /** Forget finished jobs older than `keepMs` — each one's end kept (ended). */
  sweep(now = Date.now()) {
    for (const [id, j] of this.jobs) {
      if (j.state !== "running" && j.finishedAt && now - Date.parse(j.finishedAt) > this.keepMs) {
        this.jobs.delete(id);
        this.ended.set(id, { id, kind: j.kind, key: j.key, state: j.state, finishedAt: j.finishedAt });
        if (this.ended.size > 1000) this.ended.delete(this.ended.keys().next().value);
      }
    }
  }

  /** Stop everything (the server is closing, the data is about to be replaced). Resolves once every one of them
   *  has ended — at most `waitMs`: a job past its last check of the signal (a commit) finishes what it does before
   *  anything is replaced under it. */
  cancelAll({ waitMs = 30_000 } = {}) {
    const running = [...this.jobs.values()].filter((j) => j.state === "running");
    for (const j of running) j.controller.abort();
    let timer;
    const ended = Promise.all(running.map((j) => j.settled?.catch(() => {})));
    return Promise.race([ended, new Promise((r) => (timer = setTimeout(r, waitMs)))]).finally(() => clearTimeout(timer));
  }
}

/** The wire shape (camelCase, no internals). */
function snapshot(j) {
  return {
    id: j.id,
    kind: j.kind,
    key: j.key,
    label: j.label,
    state: j.state,
    progress: j.progress,
    message: j.message,
    result: j.result,
    error: j.error,
    startedAt: j.startedAt,
    finishedAt: j.finishedAt,
  };
}
