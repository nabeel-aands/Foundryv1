import Link from "next/link";
import { Chip } from "./Chip";
import type { LabelKind } from "@/lib/labels";

/** A summary card. With `href` it becomes a toggle: ↗ to open its detail, ✕ when open. */
export function Tile({ label, value, sub, kind = "real", derived, href, open }: { label: string; value: React.ReactNode; sub?: React.ReactNode; kind?: LabelKind; derived?: string; href?: string; open?: boolean }) {
  const body = (
    <>
      <div className="flex items-start justify-between gap-2">
        <span className="eyebrow">{label}</span>
        <span className="flex items-center gap-2">
          <Chip kind={kind} />
          {href && <span className="text-base leading-none font-semibold" aria-hidden>{open ? "✕" : "↗"}</span>}
        </span>
      </div>
      <div className={`text-2xl font-semibold tnum ${kind === "modelled" ? "text-model" : ""}`}>{value}</div>
      {sub && <div className="text-xs text-muted leading-snug">{sub}</div>}
      {derived && <div className="text-[11px] text-muted mono leading-snug mt-1">derived from: {derived}</div>}
      {href && <span className="sr-only">{open ? "Close details" : "Show details"}</span>}
    </>
  );
  const cls = "card p-4 flex flex-col gap-1 min-w-0";
  if (!href) return <div className={cls}>{body}</div>;
  return <Link href={href} aria-pressed={!!open} className={`${cls} hover:-translate-y-0.5 transition-transform ${open ? "ring-2 ring-ink" : ""}`}>{body}</Link>;
}
