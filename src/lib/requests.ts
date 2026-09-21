import { foundryConfig } from "./config";
import { Airtable } from "./airtable";
import { fieldId, hasField, pickChoice, tableId } from "./schema";
import { type Data, type RequestRow, type User, type VoteRow } from "./snapshot";
import { syncTables } from "./worker";
import type { CurrentUser } from "./persona";

export type RankedRequest = {
  row: RequestRow;
  votes: number;
  votedByMe: boolean;
  requesterName: string;
  relatedBaseName?: string;
  visibleGroupNames: string[];
};

/** Rows created by hand in Airtable with no title are placeholders, not requests. */
export function isRealRequest(r: RequestRow): boolean {
  return !!(r.title && r.title.trim());
}

/** NDA rule: hidden unless admin, requester, or member of a listed group. */
export function canSee(req: RequestRow, me: CurrentUser): boolean {
  if (!req.nda) return true;
  if (me.isAdmin) return true;
  if ((req.requester ?? []).includes(me.user.id)) return true;
  return (req.visibleToGroups ?? []).some((g) => me.scope.groupIds.has(g));
}

export function activeVotes(data: Data, requestId: string): VoteRow[] {
  return (data.votesByRequest.get(requestId) ?? []).filter((v) => v.active && (v.voter ?? []).length > 0);
}

export function myActiveVotes(data: Data, me: User): VoteRow[] {
  return data.votes.filter((v) => v.active && (v.voter ?? []).includes(me.id));
}

export function rankRequests(data: Data, me: CurrentUser): RankedRequest[] {
  const mine = new Set(myActiveVotes(data, me.user).map((v) => v.request?.[0]));
  return data.requests
    .filter((r) => isRealRequest(r) && canSee(r, me))
    .map((r) => ({
      row: r,
      votes: activeVotes(data, r.id).length,
      votedByMe: mine.has(r.id),
      requesterName: nameOf(data, r.requester?.[0]),
      relatedBaseName: r.relatedBase?.[0] ? data.baseById.get(r.relatedBase[0])?.name : undefined,
      visibleGroupNames: (r.visibleToGroups ?? []).map((g) => data.groupById.get(g)?.name ?? g),
    }))
    .sort((a, b) => b.votes - a.votes || (b.row.submittedAt ?? "").localeCompare(a.row.submittedAt ?? ""));
}

function nameOf(data: Data, userId?: string): string {
  const u = userId ? data.userById.get(userId) : undefined;
  if (!u) return "Unknown";
  return [u.firstName, u.lastName].filter(Boolean).join(" ") || u.email || u.id;
}

async function refreshFoundryTables() {
  await syncTables(["requests", "votes"]);
}

export type VoteResult = { ok: true } | { ok: false; reason: string };

export async function castVote(data: Data, me: CurrentUser, requestId: string): Promise<VoteResult> {
  const req = data.requestById.get(requestId);
  if (!req || !canSee(req, me)) return { ok: false, reason: "That request is not available to you." };
  const mine = myActiveVotes(data, me.user);
  if (mine.some((v) => v.request?.[0] === requestId)) return { ok: false, reason: "You already voted for this." };
  if (mine.length >= foundryConfig.votes.quota) return { ok: false, reason: `You have used all ${foundryConfig.votes.quota} votes. Retract one first.` };

  const at = Airtable.fromEnv();
  const existing = data.votes.find((v) => !v.active && v.request?.[0] === requestId && (v.voter ?? []).includes(me.user.id));
  if (existing) {
    await at.updateRecords(tableId("votes"), [{ id: existing.id, fields: { [fieldId("votes", "active")]: true } }]);
  } else {
    const fields: Record<string, unknown> = {
      [fieldId("votes", "request")]: [requestId],
      [fieldId("votes", "voter")]: [me.user.id],
      [fieldId("votes", "active")]: true,
    };
    if (hasField("votes", "recordSource")) {
      const c = pickChoice("votes", "recordSource", ["Demo", "User-entered"]);
      if (c) fields[fieldId("votes", "recordSource")] = c;
    }
    await at.createRecords(tableId("votes"), [{ fields }]);
  }
  await refreshFoundryTables();
  return { ok: true };
}

export async function retractVote(data: Data, me: CurrentUser, requestId: string): Promise<VoteResult> {
  const mine = myActiveVotes(data, me.user).filter((v) => v.request?.[0] === requestId);
  if (!mine.length) return { ok: false, reason: "No active vote to retract." };
  const at = Airtable.fromEnv();
  await at.updateRecords(tableId("votes"), mine.slice(0, 10).map((v) => ({ id: v.id, fields: { [fieldId("votes", "active")]: false } })));
  await refreshFoundryTables();
  return { ok: true };
}

export type NewRequest = {
  title: string;
  description?: string;
  useCase?: string;
  path?: string;
  teamSize?: number;
  timeline?: string;
  budget?: number;
  nda: boolean;
  visibleToGroups: string[];
  relatedBase?: string;
};

export function requestFields(requesterId: string, orgUnit: string, input: NewRequest, opts: { status?: string; recordSource?: string } = {}): Record<string, unknown> {
  const fields: Record<string, unknown> = {
    [fieldId("requests", "title")]: input.title,
    [fieldId("requests", "requester")]: [requesterId],
    [fieldId("requests", "nda")]: input.nda,
  };
  const set = (canon: string, v: unknown) => {
    if (v !== undefined && v !== null && v !== "" && hasField("requests", canon)) fields[fieldId("requests", canon)] = v;
  };
  set("description", input.description);
  set("orgUnit", orgUnit);
  set("teamSize", input.teamSize);
  set("timeline", input.timeline);
  set("budget", input.budget);
  if (input.visibleToGroups.length) set("visibleToGroups", input.visibleToGroups);
  if (input.relatedBase) set("relatedBase", [input.relatedBase]);
  if (input.useCase) set("useCase", pickChoice("requests", "useCase", [input.useCase, "Other"]));
  if (input.path) set("path", pickChoice("requests", "path", [input.path]));
  set("status", pickChoice("requests", "status", [opts.status ?? "Submitted", "Proposed"]));
  set("recordSource", pickChoice("requests", "recordSource", [opts.recordSource ?? "Demo", "User-entered"]));
  return fields;
}

export async function createRequest(me: CurrentUser, input: NewRequest): Promise<string> {
  const fields = requestFields(me.user.id, me.orgUnit.value, input);
  const at = Airtable.fromEnv();
  const [rec] = await at.createRecords(tableId("requests"), [{ fields }]);
  await refreshFoundryTables();
  return rec.id;
}
