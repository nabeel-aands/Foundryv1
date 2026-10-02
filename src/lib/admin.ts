/**
 * Drill-downs and search for the Governance console. Pure functions over the snapshot, so the
 * console and (later) the admin-only Ask Foundry tools agree on every number. Admin pages only:
 * these rows carry emails.
 */
import { foundryConfig } from "./config";
import { isExternal, isSandboxWorkspace } from "./scope";
import { displayName, stewardName, type Data, type User } from "./snapshot";

export type Row = { cells: string[]; href?: string };
export type Section = { key: string; title: string; note?: string; columns: string[]; rows: Row[]; total: number };

export const ROW_CAP = 50;

export const PANEL_KEYS = [
  "users", "admins", "external", "no2fa", "inactive", "groups", "workspaces", "bases", "unclassified",
  "ext-bases", "interfaces", "datasets", "no-steward", "ai-usage",
] as const;
export type PanelKey = (typeof PANEL_KEYS)[number];
export const isPanelKey = (k: string): k is PanelKey => (PANEL_KEYS as readonly string[]).includes(k);

const date = (s?: string) => (s ? new Date(s).toLocaleDateString() : "—");
const text = (r: Row) => r.cells.join(" ").toLowerCase();

function userRow(u: User, data: Data): Row {
  const groups = (u.groups ?? []).map((g) => data.groupById.get(g)?.name).filter(Boolean).join(", ");
  return { cells: [displayName(u), u.email ?? "—", u.admin ? "Admin" : (u.accountType ?? "Member"), u.seatType ?? "—", date(u.lastActive), groups || "—"] };
}
const USER_COLS = ["Name", "Email", "Type", "Seat", "Last active", "Groups"];

function baseRows(data: Data, bases: Data["bases"]): Row[] {
  return [...bases].sort((a, b) => (b.rowCount ?? 0) - (a.rowCount ?? 0)).map((b) => ({
    cells: [b.name ?? "—", b.workspaceName ?? "—", b.sensitivity ?? "Unclassified", (b.rowCount ?? 0).toLocaleString(), String(b.collaboratorCount ?? (b.collaborators ?? []).length), String((data.interfacesByBase.get(b.id) ?? []).length)],
    href: b.baseId ? foundryConfig.urls.base(b.baseId) : undefined,
  }));
}
const BASE_COLS = ["Base", "Workspace", "Sensitivity", "Rows", "Collaborators", "Interfaces"];

