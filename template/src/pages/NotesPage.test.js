// SPDX-License-Identifier: MIT
// @vitest-environment jsdom
//
// The Notes screen mounted for real — Vue Test Utils with Quasar installed as the app installs it
// and the kit's UI wired by installLlmUi (vuejs.org/guide/scaling-up/testing; app-structure §18) —
// against a stand-in server answering /v1/notes and /v1/settings the way the real one does. It
// proves the states of §17 (loading, empty, failed with Retry, the list) and the form of §15: the
// rules come from the route's own schema, a server 422 lands under its field, Save is disabled while
// it saves, a delete asks first, and Import a file sends the file to the upload route — its refusal
// shown in the server's words.
import { _resolveDialog, dialogState, errorMessage, installLlmUi, LlmUiHosts } from "@delebash/ui";
import { QUASAR_TEST_OPTIONS } from "@delebash/ui/quasar/install.js";
import { flushPromises, mount } from "@vue/test-utils";
import { createPinia } from "pinia";
import * as quasar from "quasar";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { h } from "vue";
import { i18n } from "../i18n/index.js";
import NotesPage from "./NotesPage.vue";

// what the page hands the kit's reportError (its toast is Quasar's Notify, not mounted here)
const reported = [];
vi.mock("@delebash/ui", async (importOriginal) => ({ ...(await importOriginal()), reportError: (e) => reported.push(e) }));

// Quasar's CLI makes every q-* tag available to a template (its build-time auto-import); in a test
// the components are registered instead.
const QUASAR_COMPONENTS = Object.fromEntries(Object.entries(quasar).filter(([k, v]) => /^Q[A-Z]/.test(k) && v?.name));

