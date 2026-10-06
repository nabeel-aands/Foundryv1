import type { ReactNode } from "react";
import { Chip } from "@/components/Chip";
import type { CatalogItem } from "@/lib/snapshot";

const arr = (v: string | string[] | undefined): string[] => (Array.isArray(v) ? v : v ? [v] : []);
const isUrl = (s?: string) => !!s && /^https?:\/\//i.test(s);
const statusKind = (s?: string) => (s === "Available" ? "real" : s === "Beta" ? "warn" : "neutral");

/** A Library item card. Pass `action` to replace the default "Open" button. */
export function CatalogCard({ c, action }: { c: CatalogItem; action?: ReactNode }) {
  return (
    <div className="card p-4 flex flex-col">
      <div className="flex flex-wrap items-center gap-2">
        <Chip kind="neutral">{c.type}</Chip>
        {c.status && <Chip kind={statusKind(c.status)}>{c.status}</Chip>}
        {c.featured && <span className="text-xs text-amber-deep" title="Featured">★</span>}
      </div>
      <div className="font-semibold mt-2">{c.name}</div>
      <p className="text-sm text-ink-2 mt-1 flex-1">{c.description}</p>
      <div className="text-xs text-muted mt-3 flex flex-wrap gap-x-3">
        {c.owner && <span>Owner · {c.owner}</span>}
        {arr(c.audience).length > 0 && <span>For · {arr(c.audience).join(", ")}</span>}
      </div>
      <div className="mt-3">
        {action ?? (isUrl(c.link)
          ? <a className="btn !text-xs" href={c.link} target="_blank" rel="noreferrer">Open ↗</a>
          : <button className="btn !text-xs" disabled title="No link has been added to this item in Airtable yet">Link coming soon</button>)}
      </div>
    </div>
  );
}
