import { Chip } from "./Chip";
import type { LabelKind } from "@/lib/labels";

export function Tile({ label, value, sub, kind = "real", derived }: { label: string; value: React.ReactNode; sub?: React.ReactNode; kind?: LabelKind; derived?: string }) {
  return (
    <div className="card p-4 flex flex-col gap-1 min-w-0">
      <div className="flex items-start justify-between gap-2">
        <span className="eyebrow">{label}</span>
        <Chip kind={kind} />
      </div>
      <div className={`text-2xl font-semibold tnum ${kind === "modelled" ? "text-model" : ""}`}>{value}</div>
      {sub && <div className="text-xs text-muted leading-snug">{sub}</div>}
      {derived && <div className="text-[11px] text-muted mono leading-snug mt-1">derived from: {derived}</div>}
    </div>
  );
}
