import { env } from "./env";

export type AirtableRecord = { id: string; createdTime: string; fields: Record<string, unknown> };
export type FieldSchema = { id: string; name: string; type: string; options?: Record<string, unknown> };
export type TableSchema = { id: string; name: string; primaryFieldId: string; fields: FieldSchema[] };

const API = "https://api.airtable.com/v0";
const MIN_INTERVAL_MS = 260; // ≈3.8 requests per second, under Airtable's 5 rps per base

/** One process-wide limiter shared by sync and writes (a 429 freezes the whole base for 30 s). */
let nextSlot = 0;
async function takeSlot(): Promise<void> {
  const now = Date.now();
  const at = Math.max(now, nextSlot);
  nextSlot = at + MIN_INTERVAL_MS;
  if (at > now) await new Promise((r) => setTimeout(r, at - now));
}

export type WebhookSpecification = {
  options: { filters: { dataTypes: ("tableData" | "tableFields" | "tableMetadata")[]; recordChangeScope?: string } };
};
export type WebhookCreated = { id: string; macSecretBase64: string; expirationTime: string };
export type WebhookInfo = {
  id: string; notificationUrl: string | null; expirationTime?: string; cursorForNextPayload: number;
  isHookEnabled: boolean; areNotificationsEnabled: boolean; lastSuccessfulNotificationTime: string | null;
  specification: WebhookSpecification;
};
export type WebhookPayload = {
  timestamp: string; baseTransactionNumber: number; payloadFormat: string;
  changedTablesById?: Record<string, unknown>; error?: boolean; code?: string;
};
export type WebhookPayloadPage = { payloads: WebhookPayload[]; cursor: number; mightHaveMore: boolean };

export class AirtableError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

export class Airtable {
  constructor(private readonly token: string, readonly baseId: string) {}

  static fromEnv(): Airtable {
    return new Airtable(env("AIRTABLE_PAT"), env("AIRTABLE_BASE_ID"));
  }

  private async request<T>(path: string, init: RequestInit = {}, retried = false): Promise<T> {
    await takeSlot();
    const res = await fetch(`${API}${path}`, {
      ...init,
      headers: {
        Authorization: `Bearer ${this.token}`,
        "Content-Type": "application/json",
        ...(init.headers ?? {}),
      },
      cache: "no-store",
    });
    if (res.status === 429 && !retried) {
      await new Promise((r) => setTimeout(r, 30_000 + Math.random() * 2_000));
      return this.request<T>(path, init, true);
    }
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new AirtableError(res.status, `Airtable ${res.status} on ${path}: ${text.slice(0, 400)}`);
    }
    return (await res.json()) as T;
  }

  getSchema(): Promise<{ tables: TableSchema[] }> {
    return this.request(`/meta/bases/${this.baseId}/tables`);
  }

  /** Every record of a table, keyed by field ID so renames do not break us. */
  async listAll(tableId: string, fields?: string[]): Promise<AirtableRecord[]> {
    const out: AirtableRecord[] = [];
    let offset: string | undefined;
    do {
      const body: Record<string, unknown> = { pageSize: 100, returnFieldsByFieldId: true };
      if (fields?.length) body.fields = fields;
      if (offset) body.offset = offset;
      const page = await this.request<{ records: AirtableRecord[]; offset?: string }>(
        `/${this.baseId}/${tableId}/listRecords`,
        { method: "POST", body: JSON.stringify(body) },
      );
      out.push(...page.records);
      offset = page.offset;
    } while (offset);
    return out;
  }

  /** Create up to 10 records. Fields keyed by field ID. Never uses typecast. */
  async createRecords(tableId: string, records: { fields: Record<string, unknown> }[]): Promise<AirtableRecord[]> {
    if (records.length > 10) throw new Error("createRecords: max 10 per call");
    const res = await this.request<{ records: AirtableRecord[] }>(`/${this.baseId}/${tableId}`, {
      method: "POST",
      body: JSON.stringify({ records, returnFieldsByFieldId: true }),
    });
    return res.records;
  }

  /** Delete up to 10 records. Only ever used on Foundry-owned tables for seed rows. */
  async deleteRecords(tableId: string, ids: string[]): Promise<void> {
    if (ids.length > 10) throw new Error("deleteRecords: max 10 per call");
    const qs = ids.map((id) => `records[]=${encodeURIComponent(id)}`).join("&");
    await this.request(`/${this.baseId}/${tableId}?${qs}`, { method: "DELETE" });
  }

  /* ---------- webhooks (all count toward the same per-base rate limit) ---------- */

  /** Create a base-wide webhook. Requires PAT scope webhook:manage. */
  createWebhook(spec: WebhookSpecification, notificationUrl?: string): Promise<WebhookCreated> {
    return this.request(`/bases/${this.baseId}/webhooks`, {
      method: "POST",
      body: JSON.stringify({ specification: spec, ...(notificationUrl ? { notificationUrl } : {}) }),
    });
  }

  listWebhooks(): Promise<{ webhooks: WebhookInfo[] }> {
    return this.request(`/bases/${this.baseId}/webhooks`);
  }

  /** One page of payloads. Calling this also refreshes the webhook's expiration. */
  listWebhookPayloads(webhookId: string, cursor?: number): Promise<WebhookPayloadPage> {
    const qs = cursor ? `?cursor=${cursor}` : "";
    return this.request(`/bases/${this.baseId}/webhooks/${webhookId}/payloads${qs}`);
  }

  refreshWebhook(webhookId: string): Promise<{ expirationTime: string }> {
    return this.request(`/bases/${this.baseId}/webhooks/${webhookId}/refresh`, { method: "POST" });
  }

  deleteWebhook(webhookId: string): Promise<void> {
    return this.request(`/bases/${this.baseId}/webhooks/${webhookId}`, { method: "DELETE" });
  }

  /** PATCH (never PUT) up to 10 records. Fields keyed by field ID. */
  async updateRecords(tableId: string, records: { id: string; fields: Record<string, unknown> }[]): Promise<AirtableRecord[]> {
    if (records.length > 10) throw new Error("updateRecords: max 10 per call");
    const res = await this.request<{ records: AirtableRecord[] }>(`/${this.baseId}/${tableId}`, {
      method: "PATCH",
      body: JSON.stringify({ records, returnFieldsByFieldId: true }),
    });
    return res.records;
  }
}
