import fs from "node:fs";
import { SNAPSHOT_PATH, type CanonRecord, type Snapshot } from "./sync";

/* ---------- typed views over canonical records ---------- */

export type Collaborator = { id: string; email?: string; name?: string };

export type User = CanonRecord & {
  userId?: string; firstName?: string; lastName?: string; email?: string; seatType?: string;
  status?: string; accountType?: string; admin: boolean; lastActive?: string; twoFactor?: boolean;
  ssoRequired?: boolean; joined?: string; department?: string; costCenter?: string; title?: string;
  groups?: string[]; workspacesOwned?: string[]; workspacesCollab?: string[]; basesCollab?: string[];
  interfacesCollab?: string[]; interfacesPortal?: string[];
};
export type Group = CanonRecord & {
  groupId?: string; name?: string; members?: string[]; memberCount?: number;
  workspaces?: string[]; bases?: string[]; interfaces?: string[]; sourceUrl?: string;
};
export type Workspace = CanonRecord & {
  workspaceId?: string; name?: string; system?: boolean; aiStatus?: string; owners?: string[];
  collaborators?: string[]; groupCollaborators?: string[]; created?: string; sourceUrl?: string; bases?: string[];
};
export type Base = CanonRecord & {
  baseId?: string; workspaceId?: string | string[]; workspaceName?: string; name?: string; created?: string;
  rowCount?: number; sandbox?: boolean; sourceUrl?: string; collaborators?: string[]; groupCollaborators?: string[];
  sensitivity?: string; collaboratorCount?: number; interfaces?: string[]; verifiedDatasets?: string[];
};
export type Interface = CanonRecord & {
  interfaceId?: string; baseId?: string | string[]; name?: string; created?: string; sourceUrl?: string;
  portalCollaborators?: string[]; collaborators?: string[]; groupCollaborators?: string[];
  sensitivity?: string; collaboratorCount?: number;
};
export type VerifiedDataset = CanonRecord & {
  name?: string; description?: string; audience?: string[]; orgUnit?: string; owner?: Collaborator | string;
  status?: string; verified?: boolean; notes?: string; publishedBy?: string; sourceBase?: string;
  sourceTable?: string; sourceView?: string; catalogUpdated?: string; basesUsing?: string[]; lastReviewed?: string;
};
export type RequestRow = CanonRecord & {
  title?: string; description?: string; useCase?: string; path?: string; status?: string; requester?: string[];
  orgUnit?: string; teamSize?: number; timeline?: string; budget?: number; nda: boolean; visibleToGroups?: string[];
  relatedBase?: string[]; recordSource?: string; submittedAt?: string; votes?: string[];
};
export type VoteRow = CanonRecord & {
  request?: string[]; voter?: string[]; active: boolean; recordSource?: string; votedAt?: string;
};

export type Data = {
  fetchedAt: string;
  counts: Snapshot["counts"];
  warnings: string[];
  users: User[]; groups: Group[]; workspaces: Workspace[]; bases: Base[]; interfaces: Interface[];
  datasets: VerifiedDataset[]; requests: RequestRow[]; votes: VoteRow[];
  /** indexes by Airtable record id */
  userById: Map<string, User>; userByEmail: Map<string, User>;
  groupById: Map<string, Group>; workspaceById: Map<string, Workspace>;
  baseById: Map<string, Base>; interfaceById: Map<string, Interface>;
  datasetById: Map<string, VerifiedDataset>; requestById: Map<string, RequestRow>;
  /** derived joins */
  interfacesByBase: Map<string, Interface[]>;
  /** interface record id -> its base */
  baseOfInterface: Map<string, Base>;
  basesByWorkspace: Map<string, Base[]>;
  /** workspace record id -> Base record ids; falls back from Bases.workspaceId when Workspaces.bases is empty */
  workspaceBaseIds: Map<string, Set<string>>;
  votesByRequest: Map<string, VoteRow[]>;
};

/* ---------- loading with mtime cache ---------- */

type Cache = { mtimeMs: number; data: Data };
const g = globalThis as unknown as { __foundrySnapshot?: Cache };

function index<T extends CanonRecord>(rows: T[]): Map<string, T> {
  return new Map(rows.map((r) => [r.id, r]));
}

