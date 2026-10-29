// SPDX-License-Identifier: MIT
// Where a speech model loads and what it books on the card — the kit's (round E, 2026-10-29, the user: "Kit code, every
// runtime"; JustVoice's engines/manager.js moved in, its decisions kept): Auto / GPU / CPU placement and its reasons in
// words, the measured price, the worse-of-two admission and the pinned card's exception, the CPU retry after a card load
// that failed or spilled, the recorded peak, and a booking per server released with its model. Everything is faked —
// the servers, the ledger, the probes, the memory; the arbiter is the kit's own on a fake card. No engine, no GPU.
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { makeRuntimesRouter } from "../src/llm/runtimes_api.js";
import { AsyncEvent } from "../src/platform/asyncutil.js";
import { createServer } from "../src/platform/server.js";
import { VramArbiter } from "../src/runner/arbiter.js";
import { AudioCppError } from "../src/runner/audiocpp.js";
import { DEFAULT_AUDIOCPP_BUILD, DEFAULT_AUDIOCPP_SETTINGS } from "../src/runner/config.js";
import * as hardware from "../src/runner/hardware.js";
import { configureRuntimeServices, RuntimeService } from "../src/runner/runtime_service.js";
import { fmtGb, fmtX, NotEnoughMemoryError, needOf, SpeechPlacement } from "../src/runner/speech_placement.js";

beforeEach(() => {
  // the arbiter's snapshot reads the measured pool; no test starts a program for it
  vi.spyOn(hardware, "usedPoolMb").mockResolvedValue(null);
});
afterEach(() => {
  configureRuntimeServices([]);
});

const GB = 1024 ** 3;
const PIN = DEFAULT_AUDIOCPP_BUILD;

/** An 8 GB NVIDIA card on a 32 GB box (discrete), and a box whose graphics share its memory (one pool). */
const discrete = () => ({ platform: "windows", ramMb: 32768, cpuCores: 8, runtimes: { cuda: true }, gpus: [{ name: "RTX 2070", vramMb: 8192 }] });
const onePool = () => ({ platform: "windows", ramMb: 16384, cpuCores: 8, runtimes: {}, gpus: [] });
const MK = hardware.machineKey(discrete());

/** A runtime_model row: its files, audio.cpp's estimate (`peakVramMb` — the one field the fit word reads too; round E
 *  B11), its reference CPU speed (`refSpeed.cpu`). */
function row(id, name, { kind = "tts", filesGb = null, needGb = null, cpu = null } = {}) {
  return {
    id,
    name,
    kind,
    files: filesGb == null ? [] : [{ slot: "model", bytes: Math.round(filesGb * GB) }],
    peakVramMb: needGb ? Math.round(needGb * 1024) : 0,
    refSpeed: cpu ? { cpu } : {},
    spec: { family: `${id}_fam`, task: kind === "stt" ? "asr" : "tts" },
  };
}

const ROWS = {
  kokoro: row("kokoro", "Kokoro", { filesGb: 0.33, needGb: 1, cpu: 3.15 }),
  chatterbox: row("chatterbox", "Chatterbox", { filesGb: 1.6, needGb: 12 }),
  moss: row("moss", "MOSS-TTS", { filesGb: 12, needGb: 18 }),
  mossd: row("mossd", "MOSS-TTSD", { filesGb: 12 }),
  omnivoice: row("omnivoice", "OmniVoice", { filesGb: 1.3, needGb: 10, cpu: 0.06 }),
  qwen: row("qwen", "Qwen3-TTS Base", { filesGb: 2.5, needGb: 8 }),
  irodori: row("irodori", "Irodori", { filesGb: 1, needGb: 4 }),
  plain: row("plain", "Plain"),
  parakeet: row("parakeet", "Parakeet", { kind: "stt", filesGb: 0.6, needGb: 1, cpu: 20 }),
};

/** The kit's measurement ledger, in memory: newest first, `rows` kept as the store keeps them (`switches`). */
function fakeLedger() {
  const rows = [];
  return {
    rows,
    list: (id) => rows.filter((r) => r.modelId === id).sort((a, b) => b.at - a.at),
    record: (id, r) => rows.push({ modelId: id, ...r, switches: r.rows ?? [] }),
    clear: (id, source) => {
      let n = 0;
      for (let i = rows.length - 1; i >= 0; i--) {
        if (rows[i].modelId === id && (!source || rows[i].source === source)) {
          rows.splice(i, 1);
          n += 1;
        }
      }
      return n;
    },
    pruneLoadRows: () => 0,
  };
}

const lid = (id) => `tts:audiocpp:${id}`;
const peakRow = (id, mb, { backend = "cuda12", build = PIN, at = 1, machineKey = MK, extra = [] } = {}) => ({
  modelId: lid(id),
  machineKey,
  source: "peak",
  backend,
  vramModelMb: mb,
  at,
  switches: [{ flagName: "runtime", flagValue: build }, ...extra],
});
const noCardRow = (id, at, build = PIN) => ({ modelId: lid(id), machineKey: MK, source: "no_card", backend: "cuda12", at, switches: [{ flagName: "runtime", flagValue: build }] });
const speedRow = (id, x, threads = "8") => ({ modelId: lid(id), machineKey: MK, source: "speed", backend: "cpu", realtimeX: x, at: 1, switches: [{ flagName: "threads", flagValue: threads }] });

const NULL_PROBES = { usedPoolMb: async () => null, deviceMb: async () => null, sharedMb: async () => null, rssMb: async () => null };
const aiOnCard = (arb, mb = 6800, evictFn = () => {}) => arb.reserve("llm:gemma", mb, { kind: "llm", evictFn, source: "measured" });
const settle = () => new Promise((r) => setTimeout(r, 20));

/** The placement alone, on a fake card: `backend` the installed build's ("cpu": the CPU build). */
function standalone({ hw = discrete(), arb = null, ledger = fakeLedger(), backend = "cuda12", probes = {}, memory = {}, ...rest } = {}) {
  arb ??= new VramArbiter(() => hw);
  const sp = new SpeechPlacement({
    ledger,
    ledgerId: lid,
    arbiter: () => arb,
    hardwareFn: () => hw,
    settingsFn: () => ({ ...DEFAULT_AUDIOCPP_SETTINGS }),
    safetyMarginMbFn: () => 1024,
    cardBackendFn: () => backend,
    buildFn: () => PIN,
    cpuThreadsFn: async () => 8,
    instanceKey: (kind, placement) => `${kind}:audiocpp:${placement}`,
    probes: { ...NULL_PROBES, ...probes },
    memory: { freeMb: () => 16384, totalMb: () => 32768, ...memory },
    sleep: async () => {},
    llmFn: async () => null,
    ...rest,
  });
  return { sp, arb, ledger };
}
const place = (sp, id, opts) => sp.placementFor(ROWS[id], opts);

/** A server process that registers models, as audio.cpp's managed server does. */
class FakeServer {
  constructor(placement, kind, pid) {
    this.placement = placement;
    this.kind = kind;
    this._pid = pid;
    this.running = false;
    this.models = new Set();
    this.calls = [];
    this.failRegister = false;
  }
  async ensure(exe, models, opts) {
    this.calls.push(["ensure", opts]);
    this.running = true;
  }
  get pid() {
    return this.running ? this._pid : null;
  }
  isRunning() {
    return this.running;
  }
  hasModel(id) {
    return this.running && this.models.has(id);
  }
  async register(e) {
    this.calls.push(["register", e.id]);
    if (this.failRegister) throw new AudioCppError("out of memory", 503);
    this.models.add(e.id);
  }
  async unload(ids) {
    this.calls.push(["unload", [...ids]]);
    for (const id of ids) this.models.delete(id);
  }
  async stop() {
    this.calls.push(["stop"]);
    this.running = false;
    this.models.clear();
  }
}
const PIDS = { "gpu/tts": 11, "cpu/tts": 12, "gpu/stt": 21, "cpu/stt": 22 };
class FakePool {
  constructor() {
    this.map = new Map();
  }
  get(placement = "gpu", kind = "tts") {
    const k = `${placement}/${kind}`;
    if (!this.map.has(k)) this.map.set(k, new FakeServer(placement, kind, PIDS[k]));
    return this.map.get(k);
  }
  async stop() {
    for (const s of this.map.values()) await s.stop();
  }
}

