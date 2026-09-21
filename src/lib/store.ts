/**
 * Storage seam. Everything Foundry persists between requests goes through one of two
 * interfaces, so the same code runs on a laptop (files under data/) and on Vercel
 * (Blob for documents, Redis for short-lived keys), with no persistent disk.
 *
 *   Store — three JSON documents: snapshot, schema, webhook.
 *   KV    — short-lived keys: conversations, answer cache, rate limits, the sync lock.
 *
 * Selection is by environment and happens once per process:
 *   Store: BLOB_READ_WRITE_TOKEN → BlobStore, else FileStore.
 *   KV:    REDIS_URL → RedisKV, else UPSTASH_REDIS_REST_URL + _TOKEN → UpstashKV, else MemoryKV.
 *
 * The heavy clients (@vercel/blob, redis, @upstash/redis) are imported lazily so a laptop
 * never loads them, and are cached on globalThis so a warm Vercel invocation reuses the
 * connection instead of dialling Redis again.
 */
import fs from "node:fs";
import path from "node:path";

export type StoreKey = "snapshot" | "schema" | "webhook";

export interface Store {
  getJson<T>(key: StoreKey): Promise<T | undefined>;
  /** Writing null removes the document (used to unregister the webhook). */
  putJson(key: StoreKey, value: unknown): Promise<void>;
  stat(key: StoreKey): Promise<{ updatedAt: string } | undefined>;
}

export interface KV {
  get<T>(key: string): Promise<T | undefined>;
  set(key: string, value: unknown, ttlSeconds?: number): Promise<void>;
  incr(key: string, ttlSeconds?: number): Promise<number>;
  del(key: string): Promise<void>;
  acquireLock(key: string, ttlSeconds: number): Promise<boolean>;
  releaseLock(key: string): Promise<void>;
}

export const DATA_DIR = path.join(process.cwd(), "data");

/** File names are the v1 layout, unchanged: data/snapshot.json and friends. */
const FILE_NAMES: Record<StoreKey, string> = {
  snapshot: "snapshot.json",
  schema: "schema.json",
  webhook: "webhook.json",
};

export function filePathFor(key: StoreKey): string {
  return path.join(DATA_DIR, FILE_NAMES[key]);
}

/* ---------------------------------------------------------------- stores */

class FileStore implements Store {
  readonly kind = "file" as const;

  async getJson<T>(key: StoreKey): Promise<T | undefined> {
    try {
      const parsed = JSON.parse(fs.readFileSync(filePathFor(key), "utf8")) as T | null;
      return parsed === null ? undefined : parsed;
    } catch {
      return undefined;
    }
  }

  async putJson(key: StoreKey, value: unknown): Promise<void> {
    if (value === null) {
      fs.rmSync(filePathFor(key), { force: true });
      return;
    }
    fs.mkdirSync(DATA_DIR, { recursive: true });
    // schema.json and webhook.json are read by humans; snapshot.json is large, keep it compact.
    fs.writeFileSync(filePathFor(key), JSON.stringify(value, null, key === "snapshot" ? undefined : 2));
  }

  async stat(key: StoreKey): Promise<{ updatedAt: string } | undefined> {
    try {
      return { updatedAt: String(fs.statSync(filePathFor(key)).mtimeMs) };
    } catch {
      return undefined;
    }
  }
}

/** One private blob per key, overwritten in place. Private blobs are readable only through get(). */
class BlobStore implements Store {
  readonly kind = "blob" as const;
  private prefix = process.env.BLOB_PREFIX ? `${process.env.BLOB_PREFIX.replace(/\/+$/, "")}/` : "foundry/";

  private pathnameFor(key: StoreKey): string {
    return `${this.prefix}${FILE_NAMES[key]}`;
  }

  async getJson<T>(key: StoreKey): Promise<T | undefined> {
    const { get } = await import("@vercel/blob");
    // useCache:false — a cron write must be visible to the very next request.
    const res = await get(this.pathnameFor(key), { access: "private", useCache: false });
    if (!res || res.statusCode !== 200 || !res.stream) return undefined;
    const text = await new Response(res.stream).text();
    const parsed = JSON.parse(text) as T | null;
    return parsed === null ? undefined : parsed;
  }

