/**
 * Who is making this request.
 *
 * Two providers behind one interface:
 *   PersonaIdentity — the demo cookie. Only on a loopback laptop with FOUNDRY_DEMO=1 and no
 *                     OIDC issuer configured. Anywhere else it refuses to exist.
 *   OidcIdentity    — the signed session cookie written by /auth/callback, whose verified
 *                     email was matched against the synced Users table.
 *
 * "open" is the third mode: no OIDC, no demo. That is today's behaviour for a laptop run
 * without FOUNDRY_DEMO — everyone is the default persona, nothing is gated. A production
 * build in that mode logs a loud warning at boot.
 */
import { isExternal } from "../scope";
import type { Data, User } from "../snapshot";
import { readSession, refreshSession, type CookieJar } from "./session";

export const PERSONA_COOKIE = "foundry_persona";

export type AuthMode = "demo" | "oidc" | "open";

export type Resolution =
  | { kind: "user"; user: User }
  | { kind: "anonymous" }
  | { kind: "denied"; reason: DenialReason };

export type DenialReason = "not-found" | "inactive" | "external" | "unverified-email";

export interface Identity {
  readonly mode: AuthMode;
  /** Never throws for an unknown caller: it returns anonymous or denied and lets the caller decide. */
  resolve(data: Data, jar: CookieJar): Promise<Resolution>;
}

function loopbackHost(): boolean {
  const h = (process.env.HOST ?? "127.0.0.1").trim();
  return h === "127.0.0.1" || h === "localhost" || h === "::1" || h === "";
}

export function oidcConfigured(): boolean {
  return !!process.env.OIDC_ISSUER?.trim();
}

export function demoAllowed(): boolean {
  return process.env.FOUNDRY_DEMO === "1" && process.env.NODE_ENV !== "production" && loopbackHost() && !oidcConfigured();
}

export function authMode(): AuthMode {
  if (oidcConfigured()) return "oidc";
  if (demoAllowed()) return "demo";
  return "open";
}

/**
 * Boot-time guard. Called from instrumentation.ts so a misconfiguration is a startup
 * failure with a readable message rather than a surprise on the first request.
 */
export function assertAuthConfig(): void {
  if (process.env.FOUNDRY_DEMO === "1" && oidcConfigured()) {
    throw new Error(
      "FOUNDRY_DEMO=1 and OIDC_ISSUER are both set. Demo mode lets anyone become any user, so it cannot run beside real sign-in. Unset FOUNDRY_DEMO for a deployment, or unset OIDC_ISSUER for a demo laptop.",
    );
  }
  // The rest are warnings, not failures: demoAllowed() has already turned the switcher off in
  // each of these cases, and `npm run build` on a laptop with a demo .env must still work.
  if (process.env.FOUNDRY_DEMO === "1" && !demoAllowed()) {
    const why = process.env.NODE_ENV === "production" ? "this is a production build" : `HOST=${process.env.HOST} is not loopback`;
    console.warn(`[foundry] FOUNDRY_DEMO=1 ignored: ${why}. The persona switcher is off.`);
  }
  if (authMode() === "open" && process.env.NODE_ENV === "production") {
    console.warn("[foundry] No OIDC_ISSUER: every visitor is the same default user. Set OIDC_ISSUER before letting anyone else reach this instance.");
  }
  if (authMode() === "oidc") {
    for (const name of ["OIDC_CLIENT_ID", "APP_URL", "SESSION_SECRET"]) {
      if (!process.env[name]?.trim()) throw new Error(`OIDC_ISSUER is set, so ${name} is required too. See .env.example.`);
    }
  }
}

/* -------------------------------------------------------------- matching */

/** The verified email is the only thing we carry over from the provider; the Users row is the session. */
export function matchUser(data: Data, email: string | undefined, emailVerified: boolean | undefined): Resolution {
  if (emailVerified === false) return { kind: "denied", reason: "unverified-email" };
  const key = (email ?? "").trim().toLowerCase();
  const user = key ? data.userByEmail.get(key) : undefined;
  if (!user) return { kind: "denied", reason: "not-found" };
  if ((user.status ?? "").toLowerCase() !== "active") return { kind: "denied", reason: "inactive" };
  // isExternal() also counts an outside email domain, which is what "external" means for scope.
  if (isExternal(user) && process.env.AUTH_ALLOW_EXTERNAL !== "1") return { kind: "denied", reason: "external" };
  return { kind: "user", user };
}

export const DENIAL_TEXT: Record<DenialReason, string> = {
  "not-found": "Your account is not in this organisation's Airtable Users table yet. Ask an Airtable admin to add you; Foundry picks it up at the next sync.",
  inactive: "Your Airtable account is not active, so Foundry has nothing to show you. Ask an Airtable admin to reactivate it.",
  external: "External accounts cannot sign in to Foundry here. Ask an admin if you need access.",
  "unverified-email": "Your identity provider reports this email address as unverified, so it cannot be matched to an Airtable user.",
};

/* ------------------------------------------------------------- providers */

class PersonaIdentity implements Identity {
  readonly mode = "demo" as const;

  async resolve(data: Data, jar: CookieJar): Promise<Resolution> {
    const id = jar.get(PERSONA_COOKIE)?.value;
    const user = id ? data.userById.get(id) : undefined;
    return user ? { kind: "user", user } : { kind: "anonymous" };
  }
}

/** No sign-in at all: the laptop default before demo mode is switched on. */
class OpenIdentity implements Identity {
  readonly mode = "open" as const;

  async resolve(): Promise<Resolution> {
    return { kind: "anonymous" };
  }
}

class OidcIdentity implements Identity {
  readonly mode = "oidc" as const;

  async resolve(data: Data, jar: CookieJar): Promise<Resolution> {
    const session = readSession(jar);
    if (!session) return { kind: "anonymous" };
    const user = data.userById.get(session.userRecordId);
    // The row can vanish or be deactivated between sign-in and now; re-check every request.
    if (!user) return { kind: "denied", reason: "not-found" };
    if ((user.status ?? "").toLowerCase() !== "active") return { kind: "denied", reason: "inactive" };
    try {
      refreshSession(jar, session);
    } catch {
      // Server Components cannot set cookies; the next route handler or action refreshes it.
    }
    return { kind: "user", user };
  }
}

const g = globalThis as unknown as { __foundryIdentity?: Identity };

export function getIdentity(): Identity {
  if (g.__foundryIdentity) return g.__foundryIdentity;
  assertAuthConfig();
  const mode = authMode();
  return (g.__foundryIdentity = mode === "oidc" ? new OidcIdentity() : mode === "demo" ? new PersonaIdentity() : new OpenIdentity());
}
