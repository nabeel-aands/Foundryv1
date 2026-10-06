import Link from "next/link";
import { getData, type CatalogItem } from "@/lib/snapshot";
import { CatalogCard } from "@/components/CatalogCard";
import { DatasetCard } from "@/components/DatasetCard";
import { InfoTip } from "@/components/InfoTip";

type SP = { q?: string; tab?: string };

const arr = (v: string | string[] | undefined): string[] => (Array.isArray(v) ? v : v ? [v] : []);
const PLURAL: Record<string, string> = { "Managed App": "Apps", Component: "Components", Template: "Starter templates", "Integration Pattern": "Integration patterns" };
const plural = (t: string) => PLURAL[t] ?? `${t}s`;
const ORDER = ["Managed App", "Component", "Template", "Integration Pattern"];

export default async function Library({ searchParams }: { searchParams: Promise<SP> }) {
  const { q = "", tab = "all" } = await searchParams;
  const data = await getData();
  const needle = q.trim().toLowerCase();
  const types = [...new Set(data.catalogItems.map((c) => c.type).filter(Boolean))] as string[];
  types.sort((a, b) => (ORDER.indexOf(a) + 100) % 100 - (ORDER.indexOf(b) + 100) % 100 || a.localeCompare(b));

  const hit = (c: CatalogItem) => !needle || `${c.name} ${c.description ?? ""} ${c.owner ?? ""} ${arr(c.audience).join(" ")} ${c.type ?? ""}`.toLowerCase().includes(needle);
  const items = data.catalogItems.filter(hit);
  const datasets = data.datasets.filter((d) => !needle || `${d.name} ${d.description ?? ""} ${d.orgUnit ?? ""}`.toLowerCase().includes(needle));

  const tabs = [
    { key: "all", label: "All", n: items.length + datasets.length },
    ...types.map((t) => ({ key: t, label: plural(t), n: items.filter((c) => c.type === t).length })),
    { key: "datasets", label: "Verified datasets", n: datasets.length },
  ];
  const active = tabs.some((t) => t.key === tab) ? tab : "all";
  const href = (t: string) => `/library?${new URLSearchParams({ ...(q ? { q } : {}), ...(t !== "all" ? { tab: t } : {}) }).toString()}`;

  const shownItems = active === "all" ? items : active === "datasets" ? [] : items.filter((c) => c.type === active);
  const featured = active === "all" && !needle ? shownItems.filter((c) => c.featured) : [];
  const rest = shownItems.filter((c) => !featured.includes(c));
  const showDatasets = active === "all" || active === "datasets";

  return (
    <div className="max-w-6xl">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="eyebrow">Airtable Library</div>
          <h1 className="text-2xl md:text-3xl font-semibold tracking-tight mt-1">Reusable pieces, ready to use</h1>
          <p className="text-sm text-ink-2 mt-1">Apps, components, templates and verified datasets. Start here before you build from a blank base.</p>
        </div>
        <form className="flex gap-2 w-full md:w-96" method="get">
          <input name="q" defaultValue={q} placeholder="Search the library" aria-label="Search the library" />
          {active !== "all" && <input type="hidden" name="tab" value={active} />}
          <button className="btn" type="submit">Search</button>
        </form>
      </div>

      <nav className="mt-5 flex flex-wrap gap-2 text-sm" aria-label="Library sections">
        {tabs.map((t) => (
          <Link key={t.key} href={href(t.key)} className={`px-3 py-1.5 rounded-full border ${active === t.key ? "bg-ink text-white border-ink" : "border-line-2 bg-card hover:bg-card-2"}`}>
            {t.label} <span className="mono text-xs opacity-70">{t.n}</span>
          </Link>
        ))}
      </nav>

      {featured.length > 0 && (
        <section className="mt-6">
          <h2 className="font-semibold">Featured</h2>
          <div className="grid md:grid-cols-3 gap-3 mt-2">{featured.map((c) => <CatalogCard key={c.id} c={c} />)}</div>
        </section>
      )}

      {rest.length > 0 && (
        <section className="mt-6">
          {(featured.length > 0 || active === "all") && <h2 className="font-semibold">{featured.length ? "Everything else" : "Apps, components and templates"}</h2>}
          <div className="grid md:grid-cols-3 gap-3 mt-2">{rest.map((c) => <CatalogCard key={c.id} c={c} />)}</div>
        </section>
      )}

      {showDatasets && datasets.length > 0 && (
        <section id="datasets" className="mt-8">
          <h2 className="font-semibold flex items-center gap-2">Verified datasets
            <InfoTip title="WHAT IS A VERIFIED DATASET?">
              A single source table that a named steward maintains. Link it instead of copying it, and your app stays current when the source changes.
            </InfoTip>
          </h2>
          <div className="grid md:grid-cols-3 gap-3 mt-2">
            {datasets.map((d) => <DatasetCard key={d.id} d={d} />)}
          </div>
        </section>
      )}

      {!shownItems.length && !(showDatasets && datasets.length) && (
        <div className="card p-6 mt-6 text-sm text-muted">{data.catalogItems.length || data.datasets.length ? `Nothing in the library matches “${q}”.` : "The Catalog Items table has no rows yet."}</div>
      )}
    </div>
  );
}
