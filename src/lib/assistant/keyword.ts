import type { CurrentUser } from "../persona";
import type { Data } from "../snapshot";
import { canSee } from "../requests";
import { searchCatalog, searchLibrary, searchTraining } from "../search";
import type { AskResult, Source } from "./types";

/** Deterministic fallback when no model is configured. Same role rules, no generation. */
export function askKeyword(data: Data, me: CurrentUser, question: string): AskResult {
  const n = (k: number, w: string) => `${k} ${w}${k === 1 ? "" : "s"}`;
  const found = searchCatalog(data, me.scope, question, 12);
  const library = searchLibrary(data, question, 5);
  const training = searchTraining(data, question, 4);
  const datasets = found.filter((r) => r.kind === "dataset");
  const proposals = found.filter((r) => r.kind === "request" && (() => { const req = data.requestById.get(r.id); return req ? canSee(req, me) : false; })());
  // Bases and interfaces are for admins only. Members get the Library and Resources instead.
  const bases = me.isAdmin ? found.filter((r) => r.kind === "base" || r.kind === "interface") : [];

  const sources: Source[] = [
    ...library.map((c): Source => ({ kind: "catalog", id: c.id, title: c.name ?? "", subtitle: `${c.type ?? "Library item"} · Airtable Library`, inScope: true, href: "/library" })),
    ...training.map((r): Source => ({ kind: "resource", id: r.id, title: r.title ?? "", subtitle: `${r.format ?? "Resource"} · ${r.topic ?? "Resources page"}`, inScope: true, href: "/resources" })),
    ...[...bases, ...datasets, ...proposals].map((r): Source => ({ kind: r.kind, id: r.id, title: r.title, subtitle: r.subtitle, inScope: true, href: r.href })),
  ];

  const parts = [
    `${n(library.length, "item")} in the Airtable Library`,
    `${n(datasets.length, "verified dataset")}`,
    `${n(proposals.length, "related proposal")}`,
    `${n(training.length, "resource")} on the Resources page`,
    ...(me.isAdmin ? [`${bases.length} bases and interfaces`] : []),
  ];
  const answer = sources.length
    ? `For "${question}" I found ${parts.join(", ")}.${me.isAdmin ? "" : " Bases are managed by admins; browse the Airtable Library and Resources pages for what you can reuse."}`
    : `Nothing matches "${question}". ${me.isAdmin ? "A request would be new." : "Check the Airtable Library and Resources pages, or submit a request from Build something."}`;
  return { mode: "keyword", answer, sources, toolCalls: [{ name: "keyword_search", input: { query: question }, resultCount: sources.length, ms: 0 }] };
}
