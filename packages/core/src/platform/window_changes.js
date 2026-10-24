// SPDX-License-Identifier: MIT
// Other windows' changes — the server half of the kit's watchSync contract (its screen half is the UI kit's
// common/services/syncWatch.js + otherWindows.js). One server, several windows — the desktop app, a browser on the
// server started on its own, a phone — and an open page read its data once: a window saved over what another had
// changed, unseen (just-house-paint's eleventh review, 2026-10-20; moved here from its server/src/changes.js,
// docs/plans/2026-10-24-engines-the-llama-way.md F1). Each window sends its id (X-Client-Id — the UI kit's
// transport, installLlmUi `sendClientId`); every write to the app's data that succeeds is a change by that window,
// and GET /v1/sync/rev answers each window the count of changes the OTHERS made (the counter moves, the page reads
// again).
//
// Two signals: `boot`, this process's — a server started again counts from 0, so the answer's `rev` carries it and
// a restart is a change (the page reads again in place); and `epoch`, kept in the app's settings rows and renewed
// only by a restore or a reset that succeeded — the data was replaced, the window reloads.
import { randomUUID } from "node:crypto";
import { Hono } from "./server.js";

// a window not heard from in a day is forgotten (each load of a page is a new window), looked over at most hourly
const FORGET_MS = 24 * 3600_000;
// A window's id is what its page sends (the kit's transport sends a UUID): taken only when it is up to 64 visible ASCII
// characters, else the write counts as no window's; and at most 500 windows are remembered, the one heard from longest
// ago forgotten first (just-house-paint's nineteenth review: any length, any number, kept a day).
const CLIENT_ID = /^[!-~]{1,64}$/;
const MAX_WINDOWS = 500;

/** `id` as a window's id, or null. */
export const clientIdOf = (id) => (typeof id === "string" && CLIENT_ID.test(id) ? id : null);

export class ChangeCounter {
  #total = 0;
  #mine = new Map(); // window id → { n: its changes, seen: when it last asked or wrote }
  #swept = Date.now();
  #db = null;
  #writes;
  #getSetting;
  #setSetting;
  #key;
  boot = randomUUID();

  /**
   * `writes`: the paths of the app's data writes (a RegExp — what changes what another window shows; the app's
   * MaintenanceGate takes the same one). `getSetting(h, key)` / `setSetting(h, key, value)`: the app's settings store
   * (the template's database/settings.js), where the data's epoch is kept as the `epochKey` row — a row Settings
   * doesn't show. `db`: the database, when it is open already (else useDatabase).
   */
  constructor({ writes = null, getSetting = null, setSetting = null, epochKey = "dataEpoch", db = null } = {}) {
    this.#writes = writes;
    this.#getSetting = getSetting;
    this.#setSetting = setSetting;
    this.#key = epochKey;
    if (db) this.useDatabase(db);
  }

  /** The database the data's epoch is kept in (the app opens it after the counter's middleware is in place): one
   *  made there now if it has none — a poll only ever reads it. */
  useDatabase(db) {
    this.#db = db;
    if (this.#getSetting && typeof this.#getSetting(db, this.#key) !== "string") this.renewEpoch(db);
  }

  /** The data's epoch renewed, on `h` — inside a restore's transaction (its afterCopy), right after a reset's seed. */
  renewEpoch(h) {
    this.#setSetting?.(h, this.#key, randomUUID());
  }

  /** The data's epoch: renewed by a restore or a reset that succeeded (renewEpoch). */
  get epoch() {
    const e = this.#db && this.#getSetting ? this.#getSetting(this.#db, this.#key) : null;
    return typeof e === "string" ? e : this.boot;
  }

  #window(id) {
    const now = Date.now();
    if (now - this.#swept > 3600_000) {
      this.#swept = now;
      for (const [k, v] of this.#mine) if (now - v.seen > FORGET_MS) this.#mine.delete(k);
    }
    // the Map keeps the order windows were last heard from in: the first is the one heard from longest ago
    let w = this.#mine.get(id);
    if (w) this.#mine.delete(id);
    else {
      w = { n: 0, seen: now };
      while (this.#mine.size >= MAX_WINDOWS) this.#mine.delete(this.#mine.keys().next().value);
    }
    this.#mine.set(id, w);
    w.seen = now;
    return w;
  }

  /** A change made by window `clientId` — none: by no window (a job's end with no window behind it). */
  note(clientId = null) {
    this.#total += 1;
    const id = clientIdOf(clientId);
    if (id) this.#window(id).n += 1;
  }

  /** Everything changed (a restore, a reset that succeeded — its epoch already renewed): every window asks again. */
  replaced() {
    this.#total += 1;
    if (!this.#db) this.boot = randomUUID();
  }

  /** The count of changes window `clientId` didn't make in this process. */
  revFor(clientId = null) {
    const id = clientIdOf(clientId);
    return this.#total - (id ? this.#window(id).n : 0);
  }

  /** How many windows it remembers (a test reads it). */
  get windows() {
    return this.#mine.size;
  }

  /** Hono middleware: a write to the app's data that succeeded is its window's change. */
  middleware() {
    return async (c, next) => {
      await next();
      if (c.req.method === "GET" || c.req.method === "HEAD" || c.req.method === "OPTIONS") return;
      if (c.res.status >= 400 || !this.#writes?.test(c.req.path)) return;
      this.note(c.req.header("x-client-id") || null);
    };
  }
}

/**
 * GET /v1/sync/rev — `rev` moves when another window changed something on this server, and the page reads again;
 * `epoch` is new after a restore or a reset (everything changed); `pollSeconds` how often a window asks (the app's
 * setting). `rev` is opaque — this process's boot id and the count: a server started again (its count from 0) is a
 * change to the window even where the counts happen to match. `changes`: the counter, or a function answering it.
 */
export function makeSyncRevRouter(changes, { pollSeconds = () => 5 } = {}) {
  const counter = typeof changes === "function" ? changes : () => changes;
  const app = new Hono();
  app.get("/v1/sync/rev", (c) => {
    const ch = counter();
    const n = ch.revFor(c.req.header("x-client-id") || null);
    return c.json({ rev: `${ch.boot}:${n}`, epoch: ch.epoch, pollSeconds: pollSeconds() ?? 5 });
  });
  return app;
}
