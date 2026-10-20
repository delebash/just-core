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
  restart: ["The app needs a restart", "a restore couldn't put your data back while it ran — restart the app: it puts it back as it starts"],
};

export class MaintenanceGate {
  #reason = null;
  #active = 0;
  #idle = [];
  #exempt;
  #retryAfter;

  #isData;

  /** `exempt`: paths whose writes pass even while it is closed (the shell's shutdown) — the data router adds
   *  its own. `retryAfterSeconds`: the Retry-After a refused write carries. `isDataWrite(c)`: the writes it shuts
   *  out and waits for — by default every write; an app names its data writes (a slow AI run or a brand's download
   *  is no reason to hold a restore — just-house-paint's thirteenth review), the others pass. */
  constructor({ exempt = [], retryAfterSeconds = 5, isDataWrite = null } = {}) {
    this.#exempt = new Set(exempt);
    this.#retryAfter = retryAfterSeconds;
    this.#isData = isDataWrite;
  }

  /** What is running ("restore" | "reset"), "restart" (shut until the server starts again), or null. */
  get reason() {
    return this.#reason;
  }

  /** A write to `path` passes the gate uncounted (the data router's own routes, which close it). */
  exempt(path) {
    this.#exempt.add(path);
  }

  /** The 503 a write gets while the gate is closed (`detail` in place of the write's — never in place of the
   *  restart's own words). */
  refusal(detail = null) {
    const [title, words] = WORDS[this.#reason] || WORDS.restore;
    const e = new ApiError(503, "maintenance", title, (this.#reason !== "restart" && detail) || words);
    e.headers = { "Retry-After": String(this.#retryAfter) };
    return e;
  }

  /** Hono middleware: a write is refused while the gate is closed, and counted while it runs. */
  middleware() {
    return async (c, next) => {
      if (SAFE_METHODS.has(c.req.method) || this.#exempt.has(c.req.path) || (this.#isData && !this.#isData(c))) return next();
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

  /** Shut for good — until the server starts again (a restore that couldn't put the data back: what the tables
   *  name isn't in the folders until the next start puts them back). */
  closeUntilRestart() {
    this.#reason = "restart";
  }

  /**
   * Run `fn` with the gate closed for `reason`: new writes refused at once, the running ones finished first. One
   * still running after `drainMs` refuses `fn` instead (409 — never a restore under a write half done). A second
   * close while one runs is refused (409). The gate opens again whatever `fn` does — unless it was shut until a
   * restart meanwhile.
   */
  async closeFor(reason, fn, { drainMs = 60_000 } = {}) {
    if (this.#reason === "restart") throw this.refusal();
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
        if (this.#active) throw new ApiError(409, "maintenance-busy", "A change is still being saved", "nothing was replaced — try again in a moment");
      }
      return await fn();
    } finally {
      if (this.#reason === reason) this.#reason = null;
    }
  }
}
