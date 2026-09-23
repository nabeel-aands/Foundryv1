/**
 * Sign in with Airtable: OAuth 2.0 Authorization Code with PKCE against airtable.com,
 * then one call to /v0/meta/whoami for the signer's Airtable user ID.
 *
 * Foundry wants the token for that one call and nothing else, so neither the access token
 * nor the refresh token is ever stored: they live in locals inside completeCallback() and
 * go with it. Identity comes from Airtable; authorisation stays in the Users table, which
 * src/lib/identity/index.ts checks by the `usr…` ID.
 *
 * No SDK: this is four parameters, one form POST and one GET, and openid-client does not
 * speak to a provider that publishes no discovery document.
 */
import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { redirectUri } from "./urls";

const AUTHORIZE_URL = "https://airtable.com/oauth2/v1/authorize";
const TOKEN_URL = "https://airtable.com/oauth2/v1/token";
const WHOAMI_URL = "https://api.airtable.com/v0/meta/whoami";

/** The only scope Foundry asks for. Without it whoami returns the id but no email. */
export const AIRTABLE_SCOPE = "user.email:read";

export type AuthorizationRequest = { url: string; state: string; codeVerifier: string };
export type AirtableClaims = { airtableUserId: string; email?: string };
/** Narrower than `typeof fetch` on purpose: it is the surface this file uses, and a test can hand it one. */
export type FetchLike = (input: string | URL, init?: RequestInit) => Promise<Response>;

function b64url(buf: Buffer): string {
  return buf.toString("base64url");
}

function credentials(): { clientId: string; clientSecret?: string } {
  const clientId = process.env.AIRTABLE_OAUTH_CLIENT_ID?.trim();
  if (!clientId) throw new Error("AIRTABLE_OAUTH_CLIENT_ID is required in Airtable mode. See .env.example.");
  return { clientId, clientSecret: process.env.AIRTABLE_OAUTH_CLIENT_SECRET?.trim() || undefined };
}

/**
 * Where to send the browser, plus the two values that must survive the round trip in the
 * signed login cookie. Airtable requires PKCE and `state`; both are generated here.
 */
export function buildAuthorizationRequest(): AuthorizationRequest {
  const { clientId } = credentials();
  // 64 random bytes is 86 base64url characters, inside the 43–128 the spec allows.
  const codeVerifier = b64url(randomBytes(64));
  const state = b64url(randomBytes(32));
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri(),
    response_type: "code",
    scope: AIRTABLE_SCOPE,
    state,
    code_challenge: b64url(createHash("sha256").update(codeVerifier).digest()),
    code_challenge_method: "S256",
  });
  return { url: `${AUTHORIZE_URL}?${params.toString()}`, state, codeVerifier };
}

function sameString(a: string, b: string): boolean {
  const x = Buffer.from(a, "utf8");
  const y = Buffer.from(b, "utf8");
  return x.length === y.length && timingSafeEqual(x, y);
}

/** Error bodies reach the log, so keep them short. */
function snippet(s: string): string {
  const one = s.replace(/\s+/g, " ").trim();
  return one.length > 200 ? `${one.slice(0, 200)}…` : one;
}

/**
 * Validate the callback, exchange the code, ask Airtable who signed in, and hand back only
 * the ID and the email. `fetch` is injectable so the tests run without a network.
 */
export async function completeCallback(
  currentUrl: URL,
  codeVerifier: string,
  expectedState: string | undefined,
  deps: { fetch?: FetchLike } = {},
): Promise<AirtableClaims> {
  const doFetch = deps.fetch ?? fetch;
  const params = currentUrl.searchParams;

  const failure = params.get("error");
  if (failure) {
    const detail = params.get("error_description");
    throw new Error(`Airtable refused the authorization request: ${failure}${detail ? ` (${snippet(detail)})` : ""}`);
  }
  // A callback whose state is missing, stale or altered is not the sign-in this browser started.
  if (!expectedState || !sameString(params.get("state") ?? "", expectedState)) {
    throw new Error("state mismatch: this callback does not belong to the sign-in that started in this browser.");
  }
  const code = params.get("code");
  if (!code) throw new Error("Airtable returned no authorization code.");

  const { clientId, clientSecret } = credentials();
  const body = new URLSearchParams({
    grant_type: "authorization_code",
    code,
    redirect_uri: redirectUri(),
    code_verifier: codeVerifier,
  });
  const headers: Record<string, string> = { "content-type": "application/x-www-form-urlencoded" };
  // A confidential integration authenticates with HTTP Basic; a public one names itself in the body.
  if (clientSecret) headers.authorization = `Basic ${Buffer.from(`${clientId}:${clientSecret}`, "utf8").toString("base64")}`;
  else body.set("client_id", clientId);

  const token = await doFetch(TOKEN_URL, { method: "POST", headers, body: body.toString() });
  if (!token.ok) {
    throw new Error(`Airtable token exchange failed (${token.status}): ${snippet(await token.text().catch(() => ""))}`);
  }
  const granted = (await token.json()) as { access_token?: string };
  if (!granted?.access_token) throw new Error("Airtable's token response carried no access token.");

  const who = await doFetch(WHOAMI_URL, { headers: { authorization: `Bearer ${granted.access_token}` } });
  if (!who.ok) throw new Error(`Airtable whoami failed (${who.status}): ${snippet(await who.text().catch(() => ""))}`);
  const me = (await who.json()) as { id?: string; email?: string };
  if (!me?.id) throw new Error("Airtable's whoami returned no user id.");

  // Both tokens fall out of scope here. Nothing writes them anywhere.
  return { airtableUserId: me.id, email: typeof me.email === "string" ? me.email : undefined };
}

/**
 * Airtable has no end-session endpoint, so signing out of Foundry is local: the session
 * cookie goes and the Airtable session stays. Shaped like oidc.endSessionUrl() on purpose.
 */
export function logoutUrl(): string | undefined {
  return undefined;
}