/** RuntimeService for audio.cpp on a fake card: `build` the installed build's folder (cuda12; "cpu" the CPU build). The
 *  app's warm-up calibrates whenever it is asked to, unless `speech.warm` says otherwise. */
function service({ hw = discrete(), build = "cuda12", ledger = fakeLedger(), arb = null, probes = {}, speech = {} } = {}) {
  arb ??= new VramArbiter(() => hw);
  const clock = { t: 1000 };
  const svc = new RuntimeService({
    id: "audiocpp",
    cacheRoot: "/kit-cache",
    configFn: () => ({ id: "audiocpp", pinnedBuild: PIN, binaries: [], settings: { ...DEFAULT_AUDIOCPP_SETTINGS, cpu_threads: 8 }, safetyMarginMb: 1024 }),
    hardwareFn: () => hw,
    measurements: ledger,
    arbiter: () => arb,
    speech: {
      probes: { ...NULL_PROBES, ...probes },
      memory: { freeMb: () => 16384, totalMb: () => 32768 },
      sleep: async () => {},
      now: () => clock.t,
      llmFn: async () => null,
      warm: async ({ calibrate }) => calibrate,
      ...speech,
    },
  });
  const pool = new FakePool();
  svc._pool = pool;
  svc.installedExe = () => `/kit-cache/audiocpp/${PIN}/${build}/audiocpp_server.exe`;
  svc._model = (id) => {
    if (!ROWS[id]) throw Object.assign(new Error(`no model "${id}"`), { notFound: true });
    return ROWS[id];
  };
  svc.modelFor = (id) => ({ key: id, files: { model: `/m/${id}.gguf` } });
  svc.extrasEnv = () => ({});
  return { svc, ledger, arb, pool, clock };
}

// ─── the need, the words ─────────────────────────────────────────────────────────────────────────────

test("what a model needs before a load measures it: audio.cpp's estimate or its files, whichever is more", () => {
  expect(needOf(ROWS.omnivoice)).toEqual({ gb: 10, by: "estimate" });
  expect(needOf(ROWS.mossd)).toEqual({ gb: 12, by: "files" }); // no estimate: the files decide
  expect(needOf(row("big", "Big", { filesGb: 23, needGb: 10 }))).toEqual({ gb: 23, by: "files" }); // FireRedAudio's shape
  expect(needOf(ROWS.plain)).toBeNull(); // "memory not measured yet"
  // one field (round E, B11): the row's `peakVramMb` — the one its fit word reads; `spec.minVramGb` is read no more
  expect(needOf({ id: "old", files: [{ bytes: GB }], spec: { minVramGb: 10 } })).toEqual({ gb: 1, by: "files" });
  expect(needOf({ id: "mb", files: [{ bytes: 0.2 * GB }], peakVramMb: 900 })).toEqual({ gb: 0.9, by: "estimate" });
  expect([fmtGb(1.31), fmtGb(12.4), fmtX(3.15), fmtX(12.2), fmtX(0.06)]).toEqual(["1.3", "12", "3.1×", "12×", "0.1×"]);
});

// ─── the placement, each branch and its words ────────────────────────────────────────────────────────

test("the CPU build runs everything on the CPU; the user's choice wins; graphics that share the memory keep the card", async () => {
  {
    const { sp } = standalone({ backend: "cpu" });
    expect(await place(sp, "chatterbox", { choice: "gpu" })).toEqual({ placement: "cpu", reason: "this machine's speech runtime is the CPU build", unloadAi: false });
  }
  {
    const { sp, arb } = standalone();
    aiOnCard(arb);
    expect(await place(sp, "chatterbox", { choice: "cpu" })).toEqual({ placement: "cpu", reason: "your choice", unloadAi: false });
    expect(await place(sp, "kokoro", { choice: "cpu" })).toEqual({ placement: "cpu", reason: "your choice — 3.1× real time on the reference machine", unloadAi: false });
    expect(await place(sp, "moss", { choice: "gpu" })).toEqual({ placement: "gpu", reason: "your choice", unloadAi: false });
  }
  {
    const { sp } = standalone({ hw: onePool() });
    expect(await place(sp, "moss")).toEqual({ placement: "gpu", reason: "the graphics share this machine's memory, so the CPU would free none of it", unloadAi: false });
  }
});

test("too big for the card by audio.cpp's estimate or by its files goes to the CPU; files that fit try the card first", async () => {
  const { sp, ledger, arb } = standalone();
  expect(await place(sp, "moss")).toEqual({ placement: "cpu", reason: "audio.cpp says it needs about 18 GB, more than this card's 8 GB — this may be slow on the CPU", unloadAi: false });
  expect(await place(sp, "mossd")).toEqual({ placement: "cpu", reason: "its files are about 12 GB, more than this card's 8 GB — this may be slow on the CPU", unloadAi: false });
  // decided 2026-10-12: OmniVoice's 1.3 GB of files took 1.2 GB of an 8 GB card against audio.cpp's 10 GB
  const omni = "audio.cpp says it needs about 10 GB, but its files are about 1.3 GB, so it tries the graphics card first; if it doesn't fit, Load runs it on the CPU";
  expect(await place(sp, "omnivoice")).toEqual({ placement: "gpu", reason: omni, unloadAi: false });
  // an estimate that fits only without the margin says the card-first words too (decided 2026-10-16)
  expect(await place(sp, "qwen")).toEqual({
    placement: "gpu",
    reason: "audio.cpp says it needs about 8 GB, but its files are about 2.5 GB, so it tries the graphics card first; if it doesn't fit, Load runs it on the CPU",
    unloadAi: false,
  });
  // once a line on the CPU measured it, its speed takes the warning's place
  ledger.rows.push(speedRow("moss", 0.06));
  expect((await place(sp, "moss")).reason).toBe("audio.cpp says it needs about 18 GB, more than this card's 8 GB — 0.1× real time here");
  // once a load measured it here, the measurement decides, not the estimate
  ledger.rows.push(peakRow("moss", 3000));
  expect((await place(sp, "moss")).placement).toBe("gpu");
  // beside the AI model, card-first is Auto's third step: the AI model makes room
  aiOnCard(arb);
  expect(await place(sp, "omnivoice")).toEqual({ placement: "gpu", reason: omni, unloadAi: true });
});

