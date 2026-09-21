/**
 * Finish sign-in: exchange the code, validate the ID token, match the verified email to a
 * row in the synced Users table, and write the session cookie. That row is the session —
 * nothing from the provider beyond the email reaches the rest of the app.
 *
 * Denials are logged without the email, because the log is not the place for it.
 */
import { cookies } from "next/headers";
import { authMode, matchUser } from "@/lib/identity";
import { completeCallback, redirectUri } from "@/lib/identity/oidc";
import { clearLoginState, readLoginState, writeSession } from "@/lib/identity/session";
import { getData } from "@/lib/snapshot";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<Response> {
  if (authMode() !== "oidc") return Response.redirect(new URL("/", request.url), 302);
  const jar = await cookies();
  const login = readLoginState(jar);
  clearLoginState(jar);
  if (!login) return Response.redirect(new URL("/auth/denied?reason=expired", request.url), 302);

  try {
    // The redirect URI is the registered one, not the request's host: behind Vercel's proxy
    // request.url can carry an internal host, and openid-client compares the whole URL.
    const incoming = new URL(request.url);
    const currentUrl = new URL(redirectUri());
    currentUrl.search = incoming.search;

    const claims = await completeCallback(currentUrl, login.codeVerifier, login.state);
    const data = await getData();
    const r = matchUser(data, claims.email, claims.emailVerified);
    if (r.kind !== "user") {
      console.warn(`[auth] sign-in denied (${r.kind === "denied" ? r.reason : "anonymous"}) for subject ${claims.subject}`);
      return Response.redirect(new URL(`/auth/denied?reason=${r.kind === "denied" ? r.reason : "not-found"}`, request.url), 302);
    }
    writeSession(jar, r.user.id);
    return Response.redirect(new URL(login.returnTo, request.url), 302);
  } catch (e) {
    console.error(`[auth] callback failed: ${e instanceof Error ? e.message : e}`);
    return Response.redirect(new URL("/auth/denied?reason=provider", request.url), 302);
  }
}
