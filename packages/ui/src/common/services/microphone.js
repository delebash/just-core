// SPDX-License-Identifier: MIT
// Recording from the microphone, and any recording as WAV — the family's one way (app-structure §19,
// 2026-11-06; until then JustVoice's clone page held its own copy).
//
// The browser's own MediaRecorder records (https://www.w3.org/TR/mediastream-recording/) — Chromium, and so
// the desktop window, gives WebM/Opus. A desktop app lets its page use the microphone by naming "media" in
// its shell's `permissions` (the kit's shell/main.js). Web Audio's decodeAudioData reads any clip the
// browser plays (that WebM, MP3, M4A, FLAC, OGG, WAV), and `toWav` writes it as 16-bit mono PCM WAV at its
// own rate — what a server's speech models read.

/**
 * Start recording from the default microphone → `{ stop }`. `stop()` ends the recording and resolves to its
 * audio (a Blob of the recorder's own type), letting the microphone go; a second `stop()` gives the same
 * recording. Rejects with the browser's own error when there is no microphone or it is refused
 * (`NotAllowedError`, `NotFoundError`).
 */
export async function recordMicrophone() {
  const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
  const release = () => {
    for (const track of stream.getTracks()) track.stop();
  };
  let recorder;
  try {
    recorder = new MediaRecorder(stream);
  } catch (e) {
    release();
    throw e;
  }
  const chunks = [];
  recorder.ondataavailable = (e) => {
    if (e.data?.size) chunks.push(e.data);
  };
  const recorded = new Promise((resolve, reject) => {
    recorder.onstop = () => {
      release();
      resolve(new Blob(chunks, { type: recorder.mimeType || "audio/webm" }));
    };
    recorder.onerror = (e) => {
      release();
      reject(e?.error || e);
    };
  });
  recorder.start();
  return {
    stop() {
      if (recorder.state !== "inactive") recorder.stop();
      return recorded;
    },
  };
}

/** Any recording the browser can play → a 16-bit mono PCM WAV Blob at its own sample rate, its channels
 *  averaged. */
export async function toWav(blob) {
  const Ctx = window.AudioContext || window.webkitAudioContext;
  const ctx = new Ctx();
  try {
    const audio = await ctx.decodeAudioData(await blob.arrayBuffer());
    const n = audio.length;
    const mono = new Float32Array(n);
    for (let c = 0; c < audio.numberOfChannels; c++) {
      const ch = audio.getChannelData(c);
      for (let i = 0; i < n; i++) mono[i] += ch[i] / audio.numberOfChannels;
    }
    const rate = audio.sampleRate;
    const buf = new ArrayBuffer(44 + n * 2);
    const dv = new DataView(buf);
    const str = (o, s) => {
      for (let i = 0; i < s.length; i++) dv.setUint8(o + i, s.charCodeAt(i));
    };
    str(0, "RIFF");
    dv.setUint32(4, 36 + n * 2, true);
    str(8, "WAVE");
    str(12, "fmt ");
    dv.setUint32(16, 16, true); // the fmt chunk's size
    dv.setUint16(20, 1, true); // PCM
    dv.setUint16(22, 1, true); // mono
    dv.setUint32(24, rate, true);
    dv.setUint32(28, rate * 2, true); // bytes a second
    dv.setUint16(32, 2, true); // bytes a frame
    dv.setUint16(34, 16, true); // bits a sample
    str(36, "data");
    dv.setUint32(40, n * 2, true);
    for (let i = 0; i < n; i++) dv.setInt16(44 + i * 2, Math.max(-1, Math.min(1, mono[i])) * 32767, true);
    return new Blob([buf], { type: "audio/wav" });
  } finally {
    ctx.close?.();
  }
}
