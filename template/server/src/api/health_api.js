// SPDX-License-Identifier: MIT
// GET /v1/health — the kit's router (makeHealthRouter): the family's base wire
// {status, product, version, apiVersion}, which the renderer's boot gate (the kit's checkServer)
// and the desktop shell read, plus this app's extras — where its data is and whether its database
// is open (JustWrite's pair).

import { makeHealthRouter } from "@delebash/core/platform/health_api";
import { getState } from "../app_state.js";
import { API_VERSION, PRODUCT, VERSION } from "../version.js";

export const router = () =>
  makeHealthRouter({
    product: PRODUCT,
    version: VERSION,
    apiVersion: API_VERSION,
    extras: () => {
      const state = getState();
      return { dataDir: state.dataDir, dbReady: !!state.db };
    },
  });
