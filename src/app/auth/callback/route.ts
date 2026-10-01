/**
 * Finish sign-in: exchange the code, find out who signed in, match them to a row in the
 * synced Users table, and write the session cookie. That row is the session — nothing from
 * the provider beyond the identifier and the email reaches the rest of the app.
 *
 * OIDC matches on the verified email; Airtable matches on the `usr…` ID it returns, which
 * is what the Users table's User ID column holds. Denials are logged without the email,
 * because the log is not the place for it.
 */
import { cookies } from "next/headers";
import { authMode, matchUser, matchUserById, type Resolution } from "@/lib/identity";
import * as airtable from "@/lib/identity/airtable";
import * as oidc from "@/lib/identity/oidc";
import { clearLoginState, readLoginState, writeSession } from "@/lib/identity/session";
import { redirectUri } from "@/lib/identity/urls";
import { getData } from "@/lib/snapshot";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<Response> {
  const mode = authMode();
  if (mode !== "oidc" && mode !== "airtable") return Response.redirect(new URL("/", request.url), 302);
  const jar = await cookies();
  const login = readLoginState(jar);
  clearLoginState(jar);
  if (!login) return Response.redirect(new URL("/auth/denied?reason=expired", request.url), 302);

  try {
    // The redirect URI is the registered one, not the request's host: behind Vercel's proxy
    // request.url can carry an internal host, and both providers compare the whole URL.
    const incoming = new URL(request.url);
    const currentUrl = new URL(redirectUri());
    currentUrl.search = incoming.search;

    let subject: string;
    let r: Resolution;
    if (mode === "airtable") {
      const claims = await airtable.completeCallback(currentUrl, login.codeVerifier, login.state);
      subject = claims.airtableUserId;
      r = matchUserById(await getData(), claims.airtableUserId, claims.email);
    } else {
      const claims = await oidc.completeCallback(currentUrl, login.codeVerifier, login.state);
      subject = claims.subject;
      r = matchUser(await getData(), claims.email, claims.emailVerified);
    }

    if (r.kind !== "user") {
      console.warn(`[auth] sign-in denied (${r.kind === "denied" ? r.reason : "anonymous"}) for subject ${subject}`);
      return Response.redirect(new URL(`/auth/denied?reason=${r.kind === "denied" ? r.reason : "not-found"}`, request.url), 302);
    }
    writeSession(jar, r.user.id);
    return Response.redirect(new URL(login.returnTo, request.url), 302);
  } catch (e) {
    console.error(`[auth] callback failed: ${e instanceof Error ? e.message : e}`);
    return Response.redirect(new URL("/auth/denied?reason=provider", request.url), 302);
  }
}
