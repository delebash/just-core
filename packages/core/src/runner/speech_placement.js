// SPDX-License-Identifier: MIT
// Where a speech model loads and what it books on the card — the kit's (round E, 2026-10-29, the user: "Kit code, every
// runtime": measured price beats declared, Auto / GPU / CPU placement and the worse-of-two admission are the kit's).
// Ported from JustVoice's server/src/engines/manager.js, its decisions and their dates kept; RuntimeService.loadModel
// (runner/runtime_service.js) runs it for a runtime whose models are registered into running servers (audio.cpp).
//
// Placement: the graphics card or the CPU, per model (2026-10-02). The user's choice per model (Auto / GPU / CPU) and,
// for Auto, the decided order:
//   1. the GPU when nothing else is on the card, or when the model's MEASURED graphics-memory size fits beside the AI
//      model;
//   2. else the CPU, when it speaks at least `cpu_min_realtime` (2×) real time there;
//   3. else the GPU with the AI model unloaded first — the kit's eviction event, so the app's existing toast says so.
// A model never measured on the card counts as not fitting while an AI model is on it.
//
// The measured currency: no number here is declared or estimated once a load has measured it — a model's price is what
// it was MEASURED to take on this machine, by this build, at the piece length and with the load options it is given. A
// reading is per process (one server per placement and kind holds one model: runner/audiocpp.js), not a device delta;
// the delta survives only as the fallback on boxes with no per-process reading (AMD Linux), labeled "computed".
//
// What is the app's comes in as data and small functions, never its code: a model's audio.cpp memory estimate
// (`spec.minVramGb` on its runtime_model row) and reference CPU speed (`refSpeed.cpu`), the piece length its price is
// measured at (`pieceLength(row)`), its load-option set (`loadOptionsKey(row)`), and its warm-up (`warm(…)`: a full-length
// piece when it has no price on the card yet — the request a line takes is the app's).
import os from "node:os";
import { sleep as sleepMs } from "../platform/asyncutil.js";
import { getLogger } from "../platform/log.js";
import { pyRound } from "../platform/py.js";
import { pyFixed } from "../platform/pyjson.js";
import { getArbiter } from "./arbiter.js";
import { DEFAULT_SAFETY_MARGIN_MB } from "./config.js";
import * as hardware from "./hardware.js";

const log = getLogger("llm_runner.runner.speech_placement");

// The polling/per-line probes can shell out (nvidia-smi / typeperf), so the after-line reading goes through a short TTL
// cache. There is NO pre-load estimate constant: the only numbers in the pricing chain are measured ones.
export const PROBE_TTL_S = 2.0;

const monotonic = () => performance.now() / 1000;
const MIB = 1024 * 1024;
const msgOf = (e) => e?.message ?? String(e);
const flagsOf = (row) => Object.fromEntries((row.switches || []).map((f) => [f.flagName, f.flagValue]));

/** A real-time factor the way the rows say it: 3.2×, 12×. */
export function fmtX(v) {
  return v < 10 ? `${pyFixed(v, 1)}×` : `${pyFixed(v, 0)}×`;
}

/** A size in GB the way the rows say it: 1.3, 12. */
export function fmtGb(v) {
  return v < 10 ? String(Math.round(v * 10) / 10) : String(Math.round(v));
}

/** A model's download, GB (unrounded) — its row's files; null for a row that lists none. */
export function filesGbOf(row) {
  const files = row?.files ?? [];
  if (!files.length) return null;
  return files.reduce((n, f) => n + Number(f.bytes || 0), 0) / 1024 ** 3;
}

/**
 * What a model needs in memory before a load measures it, `{gb, by}`: the larger of audio.cpp's estimate
 * (`spec.minVramGb`) and its download, since the weights alone take that much — the estimate is one per model, shared by
 * its precisions, and below the files of some (FireRedAudio's original weights are 23 GB against an estimate of 10), and
 * MOSS-TTSD has none (decided 2026-10-12). `by` says which decided: "estimate" or "files". null with neither number —
 * "memory not measured yet".
 */
export function needOf(row) {
  const files = filesGbOf(row);
  if (files === null) return null;
  const estimate = Number(row?.spec?.minVramGb) || 0;
  if (files > estimate) return { gb: Math.round(files * 10) / 10, by: "files" };
  return estimate ? { gb: estimate, by: "estimate" } : null;
}

/** A load refused for memory, in the words the screens show; `where` "card" (the graphics card's admission) or
 *  "system" (this machine's memory). */
export class NotEnoughMemoryError extends Error {
  constructor(message, { where, neededMb = 0, freeMb = null } = {}) {
    super(message);
    this.name = "NotEnoughMemoryError";
    this.where = where;
    this.neededMb = neededMb;
    this.freeMb = freeMb;
  }
}

/** The host's llama.cpp service when one is wired (lifecycle.configuredService — never the standalone fallback), read
 *  lazily: lifecycle.js imports runtime_service.js, which imports this module. null: no AI model to reconcile or
 *  credit. */
export async function wiredLlm() {
  try {
    const lc = await import("./lifecycle.js");
    return lc.configuredService?.() ?? null;
  } catch {
    return null;
  }
}

const DEFAULT_PROBES = Object.freeze({
  usedPoolMb: (opts) => hardware.usedPoolMb(opts),
  deviceMb: (pid) => hardware.processTreeDeviceMemMb(pid),
  sharedMb: (pid) => hardware.processTreeSharedMb(pid),
  rssMb: (pid) => hardware.processTreeRssMb(pid),
});

