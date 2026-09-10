import Link from "next/link";
import { foundryConfig } from "../../../foundry.config";
import { getCurrentUser } from "@/lib/persona";
import { getData } from "@/lib/snapshot";
import { searchCatalog } from "@/lib/search";
import { choicesFor } from "@/lib/schema";
import { isSandboxWorkspace } from "@/lib/scope";
import { Chip } from "@/components/Chip";
import { submitRequest } from "../actions";

type SP = { q?: string; step?: string; path?: string; base?: string; msg?: string };

export default async function Build({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams;
  const q = (sp.q ?? "").trim();
  const step = Math.min(4, Math.max(1, Number(sp.step ?? (q ? 2 : 1)) || 1));
  const data = getData();
  const me = await getCurrentUser();
  const matches = q ? searchCatalog(data, me.scope, q, 6) : [];
  const paths = choicesFor("requests", "path");
  const useCases = choicesFor("requests", "useCase");
  const sandboxWs = data.workspaces.filter((w) => isSandboxWorkspace(w.name) && (me.isAdmin || me.scope.workspaces.has(w.id)));
  const link = (patch: Partial<SP>) => {
    const p = new URLSearchParams();
    const merged = { ...sp, ...patch };
    for (const [k, v] of Object.entries(merged)) if (v && k !== "msg") p.set(k, String(v));
    return `/build?${p.toString()}`;
  };
  const steps = ["Describe", "What already exists", "Choose a path", "Confirm"];

  return (
    <div className="max-w-5xl">
      <div className="eyebrow">Build something</div>
      <h1 className="text-2xl md:text-3xl font-semibold tracking-tight mt-1">New request</h1>
      <ol className="mt-4 flex flex-wrap gap-2 text-xs mono">
        {steps.map((s, i) => (
          <li key={s} className={`flex items-center gap-2 px-2.5 py-1.5 rounded ${i + 1 === step ? "bg-ink text-white" : i + 1 < step ? "bg-amber-soft text-ink" : "bg-card-2 text-muted"}`}>
            <span className="w-4 h-4 rounded-full grid place-items-center text-[10px] border border-current">{i + 1}</span>{s}
          </li>
        ))}
      </ol>
      {sp.msg && <div className="mt-4 card !bg-warn-bg px-4 py-2 text-sm">{sp.msg}</div>}

      {step === 1 && (
        <form method="get" className="card p-5 mt-6 flex flex-col gap-3 max-w-2xl">
          <label className="text-sm font-semibold" htmlFor="q">What are you building?</label>
          <textarea id="q" name="q" rows={3} defaultValue={q} placeholder="A place for our team to track quarterly initiatives, owners and status, with a calendar view…" />
          <input type="hidden" name="step" value="2" />
          <div className="flex flex-wrap gap-2 text-xs">{useCases.map((u) => <span key={u} className="chip chip-neutral">{u}</span>)}</div>
          <div className="text-xs text-muted">Org unit {me.orgUnit.value} · role {me.role} · scope {me.isAdmin ? "whole estate" : `${me.scope.bases.size} bases`}</div>
          <div><button className="btn btn-primary" type="submit">See what already exists →</button></div>
        </form>
      )}

      {step === 2 && (
        <div className="mt-6 grid lg:grid-cols-[minmax(0,1fr)_320px] gap-4">
          <div>
            <div className="flex items-baseline justify-between"><h2 className="font-semibold">{matches.length ? `${matches.length} existing things look close` : "Nothing obviously similar exists"}</h2><span className="text-xs text-muted mono flex items-center gap-1"><Chip kind="modelled" /> keyword match</span></div>
            <ul className="mt-3 flex flex-col gap-2">
              {matches.map((m) => {
                const base = m.kind === "base" ? data.baseById.get(m.id) : undefined;
                return (
                  <li key={m.kind + m.id} className="card p-4 flex items-center gap-4">
                    <div className="w-12 h-12 rounded grid place-items-center text-xs font-semibold tnum bg-sky">{Math.min(99, 40 + m.score * 12)}%</div>
                    <div className="min-w-0 flex-1">
                      <div className="font-medium truncate">{m.title}</div>
                      <div className="text-xs text-muted truncate">{m.subtitle}</div>
                    </div>
                    {m.inScope ? (
                      <div className="flex gap-2">
                        {base?.baseId && <a className="btn btn-ghost !text-xs" href={foundryConfig.urls.base(base.baseId)} target="_blank" rel="noreferrer">Open ↗</a>}
                        {m.kind === "request" && <Link className="btn btn-ghost !text-xs" href="/roadmap">Upvote</Link>}
                        {m.kind === "base" && <Link className="btn !text-xs" href={link({ step: "3", path: "Existing App", base: m.id })}>Use this</Link>}
                      </div>
                    ) : <Chip kind="locked">Access required</Chip>}
                  </li>
                );
              })}
            </ul>
            <div className="mt-4 flex gap-2">
              <Link href={link({ step: "1" })} className="btn btn-ghost">← Rephrase</Link>
              <Link href={link({ step: "3" })} className="btn btn-primary">None of these, pick a path →</Link>
            </div>
          </div>
          <aside className="card p-4 text-sm">
            <div className="eyebrow">Your request</div>
            <p className="mt-2 text-ink-2 whitespace-pre-wrap">{q}</p>
            <dl className="mt-3 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-xs"><dt className="text-muted">Org unit</dt><dd>{me.orgUnit.value}</dd><dt className="text-muted">Requester</dt><dd>{me.name}</dd><dt className="text-muted">Matched against</dt><dd>{data.bases.length} bases · {data.interfaces.length} interfaces · {data.datasets.length} datasets · {data.requests.length} proposals</dd></dl>
          </aside>
        </div>
      )}

      {step === 3 && (
        <div className="mt-6">
          <h2 className="font-semibold">Pick a path</h2>
          <p className="text-sm text-ink-2">You can change your mind later. A sandbox build can be handed over, and a queued request can be pulled back.</p>
          <div className="grid md:grid-cols-3 gap-4 mt-4">
            {[
              { name: paths.find((p) => /exist/i.test(p)) ?? "Existing App", bg: "!bg-sky", title: "Use an existing app", body: sp.base ? `We record that ${data.baseById.get(sp.base)?.name ?? "the selected base"} meets your need and note your team as a user.` : "Point at the app that already meets the need. We note your team as a user of it." },
              { name: paths.find((p) => /diy|sandbox/i.test(p)) ?? "DIY Sandbox", bg: "!bg-amber-soft", title: "Build it yourself in a sandbox", body: sandboxWs.length ? `You can build in ${sandboxWs.map((w) => w.name).slice(0, 2).join(" or ")}. Verified datasets are ready to link.` : "No sandbox workspace is in your scope yet; the request will ask for one." },
              { name: paths.find((p) => /team|build/i.test(p) && !/diy/i.test(p)) ?? "Team Build", bg: "!bg-lilac", title: `Submit it to the ${foundryConfig.requests.teamLabel} queue`, body: "Add a proposed timeline and budget. It enters the stack rank where others can upvote it." },
            ].map((c) => (
              <Link key={c.name} href={link({ step: "4", path: c.name })} className={`card p-5 ${c.bg} hover:-translate-y-0.5 transition-transform ${sp.path === c.name ? "ring-2 ring-ink" : ""}`}>
                <div className="font-semibold">{c.title}</div>
                <p className="text-sm text-ink-2 mt-1">{c.body}</p>
                <div className="mt-3 text-sm font-semibold">Choose →</div>
              </Link>
            ))}
          </div>
          <div className="mt-4"><Link href={link({ step: "2" })} className="btn btn-ghost">← Back to matches</Link></div>
        </div>
      )}

      {step === 4 && (
        <form action={submitRequest} className="card p-5 mt-6 grid md:grid-cols-2 gap-4 max-w-3xl">
          <div className="md:col-span-2 flex items-center gap-2 text-sm"><span className="eyebrow">Path</span><Chip kind="neutral">{sp.path ?? "Unspecified"}</Chip><input type="hidden" name="path" value={sp.path ?? ""} /></div>
          <label className="md:col-span-2 text-sm font-medium">Title<input name="title" required defaultValue={q.slice(0, 80)} className="mt-1" /></label>
          <label className="md:col-span-2 text-sm font-medium">Description<textarea name="description" rows={3} defaultValue={q} className="mt-1" /></label>
          <label className="text-sm font-medium">Use case<select name="useCase" className="mt-1"><option value="">Choose…</option>{useCases.map((u) => <option key={u}>{u}</option>)}</select></label>
          <label className="text-sm font-medium">Related base<select name="relatedBase" defaultValue={sp.base ?? ""} className="mt-1"><option value="">None</option>{data.bases.filter((b) => me.isAdmin || me.scope.bases.has(b.id)).sort((a, b) => (a.name ?? "").localeCompare(b.name ?? "")).map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}</select></label>
          <label className="text-sm font-medium">Team size<input name="teamSize" type="number" min={1} className="mt-1" /></label>
          <label className="text-sm font-medium">Proposed timeline<input name="timeline" type="date" className="mt-1" /></label>
          <label className="text-sm font-medium">Budget (USD)<input name="budget" type="number" min={0} step={100} className="mt-1" /></label>
          <div className="text-sm">
            <div className="font-medium">Visibility</div>
            <label className="flex items-center gap-2 mt-1"><input type="checkbox" name="nda" className="!w-auto" /> NDA: only listed groups, the requester and admins can see this</label>
            <div className="mt-2 flex flex-col gap-1 pl-1">
              {data.groups.map((g) => <label key={g.id} className="flex items-center gap-2 text-xs"><input type="checkbox" name="visibleToGroups" value={g.id} className="!w-auto" /> {g.name} <span className="text-muted">({g.members?.length ?? 0})</span></label>)}
            </div>
          </div>
          <div className="md:col-span-2 text-xs text-muted">Submitted as {me.name} · org unit {me.orgUnit.value} · written to the Requests table with Record Source = Demo.</div>
          <div className="md:col-span-2 flex gap-2"><Link href={link({ step: "3" })} className="btn btn-ghost">← Back</Link><button className="btn btn-primary" type="submit">Submit request</button></div>
        </form>
      )}
    </div>
  );
}
