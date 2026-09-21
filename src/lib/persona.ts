import { cookies } from "next/headers";
import { foundryConfig } from "./config";
import { authMode, getIdentity, PERSONA_COOKIE, type DenialReason } from "./identity";
import { computeScope, isExternal, orgUnitFor, roleFor, type Role, type Scope } from "./scope";
import { displayName, getData, type Data, type User } from "./snapshot";

export { PERSONA_COOKIE };

/** Thrown when a signed-in identity is not allowed in; the layout turns it into the denial page. */
export class AccessDenied extends Error {
  constructor(readonly reason: DenialReason) {
    super(`access denied: ${reason}`);
    this.name = "AccessDenied";
  }
}

/** Thrown in OIDC mode when there is no session; the layout redirects to /auth/login. */
export class NotSignedIn extends Error {
  constructor() {
    super("not signed in");
    this.name = "NotSignedIn";
  }
}

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

/**
 * Who this request is. The active Identity decides; everything downstream (scope, roles,
 * write actors) is unchanged. In demo and open mode an unknown caller falls back to the
 * default persona exactly as in v1; in OIDC mode it is an error the layout handles.
 */
export async function getCurrentUser(): Promise<CurrentUser> {
  const data = await getData();
  const jar = await cookies();
  const r = await getIdentity().resolve(data, jar);
  if (r.kind === "denied") throw new AccessDenied(r.reason);
  if (r.kind === "anonymous" && authMode() === "oidc") throw new NotSignedIn();
  const user = r.kind === "user" ? r.user : defaultPersona(data);
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