const DEFAULT_MEMORY = Object.freeze({
  freeMb: () => os.freemem() / MIB,
  totalMb: () => os.totalmem() / MIB,
});

/**
 * One runtime's speech placement, pricing, admission and measurement. RuntimeService builds it for a register runtime:
 * `ledger` the kit's measurement ledger (`{list, record, clear, pruneLoadRows}`); `ledgerId(modelId)` a model's id in
 * it; `arbiter()` the VRAM arbiter; `hardwareFn()` the detection (null: unknown); `settingsFn()` the runtime's settings
 * (cpu_min_realtime, card_margin_mb, spill_mb, runaway_*); `safetyMarginMbFn()` the AI model's margin, which system
 * memory is held to; `cardBackendFn()` the installed build's backend ("cuda", "vulkan", "metal"; "cpu" for the CPU
 * build; null: none installed); `buildFn()` the build a measurement belongs to; `cpuThreadsFn()` the CPU process's
 * threads; `occupantFn(kind)` the kind's model now (`{modelId, placement, device, row}` or null); `instanceKey(kind,
 * placement)` a server's booking key. The app's: `pieceLength(row)`, `loadOptionsKey(row)`, `warm({server, row,
 * modelId, entries, calibrate})` → whether it calibrated. Seams: `llmFn`, `probes`, `memory`, `sleep(s)`, `now()`.
 */
export class SpeechPlacement {
  constructor({
    label = "audio.cpp",
    ledger = null,
    ledgerId = (modelId) => modelId,
    arbiter = getArbiter,
    hardwareFn = () => hardware.detected(),
    settingsFn = () => ({}),
    safetyMarginMbFn = () => DEFAULT_SAFETY_MARGIN_MB,
    cardBackendFn = () => null,
    buildFn = () => "",
    cpuThreadsFn = async () => 1,
    occupantFn = () => null,
    instanceKey = (kind, placement) => `${kind}:${placement}`,
    pieceLength = () => null,
    loadOptionsKey = () => "",
    warm = async () => false,
    llmFn = wiredLlm,
    probes = null,
    memory = null,
    sleep = (s) => sleepMs(s * 1000),
    now = monotonic,
  } = {}) {
    this.label = label;
    this._ledger = ledger;
    this._ledgerId = ledgerId;
    this._arbiterFn = arbiter;
    this._hardwareFn = hardwareFn;
    this._settingsFn = settingsFn;
    this._safetyMarginMbFn = safetyMarginMbFn;
    this._cardBackendFn = cardBackendFn;
    this._buildFn = buildFn;
    this._cpuThreadsFn = cpuThreadsFn;
    this._occupantFn = occupantFn;
    this.instanceKey = instanceKey;
    this._pieceLength = pieceLength;
    this._loadOptionsKey = loadOptionsKey;
    this.warm = warm;
    this._llmFn = llmFn;
    this._probes = { ...DEFAULT_PROBES, ...(probes ?? {}) };
    this._memory = { ...DEFAULT_MEMORY, ...(memory ?? {}) };
    this._sleep = sleep;
    this._now = now;
    // The after-line probe's TTL cache: "pid:<n>" → [monotonic s, value].
    this._probeCache = new Map();
    // Pids of server processes that ran a runaway line: their readings no longer price a model (runaway_s_per_char).
    // Keyed by the process, not the model — the process outlives an unload.
    this._unpricedPids = new Set();
  }

  // ── what the runtime and the box say ─────────────────────────────────────────────────────────────

  _arb() {
    return this._arbiterFn();
  }

  /** The detection, or null when it is unavailable — placement then reads the card as its own memory, and nothing is
   *  booked. */
  async hardware() {
    try {
      return (await this._hardwareFn()) ?? null;
    } catch {
      return null;
    }
  }

  _settings() {
    try {
      return this._settingsFn() ?? {};
    } catch {
      return {};
    }
  }

  /** The installed build's backend ("cpu" for the CPU build), or null when none is installed. */
  cardBackend() {
    try {
      return this._cardBackendFn() ?? null;
    } catch {
      return null;
    }
  }

  _build() {
    try {
      return String(this._buildFn() ?? "");
    } catch {
      return "";
    }
  }

  /** This machine's measurement key, or null before detection (nothing is read or recorded then). */
  _mk() {
    try {
      const hw = this._hardwareFn();
      return hw && typeof hw.then !== "function" ? hardware.machineKey(hw) : null;
    } catch {
      return null;
    }
  }

  _rows(row) {
    try {
      return this._ledger?.list(this._ledgerId(row.id)) ?? [];
    } catch {
      return []; // no ledger wired (a bare test)
    }
  }

  /** Auto's bar for the CPU — seconds of audio per second of work (decided: 2×). */
  cpuMinRealtime() {
    return Number(this._settings().cpu_min_realtime || 2.0);
  }

  /** Growth of a card load's shared GPU memory (MB) that counts as a spill into system memory. */
  spillMb() {
    const v = Number(this._settings().spill_mb);
    return Number.isFinite(v) && v >= 0 ? v : 256;
  }

  /** The headroom a speech model not yet measured here is held to on the graphics card — the runtime's own setting
   *  (`card_margin_mb`, 512 MB), not the AI model's (decided 2026-10-16); a measured model is weighed at what it took. */
  cardMarginMb() {
    const v = Number(this._settings().card_margin_mb);
    return Number.isFinite(v) && v >= 0 ? Math.trunc(v) : 512;
  }

