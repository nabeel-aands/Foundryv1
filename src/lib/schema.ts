import fs from "node:fs";
import { SCHEMA_PATH, type SchemaMap } from "./sync";
import type { TableKey } from "./fields";

let cache: { mtimeMs: number; schema: SchemaMap } | undefined;

export function getSchema(): SchemaMap {
  const stat = fs.statSync(SCHEMA_PATH);
  if (cache && cache.mtimeMs === stat.mtimeMs) return cache.schema;
  const schema = JSON.parse(fs.readFileSync(SCHEMA_PATH, "utf8")) as SchemaMap;
  cache = { mtimeMs: stat.mtimeMs, schema };
  return schema;
}

export function tableId(key: TableKey): string {
  const t = getSchema().tables[key];
  if (!t) throw new Error(`Table "${key}" is not in schema.json. Run npm run sync.`);
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
