import Link from "next/link";
import { foundryConfig } from "../../../foundry.config";
import { getCurrentUser } from "@/lib/persona";
import { getData } from "@/lib/snapshot";
import { myActiveVotes, rankRequests } from "@/lib/requests";
import { labelForSource } from "@/lib/labels";
import { Chip } from "@/components/Chip";
import { retract, vote } from "../actions";

export default async function Roadmap({ searchParams }: { searchParams: Promise<{ useCase?: string; status?: string; msg?: string }> }) {
  const { useCase = "", status = "", msg } = await searchParams;
  const data = getData();
  const me = await getCurrentUser();
  const ranked = rankRequests(data, me).filter((r) => (!useCase || r.row.useCase === useCase) && (!status || r.row.status === status));
  const used = myActiveVotes(data, me.user).length;
  const left = Math.max(0, foundryConfig.votes.quota - used);
  const mine = data.requests.filter((r) => (r.requester ?? []).includes(me.user.id));
  const useCases = [...new Set(data.requests.map((r) => r.useCase).filter(Boolean))] as string[];
  const statuses = [...new Set(data.requests.map((r) => r.status).filter(Boolean))] as string[];
  const back = `/roadmap${useCase || status ? `?useCase=${encodeURIComponent(useCase)}&status=${encodeURIComponent(status)}` : ""}`;

  return (
    <div className="max-w-6xl">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="eyebrow">Roadmap</div>
          <h1 className="text-2xl md:text-3xl font-semibold tracking-tight mt-1">What's coming, and what you can push up</h1>
          <p className="text-sm text-ink-2 mt-1">Everything proposed or in flight, ranked by demand. Votes write straight to the Votes table in Airtable.</p>
        </div>
        <Link href="/build" className="btn btn-primary">Submit an intake</Link>
      </div>
      {msg && <div className="mt-4 card !bg-amber-soft px-4 py-2 text-sm">{msg}</div>}

      <div className="grid lg:grid-cols-[minmax(0,1fr)_280px] gap-4 mt-6">
        <div>
          <form className="flex flex-wrap gap-2 items-center text-sm" method="get">
            <span className="eyebrow">Filter</span>
            <select name="useCase" defaultValue={useCase} className="!w-auto !py-1.5"><option value="">All use cases</option>{useCases.map((u) => <option key={u}>{u}</option>)}</select>
            <select name="status" defaultValue={status} className="!w-auto !py-1.5"><option value="">All statuses</option>{statuses.map((s) => <option key={s}>{s}</option>)}</select>
            <button className="btn btn-ghost !py-1.5" type="submit">Apply</button>
          </form>
          <div className="card mt-3 overflow-x-auto">
            <table className="data">
              <thead><tr><th className="text-right">Rank</th><th>Request</th><th>Use case</th><th>Status</th><th className="text-right">Votes</th><th></th></tr></thead>
              <tbody>
                {ranked.map((r, i) => (
                  <tr key={r.row.id}>
                    <td className="text-right tnum mono text-muted">{String(i + 1).padStart(2, "0")}</td>
                    <td>
                      <div className="font-medium flex items-center gap-2">{r.row.title}{r.row.nda && <Chip kind="locked" title={`Visible to: ${r.visibleGroupNames.join(", ") || "requester and admins"}`}>NDA</Chip>}</div>
                      <div className="text-xs text-muted">{r.requesterName}{r.row.orgUnit ? ` · ${r.row.orgUnit}` : ""}{r.relatedBaseName ? ` · relates to ${r.relatedBaseName}` : ""}{r.row.path ? ` · ${r.row.path}` : ""}</div>
                      {r.row.description && <div className="text-xs text-ink-2 mt-1 max-w-xl line-clamp-2">{r.row.description}</div>}
                      <div className="mt-1"><Chip kind={labelForSource(r.row.recordSource)} /></div>
                    </td>
                    <td className="text-ink-2">{r.row.useCase ?? "—"}</td>
                    <td><Chip kind={r.row.status === "In Build" || r.row.status === "In build" ? "real" : r.row.status === "Shipped" ? "neutral" : "seeded"}>{r.row.status ?? "Proposed"}</Chip></td>
                    <td className="text-right"><span className={`chip !text-xs ${r.votes > 0 ? "!bg-amber !text-ink" : "chip-neutral"}`}>▲ {r.votes}</span></td>
                    <td className="text-right">
                      {r.votedByMe ? (
                        <form action={retract}><input type="hidden" name="requestId" value={r.row.id} /><input type="hidden" name="back" value={back} /><button className="btn btn-ghost !px-2 !py-1 !text-xs" type="submit">Retract</button></form>
                      ) : (
                        <form action={vote}><input type="hidden" name="requestId" value={r.row.id} /><input type="hidden" name="back" value={back} /><button className="btn !px-2 !py-1 !text-xs" type="submit" disabled={left === 0} title={left === 0 ? "No votes left" : "Upvote"}>▲ Vote</button></form>
                      )}
                    </td>
                  </tr>
                ))}
                {!ranked.length && <tr><td colSpan={6} className="text-sm text-muted">No requests match.</td></tr>}
              </tbody>
            </table>
          </div>
        </div>
        <aside className="flex flex-col gap-4">
          <div className="card p-4 text-center">
            <div className="eyebrow">Your votes left</div>
            <div className="text-3xl font-semibold tnum mt-1">{left} <span className="text-base text-muted">/ {foundryConfig.votes.quota}</span></div>
            <div className="text-xs text-muted mt-1">Retracting a vote keeps the record and turns Active off.</div>
          </div>
          <div className="card p-4">
            <div className="font-semibold text-sm">Your submissions</div>
            <ul className="mt-2 divide-y divide-line text-sm">
              {mine.map((r) => <li key={r.id} className="py-1.5 flex justify-between gap-2"><span className="truncate">{r.title}</span><span className="text-muted text-xs whitespace-nowrap">{r.status}</span></li>)}
              {!mine.length && <li className="py-1.5 text-muted text-xs">None yet.</li>}
            </ul>
          </div>
          <div className="card p-4 !bg-sky">
            <div className="font-semibold text-sm">Proposed, but you don't have to wait</div>
            <p className="text-xs text-ink-2 mt-1">Anything marked DIY sandbox can be started today in a sandbox workspace with verified datasets pre-linked.</p>
            <Link href="/build?step=3&path=DIY+sandbox" className="btn !mt-3 !text-xs">Start a sandbox build</Link>
          </div>
        </aside>
      </div>
    </div>
  );
}
