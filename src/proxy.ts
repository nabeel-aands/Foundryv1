/**
 * The authentication gate, in front of everything.
 *
 * In OIDC mode an unauthenticated request is redirected to /auth/login with the path it
 * wanted; API routes get a 401 JSON instead of a redirect a fetch() cannot follow usefully.
 * Open and demo mode let everything through, exactly as v1 did.
 *
 * This runs before the app, so it re-implements the session check rather than importing
 * lib/identity — it verifies the cookie's HMAC and expiry and nothing else. Whether that
 * user is still active, and who they are, is decided per request by lib/identity.
 */
import { createHmac, timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

/** Reachable without a session: health checks, cron, Airtable's webhook, and sign-in itself. */
const PUBLIC_PREFIXES = ["/auth/", "/api/health", "/api/jobs/", "/api/webhooks/"];

function sessionValid(token: string | undefined, secret: string): boolean {
  if (!token) return false;
  const [body, mac] = token.split(".");
  if (!body || !mac) return false;
  const expected = createHmac("sha256", secret).update(body).digest("base64url");
  const a = Buffer.from(mac);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return false;
  try {
    const { exp } = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as { exp?: number };
    return typeof exp === "number" && exp > Date.now() / 1000;
  } catch {
    return false;
  }
}

export function proxy(request: NextRequest): NextResponse {
  if (!process.env.OIDC_ISSUER?.trim()) return NextResponse.next();

  const { pathname, search } = request.nextUrl;
  if (PUBLIC_PREFIXES.some((p) => pathname === p.replace(/\/$/, "") || pathname.startsWith(p))) return NextResponse.next();

  const secret = process.env.SESSION_SECRET ?? "";
  if (secret && sessionValid(request.cookies.get("foundry_session")?.value, secret)) return NextResponse.next();

  if (pathname.startsWith("/api/")) {
    return NextResponse.json({ ok: false, error: "not signed in" }, { status: 401 });
  }
  const login = new URL("/auth/login", request.url);
  login.searchParams.set("returnTo", `${pathname}${search}`);
  return NextResponse.redirect(login);
}

export const config = {
  // Everything except Next's own static output and the favicon.
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
