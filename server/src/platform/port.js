// SPDX-License-Identifier: MIT
// Is something listening on this computer's port? A connection to 127.0.0.1 answers it — asked by
// the desktop shell (is the port free again after a stop) and by the server's own start, before
// any of the app's code opens its database (serve.js `resolvePort`). A listener on 127.0.0.1 and
// one on every address (0.0.0.0) both accept it, where a trial bind would not tell: Windows binds
// 127.0.0.1:<port> beside a listener on 0.0.0.0:<port>, and the other way round (measured
// 2026-10-13, RESEARCH).

import net from "node:net";

/** The address the probe connects to. */
export const PROBE_HOST = "127.0.0.1";

/** True when something accepts a connection on 127.0.0.1:`port` within 300 ms. */
export function portInUse(port) {
  return new Promise((resolve) => {
    const s = net.connect({ host: PROBE_HOST, port, timeout: 300 });
    s.once("connect", () => {
      s.destroy();
      resolve(true);
    });
    s.once("error", () => resolve(false));
    s.once("timeout", () => {
      s.destroy();
      resolve(false);
    });
  });
}
