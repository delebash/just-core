// SPDX-License-Identifier: MIT
// What a kit runtime's engine needs from this computer, as the screens word it (src/services/runtimeWords.js) — the
// server runtimes' needs (sd.cpp: the Visual C++ runtime, macOS, glibc, no build) and the in-process ONNX Runtime's
// (a file an antivirus took, a DLL too old, it didn't load) — each a key both catalogs have.
import { readFileSync } from "node:fs";
import { expect, test } from "vitest";
import { engineNeedWords } from "../src/services/runtimeWords.js";

const catalog = (lang) => JSON.parse(readFileSync(new URL(`../src/i18n/locales/${lang}.json`, import.meta.url), "utf8"));
const has = (j, key) => key.split(".").reduce((o, k) => o?.[k], j) != null;

test("each need is its own words, with its facts and Microsoft's download where it helps", () => {
  const url = "https://aka.ms/vs/17/release/vc_redist.x64.exe";
  expect(engineNeedWords(null)).toBeNull();
  expect(engineNeedWords({ reason: "vc-runtime", missing: ["MSVCP140.dll", "VCRUNTIME140.dll"], url })).toEqual({ key: "kit.runtimes.needs.vcRuntime", values: { files: "MSVCP140.dll, VCRUNTIME140.dll" }, link: url });
  expect(engineNeedWords({ reason: "files-missing", files: ["onnxruntime.dll"] })).toEqual({ key: "kit.runtimes.needs.filesMissing", values: { files: "onnxruntime.dll" }, link: null });
  expect(engineNeedWords({ reason: "dll-too-old", url })).toEqual({ key: "kit.runtimes.needs.dllTooOld", values: {}, link: url });
  expect(engineNeedWords({ reason: "cant-load", detail: "libonnxruntime.so.1: cannot open shared object file" })).toEqual({
    key: "kit.runtimes.needs.cantLoad",
    values: { error: "libonnxruntime.so.1: cannot open shared object file" },
    link: null,
  });
  expect(engineNeedWords({ reason: "glibc", need: "2.35" }).key).toBe("kit.runtimes.needs.glibcNone");
  expect(engineNeedWords({ reason: "something-new" }).key).toBe("kit.runtimes.needs.noBuild");
});

test("every key the needs are worded with is in both catalogs", () => {
  const reasons = [{ reason: "vc-runtime" }, { reason: "macos", have: "13" }, { reason: "macos" }, { reason: "glibc", have: "2.31" }, { reason: "glibc" }, { reason: "files-missing" }, { reason: "dll-too-old" }, { reason: "cant-load" }, { reason: "" }];
  for (const lang of ["en", "es"]) {
    const j = catalog(lang);
    for (const n of reasons) expect(has(j, engineNeedWords(n).key), `${lang}: ${engineNeedWords(n).key}`).toBe(true);
  }
});

// JustDirect's generation kinds (2026-11-06): music, sound effects and lip-sync are worded wherever a kind is — the AI
// page's tab and memory cell, the runtime tab's kind picker, an eviction's toast — in both catalogs.
test("every audio.cpp kind has its words in both catalogs", () => {
  for (const lang of ["en", "es"]) {
    const j = catalog(lang);
    for (const kind of ["tts", "stt", "music", "sfx", "lipsync"]) {
      for (const key of [`kit.aiTabs.kinds.${kind}`, `kit.runtimes.kinds.${kind}`, `kit.aiArea.evicted.model.${kind}`, `kit.aiArea.evicted.incoming.${kind}`]) {
        expect(has(j, key), `${lang}: ${key}`).toBe(true);
      }
    }
  }
});

// sd.cpp's two kinds (its video kind — JustDirect, 2026-11-06) the same, and every runtime feature's routing pane (the
// preset picker's empty line, label and placeholder) in its own kind's words, never the image's
test("sd.cpp's image and video kinds, and every runtime feature's routing pane, have their words in both catalogs", () => {
  for (const lang of ["en", "es"]) {
    const j = catalog(lang);
    for (const kind of ["image", "video"]) {
      for (const key of [`kit.aiTabs.kinds.${kind}`, `kit.runtimes.kinds.${kind}`, `kit.aiArea.evicted.model.${kind}`, `kit.aiArea.evicted.incoming.${kind}`]) {
        expect(has(j, key), `${lang}: ${key}`).toBe(true);
      }
    }
    for (const kind of ["image", "video", "vision", "stt", "music", "sfx", "lipsync"]) {
      for (const key of [`kit.runtimes.preset.none.${kind}`, `kit.runtimes.preset.model.${kind}`, `kit.runtimes.preset.choose.${kind}`]) {
        expect(has(j, key), `${lang}: ${key}`).toBe(true);
      }
    }
    expect(has(j, "kit.runtimes.preset.seedHintVideo"), `${lang}: seedHintVideo`).toBe(true);
  }
});
