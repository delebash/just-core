// SPDX-License-Identifier: MIT
// The live memory cells (the one-strip consolidation, 2026-08-15; round E's G10, 2026-10-29), read from
// GET /v1/llm-runner/resident: what the card (or the one memory pool) holds — measured, else the ledger's bookings —,
// what is free, the chat models (LLM), each kit runtime's booking beside them (speech, transcription, images, vision —
// one cell per booking, its placement beside its kind) and the memory other programs hold. The AI page's strip renders
// them (AiModelsArea); an app's Home shows the same cells from here — never a reading of its own (JustVoice's Home kept
// a copy of the strip's, `residentCells`, until round E). Each cell is `{key, label, value, sub?, title?}`.
import { computed, ref } from "vue";
import { useI18n } from "vue-i18n";
import { request } from "../client.js";
import { usePoll } from "../common/composables/usePoll.js";

const RUNTIME_KINDS = new Set(["image", "vision", "tts", "stt"]);

/** The cells of one /resident reading `r`. `llmClaim` (`{text, title}`) is the LLM cell's words while no chat model
 *  is loaded (JustVoice's on-demand claim); `t` and `n` the app's i18n. */
export function memoryCells(r, { t, n, llmClaim = null }) {
  if (!r?.vramTotalMb) return []; // no detectable GPU memory → no memory cells
  const gb1 = (mb) => n(mb / 1024, { minimumFractionDigits: 1, maximumFractionDigits: 1 });
  // GB past a gigabyte, MB below it — a "0.3 GB" cell reads as a rounding error
  const mem1 = (mb) => (mb >= 1024 ? `${gb1(mb)} GB` : `${n(Math.round(mb))} MB`);
  const unified = !!r.memArch && r.memArch !== "discrete";
  const total = gb1(r.vramTotalMb);
  const cells = [];
  // MEASURED first (2026-08-14): `committedMb` is only what the AI runner BOOKED, not what the card holds; an
  // unmeasurable box (usedMb null) shows the ledger, labelled "reserved"
  if (r.usedMb == null) {
    cells.push({ key: "used", label: t(unified ? "kit.aiArea.mem.memoryReserved" : "kit.aiArea.mem.vramReserved"), value: t("kit.aiArea.mem.ofTotal", { gb: gb1(r.committedMb || 0), total }), title: t("kit.aiArea.mem.reservedTitle") });
    cells.push({ key: "free", label: t("kit.aiArea.mem.free"), value: t("kit.aiArea.mem.gb", { gb: gb1(r.remainingMb || 0) }) });
  } else {
    cells.push({ key: "used", label: t(unified ? "kit.aiArea.mem.memoryUsed" : "kit.aiArea.mem.vramUsed"), value: t("kit.aiArea.mem.ofTotal", { gb: gb1(r.usedMb), total }), title: t("kit.aiArea.mem.usedTitle") });
    cells.push({ key: "free", label: t("kit.aiArea.mem.free"), value: t("kit.aiArea.mem.gb", { gb: gb1(Math.max(0, r.vramTotalMb - r.usedMb)) }) });
  }
  // The LLM cell: the loaded chat models and the runner's booked take — summed from the per-model reservations, NOT
  // committedMb (the ledger is shared with the runtimes' bookings, which have their own cells). A SLEEPING model is in
  // the router's list but holds no memory (2026-08-15): only awake takes are summed.
  const models = (r.models || []).filter((m) => m.status === "loaded" || m.status === "sleeping");
  if (models.length) {
    const awake = models.filter((m) => m.status !== "sleeping");
    const take = awake.reduce((sum, m) => sum + (m.vramMb || 0), 0);
    cells.push({
      key: "llm",
      label: t("kit.aiArea.mem.llm"),
      value: take ? t("kit.aiArea.mem.gb", { gb: gb1(take) }) : awake.length ? t("kit.aiArea.mem.loaded") : t("kit.aiArea.mem.asleep"),
      sub: models.map((m) => m.id).join(" · "),
      title: awake.length ? t("kit.aiArea.mem.llmTitle") : t("kit.aiArea.mem.asleepTitle"),
    });
  } else if (llmClaim?.text) {
    cells.push({ key: "llm", label: t("kit.aiArea.mem.llm"), value: llmClaim.text, title: llmClaim.title || "" });
  } else {
    cells.push({ key: "llm", label: t("kit.aiArea.mem.llm"), value: "—" });
  }
  // Each kit runtime's booking beside the chat models (round E, G10): its kind's word, and where it runs when it says
  // — measured here plain, the model's stated need with "~" (the catalog chip's mark for an estimate)
  for (const b of r.runtimeBookings || []) {
    const kind = RUNTIME_KINDS.has(b.kind) ? t(`kit.aiTabs.kinds.${b.kind}`) : b.runtime || b.kind || "";
    const where = b.placement === "gpu" || b.placement === "cpu" ? t(`kit.runtimes.placement.${b.placement}`) : "";
    const measured = b.source === "measured";
    cells.push({
      key: `runtime:${b.key}`,
      label: where ? t("kit.aiArea.mem.kindWhere", { kind, where }) : kind,
      value: measured ? mem1(b.mb || 0) : t("kit.aiArea.mem.about", { size: mem1(b.mb || 0) }),
      // the model holding it, as the chat cell names its models (JustVoice's TTS · STT cells did)
      ...(b.modelId ? { sub: b.modelId } : {}),
      title: t(measured ? "kit.aiArea.mem.bookingMeasured" : "kit.aiArea.mem.bookingEstimated"),
    });
  }
  // "Other apps" — measured occupancy minus what the arbiter booked: the slice of the card the ledger can't account
  // for. 256 MB floor: below that it is driver/desktop noise, and a cell that flickers at 30 MB is worse than none.
  const otherMb = r.usedMb == null ? 0 : Math.max(0, r.usedMb - (r.committedMb || 0));
  if (otherMb > 256) cells.push({ key: "other", label: t("kit.aiArea.mem.otherApps"), value: mem1(otherMb), title: t("kit.aiArea.mem.otherAppsTitle") });
  return cells;
}

/**
 * The memory cells, live: `start()` reads /resident at once and then every `every` ms (`stop()`, or the component's
 * unmount, ends it). `llmClaim` a function giving the LLM cell's idle words (`{text, title}`, or null); `onRead(r)` hears
 * each reading (the AI page refreshes its catalog rows when the loaded set changes). → `{resident, cells, start, stop}`.
 * Call it in a component's setup.
 */
export function useMemoryCells({ llmClaim = () => null, onRead = null, every = 2500 } = {}) {
  const { t, n } = useI18n();
  const resident = ref(null);
  async function read() {
    try {
      resident.value = await request("/v1/llm-runner/resident");
      onRead?.(resident.value);
    } catch {
      /* keep the last reading */
    }
  }
  const poll = usePoll(read, every);
  const cells = computed(() => memoryCells(resident.value, { t, n, llmClaim: llmClaim() }));
  return {
    resident,
    cells,
    start: () => {
      read();
      poll.start();
    },
    stop: poll.stop,
  };
}