  /** The AI model's margin knob (the SAME knob the LLM admission subtracts). Speech holds system memory to it; the
   *  card to `cardMarginMb`. */
  safetyMarginMb() {
    try {
      const v = Number(this._safetyMarginMbFn());
      return Number.isFinite(v) && v >= 0 ? Math.trunc(v) : DEFAULT_SAFETY_MARGIN_MB;
    } catch {
      return DEFAULT_SAFETY_MARGIN_MB;
    }
  }

  /** The longest a line of `text` may run, in seconds, before it ran away: `runaway_s_per_char` a character of its text,
   *  and never less than `runaway_min_s`. */
  runawayLimitS(text) {
    const s = this._settings();
    const perChar = Number(s.runaway_s_per_char);
    const minS = Number(s.runaway_min_s);
    return Math.max(Number.isFinite(minS) && minS >= 0 ? minS : 30, (Number.isFinite(perChar) && perChar >= 0 ? perChar : 0.5) * String(text ?? "").length);
  }

  async cpuThreads() {
    try {
      return Number(await this._cpuThreadsFn()) || 1;
    } catch {
      return 1;
    }
  }

  /** The flags a model's card price is kept under: the piece length it is measured at, the runtime build, and its
   *  load-option set ("" for the default set — whose prices were measured before the key existed, so they keep counting;
   *  decided 2026-10-15, a price per load-option set, measured the first time each is used). */
  priceKey(row) {
    let split = "";
    let opts = "";
    try {
      const n = this._pieceLength(row);
      split = n ? String(n) : "";
    } catch {
      split = "";
    }
    try {
      opts = String(this._loadOptionsKey(row) ?? "");
    } catch {
      opts = ""; // the default set
    }
    return { split_chars: split, runtime: this._build(), load_options: opts };
  }

  // ── the measured probes ──────────────────────────────────────────────────────────────────────────

  /** Measured used memory of the budget pool, read fresh (the load door). null = unmeasurable. */
  async usedPoolMb() {
    try {
      return await this._probes.usedPoolMb({ fresh: true });
    } catch {
      return null;
    }
  }

  /** A server process's shared GPU memory, MB — Windows' `Shared Usage`; null when unreadable. */
  async sharedMb(pid) {
    if (!pid) return null;
    try {
      return await this._probes.sharedMb(pid);
    } catch {
      return null;
    }
  }

  /** The system memory a server process (and its children) holds now, MB. A working set: it includes the model file's
   *  pages the system could drop, so it errs high. null = unreadable. */
  async rssMb(pid) {
    if (!pid) return null;
    try {
      return await this._probes.rssMb(pid);
    } catch {
      return null;
    }
  }

  /** Measured memory held by a server process tree: dedicated device memory on discrete boxes (per pid), resident set
   *  on one-pool boxes. null = unmeasurable. `fresh: false` reads the TTL cache (the after-line probe). */
  async procMemMb(pid, { fresh = true } = {}) {
    if (!pid) return null;
    const now = this._now();
    const key = `pid:${pid}`;
    if (!fresh) {
      const hit = this._probeCache.get(key);
      if (hit !== undefined && now - hit[0] < PROBE_TTL_S) return hit[1];
    }
    const hw = await this.hardware();
    let val;
    try {
      val = hw !== null && hardware.memArch(hw) !== "discrete" ? await this._probes.rssMb(pid) : await this._probes.deviceMb(pid);
    } catch {
      return null;
    }
    this._probeCache.set(key, [now, val]);
    return val;
  }

  // ── the price: what a model takes, measured, at the length it is given (JustVoice's audit §13.3) ───────

  /** [seconds of audio per second of work on the CPU, measured on THIS machine?]. The best of the newest 5 speeds this
   *  machine recorded for the model at the CPU-threads setting in force now, else the row's reference figure
   *  (`refSpeed.cpu`), else [null, false] — never offered to the CPU by Auto (audit §5 B7). */
  cpuSpeed(row, threads) {
    const mk = this._mk();
    if (mk) {
      const seen = [];
      for (const r of this._rows(row)) {
        const flags = flagsOf(r);
        if (r.machineKey === mk && r.source === "speed" && (r.backend || "") === "cpu" && Number(r.realtimeX || 0) > 0 && flags.threads === String(threads)) {
          seen.push(Number(r.realtimeX));
          if (seen.length === 5) break;
        }
      }
      if (seen.length) return [Math.max(...seen), true];
    }
    const ref = Number(row?.refSpeed?.cpu) || 0;
    return ref ? [ref, false] : [null, false];
  }

  /** What loading exactly this model on `device` takes, measured on this machine at the piece length and with the load
   *  options it is given now: the largest "peak" reading, by the runtime build running now. 0 = never measured there.
   *  Placement and the memory check both ask this one function (audit §5 B1). */
  priceMb(row, device) {
    if (!device) return 0;
    const mk = this._mk();
    if (!mk) return 0;
    const want = this.priceKey(row);
    let best = 0;
    for (const r of this._rows(row)) {
      const flags = flagsOf(r);
      if (
        r.machineKey === mk &&
        r.source === "peak" &&
        (r.backend || "") === device &&
        r.vramModelMb > 0 &&
        // A row with no load-options flag is the default set's.
        Object.entries(want).every(([k, v]) => (flags[k] ?? "") === v)
      ) {
        best = Math.max(best, Math.trunc(r.vramModelMb));
      }
    }
    return best;
  }

  /** A model's peak on this machine's graphics card, MB, from an earlier load — null when no load measured it (or the
   *  runtime is the CPU build). */
  measuredMbFor(row) {
    const device = this.cardBackend();
    if (!device || device === "cpu") return null;
    return this.priceMb(row, device) || null;
  }

