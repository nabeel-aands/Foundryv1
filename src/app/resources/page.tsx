import Link from "next/link";
import { getData, type TrainingResource } from "@/lib/snapshot";
import { foundryConfig } from "@/lib/config";
import { Chip } from "@/components/Chip";

type SP = { kind?: string; q?: string };
const kindOf = (r: TrainingResource): "guides" | "docs" | "sessions" => /session/i.test(r.format ?? "") ? "sessions" : /doc/i.test(r.format ?? "") ? "docs" : "guides";
const isUrl = (s?: string) => !!s && /^https?:\/\//i.test(s);
const LEVELS = ["Beginner", "Intermediate", "Advanced"];
const levelRank = (l?: string) => { const i = LEVELS.indexOf(l ?? ""); return i < 0 ? 99 : i; };
const mins = (n?: number) => (n ? `${n} min` : "");

export default async function Resources({ searchParams }: { searchParams: Promise<SP> }) {
  const { kind: kindParam = "", q = "" } = await searchParams;
  const kind = ["guides", "docs", "sessions"].includes(kindParam) ? kindParam : "";
  const data = await getData();
  const all = data.trainingResources;
  const n = { guides: all.filter((r) => kindOf(r) === "guides").length, docs: all.filter((r) => kindOf(r) === "docs").length, sessions: all.filter((r) => kindOf(r) === "sessions").length };
  const needle = q.trim().toLowerCase();
  const shown = all.filter((r) =>
    (!kind || kindOf(r) === kind) &&
    (!needle || `${r.title} ${r.description ?? ""} ${r.topic ?? ""}`.toLowerCase().includes(needle)));
  const href = (k: string) => {
    const p = new URLSearchParams();
    if (q) p.set("q", q);
    if (k && k !== kind) p.set("kind", k);
    const str = p.toString();
    return str ? `/resources?${str}` : "/resources";
  };
  const heading = kind === "guides" ? "Guides and videos" : kind === "docs" ? "Help documentation" : kind === "sessions" ? "Live sessions" : "All resources";
  const path = [...all].sort((a, b) => levelRank(a.level) - levelRank(b.level) || (a.durationMin ?? 0) - (b.durationMin ?? 0));
  const totalMin = all.reduce((n, r) => n + (r.durationMin ?? 0), 0);

  return (
    <div className="max-w-6xl">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="eyebrow">Resources</div>
          <h1 className="text-2xl md:text-3xl font-semibold tracking-tight mt-1">Learn Airtable the way we use it</h1>
          <p className="text-sm text-ink-2 mt-1 max-w-2xl">Guides, documentation and live sessions that take you from viewer to builder. Reusable components live in the <Link className="underline" href="/library">Airtable Library</Link>.</p>
        </div>
        <form className="flex gap-2 w-full md:w-80" method="get">
          <input name="q" defaultValue={q} placeholder="Search resources" aria-label="Search resources" />
          {kind && <input type="hidden" name="kind" value={kind} />}
          <button className="btn" type="submit">Search</button>
        </form>
      </div>

      <div className="grid md:grid-cols-3 gap-4 mt-6">
        {([
          { k: "guides", bg: "!bg-sky", title: "Guides and videos", body: "Short walkthroughs for the things people get stuck on." },
          { k: "docs", bg: "!bg-lilac", title: "Help documentation", body: "Airtable's own docs, picked for how we work." },
          { k: "sessions", bg: "!bg-amber-soft", title: "Live sessions", body: `Kickoffs and office hours with ${foundryConfig.requests.teamLabel}.` },
        ] as const).map((t) => (
          <Link key={t.k} href={href(t.k)} aria-pressed={kind === t.k} className={`card relative p-5 ${t.bg} hover:-translate-y-0.5 transition-transform ${kind === t.k ? "ring-2 ring-ink" : ""}`}>
            <span className="absolute top-3 right-3 text-lg leading-none font-semibold" aria-hidden>{kind === t.k ? "✕" : "↗"}</span>
            <span className="sr-only">{kind === t.k ? "Clear filter" : "Show only these"}</span>
            <div className="text-3xl font-semibold tnum">{n[t.k]}</div>
            <div className="font-semibold mt-1">{t.title}</div>
            <p className="text-sm text-ink-2">{t.body}</p>
          </Link>
        ))}
      </div>

      <h2 className="font-semibold mt-8">{heading}</h2>

      <div className="grid md:grid-cols-3 gap-3 mt-3">
        {shown.map((r) => (
          <div key={r.id} className="card p-4 flex flex-col">
            <div className="flex flex-wrap items-center gap-2">
              {r.topic && <Chip kind="neutral">{r.topic}</Chip>}
              {r.durationMin ? <span className="text-xs text-muted mono">{mins(r.durationMin)}</span> : null}
            </div>
            <div className="font-semibold mt-2">{r.title}</div>
            <p className="text-sm text-ink-2 mt-1 flex-1">{r.description}</p>
            <div className="text-xs text-muted mt-3">{[r.format, r.level, r.source].filter(Boolean).join(" · ")}</div>
            <div className="mt-3">
              {isUrl(r.url)
                ? <a className="btn btn-primary !text-xs" href={r.url} target="_blank" rel="noreferrer">Open ↗</a>
                : <button className="btn !text-xs" disabled title="No link has been added in Airtable yet">{/session/i.test(r.format ?? "") ? "Details coming soon" : "Link coming soon"}</button>}
            </div>
          </div>
        ))}
        {!shown.length && <div className="card p-6 text-sm text-muted md:col-span-3">{all.length ? "Nothing matches." : "The Training Resources table has no rows yet."}</div>}
      </div>

      <div className="grid lg:grid-cols-[minmax(0,1fr)_320px] gap-4 mt-8">
        <section className="card">
          <header className="px-4 py-3 border-b border-line font-semibold">Learning path · viewer to builder <span className="text-xs text-muted mono ml-1">{path.length} items · about {Math.round(totalMin / 60 * 10) / 10} h</span></header>
          <ol className="divide-y divide-line">
            {path.map((p, i) => (
              <li key={p.id} className="px-4 py-3 flex items-center gap-3 text-sm">
                <span className="w-6 h-6 rounded-full grid place-items-center text-xs mono border border-line-2 flex-none">{i + 1}</span>
                <span className="flex-1 min-w-0 truncate">{p.title}</span>
                <span className="text-xs text-muted flex-none">{[p.level, mins(p.durationMin)].filter(Boolean).join(" · ")}</span>
              </li>
            ))}
          </ol>
        </section>
        <section className="card p-5 !bg-side !text-side-text self-start">
          <div className="eyebrow !text-side-text/60">Build alongside us</div>
          <div className="font-semibold text-white mt-1">Stuck halfway through a build?</div>
          <p className="text-sm mt-1">Join an office-hours session and {foundryConfig.requests.teamLabel} builds it with you rather than for you. You keep ownership.</p>
        </section>
      </div>
    </div>
  );
}
