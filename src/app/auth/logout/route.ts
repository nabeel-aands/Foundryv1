/** Clear the session, then hand off to the provider's end-session endpoint when it has one. */
import { publicBase } from "@/lib/identity/urls";
import { cookies } from "next/headers";
import { authMode } from "@/lib/identity";
import * as oidc from "@/lib/identity/oidc";
import { clearLoginState, clearSession } from "@/lib/identity/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function signOut(request: Request): Promise<Response> {
  const mode = authMode();
  const jar = await cookies();
  clearSession(jar);
  clearLoginState(jar);
  // Land on a signed-out page, not Home: Home would send the person straight back to a provider they are still signed in to.
  const home = new URL("/auth/signed-out", publicBase(request.url)).href;
  if (mode !== "oidc") return Response.redirect(home, 302);
  const provider = await oidc.endSessionUrl().catch(() => undefined);
  return Response.redirect(provider ?? home, 302);
}

export const GET = signOut;
export const POST = signOut;
