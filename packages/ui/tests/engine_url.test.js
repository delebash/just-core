// SPDX-License-Identifier: MIT
// An engine update's rows (engineUrl.js planBinaries): a row the release resolved takes that build's URLs AND their
// checksums (GitHub's digests — the finish list's A12, 2026-10-29); a row only substituted gets no checksum, since the
// old build's would refuse the new file.
import { expect, test } from "vitest";
import { planBinaries } from "../src/common/services/engineUrl.js";

const OLD = "https://github.com/ggml-org/llama.cpp/releases/download/b1/llama-b1-bin-win-cuda-12.4-x64.zip";

test("a resolved row takes the release's URLs and checksums; a substituted one drops its checksums", () => {
  const rows = [
    { platform: "windows", gpu: "cuda12", assetUrl: OLD, runtimeUrl: "", sha256: "old", runtimeSha256: "oldr" },
    { platform: "windows", gpu: "vulkan", assetUrl: OLD.replace("cuda-12.4", "vulkan"), runtimeUrl: "", sha256: "old2", runtimeSha256: null },
  ];
  const plan = { binaries: [{ platform: "windows", gpu: "cuda12", resolved: true, assetUrl: "https://x/new.zip", runtimeUrl: "https://x/rt.zip", sha256: "new", runtimeSha256: "newr" }] };
  const [cuda, vulkan] = planBinaries(rows, plan, "b2");
  expect(cuda).toMatchObject({ assetUrl: "https://x/new.zip", runtimeUrl: "https://x/rt.zip", sha256: "new", runtimeSha256: "newr" });
  expect(vulkan.assetUrl).toContain("b2");
  expect(vulkan).toMatchObject({ sha256: null, runtimeSha256: null });
});
