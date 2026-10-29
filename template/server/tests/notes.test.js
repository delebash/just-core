// SPDX-License-Identifier: MIT
// /v1/notes — the example domain's routes, each with its happy path, a 422 from its schema and a
// refusal (app-structure §18), through `app.request`. The 422s are the family's contract (§15):
// problem+json, the field's `loc`, the limit it broke in `ctx`, and the request's id.
import { beforeEach, describe, expect, test } from "vitest";
import { titleFromFile } from "../src/api/notes_api.js";
import { createApp } from "../src/app.js";
import { getDb } from "../src/app_state.js";
import { setSetting } from "../src/database/settings.js";
import { testClient, tmpDir, useHermeticKit } from "./helpers.js";

useHermeticKit();

let client;
beforeEach(async () => {
  client = testClient(await createApp(tmpDir()));
});

const create = async (json) => {
  const r = await client.post("/v1/notes", { json });
  expect(r.statusCode).toBe(201);
  return r.json();
};

describe("create", () => {
  test("a note gets a random id, its defaults and ISO UTC times", async () => {
    const note = await create({ title: "Groceries" });
    expect(note).toEqual({
      id: expect.stringMatching(/^[0-9a-f-]{36}$/),
      title: "Groceries",
      body: "",
      pinned: false,
      createdAt: expect.stringMatching(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/),
      updatedAt: note.createdAt,
      version: expect.stringMatching(/^"[A-Za-z0-9_-]{22}"$/), // its version for If-Match (platform/versions.js)
    });
    expect((await create({ title: "Groceries" })).id).not.toBe(note.id);
  });

  test("a missing title is a 422 naming the field", async () => {
    const r = await client.post("/v1/notes", { json: { body: "no title" } });
    expect(r.statusCode).toBe(422);
    expect(r.headers["content-type"]).toMatch(/application\/problem\+json/);
    const problem = r.json();
    expect(problem.errors).toEqual([{ loc: ["body", "title"], msg: "Field required", type: "missing" }]);
    expect(problem.requestId).toBe(r.headers["x-request-id"]);
  });

  test("the limits are the schema's, with the limit in ctx — counted in characters", async () => {
    const tooLong = await client.post("/v1/notes", { json: { title: "x".repeat(121) } });
    expect(tooLong.statusCode).toBe(422);
    expect(tooLong.json().errors).toEqual([
      { loc: ["body", "title"], msg: "String should have at most 120 characters", type: "string_too_long", ctx: { max_length: 120 } },
    ]);
    const empty = await client.post("/v1/notes", { json: { title: "" } });
    expect(empty.json().errors[0]).toMatchObject({ type: "string_too_short", ctx: { min_length: 1 } });
    const body = await client.post("/v1/notes", { json: { title: "ok", body: "x".repeat(20001) } });
    expect(body.json().errors[0]).toMatchObject({ loc: ["body", "body"], ctx: { max_length: 20000 } });
    // 120 emoji are 120 characters (240 UTF-16 units) — the form counts the same way
    expect((await client.post("/v1/notes", { json: { title: "😀".repeat(120) } })).statusCode).toBe(201);
  });

  test("an unknown field is refused, not silently dropped", async () => {
    const r = await client.post("/v1/notes", { json: { title: "ok", colour: "red" } });
    expect(r.statusCode).toBe(422);
    expect(r.json().errors).toEqual([{ loc: ["body", "colour"], msg: "Extra inputs are not permitted", type: "extra_forbidden" }]);
  });
});

describe("read", () => {
  test("the list is pinned first, then the most recently changed", async () => {
    const a = await create({ title: "A" });
    const b = await create({ title: "B" });
    await create({ title: "C", pinned: true });
    await client.patch(`/v1/notes/${a.id}`, { json: { body: "touched" } });
    const titles = (await client.get("/v1/notes")).json().items.map((n) => n.title);
    expect(titles).toEqual(["C", "A", "B"]);
    expect(b.id).toBeTruthy();
  });

  test("one note by id, and a refusal for an id that isn't there", async () => {
    const note = await create({ title: "Find me" });
    expect((await client.get(`/v1/notes/${note.id}`)).json()).toEqual(note);
    const r = await client.get("/v1/notes/no-such-id");
    expect(r.statusCode).toBe(404);
    expect(r.json()).toMatchObject({ status: 404, title: "Not Found", type: "https://family-template.local/errors/not-found" });
    expect(r.json().detail).toMatch(/no-such-id/);
  });
});

describe("update", () => {
  test("only the given fields change, and the change time moves", async () => {
    const note = await create({ title: "Draft", body: "keep me" });
    await new Promise((r) => setTimeout(r, 5));
    const r = await client.patch(`/v1/notes/${note.id}`, { json: { title: "Final", pinned: true } });
    expect(r.statusCode).toBe(200);
    expect(r.json()).toMatchObject({ title: "Final", body: "keep me", pinned: true, createdAt: note.createdAt });
    expect(r.json().updatedAt > note.updatedAt).toBe(true);
  });

  test("a value out of the schema is a 422; an unknown id is a 404", async () => {
    const note = await create({ title: "Draft" });
    const bad = await client.patch(`/v1/notes/${note.id}`, { json: { pinned: "maybe" } });
    expect(bad.statusCode).toBe(422);
    expect(bad.json().errors[0]).toMatchObject({ loc: ["body", "pinned"], type: "bool_parsing" });
    expect((await client.patch("/v1/notes/missing", { json: { title: "x" } })).statusCode).toBe(404);
  });
});