test("a card load that failed or spilled, or a price the card can't hold, sends the model to the CPU — until a card load measures it", async () => {
  {
    const { sp } = standalone();
    expect(await place(sp, "chatterbox", { cardFailed: true })).toEqual({ placement: "cpu", reason: "it didn't load on the graphics card — this may be slow on the CPU", unloadAi: false });
  }
  {
    const { sp, ledger } = standalone();
    const failed = () => sp.failedOnCard(ROWS.omnivoice);
    expect(failed()).toBe(false);
    ledger.rows.push(noCardRow("omnivoice", 100));
    expect(failed()).toBe(true);
    expect(await place(sp, "omnivoice")).toEqual({ placement: "cpu", reason: "it didn't load on the graphics card — 0.1× real time on the reference machine", unloadAi: false });
    expect((await place(sp, "omnivoice", { choice: "gpu" })).placement).toBe("gpu"); // your pin still wins
    ledger.rows[0] = noCardRow("omnivoice", 100, "v0.0.1"); // another runtime build tries the card again
    expect(failed()).toBe(false);
    ledger.rows[0] = noCardRow("omnivoice", 100);
    ledger.rows.push(peakRow("omnivoice", 1200, { backend: "cpu", at: 200 })); // measured on the CPU: still failed
    expect(failed()).toBe(true);
    ledger.rows.push(peakRow("omnivoice", 1200, { at: 300 })); // measured on the card (a pin): cleared
    expect(failed()).toBe(false);
    expect(sp.forgetCardFailure(ROWS.omnivoice)).toBe(1); // "Try the card again": its no_card rows only
    expect(ledger.rows.map((r) => r.source)).toEqual(["peak", "peak"]);
  }
  {
    // a price measured here is weighed as it is, with no margin (decided 2026-10-16): 7.6 GB fits an 8 GB card; more
    // than the card goes to the CPU, saying what it took (decided 2026-10-13)
    const { sp, ledger } = standalone();
    ledger.rows.push(peakRow("chatterbox", 7800));
    expect((await place(sp, "chatterbox")).placement).toBe("gpu");
    ledger.rows[0] = peakRow("chatterbox", 8300);
    expect(await place(sp, "chatterbox")).toEqual({ placement: "cpu", reason: "it took about 8.1 GB on this card before, more than this card has — this may be slow on the CPU", unloadAi: false });
  }
});

test("Auto checks what other programs hold on the card first, weighing a never-measured model at its need or its files", async () => {
  let used = 600;
  const { sp, ledger, arb } = standalone({ probes: { usedPoolMb: async () => used } });
  expect(await place(sp, "irodori")).toEqual({ placement: "gpu", reason: "it fits in the card's free memory", unloadAi: false });
  // its estimate doesn't fit beside them but its files do: the card first, at its files (2026-10-15)
  used = 4000;
  expect(await place(sp, "irodori")).toEqual({
    placement: "gpu",
    reason: "audio.cpp says it needs about 4 GB, but its files are about 1 GB, so it tries the graphics card first; if it doesn't fit, Load runs it on the CPU",
    unloadAi: false,
  });
  used = 7000;
  expect(await place(sp, "irodori")).toEqual({ placement: "cpu", reason: "other programs are using about 6.8 GB of the graphics card — this may be slow on the CPU", unloadAi: false });
  // a measured size beside them (2026-10-15: another program held 6,490 of the card's 8,192 MB)
  ledger.rows.push(peakRow("chatterbox", 2937));
  used = 600;
  expect(await place(sp, "chatterbox")).toEqual({ placement: "gpu", reason: "it fits in the card's free memory", unloadAi: false });
  used = 6490;
  expect(await place(sp, "chatterbox")).toEqual({ placement: "cpu", reason: "other programs are using about 6.3 GB of the graphics card — this may be slow on the CPU", unloadAi: false });
  // the AI model's booking is not another program's: it can be unloaded to make room
  aiOnCard(arb, 5000);
  used = 5600;
  expect((await place(sp, "chatterbox")).placement).toBe("gpu");
  // a card that can't be read keeps the card, and says so (decided 2026-10-15)
  const { sp: unread } = standalone();
  expect(await place(unread, "kokoro")).toEqual({ placement: "gpu", reason: "memory not measured yet", unloadAi: false });
});

test("beside the AI model: a measured size that fits stays; fast on the CPU goes there; else the card, the AI model making room", async () => {
  {
    const { sp, arb } = standalone();
    aiOnCard(arb);
    expect(await place(sp, "kokoro")).toEqual({ placement: "cpu", reason: "3.1× real time on the reference machine, which keeps the graphics card for the AI model", unloadAi: false });
    // never measured, no usable CPU speed: the card, with the AI model unloaded first
    expect(await place(sp, "plain")).toEqual({ placement: "gpu", reason: "it has no usable speed on the CPU, so the AI model makes room", unloadAi: true });
    // a sleeping AI model holds nothing
    arb.syncSleeping(new Set(["llm:gemma"]));
    expect((await place(sp, "kokoro")).placement).toBe("gpu");
  }
  {
    const { sp, ledger, arb } = standalone();
    aiOnCard(arb, 5000);
    ledger.rows.push(peakRow("kokoro", 600));
    expect(await place(sp, "kokoro")).toEqual({ placement: "gpu", reason: "it fits beside the AI model (600 MB)", unloadAi: false });
  }
  {
    // known size, too big beside it, slow on the CPU: the card — the admission evicts, not a blanket unload
    const { sp, ledger, arb } = standalone();
    aiOnCard(arb, 6800);
    ledger.rows.push(peakRow("chatterbox", 3200));
    expect(await place(sp, "chatterbox")).toEqual({ placement: "gpu", reason: "it has no usable speed on the CPU, so the AI model makes room", unloadAi: false });
  }
});

test("the CPU speed is this machine's at the threads setting in force, else the reference figure", async () => {
  const { sp, ledger } = standalone();
  expect(sp.cpuSpeed(ROWS.kokoro, 8)).toEqual([3.15, false]);
  ledger.rows.push(speedRow("kokoro", 2.4));
  expect(sp.cpuSpeed(ROWS.kokoro, 8)).toEqual([2.4, true]);
  expect(sp.cpuSpeed(ROWS.kokoro, 6)).toEqual([3.15, false]); // another threads setting
  ledger.rows[0] = { ...speedRow("kokoro", 2.4), machineKey: "another box" };
  expect(sp.cpuSpeed(ROWS.kokoro, 8)).toEqual([3.15, false]);
  expect(sp.cpuSpeed(ROWS.chatterbox, 8)).toEqual([null, false]);
});

test("the price: the largest peak measured on this machine, this backend and build, at this piece length and load-option set", () => {
  const rows = [
    peakRow("kokoro", 1100),
    peakRow("kokoro", 1300),
    peakRow("kokoro", 5000, { build: "v0.0.1" }),
    peakRow("kokoro", 6000, { machineKey: "another box" }),
    peakRow("kokoro", 7000, { backend: "cpu" }),
    peakRow("kokoro", 8000, { extra: [{ flagName: "load_options", flagValue: "decoder=f32" }] }),
  ];
  const ledger = fakeLedger();
  ledger.rows.push(...rows);
  expect(standalone({ ledger }).sp.priceMb(ROWS.kokoro, "cuda12")).toBe(1300);
  expect(standalone({ ledger }).sp.measuredMbFor(ROWS.kokoro)).toBe(1300);
  expect(standalone({ ledger, backend: "cpu" }).sp.measuredMbFor(ROWS.kokoro)).toBeNull(); // the CPU build has no card
  expect(standalone({ ledger, loadOptionsKey: () => "decoder=f32" }).sp.priceMb(ROWS.kokoro, "cuda12")).toBe(8000);
  expect(standalone({ ledger, pieceLength: () => 300 }).sp.priceMb(ROWS.kokoro, "cuda12")).toBe(0); // measured at another length
});

// ─── admission ───────────────────────────────────────────────────────────────────────────────────────

test("the card's admission weighs the worse of the measurement and the ledger, crediting the kind's model that leaves", async () => {
  const { sp } = standalone({ probes: { usedPoolMb: async () => 6000 } });
  const err = await sp.admitMemory(ROWS.chatterbox, 3000).catch((e) => e);
  expect(err).toBeInstanceOf(NotEnoughMemoryError);
  expect(err.where).toBe("card");
  expect(err.message).toBe(
    "not enough memory to load chatterbox: it needs ~3000 MB but only 2192 MB free of 8192 MB (measured, minus what is booked) remain. " +
      "Resident: nothing; busy: none. Wait for the current work to finish or unload something first.",
  );
  await expect(sp.admitMemory(ROWS.chatterbox, 3000, 1000)).resolves.toBeNull();
});