  /** The system memory this model took at its last loads on `device` here, by the runtime build running now and with
   *  the load options it is given now: the largest "ram_peak" reading. 0 = never recorded. */
  ramPriceMb(row, device) {
    if (!device) return 0;
    const mk = this._mk();
    if (!mk) return 0;
    const { runtime: build, load_options: opts } = this.priceKey(row);
    let best = 0;
    for (const r of this._rows(row)) {
      const flags = flagsOf(r);
      if (r.machineKey === mk && r.source === "ram_peak" && (r.backend || "") === device && flags.runtime === build && (flags.load_options ?? "") === opts) {
        best = Math.max(best, Math.trunc(r.ramModelMb || 0));
      }
    }
    return best;
  }

  /** Did a card load of this model fail or spill here, with the runtime build running now, after its newest measured
   *  card load? The memory: decided 2026-10-12. That a later card load that measures it (a pin to the GPU) clears it,
   *  and a new runtime build forgets it, was JustVoice's; kept 2026-10-13, with "Try the card again" on the model's row
   *  to forget it (forgetCardFailure; the narrowings review, M8). */
  failedOnCard(row) {
    const mk = this._mk();
    if (!mk) return false;
    const build = this._build();
    let failedAt = 0;
    let measuredAt = 0;
    for (const r of this._rows(row)) {
      if (r.machineKey !== mk) continue;
      if (flagsOf(r).runtime !== build) continue;
      if (r.source === "no_card") failedAt = Math.max(failedAt, r.at);
      else if (r.source === "peak" && (r.backend || "") !== "cpu") measuredAt = Math.max(measuredAt, r.at);
    }
    return failedAt > measuredAt;
  }

  /** Forget that a card load of this model failed or spilled — "Try the card again" on its row (the narrowings review,
   *  M8): its `no_card` rows only, never its price or CPU speed. Returns the rows forgotten. */
  forgetCardFailure(row) {
    return this._ledger?.clear?.(this._ledgerId(row.id), "no_card") ?? 0;
  }

  _record(row, fields, keepFlags, source) {
    const mk = this._mk();
    if (!this._ledger || !mk) return;
    const id = this._ledgerId(row.id);
    this._ledger.record(id, { machineKey: mk, tokensPerSec: 0.0, vramTotalMb: 0, at: Math.trunc(Date.now()), kind: row.kind, ...fields });
    this._ledger.pruneLoadRows?.(id, mk, new Set(keepFlags), 5, source);
  }

  /** Remember that this model didn't stay on the graphics card here — once the CPU took it, so a fault that isn't the
   *  card's (the CPU failing too) is never blamed on it. Best-effort. */
  recordCardFailure(row, how) {
    try {
      const build = this._build();
      this._record(
        row,
        {
          source: "no_card",
          label: `didn't stay on the graphics card (${how}, ${build})`,
          rows: [{ flagName: "runtime", flagValue: build }],
          backend: this.cardBackend() ?? "",
        },
        ["runtime"],
        "no_card",
      );
    } catch (e) {
      log.debug(`card failure persist failed for ${row.id}: ${msgOf(e)}`);
    }
  }

  /** Persist a measured peak as a "peak" row — what `priceMb` reads on the next load. Keeps the newest 5 per length,
   *  runtime build and load-option set (the default set's rows carry no load-options flag). `how` names a reading that
   *  isn't the server process's own in the row's label. Best-effort: persistence must never fail a load. */
  recordPeak(row, mb, device, how = "") {
    try {
      const { split_chars: split, runtime: build, load_options: opts } = this.priceKey(row);
      this._record(
        row,
        {
          source: "peak",
          label: `speech peak (${device}, ${split ? `pieces of ${split} characters, ` : ""}${build}${opts ? `, load options ${opts}` : ""}${how ? `, ${how}` : ""})`,
          rows: [
            ...(split ? [{ flagName: "split_chars", flagValue: split }] : []),
            { flagName: "runtime", flagValue: build },
            ...(opts ? [{ flagName: "load_options", flagValue: opts }] : []),
          ],
          vramModelMb: Math.trunc(mb),
          backend: device,
        },
        ["split_chars", "runtime", "load_options"],
        "peak",
      );
    } catch (e) {
      log.debug(`speech peak persist failed for ${row.id}: ${msgOf(e)}`);
    }
  }

  /** Persist the system memory a model holds as a "ram_peak" row beside the card's "peak" rows — its server process,
   *  read once the load is done and again after its lines, raise-only, on either device (decided 2026-10-12). Keeps the
   *  newest 5 per runtime build and load-option set. Best-effort: persistence must never fail a load. */
  recordRam(row, mb, device) {
    try {
      const { runtime: build, load_options: opts } = this.priceKey(row);
      this._record(
        row,
        {
          source: "ram_peak",
          label: `speech memory (${device}, ${build}${opts ? `, load options ${opts}` : ""})`,
          rows: [{ flagName: "runtime", flagValue: build }, ...(opts ? [{ flagName: "load_options", flagValue: opts }] : [])],
          backend: device,
          ramModelMb: Math.trunc(mb),
        },
        ["runtime", "load_options"],
        "ram_peak",
      );
    } catch (e) {
      log.debug(`speech memory persist failed for ${row.id}: ${msgOf(e)}`);
    }
  }

