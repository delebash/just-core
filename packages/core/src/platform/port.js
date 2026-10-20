// SPDX-License-Identifier: MIT
// Is something listening on this computer's port? A connection to 127.0.0.1 answers it — asked by
// the desktop shell (is the port free again after a stop) and by the server's own start, before
// any of the app's code opens its database (serve.js `resolvePort`). A listener on 127.0.0.1 and
// one on every address (0.0.0.0) both accept it, where a trial bind would not tell: Windows binds
// 127.0.0.1:<port> beside a listener on 0.0.0.0:<port>, and the other way round (measured
// 2026-10-13, RESEARCH). And whose server answers there (`serverOwner`, 2026-10-20).

import { createHash } from "node:crypto";
import net from "node:net";
import os from "node:os";

/** The address the probe connects to. */
export const PROBE_HOST = "127.0.0.1";

/**
 * Whose server this is: this computer's OS user as a short hash — sha256 of the user's account, the first 12
 * hex — never the name itself (2026-10-20). Every OS user's apps share one set of loopback ports, so a second
 * Windows account's app found the first's server on its port and stopped it; the health answer carries this
 * (`owner`, health_api.js) and the desktop shell stops only its own user's. The account is the one the OS runs
 * the process as — Node's os.userInfo() (nodejs.org/api/os.html#osuserinfooptions: the OS's answer, where
 * os.homedir() follows the HOME / USERPROFILE variables, so a server started from a shell with another HOME read
 * as another user's) — with its Windows domain, as Windows writes an account ("DOMAIN\UserName",
 * learn.microsoft.com/windows/win32/secauthn/user-name-formats), or its POSIX uid. Null where there's no OS user
 * to ask (the phone's in-app server: its crypto stand-in has no hash).
 */
export function serverOwner() {
  try {
    const user = os.userInfo();
    const account = process.platform === "win32" ? `${process.env.USERDOMAIN || ""}\\${user.username}` : `${user.uid}:${user.username}`;
    return createHash("sha256").update(account).digest("hex").slice(0, 12);
  } catch {
    return null;
  }
}

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
