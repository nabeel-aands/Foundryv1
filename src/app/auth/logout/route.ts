/** Clear the session, then hand off to the provider's end-session endpoint when it has one. */
import { cookies } from "next/headers";
import { authMode } from "@/lib/identity";
import * as airtable from "@/lib/identity/airtable";
import * as oidc from "@/lib/identity/oidc";
import { clearLoginState, clearSession } from "@/lib/identity/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function signOut(request: Request): Promise<Response> {
  const mode = authMode();
  const jar = await cookies();
  clearSession(jar);
  clearLoginState(jar);
  const home = new URL("/", request.url).href;
  // Airtable has no end-session endpoint, so signing out here is local and lands back on Home.
  if (mode === "airtable") return Response.redirect(airtable.logoutUrl() ?? home, 302);
  if (mode !== "oidc") return Response.redirect(home, 302);
  const provider = await oidc.endSessionUrl().catch(() => undefined);
  return Response.redirect(provider ?? home, 302);
}

export const GET = signOut;
export const POST = signOut;
