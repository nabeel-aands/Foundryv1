/**
 * Start sign-in: build the authorization URL, park state + PKCE verifier in a signed
 * 10-minute cookie, and redirect to the provider. `?returnTo=` survives the round trip.
 */
import { publicBase } from "@/lib/identity/urls";
import { cookies } from "next/headers";
import { authMode } from "@/lib/identity";
import * as oidc from "@/lib/identity/oidc";
import { writeLoginState } from "@/lib/identity/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Only same-origin paths, so a crafted link cannot bounce someone off-site after login. */
function safeReturnTo(raw: string | null): string {
  // Browsers treat a backslash like a slash, so "/\\evil.com" is as off-site as "//evil.com".
  if (!raw || !raw.startsWith("/") || raw.startsWith("//") || raw.includes("\\")) return "/";
  return raw;
}

export async function GET(request: Request): Promise<Response> {
  const mode = authMode();
  if (mode !== "oidc") return Response.redirect(new URL("/", publicBase(request.url)), 302);
  // Cookies belong to a host. Start sign-in on the public address (APP_URL) or the sign-in cookie set
  // here will not come back with the provider's redirect, which always lands on APP_URL's host.
  const wantHost = process.env.APP_URL ? new URL(process.env.APP_URL).host : undefined;
  const gotHost = request.headers.get("x-forwarded-host") ?? request.headers.get("host");
  if (wantHost && gotHost && gotHost !== wantHost) {
    const u = new URL(request.url);
    return Response.redirect(`${publicBase(request.url)}${u.pathname}${u.search}`, 302);
  }
  const params = new URL(request.url).searchParams;
  const returnTo = safeReturnTo(params.get("returnTo"));
  // Only one prompt value is honoured, so a crafted link cannot pass arbitrary parameters to the provider.
  const prompt = params.get("prompt") === "select_account" ? ("select_account" as const) : undefined;
  try {
    const { url, state, codeVerifier } = await oidc.buildAuthorizationRequest({ prompt });
    writeLoginState(await cookies(), { state, codeVerifier, returnTo });
    return Response.redirect(url, 302);
  } catch (e) {
    console.error(`[auth] could not start sign-in: ${e instanceof Error ? e.message : e}`);
    return Response.redirect(new URL("/auth/denied?reason=provider", publicBase(request.url)), 302);
  }
}
