import { Chip } from "@/components/Chip";
import { foundryConfig } from "@/lib/config";

const components = [
  { type: "TABLE", name: "People lookup", body: "Linked to All People Data with org unit and cost center rollups." },
  { type: "AUTOMATION", name: "Weekly digest", body: "Monday summary of anything that changed status, sent to a Slack channel." },
  { type: "INTERFACE", name: "Approval queue", body: "Reviewer view with comment thread, decision log and SLA countdown." },
  { type: "TABLE", name: "RAG status field set", body: "Standard status, health and blocker fields so reporting rolls up cleanly." },
  { type: "AUTOMATION", name: "Intake router", body: "Routes a form submission to the right org unit queue and notifies the owner." },
  { type: "INTERFACE", name: "Exec rollup dashboard", body: "Read-only summary sized for a leadership review, filtered by portfolio." },
];
const path = [
  { t: "Finding and using what already exists", d: "18 min · free" },
  { t: "Building your first base in a sandbox", d: "45 min · free" },
  { t: "Automations without breaking things", d: "30 min · free" },
  { t: "Certified builder", d: "half day · paid" },
];

export default function Resources() {
  return (
    <div className="max-w-6xl">
      <div className="eyebrow">Resources</div>
      <h1 className="text-2xl md:text-3xl font-semibold tracking-tight mt-1">Don't start from a blank base</h1>
      <p className="text-sm text-ink-2 mt-1">Reusable components, the docs behind them, and the learning path from viewer to builder.</p>
      <div className="mt-2 flex items-center gap-2 text-xs text-muted"><Chip kind="seeded">Curated (seed)</Chip> Static content in v1. The component registry becomes an Airtable table in v2.</div>
      <div className="grid md:grid-cols-3 gap-4 mt-6">
        <div className="card p-5 !bg-sky"><div className="text-3xl font-semibold tnum">{components.length}</div><div className="font-semibold mt-1">Reusable components</div><p className="text-sm text-ink-2">Tables, automations and interfaces you can drop into your own base.</p></div>
        <div className="card p-5 !bg-lilac"><div className="text-3xl font-semibold tnum">12</div><div className="font-semibold mt-1">Documentation pages</div><p className="text-sm text-ink-2">Every component links to how it works and who maintains it.</p></div>
        <div className="card p-5 !bg-amber-soft"><div className="text-3xl font-semibold tnum">{path.length}</div><div className="font-semibold mt-1">Courses and live sessions</div><p className="text-sm text-ink-2">Free primers plus the full builder certification.</p></div>
      </div>
      <h2 className="font-semibold mt-8">Component library</h2>
      <div className="grid md:grid-cols-3 gap-3 mt-2">
        {components.map((c) => (
          <div key={c.name} className="card p-4">
            <div className="flex items-center gap-2"><Chip kind="neutral">{c.type}</Chip><span className="text-xs text-muted mono">usage: v2</span></div>
            <div className="font-semibold mt-2">{c.name}</div>
            <p className="text-sm text-ink-2 mt-1">{c.body}</p>
            <div className="mt-3 flex gap-2"><button className="btn !text-xs" disabled title="Arrives with the components table in v2">Add to base</button><button className="btn btn-ghost !text-xs" disabled>Docs</button></div>
          </div>
        ))}
      </div>
      <div className="grid lg:grid-cols-[minmax(0,1fr)_320px] gap-4 mt-8">
        <section className="card">
          <header className="px-4 py-3 border-b border-line font-semibold">Learning path · viewer to builder</header>
          <ol className="divide-y divide-line">{path.map((p, i) => <li key={p.t} className="px-4 py-3 flex items-center gap-3 text-sm"><span className="w-6 h-6 rounded-full grid place-items-center text-xs mono border border-line-2">{i + 1}</span><span className="flex-1">{p.t}</span><span className="text-xs text-muted">{p.d}</span></li>)}</ol>
        </section>
        <section className="card p-5 !bg-side !text-side-text">
          <div className="eyebrow !text-side-text/60">Build alongside us</div>
          <div className="font-semibold text-white mt-1">Stuck halfway through a build?</div>
          <p className="text-sm mt-1">Book a working session and {foundryConfig.requests.teamLabel} builds it with you rather than for you. You keep ownership.</p>
          <button className="btn btn-primary !mt-4" disabled title="Booking arrives in v2">Book a session</button>
        </section>
      </div>
    </div>
  );
}
