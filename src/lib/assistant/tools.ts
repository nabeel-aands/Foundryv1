/**
 * Read-only tools for Ask Foundry. Every tool is closed over the caller's scope BEFORE the model
 * runs, so the model can only ever see what the person could see in the Library or Roadmap.
 * Results carry catalog metadata only: names, descriptions, tags, statuses, counts, steward
 * display names. Never emails, user IDs, tokens, admin URLs or record content.
 */
import { z } from "zod";
import { betaZodTool } from "@anthropic-ai/sdk/helpers/beta/zod";
import { foundryConfig } from "../../../foundry.config";
import type { CurrentUser } from "../persona";
import { canSee, activeVotes } from "../requests";
import { tokens } from "../search";
import { stewardName, type Data } from "../snapshot";
import type { Source, ToolCall } from "./types";

function scoreText(text: string, toks: string[]): number {
  const hay = text.toLowerCase();
  let s = 0;
  for (const t of toks) if (hay.includes(t)) s += 2; else if (t.length > 4 && hay.includes(t.slice(0, 4))) s += 1;
  return s;
}

export function buildTools(data: Data, me: CurrentUser, log: ToolCall[], sources: Source[]) {
  const seen = new Set<string>();
  const addSource = (s: Source) => { const k = s.kind + s.id; if (!seen.has(k)) { seen.add(k); sources.push(s); } };
  /** Run a tool body, log the call with a real result count, and return the JSON string the model sees. */
  const timed = (name: string, input: Record<string, unknown>, fn: () => { count: number; payload: unknown }): string => {
    const t0 = Date.now();
    const { count, payload } = fn();
    log.push({ name, input, resultCount: count, ms: Date.now() - t0 });
    return JSON.stringify(payload);
  };
  const inScopeBase = (id: string) => me.scope.bases.has(id);

  const find_apps = betaZodTool({
    name: "find_apps",
    description: "Search bases and interfaces the current user can open, by keyword. Returns name, workspace, sensitivity, row count and interface count. Use for 'what exists for X' or 'what can I use for X'.",
    inputSchema: z.object({ query: z.string().describe("Keywords describing the need, e.g. 'supplier onboarding'"), limit: z.number().int().min(1).max(15).optional() }),
    run: async ({ query, limit = 8 }) => timed("find_apps", { query, limit }, () => {
      const toks = tokens(query);
      const items = data.bases
        .filter((b) => inScopeBase(b.id))
        .map((b) => ({ b, s: scoreText(`${b.name ?? ""} ${b.workspaceName ?? ""}`, toks) }))
        .filter((x) => x.s > 0).sort((a, b) => b.s - a.s).slice(0, limit)
        .map(({ b }) => {
          addSource({ kind: "base", id: b.id, title: b.name ?? "", subtitle: `Base · ${b.workspaceName ?? ""}`, inScope: true, href: b.baseId ? foundryConfig.urls.base(b.baseId) : undefined });
          return { name: b.name, workspace: b.workspaceName, sensitivity: b.sensitivity ?? "unclassified", sandbox: !!b.sandbox, rows: b.rowCount ?? 0, interfaces: (data.interfacesByBase.get(b.id) ?? []).map((i) => i.name).slice(0, 8), usesVerifiedDatasets: (b.verifiedDatasets ?? []).length };
        });
      return { count: items.length, payload: { items, note: items.length ? undefined : "No bases in the user's scope match. Try find_locked to see if something exists elsewhere." } };
    }),
  });

  const find_datasets = betaZodTool({
    name: "find_datasets",
    description: "Search verified datasets (governed, reusable data sets with a steward). Everyone can see schema and steward; linking requires access to the source base.",
    inputSchema: z.object({ query: z.string().optional().describe("Keywords; omit to list all") }),
    run: async ({ query }) => timed("find_datasets", { query }, () => {
      const toks = tokens(query ?? "");
      const items = data.datasets
        .map((d) => ({ d, s: toks.length ? scoreText(`${d.name ?? ""} ${d.description ?? ""} ${(d.audience ?? []).join(" ")} ${d.orgUnit ?? ""}`, toks) : 1 }))
        .filter((x) => x.s > 0).sort((a, b) => b.s - a.s).slice(0, 10)
        .map(({ d }) => {
          addSource({ kind: "dataset", id: d.id, title: d.name ?? "", subtitle: `Verified dataset · ${d.orgUnit ?? ""}`, inScope: true });
          return { name: d.name, description: d.description, orgUnit: d.orgUnit, audience: d.audience, steward: stewardName(d) ?? "unassigned", verified: !!d.verified, status: d.status, usedByBases: (d.basesUsing ?? []).length };
        });
      return { count: items.length, payload: { items } };
    }),
  });

  const roadmap_items = betaZodTool({
    name: "roadmap_items",
    description: "Search proposals and requests on the roadmap the user is allowed to see, ranked by votes. Use to check whether something has already been requested or is being built.",
    inputSchema: z.object({ query: z.string().optional(), status: z.string().optional().describe("e.g. Proposed, In Build, Shipped") }),
    run: async ({ query, status }) => timed("roadmap_items", { query, status }, () => {
      const toks = tokens(query ?? "");
      const items = data.requests
        .filter((r) => r.title && canSee(r, me) && (!status || (r.status ?? "").toLowerCase() === status.toLowerCase()))
        .map((r) => ({ r, s: toks.length ? scoreText(`${r.title ?? ""} ${r.description ?? ""} ${r.useCase ?? ""}`, toks) : 1, votes: activeVotes(data, r.id).length }))
        .filter((x) => x.s > 0).sort((a, b) => b.votes - a.votes).slice(0, 10)
        .map(({ r, votes }) => {
          addSource({ kind: "request", id: r.id, title: r.title ?? "", subtitle: `Proposal · ${r.status ?? ""} · ${votes} votes`, inScope: true, href: "/roadmap" });
          return { title: r.title, status: r.status, useCase: r.useCase, path: r.path, votes, description: r.description?.slice(0, 200) };
        });
      return { count: items.length, payload: { items, hiddenNote: "NDA-flagged items the user cannot see are excluded and not counted." } };
    }),
  });

  const who_owns = betaZodTool({
    name: "who_owns",
    description: "Find who stewards a dataset or who owns a workspace or base, by keyword. Returns display names only.",
    inputSchema: z.object({ query: z.string() }),
    run: async ({ query }) => timed("who_owns", { query }, () => {
      const toks = tokens(query);
      const datasets = data.datasets.filter((d) => scoreText(`${d.name ?? ""} ${d.description ?? ""}`, toks) > 0).slice(0, 5).map((d) => ({ dataset: d.name, steward: stewardName(d) ?? "unassigned", orgUnit: d.orgUnit }));
      const workspaces = data.workspaces.filter((w) => scoreText(w.name ?? "", toks) > 0).slice(0, 5).map((w) => {
        addSource({ kind: "workspace", id: w.id, title: w.name ?? "", subtitle: "Workspace", inScope: me.scope.workspaces.has(w.id) });
        return { workspace: w.name, owners: (w.owners ?? []).map((id) => { const u = data.userById.get(id); return u ? [u.firstName, u.lastName].filter(Boolean).join(" ") || "unknown" : "unknown"; }), bases: data.workspaceBaseIds.get(w.id)?.size ?? 0 };
      });
      return { count: datasets.length + workspaces.length, payload: { datasets, workspaces } };
    }),
  });

  const find_locked = betaZodTool({
    name: "find_locked",
    description: "Search bases that exist in the estate but the current user cannot open. Returns names and workspaces only, so the user can request access instead of rebuilding.",
    inputSchema: z.object({ query: z.string(), limit: z.number().int().min(1).max(10).optional() }),
    run: async ({ query, limit = 6 }) => timed("find_locked", { query, limit }, () => {
      const toks = tokens(query);
      const items = data.bases
        .filter((b) => !inScopeBase(b.id))
        .map((b) => ({ b, s: scoreText(`${b.name ?? ""} ${b.workspaceName ?? ""}`, toks) }))
        .filter((x) => x.s > 0).sort((a, b) => b.s - a.s).slice(0, limit)
        .map(({ b }) => { addSource({ kind: "base", id: b.id, title: b.name ?? "", subtitle: `Base · ${b.workspaceName ?? ""} · access required`, inScope: false }); return { name: b.name, workspace: b.workspaceName, sensitivity: b.sensitivity ?? "unclassified" }; });
      return { count: items.length, payload: { items } };
    }),
  });

  const my_scope = betaZodTool({
    name: "my_scope",
    description: "The current user's role, org unit, groups and how much of the estate they can reach. Call this first when the question is about 'me' or 'available to me'.",
    inputSchema: z.object({}),
    run: async () => timed("my_scope", {}, () => ({ count: 1, payload: {
      role: me.role, orgUnit: me.orgUnit.value, groups: me.groupNames, external: me.external,
      basesInScope: me.scope.bases.size, basesInEstate: data.bases.length, interfacesInScope: me.scope.interfaces.size,
      verifiedDatasets: data.datasets.length, roadmapItemsVisible: data.requests.filter((r) => r.title && canSee(r, me)).length,
    } })),
  });

  const draft_request = betaZodTool({
    name: "draft_request",
    description: "Draft a new build request for the user to review and submit. This does NOT submit anything; it only proposes a title, description and use case the UI will show with a confirm button. Use when nothing existing fits.",
    inputSchema: z.object({ title: z.string().max(80), description: z.string().max(600), useCase: z.enum(["Project Management", "Product Management", "Marketing Ops", "Calendar", "Other"]).optional() }),
    run: async (input) => timed("draft_request", input as Record<string, unknown>, () => ({ count: 1, payload: { drafted: true, ...input, note: "Shown to the user as a draft; they must confirm in the Build wizard." } })),
  });

  return { tools: [my_scope, find_apps, find_datasets, roadmap_items, who_owns, find_locked, draft_request] };
}
