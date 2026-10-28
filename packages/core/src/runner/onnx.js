// SPDX-License-Identifier: MIT
// ONNX Runtime in-process — the generic pieces every app's model on it shares (the engines plan's K6, round C;
// moved from just-house-paint's segment/segmenter.js and finder.js, where SAM 3 grew them): which execution provider
// a session asks for, DirectML's session options and its adapter, a session that falls back to the CPU when its
// provider can't create it or later fails a run, one call at a time, and whether ONNX Runtime loads on this computer
// at all (the Visual C++ runtime, the load, which DLL the loader took). onnxruntime-node is the APP's package (the
// plan's D2): its module is handed in (`ortApi`, `load`), never imported here. Docs:
// onnxruntime.ai/docs/get-started/with-javascript/node.html · onnxruntime.ai/docs/execution-providers/DirectML-ExecutionProvider.html
import { existsSync } from "node:fs";
import path from "node:path";
import * as hardware from "./hardware.js";

/** The execution providers a session may ask for (onnxruntime-node's names). */
export const PROVIDERS = Object.freeze(["cpu", "dml", "webgpu"]);

/** The provider "auto" means here: DirectML on Windows, else the CPU; any other name as given (checked). */
export function resolveProvider(ep = "auto", platform = process.platform) {
  const v = ep ?? "auto";
  if (v === "auto") return platform === "win32" ? "dml" : "cpu";
  if (!PROVIDERS.includes(v)) throw new RangeError(`executionProvider must be "auto", ${PROVIDERS.map((p) => `"${p}"`).join(", ")}, not ${JSON.stringify(v)}`);
  return v;
}

/** Session options per provider. DirectML wants memory patterns off and sequential execution
 * (onnxruntime.ai/docs/execution-providers/DirectML-ExecutionProvider.html#configuration-options);
 * `dmlDeviceId` picks its adapter — onnxruntime-node's `{ name: "dml", deviceId }`, DirectX's adapter
 * index (DirectML's default is adapter 0, the one driving the main display). CPU sessions run with the memory
 * arena off by default (house-paint's probe: peak RSS 10.8 GiB with it, 6.7 GiB without). */
export function sessionOptions(ep, { threads = 0, cpuMemArena = false, dmlDeviceId = null } = {}) {
  const base = { graphOptimizationLevel: "all", enableCpuMemArena: cpuMemArena, logSeverityLevel: 3 };
  if (threads > 0) base.intraOpNumThreads = threads;
  if (ep === "dml") {
    const dml = Number.isInteger(dmlDeviceId) ? { name: "dml", deviceId: dmlDeviceId } : "dml";
    return { ...base, executionProviders: [dml], enableMemPattern: false, executionMode: "sequential" };
  }
  if (ep === "webgpu") return { ...base, executionProviders: ["webgpu"] };
  return { ...base, executionProviders: ["cpu"] };
}

/** A logger from whatever the caller passed: an object with info/warn (or the kit's `warning`), a
 * function `(level, message)`, or nothing (silent). */
export function normalizeLog(log) {
  if (typeof log === "function") return { info: (m) => log("info", m), warn: (m) => log("warn", m) };
  const pick = (...names) => {
    for (const n of names) if (typeof log?.[n] === "function") return (m) => log[n](m);
    return () => {};
  };
  return { info: pick("info"), warn: pick("warn", "warning") };
}

const errText = (err) => String(err?.message ?? err).trim();

/** One model's session: `ep` first, the CPU when that fails. Returns the slot `{ key, file, ep,
 * wanted, session, loadMs, fallback }` (fallback: why the wanted provider was dropped, or null). */
export async function openSlot(ortApi, key, file, wanted, opts, log) {
  const t0 = performance.now();
  try {
    const session = await ortApi.InferenceSession.create(file, sessionOptions(wanted, opts));
    return { key, file, ep: wanted, wanted, session, loadMs: performance.now() - t0, fallback: null };
  } catch (err) {
    if (wanted === "cpu") throw err;
    const why = `could not create the ${key} session on ${wanted}: ${errText(err)}`;
    log.warn(`${why} — using the CPU`);
    const session = await ortApi.InferenceSession.create(file, sessionOptions("cpu", opts));
    return { key, file, ep: "cpu", wanted, session, loadMs: performance.now() - t0, fallback: why };
  }
}

/** Run a slot; when a non-CPU provider throws, swap the slot to a CPU session and run again. */
export async function runSlot(ortApi, slot, feeds, opts, log) {
  try {
    return await slot.session.run(feeds);
  } catch (err) {
    if (slot.ep === "cpu") throw err;
    const why = `the ${slot.key} model failed to run on ${slot.ep}: ${errText(err)}`;
    log.warn(`${why} — switching it to the CPU`);
    try {
      await slot.session.release();
    } catch {
      /* the failed session may already be unusable */
    }
    slot.session = await ortApi.InferenceSession.create(slot.file, sessionOptions("cpu", opts));
    slot.ep = "cpu";
    slot.fallback = why;
    return slot.session.run(feeds);
  }
}

