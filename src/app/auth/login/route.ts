/**
 * Start sign-in: build the authorization URL, park state + PKCE verifier in a signed
 * 10-minute cookie, and redirect to the provider. `?returnTo=` survives the round trip.
 */
import { cookies } from "next/headers";
import { authMode } from "@/lib/identity";
import { buildAuthorizationRequest } from "@/lib/identity/oidc";
import { writeLoginState } from "@/lib/identity/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Only same-origin paths, so a crafted link cannot bounce someone off-site after login. */
function safeReturnTo(raw: string | null): string {
  if (!raw || !raw.startsWith("/") || raw.startsWith("//")) return "/";
  return raw;
}

export async function GET(request: Request): Promise<Response> {
  if (authMode() !== "oidc") return Response.redirect(new URL("/", request.url), 302);
  const returnTo = safeReturnTo(new URL(request.url).searchParams.get("returnTo"));
  try {
    const { url, state, codeVerifier } = await buildAuthorizationRequest();
    writeLoginState(await cookies(), { state, codeVerifier, returnTo });
    return Response.redirect(url, 302);
  } catch (e) {
    console.error(`[auth] could not start sign-in: ${e instanceof Error ? e.message : e}`);
    return Response.redirect(new URL("/auth/denied?reason=provider", request.url), 302);
  }
}
