// SPDX-License-Identifier: MIT
// The notes area's request and answer schemas — shared with the renderer's form (app-structure
// §15): the route checks a body against them (the kit's `input()`), and NotesPage builds its form
// rules from the same objects (`schemaRules(NoteIn)`, imported as
// `family-template-server/schemas/notes.js`). The limits a user meets live here, nowhere else.
// Browser-safe: this file imports only the kit's `platform/schema` (TypeBox).

import { opt, strictObject, T } from "@delebash/core/platform/schema";

/** The longest title and note (characters) — the import holds a file to them too. */
export const TITLE_MAX = 120;
export const BODY_MAX = 20000;

const Title = T.String({ minLength: 1, maxLength: TITLE_MAX });
const Body = T.String({ maxLength: BODY_MAX });

/** A new note (POST /v1/notes). */
export const NoteIn = strictObject({
  title: Title,
  body: opt(Body, ""),
  pinned: opt(T.Boolean(), false),
});

/** A change to a note (PATCH /v1/notes/:id) — any of its fields. */
export const NotePatch = strictObject({
  title: opt(Title),
  body: opt(Body),
  pinned: opt(T.Boolean()),
});

/** The note a path names. */
export const NoteParams = T.Object({ id: T.String({ minLength: 1, maxLength: 64 }) });

/** A note as the server answers it. */
export const Note = T.Object({
  id: T.String(),
  title: T.String(),
  body: T.String(),
  pinned: T.Boolean(),
  createdAt: T.String({ format: "date-time" }),
  updatedAt: T.String({ format: "date-time" }),
});

/** GET /v1/notes. */
export const NoteList = T.Object({ items: T.Array(Note) });
