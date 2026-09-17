import Link from "next/link";
import { foundryConfig } from "../../../foundry.config";
import { getCurrentUser } from "@/lib/persona";
import { getData } from "@/lib/snapshot";
import { canSee } from "@/lib/requests";
import { ask, assistantMode } from "@/lib/assistant";
import { Chip } from "@/components/Chip";

/** Render **bold** and `code` spans from model text without a markdown library. */
function inline(text: string): React.ReactNode[] {
  return text.split(/(\*\*[^*]+\*\*|`[^`]+`)/g).map((part, i) => {
    if (/^\*\*[^*]+\*\*$/.test(part)) return <strong key={i}>{part.slice(2, -2)}</strong>;
    if (/^`[^`]+`$/.test(part)) return <code key={i}>{part.slice(1, -1)}</code>;
    return part;
  });
}

export default async function Ask({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const { q = "" } = await searchParams;
  const data = getData();
  const me = await getCurrentUser();
  const mode = assistantMode();
  const result = q ? await ask(data, me, q) : undefined;
  const visibleRequests = data.requests.filter((r) => r.title && canSee(r, me)).length;
  const groups = result ? [
    ["You can open", result.sources.filter((s) => s.inScope && (s.kind === "base" || s.kind === "interface"))],
    ["You can link", result.sources.filter((s) => s.kind === "dataset")],
    ["Related proposals", result.sources.filter((s) => s.kind === "request")],
    ["People and workspaces", result.sources.filter((s) => s.kind === "workspace")],
    ["Exists, access required", result.sources.filter((s) => !s.inScope)],
  ] as const : [];

  return (
    <div className="max-w-6xl grid lg:grid-cols-[minmax(0,1fr)_300px] gap-4">
      <div>
        <div className="eyebrow">Ask Foundry</div>
        <h1 className="text-2xl md:text-3xl font-semibold tracking-tight mt-1">What's available to me?</h1>
        <form method="get" className="mt-4 flex gap-2">
          <input name="q" defaultValue={q} placeholder="e.g. what can I use for supplier onboarding? who owns the food price data?" aria-label="Ask" />
          <button className="btn btn-primary" type="submit">Ask</button>
        </form>
        <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-muted">
          {mode === "claude"
            ? <><Chip kind="real">Claude · {foundryConfig.assistant.model}</Chip> Read-only tools over the snapshot, bound to your access. No prompt content is stored. Authority capped at recommending.</>
            : <><Chip kind="modelled">Deterministic search · no model</Chip> Set ANTHROPIC_API_KEY to enable Claude.</>}
        </div>

        {result && (
          <div className="mt-6 flex flex-col gap-4">
            <div className="card p-5 text-[15px] leading-relaxed">
              {result.answer.split(/\n{2,}/).map((para, i) => {
                const lines = para.split("\n");
                const isList = lines.every((l) => /^\s*([-*•]|\d+\.)\s+/.test(l));
                return isList
                  ? <ul key={i} className="list-disc pl-5 my-2 flex flex-col gap-1">{lines.map((l, j) => <li key={j}>{inline(l.replace(/^\s*([-*•]|\d+\.)\s+/, ""))}</li>)}</ul>
                  : <p key={i} className="my-2 first:mt-0 last:mb-0">{inline(para)}</p>;
              })}
              {result.error && <div className="mt-3 text-xs text-model">Claude was unavailable ({result.error.slice(0, 120)}); this is the keyword answer.</div>}
            </div>

            {result.draft && (
              <div className="card p-4 !bg-lilac">
                <div className="eyebrow">Drafted for you · not submitted</div>
                <div className="font-semibold mt-1">{result.draft.title}</div>
                <p className="text-sm text-ink-2 mt-1">{result.draft.description}</p>
                <Link href={`/build?step=4&path=Team+Build&q=${encodeURIComponent(result.draft.description)}`} className="btn !mt-3 !text-xs">Review and submit in the wizard →</Link>
              </div>
            )}

            {groups.map(([title, list]) => list.length > 0 && (
              <section key={title}>
                <h2 className="font-semibold text-sm">{title}</h2>
                <ul className="mt-2 flex flex-col gap-2">
                  {list.map((s) => (
                    <li key={s.kind + s.id} className="card p-3 flex items-center gap-3">
                      <Chip kind={s.inScope ? (s.kind === "dataset" ? "real" : "neutral") : "locked"}>{s.inScope ? s.kind : "locked"}</Chip>
                      <div className="min-w-0 flex-1"><div className="text-sm font-medium truncate">{s.title}</div><div className="text-xs text-muted truncate">{s.subtitle}</div></div>
                      {s.href && s.inScope && (s.href.startsWith("/") ? <Link className="btn btn-ghost !text-xs" href={s.href}>Open</Link> : <a className="btn btn-ghost !text-xs" href={s.href} target="_blank" rel="noreferrer">Open ↗</a>)}
                      {!s.inScope && <button className="btn btn-ghost !text-xs" disabled title="Access requests arrive in v2">Request access</button>}
                    </li>
                  ))}
                </ul>
              </section>
            ))}
            {!result.draft && <div className="text-sm"><Link href={`/build?q=${encodeURIComponent(q)}`} className="btn">Nothing fits? Start a request →</Link></div>}
          </div>
        )}
      </div>

      <aside className="card p-4 text-sm h-fit">
        <div className="eyebrow">Answering with</div>
        <ul className="mt-2 flex flex-col gap-2">
          <li className="card p-2.5"><b>{me.scope.bases.size}</b> bases in your scope<div className="text-xs text-muted">of {data.bases.length} in the estate</div></li>
          <li className="card p-2.5"><b>{data.datasets.length}</b> verified datasets<div className="text-xs text-muted">schema and steward only</div></li>
          <li className="card p-2.5"><b>{visibleRequests}</b> roadmap items<div className="text-xs text-muted">{data.requests.filter((r) => r.title).length - visibleRequests > 0 ? "excluding NDA-flagged items" : "none hidden from you"}</div></li>
        </ul>
        <div className="eyebrow mt-4">Your scope</div>
        <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-xs"><dt className="text-muted">Role</dt><dd>{me.role}</dd><dt className="text-muted">Org unit</dt><dd>{me.orgUnit.value}</dd><dt className="text-muted">Groups</dt><dd>{me.groupNames.join(", ") || "none"}</dd><dt className="text-muted">Account</dt><dd>{me.external ? "external" : "member"}</dd></dl>
        {result && result.toolCalls.length > 0 && (
          <>
            <div className="eyebrow mt-4">Tools it used</div>
            <ul className="mt-2 flex flex-col gap-1 text-xs mono">
              {result.toolCalls.map((c, i) => <li key={i} className="flex justify-between gap-2"><span className="truncate">{c.name}{c.input.query ? `("${String(c.input.query).slice(0, 24)}")` : ""}</span><span className="text-muted whitespace-nowrap">{c.resultCount} result{c.resultCount === 1 ? "" : "s"}</span></li>)}
            </ul>
            {result.usage && <div className="mt-2 text-[11px] text-muted mono">{result.usage.iterations} turns · {result.usage.inputTokens + result.usage.outputTokens} tokens{result.usage.cacheRead ? ` (${result.usage.cacheRead} cached)` : ""} · {(result.usage.ms / 1000).toFixed(1)}s{result.cached ? " · served from cache" : ""}</div>}
          </>
        )}
      </aside>
    </div>
  );
}
