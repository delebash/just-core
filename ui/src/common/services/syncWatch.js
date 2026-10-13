// SPDX-License-Identifier: MIT
// The family's sync watcher, beside the sync screen (components/SyncPanel.vue) — copied
// 2026-10-13 from JustWrite's `watchSync` (its services/projectApi.js, which is to switch to this
// one). The server's counter (GET /v1/sync/rev — the sync product
// `@delebash/sqlite-sync`) moves when another device's changes land: a sync with the cloud
// folder or a paired device, or a file imported by hand. Then `onChange` runs, and the app
// reloads what it shows by itself (JustWrite: its book list and the open book; JustVoice: the
// window). The interval is the server's sync setting `pollSeconds`. Returns a stop function.
import { get } from "./serverApi.js";

export function watchSync(onChange) {
  let last = null;
  let timer = null;
  let stopped = false;
  const tick = async () => {
    let wait = 5;
    try {
      const r = await get("/v1/sync/rev");
      wait = Number(r?.pollSeconds) > 0 ? Number(r.pollSeconds) : wait;
      if (last !== null && r.rev !== last) await onChange();
      last = r.rev;
    } catch {
      // the server is busy or restarting: try again next time
    }
    if (!stopped) timer = setTimeout(tick, wait * 1000);
  };
  void tick();
  return () => {
    stopped = true;
    clearTimeout(timer);
  };
}
