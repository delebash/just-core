// SPDX-License-Identifier: MIT
// Application-wide state — the family setState/getState seam (JW, JV, docgen): the data folder and
// the open database, set once by createApp and read by the routes and the stores' callers.

import { RuntimeError } from "@delebash/core/platform/py";

export class AppState {
  /** @param {string} dataDir  @param {object} db the kit's database handle (platform/sql.js)
   *  @param {object} [opts] `changes`: the kit's ChangeCounter (other windows' changes — a restore or a reset is
   *  everyone's); `jobs`: the kit's JobRegistry (long work: an image feature run as a job — /v1/jobs, /v1/ai/image/jobs) */
  constructor(dataDir, db, { changes = null, jobs = null } = {}) {
    this.dataDir = dataDir;
    this.db = db;
    this.changes = changes;
    this.jobs = jobs;
  }
}

let STATE = null;

export function setState(state) {
  STATE = state;
}

export function getState() {
  if (STATE === null) throw new RuntimeError("AppState not initialized — call setState() during boot");
  return STATE;
}

/** The open database (the stores take it as their first argument). */
export const getDb = () => getState().db;
