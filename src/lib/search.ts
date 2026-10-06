import type { Base, CatalogItem, Data, VerifiedDataset } from "./snapshot";
import type { Scope } from "./scope";

export type Match = {
  kind: "base" | "interface" | "dataset" | "request";
  id: string;
  title: string;
  subtitle: string;
  score: number;
  /** How the score was reached, so the UI can show its working. */
  why: { total: number; whole: string[]; partial: string[]; strength: "strong" | "possible" };
  inScope: boolean;
  href?: string;
};

const STOP = new Set(["a", "an", "the", "for", "to", "of", "and", "or", "in", "on", "with", "my", "our", "i", "we", "need", "want", "build", "track", "tracker", "system", "app", "tool"]);

export function tokens(q: string): string[] {
  return q.toLowerCase().split(/[^a-z0-9]+/).filter((t) => t.length > 2 && !STOP.has(t));
}

type Hit = { score: number; whole: string[]; partial: string[]; total: number; strength: "strong" | "possible" };

/** Whole keyword in the text = 2 points; a 4-letter stem of a longer keyword = 1 point. */
function score(text: string, toks: string[]): Hit {
  const hay = text.toLowerCase();
  const whole: string[] = [];
  const partial: string[] = [];
  let s = 0;
  for (const t of toks) {
    if (hay.includes(t)) { s += 2; whole.push(t); }
    else if (t.length > 4 && hay.includes(t.slice(0, 4))) { s += 1; partial.push(t); }
  }
  // Strong: at least two whole keywords found, or most of the request's keywords covered.
  const strong = whole.length >= 2 || s / (2 * Math.max(1, toks.length)) >= 0.6;
  return { score: s, whole, partial, total: toks.length, strength: strong ? "strong" : "possible" };
}

export function searchCatalog(data: Data, scope: Scope, query: string, limit = 8): Match[] {
  const toks = tokens(query);
  if (!toks.length) return [];
  const out: Match[] = [];
  for (const b of data.bases) {
    const h = score(`${b.name ?? ""} ${b.workspaceName ?? ""}`, toks);
    if (h.score > 0) out.push({ kind: "base", id: b.id, title: b.name ?? b.baseId ?? b.id, subtitle: `Base · ${b.workspaceName ?? ""}`, score: h.score, why: h, inScope: scope.bases.has(b.id) });
  }
  for (const i of data.interfaces) {
    const h = score(i.name ?? "", toks);
    if (h.score > 0) {
      const base = data.baseOfInterface.get(i.id);
      out.push({ kind: "interface", id: i.id, title: i.name ?? i.id, subtitle: `Interface · ${base?.name ?? "unknown base"}`, score: h.score, why: h, inScope: scope.interfaces.has(i.id) });
    }
  }
  for (const d of data.datasets) {
    const h = score(`${d.name ?? ""} ${d.description ?? ""} ${(d.audience ?? []).join(" ")}`, toks);
    if (h.score > 0) out.push({ kind: "dataset", id: d.id, title: d.name ?? d.id, subtitle: `Verified dataset · ${d.orgUnit ?? ""}`, score: h.score, why: h, inScope: true });
  }
  for (const r of data.requests) {
    const h = score(`${r.title ?? ""} ${r.description ?? ""} ${r.useCase ?? ""}`, toks);
    if (h.score > 0) out.push({ kind: "request", id: r.id, title: r.title ?? r.id, subtitle: `Proposal · ${r.status ?? ""}`, score: h.score, why: h, inScope: true });
  }
  return out.sort((a, b) => b.score - a.score || Number(b.inScope) - Number(a.inScope)).slice(0, limit);
}


const arr = (v: string | string[] | undefined): string[] => (Array.isArray(v) ? v : v ? [v] : []);

/** Library items (Catalog Items table) ranked by keyword; no query lists the featured ones first. */
export function searchLibrary(data: Data, query: string, limit = 8) {
  const toks = tokens(query);
  return data.catalogItems
    .map((c) => ({ c, s: toks.length ? score(`${c.name ?? ""} ${c.description ?? ""} ${c.type ?? ""} ${c.owner ?? ""} ${arr(c.audience).join(" ")}`, toks).score : c.featured ? 2 : 1 }))
    .filter((x) => x.s > 0).sort((a, b) => b.s - a.s).slice(0, limit).map((x) => x.c);
}

/** Training resources (Training Resources table) ranked by keyword. */
export function searchTraining(data: Data, query: string, limit = 8) {
  const toks = tokens(query);
  return data.trainingResources
    .map((r) => ({ r, s: toks.length ? score(`${r.title ?? ""} ${r.description ?? ""} ${r.topic ?? ""} ${r.format ?? ""} ${r.level ?? ""}`, toks).score : 1 }))
    .filter((x) => x.s > 0).sort((a, b) => b.s - a.s).slice(0, limit).map((x) => x.r);
}

/* ---------- per-section search for the Build flow ---------- */

const CAP = 25;
const byScore = <T extends { s: number }>(xs: T[]) => xs.filter((x) => x.s > 0).sort((a, b) => b.s - a.s).slice(0, CAP);

/** Score of free text against a query's keywords (0 = no match). */
export function matchScore(text: string, query: string): number {
  return score(text, tokens(query)).score;
}

/** Library items: keyword match over name, description, type, owner, audience, use case and related base names. A featured item gets a boost. */
export function searchLibraryBoosted(data: Data, query: string): CatalogItem[] {
  const toks = tokens(query);
  if (!toks.length) return [];
  return byScore(data.catalogItems.map((c) => {
    const related = (c.relatedBase ?? []).map((id) => data.baseById.get(id)?.name ?? "").join(" ");
    const s = score(`${c.name ?? ""} ${c.description ?? ""} ${c.type ?? ""} ${c.owner ?? ""} ${arr(c.audience).join(" ")} ${arr(c.useCase).join(" ")} ${related}`, toks).score;
    return { c, s: s > 0 && c.featured ? s + 1 : s };
  })).map((x) => x.c);
}

export function searchDatasets(data: Data, query: string): VerifiedDataset[] {
  const toks = tokens(query);
  if (!toks.length) return [];
  return byScore(data.datasets.map((d) => ({
    d, s: score(`${d.name ?? ""} ${d.description ?? ""} ${(d.audience ?? []).join(" ")} ${d.orgUnit ?? ""} ${d.notes ?? ""}`, toks).score + (d.verified ? 0.5 : 0),
  }))).filter((x) => x.s >= 1).map((x) => x.d);
}

/** Bases and their interfaces, in or out of the user's scope. Out-of-scope ones are flagged so the UI can offer an access request. */
export function searchBases(data: Data, scope: Scope, query: string): Match[] {
  const toks = tokens(query);
  if (!toks.length) return [];
  return searchCatalog(data, scope, query, 1000).filter((m) => m.kind === "base" || m.kind === "interface").slice(0, CAP);
}

/** Workspace owners (as user records) for a base, resolving either a record id or a text workspace id. */
export function ownersOfBase(data: Data, b: Base) {
  const key = Array.isArray(b.workspaceId) ? b.workspaceId[0] : b.workspaceId;
  const ws = key ? data.workspaceById.get(key) ?? data.workspaces.find((w) => w.workspaceId === key) : undefined;
  return (ws?.owners ?? []).map((id) => data.userById.get(id)).filter((u): u is NonNullable<typeof u> => !!u);
}
