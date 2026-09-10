import type { LabelKind } from "@/lib/labels";
import { LABEL_TEXT } from "@/lib/labels";

export function Chip({ kind, children, title }: { kind: LabelKind | "warn" | "neutral" | "locked"; children?: React.ReactNode; title?: string }) {
  const text = children ?? (kind in LABEL_TEXT ? LABEL_TEXT[kind as LabelKind] : kind);
  return <span className={`chip chip-${kind}`} title={title}>{text}</span>;
}

export function SensitivityChip({ value }: { value?: string }) {
  if (!value) return <span className="chip chip-neutral" title="No sensitivity set in Airtable">Unclassified</span>;
  const v = value.toLowerCase();
  const kind = v.includes("restrict") ? "modelled" : v.includes("confid") ? "warn" : v.includes("internal") ? "neutral" : "real";
  return <span className={`chip chip-${kind}`}>{value}</span>;
}
