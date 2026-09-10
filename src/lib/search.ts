import type { Data } from "./snapshot";
import type { Scope } from "./scope";

export type Match = {
  kind: "base" | "interface" | "dataset" | "request";
  id: string;
  title: string;
  subtitle: string;
  score: number;
  inScope: boolean;
  href?: string;
};

const STOP = new Set(["a", "an", "the", "for", "to", "of", "and", "or", "in", "on", "with", "my", "our", "i", "we", "need", "want", "build", "track", "tracker", "system", "app", "tool"]);

export function tokens(q: string): string[] {
  return q.toLowerCase().split(/[^a-z0-9]+/).filter((t) => t.length > 2 && !STOP.has(t));
}

function score(text: string, toks: string[]): number {
  const hay = text.toLowerCase();
  let s = 0;
  for (const t of toks) {
    if (hay.includes(t)) s += 2;
    else if (t.length > 4 && hay.includes(t.slice(0, 4))) s += 1;
  }
  return s;
}

export function searchCatalog(data: Data, scope: Scope, query: string, limit = 8): Match[] {
  const toks = tokens(query);
  if (!toks.length) return [];
  const out: Match[] = [];
  for (const b of data.bases) {
    const s = score(`${b.name ?? ""} ${b.workspaceName ?? ""}`, toks);
    if (s > 0) out.push({ kind: "base", id: b.id, title: b.name ?? b.baseId ?? b.id, subtitle: `Base · ${b.workspaceName ?? ""}`, score: s, inScope: scope.bases.has(b.id) });
  }
  for (const i of data.interfaces) {
    const s = score(i.name ?? "", toks);
    if (s > 0) {
      const base = data.bases.find((b) => b.baseId === i.baseId);
      out.push({ kind: "interface", id: i.id, title: i.name ?? i.id, subtitle: `Interface · ${base?.name ?? i.baseId ?? ""}`, score: s, inScope: scope.interfaces.has(i.id) });
    }
  }
  for (const d of data.datasets) {
    const s = score(`${d.name ?? ""} ${d.description ?? ""} ${(d.audience ?? []).join(" ")}`, toks);
    if (s > 0) out.push({ kind: "dataset", id: d.id, title: d.name ?? d.id, subtitle: `Verified dataset · ${d.orgUnit ?? ""}`, score: s, inScope: true });
  }
  for (const r of data.requests) {
    const s = score(`${r.title ?? ""} ${r.description ?? ""} ${r.useCase ?? ""}`, toks);
    if (s > 0) out.push({ kind: "request", id: r.id, title: r.title ?? r.id, subtitle: `Proposal · ${r.status ?? ""}`, score: s, inScope: true });
  }
  return out.sort((a, b) => b.score - a.score || Number(b.inScope) - Number(a.inScope)).slice(0, limit);
}