test("a load needs its files (on the CPU) or the memory it last took, and the margin, free in this machine's memory", async () => {
  {
    const arb = new VramArbiter(() => discrete());
    const { sp } = standalone({ arb, memory: { freeMb: () => 1536 } });
    await expect(sp.admitSystemMemory(ROWS.omnivoice, "cpu")).rejects.toThrow(
      "not enough memory to load OmniVoice on the CPU: its files are about 1.3 GB (+1024 MB safety margin) but only 1.5 GB of this machine's 32 GB is free. Close other programs, or pick a smaller model.",
    );
    aiOnCard(arb);
    await expect(sp.admitSystemMemory(ROWS.omnivoice, "cpu")).rejects.toThrow("The AI model (gemma) is loaded and holds memory too — unload it first, or close other programs.");
    // short even with the AI models' memory credited: the words don't name it, its memory was already counted
    await expect(sp.admitSystemMemory(ROWS.omnivoice, "cpu", 200)).rejects.toThrow("is free. Close other programs, or pick a smaller model.");
  }
  {
    // the kind's model now gives its memory back when this one replaces it
    const { sp } = standalone({ memory: { freeMb: () => 1536 }, occupantFn: () => ({ modelId: "qwen", placement: "cpu", device: "cpu", row: ROWS.qwen }) });
    await expect(sp.admitSystemMemory(ROWS.omnivoice, "cpu")).resolves.toBeUndefined();
  }
  {
    // on the card: nothing to check until a load recorded what it took (decided 2026-10-12, 4b)
    const { sp } = standalone({ memory: { freeMb: () => 6144 } });
    await expect(sp.admitSystemMemory(ROWS.moss, "cuda12")).resolves.toBeUndefined();
    sp.recordRam(ROWS.moss, 5800, "cuda12");
    const err = await sp.admitSystemMemory(ROWS.moss, "cuda12").catch((e) => e);
    expect(err).toMatchObject({ name: "NotEnoughMemoryError", where: "system" });
    expect(err.message).toBe(
      "not enough memory to load MOSS-TTS on the graphics card: it took about 5.7 GB of this machine's memory when it last loaded here (+1024 MB safety margin) but only 6 GB of this machine's 32 GB is free. Close other programs, or pick a smaller model.",
    );
  }
});

test("Auto's third step unloads the AI model only — every other kind on the card is protected", async () => {
  const { sp, arb } = standalone();
  const evicted = [];
  aiOnCard(arb, 5000, () => evicted.push("gemma"));
  arb.reserve("tts:audiocpp:gpu", 1000, { kind: "tts", evictFn: () => evicted.push("speech") });
  arb.reserve("image:sdcpp", 1000, { kind: "image", evictFn: () => evicted.push("image") });
  await sp.unloadAiModel("plain");
  expect(evicted).toEqual(["gemma"]);
  expect(arb.eventsSince(0)).toMatchObject([{ victim_key: "llm:gemma", reason: "loading plain" }]);
});

// ─── loading: RuntimeService for a runtime whose models register ─────────────────────────────────────

test("an Auto card load books its server's measured memory under the server's key, records the calibrated peak and its memory; unloading releases it", async () => {
  const warmed = [];
  const { svc, ledger, arb, pool } = service({
    probes: { deviceMb: async () => 1200, rssMb: async () => 900 },
    speech: { pieceLength: () => 300, warm: async ({ modelId, calibrate }) => (warmed.push([modelId, calibrate]), calibrate) },
  });
  const out = await svc.loadModel("kokoro");
  expect(out).toEqual({ modelId: "kokoro", placement: "gpu", kind: "tts", reason: "memory not measured yet" });
  expect(warmed).toEqual([["kokoro", true]]); // no price on the card yet: a full-length warm-up
  // the card's server runs the build's own backend, named (B1: null left a development build's to its folder, read as "cpu")
  expect(pool.get("gpu", "tts").calls[0]).toEqual(["ensure", { device: 0, threads: 4, backend: "cuda", managed: true }]);
  expect(arb.reservationOf("tts:audiocpp:gpu")).toMatchObject({ vram_mb: 1200, source: "measured", kind: "tts" });
  const peak = ledger.rows.find((r) => r.source === "peak");
  expect(peak).toMatchObject({ modelId: lid("kokoro"), machineKey: MK, backend: "cuda12", vramModelMb: 1200, kind: "tts", label: `speech peak (cuda12, pieces of 300 characters, ${PIN})` });
  expect(peak.switches).toEqual([
    { flagName: "split_chars", flagValue: "300" },
    { flagName: "runtime", flagValue: PIN },
  ]);
  expect(ledger.rows.find((r) => r.source === "ram_peak")).toMatchObject({ backend: "cuda12", ramModelMb: 900 });
  expect(svc.measuredMbFor("kokoro")).toBe(1200);
  expect(svc.loaded()).toEqual([{ modelId: "kokoro", placement: "gpu", kind: "tts", reason: "memory not measured yet" }]);
  // loaded already: nothing checked, registered or measured again
  expect(await svc.loadModel("kokoro")).toEqual(out);
  expect(pool.get("gpu", "tts").calls.filter(([c]) => c === "register")).toHaveLength(1);
  expect(await svc.unloadModel("kokoro")).toBe(true);
  expect(await svc.unloadModel("kokoro")).toBe(false);
  expect(pool.get("gpu", "tts").calls).toContainEqual(["unload", ["kokoro"]]);
  expect(arb.isReserved("tts:audiocpp:gpu")).toBe(false);
});

test("an explicit GPU or CPU load keeps its contract; the CPU books nothing on a discrete card; an unknown placement is refused", async () => {
  const { svc, arb, pool } = service();
  expect(await svc.loadModel("kokoro", { placement: "cpu" })).toEqual({ modelId: "kokoro", placement: "cpu", kind: "tts", reason: "your choice — 3.1× real time on the reference machine" });
  expect(pool.get("cpu", "tts").calls[0]).toEqual(["ensure", { device: 0, threads: 8, backend: "cpu", managed: true }]);
  expect(arb.isReserved("tts:audiocpp:cpu")).toBe(false);
  expect(await svc.loadModel("kokoro", { placement: "gpu" })).toEqual({ modelId: "kokoro", placement: "gpu", kind: "tts", reason: "your choice" });
  expect(pool.get("cpu", "tts").calls).toContainEqual(["unload", ["kokoro"]]); // moved: it left the CPU's server first
  await expect(svc.loadModel("kokoro", { placement: "npu" })).rejects.toThrow(/unknown placement/);
  // the CPU build has only the CPU's server
  const cpuOnly = service({ build: "cpu" });
  expect(await cpuOnly.svc.loadModel("kokoro", { placement: "gpu" })).toEqual({ modelId: "kokoro", placement: "cpu", kind: "tts", reason: "this machine's speech runtime is the CPU build" });
});

test("an Auto card load that fails runs on the CPU, remembered — until Try the card again; a pinned load is never moved", async () => {
  const { svc, ledger, arb, pool } = service({ probes: { deviceMb: async () => 1200 } });
  pool.get("gpu", "tts").failRegister = true;
  expect(await svc.loadModel("chatterbox")).toEqual({ modelId: "chatterbox", placement: "cpu", kind: "tts", reason: "it didn't load on the graphics card — this may be slow on the CPU" });
  expect(pool.get("cpu", "tts").calls.filter(([c]) => c === "register")).toEqual([["register", "chatterbox"]]);
  expect(arb.isReserved("tts:audiocpp:gpu")).toBe(false);
  expect(ledger.rows.filter((r) => r.source === "no_card")).toMatchObject([
    { modelId: lid("chatterbox"), label: `didn't stay on the graphics card (failed, ${PIN})`, backend: "cuda12", switches: [{ flagName: "runtime", flagValue: PIN }] },
  ]);
  // remembered: Auto sends it straight to the CPU
  await svc.unloadModel("chatterbox");
  expect(await svc.placementOf("chatterbox")).toEqual({ placement: "cpu", reason: "it didn't load on the graphics card — this may be slow on the CPU" });
  expect(svc.forgetCardFailure("chatterbox")).toBe(1);
  expect((await svc.placementOf("chatterbox")).placement).toBe("gpu");
  // your pin to the card fails as itself
  await expect(svc.loadModel("chatterbox", { placement: "gpu" })).rejects.toMatchObject({ name: "AudioCppError", message: "out of memory" });
  expect(svc.loaded()).toEqual([]);
});

