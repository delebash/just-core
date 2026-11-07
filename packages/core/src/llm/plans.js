// SPDX-License-Identifier: MIT
// Which of the person's own plans a provider draws on, and how much of it is used — for a screen that would otherwise
// show a price (JustVoice's book-run question, the provider's card). A plan route is still a cloud route: the text
// leaves the computer; what changes is that nothing is billed per call.
//   "claude"  — the person's installed Claude Code (claude_code.js); the use is the share of the plan's current window
//               (a week) its last call reported — unknown before a first call this session
//   "chatgpt" — an OpenAI provider signed in with ChatGPT (chatgpt_signin.js); OpenAI reports no share

import { claudePlanUse } from "./claude_code.js";
import { getSignin, isSignedIn } from "./signins.js";

/** `cfg`: a provider config ({id, providerType}) → `{plan, used, window, resetsAt}` or null when it bills per call.
 *  `used` is 0..1 or null (not known). */
export function providerPlan(cfg) {
  if (!cfg) return null;
  if (cfg.providerType === "claude-code") {
    const u = claudePlanUse(cfg.id);
    return { plan: "claude", used: u?.used ?? null, window: u?.window ?? null, resetsAt: u?.resetsAt ?? null };
  }
  if (cfg.providerType === "openai" && isSignedIn(getSignin(cfg.id))) return { plan: "chatgpt", used: null, window: null, resetsAt: null };
  return null;
}
