import Link from "next/link";
import { foundryConfig } from "../../foundry.config";
import { getCurrentUser } from "@/lib/persona";
import { getData } from "@/lib/snapshot";
import { rankRequests } from "@/lib/requests";
import { Chip } from "@/components/Chip";

export default async function Home() {
  const data = getData();
  const me = await getCurrentUser();
  const inScopeBases = me.isAdmin ? data.bases.length : me.scope.bases.size;
  const inScopeInterfaces = me.isAdmin ? data.interfaces.length : me.scope.interfaces.size;
  const top = rankRequests(data, me).slice(0, 5);
  const verified = data.datasets.filter((d) => d.verified).length;
  const hour = new Date().getHours();
  const greet = hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";

  return (
    <div className="max-w-6xl">
      <div className="eyebrow">{greet}, {me.name.split(" ")[0]}</div>
      <h1 className="text-3xl md:text-4xl font-semibold tracking-tight mt-1">What are you building today?</h1>
      <form action="/build" method="get" className="mt-4 flex gap-2 max-w-2xl">
        <input name="q" placeholder="Describe it in a sentence, or ask what already exists…" aria-label="Describe what you are building" />
        <button className="btn btn-primary" type="submit">Ask</button>
      </form>
      <div className="mt-2 flex flex-wrap gap-2 text-xs">
        {["What's available to me?", "Who owns supplier data?", "Show me marketing ops apps", "Meal planning"].map((s) => (
          <Link key={s} href={`/ask?q=${encodeURIComponent(s)}`} className="chip chip-neutral !py-1.5 !px-2.5 !text-[11px] hover:bg-line">{s}</Link>
        ))}
      </div>

      <div className="grid md:grid-cols-3 gap-4 mt-8">
        <Link href="/build" className="card p-5 !bg-amber-soft hover:-translate-y-0.5 transition-transform">
          <div className="eyebrow">Path 01</div>
          <div className="text-lg font-semibold mt-1">Build something new</div>
          <p className="text-sm text-ink-2 mt-1">Tell us the job to be done. We show what exists before you start from zero.</p>
          <div className="mt-4 text-sm font-semibold">Start →</div>
        </Link>
        <Link href="/library" className="card p-5 !bg-sky hover:-translate-y-0.5 transition-transform">
          <div className="eyebrow">Path 02</div>
          <div className="text-lg font-semibold mt-1">Browse the library</div>
          <p className="text-sm text-ink-2 mt-1"><b className="tnum">{inScopeBases}</b> bases and <b className="tnum">{inScopeInterfaces}</b> interfaces you can open today, plus <b className="tnum">{data.datasets.length}</b> verified datasets.</p>
          <div className="mt-4 text-sm font-semibold">Browse →</div>
        </Link>
        <Link href="/build?step=3&path=Team+build" className="card p-5 !bg-lilac hover:-translate-y-0.5 transition-transform">
          <div className="eyebrow">Path 03</div>
          <div className="text-lg font-semibold mt-1">Ask {foundryConfig.requests.teamLabel} to build it</div>
          <p className="text-sm text-ink-2 mt-1">Submit an intake with a timeline and budget. It joins the stack rank others can vote up.</p>
          <div className="mt-4 text-sm font-semibold">Submit intake →</div>
        </Link>
      </div>

      <div className="grid lg:grid-cols-2 gap-4 mt-8">
        <section className="card p-5">
          <div className="flex items-baseline justify-between">
            <h2 className="font-semibold">Verified datasets</h2>
            <span className="text-xs text-muted mono">{verified} verified · {data.datasets.length} total</span>
          </div>
          <ul className="mt-3 divide-y divide-line">
            {data.datasets.slice(0, 6).map((d) => (
              <li key={d.id} className="py-2 flex items-center gap-3">
                <span className={`w-2 h-2 rounded-full flex-none ${d.owner ? "bg-real" : "bg-line-2"}`} title={d.owner ? `Steward: ${d.owner.name ?? d.owner.email}` : "No steward assigned"} />
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-medium truncate">{d.name}</div>
                  <div className="text-xs text-muted truncate">{d.orgUnit ?? "No org unit"} · {d.owner?.name ?? "unowned"} · {(d.basesUsing ?? []).length} bases use it</div>
                </div>
                {d.verified && <Chip kind="real">Verified</Chip>}
              </li>
            ))}
          </ul>
          <Link href="/library#datasets" className="text-sm font-semibold mt-3 inline-block">See all {data.datasets.length} →</Link>
        </section>
        <section className="card p-5">
          <div className="flex items-baseline justify-between">
            <h2 className="font-semibold">On the roadmap</h2>
            <span className="text-xs text-muted mono">ranked by votes</span>
          </div>
          <ul className="mt-3 divide-y divide-line">
            {top.map((r) => (
              <li key={r.row.id} className="py-2 flex items-center gap-3">
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-medium truncate">{r.row.title}</div>
                  <div className="text-xs text-muted truncate">{r.row.status ?? "Proposed"} · {r.row.useCase ?? "Uncategorised"} · {r.requesterName}</div>
                </div>
                <span className={`chip ${r.votes > 0 ? "!bg-amber !text-ink" : "chip-neutral"} !text-xs`}>▲ {r.votes}</span>
              </li>
            ))}
            {!top.length && <li className="py-2 text-sm text-muted">Nothing on the roadmap yet. Submit the first request.</li>}
          </ul>
          <Link href="/roadmap" className="text-sm font-semibold mt-3 inline-block">See the stack rank →</Link>
        </section>
      </div>
    </div>
  );
}
