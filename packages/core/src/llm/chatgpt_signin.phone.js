// SPDX-License-Identifier: MIT
// The phone's twin of chatgpt_signin.js (package.json "imports" `#llm/chatgpt_signin`, the "browser" condition — the
// phone's worker bundle): Sign in with ChatGPT needs a browser on the machine the server runs on and a listener there
// for OpenAI's answer, and the phone's in-app server has neither (docs/plans/2026-10-08-the-phone.md). Signing out
// still clears the tokens here.
import { clearTokens } from "./signins.js";

const DESKTOP_ONLY = "Sign in with ChatGPT works in the desktop app — sign in there.";

export const METHOD = "chatgpt";

export function signinProgress() {
  return { status: "none", error: null };
}

export async function startSignin() {
  throw new Error(DESKTOP_ONLY);
}

export async function chatgptAccessToken() {
  throw new Error(DESKTOP_ONLY);
}

export async function signOut(providerId) {
  clearTokens(providerId);
}
