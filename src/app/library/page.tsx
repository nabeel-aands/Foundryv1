import Link from "next/link";
import { foundryConfig } from "../../../foundry.config";
import { getCurrentUser } from "@/lib/persona";
import { getData, type Base } from "@/lib/snapshot";
import { isSandboxWorkspace } from "@/lib/scope";
import { Chip, SensitivityChip } from "@/components/Chip";
import { OpenInAirtable } from "@/components/OpenInAirtable";

export default async function Library({ searchParams }: { searchParams: Promise<{ q?: string; locked?: string }> }) {
  const { q = "", locked } = await searchParams;
  const data = getData();
  const me = await getCurrentUser();
  const needle = q.trim().toLowerCase();
  const matches = (b: Base) => !needle || (b.name ?? "").toLowerCase().includes(needle) || (b.workspaceName ?? "").toLowerCase().includes(needle);
  const inScope = data.bases.filter((b) => (me.isAdmin || me.scope.bases.has(b.id)) && matches(b));
  const lockedBases = data.bases.filter((b) => !me.isAdmin && !me.scope.bases.has(b.id) && matches(b));

  const byWorkspace = new Map<string, Base[]>();
  for (const b of inScope) {
    const k = b.workspaceName ?? "Unknown workspace";
    byWorkspace.set(k, [...(byWorkspace.get(k) ?? []), b]);
  }
  const groups = [...byWorkspace.entries()].sort((a, b) => b[1].length - a[1].length);

  return (
    <div className="max-w-6xl">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="eyebrow">Airtable library</div>
          <h1 className="text-2xl md:text-3xl font-semibold tracking-tight mt-1">{me.isAdmin ? "The whole estate" : "What you can open today"}</h1>
          <p className="text-sm text-ink-2 mt-1">{inScope.length} bases in {groups.length} workspaces{me.isAdmin ? " · viewing as admin" : ` · ${lockedBases.length} more exist that you cannot open`}</p>
        </div>
        <form className="flex gap-2 w-full md:w-96" method="get">
          <input name="q" defaultValue={q} placeholder="Filter by base or workspace name" aria-label="Filter" />
          {locked && <input type="hidden" name="locked" value="1" />}
          <button className="btn" type="submit">Filter</button>
        </form>
      </div>

      <div className="mt-6 flex flex-col gap-6">
        {groups.map(([ws, bases]) => {
          const w = data.workspaces.find((x) => x.name === ws);
          const sandbox = isSandboxWorkspace(ws);
          return (
            <section key={ws} className="card">
              <header className="px-4 py-3 border-b border-line flex flex-wrap items-center gap-2">
                <h2 className="font-semibold">{ws}</h2>
                <span className="text-xs text-muted mono">{bases.length} bases</span>
                {sandbox && <Chip kind="warn">Sandbox workspace</Chip>}
                {w?.aiStatus && <Chip kind="neutral">AI {w.aiStatus.replace("Allowed ", "")}</Chip>}
                {w?.system && <Chip kind="neutral">System</Chip>}
              </header>
              <div className="overflow-x-auto">
                <table className="data">
                  <thead><tr><th>Base</th><th>Sensitivity</th><th className="text-right">Rows</th><th className="text-right">Interfaces</th><th className="text-right">Collaborators</th><th></th></tr></thead>
                  <tbody>
                    {bases.sort((a, b) => (b.rowCount ?? 0) - (a.rowCount ?? 0)).map((b) => {
                      const ifaces = data.interfacesByBase.get(b.id) ?? [];
                      const open = ifaces.filter((i) => me.isAdmin || me.scope.interfaces.has(i.id));
                      return (
                        <tr key={b.id}>
                          <td>
                            <div className="font-medium">{b.name}</div>
                            <div className="text-xs text-muted flex flex-wrap gap-1 mt-0.5">
                              {b.sandbox && <Chip kind="warn">Sandbox</Chip>}
                              {(b.verifiedDatasets ?? []).length > 0 && <Chip kind="real">uses {b.verifiedDatasets!.length} verified dataset{b.verifiedDatasets!.length > 1 ? "s" : ""}</Chip>}
                              {!me.isAdmin && <span className="mono">via {[...(me.scope.bases.get(b.id) ?? [])].map((v) => v.split(":")[0]).join(", ")}</span>}
                            </div>
                            {open.length > 0 && (
                              <details className="mt-1 text-xs">
                                <summary className="cursor-pointer text-ink-2">{open.length} interface{open.length > 1 ? "s" : ""}</summary>
                                <ul className="mt-1 pl-3 flex flex-col gap-0.5">
                                  {open.slice(0, 12).map((i) => (
                                    <li key={i.id} className="flex items-center gap-2">
                                      <span>{i.name}</span>
                                      <SensitivityChip value={i.sensitivity ?? b.sensitivity} />
                                      {b.baseId && i.interfaceId && <a className="text-sky-deep underline" href={foundryConfig.urls.interface(b.baseId, i.interfaceId)} target="_blank" rel="noreferrer">open ↗</a>}
                                    </li>
                                  ))}
                                  {open.length > 12 && <li className="text-muted">+{open.length - 12} more</li>}
                                </ul>
                              </details>
                            )}
                          </td>
                          <td><SensitivityChip value={b.sensitivity} /></td>
                          <td className="text-right tnum">{(b.rowCount ?? 0).toLocaleString()}</td>
                          <td className="text-right tnum">{ifaces.length}</td>
                          <td className="text-right tnum">{b.collaboratorCount ?? (b.collaborators ?? []).length}</td>
                          <td className="text-right"><OpenInAirtable href={b.baseId ? foundryConfig.urls.base(b.baseId) : undefined} small /></td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </section>
          );
        })}
        {!groups.length && <div className="card p-6 text-sm text-muted">Nothing in your scope matches “{q}”.</div>}
      </div>

      {!me.isAdmin && lockedBases.length > 0 && (
        <section className="mt-8">
          <div className="flex items-center gap-3">
            <h2 className="font-semibold">Exists, but not available to you</h2>
            <Chip kind="locked">{lockedBases.length} locked</Chip>
            {!locked ? <Link className="text-sm underline" href={`/library?q=${encodeURIComponent(q)}&locked=1`}>Show names</Link> : <Link className="text-sm underline" href={`/library?q=${encodeURIComponent(q)}`}>Hide</Link>}
          </div>
          {locked && (
            <div className="card mt-3 overflow-x-auto">
              <table className="data">
                <thead><tr><th>Base</th><th>Workspace</th><th>Sensitivity</th><th></th></tr></thead>
                <tbody>
                  {lockedBases.slice(0, 60).map((b) => (
                    <tr key={b.id}>
                      <td className="font-medium">{b.name}</td>
                      <td className="text-ink-2">{b.workspaceName}</td>
                      <td><SensitivityChip value={b.sensitivity} /></td>
                      <td className="text-right"><button className="btn btn-ghost !px-2 !py-1 !text-xs" disabled title="Access requests arrive in v2">Request access</button></td>
                    </tr>
                  ))}
                  {lockedBases.length > 60 && <tr><td colSpan={4} className="text-muted text-xs">+{lockedBases.length - 60} more · narrow with the filter</td></tr>}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}

      <section id="datasets" className="mt-8 card">
        <header className="px-4 py-3 border-b border-line flex items-center gap-2">
          <h2 className="font-semibold">Verified datasets</h2>
          <span className="text-xs text-muted mono">{data.datasets.length} · schema and steward visible to everyone</span>
        </header>
        <div className="overflow-x-auto">
          <table className="data">
            <thead><tr><th>Data set</th><th>Steward</th><th>Org unit</th><th>Audience</th><th>Status</th><th className="text-right">Used by</th></tr></thead>
            <tbody>
              {data.datasets.map((d) => (
                <tr key={d.id}>
                  <td><div className="font-medium">{d.name}</div><div className="text-xs text-muted max-w-md">{d.description}</div></td>
                  <td>{d.owner ? <span className="flex items-center gap-2"><span className="w-2 h-2 rounded-full bg-real" />{d.owner.name ?? d.owner.email}</span> : <span className="text-muted">unowned</span>}</td>
                  <td className="text-ink-2">{d.orgUnit}</td>
                  <td className="text-xs text-ink-2">{(d.audience ?? []).join(", ")}</td>
                  <td className="flex gap-1">{d.verified && <Chip kind="real">Verified</Chip>}<Chip kind="neutral">{d.status ?? "—"}</Chip></td>
                  <td className="text-right tnum">{(d.basesUsing ?? []).length}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
