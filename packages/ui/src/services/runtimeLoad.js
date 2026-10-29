// SPDX-License-Identifier: MIT
// A kit runtime model's Load (round E, 2026-10-29) — the one way, the AI page's runtime tab's (LuRuntimeTab) and an
// app's own screen's (JustVoice's voice picker): POST /v1/ai/runtimes/:id/models/:modelId/load as one task on the AI
// tasks strip (withAiTask — app-structure §8, the AI-call convention). A model on this computer loads in the request
// (200). One that isn't downloads first (202 `{status: "downloading"}`, G4): the model's row (GET …/models) is followed
// — its download on a bar (createDownloadTask's) and on the task's count, then its `loading` until it clears and the
// model runs, or its `loadError` says why. The app's licence gate (403 terms-required, G5) goes to
// `onTermsRequired({model, retry})` and nothing else shows; a load an Unload ended (409 load-cancelled, G12) is what was
// asked and says nothing; any other refusal is said in the kit's words (refusalProblem) through reportError. Cancel —
// the task's, or the download bar's — is an Unload: it stops the load, its download included (G12).
import { request } from "../client.js";
import { kitT } from "../common/services/kitI18n.js";
import { reportError } from "../common/services/reportError.js";
import { createDownloadTask, readRuntimeModelStatus, runtimeModelChannel } from "../composables/useDownloadTask.js";
import { withAiTask } from "./appTask.js";
import { refusalProblem } from "./runtimeWords.js";
import { wait } from "./serverJob.js";

export const LOAD_POLL_MS = 1200;
// readings of the model list that may fail in a row (a busy server, Wi-Fi coming back) before the load is given up
const READ_TRIES = 10;

const problemCode = (e) => /([^/]+)$/.exec(e?.problem?.type || "")?.[1] || "";
const aborted = () => Object.assign(new Error("cancelled"), { name: "AbortError" });

/**
 * Load `modelId` of runtime `runtimeId`. `placement` ("auto" · "gpu" · "cpu") where; none: the model's saved choice (the
 * server reads it). `label` the model's name in the task's words (its id when none). `onTermsRequired({model, retry})`
 * when the app's licence gate refuses it — `model` its row (`{id}` when it can't be read), `retry()` the same load
 * again; without it the refusal is said as any other. `download` a createDownloadTask the caller shows the download on
 * (the tab's row bar; its cancel must Unload while the load runs) — none: the service's own, seen on the task only.
 * `onRow(row)` hears each reading of the model's row while a download-first load is followed (after the bar took it) —
 * a screen that lists the row keeps it fresh without a poll of its own.
 *
 * Resolves, never rejects, with what happened — it has been said already: `{status: "loaded", held, started}` (`held`
 * the 200's `{modelId, placement, kind, reason}`, null after a download), `{status: "cancelled", started}`, `{status:
 * "terms-required", started: false}` or `{status: "failed", error, started}`. `started`: the server took the load (a
 * 200, or the 202 that began its download) — the model's state changed whatever the end.
 */
export async function loadRuntimeModel(runtimeId, modelId, opts = {}) {
  const { placement, onTermsRequired, label, download, onRow, pollMs = LOAD_POLL_MS } = opts;
  const name = label || modelId;
  const models = `/v1/ai/runtimes/${encodeURIComponent(runtimeId)}/models`;
  const one = `${models}/${encodeURIComponent(modelId)}`;
  const unload = () => request(`${one}/unload`, { method: "POST", body: {} });
  let started = false;
  let termsRefusal = null;
  try {
    const held = await withAiTask({ feature: "runtime.load", label: kitT("kit.runtimes.loadTask", { name }), meta: { runtimeId, modelId } }, async (task) => {
      const bar = download ?? createDownloadTask({ ...runtimeModelChannel(runtimeId, () => modelId), cancel: unload });
      // the task's Cancel is an Unload — once: a load that ended here (cancelled elsewhere, refused) has none to stop
      let settled = false;
      const end = () => {
        settled = true;
        task.cancel();
      };
      task.signal.addEventListener(
        "abort",
        () => {
          if (settled) return;
          if (bar.state === "running") bar.cancel(); // the bar's own cancel, so it reads cancelled too
          else unload().catch(() => {});
        },
        { once: true },
      );
      let answer;
      try {
        answer = await request(`${one}/load`, { method: "POST", body: placement ? { placement } : {}, signal: task.signal });
      } catch (e) {
        if (task.signal.aborted) throw aborted();
        const code = problemCode(e);
        if (code === "terms-required" && onTermsRequired) {
          // the app's to ask: off the strip at once — the terms dialog is what shows (its history keeps it, cancelled)
          termsRefusal = e;
          task.update({ lingerMs: {} });
          end();
          throw aborted();
        }
        if (code === "load-cancelled") {
          end(); // an Unload ended it: what was asked
          throw aborted();
        }
        throw refusalProblem(e, name, kitT) || e;
      }
      started = true;
      if (answer?.status !== "downloading") return answer ?? null;

      // 202: it downloads first, then loads in the background — followed from the model list, read at once (the row
      // shows "downloading, then loading" now, not a poll later), then every `pollMs`
      bar.arm(kitT("kit.phase.downloading"));
      const tip = kitT("kit.runtimes.loadTip");
      for (let failed = 0; ; await wait(pollMs, task.signal)) {
        let m;
        try {
          m = ((await request(models)).models || []).find((x) => x.id === modelId);
          failed = 0;
        } catch (e) {
          if (task.signal.aborted) throw aborted();
          if ((e?.status >= 400 && e.status < 500) || ++failed >= READ_TRIES) throw e;
          continue;
        }
        if (!m) throw new Error(kitT("kit.runtimes.modelGone"));
        bar.apply(readRuntimeModelStatus(m));
        onRow?.(m);
        if (!m.loading) {
          if (m.running) return null;
          if (m.loadError) {
            // the load that ran on its own failed: the runtime's words, under the kit's title
            throw Object.assign(new Error(m.loadError), { status: 500, problem: { title: kitT("kit.runtimes.model.didntLoad", { name }), detail: m.loadError }, errors: [], requestId: null });
          }
          end(); // it stopped with no reason: an Unload ended it (the bar's Cancel, the row's, another window's)
          throw aborted();
        }
        // the task's count: the download's bytes, then the load
        const downloading = bar.state === "running";
        task.setProgress(downloading ? bar.done : 0, downloading ? bar.total : 0, downloading ? bar.label : kitT("kit.runtimes.model.loading"), tip);
      }
    });
    return { status: "loaded", held, started };
  } catch (e) {
    if (termsRefusal) {
      let model = null;
      try {
        model = ((await request(models)).models || []).find((x) => x.id === modelId) ?? null;
      } catch {
        /* its id is enough to ask */
      }
      onTermsRequired({ model: model ?? { id: modelId, name }, retry: () => loadRuntimeModel(runtimeId, modelId, opts) });
      return { status: "terms-required", started: false };
    }
    if (e?.name === "AbortError") return { status: "cancelled", started };
    reportError(e);
    return { status: "failed", error: e, started };
  }
}
