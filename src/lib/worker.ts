/**
 * Background sync worker, started once per server process from instrumentation.ts.
 * Two loops: a full runSync() every SYNC_INTERVAL_MINUTES (default 15, 0 disables) as the
 * safety net, and, when data/webhook.json exists, a webhook payload poll every
 * WEBHOOK_POLL_SECONDS (default 30) that refreshes only the tables that changed.
 * Syncs never overlap: everything funnels through one in-flight promise chain.
 */
import fs from "node:fs";
import path from "node:path";
import { Airtable } from "./airtable";
import type { TableKey } from "./fields";
import { getSchema } from "./schema";
import { invalidateSnapshot } from "./snapshot";
import { DATA_DIR, runSync } from "./sync";

export const WEBHOOK_STATE_PATH = path.join(DATA_DIR, "webhook.json");

export type WebhookState = {
  webhookId: string;
  macSecretBase64: string;
  cursor: number;
  expirationTime: string;
  createdAt: string;
};

export function readWebhookState(): WebhookState | undefined {
  try {
    return JSON.parse(fs.readFileSync(WEBHOOK_STATE_PATH, "utf8")) as WebhookState;
  } catch {
    return undefined;
  }
}

export function writeWebhookState(state: WebhookState): void {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(WEBHOOK_STATE_PATH, JSON.stringify(state, null, 2));
}

/* One shared in-flight guard so two rapid changes sync sequentially, never concurrently. */
type WorkerGlobals = { __foundryWorkerStarted?: boolean; __foundrySyncChain?: Promise<void> };
const g = globalThis as unknown as WorkerGlobals;

function enqueue(job: () => Promise<void>): Promise<void> {
  const next = (g.__foundrySyncChain ?? Promise.resolve()).then(job, job);
  g.__foundrySyncChain = next.catch(() => {});
  return next;
}

function tableKeyById(): Map<string, TableKey> {
  const out = new Map<string, TableKey>();
  for (const [key, t] of Object.entries(getSchema().tables)) out.set(t.id, key as TableKey);
  return out;
}

/**
 * Drain all pending webhook payloads, refresh only the tables they touched and persist the
 * cursor. Shared by the 30-second poller and the push endpoint. Safe to call concurrently.
 */
export function drainWebhookPayloads(trigger: "poll" | "push"): Promise<void> {
  return enqueue(async () => {
    const state = readWebhookState();
    if (!state) return;
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
    if (cursor === state.cursor && changedTableIds.size === 0) return; // nothing new

    const byId = tableKeyById();
    const keys = [...changedTableIds].map((id) => byId.get(id)).filter((k): k is TableKey => !!k);
    if (keys.length) {
      await runSync({ only: keys });
      invalidateSnapshot();
    }
    writeWebhookState({ ...state, cursor });
    console.log(`[worker] ${trigger}: refreshed ${keys.length ? keys.join(", ") : "nothing (no mapped tables changed)"} · ${calls} payload call${calls === 1 ? "" : "s"} · ${((Date.now() - started) / 1000).toFixed(1)}s`);
  });
}

function fullSync(): Promise<void> {
  return enqueue(async () => {
    const started = Date.now();
    await runSync();
    invalidateSnapshot();
    console.log(`[worker] scheduled full sync · ${((Date.now() - started) / 1000).toFixed(1)}s`);
  });
}

export function syncIntervalMinutes(): number {
  const v = Number(process.env.SYNC_INTERVAL_MINUTES ?? "15");
  return Number.isFinite(v) && v >= 0 ? v : 15;
}

export function webhookPollSeconds(): number {
  const v = Number(process.env.WEBHOOK_POLL_SECONDS ?? "30");
  return Number.isFinite(v) && v > 0 ? v : 30;
}

/** Start both loops. Guarded so dev hot reloads never start a second copy. */
export function startWorker(): void {
  if (g.__foundryWorkerStarted) return;
  g.__foundryWorkerStarted = true;

  const minutes = syncIntervalMinutes();
  if (minutes > 0) {
    setInterval(() => {
      fullSync().catch((e) => console.error(`[worker] full sync failed: ${e instanceof Error ? e.message : e}`));
    }, minutes * 60_000).unref?.();
  }

  const pollMs = webhookPollSeconds() * 1_000;
  // The state file is checked every tick, so `npm run webhook -- create` takes effect without a restart.
  setInterval(() => {
    if (!fs.existsSync(WEBHOOK_STATE_PATH)) return;
    drainWebhookPayloads("poll").catch((e) => console.error(`[worker] payload poll failed: ${e instanceof Error ? e.message : e}`));
  }, pollMs).unref?.();

  console.log(`[worker] started · full sync every ${minutes > 0 ? `${minutes} min` : "off"} · webhook poll every ${pollMs / 1000}s when data/webhook.json exists`);
}
