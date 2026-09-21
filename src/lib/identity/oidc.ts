/**
 * OpenID Connect provider glue: Authorization Code with PKCE, via openid-client v6.
 * Discovery happens once per process and is cached on globalThis so a warm Vercel
 * invocation does not re-fetch the provider's metadata document.
 */
import type * as clientNs from "openid-client";

export type OidcConfig = Awaited<ReturnType<typeof clientNs.discovery>>;

export function appUrl(): string {
  const v = process.env.APP_URL?.trim();
  if (!v) throw new Error("APP_URL is required in OIDC mode (for example https://foundry.example.com). It builds the redirect URI.");
  return v.replace(/\/+$/, "");
}

export function redirectUri(): string {
  return `${appUrl()}/auth/callback`;
}

export function oidcScope(): string {
  return process.env.OIDC_SCOPE?.trim() || "openid email profile";
}

async function lib(): Promise<typeof clientNs> {
  return import("openid-client");
}

export async function oidcConfig(): Promise<OidcConfig> {
  const g = globalThis as unknown as { __foundryOidc?: Promise<OidcConfig> };
  g.__foundryOidc ??= (async () => {
    const client = await lib();
    const issuer = process.env.OIDC_ISSUER?.trim();
    const clientId = process.env.OIDC_CLIENT_ID?.trim();
    const clientSecret = process.env.OIDC_CLIENT_SECRET?.trim();
    if (!issuer || !clientId) throw new Error("OIDC_ISSUER and OIDC_CLIENT_ID are required in OIDC mode.");
    return client.discovery(new URL(issuer), clientId, clientSecret);
  })().catch((e) => {
    // A failed discovery must not be cached: the provider may just have been slow.
    g.__foundryOidc = undefined;
    throw e;
  });
  return g.__foundryOidc;
}

export type AuthorizationRequest = { url: string; state?: string; codeVerifier: string };

export async function buildAuthorizationRequest(): Promise<AuthorizationRequest> {
  const client = await lib();
  const config = await oidcConfig();
  const codeVerifier = client.randomPKCECodeVerifier();
  const codeChallenge = await client.calculatePKCECodeChallenge(codeVerifier);

  const parameters: Record<string, string> = {
    redirect_uri: redirectUri(),
    scope: oidcScope(),
    code_challenge: codeChallenge,
    code_challenge_method: "S256",
  };
  // PKCE alone is enough where the provider advertises it; otherwise state carries the CSRF binding.
  const state = config.serverMetadata().supportsPKCE() ? undefined : client.randomState();
  if (state) parameters.state = state;
  return { url: client.buildAuthorizationUrl(config, parameters).href, state, codeVerifier };
}

export type CallbackClaims = { email?: string; emailVerified?: boolean; subject: string; idToken?: string };

/** Exchange the code, validate the ID token, and hand back only what Foundry uses. */
export async function completeCallback(currentUrl: URL, codeVerifier: string, expectedState: string | undefined): Promise<CallbackClaims> {
  const client = await lib();
  const config = await oidcConfig();
  const tokens = await client.authorizationCodeGrant(config, currentUrl, {
    pkceCodeVerifier: codeVerifier,
    expectedState: expectedState ?? client.skipStateCheck,
  });
  const claims = tokens.claims();
  if (!claims) throw new Error("The provider returned no ID token.");
  const verified = claims.email_verified;
  return {
    email: typeof claims.email === "string" ? claims.email : undefined,
    // Some providers send the claim as the string "true"; absent means "unknown", not "false".
    emailVerified: verified === undefined ? undefined : verified === true || verified === "true",
    subject: claims.sub,
    idToken: tokens.id_token,
  };
}

/** The provider's RP-initiated logout URL, when it advertises one. */
export async function endSessionUrl(idTokenHint?: string): Promise<string | undefined> {
  const client = await lib();
  const config = await oidcConfig();
  if (!config.serverMetadata().end_session_endpoint) return undefined;
  return client.buildEndSessionUrl(config, {
    post_logout_redirect_uri: appUrl(),
    ...(idTokenHint ? { id_token_hint: idTokenHint } : {}),
  }).href;
}
