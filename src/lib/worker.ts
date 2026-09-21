/**
 * The two sync jobs, and the timers that run them on a laptop.
 *
 * `fullSync()` and `drainWebhook()` are pure: they take the distributed lock `sync:lock`
 * (120 s) in the KV, do their work, release it, and skip with a log line if someone else
 * holds it. That is what makes them safe to call from anywhere —
 *   local:  the timers started by instrumentation.ts,
 *   Vercel: GET /api/jobs/sync and GET /api/jobs/drain (Vercel Cron), plus the webhook push.
 *
 * On Vercel there is no long-lived process, so instrumentation.ts starts no timers; the
 * crons in vercel.json are the clock.
 */
import { Airtable } from "./airtable";
import type { TableKey } from "./fields";
import { getSchema, invalidateSchema, loadSchema } from "./schema";
import { invalidateSnapshot } from "./snapshot";
import { getKV, getStore } from "./store";
import { runSync } from "./sync";

export const SYNC_LOCK_KEY = "sync:lock";
export const SYNC_LOCK_TTL_SECONDS = 120;

export type WebhookState = {
  webhookId: string;
  macSecretBase64: string;
  cursor: number;
  expirationTime?: string;
  createdAt?: string;
  /** true when the id and secret came from env vars rather than the store. */
  fromEnv?: boolean;
};

/** Env wins over stored state: a Vercel deployment gets its webhook from project settings. */
function envWebhook(): { webhookId: string; macSecretBase64: string } | undefined {
  const webhookId = process.env.AIRTABLE_WEBHOOK_ID;
  const macSecretBase64 = process.env.AIRTABLE_WEBHOOK_SECRET;
  return webhookId && macSecretBase64 ? { webhookId, macSecretBase64 } : undefined;
}

/** The webhook we should be draining, if any. The cursor always comes from the store. */
export async function readWebhookState(): Promise<WebhookState | undefined> {
  const stored = await getStore().getJson<WebhookState>("webhook");
  const fromEnv = envWebhook();
  if (fromEnv) {
    const sameHook = stored?.webhookId === fromEnv.webhookId;
    return { ...fromEnv, cursor: sameHook ? (stored?.cursor ?? 1) : 1, expirationTime: sameHook ? stored?.expirationTime : undefined, createdAt: sameHook ? stored?.createdAt : undefined, fromEnv: true };
  }
  return stored;
}

export async function writeWebhookState(state: WebhookState): Promise<void> {
  const { fromEnv: _ignored, ...rest } = state;
  await getStore().putJson("webhook", rest);
}

export async function clearWebhookState(): Promise<void> {
  await getStore().putJson("webhook", null);
}

/** Cheap enough for a page render: one store stat, no Airtable call. */
export async function webhookConfigured(): Promise<boolean> {
  if (envWebhook()) return true;
  return !!(await readWebhookState())?.webhookId;
}

/* ------------------------------------------------------------------ lock */

type LockResult<T> = { ran: true; value: T } | { ran: false; value?: undefined };

/**
 * Run `job` under the shared sync lock. Two callers race; one runs, the other logs and
 * returns immediately. The TTL means a crashed invocation cannot wedge the lock forever.
 */
async function withSyncLock<T>(label: string, job: () => Promise<T>): Promise<LockResult<T>> {
  const kv = getKV();
  if (!(await kv.acquireLock(SYNC_LOCK_KEY, SYNC_LOCK_TTL_SECONDS))) {
    console.log(`[worker] ${label}: lock held, skipping`);
    return { ran: false };
  }
  try {
    return { ran: true, value: await job() };
  } finally {
    await kv.releaseLock(SYNC_LOCK_KEY).catch((e) => console.error(`[worker] could not release ${SYNC_LOCK_KEY}: ${e instanceof Error ? e.message : e}`));
  }
}

function tableKeyById(): Map<string, TableKey> {
  const out = new Map<string, TableKey>();
  for (const [key, t] of Object.entries(getSchema().tables)) out.set(t.id, key as TableKey);
  return out;
}

function refreshCaches(): void {
  invalidateSnapshot();
  invalidateSchema();
}

/* ------------------------------------------------------------------ jobs */

/**
 * Refresh a few tables after a write to one of Foundry's own tables, under the same lock,
 * so a partial sync can never interleave with a cron's full sync and lose rows.
 *
 * The lock is short-lived, so we wait for it rather than give up immediately. If it is still
 * held after that, we skip: whatever holds it is itself pulling from Airtable and will see
 * the row we just wrote, and the next cron is a minute away either way.
 */
