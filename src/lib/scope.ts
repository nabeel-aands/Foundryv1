import { foundryConfig } from "./config";
import { emailDomain, type Data, type User } from "./snapshot";

export type Role = "admin" | "builder" | "user";

export type Scope = {
  /** Base record ids the user can reach, with how they reach them. */
  bases: Map<string, Set<string>>;
  /** Interface record ids the user can reach. */
  interfaces: Map<string, Set<string>>;
  /** Workspace record ids where the user is owner or collaborator (directly or via group). */
  workspaces: Set<string>;
  groupIds: Set<string>;
};

function add(map: Map<string, Set<string>>, id: string, via: string) {
  const s = map.get(id) ?? new Set<string>();
  s.add(via);
  map.set(id, s);
}

/**
 * Effective access as an idempotent union over direct, group and workspace paths.
 * Correct whether or not the admin-panel sync already includes inherited access in its link fields.
 */
export function computeScope(data: Data, user: User): Scope {
  const bases = new Map<string, Set<string>>();
  const interfaces = new Map<string, Set<string>>();
  const workspaces = new Set<string>();
  const groupIds = new Set(user.groups ?? []);

  for (const b of user.basesCollab ?? []) add(bases, b, "direct");
  for (const i of user.interfacesCollab ?? []) add(interfaces, i, "direct");
  for (const i of user.interfacesPortal ?? []) add(interfaces, i, "portal");

  for (const w of user.workspacesOwned ?? []) workspaces.add(w);
  for (const w of user.workspacesCollab ?? []) workspaces.add(w);

  for (const gid of groupIds) {
    const g = data.groupById.get(gid);
    if (!g) continue;
    for (const b of g.bases ?? []) add(bases, b, `group:${g.name ?? gid}`);
    for (const i of g.interfaces ?? []) add(interfaces, i, `group:${g.name ?? gid}`);
    for (const w of g.workspaces ?? []) workspaces.add(w);
  }

  for (const wid of workspaces) {
    const w = data.workspaceById.get(wid);
    for (const b of data.workspaceBaseIds.get(wid) ?? []) add(bases, b, `workspace:${w?.name ?? wid}`);
  }

  // Anyone who can reach a base can open its interfaces.
  for (const bid of bases.keys()) {
    for (const i of data.interfacesByBase.get(bid) ?? []) add(interfaces, i.id, "base");
  }

  return { bases, interfaces, workspaces, groupIds };
}

export function roleFor(data: Data, user: User): Role {
  const override = user.email ? foundryConfig.roles.overrides[user.email.toLowerCase()] : undefined;
  if (override) return override;
  if (user.admin) return "admin";
  if ((user.workspacesOwned ?? []).length > 0) return "builder";
  const builderGroups = new Set(foundryConfig.roles.builderGroups.map((n) => n.toLowerCase()));
  for (const gid of user.groups ?? []) {
    const g = data.groupById.get(gid);
    if (g?.name && builderGroups.has(g.name.toLowerCase())) return "builder";
  }
  return "user";
}

export function orgUnitFor(user: User): { value: string; source: "scim" | "email" | "domain" | "fallback" } {
  if (user.department) return { value: user.department, source: "scim" };
  const email = user.email?.toLowerCase() ?? "";
  if (foundryConfig.orgUnits.byEmail[email]) return { value: foundryConfig.orgUnits.byEmail[email], source: "email" };
  const d = emailDomain(email);
  if (foundryConfig.orgUnits.byDomain[d]) return { value: foundryConfig.orgUnits.byDomain[d], source: "domain" };
  return { value: foundryConfig.orgUnits.fallback, source: "fallback" };
}

export function isExternal(user: User): boolean {
  if (user.accountType && user.accountType.toLowerCase() === "external") return true;
  const d = emailDomain(user.email);
  return d !== "" && !foundryConfig.client.orgDomains.includes(d);
}

export function isSandboxWorkspace(name?: string): boolean {
  return !!name && foundryConfig.sandbox.nameRegex.test(name);
}
