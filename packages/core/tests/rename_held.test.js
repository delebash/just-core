// SPDX-License-Identifier: MIT
// A rename retried while another program holds a file (platform/rename_held.js): a held one moves once it is
// let go, any other error is thrown at once, and — for real on Windows — a folder with a file open in it moves
// once the file is closed.
import { closeSync, existsSync, mkdirSync, mkdtempSync, openSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, test } from "vitest";
import { renameHeld, renameHeldSync } from "../src/platform/rename_held.js";

const busy = () => Object.assign(new Error("EBUSY: resource busy or locked"), { code: "EBUSY" });

test("a_held_rename_is_tried_again_until_it_is_let_go", async () => {
  let tries = 0;
  const rename = async () => {
    if (++tries < 3) throw busy();
  };
  await renameHeld("a", "b", { rename });
  expect(tries).toBe(3);
  let syncTries = 0;
  renameHeldSync("a", "b", {
    rename: () => {
      if (++syncTries < 2) throw busy();
    },
  });
  expect(syncTries).toBe(2);
});

test("any_other_error_is_thrown_at_once", async () => {
  let tries = 0;
  const missing = Object.assign(new Error("ENOENT: no such file"), { code: "ENOENT" });
  await expect(
    renameHeld("a", "b", {
      rename: async () => {
        tries++;
        throw missing;
      },
    }),
  ).rejects.toBe(missing);
  expect(tries).toBe(1);
  expect(() =>
    renameHeldSync("a", "b", {
      rename: () => {
        throw missing;
      },
    }),
  ).toThrow(missing);
});

test("a_folder_with_a_file_open_in_it_moves_once_the_file_is_closed", async () => {
  // Windows refuses to rename a folder while a file in it is open (Node's own handles too); elsewhere it just moves
  const root = mkdtempSync(join(tmpdir(), "kit-held-"));
  const from = join(root, "unpacked");
  mkdirSync(from);
  writeFileSync(join(from, "engine.dll"), "dll");
  const fd = openSync(join(from, "engine.dll"), "r");
  const letGo = setTimeout(() => closeSync(fd), 300);
  try {
    await renameHeld(from, join(root, "home"));
  } finally {
    clearTimeout(letGo);
    try {
      closeSync(fd);
    } catch {
      // closed by the timer
    }
  }
  expect(existsSync(from)).toBe(false);
  expect(readFileSync(join(root, "home", "engine.dll"), "utf8")).toBe("dll");
});
