/**
 * Drain pending Airtable webhook payloads, on Vercel Cron (every minute) or by hand:
 *   curl -H "Authorization: Bearer $CRON_SECRET" https://host/api/jobs/drain
 * Takes the shared sync lock; a second concurrent call logs "lock held" and returns ran:false.
 */
import { isAuthorizedJobRequest, unauthorized } from "@/lib/jobs-auth";
import { drainWebhook, webhookConfigured } from "@/lib/worker";

export const runtime = "nodejs";
export const maxDuration = 60;
export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<Response> {
  if (!isAuthorizedJobRequest(request)) return unauthorized();
  try {
    if (!(await webhookConfigured())) return Response.json({ ok: true, ran: false, reason: "no webhook registered" });
    const r = await drainWebhook("cron");
    return Response.json({ ok: true, ...r });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    console.error(`[jobs/drain] ${message}`);
    return Response.json({ ok: false, error: message }, { status: 500 });
  }
}
