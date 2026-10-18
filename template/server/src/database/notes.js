// SPDX-License-Identifier: MIT
// The notes store — with database/settings.js the only code that writes SQL (app-structure §16).
// A route calls these; they take the open database first and speak the camelCase wire shape.

import { randomUUID } from "node:crypto";

const COLUMNS = "id, title, body, pinned, created_at, updated_at";

/** A row → the wire shape. */
function fromRow(row) {
  if (!row) return null;
  return {
    id: row.id,
    title: row.title,
    body: row.body,
    pinned: row.pinned === 1,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

const now = () => new Date().toISOString();

/** Every note: pinned first, then the most recently changed. */
export function listNotes(db) {
  return db.all(`SELECT ${COLUMNS} FROM notes ORDER BY pinned DESC, updated_at DESC, id`).map(fromRow);
}

/** One note, or null. */
export function getNote(db, id) {
  return fromRow(db.one(`SELECT ${COLUMNS} FROM notes WHERE id = ?`, [id]));
}

/** Add a note; returns it. */
export function createNote(db, { title, body = "", pinned = false }) {
  const id = randomUUID();
  const at = now();
  db.run(`INSERT INTO notes (${COLUMNS}) VALUES (?, ?, ?, ?, ?, ?)`, [id, title, body, pinned ? 1 : 0, at, at]);
  return getNote(db, id);
}

/** Change the given fields of a note; returns it, or null when there is none. */
export function updateNote(db, id, patch) {
  const sets = [];
  const values = [];
  if (patch.title !== undefined) {
    sets.push("title = ?");
    values.push(patch.title);
  }
  if (patch.body !== undefined) {
    sets.push("body = ?");
    values.push(patch.body);
  }
  if (patch.pinned !== undefined) {
    sets.push("pinned = ?");
    values.push(patch.pinned ? 1 : 0);
  }
  if (!sets.length) return getNote(db, id); // nothing to change
  sets.push("updated_at = ?");
  values.push(now());
  const { changes } = db.run(`UPDATE notes SET ${sets.join(", ")} WHERE id = ?`, [...values, id]);
  return changes ? getNote(db, id) : null;
}

/** Delete a note; false when there was none. */
export function deleteNote(db, id) {
  return db.run("DELETE FROM notes WHERE id = ?", [id]).changes > 0;
}