  // ── the runaway rule ─────────────────────────────────────────────────────────────────────────────
  // A line whose audio runs far past its text — a runaway: one Qwen3-TTS Base sentence came back as 655 s (2026-10-10) —
  // leaves its process holding memory no normal line needs (6,235 MB against ~2.8 GB), and that reading, saved as a
  // peak, priced the model out of the card for good. Such a line is longer than `runaway_s_per_char` seconds a character
  // of its text (0.5; slow narration is about 0.1) and than `runaway_min_s` (30 s); its process's readings still book the
  // memory it holds, but none is saved as the model's price again. Approved 2026-10-11 (JustVoice's TASKS FINDING
  // "Digital silence…"): fix it so one odd reading can't set a model's price for good; kept, as settings, 2026-10-13
  // (the narrowings review, M2).

  /** May this process's readings be saved as a model's price? Not after it ran a runaway line. */
  prices(pid) {
    return !pid || !this._unpricedPids.has(pid);
  }

  /** Mark the process when its line ran away — before the line's high-water probe reads it. */
  noteRunaway(pid, modelId, text, audioS) {
    if (!pid || audioS === null || audioS === undefined || this._unpricedPids.has(pid)) return;
    if (audioS <= this.runawayLimitS(text)) return;
    this._unpricedPids.add(pid);
    log.warning(
      `${modelId}: a line of ${String(text ?? "").length} characters ran on for ${pyRound(audioS, 1)} s — ` +
        `this process's memory no longer sets the model's price (pid ${pid})`,
    );
  }

  // ── the card ─────────────────────────────────────────────────────────────────────────────────────

  /** A discrete graphics card (its own memory) — or unknown, which reads as one. */
  async cardIsItsOwnMemory() {
    const hw = await this.hardware();
    try {
      return hw === null || hardware.memArch(hw) === "discrete";
    } catch {
      return true;
    }
  }

  /** Is an AI model holding the graphics card now? A sleeping one holds nothing; the tiny pinned embedder is not the AI
   *  model. */
  async aiModelOnCard() {
    const hw = await this.hardware();
    let snap;
    try {
      if (hw === null || hardware.memArch(hw) !== "discrete") return false;
      snap = await this._arb().snapshot(hw);
    } catch {
      return false;
    }
    return (snap.reservations || []).some((r) => r.kind === "llm" && !r.asleep && !r.pinned && Math.trunc(r.vram_mb || 0) > 0);
  }

  /** Graphics memory a load of `modelId` could use now: the measured truth and the ledger, whichever says less, plus
   *  what this kind's current model gives back when it is replaced. No margin: it weighs a model measured here (decided
   *  2026-10-16). null = unknown. */
  async freeCardMb(kind, modelId) {
    const hw = await this.hardware();
    try {
      const arb = this._arb();
      const total = hw !== null ? Math.trunc(hardware.budgetTotalMb(hw)) : 0;
      if (total <= 0) return null;
      const committed = Math.max(0, total - (await arb.remainingMb(hw)));
      const used = await this.usedPoolMb();
      let free = total - Math.max(committed, used ?? 0);
      const occ = this._occupantFn(kind);
      if (occ && occ.modelId !== modelId) free += Math.trunc(arb.reservedMb(this.instanceKey(kind, occ.placement)) || 0);
      return free;
    } catch {
      return null;
    }
  }

  /** Graphics memory other programs hold now, MB: the card's measured use beyond everything booked on it (the speech
   *  models and an awake AI model) — the usage the card's admission can't make room in (`admitMemory`'s "foreign").
   *  null = not measured. */
  async otherProgramsCardMb() {
    const hw = await this.hardware();
    try {
      const total = hw !== null ? Math.trunc(hardware.budgetTotalMb(hw)) : 0;
      if (total <= 0) return null;
      const used = await this.usedPoolMb();
      if (used === null) return null;
      const committed = Math.max(0, total - (await this._arb().remainingMb(hw)));
      return Math.max(0, used - committed);
    } catch {
      return null;
    }
  }

