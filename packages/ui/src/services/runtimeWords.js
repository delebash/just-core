// SPDX-License-Identifier: MIT
// What a kit runtime's engine needs from this computer, in the app's words — the server's `need` (runner/
// runtime_service.js unmetNeed: { reason, missing?, url?, need?, have? }) as a key and its values. Shared by the AI
// page's runtime tab and the "this feature needs its engine" banner (the engines plan, K10; the words were
// just-house-paint's EngineInstallCard's).

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
    default:
      return { key: "kit.runtimes.needs.noBuild", values: {}, link: null };
  }
}
