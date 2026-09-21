import { foundryConfig } from "./config";
import { Airtable, type TableSchema } from "./airtable";
import { FIELD_ALIASES, REQUIRED_FIELDS, TABLE_KEYS, normalizeName, type TableKey } from "./fields";
import { getStore, storeKind } from "./store";

export type CanonRecord = { id: string; createdTime: string } & Record<string, unknown>;

export type TableMap = {
  id: string;
  name: string;
  primaryFieldId: string;
  /** canonical key -> field */
  fields: Record<string, { id: string; name: string; type: string; choices?: string[] }>;
  /** Airtable field names we saw but did not map (kept for diagnostics). */
  unmapped: string[];
};

export type SchemaMap = { baseId: string; fetchedAt: string; tables: Record<TableKey, TableMap> };

export type Snapshot = {
  fetchedAt: string;
  counts: Record<TableKey, number>;
  warnings: string[];
  tables: Record<TableKey, CanonRecord[]>;
};

export { DATA_DIR } from "./store";

function findTable(schema: TableSchema[], wanted: string): TableSchema | undefined {
  const n = normalizeName(wanted);
  return schema.find((t) => normalizeName(t.name) === n);
}

export function buildTableMap(key: TableKey, table: TableSchema, warnings: string[]): TableMap {
  const byNorm = new Map(table.fields.map((f) => [normalizeName(f.name), f]));
  const fields: TableMap["fields"] = {};
  const used = new Set<string>();
  for (const [canon, aliases] of Object.entries(FIELD_ALIASES[key])) {
    let hit = undefined as (typeof table.fields)[number] | undefined;
    for (const alias of aliases) {
      hit = byNorm.get(normalizeName(alias));
      if (hit) break;
    }
    if (!hit && canon === "title") hit = table.fields.find((f) => f.id === table.primaryFieldId);
    if (hit) {
      const choices = (hit.options as { choices?: { name: string }[] } | undefined)?.choices?.map((c) => c.name);
      fields[canon] = { id: hit.id, name: hit.name, type: hit.type, ...(choices ? { choices } : {}) };
      used.add(hit.id);
    }
  }
  for (const req of REQUIRED_FIELDS[key] ?? []) {
    if (!fields[req]) warnings.push(`[${key}] required field "${req}" not found in table "${table.name}" (aliases: ${FIELD_ALIASES[key][req].join(" | ")})`);
  }
  const unmapped = table.fields.filter((f) => !used.has(f.id)).map((f) => f.name);
  return { id: table.id, name: table.name, primaryFieldId: table.primaryFieldId, fields, unmapped };
}

function canonicalize(map: TableMap, rec: { id: string; createdTime: string; fields: Record<string, unknown> }): CanonRecord {
  const out: CanonRecord = { id: rec.id, createdTime: rec.createdTime };
  for (const [canon, f] of Object.entries(map.fields)) {
    const v = rec.fields[f.id];
    if (f.type === "checkbox") out[canon] = v === true;
    else if (f.type === "multipleLookupValues" && Array.isArray(v)) {
      // Lookups arrive as arrays even for single values (Workspace Name, Base ID on interfaces).
      const flat = v.filter((x) => x !== null && x !== undefined);
      out[canon] = flat.length === 1 ? flat[0] : flat.length === 0 ? undefined : flat.every((x) => typeof x === "string") ? flat.join(", ") : flat;
    } else if (v !== undefined) out[canon] = v;
  }
  return out;
}

export type SyncOptions = { only?: TableKey[]; log?: (line: string) => void };

/**
 * Pull the base into data/snapshot.json. With `only`, refresh just those tables and
 * merge into the existing snapshot (used after writes to Requests/Votes).
 */
export async function runSync(opts: SyncOptions = {}): Promise<Snapshot> {
  const log = opts.log ?? (() => {});
  const at = Airtable.fromEnv();
  const warnings: string[] = [];
  const started = Date.now();

  log("Fetching base schema…");
  const store = getStore();
  const { tables: schemaTables } = await at.getSchema();
  const previousSchema = await store.getJson<SchemaMap>("schema");
  const previous = await store.getJson<Snapshot>("snapshot");
  const keys = opts.only ?? TABLE_KEYS;

  const tableMaps = (previousSchema?.tables ?? {}) as Record<TableKey, TableMap>;
  const tables = (previous?.tables ?? {}) as Record<TableKey, CanonRecord[]>;
  const counts = (previous?.counts ?? {}) as Record<TableKey, number>;

  for (const key of keys) {
    const wanted = foundryConfig.tables[key];
    const table = findTable(schemaTables, wanted);
    if (!table) {
      warnings.push(`Table "${wanted}" (${key}) not found in base. Present: ${schemaTables.map((t) => t.name).join(", ")}`);
      tables[key] = tables[key] ?? [];
      counts[key] = tables[key].length;
      continue;
    }
    const map = buildTableMap(key, table, warnings);
    tableMaps[key] = map;
    log(`Pulling ${table.name}…`);
    const recs = await at.listAll(table.id);
    tables[key] = recs.map((r) => canonicalize(map, r));
    counts[key] = tables[key].length;
    log(`  ${table.name}: ${counts[key]} records${map.unmapped.length ? ` · unmapped fields: ${map.unmapped.join(", ")}` : ""}`);
  }

  const fetchedAt = new Date().toISOString();
  const snapshot: Snapshot = { fetchedAt, counts, warnings, tables };
  // Schema first: a page that reads the new snapshot must never miss a field id it names.
  await store.putJson("schema", { baseId: at.baseId, fetchedAt, tables: tableMaps } satisfies SchemaMap);
  await store.putJson("snapshot", snapshot);
  log(`Done in ${((Date.now() - started) / 1000).toFixed(1)}s → ${storeKind() === "blob" ? "Vercel Blob" : "data/snapshot.json"}`);
  return snapshot;
}