test("an Auto card load that spills into system memory runs on the CPU; your pin stays on the card and says what it costs", async () => {
  {
    let n = 0;
    const { svc, ledger, arb, pool } = service({ probes: { sharedMb: async () => (n++ === 0 ? 100 : 900), deviceMb: async () => 1200 } });
    expect(await svc.loadModel("kokoro")).toEqual({ modelId: "kokoro", placement: "cpu", kind: "tts", reason: "it didn't load on the graphics card — 3.1× real time on the reference machine" });
    expect(pool.get("gpu", "tts").calls).toContainEqual(["unload", ["kokoro"]]);
    expect(arb.isReserved("tts:audiocpp:gpu")).toBe(false);
    expect(ledger.rows.find((r) => r.source === "no_card")).toMatchObject({ label: `didn't stay on the graphics card (spilled, ${PIN})` });
    expect(ledger.rows.some((r) => r.source === "peak")).toBe(false); // a spilled reading is never a price
  }
  {
    let n = 0;
    const { svc, arb } = service({ probes: { sharedMb: async () => (n++ === 0 ? 100 : 900), deviceMb: async () => 1200 } });
    expect(await svc.loadModel("kokoro", { placement: "gpu" })).toEqual({
      modelId: "kokoro",
      placement: "gpu",
      kind: "tts",
      reason: "your choice — about 0.8 GB of it spilled into this machine's memory, so it runs slowly; Auto would run it on the CPU",
    });
    expect(arb.reservedMb("tts:audiocpp:gpu")).toBe(1200);
  }
});

test("a known price is admitted before anything moves: the AI model makes room; refused when nothing can — never for your pin", async () => {
  {
    const { svc, arb } = service({ probes: { deviceMb: async () => 6800 } });
    svc._placement.recordPeak(ROWS.chatterbox, 7000, "cuda12");
    const evicted = [];
    aiOnCard(arb, 5000, () => evicted.push("gemma"));
    expect(await svc.loadModel("chatterbox")).toEqual({ modelId: "chatterbox", placement: "gpu", kind: "tts", reason: "it has no usable speed on the CPU, so the AI model makes room" });
    expect(evicted).toEqual(["gemma"]);
    // booked early at its price, which stays the booking's floor under a lower reading
    expect(arb.reservationOf("tts:audiocpp:gpu")).toMatchObject({ vram_mb: 7000, source: "measured" });
  }
  {
    const { svc, arb } = service();
    svc._placement.recordPeak(ROWS.chatterbox, 7000, "cuda12");
    aiOnCard(arb, 5000);
    arb.busyBegin("llm"); // a chat is streaming: it is never evicted
    const err = await svc.loadModel("chatterbox").catch((e) => e);
    expect(err).toBeInstanceOf(NotEnoughMemoryError);
    expect(err.message).toBe(
      "not enough memory to load chatterbox: it needs ~7000 MB but only 3192 MB of 8192 MB unbooked remain. " +
        "Resident: llm:gemma (5000 MB); busy: llm. Wait for the current work to finish or unload something first.",
    );
    expect(arb.isReserved("tts:audiocpp:gpu")).toBe(false); // the world as it was
    expect(svc.loaded()).toEqual([]);
    // you pinned it to the card: it loads, and says it may spill (decided 2026-10-16)
    expect((await svc.loadModel("chatterbox", { placement: "gpu" })).reason).toBe(
      "your choice — it took about 6.8 GB here before and about 3.1 GB of the card is free, so it may spill into this machine's memory and run slowly",
    );
    expect(arb.reservedMb("tts:audiocpp:gpu")).toBe(7000);
  }
});

test("Auto's third step: a never-measured model with no CPU speed unloads the AI model, then is measured on the card", async () => {
  const { svc, arb } = service({ probes: { deviceMb: async () => 1500 } });
  const evicted = [];
  aiOnCard(arb, 6800, () => evicted.push("gemma"));
  expect(await svc.loadModel("plain")).toEqual({ modelId: "plain", placement: "gpu", kind: "tts", reason: "it has no usable speed on the CPU, so the AI model makes room" });
  expect(evicted).toEqual(["gemma"]);
  expect(arb.eventsSince(0)).toMatchObject([{ victim_key: "llm:gemma", reason: "loading plain" }]);
  expect(arb.reservedMb("tts:audiocpp:gpu")).toBe(1500);
});

test("replacing the kind's model on the same server: the new model's early booking holds the key while the old one leaves", async () => {
  let dev = 2000;
  const { svc, arb, pool } = service({ probes: { deviceMb: async () => dev } });
  await svc.loadModel("chatterbox");
  expect(arb.reservedMb("tts:audiocpp:gpu")).toBe(2000);
  svc._placement.recordPeak(ROWS.kokoro, 1000, "cuda12");
  dev = null; // its own reading misses: the early booking keeps the price
  expect((await svc.loadModel("kokoro")).placement).toBe("gpu");
  expect(pool.get("gpu", "tts").calls).toContainEqual(["unload", ["chatterbox"]]);
  expect(arb.reservationOf("tts:audiocpp:gpu")).toMatchObject({ vram_mb: 1000, source: "measured" });
  expect(svc.loaded().map((l) => l.modelId)).toEqual(["kokoro"]);
});

test("THE ONE-POOL RULING: on shared memory every load books, the CPU's too; a model that moves leaves its old server and booking", async () => {
  const { svc, arb, pool } = service({ hw: onePool(), probes: { rssMb: async () => 900 } });
  expect(await svc.loadModel("kokoro")).toEqual({ modelId: "kokoro", placement: "gpu", kind: "tts", reason: "the graphics share this machine's memory, so the CPU would free none of it" });
  expect(arb.reservationOf("tts:audiocpp:gpu")).toMatchObject({ vram_mb: 900, source: "measured" });
  expect((await svc.loadModel("kokoro", { placement: "cpu" })).placement).toBe("cpu");
  expect(pool.get("gpu", "tts").calls).toContainEqual(["unload", ["kokoro"]]);
  expect(arb.isReserved("tts:audiocpp:gpu")).toBe(false);
  expect(arb.reservedMb("tts:audiocpp:cpu")).toBe(900);
});

