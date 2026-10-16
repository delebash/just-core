// SPDX-License-Identifier: MIT
// The kit's AI calls answered by a test instead of a model (added 2026-10-16 with JustWrite's
// browser tests): a Playwright page's POST /v1/ai/stream gets `reply(body)` as the kit's SSE frames
// ({delta}, {done}, [DONE] — server/src/llm/prompts.js), and POST /v1/ai/run its JSON — so a flow
// test drives every AI surface with no model, no GPU and a known reply. `reply` receives the
// request body ({ action, variables, … }) and returns the reply text (a string or a promise).
// Returns the request bodies, in order, for the test to check what was asked.
//
//   const asked = await stubAi(page, (body) => REPLIES[body.action] ?? "{}");

export async function stubAi(page, reply) {
  const asked = [];
  await page.route("**/v1/ai/stream", async (route) => {
    const body = route.request().postDataJSON();
    asked.push(body);
    const text = String(await reply(body));
    const frames = [`data: ${JSON.stringify({ delta: text })}`, `data: ${JSON.stringify({ done: true, model: "stub" })}`, "data: [DONE]"];
    await route.fulfill({ status: 200, contentType: "text/event-stream", body: `${frames.join("\n\n")}\n\n` });
  });
  await page.route("**/v1/ai/run", async (route) => {
    const body = route.request().postDataJSON();
    asked.push(body);
    const text = String(await reply(body));
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ content: text, model: "stub" }) });
  });
  return asked;
}
