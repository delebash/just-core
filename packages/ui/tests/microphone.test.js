// SPDX-License-Identifier: MIT
// Recording from the microphone and any recording as WAV (common/services/microphone.js) — the family's one
// way (app-structure §19, 2026-11-06): the browser's MediaRecorder records, Web Audio decodes, and the WAV is
// 16-bit mono at the recording's own rate, what a server's speech models read.
import { afterEach, expect, test, vi } from "vitest";
import { recordMicrophone, toWav } from "../src/common/services/microphone.js";

afterEach(() => vi.unstubAllGlobals());

function fakeMic() {
  const track = { stop: vi.fn() };
  const stream = { getTracks: () => [track] };
  const getUserMedia = vi.fn(async () => stream);
  vi.stubGlobal("navigator", { mediaDevices: { getUserMedia } });
  class FakeRecorder {
    constructor(s) {
      expect(s).toBe(stream);
      this.state = "inactive";
      this.mimeType = "audio/webm;codecs=opus";
      FakeRecorder.last = this;
    }
    start() { this.state = "recording"; }
    stop() {
      this.state = "inactive";
      this.ondataavailable({ data: new Blob(["ab"]) });
      this.ondataavailable({ data: new Blob([]) }); // an empty chunk is dropped
      this.ondataavailable({ data: new Blob(["cd"]) });
      this.onstop();
    }
  }
  vi.stubGlobal("MediaRecorder", FakeRecorder);
  return { track, getUserMedia, FakeRecorder };
}

test("a recording asks for the microphone, and stop() gives its audio and lets the microphone go", async () => {
  const { track, getUserMedia, FakeRecorder } = fakeMic();
  const rec = await recordMicrophone();
  expect(getUserMedia).toHaveBeenCalledWith({ audio: true });
  expect(FakeRecorder.last.state).toBe("recording");
  expect(track.stop).not.toHaveBeenCalled();
  const blob = await rec.stop();
  expect(blob.type).toBe("audio/webm;codecs=opus");
  expect(await blob.text()).toBe("abcd");
  expect(track.stop).toHaveBeenCalledTimes(1);
  expect(await rec.stop()).toBe(blob); // a second stop is the same recording
});

test("a refused microphone is the browser's own error", async () => {
  const refused = Object.assign(new Error("Permission denied"), { name: "NotAllowedError" });
  vi.stubGlobal("navigator", { mediaDevices: { getUserMedia: vi.fn(async () => { throw refused; }) } });
  await expect(recordMicrophone()).rejects.toBe(refused);
});

test("any recording becomes 16-bit mono WAV at its own rate, its channels averaged", async () => {
  const left = new Float32Array([1, 0.5, -1]);
  const right = new Float32Array([0, 0.5, -1]);
  const close = vi.fn();
  class FakeContext {
    decodeAudioData = async () => ({ length: 3, numberOfChannels: 2, sampleRate: 24000, getChannelData: (c) => (c ? right : left) });
    close = close;
  }
  vi.stubGlobal("window", { AudioContext: FakeContext });
  const wav = await toWav(new Blob(["x"]));
  expect(wav.type).toBe("audio/wav");
  const dv = new DataView(await wav.arrayBuffer());
  const tag = (o) => String.fromCharCode(...[0, 1, 2, 3].map((i) => dv.getUint8(o + i)));
  expect([tag(0), tag(8), tag(12), tag(36)]).toEqual(["RIFF", "WAVE", "fmt ", "data"]);
  expect(dv.getUint16(22, true)).toBe(1); // mono
  expect(dv.getUint32(24, true)).toBe(24000);
  expect(dv.getUint16(34, true)).toBe(16);
  expect(dv.getUint32(40, true)).toBe(6);
  expect([dv.getInt16(44, true), dv.getInt16(46, true), dv.getInt16(48, true)]).toEqual([16383, 16383, -32767]);
  expect(close).toHaveBeenCalled();
});