test("a booking per server and kind: the arbiter evicts a speech model through its server; stopping the servers releases every booking", async () => {
  {
    const { svc, arb, pool } = service({ probes: { deviceMb: async () => 1200, rssMb: async () => 900 } });
    await svc.loadModel("kokoro");
    expect(await arb.evictableRamMb()).toBe(900); // what evicting it gives back in system memory
    expect(await arb.makeRoom(8000, { reason: "loading gemma" })).toBe(true);
    expect(svc.loaded()).toEqual([]);
    expect(pool.get("gpu", "tts").calls).toContainEqual(["unload", ["kokoro"]]);
    expect(arb.isReserved("tts:audiocpp:gpu")).toBe(false);
    expect(arb.eventsSince(0)).toMatchObject([{ victim_key: "tts:audiocpp:gpu", victim_kind: "tts" }]);
  }
  {
    const mb = { 11: 1200, 21: 700 };
    const { svc, arb } = service({ probes: { deviceMb: async (pid) => mb[pid] ?? null } });
    await svc.loadModel("kokoro");
    await svc.loadModel("parakeet");
    expect(svc.loaded().map((l) => `${l.kind}:${l.modelId}@${l.placement}`)).toEqual(["tts:kokoro@gpu", "stt:parakeet@gpu"]);
    expect([arb.reservedMb("tts:audiocpp:gpu"), arb.reservedMb("stt:audiocpp:gpu")]).toEqual([1200, 700]);
    expect(arb.reservationOf("stt:audiocpp:gpu").kind).toBe("stt");
    await svc.stopServer();
    expect(svc.loaded()).toEqual([]);
    expect([arb.isReserved("tts:audiocpp:gpu"), arb.isReserved("stt:audiocpp:gpu")]).toEqual([false, false]);
  }
});

// ─── after a line ────────────────────────────────────────────────────────────────────────────────────

test("a model its load couldn't measure is priced on its first line; a runaway line's process prices nothing again, though it still books", async () => {
  let dev = null;
  const { svc, ledger, arb, clock } = service({ probes: { deviceMb: async () => dev }, speech: { warm: async () => false } });
  await svc.loadModel("chatterbox"); // speaks only from a clip: no warm-up, nothing measured
  expect(arb.isReserved("tts:audiocpp:gpu")).toBe(false);
  dev = 2500;
  await svc.noteLine("chatterbox", { text: "Hello there, friend.", audioS: 1.5, wallS: 0.6 });
  await settle();
  expect(arb.reservationOf("tts:audiocpp:gpu")).toMatchObject({ vram_mb: 2500, source: "measured" });
  const peaks = () => ledger.rows.filter((r) => r.source === "peak").map((r) => r.vramModelMb);
  expect(peaks()).toEqual([2500]);
  // a three-character line that ran 655 s (Qwen3-TTS Base, 2026-10-10)
  await svc.noteLine("chatterbox", { text: "Hi.", audioS: 655, wallS: 40 });
  await settle();
  clock.t += 10; // past the probe's cache
  dev = 6235;
  await svc._highWater("chatterbox");
  expect(arb.reservedMb("tts:audiocpp:gpu")).toBe(6235); // it still books what it holds
  expect(peaks()).toEqual([2500]); // but that is never the model's price
});

test("the first line of 2 s or more on the CPU records its real-time factor at the threads setting — Auto reads it from then on", async () => {
  const { svc, ledger } = service();
  await svc.loadModel("kokoro", { placement: "cpu" });
  const text = "x".repeat(80);
  await svc.noteLine("kokoro", { text, audioS: 1.5, wallS: 1 }); // too short to say
  await svc.noteLine("kokoro", { text, audioS: 6.4, wallS: 2 });
  await svc.noteLine("kokoro", { text, audioS: 9, wallS: 1 }); // once per load
  await settle();
  const speeds = ledger.rows.filter((r) => r.source === "speed");
  expect(speeds).toHaveLength(1);
  expect(speeds[0]).toMatchObject({ modelId: lid("kokoro"), machineKey: MK, backend: "cpu", realtimeX: 3.2, kind: "tts", label: "CPU real-time factor (8 threads)" });
  expect(speeds[0].switches).toEqual([{ flagName: "threads", flagValue: "8" }]);
  expect(svc._placement.cpuSpeed(ROWS.kokoro, 8)).toEqual([3.2, true]);
  expect((await svc._placement.placementFor(ROWS.kokoro, { choice: "cpu" })).reason).toBe("your choice — 3.2× real time here");
});

// ─── the locks (JustVoice's manager.js: each kind's activity lock, then the load lock) ───────────────────────────────

test("a line holds its model: the kind's next load waits for it to end; the kind is busy and the model in use meanwhile", async () => {
  const { svc, arb } = service();
  await svc.loadModel("kokoro");
  let release;
  const gate = new Promise((r) => {
    release = r;
  });
  const order = [];
  const line = svc.useModel("kokoro", { line: () => ({ text: "Hello.", audioS: 1 }) }, async (server, held) => {
    order.push(`line on ${held.modelId}`);
    expect(server).toBe(svc._pool.get(held.placement, "tts"));
    expect(arb.busyKinds().has("tts")).toBe(true); // never an eviction's victim mid-line
    expect(svc.busyModels()).toContain("kokoro"); // nor deleted
    await gate;
    order.push("line ends");
    return "spoken";
  });
  await settle();
  const next = svc.loadModel("plain", { placement: "cpu" }).then(() => order.push("plain loaded"));
  await settle();
  expect(order).toEqual(["line on kokoro"]); // the load waits for the line
  release();
  expect(await line).toBe("spoken");
  await next;
  expect(order).toEqual(["line on kokoro", "line ends", "plain loaded"]);
  expect(svc.loaded().map((l) => l.modelId)).toEqual(["plain"]);
  expect(arb.busyKinds().has("tts")).toBe(false);
  expect(svc.busyModels()).not.toContain("kokoro");
});

test("a line uses its model where it is; asked elsewhere, it moves there first; a model its server lost loads again", async () => {
  const { svc, pool } = service();
  const first = await svc.useModel("kokoro", {}, async (_s, held) => held);
  expect(first).toMatchObject({ modelId: "kokoro", kind: "tts" });
  expect(await svc.useModel("kokoro", {}, async (_s, held) => held.placement)).toBe(first.placement);
  expect(await svc.useModel("kokoro", { placement: "cpu" }, async (_s, held) => held.placement)).toBe("cpu");
  // its process ended: the next line loads it again rather than talk to nobody
  await pool.get("cpu", "tts").stop();
  expect(await svc.useModel("kokoro", { placement: "cpu" }, async (server) => server.hasModel("kokoro"))).toBe(true);
});

// ─── round E: JustVoice's session's B and G items (2026-10-29) ─────────────────────────────────────────

const until = async (check) => {
  for (let i = 0; i < 200 && !check(); i++) await new Promise((r) => setTimeout(r, 5));
};

/** The service's downloads, faked: `missing` models aren't on disk until `finish(id)` (or `fail(id, why)`); downloadModel
 *  keeps the real one's state shape — and its licence gate — and an Unload's cancel ends it "cancelled". */
function withDownloads(svc, { missing = [] } = {}) {
  const absent = new Set(missing);
  const ends = new Map();
  svc.modelFor = (id) => {
    if (absent.has(id)) throw Object.assign(new Error(`${id} isn't downloaded`), { notDownloaded: true });
    return { key: id, files: { model: `/m/${id}.gguf`, aligner: `/m/${id}-aligner.gguf` } };
  };
  svc._here = (m) => !absent.has(m.id);
  svc.downloadModel = (id) => {
    svc._gate(svc._model(id));
    const cancel = new AsyncEvent();
    const state = { status: "downloading", error: "", downloaded: 0, total: 0, cancel, done: null };
    svc._modelState.set(id, state);
    const ended = new Promise((r) => ends.set(id, r));
    state.done = Promise.race([ended, cancel.wait()]).then((why) => {
      if (cancel.isSet()) svc._modelState.set(id, { status: "cancelled", error: "", downloaded: 0, total: 0 });
      else if (typeof why === "string") svc._modelState.set(id, { status: "error", error: why, downloaded: 0, total: 0 });
      else {
        absent.delete(id);
        svc._modelState.set(id, { status: "downloaded", error: "", downloaded: 0, total: 0 });
      }
    });
    return svc.modelsStatus().find((x) => x.id === id);
  };
  return { finish: (id) => ends.get(id)?.(true), fail: (id, why) => ends.get(id)?.(why) };
}

