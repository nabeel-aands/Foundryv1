import { cookies } from "next/headers";
import { foundryConfig } from "../../foundry.config";
import { isDemoMode } from "./env";
import { computeScope, isExternal, orgUnitFor, roleFor, type Role, type Scope } from "./scope";
import { displayName, getData, type Data, type User } from "./snapshot";

export const PERSONA_COOKIE = "foundry_persona";

export type CurrentUser = {
  user: User;
  name: string;
  role: Role;
  isAdmin: boolean;
  orgUnit: { value: string; source: string };
  external: boolean;
  scope: Scope;
  groupNames: string[];
};

export function defaultPersona(data: Data): User | undefined {
  const active = data.users.filter((u) => (u.status ?? "").toLowerCase() === "active");
  const org = active.filter((u) => !isExternal(u));
  return org.find((u) => u.admin) ?? org[0] ?? active[0] ?? data.users[0];
}

export function resolveUser(data: Data, user: User): CurrentUser {
  const role = roleFor(data, user);
  const scope = computeScope(data, user);
  if (role === "admin") {
    // Org admins see the whole estate; keep their own paths, add everything else as "admin".
    for (const b of data.bases) if (!scope.bases.has(b.id)) scope.bases.set(b.id, new Set(["admin"]));
    for (const i of data.interfaces) if (!scope.interfaces.has(i.id)) scope.interfaces.set(i.id, new Set(["admin"]));
    for (const w of data.workspaces) scope.workspaces.add(w.id);
  }
  return {
    user,
    name: displayName(user),
    role,
    isAdmin: role === "admin",
    orgUnit: orgUnitFor(user),
    external: isExternal(user),
    scope,
    groupNames: (user.groups ?? []).map((g) => data.groupById.get(g)?.name ?? g),
  };
}

/** The persona for this request. Falls back to a sensible default when no cookie is set. */
export async function getCurrentUser(): Promise<CurrentUser> {
  const data = getData();
  const jar = await cookies();
  const id = isDemoMode() ? jar.get(PERSONA_COOKIE)?.value : undefined;
  const user = (id ? data.userById.get(id) : undefined) ?? defaultPersona(data);
  if (!user) throw new Error("No users in snapshot. Run npm run sync.");
  return resolveUser(data, user);
}

/** One quick pick per role for the footer switcher, plus configured emails. */
export function quickPicks(data: Data): User[] {
  const picks: User[] = [];
  const seen = new Set<string>();
  const push = (u?: User) => {
    if (u && !seen.has(u.id)) {
      seen.add(u.id);
      picks.push(u);
    }
  };
  for (const email of foundryConfig.personas.quickPicks) push(data.userByEmail.get(email.toLowerCase()));
  const active = data.users.filter((u) => (u.status ?? "").toLowerCase() === "active");
  const org = active.filter((u) => !isExternal(u));
  push(org.find((u) => u.admin));
  push(org.find((u) => !u.admin && (u.workspacesOwned ?? []).length > 0));
  const builderGroup = data.groups.find((g) => foundryConfig.roles.builderGroups.some((n) => n.toLowerCase() === (g.name ?? "").toLowerCase()));
  push(org.find((u) => !u.admin && (u.groups ?? []).includes(builderGroup?.id ?? "")));
  push(org.find((u) => !u.admin && (u.workspacesOwned ?? []).length === 0 && (u.basesCollab ?? []).length > 0));
  push(active.find((u) => isExternal(u) && (u.basesCollab ?? []).length > 0));
  return picks.slice(0, 6);
}