/** The full (uncapped, unfiltered) rows behind one console card. */
export function panel(key: PanelKey, data: Data): Section {
  const active = data.users.filter((u) => (u.status ?? "").toLowerCase() === "active");
  const cutoff = Date.now() - 90 * 86400000;
  const externalIds = new Set(active.filter(isExternal).map((u) => u.id));
  const mk = (title: string, columns: string[], rows: Row[], note?: string): Section => ({ key, title, note, columns, rows, total: rows.length });
  switch (key) {
    case "users": return mk("Active users", USER_COLS, active.map((u) => userRow(u, data)));
    case "admins": return mk("Org admins", USER_COLS, data.users.filter((u) => u.admin).map((u) => userRow(u, data)));
    case "external": return mk("External accounts", USER_COLS, active.filter(isExternal).map((u) => userRow(u, data)), "Active accounts with an external account type or an email domain outside the organisation.");
    case "no2fa": return mk("Active without 2FA", USER_COLS, active.filter((u) => !isExternal(u) && u.twoFactor === false).map((u) => userRow(u, data)), "Organisation members only.");
    case "inactive": return mk("Inactive 90+ days", USER_COLS, active.filter((u) => u.lastActive && new Date(u.lastActive).getTime() < cutoff).map((u) => userRow(u, data)));
    case "groups": {
      const byUserId = new Map(data.users.map((u) => [u.userId ?? "", u]));
      return mk("Groups", ["Group", "Members", "Who"], data.groups.map((g) => {
        const names = (g.members ?? []).map((m) => displayName(data.userById.get(m) ?? byUserId.get(m))).filter((n) => n !== "Unknown");
        return { cells: [g.name ?? "—", String(g.members?.length ?? 0), names.slice(0, 12).join(", ") + (names.length > 12 ? ` +${names.length - 12} more` : "") || "—"] };
      }));
    }
    case "workspaces": return mk("Workspaces", ["Workspace", "Owners", "Bases", "AI", "Flags"], data.workspaces.map((w) => ({
      cells: [w.name ?? "—", (w.owners ?? []).map((o) => displayName(data.userById.get(o))).join(", ") || "—", String(data.workspaceBaseIds.get(w.id)?.size ?? 0), w.aiStatus ?? "—", [w.system ? "System" : "", isSandboxWorkspace(w.name) ? "Sandbox" : ""].filter(Boolean).join(", ") || "—"],
    })).sort((a, b) => Number(b.cells[2]) - Number(a.cells[2])));
    case "bases": return mk("Bases", BASE_COLS, baseRows(data, data.bases), "Largest first.");
    case "unclassified": return mk("Bases with no sensitivity", BASE_COLS, baseRows(data, data.bases.filter((b) => !b.sensitivity)), "Set Sensitivity on the Airtable Bases table; this list updates on refresh.");
    case "ext-bases": return mk("Bases with external collaborators", [...BASE_COLS, "External"], data.bases
      .map((b) => ({ b, n: (b.collaborators ?? []).filter((c) => externalIds.has(c)).length })).filter((x) => x.n > 0).sort((a, b) => b.n - a.n)
      .map(({ b, n }) => ({ cells: [...baseRows(data, [b])[0].cells, String(n)], href: b.baseId ? foundryConfig.urls.base(b.baseId) : undefined })));
    case "interfaces": return mk("Interfaces", ["Interface", "Base", "Sensitivity", "Collaborators", "Portal"], data.interfaces.map((i) => {
      const base = data.baseOfInterface.get(i.id);
      return { cells: [i.name ?? "—", base?.name ?? "—", i.sensitivity ?? base?.sensitivity ?? "Unclassified", String(i.collaboratorCount ?? (i.collaborators ?? []).length), (i.portalCollaborators ?? []).length ? "Yes" : "—"], href: base?.baseId && i.interfaceId ? foundryConfig.urls.interface(base.baseId, i.interfaceId) : undefined };
    }));
    case "datasets": return mk("Verified datasets", ["Dataset", "Steward", "Org unit", "Status", "Used by"], data.datasets.map((d) => ({ cells: [d.name ?? "—", stewardName(d) ?? "Unowned", d.orgUnit ?? "—", `${d.verified ? "Verified · " : ""}${d.status ?? "—"}`, `${(d.basesUsing ?? []).length} bases`] })));
    case "ai-usage": return mk("Ask Foundry usage this month", ["Name", "Email", "Questions", "Tokens in", "Tokens out", "Cost (USD)"], data.users
      .filter((u) => (u.aiQuestions ?? 0) > 0 || (u.aiCost ?? 0) > 0)
      .sort((a, b) => (b.aiCost ?? 0) - (a.aiCost ?? 0) || (b.aiQuestions ?? 0) - (a.aiQuestions ?? 0))
      .map((u) => ({ cells: [displayName(u), u.email ?? "—", String(u.aiQuestions ?? 0), (u.aiTokensIn ?? 0).toLocaleString(), (u.aiTokensOut ?? 0).toLocaleString(), `$${(u.aiCost ?? 0).toFixed(4)}`] })),
      "Counted per answer and reset monthly by an Airtable automation. Only people who asked something are listed.");
    case "no-steward": return mk("Datasets with no steward", ["Dataset", "Org unit", "Status", "Used by"], data.datasets.filter((d) => !stewardName(d)).map((d) => ({ cells: [d.name ?? "—", d.orgUnit ?? "—", d.status ?? "—", `${(d.basesUsing ?? []).length} bases`] })), "Assign an Owner in the Verified Datasets table.");
  }
}

/** Filter a panel by free text across every cell, then cap the visible rows. */
export function filterPanel(s: Section, q: string): Section & { shown: Row[] } {
  const needle = q.trim().toLowerCase();
  const rows = needle ? s.rows.filter((r) => text(r).includes(needle)) : s.rows;
  return { ...s, rows, total: rows.length, shown: rows.slice(0, ROW_CAP) };
}

/** Search the whole estate: people, groups, workspaces, bases, interfaces and datasets. */
export function searchEstate(data: Data, q: string): (Section & { shown: Row[] })[] {
  const needle = q.trim().toLowerCase();
  if (!needle) return [];
  const keys: PanelKey[] = ["users", "groups", "workspaces", "bases", "interfaces", "datasets"];
  return keys.map((k) => {
    const p = k === "users" ? { ...panel("users", data), rows: data.users.map((u) => { const r = userRow(u, data); if ((u.status ?? "").toLowerCase() !== "active") r.cells[2] += ` · ${u.status ?? "inactive"}`; return r; }), title: "People" } : panel(k, data);
    const f = filterPanel(p, q);
    return { ...f, shown: f.rows.slice(0, 10) };
  }).filter((s) => s.total > 0);
}
