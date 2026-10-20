// SPDX-License-Identifier: MIT
// The shell's saves land whole (src/shell/save_place.js): `.part` renamed into place, a rename Windows refuses
// over a held target tried again, then copied over it in place — never a save that fails because a viewer has
// the last export open, never a `.part` left behind (2026-10-20).
import { existsSync, mkdtempSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, test } from "vitest";
import { placeSaved } from "../src/shell/save_place.js";

const held = () => Object.assign(new Error("operation not permitted"), { code: "EPERM" });

test("a_part_file_goes_into_place_and_a_held_target_is_tried_again_then_copied_over", async () => {
  const dir = mkdtempSync(join(tmpdir(), "kit-save-"));
  const target = join(dir, "export.jpg");
  writeFileSync(target, "old");
  // held twice, then let go: renamed
  writeFileSync(`${target}.part`, "new");
  let tries = 0;
  await placeSaved(`${target}.part`, target, { waitMs: 1, rename: (a, b) => (++tries < 3 ? (() => { throw held(); })() : renameSync(a, b)) });
  expect(readFileSync(target, "utf8")).toBe("new");
  expect(existsSync(`${target}.part`)).toBe(false);
  // held throughout: copied over in place
  writeFileSync(`${target}.part`, "newer");
  await placeSaved(`${target}.part`, target, { waitMs: 1, rename: () => { throw held(); } });
  expect(readFileSync(target, "utf8")).toBe("newer");
  expect(existsSync(`${target}.part`)).toBe(false);
  // anything else is the save's failure
  await expect(placeSaved(`${target}.part`, target, { rename: () => { throw Object.assign(new Error("nope"), { code: "ENOSPC" }); } })).rejects.toThrow("nope");
});
