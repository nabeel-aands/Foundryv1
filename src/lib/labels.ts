export type LabelKind = "real" | "seeded" | "demo" | "modelled";

export function labelForSource(recordSource?: string): LabelKind {
  const s = (recordSource ?? "").toLowerCase();
  if (s.includes("seed")) return "seeded";
  if (s.includes("demo")) return "demo";
  return "real";
}

export const LABEL_TEXT: Record<LabelKind, string> = {
  real: "Real",
  seeded: "Seeded",
  demo: "Demo",
  modelled: "Modelled",
};
