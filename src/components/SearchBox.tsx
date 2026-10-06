"use client";
import { useEffect, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

/** A search input that applies as the user types (debounced) by updating ?q= and keeping every other param. */
export function SearchBox({ placeholder, label, param = "q", className = "" }: { placeholder: string; label: string; param?: string; className?: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const search = useSearchParams();
  const [value, setValue] = useState(search.get(param) ?? "");
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => () => clearTimeout(timer.current), []);

  const apply = (v: string) => {
    const p = new URLSearchParams(search.toString());
    p.delete("msg");
    if (v.trim()) p.set(param, v); else p.delete(param);
    const qs = p.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  };
  const change = (v: string) => {
    setValue(v);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => apply(v), 250);
  };

  return (
    <div className={`relative ${className}`} role="search">
      <input type="text" value={value} onChange={(e) => change(e.target.value)} placeholder={placeholder} aria-label={label} className="!pr-9" />
      {value && (
        <button type="button" aria-label="Clear search" onClick={() => { clearTimeout(timer.current); setValue(""); apply(""); }} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted hover:text-ink text-sm leading-none">✕</button>
      )}
    </div>
  );
}
