// SPDX-License-Identifier: MIT
// Application-wide state — the family setState/getState seam (JW, JV, docgen): the data folder and
// the open database, set once by createApp and read by the routes and the stores' callers.

import { RuntimeError } from "@delebash/core/platform/py";

export class AppState {
  /** @param {string} dataDir  @param {object} db the kit's database handle (platform/sql.js) */
  constructor(dataDir, db) {
    this.dataDir = dataDir;
    this.db = db;
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
