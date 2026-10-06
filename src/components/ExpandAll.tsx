"use client";

/** Opens or closes every <details data-group="…"> on the page. */
export function ExpandAll({ group }: { group: string }) {
  const set = (open: boolean) => document.querySelectorAll<HTMLDetailsElement>(`details[data-group="${group}"]`).forEach((d) => { d.open = open; });
  return (
    <div className="flex gap-2">
      <button type="button" className="pill !text-xs !py-1" onClick={() => set(true)}>Expand all</button>
      <button type="button" className="pill !text-xs !py-1" onClick={() => set(false)}>Collapse all</button>
    </div>
  );
}