  async putJson(key: StoreKey, value: unknown): Promise<void> {
    if (value === null) {
      const { del } = await import("@vercel/blob");
      await del(this.pathnameFor(key));
      return;
    }
    const { put } = await import("@vercel/blob");
    await put(this.pathnameFor(key), JSON.stringify(value), {
      access: "private",
      contentType: "application/json",
      addRandomSuffix: false,
      allowOverwrite: true,
      cacheControlMaxAge: 60,
    });
  }

  async stat(key: StoreKey): Promise<{ updatedAt: string } | undefined> {
    const { head, BlobNotFoundError } = await import("@vercel/blob");
    try {
      const h = await head(this.pathnameFor(key));
      return { updatedAt: new Date(h.uploadedAt).toISOString() };
    } catch (e) {
      if (e instanceof BlobNotFoundError) return undefined;
      throw e;
    }
  }
}

/* -------------------------------------------------------------------- kv */

type MemoryEntry = { value: unknown; expiresAt: number };

/** Process-local. Correct on one laptop process, useless across Vercel invocations. */
class MemoryKV implements KV {
  readonly kind = "memory" as const;
  private map: Map<string, MemoryEntry>;

  constructor() {
    const g = globalThis as unknown as { __foundryMemoryKV?: Map<string, MemoryEntry> };
    this.map = g.__foundryMemoryKV ??= new Map();
  }

  private live(key: string): MemoryEntry | undefined {
    const e = this.map.get(key);
    if (!e) return undefined;
    if (e.expiresAt && e.expiresAt < Date.now()) {
      this.map.delete(key);
      return undefined;
    }
    return e;
  }

  async get<T>(key: string): Promise<T | undefined> {
    return this.live(key)?.value as T | undefined;
  }

  async set(key: string, value: unknown, ttlSeconds?: number): Promise<void> {
    this.map.set(key, { value, expiresAt: ttlSeconds ? Date.now() + ttlSeconds * 1000 : 0 });
  }

  async incr(key: string, ttlSeconds?: number): Promise<number> {
    const current = Number(this.live(key)?.value ?? 0) + 1;
    const existing = this.live(key);
    this.map.set(key, { value: current, expiresAt: existing?.expiresAt || (ttlSeconds ? Date.now() + ttlSeconds * 1000 : 0) });
    return current;
  }

  async del(key: string): Promise<void> {
    this.map.delete(key);
  }

  async acquireLock(key: string, ttlSeconds: number): Promise<boolean> {
    if (this.live(key)) return false;
    this.map.set(key, { value: "1", expiresAt: Date.now() + ttlSeconds * 1000 });
    return true;
  }

  async releaseLock(key: string): Promise<void> {
    this.map.delete(key);
  }
}

type RedisClient = {
  isOpen: boolean;
  connect(): Promise<unknown>;
  get(key: string): Promise<string | null>;
  set(key: string, value: string, opts?: { EX?: number; NX?: boolean }): Promise<string | null>;
  incr(key: string): Promise<number>;
  expire(key: string, seconds: number): Promise<unknown>;
  del(key: string): Promise<unknown>;
  on(event: string, cb: (e: unknown) => void): unknown;
};

/**
 * node-redis over a rediss:// URL — what the Vercel Marketplace Redis integration provides.
 * The client is created once per process and kept on globalThis so warm invocations reuse it.
 */
class RedisKV implements KV {
  readonly kind = "redis" as const;

  private async client(): Promise<RedisClient> {
    const g = globalThis as unknown as { __foundryRedis?: Promise<RedisClient> };
    g.__foundryRedis ??= (async () => {
      const { createClient } = await import("redis");
      const c = createClient({ url: process.env.REDIS_URL }) as unknown as RedisClient;
      c.on("error", (e) => console.error(`[kv] redis error: ${e instanceof Error ? e.message : e}`));
      await c.connect();
      return c;
    })().catch((e) => {
      // Do not cache a failed connection: the next call should retry.
      g.__foundryRedis = undefined;
      throw e;
    });
    return g.__foundryRedis;
  }

