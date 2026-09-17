/**
 * Access requests: a person asks for a base or interface they cannot open, an admin decides,
 * the grant itself is done by hand in Airtable (Grant method = Manual in v1.1).
 * Sensitivity is never stored on the request; it is inherited from the resource at render time.
 */
import { Airtable } from "./airtable";
import { fieldId, hasField, pickChoice, tableId } from "./schema";
import { invalidateSnapshot, type AccessRequestRow, type Base, type Data, type Interface } from "./snapshot";
import { runSync } from "./sync";
import { tokens } from "./search";
import type { CurrentUser } from "./persona";

export type AccessResult = { ok: true } | { ok: false; reason: string };

export const PERMISSIONS = ["Read", "Comment", "Edit"] as const;

function isPending(r: AccessRequestRow): boolean {
  return (r.status ?? "").toLowerCase() === "pending";
}

export function accessRequestsAvailable(): boolean {
  try { tableId("accessRequests"); return true; } catch { return false; }
}

/** The resource a request points at: interface wins when both links are set (they should not be). */
export function resourceOf(data: Data, r: AccessRequestRow): { kind: "base"; base: Base } | { kind: "interface"; iface: Interface; base?: Base } | undefined {
  const ifaceId = r.interface?.[0];
  if (ifaceId) {
    const iface = data.interfaceById.get(ifaceId);
    if (iface) return { kind: "interface", iface, base: data.baseOfInterface.get(iface.id) };
  }
  const baseId = r.base?.[0];
  const base = baseId ? data.baseById.get(baseId) : undefined;
  return base ? { kind: "base", base } : undefined;
}

/** Inherited sensitivity: the interface's own value, else its base's, else Unclassified. */
export function effectiveSensitivity(data: Data, r: AccessRequestRow): string {
  const res = resourceOf(data, r);
  if (!res) return "Unclassified";
  if (res.kind === "interface") return res.iface.sensitivity ?? res.base?.sensitivity ?? "Unclassified";
  return res.base.sensitivity ?? "Unclassified";
}

export function resourceName(data: Data, r: AccessRequestRow): string {
  const res = resourceOf(data, r);
  if (!res) return "Unknown resource";
  return res.kind === "interface" ? `${res.iface.name ?? "Interface"} (interface)` : res.base.name ?? "Base";
}

export function resourceWorkspace(data: Data, r: AccessRequestRow): string | undefined {
  const res = resourceOf(data, r);
  const base = res?.kind === "interface" ? res.base : res?.base;
  return base?.workspaceName;
}

/** A requester's open request for a specific resource, used to swap the button for "Requested · pending". */
export function pendingRequestFor(data: Data, userId: string, resource: { baseId?: string; interfaceId?: string }): AccessRequestRow | undefined {
  return data.accessRequests.find((r) =>
    isPending(r) && (r.requester ?? []).includes(userId) &&
    (resource.baseId ? (r.base ?? []).includes(resource.baseId) : (r.interface ?? []).includes(resource.interfaceId ?? "")));
}

export function pendingFor(data: Data, me: CurrentUser): AccessRequestRow[] {
  if (!me.isAdmin) return [];
  return data.accessRequests.filter(isPending).sort((a, b) => (a.requestedAt ?? a.createdTime).localeCompare(b.requestedAt ?? b.createdTime));
}

export function myRequests(data: Data, me: CurrentUser): AccessRequestRow[] {
  return data.accessRequests
    .filter((r) => (r.requester ?? []).includes(me.user.id))
    .sort((a, b) => (b.requestedAt ?? b.createdTime).localeCompare(a.requestedAt ?? a.createdTime));
}

export function decidedRecently(data: Data, days = 30): AccessRequestRow[] {
  const cutoff = Date.now() - days * 86400000;
  return data.accessRequests
    .filter((r) => !isPending(r) && r.decisionAt && new Date(r.decisionAt).getTime() > cutoff)
    .sort((a, b) => (b.decisionAt ?? "").localeCompare(a.decisionAt ?? ""));
}

export type LockedResource = { kind: "base" | "interface"; id: string; name: string; workspace?: string; sensitivity: string };

/** Best-scoring base or interface the user cannot open, by name. Used by draft_access_request. */
export function resolveLockedResource(data: Data, me: CurrentUser, name: string): LockedResource | undefined {
  const toks = tokens(name);
  if (!toks.length) return undefined;
  const score = (text: string) => {
    const hay = text.toLowerCase();
    let s = 0;
    for (const t of toks) if (hay.includes(t)) s += 2; else if (t.length > 4 && hay.includes(t.slice(0, 4))) s += 1;
    return s;
  };
  let best: { s: number; r: LockedResource } | undefined;
  for (const b of data.bases) {
    if (me.scope.bases.has(b.id)) continue;
    const s = score(`${b.name ?? ""} ${b.workspaceName ?? ""}`);
    if (s > 0 && (!best || s > best.s)) best = { s, r: { kind: "base", id: b.id, name: b.name ?? "", workspace: b.workspaceName, sensitivity: b.sensitivity ?? "Unclassified" } };
  }
  for (const i of data.interfaces) {
    if (me.scope.interfaces.has(i.id)) continue;
    const s = score(i.name ?? "");
    if (s > 0 && (!best || s > best.s)) {
      const base = data.baseOfInterface.get(i.id);
      best = { s, r: { kind: "interface", id: i.id, name: i.name ?? "", workspace: base?.workspaceName, sensitivity: i.sensitivity ?? base?.sensitivity ?? "Unclassified" } };
    }
  }
  return best?.r;
}

