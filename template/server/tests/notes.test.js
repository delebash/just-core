// SPDX-License-Identifier: MIT
// /v1/notes — the example domain's routes, each with its happy path, a 422 from its schema and a
// refusal (app-structure §18), through `app.request`. The 422s are the family's contract (§15):
// problem+json, the field's `loc`, the limit it broke in `ctx`, and the request's id.
import { beforeEach, describe, expect, test } from "vitest";
import { createApp } from "../src/app.js";
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