  async get<T>(key: string): Promise<T | undefined> {
    const raw = await (await this.client()).get(key);
    if (raw === null) return undefined;
    try {
      return JSON.parse(raw) as T;
    } catch {
      return raw as unknown as T;
    }
  }

  async set(key: string, value: unknown, ttlSeconds?: number): Promise<void> {
    await (await this.client()).set(key, JSON.stringify(value), ttlSeconds ? { EX: ttlSeconds } : undefined);
  }

  async incr(key: string, ttlSeconds?: number): Promise<number> {
    const c = await this.client();
    const n = await c.incr(key);
    if (n === 1 && ttlSeconds) await c.expire(key, ttlSeconds);
    return n;
  }

  async del(key: string): Promise<void> {
    await (await this.client()).del(key);
  }

  async acquireLock(key: string, ttlSeconds: number): Promise<boolean> {
    const res = await (await this.client()).set(key, "1", { NX: true, EX: ttlSeconds });
    return res === "OK";
  }

  async releaseLock(key: string): Promise<void> {
    await (await this.client()).del(key);
  }
}

type UpstashClient = {
  get(key: string): Promise<unknown>;
  set(key: string, value: unknown, opts?: { ex?: number; nx?: true }): Promise<unknown>;
  incr(key: string): Promise<number>;
  expire(key: string, seconds: number): Promise<unknown>;
  del(key: string): Promise<unknown>;
};

/** Upstash REST — no socket to keep alive, so it also works on the Edge if we ever need it. */
class UpstashKV implements KV {
  readonly kind = "upstash" as const;

  private async client(): Promise<UpstashClient> {
    const g = globalThis as unknown as { __foundryUpstash?: Promise<UpstashClient> };
    g.__foundryUpstash ??= (async () => {
      const { Redis } = await import("@upstash/redis");
      return new Redis({
        url: process.env.UPSTASH_REDIS_REST_URL!,
        token: process.env.UPSTASH_REDIS_REST_TOKEN!,
      }) as unknown as UpstashClient;
    })();
    return g.__foundryUpstash;
  }

  async get<T>(key: string): Promise<T | undefined> {
    // The Upstash client deserialises JSON itself; null means "absent".
    const v = await (await this.client()).get(key);
    return v === null || v === undefined ? undefined : (v as T);
  }

  async set(key: string, value: unknown, ttlSeconds?: number): Promise<void> {
    await (await this.client()).set(key, value, ttlSeconds ? { ex: ttlSeconds } : undefined);
  }

  async incr(key: string, ttlSeconds?: number): Promise<number> {
    const c = await this.client();
    const n = await c.incr(key);
    if (n === 1 && ttlSeconds) await c.expire(key, ttlSeconds);
    return n;
  }

  async del(key: string): Promise<void> {
    await (await this.client()).del(key);
  }

  async acquireLock(key: string, ttlSeconds: number): Promise<boolean> {
    const res = await (await this.client()).set(key, "1", { nx: true, ex: ttlSeconds });
    return res === "OK";
  }

  async releaseLock(key: string): Promise<void> {
    await (await this.client()).del(key);
  }
}

/* -------------------------------------------------------------- selection */

export type StoreKind = "file" | "blob";
export type KVKind = "memory" | "redis" | "upstash";

type Selected = { store: Store & { kind: StoreKind }; kv: KV & { kind: KVKind } };
const g = globalThis as unknown as { __foundryStores?: Selected };

function select(): Selected {
  if (g.__foundryStores) return g.__foundryStores;
  const store = process.env.BLOB_READ_WRITE_TOKEN ? new BlobStore() : new FileStore();
  const kv = process.env.REDIS_URL
    ? new RedisKV()
    : process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN
      ? new UpstashKV()
      : new MemoryKV();
  return (g.__foundryStores = { store, kv });
}

export function getStore(): Store {
  return select().store;
}

export function getKV(): KV {
  return select().kv;
}

export function storeKind(): StoreKind {
  return select().store.kind;
}

export function kvKind(): KVKind {
  return select().kv.kind;
}

/** Forget the selection so a script that loads .env late picks up the right backends. */
export function resetStores(): void {
  g.__foundryStores = undefined;
}