async function refreshAccessRequests(): Promise<void> {
  await runSync({ only: ["accessRequests"] });
  invalidateSnapshot();
}

export type NewAccessRequest = { baseId?: string; interfaceId?: string; permission: string; justification: string };

export async function requestAccess(data: Data, me: CurrentUser, input: NewAccessRequest): Promise<AccessResult> {
  if (!accessRequestsAvailable()) return { ok: false, reason: "The Access Requests table is not in the base yet. Run npm run sync after creating it." };
  if (!input.baseId && !input.interfaceId) return { ok: false, reason: "Pick a base or an interface to request." };
  if (!input.justification.trim()) return { ok: false, reason: "A justification is required." };

  if (input.baseId) {
    if (!data.baseById.has(input.baseId)) return { ok: false, reason: "That base does not exist." };
    if (me.scope.bases.has(input.baseId)) return { ok: false, reason: "You can already open that base." };
  }
  if (input.interfaceId) {
    if (!data.interfaceById.has(input.interfaceId)) return { ok: false, reason: "That interface does not exist." };
    if (me.scope.interfaces.has(input.interfaceId)) return { ok: false, reason: "You can already open that interface." };
  }
  if (pendingRequestFor(data, me.user.id, input)) return { ok: false, reason: "You already have a pending request for this." };

  const pendingChoice = pickChoice("accessRequests", "status", ["Pending"]);
  if (!pendingChoice || pendingChoice.toLowerCase() !== "pending") return { ok: false, reason: "The Status field in Access Requests has no choices yet. Add Pending, Approved, Denied and Granted to it in Airtable, then run npm run sync." };

  const fields: Record<string, unknown> = {
    [fieldId("accessRequests", "requester")]: [me.user.id],
    [fieldId("accessRequests", "status")]: pendingChoice,
    [fieldId("accessRequests", "requestedPermission")]: pickChoice("accessRequests", "requestedPermission", [input.permission, "Read"]),
    [fieldId("accessRequests", "justification")]: input.justification.trim(),
  };
  if (input.baseId) fields[fieldId("accessRequests", "base")] = [input.baseId];
  if (input.interfaceId) fields[fieldId("accessRequests", "interface")] = [input.interfaceId];
  if (hasField("accessRequests", "requesterOrgUnit")) fields[fieldId("accessRequests", "requesterOrgUnit")] = me.orgUnit.value;
  if (hasField("accessRequests", "recordSource")) {
    const c = pickChoice("accessRequests", "recordSource", ["Demo", "User-entered"]);
    if (c) fields[fieldId("accessRequests", "recordSource")] = c;
  }

  const at = Airtable.fromEnv();
  await at.createRecords(tableId("accessRequests"), [{ fields }]);
  await refreshAccessRequests();
  return { ok: true };
}

export async function decideAccess(data: Data, me: CurrentUser, requestId: string, decision: "Approved" | "Denied", note: string): Promise<AccessResult> {
  if (!me.isAdmin) return { ok: false, reason: "Only admins can decide access requests." };
  const row = data.accessRequestById.get(requestId);
  if (!row) return { ok: false, reason: "That request no longer exists." };
  if (!isPending(row)) return { ok: false, reason: "That request was already decided." };
  if (decision === "Denied" && !note.trim()) return { ok: false, reason: "Denying requires a note for the requester." };

  const decisionChoice = pickChoice("accessRequests", "status", [decision]);
  if (!decisionChoice || decisionChoice.toLowerCase() !== decision.toLowerCase()) return { ok: false, reason: `The Status field in Access Requests has no "${decision}" choice. Add it in Airtable, then run npm run sync.` };

  const fields: Record<string, unknown> = {
    [fieldId("accessRequests", "status")]: decisionChoice,
    [fieldId("accessRequests", "approver")]: [me.user.id],
    [fieldId("accessRequests", "decisionAt")]: new Date().toISOString(),
  };
  if (note.trim() && hasField("accessRequests", "decisionNote")) fields[fieldId("accessRequests", "decisionNote")] = note.trim();
  if (hasField("accessRequests", "grantMethod")) {
    const c = pickChoice("accessRequests", "grantMethod", ["Manual"]);
    if (c) fields[fieldId("accessRequests", "grantMethod")] = c;
  }

  const at = Airtable.fromEnv();
  await at.updateRecords(tableId("accessRequests"), [{ id: requestId, fields }]);
  await refreshAccessRequests();
  return { ok: true };
}
