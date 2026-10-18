// SPDX-License-Identifier: MIT
// The notes store — the example domain's Pinia store (app-structure §4: one store per domain). The
// server owns the notes (family rule 2); this holds what the screen shows and calls /v1/notes
// through the kit's transport (the same base the kit's views use). A failed call throws the kit's
// Error — with `status`, `problem`, `errors` and `requestId` on it (§15) — and the page decides how
// to show it: its failed state for a load, the field for a 422, reportError for the rest.
import { del, get, patch as patchJson, post } from "@delebash/ui";
import { defineStore } from "pinia";

const path = (id) => `/v1/notes/${encodeURIComponent(id)}`;

/** The server's order (database/notes.js listNotes): pinned first, then the most recently changed. */
export const sortNotes = (items) =>
  [...items].sort((a, b) => Number(b.pinned) - Number(a.pinned) || b.updatedAt.localeCompare(a.updatedAt) || a.id.localeCompare(b.id));

export const useNotesStore = defineStore("notes", {
  state: () => ({
    items: [],
    // a load is running; `loaded` — the list has come from the server at least once
    loading: false,
    loaded: false,
  }),
  actions: {
    async load() {
      this.loading = true;
      try {
        const { items } = await get("/v1/notes");
        this.items = items;
        this.loaded = true;
      } finally {
        this.loading = false;
      }
    },
    async create(input) {
      const note = await post("/v1/notes", input);
      this.items = sortNotes([note, ...this.items]);
      return note;
    },
    async update(id, changes) {
      const note = await patchJson(path(id), changes);
      this.items = sortNotes(this.items.map((n) => (n.id === id ? note : n)));
      return note;
    },
    async remove(id) {
      await del(path(id));
      this.items = this.items.filter((n) => n.id !== id);
    },
  },
});
