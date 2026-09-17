import { redirect } from "next/navigation";
import { foundryConfig } from "../../../../foundry.config";
import { getCurrentUser } from "@/lib/persona";
import { displayName, getData, type AccessRequestRow } from "@/lib/snapshot";
import { accessRequestsAvailable, decidedRecently, effectiveSensitivity, pendingFor, resourceName, resourceOf, resourceWorkspace } from "@/lib/access";
import { labelForSource } from "@/lib/labels";
import { Chip, SensitivityChip } from "@/components/Chip";
import { decide } from "@/app/actions";

function ageDays(r: AccessRequestRow): number {
  return Math.max(0, Math.floor((Date.now() - new Date(r.requestedAt ?? r.createdTime).getTime()) / 86400000));
}

/** Where the admin grants access by hand: the base's admin-panel Source URL, else the base itself. */
function grantHref(data: ReturnType<typeof getData>, r: AccessRequestRow): string | undefined {
  const res = resourceOf(data, r);
  const base = res?.kind === "interface" ? res.base : res?.base;
  return base?.sourceUrl ?? (base?.baseId ? foundryConfig.urls.base(base.baseId) : undefined);
}

export default async function AccessAdmin({ searchParams }: { searchParams: Promise<{ msg?: string }> }) {
  const { msg } = await searchParams;
  const me = await getCurrentUser();
  if (!me.isAdmin) redirect("/?msg=admin");
  const data = getData();
  const pending = pendingFor(data, me);
  const decided = decidedRecently(data, 30);
  const name = (ids?: string[]) => displayName(ids?.[0] ? data.userById.get(ids[0]) : undefined);

  return (
    <div className="max-w-6xl">
      <div className="eyebrow">Governance console</div>
      <h1 className="text-2xl md:text-3xl font-semibold tracking-tight mt-1">Access requests</h1>
      <p className="text-sm text-ink-2 mt-1">Approve or deny; the grant itself is done by hand in Airtable for now (Grant method: Manual).</p>
      {msg && <div className="mt-4 card !bg-amber-soft px-4 py-2 text-sm">{msg}</div>}
      {!accessRequestsAvailable() && <div className="mt-4 card !bg-warn-bg px-4 py-2 text-sm">The Access Requests table is not in the base yet. Create it in Airtable and run <code className="mono">npm run sync</code>.</div>}

      <section className="mt-6 card">
        <header className="px-4 py-3 border-b border-line flex items-center gap-2">
          <h2 className="font-semibold">Pending</h2><Chip kind="warn">{pending.length}</Chip>
        </header>
        <div className="overflow-x-auto">
          <table className="data">
            <thead><tr><th>Requester</th><th>Resource</th><th>Sensitivity</th><th>Permission</th><th>Justification</th><th className="text-right">Age</th><th></th></tr></thead>
            <tbody>
              {pending.map((r) => (
                <tr key={r.id}>
                  <td><div className="font-medium">{name(r.requester)}</div><div className="text-xs text-muted">{r.requesterOrgUnit ?? "—"}</div></td>
                  <td><div className="font-medium">{resourceName(data, r)}</div><div className="text-xs text-muted">{resourceWorkspace(data, r) ?? ""}</div></td>
                  <td><SensitivityChip value={effectiveSensitivity(data, r)} /></td>
                  <td><Chip kind="neutral">{r.requestedPermission ?? "Read"}</Chip></td>
                  <td className="text-xs text-ink-2 max-w-xs"><div className="line-clamp-3">{r.justification}</div><div className="mt-1"><Chip kind={labelForSource(r.recordSource)} /></div></td>
                  <td className="text-right tnum">{ageDays(r)}d</td>
                  <td className="text-right">
                    <div className="flex flex-col items-end gap-1">
                      <form action={decide}>
                        <input type="hidden" name="requestId" value={r.id} />
                        <input type="hidden" name="decision" value="Approved" />
                        <button className="btn !px-2 !py-1 !text-xs" type="submit">Approve</button>
                      </form>
                      <details className="relative">
                        <summary className="btn btn-ghost !px-2 !py-1 !text-xs cursor-pointer list-none">Deny…</summary>
                        <form action={decide} className="absolute right-0 z-10 mt-1 card p-3 w-64 flex flex-col gap-2 text-xs shadow-lg">
                          <input type="hidden" name="requestId" value={r.id} />
                          <input type="hidden" name="decision" value="Denied" />
                          <label className="font-medium">Note to the requester (required)
                            <textarea name="note" required rows={2} className="mt-1 !text-xs" />
                          </label>
                          <button className="btn !text-xs !py-1" type="submit">Deny</button>
                        </form>
                      </details>
                    </div>
                  </td>
                </tr>
              ))}
              {!pending.length && <tr><td colSpan={7} className="text-sm text-muted">Nothing pending.</td></tr>}
            </tbody>
          </table>
        </div>
      </section>

      <section className="mt-6 card">
        <header className="px-4 py-3 border-b border-line"><h2 className="font-semibold">Decided in the last 30 days</h2></header>
        <div className="overflow-x-auto">
          <table className="data">
            <thead><tr><th>Requester</th><th>Resource</th><th>Status</th><th>Decided by</th><th>Note</th><th className="text-right">Decided</th><th></th></tr></thead>
            <tbody>
              {decided.map((r) => {
                const approved = (r.status ?? "").toLowerCase() === "approved";
                const href = grantHref(data, r);
                return (
                  <tr key={r.id}>
                    <td className="font-medium">{name(r.requester)}</td>
                    <td>{resourceName(data, r)}</td>
                    <td><Chip kind={approved ? "real" : (r.status ?? "").toLowerCase() === "granted" ? "real" : "modelled"}>{r.status}</Chip></td>
                    <td>{name(r.approver)}</td>
                    <td className="text-xs text-ink-2 max-w-xs truncate">{r.decisionNote ?? "—"}</td>
                    <td className="text-right text-xs tnum">{r.decisionAt ? new Date(r.decisionAt).toLocaleDateString() : "—"}</td>
                    <td className="text-right text-xs">
                      {approved && href && <span>Grant it in Airtable: <a className="text-sky-deep underline" href={href} target="_blank" rel="noreferrer">Open in admin panel ↗</a></span>}
                    </td>
                  </tr>
                );
              })}
              {!decided.length && <tr><td colSpan={7} className="text-sm text-muted">No decisions in the last 30 days.</td></tr>}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
