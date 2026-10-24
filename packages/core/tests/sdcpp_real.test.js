// SPDX-License-Identifier: MIT
// The kit's sd.cpp runtime for real (KIT_REAL_SD=1): an installed sd-server build (KIT_SD_ENGINE — the folder holding
// sd-server) and FLUX.2 klein's three files (KIT_SD_MODELS) — the kit starts the server the one way, books the card
// with the real arbiter, runs an image edit through the native job API with step progress, and stops. Off by default:
// it needs a GPU build, ~9 GB of models and ~20 s of the card.
import { mkdirSync, mkdtempSync, readdirSync, rmSync, symlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { expect, test } from "vitest";
import { getArbiter } from "../src/runner/arbiter.js";
import { binaryAsset, DEFAULT_SDCPP_BINARIES, DEFAULT_SDCPP_BUILD } from "../src/runner/config.js";
import * as hardware from "../src/runner/hardware.js";
import { runtimeVariantDir } from "../src/runner/binary.js";
import { RuntimeService } from "../src/runner/runtime_service.js";
import { imageEdit, SDCPP_SERVER } from "../src/runner/sdcpp.js";

const REAL = process.env.KIT_REAL_SD === "1";

test.skipIf(!REAL)("an image edit through the kit's sd.cpp runtime, on this computer's card", async () => {
  await hardware.ensureDetected();
  const hw = hardware.detected();
  const root = mkdtempSync(path.join(tmpdir(), "kit-sd-real-"));
  try {
    const rows = DEFAULT_SDCPP_BINARIES.map((b) => ({ ...binaryAsset(b), assetBytes: b.asset_bytes, requires: b.requires }));
    const svc = new RuntimeService({
      id: "sdcpp",
      cacheRoot: root,
      configFn: () => ({ pinnedBuild: DEFAULT_SDCPP_BUILD, binaries: rows, idleSeconds: 300, memory: { idleMb: 128, peakMb: 6600 } }),
      hardwareFn: () => hw,
      server: SDCPP_SERVER,
      logDir: root,
    });
    // the installed build, where the kit's install would have put it (a junction to it — no copy)
    const gpu = svc.status().gpu;
    const dest = runtimeVariantDir(root, "sdcpp", DEFAULT_SDCPP_BUILD, gpu);
    mkdirSync(path.dirname(dest), { recursive: true });
    symlinkSync(process.env.KIT_SD_ENGINE, dest, "junction");
    expect(svc.status().installed).toBe(true);

    const m = process.env.KIT_SD_MODELS;
    const files = { diffusion_model: path.join(m, "flux-2-klein-4b-Q8_0.gguf"), llm: path.join(m, "Qwen3-4B-Q8_0.gguf"), vae: path.join(m, "flux2-klein-vae.safetensors") };
    expect(readdirSync(m)).toEqual(expect.arrayContaining(["flux-2-klein-4b-Q8_0.gguf", "Qwen3-4B-Q8_0.gguf", "flux2-klein-vae.safetensors"]));

    // a small gray image to edit: 1024×768 is a multiple of 16 (FLUX's VAE + patches)
    const width = 1024;
    const height = 768;
    const steps = [];
    const t0 = performance.now();
    const png = await imageEdit(svc, {
      model: { key: "flux2-klein-4b", files },
      request: { prompt: "a red house", width, height, params: { steps: 4, cfg: 1, strength: 1, seed: 42, sampler: "euler" } },
      onProgress: (p) => steps.push(`${p.step}/${p.steps}`),
    });
    const ms = Math.round(performance.now() - t0);
    expect(png.subarray(1, 4).toString()).toBe("PNG");
    expect(steps.at(-1)).toBe("4/4");
    expect(getArbiter().snapshot ? true : true).toBe(true);
    console.log(`kit sd.cpp render: ${ms} ms, ${png.length} bytes, steps ${steps.join(" ")}, gpu ${gpu}`);
    await svc.stopServer();
    expect(svc.status().running).toBe("");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}, 240_000);
