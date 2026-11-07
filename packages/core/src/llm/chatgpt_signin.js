// SPDX-License-Identifier: MIT
// "Sign in with ChatGPT" — the person's own ChatGPT plan (Plus or Pro) on the OpenAI provider instead of an API key
// (the user's go, 2026-11-07). OpenAI's own way for open-source, locally run apps: the browser signs in at OpenAI, the
// app gets an access token, and the normal OpenAI API takes it in place of a key; the use counts against the plan, and
// the person can cap the app at 10-100 % of their weekly use in ChatGPT's settings.
//
// Standard: OpenID Connect with `openid-client` (MIT, github.com/panva/openid-client) against OpenAI's discovery
// document, written from OpenAI's public docs (developers.openai.com/siwc/token-sharing-open-source — sign-in,
// token-reference, profiles-and-sessions, read 2026-11-06/07). OpenAI's own sample code is under a noncommercial
// licence and is not used. The flow: a listener on 127.0.0.1 (any port; the path must be `/auth/callback`, never
// `localhost`), PKCE S256, `state` and `nonce`; a first sign-in registers with `client_id=dynamic_agent_client` and
// the issued client id comes back in the callback; later sign-ins reuse it with this host's `ext_agent_host_id`. The
// code exchange and every refresh carry `resource=https://api.openai.com/v1`; access tokens last an hour, refresh
// tokens 30 days and rotate. Sign-out revokes the refresh token. The tokens live in `provider_signins` (signins.js).
//
// Desktop only: the browser that signs in must be on the machine the server runs on.

import { randomUUID } from "node:crypto";
import { createServer } from "node:http";
import * as oidc from "openid-client";
import * as http from "../platform/http.js";
import { getLogger } from "../platform/log.js";
import { errText } from "../platform/py.js";
import { clearTokens, getSignin, isSignedIn, saveSignin } from "./signins.js";

const log = getLogger("llm_runner.llm.chatgpt_signin");

export const METHOD = "chatgpt";
// OpenAI's protocol values (the sign-in page), not settings.
export const ISSUER = "https://auth.openai.com";
export const RESOURCE = "https://api.openai.com/v1";
export const SCOPE = "openid profile email offline_access resource.invoke chatgpt.tokens.use.direct";
export const PLAN_SCOPE = "chatgpt.tokens.use.direct";
export const REGISTER_CLIENT_ID = "dynamic_agent_client";
export const CALLBACK_PATH = "/auth/callback";
const WAIT_MS = 10 * 60 * 1000; // how long a started sign-in waits for the browser
const REFRESH_AHEAD_MS = 2 * 60 * 1000; // refresh this close to the access token's expiry

const kitFetch = (url, options) => http.fetch(url, options);

let serverMeta = null;
/** OpenAI's discovery document, fetched once. */
async function serverMetadata() {
  serverMeta ??= oidc
    .discovery(new URL(ISSUER), REGISTER_CLIENT_ID, undefined, oidc.None(), { [oidc.customFetch]: kitFetch })
    .then((c) => c.serverMetadata())
    .catch((e) => {
      serverMeta = null;
      throw e;
    });
  return serverMeta;
}

/** A client configuration for `clientId` (a public client: no secret), ID tokens checked against OpenAI's keys. */
async function configFor(clientId) {
  const config = new oidc.Configuration(await serverMetadata(), clientId, undefined, oidc.None());
  config[oidc.customFetch] = kitFetch;
  oidc.enableNonRepudiationChecks(config);
  return config;
}

const pending = new Map(); // providerId → {status: "waiting"|"done"|"error", error, close()}

/** Where a started sign-in stands → `{status, error}`; "none" when nothing was started this session. */
export function signinProgress(providerId) {
  const p = pending.get(providerId);
  return p ? { status: p.status, error: p.error ?? null } : { status: "none", error: null };
}

/** The page the browser shows after the callback. */
function page(title, text) {
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
  return `<!doctype html><meta charset="utf-8"><title>${esc(title)}</title><body style="font:16px system-ui;max-width:36rem;margin:15vh auto;padding:0 16px"><h1 style="font-size:1.3rem">${esc(title)}</h1><p>${esc(text)}</p></body>`;
}

/**
 * Start a sign-in for `providerId` → `{authorizeUrl}` for the person's browser. A listener waits on 127.0.0.1 for
 * OpenAI's redirect, exchanges the code, checks the account and the plan scope, and saves the tokens. `appName` names
 * the app on OpenAI's consent page on a first sign-in.
 */
