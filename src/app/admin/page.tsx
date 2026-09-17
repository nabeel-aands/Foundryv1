import { redirect } from "next/navigation";
import { foundryConfig } from "../../../foundry.config";
import { getCurrentUser } from "@/lib/persona";
import { displayName, getData, stewardName } from "@/lib/snapshot";
import { isExternal, isSandboxWorkspace } from "@/lib/scope";
import Link from "next/link";
import { pendingFor } from "@/lib/access";
import { Tile } from "@/components/Tile";
import { Chip, SensitivityChip } from "@/components/Chip";
import { OpenInAirtable } from "@/components/OpenInAirtable";
import { refreshAll } from "../actions";

export default async function Admin() {
  const me = await getCurrentUser();
  if (!me.isAdmin) redirect("/?msg=admin");
  const data = getData();
  const users = data.users;
  const active = users.filter((u) => (u.status ?? "").toLowerCase() === "active");
  const deactivated = users.length - active.length;
  const admins = users.filter((u) => u.admin);
  const external = active.filter(isExternal);
  const portal = active.filter((u) => (u.interfacesPortal ?? []).length > 0);
  const has2fa = users.some((u) => u.twoFactor !== undefined);
  const no2fa = active.filter((u) => !isExternal(u) && u.twoFactor === false);
  const hasLastActive = users.some((u) => u.lastActive);
  const cutoff = Date.now() - 90 * 86400000;
  const inactive90 = active.filter((u) => u.lastActive && new Date(u.lastActive).getTime() < cutoff);
  const aiOn = data.workspaces.filter((w) => /on/i.test(w.aiStatus ?? "")).length;
  const sandboxBases = data.bases.filter((b) => b.sandbox || isSandboxWorkspace(b.workspaceName)).length;
  const classified = data.bases.filter((b) => b.sensitivity).length;
  const rows = data.bases.reduce((s, b) => s + (b.rowCount ?? 0), 0);
  const seatTypes = new Map<string, number>();
  for (const u of active) seatTypes.set(u.seatType ?? "unset", (seatTypes.get(u.seatType ?? "unset") ?? 0) + 1);

  const externalIds = new Set(external.map((u) => u.id));
  const basesWithExternal = data.bases.map((b) => ({ b, n: (b.collaborators ?? []).filter((c) => externalIds.has(c)).length })).filter((x) => x.n > 0).sort((a, b) => b.n - a.n);
  const wsExternal = data.workspaces.map((w) => ({ w, n: (w.collaborators ?? []).filter((c) => externalIds.has(c)).length })).filter((x) => x.n > 0).sort((a, b) => b.n - a.n).slice(0, 6);
  const largest = [...data.bases].sort((a, b) => (b.rowCount ?? 0) - (a.rowCount ?? 0)).slice(0, 8);

  return (
    <div className="max-w-6xl">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="eyebrow">Governance console</div>
          <h1 className="text-2xl md:text-3xl font-semibold tracking-tight mt-1">What the data says</h1>
          <p className="text-sm text-ink-2 mt-1">{foundryConfig.client.name} · {users.length} users · {data.bases.length} bases · read from the admin-panel sync, fetched {new Date(data.fetchedAt).toLocaleString()}</p>
        </div>
        <form action={refreshAll}><button className="btn" type="submit" title="Re-pull every table from Airtable (about 8 seconds)">Refresh from Airtable</button></form>
      </div>

      <h2 className="font-semibold mt-8">Register</h2>
      <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3 mt-2">
        <Tile label="Active users" value={active.length} sub={`${deactivated} deactivated · ${users.length} total`} />
        <Tile label="Org admins" value={admins.length} sub={admins.map(displayName).slice(0, 3).join(", ")} />
        <Tile label="External accounts" value={external.length} sub={`${portal.length} reach data through portals`} />
        <Tile label="Groups" value={data.groups.length} sub={data.groups.map((g) => `${g.name} ${g.members?.length ?? 0}`).join(" · ")} />
        <Tile label="Active without 2FA" value={has2fa ? no2fa.length : "—"} sub={has2fa ? "org members only" : "2FA field not in this sync"} kind={has2fa ? "real" : "modelled"} />
        <Tile label="Inactive 90+ days" value={hasLastActive ? inactive90.length : "—"} sub={hasLastActive ? "active accounts with no recent activity" : "Last Active not in this sync"} kind={hasLastActive ? "real" : "modelled"} />
        <Tile label="Seat types" value={seatTypes.has("unset") && seatTypes.size === 1 ? "—" : [...seatTypes.entries()].filter(([k]) => k !== "unset").reduce((s, [, v]) => s + v, 0)} sub={seatTypes.has("unset") && seatTypes.size === 1 ? "Seat Type is empty for every user in this sync" : [...seatTypes.entries()].map(([k, v]) => `${k} ${v}`).join(" · ")} kind={seatTypes.has("unset") && seatTypes.size === 1 ? "modelled" : "real"} />
        <Tile label="Seat utilisation" value="—" sub="purchased seat total is not in any API; set limits in config" kind="modelled" derived="config.limits.seatsLicensed (unset)" />
      </div>

      <h2 className="font-semibold mt-8">Estate</h2>
      <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3 mt-2">
        <Tile label="Workspaces" value={data.workspaces.length} sub={`AI on in ${aiOn} · off in ${data.workspaces.length - aiOn}`} />
        <Tile label="Bases" value={data.bases.length} sub={`${sandboxBases} sandbox (native flag or workspace name)`} />
        <Tile label="Interfaces" value={data.interfaces.length} sub={`${data.interfaces.filter((i) => (i.portalCollaborators ?? []).length > 0).length} with portal collaborators`} />
        <Tile label="Records in estate" value={rows.toLocaleString()} sub="sum of Row Count across bases" />
        <Tile label="Classification coverage" value={`${classified}/${data.bases.length}`} sub={classified ? "bases with a Sensitivity value" : "no base has a Sensitivity value yet; set it in Airtable"} />
        <Tile label="Verified datasets" value={`${data.datasets.filter((d) => d.verified).length}/${data.datasets.length}`} sub={`${data.datasets.filter((d) => !stewardName(d)).length} without a steward`} />
        <Tile label="Automation runs" value="—" sub="no API exposes automation run counts" kind="modelled" derived="nothing yet" />
        <Tile label="AI credits" value="—" sub="derivable from audit-log events in v2 (Enterprise API)" kind="modelled" derived="audit log aiCreditConsumed (v2)" />
      </div>

      <div className="grid lg:grid-cols-2 gap-4 mt-8">
        <section className="card">
          <header className="px-4 py-3 border-b border-line flex items-center gap-2"><h2 className="font-semibold">Needs your attention</h2><Chip kind="warn">{basesWithExternal.length + (data.bases.length - classified > 0 ? 1 : 0)} items</Chip></header>
          <ul className="divide-y divide-line text-sm">
            <li className="px-4 py-3 flex items-start gap-3"><span className="mt-1.5 w-2 h-2 rounded-full bg-model flex-none" /><div className="flex-1"><div className="font-medium">{basesWithExternal.length} bases have external collaborators</div><div className="text-xs text-muted">{basesWithExternal.slice(0, 3).map((x) => `${x.b.name} (${x.n})`).join(" · ")}</div></div></li>
            <li className="px-4 py-3 flex items-start gap-3"><span className="mt-1.5 w-2 h-2 rounded-full bg-warn flex-none" /><div className="flex-1"><div className="font-medium">{data.bases.length - classified} bases have no sensitivity flag</div><div className="text-xs text-muted">Set Sensitivity on the Airtable Bases table; the coverage tile updates on refresh.</div></div><OpenInAirtable href={`https://airtable.com/${process.env.AIRTABLE_BASE_ID ?? ""}`} label="Classify in Airtable" small /></li>
            <li className="px-4 py-3 flex items-start gap-3"><span className="mt-1.5 w-2 h-2 rounded-full bg-amber flex-none" /><div className="flex-1"><div className="font-medium">{data.requests.filter((r) => /submitted/i.test(r.status ?? "")).length} requests awaiting first response</div><div className="text-xs text-muted">Submitted and not yet In Review.</div></div></li>
            <li className="px-4 py-3 flex items-start gap-3"><span className="mt-1.5 w-2 h-2 rounded-full bg-model flex-none" /><div className="flex-1"><div className="font-medium">Pending access requests: {pendingFor(data, me).length}</div><div className="text-xs text-muted">People waiting on a base or interface they cannot open.</div></div><Link className="btn btn-ghost !px-2 !py-1 !text-xs" href="/admin/access">Review</Link></li>
            <li className="px-4 py-3 flex items-start gap-3"><span className="mt-1.5 w-2 h-2 rounded-full bg-line-2 flex-none" /><div className="flex-1"><div className="font-medium">{data.datasets.filter((d) => !stewardName(d)).length} verified datasets have no steward</div><div className="text-xs text-muted">Assign an Owner in the Verified Datasets table.</div></div></li>
          </ul>
        </section>
        <section className="card">
          <header className="px-4 py-3 border-b border-line"><h2 className="font-semibold">Workspaces with the most external collaborators</h2></header>
          <table className="data">
            <thead><tr><th>Workspace</th><th className="text-right">External</th><th className="text-right">Bases</th><th>AI</th></tr></thead>
            <tbody>{wsExternal.map(({ w, n }) => <tr key={w.id}><td className="font-medium">{w.name}</td><td className="text-right tnum">{n}</td><td className="text-right tnum">{data.workspaceBaseIds.get(w.id)?.size ?? 0}</td><td><Chip kind="neutral">{w.aiStatus ?? "—"}</Chip></td></tr>)}</tbody>
          </table>
        </section>
        <section className="card lg:col-span-2">
          <header className="px-4 py-3 border-b border-line"><h2 className="font-semibold">Largest bases</h2></header>
          <div className="overflow-x-auto"><table className="data">
            <thead><tr><th>Base</th><th>Workspace</th><th>Sensitivity</th><th className="text-right">Rows</th><th className="text-right">Collaborators</th><th className="text-right">Interfaces</th><th></th></tr></thead>
            <tbody>{largest.map((b) => <tr key={b.id}><td className="font-medium">{b.name}</td><td className="text-ink-2">{b.workspaceName}</td><td><SensitivityChip value={b.sensitivity} /></td><td className="text-right tnum">{(b.rowCount ?? 0).toLocaleString()}</td><td className="text-right tnum">{b.collaboratorCount ?? (b.collaborators ?? []).length}</td><td className="text-right tnum">{(data.interfacesByBase.get(b.id) ?? []).length}</td><td className="text-right"><OpenInAirtable href={b.baseId ? foundryConfig.urls.base(b.baseId) : undefined} small /></td></tr>)}</tbody>
          </table></div>
        </section>
      </div>
    </div>
  );
}
