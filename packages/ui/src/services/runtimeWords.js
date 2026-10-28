// SPDX-License-Identifier: MIT
// What a kit runtime's engine needs from this computer, in the app's words — the server's `need` (runner/
// runtime_service.js unmetNeed: { reason, missing?, url?, need?, have? }; an in-process runtime's, runner/onnx.js
// ortRuntimeCheck: { reason?, missing?, files?, url?, detail }) as a key and its values. Shared by the AI
// page's runtime tab and the "this feature needs its engine" banner (the engines plan, K10; the words were
// just-house-paint's EngineInstallCard's). K10b: the routes' refusals (no room on the drive, busy) in the app's words.
// How fast a model runs here and whether it fits is the catalog's chip (common/services/modelPick.js) — one way.
import { fmtBytes } from "../common/services/downloadRate.js";

/** `need` → `{ key, values, link }` (`link`: Microsoft's download, for the Visual C++ runtime), or null. */
export function engineNeedWords(need) {
  if (!need) return null;
  switch (need.reason) {
    case "vc-runtime":
      return { key: "kit.runtimes.needs.vcRuntime", values: { files: (need.missing || []).join(", ") }, link: need.url || null };
    case "macos":
      return need.have ? { key: "kit.runtimes.needs.macos", values: { need: need.need, have: need.have }, link: null } : { key: "kit.runtimes.needs.macosUnknown", values: { need: need.need }, link: null };
    case "glibc":
      return need.have ? { key: "kit.runtimes.needs.glibc", values: { need: need.need, have: need.have }, link: null } : { key: "kit.runtimes.needs.glibcNone", values: { need: need.need }, link: null };
    case "files-missing":
      return { key: "kit.runtimes.needs.filesMissing", values: { files: (need.files || []).join(", ") }, link: null };
    case "dll-too-old":
      return { key: "kit.runtimes.needs.dllTooOld", values: {}, link: need.url || null };
    case "cant-load":
      return { key: "kit.runtimes.needs.cantLoad", values: { error: need.detail || "" }, link: null };
    default:
      return { key: "kit.runtimes.needs.noBuild", values: {}, link: null };
  }
}

/**
 * A refusal of the runtime routes in the app's words, as reportError takes it — the server's problem with its title and
 * detail said here, the sizes in the kit's one byte formatter (the Install button's: the server's decimal GB beside it
 * read as two units — house-paint's finding): no room on the drive (507 "disk-full", `needBytes`/`freeBytes`), busy
 * (409 "engine-busy" · "model-busy"). Null for any other failure. `name` the engine's or the model's; `t` the app's i18n.
 */
export function refusalProblem(e, name, t) {
  const p = e?.problem;
  const code = /([^/]+)$/.exec(p?.type || "")?.[1];
  let words = null;
  if (code === "disk-full" && Number.isFinite(p.needBytes)) {
    const free = p.freeBytes > 0 ? fmtBytes(p.freeBytes) : t("kit.runtimes.noRoom.nothing");
    words = { title: t("kit.runtimes.noRoom.title"), detail: t("kit.runtimes.noRoom.detail", { need: fmtBytes(p.needBytes), free }) };
  } else if (code === "engine-busy" || code === "model-busy") {
    words = { title: t("kit.runtimes.busy.title", { name }), detail: t(code === "engine-busy" ? "kit.runtimes.busy.engine" : "kit.runtimes.busy.model") };
  }
  return words && { status: e.status, requestId: e.requestId, problem: { ...p, ...words } };
}
