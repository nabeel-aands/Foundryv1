/**
 * Shared guard for the cron job routes. Vercel Cron sends `Authorization: Bearer $CRON_SECRET`
 * automatically for paths listed in vercel.json; the same header works from curl.
 */
import { timingSafeEqual } from "node:crypto";

export function cronSecret(): string | undefined {
  return process.env.CRON_SECRET?.trim() || undefined;
}

export function isAuthorizedJobRequest(request: Request): boolean {
  const secret = cronSecret();
  if (!secret) return false;
  const header = request.headers.get("authorization") ?? "";
  const a = Buffer.from(header);
  const b = Buffer.from(`Bearer ${secret}`);
  return a.length === b.length && timingSafeEqual(a, b);
}

export function unauthorized(): Response {
  const why = cronSecret()
    ? "Missing or wrong Authorization: Bearer $CRON_SECRET header."
    : "CRON_SECRET is not set on this deployment, so job routes are closed.";
  return Response.json({ ok: false, error: why }, { status: 401 });
}
