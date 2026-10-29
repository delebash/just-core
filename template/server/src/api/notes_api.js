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
//   POST   /v1/notes/import  multipart `file` (UTF-8 text) → 201 Note | 413 | 415 | 422
//
// The import is the reference for an upload route (§15): the size is refused as the file streams
// in (the kit's uploadLimit, its limit a seeded setting), then what the file holds is checked —
// text, as long as a note may be — and a refusal is the kit's ApiError or a 422 under `file`.

import { Hono, input, uploadLimit } from "@delebash/core/platform";
import { ApiError, notFound, RequestValidationError } from "@delebash/core/platform/errors";
import { getLogger } from "@delebash/core/platform/log";
import { checkIfMatch, etagOf } from "@delebash/core/platform/versions";
import { getDb } from "../app_state.js";
import * as notes from "../database/notes.js";
import { SETTING_DEFAULTS } from "../database/seed.js";
import { getSetting } from "../database/settings.js";
import { BODY_MAX, NoteIn, NoteParams, NotePatch, TITLE_MAX } from "../schemas/notes.js";

const log = getLogger("family_template.notes");

// The words a person reads in the toast (the kit's reportError shows a refusal's detail).
const noSuchNote = (id) => notFound(`There is no note with the id ${id}.`);

// A note's version (the kit's platform/versions.js — HTTP conditional requests, RFC 9110 §13.1.1): every answer carries
// it, a change or a delete sends the one it was made on (If-Match), and one made on another is refused 412 — two
// windows saved over each other's note (2026-10-29). No If-Match (the pin toggle): the write is unconditional.
const versioned = (note) => ({ ...note, version: etagOf(note) });
const NOTE_CHANGED = {
  type: "note-changed",
  title: "This note was changed in another window",
  detail: "Your change wasn't saved — the note is shown as it is now",
};
/** The note `id` names, refused 412 when `ifMatch` names another version; 404 when there is none. */
function current(id, ifMatch) {
  const note = notes.getNote(getDb(), id);
  if (!note) throw noSuchNote(id);
  checkIfMatch(ifMatch, etagOf(note), NOTE_CHANGED);
  return note;
}

// the largest file the import takes (the setting; its default before the seed has run)
const maxImportKb = () => getSetting(getDb(), "notes.maxImportKilobytes") ?? SETTING_DEFAULTS["notes.maxImportKilobytes"];
const refuseFile = (msg, type, ctx) => new RequestValidationError([{ loc: ["body", "file"], msg, type, ...(ctx ? { ctx } : {}) }]);

/** A note's title from its file's name: "shopping-list_2026.txt" → "shopping list 2026". */
export const titleFromFile = (name) =>
  String(name || "")
    .replace(/\.[^.]*$/, "")
    .replace(/[_-]+/g, " ")
    .trim();

export function router() {
  const app = new Hono();

  app.get("/v1/notes", (c) => c.json({ items: notes.listNotes(getDb()).map(versioned) }));

  // a form's own bytes ride on top of the file's
  app.post("/v1/notes/import", uploadLimit(() => maxImportKb() * 1024 + 16 * 1024, { slug: "file-too-large", title: "File too large" }), async (c) => {
    let form;
    try {
      form = await c.req.parseBody();
    } catch {
      form = {};
    }
    const file = form.file;
    if (!(file instanceof Blob)) throw refuseFile("Field required", "missing");
    if (file.size > maxImportKb() * 1024) throw new ApiError(413, "file-too-large", "File too large", `The file is over ${maxImportKb()} KB.`);
    let text = null;
    try {
      text = new TextDecoder("utf-8", { fatal: true }).decode(await file.arrayBuffer());
    } catch {
      // not UTF-8
    }
    if (text === null || text.includes("\u0000")) throw new ApiError(415, "not-text", "Not a text file", "Import a plain text file, such as .txt or .md.");
    const body = text.replace(/^\uFEFF/, "").replace(/\r\n?/g, "\n").trim();
    // the title: the file's name, else the text's first line
    const title = [...(titleFromFile(file.name) || body.split("\n", 1)[0].trim())].slice(0, TITLE_MAX).join("");
    if (!title) throw refuseFile("The file is empty", "string_too_short", { min_length: 1 });
    if ([...body].length > BODY_MAX) throw refuseFile(`A note can be up to ${BODY_MAX} characters`, "string_too_long", { max_length: BODY_MAX });
    const note = notes.createNote(getDb(), { title, body });
    log.debug(`note ${note.id} imported`);
    return c.json(note, 201);
  });

  app.get("/v1/notes/:id", input({ params: NoteParams }), (c) => {
    const { id } = c.req.valid("param");
    const note = notes.getNote(getDb(), id);
    if (!note) throw noSuchNote(id);
    const v = versioned(note);
    c.header("ETag", v.version);
    return c.json(v);
  });

  app.post("/v1/notes", input({ body: NoteIn }), (c) => {
    const note = notes.createNote(getDb(), c.req.valid("json"));
    // the id only — a note's words are the user's content and never reach the log
    log.debug(`note ${note.id} created`);
    return c.json(versioned(note), 201);
  });

  app.patch("/v1/notes/:id", input({ params: NoteParams, body: NotePatch }), (c) => {
    const { id } = c.req.valid("param");
    current(id, c.req.header("if-match"));
    const note = notes.updateNote(getDb(), id, c.req.valid("json"));
    if (!note) throw noSuchNote(id);
    log.debug(`note ${id} changed`);
    const v = versioned(note);
    c.header("ETag", v.version);
    return c.json(v);
  });

  app.delete("/v1/notes/:id", input({ params: NoteParams }), (c) => {
    const { id } = c.req.valid("param");
    current(id, c.req.header("if-match"));
    if (!notes.deleteNote(getDb(), id)) throw noSuchNote(id);
    log.debug(`note ${id} deleted`);
    return c.body(null, 204);
  });

  return app;
}
