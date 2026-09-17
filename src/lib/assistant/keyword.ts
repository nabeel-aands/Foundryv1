import type { CurrentUser } from "../persona";
import type { Data } from "../snapshot";
import { canSee } from "../requests";
import { searchCatalog } from "../search";
import type { AskResult } from "./types";

/** Deterministic fallback when no model is configured. Same scope rules, no generation. */
export function askKeyword(data: Data, me: CurrentUser, question: string): AskResult {
  const results = searchCatalog(data, me.scope, question, 12);
  const open = results.filter((r) => r.inScope && (r.kind === "base" || r.kind === "interface"));
  const link = results.filter((r) => r.kind === "dataset");
  const locked = results.filter((r) => !r.inScope);
  const proposals = results.filter((r) => r.kind === "request" && (() => { const req = data.requestById.get(r.id); return req ? canSee(req, me) : false; })());
  const n = (k: number, w: string) => `${k} ${w}${k === 1 ? "" : "s"}`;
  const answer = results.length
    ? `Within your scope there ${open.length === 1 ? "is" : "are"} ${n(open.length, "thing")} you can open today, ${n(link.length, "verified dataset")} you could link, ${n(proposals.length, "related proposal")} and ${n(locked.length, "item")} that exist but need access.`
    : `Nothing in the catalog matches "${question}". Nothing on the roadmap duplicates it either, so a request would be new.`;
  return { mode: "keyword", answer, sources: results.map((r) => ({ kind: r.kind, id: r.id, title: r.title, subtitle: r.subtitle, inScope: r.inScope, href: r.href })), toolCalls: [{ name: "keyword_search", input: { query: question }, resultCount: results.length, ms: 0 }] };
}
