// SPDX-License-Identifier: MIT
// /v1/notes — the example domain, the reference for every route an app writes (app-structure
// §15–§16): the request is checked against its schema (schemas/notes.js, the form's schema too)
// by the kit's `input()`; a refusal the app decides is the kit's `notFound`; the store
// (database/notes.js) holds the SQL. Errors answer as problem+json through the kit's handlers.
//
//   GET    /v1/notes       → {items: Note[]}  pinned first, then the most recently changed
//   GET    /v1/notes/:id   → Note | 404
//   POST   /v1/notes       NoteIn → 201 Note | 422
//   PATCH  /v1/notes/:id   NotePatch → Note | 404 | 422
//   DELETE /v1/notes/:id   → 204 | 404

import { Hono, input } from "@delebash/core/platform";
import { notFound } from "@delebash/core/platform/errors";
import { getLogger } from "@delebash/core/platform/log";
import { getDb } from "../app_state.js";
import * as notes from "../database/notes.js";
import { NoteIn, NoteParams, NotePatch } from "../schemas/notes.js";

const log = getLogger("family_template.notes");

// The words a person reads in the toast (the kit's reportError shows a refusal's detail).
const noSuchNote = (id) => notFound(`There is no note with the id ${id}.`);

export function router() {
  const app = new Hono();

  app.get("/v1/notes", (c) => c.json({ items: notes.listNotes(getDb()) }));

  app.get("/v1/notes/:id", input({ params: NoteParams }), (c) => {
    const { id } = c.req.valid("param");
    const note = notes.getNote(getDb(), id);
    if (!note) throw noSuchNote(id);
    return c.json(note);
  });

  app.post("/v1/notes", input({ body: NoteIn }), (c) => {
    const note = notes.createNote(getDb(), c.req.valid("json"));
    // the id only — a note's words are the user's content and never reach the log
    log.debug(`note ${note.id} created`);
    return c.json(note, 201);
  });

  app.patch("/v1/notes/:id", input({ params: NoteParams, body: NotePatch }), (c) => {
    const { id } = c.req.valid("param");
    const note = notes.updateNote(getDb(), id, c.req.valid("json"));
    if (!note) throw noSuchNote(id);
    log.debug(`note ${id} changed`);
    return c.json(note);
  });

  app.delete("/v1/notes/:id", input({ params: NoteParams }), (c) => {
    const { id } = c.req.valid("param");
    if (!notes.deleteNote(getDb(), id)) throw noSuchNote(id);
    log.debug(`note ${id} deleted`);
    return c.body(null, 204);
  });

  return app;
}