test("a load's booking is no eviction's victim until its model registers — then it is; the key is never unbooked between (B10)", async () => {
  const hw = discrete();
  const arb = new VramArbiter(() => hw);
  const midLoad = [];
  const { svc } = service({
    arb,
    probes: { deviceMb: async () => 6800 },
    speech: {
      warm: async ({ calibrate }) => {
        // a chat load's admission while the speech model is loading: it re-syncs its pins, then makes room
        arb.syncPins(new Set());
        midLoad.push(await arb.makeRoom(8000, { reason: "loading gemma" }), arb.reservationOf("tts:audiocpp:gpu"));
        return calibrate;
      },
    },
  });
  svc._placement.recordPeak(ROWS.chatterbox, 7000, "cuda12"); // a price measured here: an early booking
  await svc.loadModel("chatterbox");
  expect(midLoad).toEqual([false, expect.objectContaining({ vram_mb: 7000, pinned: true })]); // never the victim mid-load
  expect(arb.reservationOf("tts:audiocpp:gpu")).toMatchObject({ vram_mb: 7000, pinned: false }); // booked, evictable again
  expect(await arb.makeRoom(8000, { reason: "loading gemma" })).toBe(true); // now its evictor unloads the model
  expect(svc.loaded()).toEqual([]);
  // a refused load unpins what it pinned: the kind's model it would have replaced is evictable again
  const busy = service({ arb: new VramArbiter(() => hw), probes: { deviceMb: async () => 1200 } });
  await busy.svc.loadModel("kokoro");
  busy.svc._placement.recordPeak(ROWS.chatterbox, 7000, "cuda12");
  aiOnCard(busy.arb, 5000);
  busy.arb.busyBegin("llm");
  await expect(busy.svc.loadModel("chatterbox")).rejects.toBeInstanceOf(NotEnoughMemoryError);
  expect(busy.arb.reservationOf("tts:audiocpp:gpu")).toMatchObject({ vram_mb: 1200, pinned: false });
  expect(busy.svc._loadingKeys.size).toBe(0);
});