describe("delete", () => {
  test("a deleted note is gone; deleting it again is a 404", async () => {
    const note = await create({ title: "Bye" });
    expect((await client.delete(`/v1/notes/${note.id}`)).statusCode).toBe(204);
    expect((await client.get(`/v1/notes/${note.id}`)).statusCode).toBe(404);
    expect((await client.delete(`/v1/notes/${note.id}`)).statusCode).toBe(404);
  });

  test("an id longer than the path schema allows is a 422", async () => {
    const r = await client.delete(`/v1/notes/${"x".repeat(65)}`);
    expect(r.statusCode).toBe(422);
    expect(r.json().errors[0]).toMatchObject({ loc: ["path", "id"], type: "string_too_long" });
  });
});

// The upload example (§15): multipart, the size refused as it streams in, then what the file holds.
describe("import a file", () => {
  const upload = async (bytes, name = "shopping-list_2026.txt") => {
    const form = new FormData();
    if (bytes !== undefined) form.append("file", new Blob([bytes]), name);
    const res = await client.app.request("http://testserver/v1/notes/import", { method: "POST", body: form, headers: { host: "testserver" } }, { incoming: { socket: { remoteAddress: "192.0.2.10" } } });
    return { status: res.status, body: await res.json() };
  };

  test("a text file becomes a note: its name the title, its text the note (BOM and CRLF gone)", async () => {
    const r = await upload("\uFEFFMilk\r\nEggs\r\n");
    expect(r.status).toBe(201);
    expect(r.body).toMatchObject({ title: "shopping list 2026", body: "Milk\nEggs", pinned: false });
    expect((await client.get(`/v1/notes/${r.body.id}`)).json().body).toBe("Milk\nEggs");
    // a name that says nothing: the first line is the title
    expect((await upload("Packing list\nsocks", "_.md")).body.title).toBe("Packing list");
    expect(titleFromFile("a.b-c_d.txt")).toBe("a.b c d");
  });

  test("not text is a 415; too big a 413 — refused as it streams in, or by its exact size", async () => {
    const binary = await upload(new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0xff, 0x00]), "photo.png");
    expect(binary.status).toBe(415);
    expect(binary.body.type).toMatch(/not-text$/);
    setSetting(getDb(), "notes.maxImportKilobytes", 1);
    const streamed = await upload("x".repeat(40 * 1024));
    expect(streamed.status).toBe(413);
    expect(streamed.body.type).toMatch(/file-too-large$/);
    const exact = await upload("x".repeat(1500));
    expect(exact.status).toBe(413);
    expect(exact.body.detail).toBe("The file is over 1 KB.");
    expect((await upload("x".repeat(1000))).status).toBe(201);
  });

  test("no file, an empty one, or more than a note holds is a 422 under the file", async () => {
    expect((await upload(undefined)).body.errors).toEqual([{ loc: ["body", "file"], msg: "Field required", type: "missing" }]);
    expect((await upload("", "_.txt")).body.errors[0]).toMatchObject({ loc: ["body", "file"], type: "string_too_short" });
    const long = await upload("x".repeat(20001));
    expect(long.status).toBe(422);
    expect(long.body.errors[0]).toMatchObject({ loc: ["body", "file"], type: "string_too_long", ctx: { max_length: 20000 } });
  });
});

// The finish list's C24 (2026-10-29; the kit's platform/versions.js, RFC 9110 §13.1.1): two windows saved over each
// other's note. A note carries its version; a change or a delete sends the version it was made on (If-Match) and one
// made on another is refused 412 in the note's words; a write without If-Match (the pin toggle) still lands.
describe("versions", () => {
  test("a change made on an older version is refused 412; the current one, or none, lands", async () => {
    const note = await create({ title: "Draft" });
    expect(note.version).toMatch(/^"[A-Za-z0-9_-]{22}"$/);
    const got = await client.get(`/v1/notes/${note.id}`);
    expect(got.headers.get?.("etag") ?? got.headers.etag).toBe(note.version);
    // the other window saves first
    const other = (await client.patch(`/v1/notes/${note.id}`, { json: { body: "theirs" }, headers: { "if-match": note.version } })).json();
    expect(other.version).not.toBe(note.version);
    // this window's change, made on the old version
    const stale = await client.patch(`/v1/notes/${note.id}`, { json: { body: "mine" }, headers: { "if-match": note.version } });
    expect(stale.statusCode).toBe(412);
    expect(stale.json()).toMatchObject({ status: 412, title: "This note was changed in another window", detail: "Your change wasn't saved — the note is shown as it is now" });
    expect((await client.get(`/v1/notes/${note.id}`)).json().body).toBe("theirs");
    // no If-Match: unconditional (the pin toggle)
    expect((await client.patch(`/v1/notes/${note.id}`, { json: { pinned: true } })).statusCode).toBe(200);
    // a delete on an old version is refused too; on the current one it lands
    expect((await client.delete(`/v1/notes/${note.id}`, { headers: { "if-match": note.version } })).statusCode).toBe(412);
    const now = (await client.get(`/v1/notes/${note.id}`)).json().version;
    expect((await client.delete(`/v1/notes/${note.id}`, { headers: { "if-match": now } })).statusCode).toBe(204);
  });
});
