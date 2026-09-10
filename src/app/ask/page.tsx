import Link from "next/link";
import { foundryConfig } from "../../../foundry.config";
import { getCurrentUser } from "@/lib/persona";
import { getData } from "@/lib/snapshot";
import { searchCatalog } from "@/lib/search";
import { canSee } from "@/lib/requests";
import { Chip } from "@/components/Chip";

export default async function Ask({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const { q = "" } = await searchParams;
  const data = getData();
  const me = await getCurrentUser();
  const results = q ? searchCatalog(data, me.scope, q, 12) : [];
  const canOpen = results.filter((r) => r.inScope && (r.kind === "base" || r.kind === "interface"));
  const canLink = results.filter((r) => r.kind === "dataset");
  const locked = results.filter((r) => !r.inScope);
  const proposals = results.filter((r) => r.kind === "request").filter((r) => { const req = data.requestById.get(r.id); return req ? canSee(req, me) : false; });
  const visibleRequests = data.requests.filter((r) => canSee(r, me)).length;

  return (
    <div className="max-w-6xl grid lg:grid-cols-[minmax(0,1fr)_300px] gap-4">
      <div>
        <div className="eyebrow">Ask Foundry</div>
        <h1 className="text-2xl md:text-3xl font-semibold tracking-tight mt-1">What's available to me?</h1>
        <form method="get" className="mt-4 flex gap-2">
          <input name="q" defaultValue={q} placeholder="e.g. supplier onboarding, meal planning, project roadmap" aria-label="Ask" />
          <button className="btn btn-primary" type="submit">Ask</button>
        </form>
        <div className="mt-2 flex items-center gap-2 text-xs text-muted"><Chip kind="modelled">Deterministic search · no model</Chip> Answers are computed from the snapshot and filtered by your access. The Claude-backed version arrives in v2.</div>

        {q && (
          <div className="mt-6 flex flex-col gap-4">
            <div className="card p-4 text-sm">
              {results.length ? <>Within your scope there {canOpen.length === 1 ? "is" : "are"} <b>{canOpen.length}</b> thing{canOpen.length === 1 ? "" : "s"} you can open today, <b>{canLink.length}</b> verified dataset{canLink.length === 1 ? "" : "s"} you could link, <b>{proposals.length}</b> related proposal{proposals.length === 1 ? "" : "s"} and <b>{locked.length}</b> item{locked.length === 1 ? "" : "s"} that exist but need access.</> : <>Nothing in the catalog matches “{q}”. Nothing on the roadmap duplicates it either, so a request would be new.</>}
            </div>
            {[["You can open", canOpen], ["You can link", canLink], ["Related proposals", proposals], ["Exists, access required", locked]].map(([title, list]) => (list as typeof results).length > 0 && (
              <section key={title as string}>
                <h2 className="font-semibold text-sm">{title as string}</h2>
                <ul className="mt-2 flex flex-col gap-2">
                  {(list as typeof results).map((r) => {
                    const base = r.kind === "base" ? data.baseById.get(r.id) : undefined;
                    return (
                      <li key={r.kind + r.id} className="card p-3 flex items-center gap-3">
                        <Chip kind={r.inScope ? (r.kind === "dataset" ? "real" : "neutral") : "locked"}>{r.inScope ? r.kind : "locked"}</Chip>
                        <div className="min-w-0 flex-1"><div className="text-sm font-medium truncate">{r.title}</div><div className="text-xs text-muted truncate">{r.subtitle}</div></div>
                        {base?.baseId && r.inScope && <a className="btn btn-ghost !text-xs" href={foundryConfig.urls.base(base.baseId)} target="_blank" rel="noreferrer">Open ↗</a>}
                        {r.kind === "request" && <Link className="btn btn-ghost !text-xs" href="/roadmap">Roadmap</Link>}
                        {!r.inScope && <button className="btn btn-ghost !text-xs" disabled title="Access requests arrive in v2">Request access</button>}
                      </li>
                    );
                  })}
                </ul>
              </section>
            ))}
            {!!results.length && <div className="text-sm"><Link href={`/build?q=${encodeURIComponent(q)}`} className="btn">Nothing fits? Start a request →</Link></div>}
          </div>
        )}
      </div>
      <aside className="card p-4 text-sm h-fit">
        <div className="eyebrow">Answering with</div>
        <ul className="mt-2 flex flex-col gap-2">
          <li className="card p-2.5"><b>{me.isAdmin ? data.bases.length : me.scope.bases.size}</b> bases in your scope<div className="text-xs text-muted">of {data.bases.length} in the estate</div></li>
          <li className="card p-2.5"><b>{data.datasets.length}</b> verified datasets<div className="text-xs text-muted">schema and steward only</div></li>
          <li className="card p-2.5"><b>{visibleRequests}</b> roadmap items<div className="text-xs text-muted">{data.requests.length - visibleRequests > 0 ? "excluding NDA-flagged items" : "none hidden from you"}</div></li>
        </ul>
        <div className="eyebrow mt-4">Your scope</div>
        <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-xs"><dt className="text-muted">Role</dt><dd>{me.role}</dd><dt className="text-muted">Org unit</dt><dd>{me.orgUnit.value}</dd><dt className="text-muted">Groups</dt><dd>{me.groupNames.join(", ") || "none"}</dd><dt className="text-muted">Account</dt><dd>{me.external ? "external" : "member"}</dd></dl>
      </aside>
    </div>
  );
}