test("a model whose server died stops counting as loaded, its booking released, whenever anything asks (B5)", async () => {
  const { svc, arb, pool } = service({ probes: { deviceMb: async () => 1200 } });
  await svc.loadModel("kokoro");
  expect(arb.reservedMb("tts:audiocpp:gpu")).toBe(1200);
  pool.get("gpu", "tts").running = false; // its process ended
  expect(svc.loaded()).toEqual([]);
  expect(arb.isReserved("tts:audiocpp:gpu")).toBe(false);
  expect(() => svc.serverFor("kokoro")).toThrow(/isn't loaded/);
});

test("the user's Auto / GPU / CPU per model is saved and read by every load naming none; the list says where each would load and why (G2)", async () => {
  const { svc } = service();
  withDownloads(svc, { missing: ["parakeet"] });
  svc._modelsFn = () => [ROWS.kokoro, ROWS.chatterbox, ROWS.parakeet];
  expect(svc.placementChoice("kokoro")).toBe("auto");
  expect(await svc.savePlacement("kokoro", "cpu")).toMatchObject({
    id: "kokoro",
    placementChoice: "cpu",
    placement: { where: "cpu", reason: "your choice — 3.1× real time on the reference machine", cardFailed: false },
    loading: "",
    loadError: "",
  });
  expect((await svc.loadModel("kokoro")).placement).toBe("cpu"); // no placement: the saved one
  expect((await svc.loadModel("kokoro", { placement: "gpu" })).placement).toBe("gpu"); // one given wins
  expect(await svc.useModel("kokoro", {}, async (_s, held) => held.placement)).toBe("cpu"); // a line naming none: back
  // a card load that failed here: the verdict says so; "Try the card again" forgets it
  svc._placement.recordCardFailure(ROWS.chatterbox, "failed");
  await svc.refreshPlacements({ force: true });
  const list = () => Object.fromEntries(svc.modelsStatus().map((m) => [m.id, m]));
  expect(list().chatterbox).toMatchObject({ placementChoice: "auto", placement: { where: "cpu", reason: "it didn't load on the graphics card — this may be slow on the CPU", cardFailed: true } });
  expect(list().kokoro.placement).toEqual({ where: "cpu", reason: "your choice — 3.1× real time on the reference machine", cardFailed: false }); // loaded: where it is
  expect(list().parakeet).toMatchObject({ onDisk: false, placement: null, placementChoice: "auto" }); // not here: nothing to say
  expect((await svc.tryCardAgain("chatterbox")).placement).toMatchObject({ where: "gpu", cardFailed: false });
  await expect(svc.savePlacement("kokoro", "npu")).rejects.toThrow(/unknown placement/);
  // the readings are taken once for the whole list and kept a few seconds: a poll in between reads nothing again
  const reads = vi.spyOn(svc._placement, "placementFor");
  await svc.refreshPlacements();
  expect(reads).not.toHaveBeenCalled();
  // a store that can't answer reads as Auto
  svc._choices = { get: () => { throw new Error("db gone"); }, set: () => {} };
  expect(svc.placementChoice("kokoro")).toBe("auto");
});

test("a model's saved load options go with every load given none; a line reloads it once they change (G3)", async () => {
  let saved = { "kokoro_fam.voice": "bella" };
  const { svc, pool } = service({ speech: { sessionOptions: (row) => (row.id === "kokoro" ? saved : {}) } });
  const registers = () => pool.get("gpu", "tts").calls.filter(([c]) => c === "register").length;
  await svc.loadModel("kokoro");
  expect(svc._held.get("kokoro").optsKey).toContain("bella");
  await svc.useModel("kokoro", {}, async () => {});
  expect(registers()).toBe(1); // the same options: nothing reloads
  saved = { "kokoro_fam.voice": "nicole" };
  await svc.useModel("kokoro", {}, async () => {});
  expect(registers()).toBe(2);
  expect(svc._held.get("kokoro").optsKey).toContain("nicole");
  await svc.loadModel("kokoro", { sessionOptions: { "kokoro_fam.voice": "adam" } }); // options given win
  expect(svc._held.get("kokoro").optsKey).toContain("adam");
});

test("Load downloads a model that isn't here and loads it once it is; a line waits for its download too; a failure is the list's (G4)", async () => {
  const { svc } = service();
  const dl = withDownloads(svc, { missing: ["chatterbox", "omnivoice", "qwen"] });
  svc._modelsFn = () => [ROWS.chatterbox, ROWS.qwen];
  const row = (id) => svc.modelsStatus().find((m) => m.id === id);
  expect(await svc.startLoad("chatterbox")).toEqual({ status: "downloading", modelId: "chatterbox" });
  expect(row("chatterbox")).toMatchObject({ loading: "downloading", status: "downloading", placement: null });
  dl.finish("chatterbox");
  await until(() => svc.loaded().length === 1);
  expect(row("chatterbox")).toMatchObject({ loading: "", running: true, loadError: "", status: "downloaded" });
  // a line on a model not here: it waits for the download, then runs
  const line = svc.useModel("omnivoice", {}, async (_s, held) => held.modelId);
  await until(() => svc._loads.get("omnivoice")?.phase === "downloading");
  dl.finish("omnivoice");
  expect(await line).toBe("omnivoice");
  // on disk: it loads now
  expect(await svc.startLoad("kokoro")).toMatchObject({ modelId: "kokoro", kind: "tts" });
  // a download that fails: the background load's failure is the list's; a new load clears it
  await svc.startLoad("qwen");
  dl.fail("qwen", "the connection was reset");
  await until(() => row("qwen").loading === "");
  expect(row("qwen")).toMatchObject({ loadError: "the connection was reset", status: "error" });
  await svc.startLoad("qwen");
  expect(row("qwen").loadError).toBe("");
  dl.finish("qwen");
  await until(() => row("qwen").running);
});

test("an Unload during a load cancels it — in its download or at its next step — nothing left held or booked (G12)", async () => {
  {
    const { svc } = service();
    withDownloads(svc, { missing: ["chatterbox"] });
    const load = svc.loadModel("chatterbox").catch((e) => e);
    await until(() => svc._loads.get("chatterbox")?.phase === "downloading");
    expect(await svc.unloadModel("chatterbox")).toBe(true);
    expect((await load).loadCancelled).toEqual({ modelId: "chatterbox" });
    expect(svc._modelState.get("chatterbox").status).toBe("cancelled"); // the download it started stopped
    expect(svc.loaded()).toEqual([]);
    expect(svc._loads.size).toBe(0);
  }
  {
    let open;
    const gate = new Promise((r) => (open = r));
    const { svc, arb, pool } = service({ probes: { deviceMb: async () => 1200 }, speech: { warm: async () => (await gate, true) } });
    svc._placement.recordPeak(ROWS.chatterbox, 3000, "cuda12"); // an early booking to release
    const load = svc.loadModel("chatterbox").catch((e) => e);
    await until(() => pool.get("gpu", "tts").models.has("chatterbox"));
    expect(arb.reservationOf("tts:audiocpp:gpu")).toMatchObject({ vram_mb: 3000, pinned: true });
    expect(await svc.unloadModel("chatterbox")).toBe(true);
    open();
    expect((await load).loadCancelled).toEqual({ modelId: "chatterbox" });
    expect(pool.get("gpu", "tts").calls).toContainEqual(["unload", ["chatterbox"]]); // what registered left its server
    expect(arb.isReserved("tts:audiocpp:gpu")).toBe(false);
    expect(pool.map.has("cpu/tts")).toBe(false); // never retried on the CPU
    expect(svc.loaded()).toEqual([]);
    // the next load is a load again
    expect((await svc.loadModel("kokoro")).modelId).toBe("kokoro");
  }
});

test("an on-demand companion registers on the first line that needs it, not with its model; it leaves with it (G11)", async () => {
  const { svc, pool } = service();
  withDownloads(svc);
  const asr = { ...row("qwen-asr", "Qwen3-ASR", { kind: "stt", filesGb: 1 }), spec: { family: "qwen3_asr", task: "asr", companions: [{ role: "aligner", family: "qwen3_forced_aligner", task: "align", slot: "aligner", onDemand: true }] } };
  svc._model = (id) => (id === "qwen-asr" ? asr : ROWS[id]);
  const srv = () => pool.get("gpu", "stt");
  const registered = () => srv().calls.filter(([c]) => c === "register").map(([, id]) => id);
  await svc.loadModel("qwen-asr", { placement: "gpu" });
  expect(registered()).toEqual(["qwen-asr"]); // 1.1 GB most captures never use: not with its model
  await svc.useModel("qwen-asr", {}, async () => {});
  expect(registered()).toEqual(["qwen-asr"]);
  expect(await svc.useModel("qwen-asr", { needs: ["aligner"] }, async (server) => server.hasModel("qwen-asr::aligner"))).toBe(true);
  await svc.useModel("qwen-asr", { needs: ["aligner"] }, async () => {}); // once
  expect(registered()).toEqual(["qwen-asr", "qwen-asr::aligner"]);
  await svc.unloadModel("qwen-asr");
  expect(srv().calls).toContainEqual(["unload", ["qwen-asr", "qwen-asr::aligner"]]);
});

test("a transcription request goes as the app shapes it — its body and its time limit (G1)", async () => {
  const { svc } = service({ speech: { transcribe: async (body, r) => ({ body: { ...body, language: "English", model_row: r.id }, timeout: 42 }) } });
  expect(await svc.transcriptionRequest("parakeet", { language: "en" })).toEqual({ body: { language: "English", model_row: "parakeet" }, timeout: 42 });
  expect(await service().svc.transcriptionRequest("parakeet", { a: 1 })).toEqual({ body: { a: 1 }, timeout: null });
});

test("the routes (round E's contract): Load 200 or 202, the licence's 403, a cancelled load's 409; the saved placement and Try the card again answer the model's row", async () => {
  const { svc, pool } = service();
  withDownloads(svc, { missing: ["chatterbox", "omnivoice"] });
  svc._modelsFn = () => [ROWS.kokoro, ROWS.chatterbox, ROWS.omnivoice];
  configureRuntimeServices([["audiocpp", svc]]);
  const app = createServer({ typeBase: "t/" });
  app.route("/", makeRuntimesRouter());
  const send = (method, url, body) => app.request(`/v1/ai/runtimes/audiocpp${url}`, { method, headers: { "content-type": "application/json" }, body: JSON.stringify(body ?? {}) });
  const models = async () => Object.fromEntries((await (await app.request("/v1/ai/runtimes/audiocpp/models")).json()).models.map((m) => [m.id, m]));

  let r = await send("POST", "/models/kokoro/load", { placement: "cpu" });
  expect(r.status).toBe(200);
  expect(await r.json()).toEqual({ modelId: "kokoro", placement: "cpu", kind: "tts", reason: "your choice — 3.1× real time on the reference machine" });
  r = await send("POST", "/models/chatterbox/load", {});
  expect(r.status).toBe(202);
  expect(await r.json()).toEqual({ status: "downloading", modelId: "chatterbox" });
  expect((await models()).chatterbox).toMatchObject({ loading: "downloading", placement: null, placementChoice: "auto" });
  // an Unload meanwhile cancels it: its download "cancelled", no error
  expect(await (await send("POST", "/models/chatterbox/unload")).json()).toMatchObject({ unloaded: true });
  await until(() => !svc._loads.has("chatterbox"));
  expect((await models()).chatterbox).toMatchObject({ loading: "", status: "cancelled", loadError: "" });
  // the app's licence gate: 403 terms-required, nothing started
  svc._speech.beforeDownload = (m) => (m.id === "omnivoice" ? "Accept OmniVoice's licence before downloading its models." : null);
  r = await send("POST", "/models/omnivoice/load", {});
  expect(r.status).toBe(403);
  expect(await r.json()).toMatchObject({ type: "t/terms-required", modelId: "omnivoice" });
  expect((await models()).omnivoice).toMatchObject({ loading: "", status: "" });
  expect((await send("POST", "/models/omnivoice/download")).status).toBe(403);
  // a load an Unload cancels at its next step: 409 load-cancelled
  let open;
  const gate = new Promise((x) => (open = x));
  svc._placement.warm = async () => (await gate, false);
  const pending = send("POST", "/models/kokoro/load", { placement: "gpu" });
  await until(() => pool.get("gpu", "tts").models.has("kokoro"));
  await send("POST", "/models/kokoro/unload");
  open();
  r = await pending;
  expect(r.status).toBe(409);
  expect(await r.json()).toMatchObject({ type: "t/load-cancelled", modelId: "kokoro" });
  // the saved choice and Try the card again answer the model's row
  r = await send("PUT", "/models/kokoro/placement", { placement: "gpu" });
  expect(r.status).toBe(200);
  expect(await r.json()).toMatchObject({ id: "kokoro", placementChoice: "gpu", placement: { where: "gpu", reason: "your choice", cardFailed: false }, loading: "" });
  expect((await send("PUT", "/models/kokoro/placement", { placement: "npu" })).status).toBe(422);
  svc._placement.recordCardFailure(ROWS.kokoro, "spilled");
  r = await send("POST", "/models/kokoro/try-card");
  expect(r.status).toBe(200);
  expect(await r.json()).toMatchObject({ id: "kokoro", placement: { cardFailed: false } });
  expect((await send("PUT", "/models/nope/placement", { placement: "cpu" })).status).toBe(404);
});
