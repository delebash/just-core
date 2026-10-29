// SPDX-License-Identifier: MIT
// Reading a server's event stream — server-sent events (html.spec.whatwg.org/multipage/server-sent-events.html) over
// fetch: the `data:` frames of a `text/event-stream` response, read through the kit's server transport, so the access
// token rides (EventSource can't send it). One reader for every stream the kit's screens read: an AI run's
// (client.js requestStream) and a long job's events (services/serverJob.js).

/**
 * Read `res`'s frames: `onData(payload)` for each `data:` frame's text (comments and other fields are skipped);
 * returning `true` stops reading. Resolves when the stream ends or `onData` stops it; an error `onData` throws ends
 * the read with it.
 */
export async function readSseFrames(res, onData) {
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let ended = false;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) {
        ended = true;
        return;
      }
      buffer += decoder.decode(value, { stream: true });
      const parts = buffer.split("\n\n");
      buffer = parts.pop() || "";
      for (const part of parts) {
        const line = part.trim();
        if (!line.startsWith("data:")) continue;
        if (onData(line.slice(5).trim()) === true) return;
      }
    }
  } finally {
    // stopped before the stream's end (an end frame, a throw): the connection is let go — never in place of the
    // error that stopped it (a reader without cancel, a test's stand-in, is left as it is)
    if (!ended) {
      try {
        reader.cancel?.()?.catch?.(() => {});
      } catch {
        // the error that stopped the read stands
      }
    }
  }
}
