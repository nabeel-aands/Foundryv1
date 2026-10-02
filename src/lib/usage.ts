/**
 * Ask Foundry usage per person. After each answer the tokens and cost are ADDED to number fields
 * on the Users table (AI Tokens In, AI Tokens Out, AI Cost (USD), and optionally AI Questions). They are
 * local fields in the base, not synced ones, and an Airtable automation resets them every month.
 *
 * Read-modify-write against the live record so a reset by the automation is respected. Two answers
 * for the same person at the same instant on different servers could lose one update; at this
 * scale that is accepted. A failure here never affects the answer the person already got.
 */
import { foundryConfig } from "./config";
import { Airtable } from "./airtable";
import { fieldId, hasField, tableId } from "./schema";
import type { CurrentUser } from "./persona";

export type UsageTokens = { inputTokens: number; outputTokens: number; cacheRead: number; cacheWrite: number };

/** USD for one turn. Cache reads are 10% of the input price and cache writes 125%. */
export function costOf(model: string, u: UsageTokens): { cost: number; priced: boolean } {
  const price = foundryConfig.assistant.pricePerMTok[model];
  if (!price) return { cost: 0, priced: false };
  const usd = (u.inputTokens * price.input + u.cacheRead * price.input * 0.1 + u.cacheWrite * price.input * 1.25 + u.outputTokens * price.output) / 1_000_000;
  return { cost: usd, priced: true };
}

const REQUIRED = [["aiTokensIn", "AI Tokens In"], ["aiTokensOut", "AI Tokens Out"], ["aiCost", "AI Cost (USD)"]] as const;

/** Names of the required usage fields the Users table does not have (as of the last sync). */
export function missingUsageFields(): string[] {
  try {
    return REQUIRED.filter(([k]) => !hasField("users", k)).map(([, name]) => name);
  } catch {
    return REQUIRED.map(([, name]) => name);
  }
}

export function usageFieldsPresent(): boolean {
  return missingUsageFields().length === 0;
}

const chains = new Map<string, Promise<void>>();
let warnedPrice = false;

export function recordUsage(me: CurrentUser, model: string, u: UsageTokens): Promise<void> {
  if (!usageFieldsPresent()) {
    console.warn(`[usage] not recorded for ${me.user.id}: Users table is missing ${missingUsageFields().join(", ")}. Names must match exactly and a sync must have run since they were added.`);
    return Promise.resolve();
  }
  const { cost, priced } = costOf(model, u);
  if (!priced && !warnedPrice) { warnedPrice = true; console.warn(`[usage] No price for model "${model}" in assistant.pricePerMTok; cost is recorded as 0.`); }
  const key = me.user.id;
  const run = async () => {
    const t0 = Date.now();
    console.log(`[usage] recording for ${me.user.id}: in ${u.inputTokens + u.cacheRead + u.cacheWrite} out ${u.outputTokens} cost ${cost.toFixed(6)} (${model})`);
    const at = Airtable.fromEnv();
    const t = tableId("users");
    const f = { tin: fieldId("users", "aiTokensIn"), tout: fieldId("users", "aiTokensOut"), cost: fieldId("users", "aiCost"), q: hasField("users", "aiQuestions") ? fieldId("users", "aiQuestions") : undefined };
    const rec = await at.getRecord(t, me.user.id);
    const n = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : 0);
    const updated = await at.updateRecords(t, [{ id: me.user.id, fields: {
      [f.tin]: n(rec.fields[f.tin]) + u.inputTokens + u.cacheRead + u.cacheWrite,
      [f.tout]: n(rec.fields[f.tout]) + u.outputTokens,
      [f.cost]: Math.round((n(rec.fields[f.cost]) + cost) * 1e6) / 1e6,
      // AI Questions is optional: counted only when the field exists.
      ...(f.q ? { [f.q]: n(rec.fields[f.q]) + 1 } : {}),
    } }]);
    const w = updated[0]?.fields ?? {};
    console.log(`[usage] recorded for ${me.user.id}: totals in ${w[f.tin]} out ${w[f.tout]} cost ${w[f.cost]} (${Date.now() - t0}ms)`);
  };
  const next = (chains.get(key) ?? Promise.resolve()).then(run).catch((e) => console.error(`[usage] FAILED for ${me.user.id}: ${e instanceof Error ? e.message : e}`));
  chains.set(key, next);
  return next;
}