  /**
   * Where a load of this model goes now: `{placement: "gpu" | "cpu", reason, unloadAi}` — `reason` a clause the row says
   * after "Runs on the CPU ·", `unloadAi` whether the AI model unloads first. `choice` the user's for this model: "auto"
   * | "gpu" | "cpu". `cardFailed`: this load's try on the graphics card just failed or spilled.
   */
  async placementFor(row, { choice = "auto", cardFailed = false } = {}) {
    const answer = (placement, reason, unloadAi = false) => ({ placement, reason, unloadAi });
    const backend = this.cardBackend();
    if (backend === "cpu") return answer("cpu", "this machine's speech runtime is the CPU build");
    const [x, here] = this.cpuSpeed(row, await this.cpuThreads());
    const speed = x ? `${fmtX(x)} real time ${here ? "here" : "on the reference machine"}` : "";
    if (choice === "gpu") return answer("gpu", "your choice");
    if (choice === "cpu") return answer("cpu", `your choice${speed ? ` — ${speed}` : ""}`);
    if (!(await this.cardIsItsOwnMemory())) {
      // A Mac or integrated graphics: the GPU uses the same memory as the CPU, so running on the CPU would free none of
      // it (audit §5 B9).
      return answer("gpu", "the graphics share this machine's memory, so the CPU would free none of it");
    }
    const prior = this.priceMb(row, backend);
    const hw = await this.hardware();
    const cardMb = hw !== null ? Math.trunc(hardware.budgetTotalMb(hw)) : 0;
    // The speech margin is for a size that is only an estimate; a model measured here is weighed at what it took
    // (decided 2026-10-16 — BreezeTTS 2's measured 7.3 GB fits an 8 GB card's 7.6 GB free, and the margin had sent it to
    // the CPU at 0.2× real time).
    const margin = prior ? 0 : this.cardMarginMb();
    // A card load that failed or spilled — this click's, or one remembered here — and a price measured here that can't
    // fit the card go to the CPU (decided 2026-10-12; until then such a price went to the card and was refused). That
    // the memory counts only for the runtime build running now, until a measured card load, was JustVoice's; kept
    // 2026-10-13 with a "Try the card again" action (the narrowings review, M8). The price says what it took, since that
    // model did load there once (decided 2026-10-13); with no margin since 2026-10-16.
    if (cardFailed || this.failedOnCard(row)) {
      return answer("cpu", `it didn't load on the graphics card — ${speed || "this may be slow on the CPU"}`);
    }
    if (prior && cardMb > 0 && prior > cardMb) {
      return answer("cpu", `it took about ${fmtGb(prior / 1024)} GB on this card before, more than this card has — ${speed || "this may be slow on the CPU"}`);
    }
    // A model not measured here: what it needs — audio.cpp's estimate or its files, whichever is more — decides when it
    // is more than the card has: "too big for this card", and Load runs it on the CPU (decided 2026-10-11, the engine
    // list's answer 4; the files since 2026-10-12; the seven engines described by JustVoice's own files since
    // 2026-10-15, the build's answer 3).
    const need = needOf(row);
    let cardFirst = "";
    // Whether the card is weighed at the model's files (only an estimate past the whole card).
    let atFiles = false;
    const tooBig = Boolean(need) && need.gb * 1024 > cardMb;
    // An estimate that fits the card only without the safety margin says the card-first words too, where the files fit
    // with it — it said nothing (decided 2026-10-16, JustVoice's TASKS "Slice 5's findings: what each one gets" 3).
    // Where it goes is unchanged: its estimate stays the size weighed.
    const tight = Boolean(need) && need.by === "estimate" && need.gb * 1024 + margin > cardMb;
    if (need && !prior && cardMb > 0 && (tooBig || tight)) {
      const card = Math.round(cardMb / 1024);
      const files = filesGbOf(row);
      if (need.by === "estimate" && files !== null && files * 1024 + margin <= cardMb) {
        // Its files fit the card easily, so the estimate alone says too big: try the card first, and it is measured
        // there (decided 2026-10-12 — OmniVoice's 1.3 GB took 1.2 GB of an 8 GB card against audio.cpp's 10 GB, and ran
        // 27× slower on the CPU).
        cardFirst =
          `${this.label} says it needs about ${need.gb} GB, but its files are about ${fmtGb(files)} GB, ` +
          "so it tries the graphics card first; if it doesn't fit, Load runs it on the CPU";
        atFiles = tooBig;
      } else if (tooBig) {
        // The files' size in the words every other size uses (fmtGb: 9.5, 12) — it said 10 beside the row's "needs about
        // 9.5 GB" (JustVoice's TASKS "Slice 5's findings: what each one gets").
        const why =
          need.by === "files"
            ? `its files are about ${fmtGb(need.gb)} GB, more than this card's ${card} GB`
            : `${this.label} says it needs about ${need.gb} GB, more than this card's ${card} GB`;
        // Unlike Auto's other CPU step, this one asks no speed: say it, measured once it has spoken (OmniVoice ran 17×
        // slower than real time there; decided 2026-10-12).
        return answer("cpu", `${why} — ${speed || "this may be slow on the CPU"}`);
      }
    }
    // Auto checks the card's real free memory first (decided 2026-10-15). The size it weighs: what a load measured here;
    // else, for a model audio.cpp describes, what it needs — the size "too big for this card" is judged by — or, when
    // only the estimate is too big, its files, which the card is tried on. A size that fits the card with the safety
    // margin but not beside what other programs hold would be refused there (the card's admission can make room only
    // among what is booked here) or fail — the CPU instead. The other programs' memory (`otherProgramsCardMb`) also
    // counts the app's own unbooked processes — an idle speech runtime, a sleeping AI server, about 0.2 GB: accepted
    // 2026-10-15, as per-process card memory isn't readable on Windows.
    let size = prior || null;
    if (size === null && need && cardMb > 0) size = (atFiles ? filesGbOf(row) : need.gb) * 1024;
    const others = size !== null && size + margin <= cardMb ? await this.otherProgramsCardMb() : null;
    // The same for an estimate that fits the card but not beside other programs, where the files do: the card first, at
    // its files (2026-10-15 — Kitten TTS 2's 7 GB estimate plus the margin is a whole 8 GB card, so any other use sent its
    // 3.1 GB to the CPU, while OmniVoice's 10 GB was tried on the card).
    if (others !== null && !prior && !cardFirst && need?.by === "estimate" && size + margin + others > cardMb) {
      const files = filesGbOf(row);
      if (files !== null && files * 1024 + margin + others <= cardMb) {
        cardFirst =
          `${this.label} says it needs about ${need.gb} GB, but its files are about ${fmtGb(files)} GB, ` +
          "so it tries the graphics card first; if it doesn't fit, Load runs it on the CPU";
        size = files * 1024;
      }
    }
    if (others !== null && size + margin + others > cardMb) {
      return answer("cpu", `other programs are using about ${fmtGb(others / 1024)} GB of the graphics card — ${speed || "this may be slow on the CPU"}`);
    }
    // "Fits" only where it was checked — a size and a reading of the card. A model with no size here (neither measured
    // nor a number audio.cpp gives) or a card that can't be read keeps the card and says so (decided 2026-10-15, the
    // build's answer 3): its first load measures it, and a load that doesn't fit moves to the CPU.
    const unchecked = size === null || (size + margin <= cardMb && others === null);
    const fits = others !== null ? "it fits in the card's free memory" : unchecked ? "memory not measured yet" : "";
    if (!(await this.aiModelOnCard())) return answer("gpu", cardFirst || fits);
    const free = prior ? await this.freeCardMb(row.kind, row.id) : null;
    if (prior && free !== null && prior <= free) return answer("gpu", `it fits beside the AI model (${prior} MB)`);
    if (x !== null && x >= this.cpuMinRealtime()) return answer("cpu", `${speed}, which keeps the graphics card for the AI model`);
    const slow = x ? `only ${speed} on the CPU` : "it has no usable speed on the CPU";
    return answer("gpu", cardFirst || `${slow}, so the AI model makes room`, !prior);
  }

