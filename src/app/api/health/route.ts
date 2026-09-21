/**
 * Liveness and configuration check. Reads the store only — never calls Airtable — so it is
 * safe to hit from an uptime monitor and safe before the first sync has run.
 */
import { authMode } from "@/lib/identity";
import { hasSnapshot } from "@/lib/snapshot";
import { getStore, kvKind, storeKind } from "@/lib/store";
import type { Snapshot } from "@/lib/sync";
import { readWebhookState } from "@/lib/worker";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(): Promise<Response> {
  const base = { store: storeKind(), kv: kvKind(), mode: authMode() };

  if (!(await hasSnapshot())) {
    return Response.json({ ok: false, error: "no snapshot yet — run /api/jobs/sync", fetchedAt: null, ageSeconds: null, counts: {}, webhook: null, ...base }, { status: 503 });
  }

  // The raw snapshot, not getData(): health must not depend on the indexes building cleanly.
  const snap = await getStore().getJson<Snapshot>("snapshot");
  const fetchedAt = snap?.fetchedAt ?? null;
  const ageSeconds = fetchedAt ? Math.round((Date.now() - new Date(fetchedAt).getTime()) / 1000) : null;

  const state = await readWebhookState().catch(() => undefined);
  const expiresAt = state?.expirationTime ?? null;
  const webhook = state
    ? { id: state.webhookId, expiresAt, expired: expiresAt ? new Date(expiresAt).getTime() < Date.now() : false }
    : null;

  return Response.json({ ok: true, fetchedAt, ageSeconds, counts: snap?.counts ?? {}, webhook, ...base });
}