// ── a stand-in server, in the real one's shapes ─────────────────────────────
let server;
const json = (body, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": status >= 400 ? "application/problem+json" : "application/json" } });
const problem422 = (field, type, ctx) =>
  json(
    {
      type: "https://family-template.local/errors/validation-error",
      title: "Validation Error",
      status: 422,
      detail: "Request body failed validation.",
      errors: [{ loc: ["body", field], msg: "refused", type, ...(ctx ? { ctx } : {}) }],
      requestId: "rid-422",
    },
    422,
  );

function fakeFetch(input, init = {}) {
  const url = new URL(String(input));
  const method = (init.method || "GET").toUpperCase();
  server.calls.push(`${method} ${url.pathname}`);
  if (server.down) return Promise.resolve(json({ type: "x/internal", title: "Internal Server Error", status: 500, detail: "disk on fire", requestId: "rid-500" }, 500));
  if (url.pathname === "/v1/settings") return Promise.resolve(json({ "notes.pageSize": 25 }));
  if (url.pathname === "/v1/notes" && method === "GET") return server.list ?? Promise.resolve(json({ items: server.notes }));
  if (url.pathname === "/v1/notes" && method === "POST") {
    if (server.refuse) return Promise.resolve(server.refuse());
    const body = JSON.parse(init.body);
    const at = new Date().toISOString();
    const note = { id: `n${server.notes.length + 1}`, body: "", pinned: false, ...body, createdAt: at, updatedAt: at };
    server.notes.push(note);
    return Promise.resolve(json(note, 201));
  }
  // POST /v1/notes/import (multipart): the file's name, or the server's refusal
  if (url.pathname === "/v1/notes/import" && method === "POST") {
    if (server.refuseImport) return Promise.resolve(server.refuseImport());
    const file = init.body.get("file");
    const at = new Date().toISOString();
    const note = { id: `n${server.notes.length + 1}`, title: file.name.replace(/\.[^.]*$/, ""), body: "", pinned: false, createdAt: at, updatedAt: at };
    server.notes.push(note);
    return Promise.resolve(json(note, 201));
  }
  const m = url.pathname.match(/^\/v1\/notes\/(.+)$/);
  // the AI feature: the stream is held until the test answers it; the one-shot fallback answers
  if (url.pathname === "/v1/ai/stream") return server.stream;
  if (url.pathname === "/v1/ai/run") {
    server.runBody = JSON.parse(init.body);
    return Promise.resolve(json({ content: '"Weekly shopping list."\n', model: "test", promptTokens: 9, completionTokens: 5 }));
  }
  if (m && method === "DELETE") {
    server.notes = server.notes.filter((n) => n.id !== m[1]);
    return Promise.resolve(new Response(null, { status: 204 }));
  }
  return Promise.resolve(json({}));
}

let wrapper;
async function mountPage() {
  const Host = { render: () => [h(quasar.QLayout, { view: "hhh lpr fff" }, () => h(quasar.QPageContainer, () => h(NotesPage))), h(LlmUiHosts)] };
  wrapper = mount(Host, {
    attachTo: document.body,
    global: {
      plugins: [
        [quasar.Quasar, { ...QUASAR_TEST_OPTIONS, components: QUASAR_COMPONENTS }],
        i18n,
        createPinia(),
        { install: (app) => installLlmUi(app, { i18n, external: false }) },
      ],
      directives: { tooltip: {} },
    },
  });
  await flushPromises();
  return wrapper;
}
const text = () => document.body.textContent;
const byText = (selector, words) => [...document.body.querySelectorAll(selector)].find((el) => el.textContent.includes(words));
const click = async (el) => {
  el.click();
  await flushPromises();
};

beforeEach(() => {
  server = { notes: [], calls: [] };
  vi.stubGlobal("fetch", vi.fn(fakeFetch));
  vi.stubGlobal("ResizeObserver", class { observe() {} unobserve() {} disconnect() {} });
  vi.stubGlobal("matchMedia", vi.fn(() => ({ matches: false, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {} })));
});
afterEach(() => {
  wrapper?.unmount();
  document.body.innerHTML = "";
  vi.unstubAllGlobals();
});

describe("the states", () => {
  test("loading shows the loading state, never the empty one", async () => {
    let answer;
    server.list = new Promise((resolve) => (answer = resolve));
    try {
      await mountPage();
      expect(document.querySelector(".q-inner-loading")).not.toBeNull();
      expect(text()).not.toContain("No notes yet");
    } finally {
      answer(json({ items: [] })); // the kit dedupes an in-flight GET: never leave one pending
      await flushPromises();
    }
    expect(text()).toContain("No notes yet");
  });

  test("empty shows the one action that fills it", async () => {
    await mountPage();
    expect(text()).toContain("No notes yet");
    expect(byText(".ui-empty button", "New note")).toBeTruthy();
  });

  test("failed shows the reason and Retry, and Retry loads again", async () => {
    server.down = true;
    await mountPage();
    expect(text()).toContain("Couldn't load your notes");
    expect(text()).toContain("disk on fire");
    server.down = false;
    server.notes = [{ id: "n1", title: "Back again", body: "", pinned: false, createdAt: "2026-10-17T10:00:00.000Z", updatedAt: "2026-10-17T10:00:00.000Z" }];
    await click(byText("button", "Retry"));
    expect(text()).toContain("Back again");
    expect(text()).not.toContain("Couldn't load your notes");
  });

  test("the list shows the notes, pinned marked", async () => {
    server.notes = [
      { id: "n1", title: "Pinned one", body: "", pinned: true, createdAt: "2026-10-17T10:00:00.000Z", updatedAt: "2026-10-17T10:00:00.000Z" },
      { id: "n2", title: "Plain one", body: "", pinned: false, createdAt: "2026-10-17T09:00:00.000Z", updatedAt: "2026-10-17T09:00:00.000Z" },
    ];
    await mountPage();
    const rows = [...document.querySelectorAll("tr.ui-table-row")].map((r) => r.textContent);
    expect(rows[0]).toContain("Pinned one");
    expect(rows[1]).toContain("Plain one");
    expect(document.querySelectorAll(".notes__pin").length).toBe(1);
  });
});

describe("the form", () => {
  const openNew = async () => {
    await click(byText("button", "New note"));
    return document.querySelector("#note-title");
  };
  const type = async (el, value) => {
    el.value = value;
    el.dispatchEvent(new Event("input"));
    await flushPromises();
  };
  const submit = async () => {
    await click(byText(".form__actions button", "Save"));
    await new Promise((r) => setTimeout(r, 0));
    await flushPromises();
  };

  test("the route's schema checks the form before anything is sent", async () => {
    await mountPage();
    await openNew();
    await submit();
    expect(text()).toContain("Required"); // kit.validation.required, from schemaRules(NoteIn)
    expect(server.calls.filter((c) => c.startsWith("POST"))).toEqual([]);
  });

  test("a valid note is saved and shows in the list", async () => {
    await mountPage();
    const title = await openNew();
    await type(title, "Groceries");
    await submit();
    expect(server.calls).toContain("POST /v1/notes");
    expect(byText("tr.ui-table-row", "Groceries")).toBeTruthy();
  });

  test("a 422 from the server lands under its field, in the app's words", async () => {
    server.refuse = () => problem422("title", "string_too_long", { max_length: 120 });
    await mountPage();
    const title = await openNew();
    await type(title, "Too long for the server");
    await submit();
    expect(text()).toContain("At most 120 characters"); // kit.validation.maxLength, from the 422's ctx
    expect(document.querySelector(".ui-modal")).not.toBeNull(); // the dialog stays open
  });
});

test("Suggest a title runs the AI feature, disabled while it runs, and fills the title", async () => {
  let answerStream;
  server.stream = new Promise((resolve) => (answerStream = resolve));
  await mountPage();
  await click(byText("button", "New note"));
  const suggest = () => byText(".form__inline button", "Suggest a title");
  expect(suggest().disabled).toBe(true); // nothing to read yet
  const body = document.querySelector("#note-body");
  body.value = "milk, eggs, bread";
  body.dispatchEvent(new Event("input"));
  await flushPromises();
  expect(suggest().disabled).toBe(false);
  await click(suggest());
  expect(suggest().disabled).toBe(true); // the trigger is disabled, not spinning, while it runs
  // its progress shows in place, under the title — and only there: the global stack leaves it out
  const strip = document.querySelector(".ui-modal .sts");
  expect(strip?.textContent).toContain("Suggesting a title");
  expect(document.querySelector(".ai-task-stack")).toBeNull();
  // the stream fails before a frame arrives → the kit's one-shot fallback answers
  answerStream(json({ title: "Internal Server Error", status: 500 }, 500));
  await flushPromises();
  await new Promise((r) => setTimeout(r, 0));
  await flushPromises();
  expect(server.runBody).toMatchObject({ action: "notes.suggestTitle", variables: { body: "milk, eggs, bread" } });
  expect(document.querySelector("#note-title").value).toBe("Weekly shopping list");
  expect(suggest().disabled).toBe(false);
  expect(document.querySelector(".ui-modal .sts")).toBeNull();
});

test("an AI task no screen shows goes to the global stack: close the dialog mid-run and it moves there", async () => {
  let answerStream;
  server.stream = new Promise((resolve) => (answerStream = resolve));
  await mountPage();
  await click(byText("button", "New note"));
  const body = document.querySelector("#note-body");
  body.value = "milk, eggs, bread";
  body.dispatchEvent(new Event("input"));
  await flushPromises();
  await click(byText(".form__inline button", "Suggest a title"));
  expect(document.querySelector(".ai-task-stack")).toBeNull();
  await click(byText(".form__actions button", "Cancel"));
  await new Promise((r) => setTimeout(r, 0));
  await flushPromises();
  // the task still runs; with its dialog gone the kit's stack shows it, with its Cancel
  const stacked = document.querySelector(".ai-task-stack .sts");
  expect(stacked?.textContent).toContain("Suggesting a title");
  expect(byText(".ai-task-stack button", "Cancel")).toBeTruthy();
  answerStream(json({ title: "Internal Server Error", status: 500 }, 500));
  await flushPromises();
  await new Promise((r) => setTimeout(r, 0));
  await flushPromises();
  expect(document.querySelector(".ai-task-stack")).toBeNull();
});

test("a delete asks first, naming the note, then removes it", async () => {
  server.notes = [{ id: "n1", title: "Old list", body: "", pinned: false, createdAt: "2026-10-17T10:00:00.000Z", updatedAt: "2026-10-17T10:00:00.000Z" }];
  await mountPage();
  await click(document.querySelector('button[aria-label="Delete “Old list”"]'));
  expect(dialogState.open).toBe(true);
  expect(dialogState.options.message).toContain("Old list");
  expect(server.calls).not.toContain("DELETE /v1/notes/n1");
  _resolveDialog(true);
  await flushPromises();
  expect(server.calls).toContain("DELETE /v1/notes/n1");
  expect(byText("tr.ui-table-row", "Old list")).toBeFalsy();
});

test("Import a file sends the file to the upload route; a refusal says why in the server's words", async () => {
  await mountPage();
  const pick = (file) => wrapper.findComponent(quasar.QFile).vm.$emit("update:modelValue", file);
  pick(new File(["Milk\nEggs"], "groceries.txt", { type: "text/plain" }));
  await flushPromises();
  expect(server.calls).toContain("POST /v1/notes/import");
  expect(text()).toContain("groceries");
  server.refuseImport = () => json({ type: "https://family-template.local/errors/not-text", title: "Not a text file", status: 415, detail: "Import a plain text file, such as .txt or .md.", requestId: "rid-415" }, 415);
  reported.length = 0;
  pick(new File([new Uint8Array([0x89, 0x50])], "photo.png", { type: "image/png" }));
  await flushPromises();
  expect(reported).toHaveLength(1);
  expect(errorMessage(reported[0])).toMatchObject({ title: "Not a text file", detail: "Import a plain text file, such as .txt or .md." });
  expect(server.notes).toHaveLength(1);
});
