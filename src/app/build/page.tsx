import Link from "next/link";
import { foundryConfig } from "@/lib/config";
import { getCurrentUser } from "@/lib/persona";
import { getData } from "@/lib/snapshot";
import { matchScore, ownersOfBase, searchBases, searchDatasets, searchLibraryBoosted } from "@/lib/search";
import { displayName } from "@/lib/snapshot";
import { myActiveVotes, rankRequests } from "@/lib/requests";
import { CatalogCard } from "@/components/CatalogCard";
import { DatasetCard } from "@/components/DatasetCard";
import { MoreList } from "@/components/MoreList";
import { choicesFor } from "@/lib/schema";
import { isSandboxWorkspace } from "@/lib/scope";
import { Chip } from "@/components/Chip";
import { InfoTip } from "@/components/InfoTip";
import { RequestAccess } from "@/components/RequestAccess";
import { accessRequestsAvailable, pendingRequestFor } from "@/lib/access";
import { retract, submitRequest, vote } from "../actions";

type SP = { q?: string; step?: string; path?: string; base?: string; dataset?: string; msg?: string; none?: string };

export default async function Build({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams;
  const q = (sp.q ?? "").trim();
  const step = Math.min(4, Math.max(1, Number(sp.step ?? (q ? 2 : 1)) || 1));
  const data = await getData();
  const me = await getCurrentUser();
  const library = q ? searchLibraryBoosted(data, q) : [];
  const datasets = q ? searchDatasets(data, q) : [];
  const bases = q ? searchBases(data, me.scope, q) : [];
  const requested = q ? rankRequests(data, me).filter((r) => matchScore(`${r.row.title ?? ""} ${r.row.description ?? ""} ${r.row.useCase ?? ""}`, q) > 0) : [];
  const total = library.length + datasets.length + bases.length + requested.length;
  const votesLeft = Math.max(0, foundryConfig.votes.quota - myActiveVotes(data, me.user).length);
  const paths = choicesFor("requests", "path");
  const useCases = choicesFor("requests", "useCase");
  const existingPath = paths.find((p) => /exist/i.test(p)) ?? "Existing App";
  const diyPath = paths.find((p) => /diy|sandbox/i.test(p)) ?? "DIY Sandbox";
  const chosenDataset = sp.dataset ? data.datasets.find((d) => d.id === sp.dataset) : undefined;
  const sandboxWs = data.workspaces.filter((w) => isSandboxWorkspace(w.name) && (me.isAdmin || me.scope.workspaces.has(w.id)));
  const link = (patch: Partial<SP>) => {
    const p = new URLSearchParams();
    const merged = { ...sp, ...patch };
    for (const [k, v] of Object.entries(merged)) if (v && k !== "msg") p.set(k, String(v));
    return `/build?${p.toString()}`;
  };
  const steps = ["Describe", "What already exists", "Choose a path", "Confirm"];

  return (
    <div>
      <div className="eyebrow">Build something</div>
      <h1 className="text-2xl md:text-3xl font-semibold tracking-tight mt-1">New request</h1>
      <ol className="mt-4 flex flex-wrap gap-2">
        {steps.map((s, i) => (
          <li key={s} className={`pill cursor-default ${i + 1 === step ? "pill-active" : i + 1 < step ? "!bg-amber-soft" : "!text-muted"}`}>
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
            <div className="flex items-baseline justify-between"><h2 className="font-semibold">{total ? `${total} existing things look close` : "Nothing obviously similar exists"}</h2><span className="text-xs text-muted mono flex items-center gap-1.5"><Chip kind="modelled" /> keyword match
                <InfoTip title="HOW MATCHING WORKS" label="How matching works">
                  Your request is split into keywords (filler words dropped). Library items, verified datasets, bases, interfaces and proposals are checked for those words in their name and description. It is a word comparison, not an understanding of meaning, so also scan the lists yourself.
                </InfoTip></span></div>

            <Section title="From the Airtable Library" hint="Reusable apps, components and templates. Start here before building from a blank base." count={library.length}>
              <MoreList className="grid md:grid-cols-2 gap-3" items={library.map((c) => <CatalogCard key={c.id} c={c} />)} />
            </Section>

            <Section title="Verified datasets" hint="Link a steward-maintained source table instead of copying data." count={datasets.length}>
              <MoreList className="grid md:grid-cols-2 gap-3" items={datasets.map((d) => (
                <DatasetCard key={d.id} d={d} action={<Link className="btn !text-xs" href={link({ step: "3", path: diyPath, dataset: d.id, base: "", none: "" })}>Use this</Link>} />
              ))} />
            </Section>

            <Section title="Existing bases and interfaces" hint="Speak with the owner before building something similar. They may already have what you need, or be glad to share it." count={bases.length}>
              <MoreList className="flex flex-col gap-2" items={bases.map((m) => {
                const base = m.kind === "base" ? data.baseById.get(m.id) : data.baseOfInterface.get(m.id);
                const owners = base ? ownersOfBase(data, base) : [];
                return (
                  <div key={m.kind + m.id} className="card p-4">
                    <div className="flex items-center gap-4">
                      <div className="min-w-0 flex-1">
                        <div className="font-medium truncate">{m.title}</div>
                        <div className="text-xs text-muted truncate">{m.subtitle}</div>
                      </div>
                      {m.inScope ? (
                        <div className="flex gap-2">
                          {m.kind === "base" && base?.baseId && <a className="btn btn-ghost !text-xs" href={foundryConfig.urls.base(base.baseId)} target="_blank" rel="noreferrer">Open ↗</a>}
                          {m.kind === "base" && <Link className="btn !text-xs" href={link({ step: "3", path: existingPath, base: m.id, dataset: "", none: "" })}>Use this</Link>}
                        </div>
                      ) : (
                        <div className="flex items-center gap-2">
                          <Chip kind="locked">Access required</Chip>
                          <RequestAccess
                            baseId={m.kind === "base" ? m.id : undefined}
                            interfaceId={m.kind === "interface" ? m.id : undefined}
                            back={link({})} available={accessRequestsAvailable()}
                            pending={!!pendingRequestFor(data, me.user.id, m.kind === "base" ? { baseId: m.id } : { interfaceId: m.id })}
                            small
                          />
                        </div>
                      )}
                    </div>
                    <div className="mt-2 text-xs text-ink-2 bg-amber-soft rounded px-2.5 py-1.5">
                      Speak with the owner before building.{" "}
                      {owners.length
                        ? owners.map((u, i) => (
                            <span key={u.id}>{i > 0 && ", "}<span className="font-medium">{displayName(u)}</span>{u.email && <> · <a className="underline" href={`mailto:${u.email}`}>{u.email}</a></>}</span>
                          ))
                        : <span className="text-muted">No owner is recorded for this workspace.</span>}
                    </div>
                  </div>
                );
              })} />
            </Section>

            <Section title="Already requested" hint="Someone may have asked for this already. Upvote it instead of filing a duplicate." count={requested.length}>
              <MoreList className="flex flex-col gap-2" items={requested.map((r) => (
                <div key={r.row.id} className="card p-4 flex items-center gap-4">
                  <div className="min-w-0 flex-1">
                    <div className="font-medium truncate">{r.row.title}</div>
                    <div className="text-xs text-muted truncate">{r.requesterName}{r.row.orgUnit ? ` · ${r.row.orgUnit}` : ""}</div>
                  </div>
                  {r.row.status && <Chip kind="neutral">{r.row.status}</Chip>}
                  <span className={`chip !text-xs ${r.votes > 0 ? "!bg-amber !text-ink" : "chip-neutral"}`}>▲ {r.votes}</span>
                  <form action={r.votedByMe ? retract : vote}>
                    <input type="hidden" name="requestId" value={r.row.id} />
                    <input type="hidden" name="back" value={link({})} />
                    {r.votedByMe
                      ? <button className="btn btn-ghost !px-2 !py-1 !text-xs" type="submit">Retract</button>
                      : <button className="btn !px-2 !py-1 !text-xs" type="submit" disabled={votesLeft === 0} title={votesLeft === 0 ? "No votes left" : "Upvote"}>▲ Vote</button>}
                  </form>
                </div>
              ))} />
            </Section>
            <div className="mt-4 flex gap-2">
              <Link href={link({ step: "1" })} className="btn btn-ghost">← Rephrase</Link>
              <Link href={link({ step: "3", none: "1", base: "", dataset: "", path: "" })} className="btn btn-primary">None of these, pick a path →</Link>
            </div>
          </div>
          <aside className="card p-4 text-sm">
            <div className="eyebrow">Your request</div>
            <p className="mt-2 text-ink-2 whitespace-pre-wrap">{q}</p>
            <dl className="mt-3 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-xs"><dt className="text-muted">Org unit</dt><dd>{me.orgUnit.value}</dd><dt className="text-muted">Requester</dt><dd>{me.name}</dd><dt className="text-muted">Matched against</dt><dd>{data.catalogItems.length} library items · {data.datasets.length} datasets · {data.bases.length} bases · {data.interfaces.length} interfaces · {data.requests.length} proposals</dd></dl>
          </aside>
        </div>
      )}

      {step === 3 && (
        <div className="mt-6">
          <h2 className="font-semibold">Pick a path</h2>
          <p className="text-sm text-ink-2">You can change your mind later. A sandbox build can be handed over, and a queued request can be pulled back.</p>
          <div className={`grid gap-4 mt-4 ${sp.none ? "md:grid-cols-2 max-w-3xl" : "md:grid-cols-3"}`}>
            {[
              { name: existingPath, bg: "!bg-sky", title: "Use an existing app", body: sp.base ? `We record that ${data.baseById.get(sp.base)?.name ?? "the selected base"} meets your need and note your team as a user.` : "Point at the app that already meets the need. We note your team as a user of it." },
              { name: diyPath, href: "/resources", bg: "!bg-amber-soft", title: "Build it yourself in a sandbox", body: sandboxWs.length ? `You can build in ${sandboxWs.map((w) => w.name).slice(0, 2).join(" or ")}. ${chosenDataset ? `${chosenDataset.name} will be noted on your request.` : "Verified datasets are ready to link."}` : "No sandbox workspace is in your scope yet; the request will ask for one." },
              { name: paths.find((p) => /team|build/i.test(p) && !/diy/i.test(p)) ?? "Team Build", bg: "!bg-lilac", title: `Submit it to the ${foundryConfig.requests.teamLabel} queue`, body: "Add a proposed timeline and budget. It enters the stack rank where others can upvote it." },
            ].filter((_, i) => !(sp.none && i === 0)).map((c) => (
              <Link key={c.name} href={c.href ?? link({ step: "4", path: c.name })} className={`card p-5 ${c.bg} hover:-translate-y-0.5 transition-transform ${sp.path === c.name ? "ring-2 ring-ink" : ""}`}>
                <div className="font-semibold">{c.title}</div>
                <p className="text-sm text-ink-2 mt-1">{c.body}</p>
                <div className="mt-3 text-sm font-semibold">Choose →</div>
              </Link>
            ))}
          </div>
          <div className="mt-4"><Link href={link({ step: "2", none: "" })} className="btn btn-ghost">← Back to matches</Link></div>
        </div>
      )}

      {step === 4 && (
        <form action={submitRequest} className="card p-5 mt-6 grid md:grid-cols-2 gap-4 max-w-3xl">
          <div className="md:col-span-2 flex items-center gap-2 text-sm"><span className="eyebrow">Path</span><Chip kind="neutral">{sp.path ?? "Unspecified"}</Chip><input type="hidden" name="path" value={sp.path ?? ""} /></div>
          <label className="md:col-span-2 text-sm font-medium">Title<input name="title" required defaultValue={q.slice(0, 80)} className="mt-1" /></label>
          <label className="md:col-span-2 text-sm font-medium">Description<textarea name="description" rows={3} defaultValue={chosenDataset ? `${q}\n\nUsing verified dataset: ${chosenDataset.name}` : q} className="mt-1" /></label>
          <label className="text-sm font-medium">Use case<select name="useCase" className="mt-1"><option value="">Choose…</option>{useCases.map((u) => <option key={u}>{u}</option>)}</select></label>
          <label className="text-sm font-medium">Related base<select name="relatedBase" defaultValue={sp.base ?? ""} className="mt-1"><option value="">None</option>{data.bases.filter((b) => me.isAdmin || me.scope.bases.has(b.id)).sort((a, b) => (a.name ?? "").localeCompare(b.name ?? "")).map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}</select></label>
          <label className="text-sm font-medium">Proposed timeline<input name="timeline" type="date" className="mt-1" /></label>
          <div className="md:col-span-2 text-xs text-muted">Submitted as {me.name} · org unit {me.orgUnit.value} · written to the Requests table with Record Source = Demo.</div>
          <div className="md:col-span-2 flex gap-2"><Link href={link({ step: "3" })} className="btn btn-ghost">← Back</Link><button className="btn btn-primary" type="submit">Submit request</button></div>
        </form>
      )}
    </div>
  );
}

function Section({ title, hint, count, children }: { title: string; hint: string; count: number; children: React.ReactNode }) {
  return (
    <section className="mt-6">
      <h3 className="font-semibold flex items-center gap-2">{title} <span className="mono text-xs text-muted">{count}</span></h3>
      <p className="text-xs text-muted mt-0.5">{hint}</p>
      <div className="mt-2">
        {count ? children : <div className="card p-4 text-sm text-muted">Nothing found.</div>}
      </div>
    </section>
  );
}
