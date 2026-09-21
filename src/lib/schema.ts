/**
 * Pinned field and table IDs, read from the store (data/schema.json locally, a private blob
 * on Vercel). Loading is async because the store is; the accessors stay synchronous because
 * every write path already has the data in hand by the time it names a field.
 *
 * `loadSchema()` primes the process-level cache and is called by `getData()`, so any code
 * that has a snapshot has a schema too. Calling an accessor before that throws with the fix.
 */
import type { SchemaMap } from "./sync";
import type { TableKey } from "./fields";
import { getStore } from "./store";

type Cache = { updatedAt: string; schema: SchemaMap };
const g = globalThis as unknown as { __foundrySchema?: Cache };

/** Read the schema, re-reading only when the store says it changed. */
export async function loadSchema(): Promise<SchemaMap> {
  const store = getStore();
  const stat = await store.stat("schema");
  if (!stat) throw new Error("No schema stored yet. Run npm run sync (or hit /api/jobs/sync).");
  if (g.__foundrySchema?.updatedAt === stat.updatedAt) return g.__foundrySchema.schema;
  const schema = await store.getJson<SchemaMap>("schema");
  if (!schema) throw new Error("No schema stored yet. Run npm run sync (or hit /api/jobs/sync).");
  g.__foundrySchema = { updatedAt: stat.updatedAt, schema };
  return schema;
}

export function schemaLoaded(): boolean {
  return !!g.__foundrySchema;
}

export function invalidateSchema(): void {
  g.__foundrySchema = undefined;
}

export function getSchema(): SchemaMap {
  const c = g.__foundrySchema;
  if (!c) throw new Error("Schema not loaded. Await getData() or loadSchema() before reading field ids.");
  return c.schema;
}

export function tableId(key: TableKey): string {
  const t = getSchema().tables[key];
  if (!t) throw new Error(`Table "${key}" is not in the stored schema. Run npm run sync.`);
  return t.id;
}

export function fieldId(key: TableKey, canon: string): string {
  const f = getSchema().tables[key]?.fields[canon];
  if (!f) throw new Error(`Field "${canon}" of "${key}" is not mapped. Check src/lib/fields.ts and re-run sync.`);
  return f.id;
}

export function hasField(key: TableKey, canon: string): boolean {
  return !!getSchema().tables[key]?.fields[canon];
}

/** Pick a single-select choice that exists in Airtable; never invents one (writes never use typecast). */
export function pickChoice(key: TableKey, canon: string, preferred: string[]): string | undefined {
  const f = getSchema().tables[key]?.fields[canon];
  const choices = f?.choices ?? [];
  for (const p of preferred) {
    const hit = choices.find((c) => c.toLowerCase() === p.toLowerCase());
    if (hit) return hit;
  }
  return choices[0];
}

export function choicesFor(key: TableKey, canon: string): string[] {
  return getSchema().tables[key]?.fields[canon]?.choices ?? [];
}
