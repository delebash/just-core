// SPDX-License-Identifier: MIT
// The maintenance gate: while a restore or a reset replaces the data under a running server, every other
// window's writes are refused — 503 with Retry-After (RFC 9110 §15.6.4, "Service Unavailable … the server is
// currently unable to handle the request due to … scheduled maintenance") — instead of landing half-way
// through it or answering 200 and being lost (just-house-paint's eleventh review, 2026-10-20: a design saved
// during a restore vanished, a stale window's next save landed over the restored data). The writes already
// running finish first (a drain), so none of them interleaves with the replacement.
//
// The data router (data_api.js `makeDataRouter({ gate })`) closes it around a restore's and a reset's
// replacement; the app puts its middleware before its routes (`app.use("*", gate.middleware())`). Reads stay
// open: the restoring window shows its progress, and every window re-reads once it ends.

import { ApiError } from "./errors.js";

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

/** What a refused write says, by what is running. */
const WORDS = {
  restore: ["A backup is being restored", "your change wasn't saved — the app shows the restored data in a moment"],
  reset: ["The app is being reset", "your change wasn't saved — the app starts again from the beginning in a moment"],
};

export class MaintenanceGate {
  #reason = null;
  #active = 0;
  #idle = [];
  #exempt;
  #retryAfter;

  /** `exempt`: paths whose writes pass even while it is closed (the shell's shutdown) — the data router adds
   *  its own. `retryAfterSeconds`: the Retry-After a refused write carries. */
  constructor({ exempt = [], retryAfterSeconds = 5 } = {}) {
    this.#exempt = new Set(exempt);
    this.#retryAfter = retryAfterSeconds;
  }

  /** What is running ("restore" | "reset"), or null. */
  get reason() {
    return this.#reason;
  }

  /** A write to `path` passes the gate uncounted (the data router's own routes, which close it). */
  exempt(path) {
    this.#exempt.add(path);
  }

  /** The 503 a write gets while the gate is closed (`detail` in place of the write's). */
  refusal(detail = null) {
    const [title, words] = WORDS[this.#reason] || WORDS.restore;
    const e = new ApiError(503, "maintenance", title, detail || words);
    e.headers = { "Retry-After": String(this.#retryAfter) };
    return e;
  }

  /** Hono middleware: a write is refused while the gate is closed, and counted while it runs. */
  middleware() {
    return async (c, next) => {
      if (SAFE_METHODS.has(c.req.method) || this.#exempt.has(c.req.path)) return next();
      if (this.#reason) throw this.refusal();
      this.#active += 1;
      try {
        await next();
      } finally {
        this.#active -= 1;
        if (!this.#active) for (const done of this.#idle.splice(0)) done();
      }
    };
  }

  /**
   * Run `fn` with the gate closed for `reason`: new writes refused at once, the running ones finished first
   * (at most `drainMs` — a write that hangs never holds a restore forever). A second close while one runs is
   * refused (409). The gate opens again whatever `fn` does.
   */
  async closeFor(reason, fn, { drainMs = 60_000 } = {}) {
    if (this.#reason) throw new ApiError(409, "maintenance-busy", WORDS[this.#reason]?.[0] || "The data is being replaced", "try again when it's done");
    this.#reason = reason;
    try {
      if (this.#active) {
        let timer;
        await Promise.race([
          new Promise((r) => this.#idle.push(r)),
          new Promise((r) => {
            timer = setTimeout(r, drainMs);
          }),
        ]);
        clearTimeout(timer);
      }
      return await fn();
    } finally {
      this.#reason = null;
    }
  }
}
