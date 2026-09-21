/**
 * Signed cookies. Two of them:
 *   foundry_session — { userRecordId, exp }, 8 hours, refreshed on activity.
 *   foundry_oidc    — { state, codeVerifier, returnTo }, 10 minutes, one login attempt.
 *
 * Both are HMAC-SHA256 over the JSON with SESSION_SECRET, HTTP-only, SameSite=Lax.
 * Nothing here trusts a cookie it did not sign, and a payload whose signature or
 * expiry does not check out is simply absent.
 */
import { createHmac, timingSafeEqual } from "node:crypto";
import type { cookies } from "next/headers";

export const SESSION_COOKIE = "foundry_session";
export const OIDC_COOKIE = "foundry_oidc";
export const SESSION_TTL_SECONDS = 8 * 60 * 60;
export const OIDC_TTL_SECONDS = 10 * 60;
/** Re-issue the cookie once it is this close to expiring, so an active session never dies mid-task. */
const REFRESH_WHEN_REMAINING_SECONDS = 7 * 60 * 60;

export type Session = { userRecordId: string; exp: number };
export type LoginState = { state?: string; codeVerifier: string; returnTo: string };

export type CookieJar = Awaited<ReturnType<typeof cookies>>;

function secret(): string {
  const s = process.env.SESSION_SECRET;
  if (!s || s.length < 16) {
    throw new Error("SESSION_SECRET is missing or too short. Set it to at least 32 random characters (openssl rand -hex 32).");
  }
  return s;
}

function b64url(buf: Buffer): string {
  return buf.toString("base64url");
}

export function sign(payload: unknown): string {
  const body = b64url(Buffer.from(JSON.stringify(payload), "utf8"));
  const mac = b64url(createHmac("sha256", secret()).update(body).digest());
  return `${body}.${mac}`;
}

export function verify<T>(token: string | undefined): T | undefined {
  if (!token) return undefined;
  const [body, mac] = token.split(".");
  if (!body || !mac) return undefined;
  const expected = b64url(createHmac("sha256", secret()).update(body).digest());
  const a = Buffer.from(mac);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return undefined;
  try {
    return JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as T;
  } catch {
    return undefined;
  }
}

const secureCookies = () => (process.env.APP_URL ?? "").startsWith("https://");

export function readSession(jar: CookieJar): Session | undefined {
  const s = verify<Session>(jar.get(SESSION_COOKIE)?.value);
  if (!s || typeof s.userRecordId !== "string" || !(s.exp > Date.now() / 1000)) return undefined;
  return s;
}

export function writeSession(jar: CookieJar, userRecordId: string): void {
  jar.set(SESSION_COOKIE, sign({ userRecordId, exp: Math.floor(Date.now() / 1000) + SESSION_TTL_SECONDS } satisfies Session), {
    httpOnly: true, sameSite: "lax", path: "/", secure: secureCookies(), maxAge: SESSION_TTL_SECONDS,
  });
}

/** Extend a session that is more than an hour old. No-op otherwise, so most requests set no cookie. */
export function refreshSession(jar: CookieJar, session: Session): void {
  const remaining = session.exp - Math.floor(Date.now() / 1000);
  if (remaining > REFRESH_WHEN_REMAINING_SECONDS) return;
  writeSession(jar, session.userRecordId);
}

export function clearSession(jar: CookieJar): void {
  jar.set(SESSION_COOKIE, "", { httpOnly: true, sameSite: "lax", path: "/", secure: secureCookies(), maxAge: 0 });
}

export function writeLoginState(jar: CookieJar, value: LoginState): void {
  jar.set(OIDC_COOKIE, sign(value), {
    httpOnly: true, sameSite: "lax", path: "/", secure: secureCookies(), maxAge: OIDC_TTL_SECONDS,
  });
}

export function readLoginState(jar: CookieJar): LoginState | undefined {
  return verify<LoginState>(jar.get(OIDC_COOKIE)?.value);
}

export function clearLoginState(jar: CookieJar): void {
  jar.set(OIDC_COOKIE, "", { httpOnly: true, sameSite: "lax", path: "/", secure: secureCookies(), maxAge: 0 });
}
