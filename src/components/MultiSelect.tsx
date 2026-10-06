"use client";
import { useEffect, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

/**
 * A multi-choice filter dropdown that keeps its selection in the URL (?param=A&param=B),
 * so the server page filters on it and the link can be shared. Applies on every change.
 */
export function MultiSelect({ param, allLabel, options, selected }: { param: string; allLabel: string; options: string[]; selected: string[] }) {
  const router = useRouter();
  const pathname = usePathname();
  const search = useSearchParams();
  const [open, setOpen] = useState(false);
  const [chosen, setChosen] = useState<string[]>(selected);
  const root = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const away = (e: MouseEvent) => { if (!root.current?.contains(e.target as Node)) setOpen(false); };
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", away);
    document.addEventListener("keydown", esc);
    return () => { document.removeEventListener("mousedown", away); document.removeEventListener("keydown", esc); };
  }, [open]);

  const apply = (next: string[]) => {
    setChosen(next);
    const p = new URLSearchParams(search.toString());
    p.delete(param);
    p.delete("msg");
    for (const v of next) p.append(param, v);
    const qs = p.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  };
  const toggle = (o: string) => apply(chosen.includes(o) ? chosen.filter((c) => c !== o) : [...chosen, o]);

  const text = chosen.length === 0 ? allLabel : chosen.length === 1 ? chosen[0] : `${chosen[0]} +${chosen.length - 1}`;

  return (
    <div ref={root} className="relative">
      <button type="button" className="btn !py-1.5 !font-normal" aria-haspopup="listbox" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
        <span>{text}</span>
        <span aria-hidden className="text-[10px]">▾</span>
      </button>
      {open && (
        <div role="listbox" aria-multiselectable="true" aria-label={allLabel} className="absolute z-30 left-0 top-full mt-1.5 min-w-full w-max max-w-xs card p-1.5 shadow-lg">
          {options.map((o) => {
            const on = chosen.includes(o);
            return (
              <button key={o} type="button" role="option" aria-selected={on} onClick={() => toggle(o)} className="w-full flex items-center gap-2.5 px-2.5 py-1.5 rounded-[var(--radius-control)] text-left text-sm hover:bg-card-2">
                <span aria-hidden className={`w-4 h-4 grid place-items-center rounded-[4px] border border-ink text-[11px] leading-none ${on ? "bg-amber" : "bg-card"}`}>{on ? "✓" : ""}</span>
                {o}
              </button>
            );
          })}
          {chosen.length > 0 && (
            <button type="button" onClick={() => apply([])} className="w-full mt-1 pt-1.5 border-t border-line px-2.5 py-1.5 text-left text-xs text-muted hover:text-ink">Clear selection</button>
          )}
        </div>
      )}
    </div>
  );
}
