// SPDX-License-Identifier: MIT
// The Live tab's OSC relay (the Motion capture screen — just-mocap's plan of 2026-11-07, item 11): a page can't open UDP
// (just-core research live-and-apps.md), so the window shapes each frame as OSC messages (packages/ui
// src/mocap/liveOut.js: VMC or plain OSC) and this sends them as one bundle over UDP to the address the user set, with
// node-osc (github.com/MylesBorins/node-osc, Apache-2.0). An argument that is a number goes as an OSC float, `{i: n}` as
// an int32, a string as a string.
import { Bundle, Client } from "node-osc";

/** A message's arguments as node-osc's typed ones. */
export function oscArgs(args) {
  return args.map((a) => {
    if (typeof a === "string") return a;
    if (a && typeof a === "object" && Number.isInteger(a.i)) return { type: "integer", value: a.i };
    return { type: "float", value: Number(a) || 0 };
  });
}

/** The UDP senders, one per address, closed after `idleMs` with nothing sent (the Live tab stopped). */
export class LiveSender {
  constructor({ idleMs = 10_000, client = (host, port) => new Client(host, port) } = {}) {
    this.idleMs = idleMs;
    this.makeClient = client;
    this.clients = new Map(); // "host:port" → {client, timer}
  }

  /**
   * Send one frame's messages (`[[address, ...args]]`, oscArgs's arguments) as one bundle to `host:port`. With
   * `{stream, seq}` (the Live tab keeps a few frames in flight), a frame no newer than the last one sent on the same
   * stream to that address is dropped, so the frames go out in order; a new stream starts its own count. → sent?
   */
  async send(host, port, messages, { stream = null, seq = null } = {}) {
    const key = `${host}:${port}`;
    let held = this.clients.get(key);
    if (!held) {
      held = { client: this.makeClient(host, port), timer: null, stream: null, seq: -1 };
      this.clients.set(key, held);
    }
    clearTimeout(held.timer);
    held.timer = setTimeout(() => this.close(key), this.idleMs);
    held.timer.unref?.();
    if (stream != null && seq != null) {
      if (held.stream === stream && seq <= held.seq) return false;
      held.stream = stream;
      held.seq = seq;
    }
    await held.client.send(new Bundle(...messages.map(([address, ...args]) => [address, ...oscArgs(args)])));
    return true;
  }

  async close(key) {
    const held = this.clients.get(key);
    if (!held) return;
    this.clients.delete(key);
    clearTimeout(held.timer);
    try {
      await held.client.close();
    } catch {
      // closed already
    }
  }

  async closeAll() {
    await Promise.all([...this.clients.keys()].map((k) => this.close(k)));
  }
}
