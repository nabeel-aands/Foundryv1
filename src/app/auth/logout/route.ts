/** Clear the session, then hand off to the provider's end-session endpoint when it has one. */
import { cookies } from "next/headers";
import { authMode } from "@/lib/identity";
import { endSessionUrl } from "@/lib/identity/oidc";
import { clearLoginState, clearSession } from "@/lib/identity/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function signOut(request: Request): Promise<Response> {
  const jar = await cookies();
  clearSession(jar);
  clearLoginState(jar);
  if (authMode() !== "oidc") return Response.redirect(new URL("/", request.url), 302);
  const provider = await endSessionUrl().catch(() => undefined);
  return Response.redirect(provider ?? new URL("/", request.url).href, 302);
}

export const GET = signOut;
export const POST = signOut;