export async function syncTables(keys: TableKey[], waitMs = 10_000): Promise<boolean> {
  const kv = getKV();
  const deadline = Date.now() + waitMs;
  for (;;) {
    if (await kv.acquireLock(SYNC_LOCK_KEY, SYNC_LOCK_TTL_SECONDS)) break;
    if (Date.now() >= deadline) {
      console.log(`[worker] refresh of ${keys.join(", ")}: lock held, skipping (a sync in flight will pick the write up)`);
      return false;
    }
    await new Promise((r) => setTimeout(r, 250));
  }
  try {
    await runSync({ only: keys });
    refreshCaches();
    return true;
  } finally {
    await kv.releaseLock(SYNC_LOCK_KEY).catch((e) => console.error(`[worker] could not release ${SYNC_LOCK_KEY}: ${e instanceof Error ? e.message : e}`));
  }
}

export type FullSyncResult = { ran: boolean; seconds?: number; counts?: Record<string, number> };

/** Pull every table. The safety net behind the webhook. */
export async function fullSync(): Promise<FullSyncResult> {
  const r = await withSyncLock("full sync", async () => {
    const started = Date.now();
    const snap = await runSync();
    refreshCaches();
    const seconds = (Date.now() - started) / 1000;
    console.log(`[worker] full sync · ${seconds.toFixed(1)}s`);
    return { seconds, counts: snap.counts as Record<string, number> };
  });
  return r.ran ? { ran: true, ...r.value } : { ran: false };
}

export type DrainResult = { ran: boolean; tables?: TableKey[]; calls?: number; seconds?: number };

/**
 * Drain every pending webhook payload, refresh only the tables they touched and persist the
 * cursor. Shared by the local poller, the Vercel cron and the push endpoint.
 */
export async function drainWebhook(trigger: "poll" | "push" | "cron"): Promise<DrainResult> {
  const r = await withSyncLock(`${trigger} drain`, async () => {
    const state = await readWebhookState();
    if (!state) return { tables: [] as TableKey[], calls: 0, seconds: 0 };
    const started = Date.now();
    const at = Airtable.fromEnv();
    let cursor = state.cursor;
    let calls = 0;
    const changedTableIds = new Set<string>();
    let mightHaveMore = true;
    while (mightHaveMore) {
      const page = await at.listWebhookPayloads(state.webhookId, cursor);
      calls++;
      for (const p of page.payloads) for (const id of Object.keys(p.changedTablesById ?? {})) changedTableIds.add(id);
      cursor = page.cursor;
      mightHaveMore = page.mightHaveMore;
    }
    if (cursor === state.cursor && changedTableIds.size === 0) return { tables: [] as TableKey[], calls, seconds: (Date.now() - started) / 1000 };

    await loadSchema();
    const byId = tableKeyById();
    const keys = [...changedTableIds].map((id) => byId.get(id)).filter((k): k is TableKey => !!k);
    if (keys.length) {
      await runSync({ only: keys });
      refreshCaches();
    }
    await writeWebhookState({ ...state, cursor });
    const seconds = (Date.now() - started) / 1000;
    console.log(`[worker] ${trigger}: refreshed ${keys.length ? keys.join(", ") : "nothing (no mapped tables changed)"} · ${calls} payload call${calls === 1 ? "" : "s"} · ${seconds.toFixed(1)}s`);
    return { tables: keys, calls, seconds };
  });
  return r.ran ? { ran: true, ...r.value } : { ran: false };
}

/* ---------------------------------------------------------------- timers */

export function syncIntervalMinutes(): number {
  const v = Number(process.env.SYNC_INTERVAL_MINUTES ?? "15");
  return Number.isFinite(v) && v >= 0 ? v : 15;
}

export function webhookPollSeconds(): number {
  const v = Number(process.env.WEBHOOK_POLL_SECONDS ?? "30");
  return Number.isFinite(v) && v > 0 ? v : 30;
}

/** True on Vercel, where the crons in vercel.json replace these timers. */
export function onVercel(): boolean {
  return process.env.VERCEL === "1";
}

const g = globalThis as unknown as { __foundryWorkerStarted?: boolean };

/** Start both loops. Guarded so dev hot reloads never start a second copy. */
export function startWorker(): void {
  if (onVercel()) {
    console.log("[worker] on Vercel: timers off, /api/jobs/sync and /api/jobs/drain run on cron");
    return;
  }
  if (g.__foundryWorkerStarted) return;
  g.__foundryWorkerStarted = true;

  const minutes = syncIntervalMinutes();
  if (minutes > 0) {
    setInterval(() => {
      fullSync().catch((e) => console.error(`[worker] full sync failed: ${e instanceof Error ? e.message : e}`));
    }, minutes * 60_000).unref?.();
  }

  const pollMs = webhookPollSeconds() * 1_000;
  // State is re-read every tick, so `npm run webhook -- create` takes effect without a restart.
  setInterval(() => {
    void webhookConfigured()
      .then((on) => (on ? drainWebhook("poll") : undefined))
      .catch((e) => console.error(`[worker] payload poll failed: ${e instanceof Error ? e.message : e}`));
  }, pollMs).unref?.();

  console.log(`[worker] started · full sync every ${minutes > 0 ? `${minutes} min` : "off"} · webhook poll every ${pollMs / 1000}s when a webhook is registered`);
}
