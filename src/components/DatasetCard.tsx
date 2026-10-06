import type { ReactNode } from "react";
import { Chip } from "@/components/Chip";
import { stewardName, type VerifiedDataset } from "@/lib/snapshot";

/** A verified dataset card. Pass `action` for a button row under the details. */
export function DatasetCard({ d, action }: { d: VerifiedDataset; action?: ReactNode }) {
  return (
    <div className="card p-4 flex flex-col">
      <div className="flex items-center gap-2">
        {d.verified && <Chip kind="real">Verified</Chip>}
        {d.status && <Chip kind="neutral">{d.status}</Chip>}
      </div>
      <div className="font-semibold mt-2">{d.name}</div>
      <p className="text-sm text-ink-2 mt-1 flex-1 line-clamp-3">{d.description}</p>
      <div className="text-xs text-muted mt-3 flex flex-wrap items-center gap-x-3">
        <span className="flex items-center gap-1.5"><span className={`w-2 h-2 rounded-full ${stewardName(d) ? "bg-real" : "bg-line-2"}`} />{stewardName(d) ?? "unowned"}</span>
        {d.orgUnit && <span>{d.orgUnit}</span>}
        <span>{(d.basesUsing ?? []).length} bases use it</span>
      </div>
      {action && <div className="mt-3">{action}</div>}
    </div>
  );
}
