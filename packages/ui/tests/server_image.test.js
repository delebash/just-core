// SPDX-License-Identifier: MIT
// useServerImage — a server picture through the kit's transport, as an object URL: loaded, swapped
// when the path changes (the old URL released only once the new one arrived, a late answer for an
// old path dropped), a failure kept as the §15 Error, everything released with its scope.
import { afterEach, expect, test, vi } from "vitest";
import { effectScope, nextTick, ref } from "vue";

vi.mock("../src/common/services/serverApi.js", () => ({ requestBlob: vi.fn() }));
const { useServerImage } = await import("../src/common/composables/useServerImage.js");

const made = [];
const revoked = [];
vi.spyOn(URL, "createObjectURL").mockImplementation((blob) => {
  const url = `blob:test/${made.length}-${blob.size}`;
  made.push(url);
  return url;
});
vi.spyOn(URL, "revokeObjectURL").mockImplementation((url) => revoked.push(url));
afterEach(() => {
  made.length = 0;
  revoked.length = 0;
});

const flush = async () => {
  for (let i = 0; i < 4; i++) await nextTick();
};

test("a path loads as an object URL; a new path swaps it and releases the old; the scope's end releases all", async () => {
  const fetchBlob = vi.fn(async (p) => new Blob([p]));
  const path = ref("/v1/a");
  const scope = effectScope();
  const img = scope.run(() => useServerImage(path, { fetchBlob }));
  await flush();
  expect(fetchBlob).toHaveBeenCalledWith("/v1/a");
  const first = img.src.value;
  expect(first).toMatch(/^blob:/);

  path.value = "/v1/bb";
  await flush();
  expect(img.src.value).not.toBe(first);
  expect(revoked).toEqual([first]);

  path.value = "";
  await flush();
  expect(img.src.value).toBe("");

  path.value = "/v1/c";
  await flush();
  const last = img.src.value;
  scope.stop();
  expect(revoked).toContain(last);
});

test("an answer for an old path that arrives late is dropped", async () => {
  const pending = {};
  const fetchBlob = vi.fn((p) => new Promise((resolve) => (pending[p] = () => resolve(new Blob([p])))));
  const path = ref("/v1/slow");
  const scope = effectScope();
  const img = scope.run(() => useServerImage(path, { fetchBlob }));
  path.value = "/v1/fast";
  await flush();
  pending["/v1/fast"]();
  await flush();
  const fast = img.src.value;
  pending["/v1/slow"]();
  await flush();
  expect(img.src.value).toBe(fast);
  expect(made).toHaveLength(1); // the late picture never became a URL
  scope.stop();
});

test("a failure is kept as the transport's Error, and the picture shows nothing", async () => {
  const refused = Object.assign(new Error("401 Unauthorized"), { status: 401 });
  const scope = effectScope();
  const img = scope.run(() => useServerImage("/v1/locked", { fetchBlob: async () => Promise.reject(refused) }));
  await flush();
  expect(img.error.value).toBe(refused);
  expect(img.src.value).toBe("");
  expect(img.loading.value).toBe(false);
  scope.stop();
});