  /** THE ONE-POOL RULING (2026-08-13): on one-pool boxes (integrated/unified) EVERY load books its measured footprint
   *  into the pool ledger; on discrete boxes only a card load holds VRAM (the CPU is free). */
  async booksMemory(device) {
    const hw = await this.hardware();
    if (hw === null) return false;
    try {
      if (hardware.memArch(hw) !== "discrete") return true;
    } catch {
      return false;
    }
    return device !== "cpu";
  }

  /** Auto's third step for a model never measured on the card: unload the AI model before the load, through the
   *  arbiter's `makeRoom` (so the eviction event — and the app's toast — say who made room for whom). Every other kind
   *  booked on the card is protected — it is the AI model that makes room; a busy AI model by the arbiter itself. */
  async unloadAiModel(modelId) {
    const hw = await this.hardware();
    try {
      const total = hw !== null ? Math.trunc(hardware.budgetTotalMb(hw)) : 0;
      if (total <= 0) return;
      const arb = this._arb();
      const reservations = async () => (await arb.snapshot(hw)).reservations || [];
      const llmMb = async () => (await reservations()).filter((r) => r.kind === "llm" && !r.asleep).reduce((s, r) => s + Math.trunc(r.vram_mb || 0), 0);
      const protectedKinds = [...new Set((await reservations()).map((r) => r.kind).filter((k) => k !== "llm"))];
      const beforeLlm = await llmMb();
      const beforeUsed = await this.usedPoolMb();
      await arb.makeRoom(total, { protectedKinds, hardware: hw, reason: `loading ${modelId}` });
      // An unloaded model's memory drains over a second or two. Wait for the card to show it before the load reads the
      // card (audit §5 B2).
      await this.waitForDrain(beforeUsed, beforeLlm - (await llmMb()));
    } catch (e) {
      log.debug(`AI-model unload before ${modelId} unavailable: ${msgOf(e)}`);
    }
  }

  /** Wait (up to 6 s) for the card's reading to drop by most of what an unloaded model held (`freedMb`, from
   *  `beforeUsed`): its memory drains over a second or two, and until then the next placement reads it as other
   *  programs' and a load's measurement counts it (JustVoice's slice 2 acceptance, 2026-10-15: ZipVoice, loaded straight
   *  after an unload, went to the CPU). */
  async waitForDrain(beforeUsed, freedMb) {
    if (beforeUsed === null || beforeUsed === undefined || !(freedMb > 0)) return;
    const deadline = this._now() + 6.0;
    while (this._now() < deadline) {
      const used = await this.usedPoolMb();
      if (used === null || used <= beforeUsed - freedMb * 0.8) break;
      await this._sleep(0.4);
    }
  }

  // ── admission ────────────────────────────────────────────────────────────────────────────────────

  /** The system memory the AI models hold now, MB — what unloading them gives back (the kit's `modelServersRamMb`); 0
   *  when unknown. */
  async aiModelsRamMb() {
    try {
      return Math.trunc((await (await this._llmFn())?.modelServersRamMb()) || 0);
    } catch {
      return 0;
    }
  }

