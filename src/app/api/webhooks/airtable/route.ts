/**
 * Airtable webhook push endpoint. Airtable POSTs { base, webhook, timestamp } when a payload
 * is ready; the body is signed with HMAC-SHA256 (header X-Airtable-Content-MAC). On a valid
 * signature we drain payloads exactly like the poller.
 *
 * The drain is awaited here rather than fired and forgotten: on Vercel the invocation is
 * frozen the moment the response is returned, so background work would simply never happen.
 * A drain is a handful of Airtable calls and finishes well inside the timeout.
 */
import { createHmac, timingSafeEqual } from "node:crypto";
import { drainWebhook, readWebhookState } from "@/lib/worker";

export const runtime = "nodejs";
export const maxDuration = 60;
export const dynamic = "force-dynamic";

export async function POST(request: Request): Promise<Response> {
  const state = await readWebhookState();
  if (!state) return new Response("no webhook registered", { status: 404 });

  const raw = await request.text();
  const header = request.headers.get("x-airtable-content-mac") ?? "";
  const expected = `hmac-sha256=${createHmac("sha256", Buffer.from(state.macSecretBase64, "base64")).update(raw, "utf8").digest("hex")}`;
  const a = Buffer.from(header);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return new Response("bad signature", { status: 401 });

  try {
    await drainWebhook("push");
  } catch (e) {
    // Airtable retries on a non-2xx; a failed drain is picked up by the next poll or cron anyway.
    console.error(`[webhook] push drain failed: ${e instanceof Error ? e.message : e}`);
  }
  return new Response("ok", { status: 200 });
}