export async function startSignin(providerId, { appName = "" } = {}) {
  pending.get(providerId)?.close();
  const meta = await serverMetadata();
  const row = getSignin(providerId);
  const registering = !row?.client_id;
  const clientId = row?.client_id || REGISTER_CLIENT_ID;
  const hostId = row?.host_id || randomUUID();
  const verifier = oidc.randomPKCECodeVerifier();
  const challenge = await oidc.calculatePKCECodeChallenge(verifier);
  const state = oidc.randomState();
  const nonce = oidc.randomNonce();

  const server = createServer();
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const redirectUri = `http://127.0.0.1:${server.address().port}${CALLBACK_PATH}`;
  const entry = { status: "waiting", error: null, close: () => {} };
  const timer = setTimeout(() => finish("error", "The sign-in wasn't finished in the browser in time. Start it again."), WAIT_MS);
  function finish(status, error = null) {
    entry.status = status;
    entry.error = error;
    clearTimeout(timer);
    server.close();
    server.closeAllConnections?.();
  }
  entry.close = () => finish("error", "A newer sign-in replaced this one.");
  pending.set(providerId, entry);

  server.on("request", async (req, res) => {
    const url = new URL(req.url ?? "/", redirectUri);
    if (url.pathname !== CALLBACK_PATH || entry.status !== "waiting") {
      res.writeHead(404).end();
      return;
    }
    const reply = (code, title, text) => res.writeHead(code, { "content-type": "text/html; charset=utf-8" }).end(page(title, text));
    try {
      if (url.searchParams.get("state") !== state) throw new Error("The sign-in answer didn't match this sign-in (state). Start it again.");
      const err = url.searchParams.get("error");
      if (err) throw new Error(err === "access_denied" ? "The sign-in was cancelled." : `OpenAI said: ${url.searchParams.get("error_description") || err}`);
      const issued = url.searchParams.get("client_id");
      if (registering && !issued) throw new Error("OpenAI didn't finish registering the app (no client id came back). Start the sign-in again.");
      if (!registering && issued && issued !== clientId) throw new Error("OpenAI answered for a different app registration. Start the sign-in again.");
      const exchangeId = issued || clientId;
      const config = await configFor(exchangeId);
      const tokens = await oidc.authorizationCodeGrant(
        config,
        url,
        { pkceCodeVerifier: verifier, expectedState: state, expectedNonce: nonce, idTokenExpected: true },
        { resource: RESOURCE },
      );
      const claims = tokens.claims() ?? {};
      const scopes = String(tokens.scope ?? "");
      if (!scopes.split(/\s+/).includes(PLAN_SCOPE)) {
        throw new Error("This ChatGPT account didn't allow plan use for apps (it needs a Plus or Pro plan).");
      }
      if (row?.subject && claims.sub && row.subject !== claims.sub) {
        throw new Error("That's a different ChatGPT account from the one this provider was signed in with. Sign out first to switch accounts.");
      }
      saveSignin(providerId, {
        method: METHOD,
        client_id: exchangeId,
        host_id: hostId,
        email: String(claims.email ?? ""),
        subject: String(claims.sub ?? ""),
        id_token: String(tokens.id_token ?? ""),
        access_token: String(tokens.access_token ?? ""),
        refresh_token: String(tokens.refresh_token ?? ""),
        expires_at: Date.now() + (Number(tokens.expires_in) || 3600) * 1000,
        scopes,
      });
      reply(200, "Signed in to ChatGPT", "You can close this tab and go back to the app.");
      finish("done");
    } catch (e) {
      const text = e instanceof oidc.ResponseBodyError && e.error === "invalid_grant" ? "The sign-in code expired. Start the sign-in again." : errText(e);
      log.warning(`ChatGPT sign-in for ${providerId} failed: ${text}`);
      reply(400, "Sign-in didn't finish", text);
      finish("error", text);
    }
  });

  const params = {
    response_type: "code",
    redirect_uri: redirectUri,
    scope: SCOPE,
    resource: RESOURCE,
    state,
    nonce,
    code_challenge: challenge,
    code_challenge_method: "S256",
    ext_agent_host_id: hostId,
  };
  if (registering && appName) params.agent_name_hint = appName;
  if (!registering && row?.id_token) params.id_token_hint = row.id_token;
  const config = new oidc.Configuration(meta, clientId, undefined, oidc.None());
  return { authorizeUrl: oidc.buildAuthorizationUrl(config, params).href };
}

const refreshing = new Map(); // providerId → the refresh in flight (OpenAI: serialize refreshes of one session)

/**
 * The provider's current ChatGPT access token, refreshed near expiry. Throws when it isn't signed in or the refresh
 * token was refused (the tokens are then cleared: the person signs in again).
 */
export async function chatgptAccessToken(providerId) {
  const row = getSignin(providerId);
  if (!isSignedIn(row)) throw new Error("This provider isn't signed in to ChatGPT.");
  if (row.access_token && row.expires_at - Date.now() > REFRESH_AHEAD_MS) return row.access_token;
  if (!refreshing.has(providerId)) {
    refreshing.set(
      providerId,
      refresh(providerId, row).finally(() => refreshing.delete(providerId)),
    );
  }
  return refreshing.get(providerId);
}

async function refresh(providerId, row) {
  let tokens;
  try {
    tokens = await oidc.refreshTokenGrant(await configFor(row.client_id), row.refresh_token, { resource: RESOURCE });
  } catch (e) {
    if (e instanceof oidc.ResponseBodyError && e.error === "invalid_grant") {
      clearTokens(providerId);
      throw new Error("The ChatGPT sign-in has expired. Sign in with ChatGPT again in AI Settings.");
    }
    throw e;
  }
  saveSignin(providerId, {
    access_token: String(tokens.access_token ?? ""),
    refresh_token: String(tokens.refresh_token ?? row.refresh_token),
    expires_at: Date.now() + (Number(tokens.expires_in) || 3600) * 1000,
    scopes: String(tokens.scope ?? row.scopes),
    ...(tokens.id_token ? { id_token: String(tokens.id_token) } : {}),
  });
  return String(tokens.access_token ?? "");
}

/** Sign out: revoke the refresh token at OpenAI (best effort — a failure is logged) and clear the tokens here. */
export async function signOut(providerId) {
  pending.get(providerId)?.close();
  pending.delete(providerId);
  const row = getSignin(providerId);
  if (isSignedIn(row)) {
    try {
      await oidc.tokenRevocation(await configFor(row.client_id), row.refresh_token, { token_type_hint: "refresh_token" });
    } catch (e) {
      log.warning(`ChatGPT sign-out for ${providerId}: revoking at OpenAI failed (${errText(e)}); cleared here anyway`);
    }
  }
  clearTokens(providerId);
}
