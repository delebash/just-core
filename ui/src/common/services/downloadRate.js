// SPDX-License-Identifier: MIT
// Download speed + ETA for the progress bars (queue doc §8 DL-1, user-decided):
// PURE client-side math over the byte counts the status polls already deliver —
// no server change. ONE tracker shared by the engine-install bar (useEngine, ~0.8 s
// poll) and the model-download bar (useRunnerModels, ~1.5 s poll); speed is the
// byte delta across a sliding sample window (smoothing), ETA = remaining ÷ speed.
// A byte REGRESSION (a new file/phase started — engine installs download several
// files back to back) resets the window instead of producing a negative rate.
// PURE logic, no Vue components (the modelPick.js precedent), so vitest covers it; the ETA
// words come from the kit catalog (kit.eta.*).
import { kitN, kitT } from "./kitI18n.js";

// a size or speed's number in the app's language — one decimal, or a whole one; no thousands
// separator ("1023 MB", as these always read)
const size = (v, digits) => kitN(v, { minimumFractionDigits: digits, maximumFractionDigits: digits, useGrouping: false });

export function createRateTracker({ windowMs = 6000, now = () => Date.now() } = {}) {
  let samples = []; // [{t, bytes}] within the window, oldest first

  function speed() {
    if (samples.length < 2) return 0;
    const first = samples[0];
    const last = samples[samples.length - 1];
    const dtSec = (last.t - first.t) / 1000;
    if (dtSec <= 0) return 0;
    return Math.max(0, (last.bytes - first.bytes) / dtSec);
  }

  return {
    /** Feed the latest byte count; returns the smoothed bytes/sec (0 = unknown yet). */
    update(bytes) {
      const t = now();
      const b = Number(bytes) || 0;
      if (samples.length && b < samples[samples.length - 1].bytes) samples = [];
      samples.push({ t, bytes: b });
      const cutoff = t - windowMs;
      while (samples.length > 2 && samples[0].t < cutoff) samples.shift();
      return speed();
    },
    speed,
    reset() {
      samples = [];
    },
  };
}

// The ONE byte formatter (moved here from useEngine/useRunnerModels, which carried
// two identical copies — same thresholds, same output).
export function fmtBytes(n) {
  if (!n) return "";
  const mb = n / (1024 * 1024);
  if (mb >= 1024) return `${size(mb / 1024, 1)} GB`;
  if (mb >= 1) return `${size(Math.round(mb), 0)} MB`;
  // Sub-MB never rounds to a lying "0 MB" (a 490 KB database is not
  // nothing — JV's Disk-usage panel showed all-zero rows over real bytes).
  return `${size(Math.max(1, Math.round(n / 1024)), 0)} KB`;
}

export function fmtSpeed(bytesPerSec) {
  if (!bytesPerSec || bytesPerSec <= 0) return "";
  const mbps = bytesPerSec / (1024 * 1024);
  if (mbps >= 1024) return `${size(mbps / 1024, 1)} GB/s`;
  if (mbps >= 10) return `${size(Math.round(mbps), 0)} MB/s`;
  if (mbps >= 1) return `${size(mbps, 1)} MB/s`;
  return `${size(Math.max(1, Math.round(bytesPerSec / 1024)), 0)} KB/s`;
}

export function fmtEta(seconds) {
  if (!Number.isFinite(seconds) || seconds <= 0) return "";
  if (seconds < 5) return kitT("kit.eta.fewSeconds");
  if (seconds < 90) return kitT("kit.eta.seconds", { n: Math.max(5, Math.round(seconds / 5) * 5) });
  const minutes = Math.round(seconds / 60);
  if (minutes < 90) return kitT("kit.eta.minutes", { n: minutes });
  return kitT("kit.eta.hours", { n: kitN(minutes / 60, { minimumFractionDigits: 1, maximumFractionDigits: 1 }) });
}

/** The suffix both progress labels append: " · 38 MB/s · ~2m left".
 *  Empty while speed is unknown; ETA omitted when the total is unknown. */
export function rateSuffix(bytesPerSec, downloaded, total) {
  const speedText = fmtSpeed(bytesPerSec);
  if (!speedText) return "";
  let out = ` · ${speedText}`;
  if (total > downloaded) {
    const eta = fmtEta((total - downloaded) / bytesPerSec);
    if (eta) out += ` · ${eta}`;
  }
  return out;
}

/** The caption BOTH download progress bars render: "<phase> · <done> / <total><rateText>".
 *  ONE formatter (T3) — the caller resolves `phase` (its own fallback words) and passes the
 *  byte counts + the rateSuffix; the three-branch shape lives here so the model-download bar
 *  (useRunnerModels.progressLabel) and Quick Setup's parallel bars can never drift. */
export function progressCaption(phase, done, total, rateText = "") {
  const cur = fmtBytes(done);
  const tot = fmtBytes(total);
  if (cur && tot) return `${phase} · ${cur} / ${tot}${rateText}`;
  if (cur) return `${phase} · ${cur}${rateText}`;
  return phase;
}