  /**
   * The card's admission for a load whose PRIOR MEASURED footprint is known (a first-ever load skips admission
   * entirely). Prices on MEASURED free memory AND the ledger — the WORSE of the two (2026-08-15); when free is short,
   * `makeRoom`'s target is inflated by the UNLEDGERED usage, so evicting to ledger-room yields real room. Busy kinds are
   * protected inside `makeRoom`; a refusal is HONEST and leaves the world exactly as it was. `creditMb`: what the kind's
   * current model gives back when this load replaces it (audit §13.3, §5 B5). It weighs what the model took here, with no
   * margin — the margin is for estimates (decided 2026-10-16). A model you pinned to the GPU (`pinned`) is never
   * refused: when even the room `makeRoom` can make is short, this returns `{needed, free}` and the load goes on, saying
   * it may spill (decided 2026-10-16, the user's "do 1 and 2"). Otherwise null. `exclude`: the booking key being loaded.
   */
  async admitMemory(row, neededMb, creditMb = 0, { pinned = false, exclude = null } = {}) {
    const needed = Math.trunc(Number(neededMb) || 0);
    if (needed <= 0) return null;
    const arb = this._arb();
    if (!arb) return null; // nothing to admit against
    // Reconcile the AI model's sleepers first (the 2026-08-15 sleeping-child fix): the runner's ledger keeps a booking
    // for a child the router idle-unloaded. Best-effort.
    try {
      await (await this._llmFn())?.reconcileSleeping({ force: true });
    } catch (e) {
      log.debug(`sleeping-set reconcile unavailable at the speech door: ${msgOf(e)}`);
    }
    const hw = await this.hardware();
    const want = Math.max(0, needed - Math.max(0, Math.trunc(Number(creditMb) || 0)));
    const used = await this.usedPoolMb();
    let total = 0;
    if (hw !== null) {
      try {
        total = Math.trunc(hardware.budgetTotalMb(hw));
      } catch {
        total = 0;
      }
    }
    let free;
    let target;
    if (used !== null && total > 0) {
      const committed = Math.max(0, total - (await arb.remainingMb(hw)));
      // The pool is occupied by the WORSE of the two truths (2026-08-15): the measurement can't see a booking whose
      // allocation has not landed; the ledger can't see other programs.
      free = Math.max(0, total - Math.max(used, committed));
      if (want <= free) return null;
      const foreign = Math.max(0, used - committed);
      target = want + foreign;
    } else {
      free = null;
      if (want <= (await arb.remainingMb(hw))) return null;
      target = want;
    }
    if (await arb.makeRoom(target, { exclude, hardware: hw, reason: `loading ${row.id}` })) {
      // Eviction frees device memory ASYNCHRONOUSLY. Wait briefly for the measured number to agree; if it stays short,
      // proceed — the ledger says room.
      if (free !== null) {
        const deadline = this._now() + 4.0;
        while (this._now() < deadline) {
          const u = await this.usedPoolMb();
          const c = Math.max(0, total - (await arb.remainingMb(hw)));
          if (u === null || Math.max(0, total - Math.max(u, c)) >= want) break;
          await this._sleep(0.4);
        }
      }
      return null;
    }
    if (pinned) return { needed: want, free: free ?? (await arb.remainingMb(hw)) };
    const snap = await arb.snapshot(hw);
    const have = free !== null ? `${free} MB free of ${total} MB (measured, minus what is booked)` : `${snap.remaining_mb} MB of ${snap.vram_total_mb} MB unbooked`;
    const resident = snap.reservations.map((r) => `${r.key} (${r.vram_mb} MB${r.asleep ? " · asleep" : ""})`).join(", ") || "nothing";
    const busy = snap.busy_kinds.join(", ") || "none";
    throw new NotEnoughMemoryError(
      `not enough memory to load ${row.id}: it needs ~${needed} MB ` +
        `but only ${have} remain. ` +
        `Resident: ${resident}; busy: ${busy}. ` +
        "Wait for the current work to finish or unload something first.",
      { where: "card", neededMb: needed, freeMb: free },
    );
  }

  /**
   * A load needs room in this machine's memory: refused, before anything moves, when what it takes and the safety margin
   * are more than the memory free now — crediting what the kind's current model gives back when it is replaced. What it
   * takes: on the CPU its files (4(a)), and on either device the memory it took at its last loads here (4(b)), whichever
   * is more (decided 2026-10-12, JustVoice's TASKS "The download test's last findings"). `aiCreditMb`: the AI models'
   * memory, when this load may push them off the card ("The two-day review's fixes"). The AI model is named when it is
   * loaded: it can hold more of this memory than any speech model (17 GB, JustVoice's RESEARCH §10.14).
   */
  async admitSystemMemory(row, device = "cpu", aiCreditMb = 0) {
    const filesMb = (r) => (r?.files ?? []).reduce((n, f) => n + Number(f.bytes || 0), 0) / MIB;
    const takesMb = (r, dev) => ({ files: dev === "cpu" ? filesMb(r) : 0, ram: this.ramPriceMb(r, dev) });
    const own = takesMb(row, device);
    const needMb = Math.max(own.files, own.ram);
    if (!needMb) return;
    const occ = this._occupantFn(row.kind);
    let creditMb = 0;
    if (occ?.row) {
      const back = takesMb(occ.row, occ.device ?? (occ.placement === "cpu" ? "cpu" : ""));
      creditMb = Math.max(back.files, back.ram);
    }
    const margin = this.safetyMarginMb();
    // The words say what is free now, without the credits; a refusal that credited the AI models' memory doesn't name
    // them, since that memory was already counted (the narrowings review, M10).
    const freeNowMb = this._memory.freeMb();
    if (needMb + margin <= freeNowMb + creditMb + aiCreditMb) return;
    let ai = [];
    if (!(aiCreditMb > 0)) {
      try {
        const hw = await this.hardware();
        ai = ((await this._arb().snapshot(hw)).reservations || []).filter((r) => r.kind === "llm" && !r.asleep && !r.pinned);
      } catch {
        ai = [];
      }
    }
    const gb = (mb) => Math.round((mb / 1024) * 10) / 10;
    const where = device === "cpu" ? "the CPU" : "the graphics card";
    const what = own.ram >= own.files ? `it took about ${gb(own.ram)} GB of this machine's memory when it last loaded here` : `its files are about ${gb(own.files)} GB`;
    throw new NotEnoughMemoryError(
      `not enough memory to load ${row.name ?? row.id} on ${where}: ${what} ` +
        `(+${margin} MB safety margin) but only ${gb(freeNowMb)} GB of this machine's ${gb(this._memory.totalMb())} GB is free. ` +
        (ai.length
          ? `The AI model (${ai.map((r) => r.key.replace(/^llm:/, "")).join(", ")}) is loaded and holds memory too — unload it first, or close other programs.`
          : "Close other programs, or pick a smaller model."),
      { where: "system", neededMb: Math.trunc(needMb + margin), freeMb: Math.trunc(freeNowMb) },
    );
  }
}
