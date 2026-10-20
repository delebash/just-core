// SPDX-License-Identifier: MIT
// The save door for a file the app's own server makes (common/services/fileSave.js `saveUrlAs`): where the
// host wired a URL saver (the desktop shell's `saveFromUrl`), the server's address and the window's token
// go to it and the window never holds the file — a backup of gigabytes of photos (2026-10-20); otherwise
// it is fetched and downloaded as before.
import { afterEach, expect, test, vi } from "vitest";
import { configureFileSave, saveUrlAs } from "../src/common/services/fileSave.js";
import { configureServerApi } from "../src/common/services/serverApi.js";
import { setServerToken } from "../src/common/services/serverToken.js";

afterEach(() => {
  configureFileSave({ save: null, saveUrl: null, available: null });
  setServerToken("");
  vi.unstubAllGlobals();
});

test("the shell streams the server's file: its address and the window's token, never the bytes", async () => {
  configureServerApi({ resolveBase: () => "http://127.0.0.1:17499" });
  setServerToken("t0k");
  const fetch = vi.fn();
  vi.stubGlobal("fetch", fetch);
  const saveUrl = vi.fn(async () => ({ ok: true, path: "/home/me/backup.zip" }));
  configureFileSave({ save: vi.fn(), saveUrl, available: () => true });
  const res = await saveUrlAs("/v1/data/backup", "backup.zip", { filterExt: "zip" });
  expect(res).toEqual({ ok: true, path: "/home/me/backup.zip" });
  expect(saveUrl).toHaveBeenCalledWith("http://127.0.0.1:17499/v1/data/backup", expect.objectContaining({ filename: "backup.zip", filterExt: "zip", headers: { Authorization: "Bearer t0k" } }));
  expect(fetch).not.toHaveBeenCalled(); // the window fetched nothing
  saveUrl.mockResolvedValueOnce(null);
  expect(await saveUrlAs("/v1/data/backup", "backup.zip")).toEqual({ ok: false, cancelled: true });
});

test("no URL saver (a browser): fetched and downloaded", async () => {
  configureServerApi({ resolveBase: () => "http://127.0.0.1:17499" });
  vi.stubGlobal("fetch", vi.fn(async () => new Response(new Blob(["zip"]), { status: 200 })));
  // the browser download: a link clicked (no DOM here — a stand-in for the one element it makes)
  const a = { click: vi.fn(), remove: vi.fn() };
  vi.stubGlobal("document", { createElement: () => a, body: { appendChild: vi.fn() } });
  configureFileSave({ save: null, saveUrl: null, available: () => false });
  expect(await saveUrlAs("/v1/data/backup", "backup.zip")).toEqual({ ok: true, downloaded: true });
  expect(a.download).toBe("backup.zip");
  expect(a.click).toHaveBeenCalled();
});
