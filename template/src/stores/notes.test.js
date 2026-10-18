// SPDX-License-Identifier: MIT
// The notes store without a screen (app-structure §18, "stores and services"): it calls /v1/notes
// through the kit's transport (mocked here — the transport has its own tests in the kit), keeps the
// server's order after a change, and lets a failure reach its caller with the kit's parts on it.
import { createPinia, setActivePinia } from "pinia";
import { beforeEach, describe, expect, test, vi } from "vitest";

vi.mock("@delebash/ui", () => ({ get: vi.fn(), post: vi.fn(), patch: vi.fn(), del: vi.fn() }));
const api = await import("@delebash/ui");
const { sortNotes, useNotesStore } = await import("./notes.js");

const note = (id, over = {}) => ({
  id,
  title: `Note ${id}`,
  body: "",
  pinned: false,
  createdAt: "2026-10-17T10:00:00.000Z",
  updatedAt: "2026-10-17T10:00:00.000Z",
  ...over,
});

beforeEach(() => {
  setActivePinia(createPinia());
  vi.clearAllMocks();
});

describe("sortNotes — the server's order", () => {
  test("pinned first, then the most recently changed", () => {
    const a = note("a", { updatedAt: "2026-10-17T10:00:00.000Z" });
    const b = note("b", { updatedAt: "2026-10-17T11:00:00.000Z" });
    const c = note("c", { pinned: true, updatedAt: "2026-10-17T09:00:00.000Z" });
    expect(sortNotes([a, b, c]).map((n) => n.id)).toEqual(["c", "b", "a"]);
  });
});

describe("the notes store", () => {
  test("load fills the list and marks it loaded; loading is true only while it runs", async () => {
    let finish;
    api.get.mockReturnValue(new Promise((resolve) => (finish = resolve)));
    const store = useNotesStore();
    const pending = store.load();
    expect(store.loading).toBe(true);
    expect(store.loaded).toBe(false);
    finish({ items: [note("a")] });
    await pending;
    expect(api.get).toHaveBeenCalledWith("/v1/notes");
    expect(store.items.map((n) => n.id)).toEqual(["a"]);
    expect(store.loaded).toBe(true);
    expect(store.loading).toBe(false);
  });

  test("a failed load reaches the caller and leaves the store not loaded", async () => {
    const err = Object.assign(new Error("500 Internal Server Error"), { status: 500, requestId: "r-1" });
    api.get.mockRejectedValue(err);
    const store = useNotesStore();
    await expect(store.load()).rejects.toBe(err);
    expect(store.loaded).toBe(false);
    expect(store.loading).toBe(false);
  });

  test("create, update and remove keep the list in the server's order", async () => {
    api.get.mockResolvedValue({ items: [note("a", { updatedAt: "2026-10-17T10:00:00.000Z" })] });
    const store = useNotesStore();
    await store.load();

    api.post.mockResolvedValue(note("b", { updatedAt: "2026-10-17T12:00:00.000Z" }));
    await store.create({ title: "Note b" });
    expect(api.post).toHaveBeenCalledWith("/v1/notes", { title: "Note b" });
    expect(store.items.map((n) => n.id)).toEqual(["b", "a"]);

    api.patch.mockResolvedValue(note("a", { pinned: true, updatedAt: "2026-10-17T13:00:00.000Z" }));
    await store.update("a", { pinned: true });
    expect(api.patch).toHaveBeenCalledWith("/v1/notes/a", { pinned: true });
    expect(store.items.map((n) => n.id)).toEqual(["a", "b"]);

    api.del.mockResolvedValue("");
    await store.remove("b");
    expect(api.del).toHaveBeenCalledWith("/v1/notes/b");
    expect(store.items.map((n) => n.id)).toEqual(["a"]);
  });

  test("an id is encoded in the path", async () => {
    api.del.mockResolvedValue("");
    await useNotesStore().remove("a/b c");
    expect(api.del).toHaveBeenCalledWith("/v1/notes/a%2Fb%20c");
  });

  test("a refused save throws the kit's error untouched — the form reads its field errors", async () => {
    const err = Object.assign(new Error("422"), { status: 422, errors: [{ loc: ["body", "title"], type: "missing", msg: "Field required" }] });
    api.post.mockRejectedValue(err);
    const store = useNotesStore();
    await expect(store.create({ title: "" })).rejects.toBe(err);
    expect(store.items).toEqual([]);
  });
});