/** A promise chain: one model call at a time (DirectML can't run one session from two threads, and
 * one at a time keeps peak memory to a single run). */
export function serial() {
  let tail = Promise.resolve();
  return (fn) => {
    const next = tail.then(fn, fn);
    tail = next.catch(() => {});
    return next;
  };
}

/**
 * The DirectML device a session takes: the adapter with the most memory of its own (the kit's dxgiAdapters, DirectX's
 * order — ONNX Runtime's DirectML `deviceId` is that index). Adapter 0 drives the main display — on a laptop often
 * the integrated GPU, beside an NVIDIA card it never used (just-house-paint, 2026-10-20). The software adapter never;
 * a tie keeps the earlier; undefined when none (DirectML's own default, adapter 0).
 */
export function bestDmlAdapter(adapters) {
  let best;
  for (const a of adapters || []) if (!a.software && (best === undefined || a.dedicatedMb > best.dedicatedMb)) best = a;
  return best?.index;
}

/** The Visual C++ runtime's DLLs onnxruntime.dll and its Node binding import (their import tables, onnxruntime-node
 *  1.30, read 2026-10-20) — MSVCP140_1 and MSVCP140_ATOMIC_WAIT come only with a 2019-or-later runtime, so an older
 *  one installed is found missing too. */
export const ORT_VC_DLLS = Object.freeze(["MSVCP140.dll", "MSVCP140_1.dll", "MSVCP140_ATOMIC_WAIT.dll", "VCRUNTIME140.dll", "VCRUNTIME140_1.dll"]);

/**
 * Whether ONNX Runtime loads here — and is the APP's: with the app's onnxruntime.dll quarantined, Windows 11 loaded
 * its own System32 copy (1.17) instead, and the server died mid-run (just-house-paint, 2026-10-20). → `{ok: true}`, or
 * `{ok: false, reason?, missing?, files?, url?, detail}` — `reason` a slug the screens word ("vc-runtime",
 * "files-missing", "dll-too-old"), `detail` the server's English. `load()` imports the app's onnxruntime-node;
 * `binDir` where its native files are (its binding loads them from there); the rest are seams.
 */
export async function ortRuntimeCheck({ load, binDir = null, missingDlls = hardware.missingDlls, modulePath = hardware.loadedModulePath, log = null } = {}) {
  const logger = normalizeLog(log);
  const missing = missingDlls(ORT_VC_DLLS, { appDir: binDir });
  if (missing.length) {
    return {
      ok: false,
      reason: "vc-runtime",
      missing,
      url: hardware.VC_REDIST_URL,
      detail: `Microsoft's Visual C++ runtime (2015–2022) isn't on this computer (${missing.join(", ")} missing) — install it from ${hardware.VC_REDIST_URL}, then try again`,
    };
  }
  const filesMissing = (files, why) => ({
    ok: false,
    reason: "files-missing",
    files,
    detail: `${why} — an antivirus may have quarantined it: restore it from the antivirus's quarantine, or install the app again`,
  });
  try {
    await load();
  } catch (e) {
    const error = String(e?.message || e).split("\n")[0];
    logger.warn(`ONNX Runtime didn't load: ${error}`);
    // Windows' loader words: a file not found (the app's own DLL, once the runtime's are here), an entry point not
    // found (a DLL older than the engine needs)
    if (/specified module could not be found/i.test(error) && binDir && !existsSync(path.join(binDir, "onnxruntime.dll"))) {
      return filesMissing(["onnxruntime.dll"], "ONNX Runtime's file onnxruntime.dll is missing from the app");
    }
    if (/specified procedure could not be found/i.test(error)) {
      return {
        ok: false,
        reason: "dll-too-old",
        url: hardware.VC_REDIST_URL,
        detail: `a DLL on this computer is older than ONNX Runtime needs (${error}) — install the latest Microsoft Visual C++ runtime from ${hardware.VC_REDIST_URL}, then restart the app`,
      };
    }
    return { ok: false, detail: error };
  }
  // the copy the loader took: beside the app's binding, or one of the same name elsewhere (only Windows answers)
  const ort = modulePath("onnxruntime.dll");
  const binding = modulePath("onnxruntime_binding.node");
  if (ort && binding && path.win32.dirname(ort).toLowerCase() !== path.win32.dirname(binding).toLowerCase()) {
    logger.warn(`ONNX Runtime loaded ${ort}, not the app's own beside ${binding}`);
    return filesMissing(["onnxruntime.dll"], `the app's own onnxruntime.dll is missing, and another copy (${ort}) loaded in its place, which can't run here`);
  }
  return { ok: true };
}
