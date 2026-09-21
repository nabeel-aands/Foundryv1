/**
 * Full sync, on Vercel Cron (every 15 minutes, see vercel.json) or by hand:
 *   curl -H "Authorization: Bearer $CRON_SECRET" https://host/api/jobs/sync
 * Takes the shared sync lock; a second concurrent call returns ran:false.
 */
import { isAuthorizedJobRequest, unauthorized } from "@/lib/jobs-auth";
import { fullSync } from "@/lib/worker";

export const runtime = "nodejs";
export const maxDuration = 60;
export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<Response> {
  if (!isAuthorizedJobRequest(request)) return unauthorized();
  try {
    const r = await fullSync();
    return Response.json({ ok: true, ...r });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    console.error(`[jobs/sync] ${message}`);
    return Response.json({ ok: false, error: message }, { status: 500 });
  }
}