function build(snap: Snapshot): Data {
  const users = (snap.tables.users ?? []) as User[];
  const groups = (snap.tables.groups ?? []) as Group[];
  const workspaces = (snap.tables.workspaces ?? []) as Workspace[];
  const bases = (snap.tables.bases ?? []) as Base[];
  const interfaces = (snap.tables.interfaces ?? []) as Interface[];
  const datasets = (snap.tables.verifiedDatasets ?? []) as VerifiedDataset[];
  const requests = (snap.tables.requests ?? []) as RequestRow[];
  const votes = (snap.tables.votes ?? []) as VoteRow[];

  const baseById = index(bases);
  const workspaceById = index(workspaces);

  // Link fields hold record ids (["rec…"]); text ids ("app…", "wsp…") appear when a client uses lookups instead.
  const baseByAppId = new Map(bases.map((b) => [b.baseId ?? "", b]));
  const workspaceByWspId = new Map(workspaces.map((w) => [w.workspaceId ?? "", w]));
  const resolveBase = (v: unknown): Base | undefined => {
    const key = Array.isArray(v) ? v[0] : v;
    return typeof key === "string" ? baseById.get(key) ?? baseByAppId.get(key) : undefined;
  };
  const resolveWorkspace = (v: unknown): Workspace | undefined => {
    const key = Array.isArray(v) ? v[0] : v;
    return typeof key === "string" ? workspaceById.get(key) ?? workspaceByWspId.get(key) : undefined;
  };

  const interfacesByBase = new Map<string, Interface[]>();
  const baseOfInterface = new Map<string, Base>();
  for (const i of interfaces) {
    const b = resolveBase(i.baseId);
    if (!b) continue;
    baseOfInterface.set(i.id, b);
    const list = interfacesByBase.get(b.id) ?? [];
    list.push(i);
    interfacesByBase.set(b.id, list);
  }

  const basesByWorkspace = new Map<string, Base[]>();
  const workspaceBaseIds = new Map<string, Set<string>>();
  for (const w of workspaces) workspaceBaseIds.set(w.id, new Set(w.bases ?? []));
  for (const b of bases) {
    const w = resolveWorkspace(b.workspaceId);
    if (!w) continue;
    const list = basesByWorkspace.get(w.id) ?? [];
    list.push(b);
    basesByWorkspace.set(w.id, list);
    workspaceBaseIds.get(w.id)?.add(b.id);
  }

  const votesByRequest = new Map<string, VoteRow[]>();
  for (const v of votes) {
    const rid = v.request?.[0];
    if (!rid) continue;
    const list = votesByRequest.get(rid) ?? [];
    list.push(v);
    votesByRequest.set(rid, list);
  }

  const userByEmail = new Map<string, User>();
  for (const u of users) if (u.email) userByEmail.set(u.email.toLowerCase(), u);

  return {
    fetchedAt: snap.fetchedAt, counts: snap.counts, warnings: snap.warnings,
    users, groups, workspaces, bases, interfaces, datasets, requests, votes,
    userById: index(users), userByEmail, groupById: index(groups), workspaceById, baseById,
    interfaceById: index(interfaces), datasetById: index(datasets), requestById: index(requests),
    interfacesByBase, baseOfInterface, basesByWorkspace, workspaceBaseIds, votesByRequest,
  };
}

export function hasSnapshot(): boolean {
  return fs.existsSync(SNAPSHOT_PATH);
}

/** Load the snapshot, re-reading only when the file changed. Server-side only. */
export function getData(): Data {
  const stat = fs.statSync(SNAPSHOT_PATH);
  if (g.__foundrySnapshot && g.__foundrySnapshot.mtimeMs === stat.mtimeMs) return g.__foundrySnapshot.data;
  const snap = JSON.parse(fs.readFileSync(SNAPSHOT_PATH, "utf8")) as Snapshot;
  const data = build(snap);
  g.__foundrySnapshot = { mtimeMs: stat.mtimeMs, data };
  return data;
}

export function invalidateSnapshot(): void {
  g.__foundrySnapshot = undefined;
}

/* ---------- small helpers ---------- */

export function displayName(u: User | undefined): string {
  if (!u) return "Unknown";
  const n = [u.firstName, u.lastName].filter(Boolean).join(" ").trim();
  return n || u.email || u.userId || u.id;
}

/** Verified Datasets.Owner is plain text in this base; other clients may use a collaborator field. */
export function stewardName(d: VerifiedDataset): string | undefined {
  const o = d.owner;
  if (!o) return undefined;
  if (typeof o === "string") return o.trim() || undefined;
  return o.name ?? o.email ?? undefined;
}

export function emailDomain(email?: string): string {
  return (email ?? "").split("@")[1]?.toLowerCase() ?? "";
}
