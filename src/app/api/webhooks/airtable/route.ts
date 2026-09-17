/**
 * Airtable webhook push endpoint. Airtable POSTs { base, webhook, timestamp } when a payload
 * is ready; the body is signed with HMAC-SHA256 (header X-Airtable-Content-MAC). On a valid
 * signature we drain payloads exactly like the poller. Always answers quickly.
 */
import { createHmac, timingSafeEqual } from "node:crypto";
import { drainWebhookPayloads, readWebhookState } from "@/lib/worker";

export const runtime = "nodejs";

export async function POST(request: Request): Promise<Response> {
  const state = readWebhookState();
  if (!state) return new Response("no webhook registered", { status: 404 });

  const raw = await request.text();
  const header = request.headers.get("x-airtable-content-mac") ?? "";
  const expected = `hmac-sha256=${createHmac("sha256", Buffer.from(state.macSecretBase64, "base64")).update(raw, "utf8").digest("hex")}`;
  const a = Buffer.from(header);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return new Response("bad signature", { status: 401 });

  // Fire and forget: the drain funnels through the worker's queue; Airtable just needs a fast 200.
  drainWebhookPayloads("push").catch((e) => console.error(`[webhook] push drain failed: ${e instanceof Error ? e.message : e}`));
  return new Response("ok", { status: 200 });
}
